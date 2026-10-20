/**
 * 跨词条数值一致性审计。
 *
 * ## 为什么需要它（防晒用量那个矛盾的教训）
 *
 * 2026-10-20 发现：`sunscreen-use` 与 `sunscreen-choice` 都有一张「各部位用量」表，
 * 但**手臂/小腿的数值差 2–3 倍**。32 道闸门全绿没拦住。
 *
 * 根因：`check-facts.mjs` 原先是「单行取数 + `nums.some()`」——
 * 只要行里有一个数落在区间就通过。它验的是「这一行有没有正确的值」，
 * **不负责「两条词条说的同一件事对不对得上」**。
 *
 * 现在 `check-facts` 补了「表格一致性」，但那只覆盖显式登记的表。
 * **这个脚本是另一层保险**：扫描全库所有「数值 + 单位」，
 * 找出**上下文高度相似但数值不同**的配对，交给人判断。
 *
 * ## 判据（刻意保守）
 *
 * 只有同时满足这三点才报：
 *   1. 单位相同（℃ / ml / g / 分钟 / 小时 / % / 次 / 天）
 *   2. 句子相似度 ≥ 0.45（共享足够多的 3-gram）
 *   3. 数值不同
 *
 * 宁可漏报也不刷屏——一条要人工看三分钟的假警报，会让人不再看这个报告。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dir = 'C:/Users/17878/Documents/deepseek-harness/default-workspace/health-guide/src/content/entries';

/** 要扫的单位 → 提取用正则（数值 + 单位）。 */
const UNITS = [
  { unit: '℃', re: /(\d+(?:\.\d+)?)\s*[–~-]?\s*(\d+(?:\.\d+)?)?\s*℃/g },
  { unit: 'ml', re: /(\d+(?:\.\d+)?)\s*(?:ml|毫升)/gi },
  { unit: 'g', re: /(\d+(?:\.\d+)?)\s*(?:g|克)\b/g },
  { unit: '分钟', re: /(\d+(?:\.\d+)?)\s*分钟/g },
  { unit: '小时', re: /(\d+(?:\.\d+)?)\s*(?:小时|个小时)/g },
  { unit: '%', re: /(\d+(?:\.\d+)?)\s*[–~-]?\s*(\d+(?:\.\d+)?)?\s*%/g },
  { unit: '次', re: /(\d+(?:\.\d+)?)\s*次/g },
  { unit: '天', re: /(\d+(?:\.\d+)?)\s*天/g },
];

/** 把句子归一化成 3-gram 集合（去掉标点和数字，只留汉字与字母）。 */
function grams(text) {
  const clean = text.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
  const out = new Set();
  for (let i = 0; i + 3 <= clean.length; i++) out.add(clean.slice(i, i + 3));
  return out;
}

/** Jaccard 相似度。 */
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter += 1;
  return inter / (a.size + b.size - inter);
}

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));

/** 收集所有「数值 + 单位 + 所在句」。 */
const claims = [];
for (const f of files) {
  const slug = f.replace(/\.md$/, '');
  const text = await readFile(path.join(dir, f), 'utf8');
  // 跳过 frontmatter
  const bodyStart = text.indexOf('\n---', 4);
  const body = bodyStart === -1 ? text : text.slice(bodyStart);

  const lines = body.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const plain = line.replace(/<[^>]+>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    if (!plain.trim()) return;
    for (const { unit, re } of UNITS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(plain)) !== null) {
        const value = m[2] ? `${m[1]}-${m[2]}` : m[1];
        claims.push({
          slug,
          unit,
          value,
          lineNo: idx + 1,
          sentence: plain.trim().slice(0, 200),
          g: grams(plain),
        });
      }
    }
  });
}

console.log(`\n=== 跨词条数值一致性审计 ===\n`);
console.log(`  扫描 ${files.length} 条词条，提取 ${claims.length} 处「数值 + 单位」\n`);

/* 按单位分组，找「上下文相似但数值不同」的配对 */
const byUnit = new Map();
for (const c of claims) {
  if (!byUnit.has(c.unit)) byUnit.set(c.unit, []);
  byUnit.get(c.unit).push(c);
}

const SIM_THRESHOLD = 0.45;
let reported = 0;
const seenPairs = new Set();

for (const [unit, list] of byUnit) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.slug === b.slug) continue;      // 同一词条内部不算跨词条
      if (a.value === b.value) continue;     // 数值相同就不用看
      // 数值相近（差 <10%）也不算，可能是四舍五入
      const na = parseFloat(a.value.split('-')[0]);
      const nb = parseFloat(b.value.split('-')[0]);
      if (Math.abs(na - nb) / Math.max(na, nb, 1) < 0.1) continue;

      const sim = similarity(a.g, b.g);
      if (sim < SIM_THRESHOLD) continue;

      const key = [a.slug, a.lineNo, b.slug, b.lineNo].sort().join('|');
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);

      reported += 1;
      if (reported <= 25) {
        console.log(`  ⚠️ [${unit}] 相似度 ${sim.toFixed(2)}`);
        console.log(`     ${a.slug}:${a.lineNo}  →  ${a.value} ${unit}`);
        console.log(`        ${a.sentence.slice(0, 110)}`);
        console.log(`     ${b.slug}:${b.lineNo}  →  ${b.value} ${unit}`);
        console.log(`        ${b.sentence.slice(0, 110)}`);
        console.log('');
      }
    }
  }
}

console.log(`\n  疑似不一致配对：${reported} 组`);
if (reported === 0) {
  console.log('  ✓ 没有发现「上下文相似但数值不同」的配对');
} else {
  console.log('  ⚠️ 这些需要人工判断：可能是真矛盾，也可能是「不同对象的不同数值」');
}
