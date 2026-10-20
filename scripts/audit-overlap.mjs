/**
 * 全库词条两两重叠度审计。
 *
 * ## 为什么做
 *
 * 2026-10-20 发现 `lab-report-basics`（怎么看懂化验单）与
 * `reading-test-results`（体检报告上的箭头要紧吗）**骨架几乎相同**：
 * 两条的「具体做法」小节一一对应，适用人群一字不差，
 * 4-gram 覆盖率 59%。这是「同一个主题写了两遍」。
 *
 * 对站点的伤害是双重的：
 *   · **SEO**：两个页面争同一批搜索词，互相稀释（与 /browse/ 抢词条位置同类）
 *   · **读者**：不知道该读哪一篇，而且会怀疑内容是不是重复堆出来的
 *
 * ## 判据
 *
 * 4-gram 覆盖率（较短一条被较长一条覆盖的比例）：
 *   < 25%  → 正常（同一领域的不同主题也会有少量共享短语）
 *   25–45% → 需要看一眼，可能只是题材相邻
 *   ≥ 45%  → **同一主题写了两遍**，应当合并或明确分工
 *
 * 用「覆盖率」而不是 Jaccard：两条长度差很大时，Jaccard 会被长的那条稀释，
 * 而覆盖率能直接回答「短的那条有多少是重复的」。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dir = 'C:/Users/17878/Documents/deepseek-harness/default-workspace/health-guide/src/content/entries';
const THRESHOLD = 0.25;

function bodyOf(text) {
  const i = text.indexOf('\n---', 4);
  const body = i === -1 ? text : text.slice(i);
  return body
    .replace(/<[^>]+>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[^\u4e00-\u9fa5]/g, '');
}

function grams(s, n = 4) {
  const set = new Set();
  for (let i = 0; i + n <= s.length; i++) set.add(s.slice(i, i + n));
  return set;
}

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const entries = [];
for (const f of files) {
  const slug = f.replace(/\.md$/, '');
  const text = await readFile(path.join(dir, f), 'utf8');
  const title = text.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, '') ?? '';
  const body = bodyOf(text);
  entries.push({ slug, title, len: body.length, g: grams(body) });
}

console.log(`\n=== 词条两两重叠度审计 ===\n`);
console.log(`  ${entries.length} 条词条，比较 ${(entries.length * (entries.length - 1)) / 2} 对\n`);

const pairs = [];
for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i];
    const b = entries[j];
    const [short, long] = a.g.size <= b.g.size ? [a, b] : [b, a];
    let inter = 0;
    for (const g of short.g) if (long.g.has(g)) inter += 1;
    const cover = inter / short.g.size;
    if (cover >= THRESHOLD) {
      pairs.push({ a, b, cover });
    }
  }
}

pairs.sort((x, y) => y.cover - x.cover);

if (pairs.length === 0) {
  console.log(`  ✓ 没有重叠度 ≥ ${THRESHOLD * 100}% 的词条对\n`);
} else {
  console.log(`  重叠度 ≥ ${THRESHOLD * 100}% 的配对：${pairs.length} 组\n`);
  for (const p of pairs) {
    const tag = p.cover >= 0.45 ? '⚠️ 应处理' : '· 需看一眼';
    console.log(`  ${tag}  覆盖率 ${(p.cover * 100).toFixed(0)}%`);
    console.log(`     ${p.a.slug}  「${p.a.title}」`);
    console.log(`     ${p.b.slug}  「${p.b.title}」`);
    console.log('');
  }
}

/* 分级统计 */
const high = pairs.filter((p) => p.cover >= 0.45);
const mid = pairs.filter((p) => p.cover >= THRESHOLD && p.cover < 0.45);
console.log(`\n=== 结论 ===`);
console.log(`  ≥45%（同一主题写两遍，应处理）：${high.length} 组`);
console.log(`  25–45%（题材相邻，需判断）：${mid.length} 组`);
