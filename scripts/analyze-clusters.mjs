/**
 * 专题簇分析：找出「跨分类、天然成组」的词条集合，作为专题页选题依据。
 *
 * 为什么需要程序找：专题页不是把分类重新抄一遍（那是 /browse/ 的职责），
 * 而是按**读者处境**把散在不同分类里的词条组织起来。
 * 「哪些词条经常被互相推荐」是最客观的成组信号——related 关系图本身就是人工
 * 维护的「相关性」判断，用它做社群检测，比拍脑袋定专题可靠。
 *
 * 做法：把 related 关系当成无向图，跑 Girvan-Newman 风格的边介数聚类太重，
 * 这里用一个更直接的方法：**按种子词做广度扩张**，看从某个词条出发
 * 两跳能覆盖多少跨分类的邻居，再人工判断这个簇能不能成为一个专题。
 *
 * 用法：node scripts/analyze-clusters.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const entries = new Map();

for (const f of files) {
  const text = await readFile(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const scalar = (k) => (fm.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm')) ?? [, ''])[1].trim();
  const list = (k) => {
    const lines = fm.split(/\r?\n/);
    const start = lines.findIndex((l) => new RegExp(`^${k}:`).test(l));
    if (start === -1) return [];
    const items = [];
    for (const line of lines.slice(start + 1)) {
      if (/^\s+-\s+/.test(line)) { items.push(line.replace(/^\s+-\s+/, '').trim()); continue; }
      if (/^\S/.test(line)) break;
    }
    return items;
  };
  const slug = f.replace(/\.md$/, '');
  entries.set(slug, {
    slug,
    title: scalar('title'),
    category: scalar('category'),
    evidence: scalar('evidence'),
    summary: scalar('summary'),
    audience: list('audience'),
    related: list('related'),
  });
}

/* ---------- 1. 找出「跨分类连接度」最高的词条（潜在的专题核心） ---------- */

console.log(`\n专题簇分析：${entries.size} 条词条\n`);

const scored = [...entries.values()].map((e) => {
  const cats = new Set(e.related.map((s) => entries.get(s)?.category).filter(Boolean));
  return { ...e, crossCats: cats.size, catList: [...cats].join('/') };
}).sort((a, b) => b.crossCats - a.crossCats || b.related.length - a.related.length);

console.log('跨分类连接度最高的 12 条（这些是天然的「枢纽」）：');
for (const e of scored.slice(0, 12)) {
  console.log(`  ${String(e.crossCats)} 类 · ${e.title}（${e.category}）→ ${e.catList}`);
}

/* ---------- 2. 受众词频：看哪些「处境」被反复提到 ---------- */

console.log('\n受众词频（出现 ≥3 次的受众，是专题的候选题材）：');
const audienceCount = new Map();
for (const e of entries.values()) {
  for (const a of e.audience) {
    if (a.length > 12) continue; // 过滤掉误抓的来源名
    audienceCount.set(a, (audienceCount.get(a) ?? 0) + 1);
  }
}
for (const [a, n] of [...audienceCount.entries()].filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${String(n).padStart(2)} 次 · ${a}`);
}

/* ---------- 3. 从枢纽词条做两跳扩张，看能凑出多大的跨分类簇 ---------- */

console.log('\n从枢纽词条两跳扩张的覆盖情况（判断专题能否撑起 6–10 条）：');

for (const seed of scored.slice(0, 8)) {
  const oneHop = new Set(seed.related);
  const twoHop = new Set(oneHop);
  for (const s of oneHop) {
    for (const r of entries.get(s)?.related ?? []) twoHop.add(r);
  }
  twoHop.delete(seed.slug);

  const cats = new Map();
  for (const s of twoHop) {
    const c = entries.get(s)?.category;
    if (c) cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const catStr = [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}${n}`).join(' ');
  console.log(`  【${seed.title}】两跳覆盖 ${twoHop.size} 条，分布：${catStr}`);
}

console.log('');
