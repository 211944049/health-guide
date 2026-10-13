/**
 * 首页「从这里开始」入口路径体检。
 *
 * 为什么需要：路径里写的是 slug，写错时**构建不报错**，首页只是少一条链接——
 * 和行内互链、related 是同一类静默失败。
 *
 * 检查项：
 *   1. slug 都存在
 *   2. 同一条路径里不重复
 *   3. 路径条目数不少于 3（少于 3 条算不上「一组」）
 *   4. 覆盖度：统计有多少词条没被任何路径收录（**只提示，不判失败**，
 *      50 条全塞进 6 条路径既不现实也会让首页变长）
 *
 * 用法：node scripts/check-start-paths.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');
const configPath = path.join(root, 'src', 'site.config.ts');

const slugs = new Set((await readdir(entriesDir)).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));

/*
  从 site.config.ts 里解析 START_PATHS。
  不 import 它是因为它是 .ts（Node 直接 import 需要额外转换）；
  这里只需要 title 和各路径的 entries 列表，用正则足够，且改错格式会立刻被发现。
*/
const src = await readFile(configPath, 'utf8');
const block = src.match(/export const START_PATHS[\s\S]*?\n\];/);
if (!block) {
  console.error('\n✗ 在 src/site.config.ts 里找不到 START_PATHS\n');
  process.exit(1);
}

const text = block[0];
const paths = [];
// 每个路径对象：{ emoji, title, desc, entries: [...] }
const pathRe = /title:\s*'([^']+)'[\s\S]*?entries:\s*\[([^\]]*)\]/g;
for (const m of text.matchAll(pathRe)) {
  const title = m[1];
  const items = [...m[2].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
  paths.push({ title, items });
}

const problems = [];

if (paths.length === 0) problems.push('没有解析出任何入口路径（检查 site.config.ts 的格式）');

const covered = new Set();
console.log(`\n首页入口路径体检：${paths.length} 条路径`);

for (const p of paths) {
  console.log(`  · ${p.title}（${p.items.length} 条）`);
  if (p.items.length < 3) problems.push(`「${p.title}」只有 ${p.items.length} 条，少于 3 条算不上「一组」`);
  if (new Set(p.items).size !== p.items.length) problems.push(`「${p.title}」里有重复的 slug`);
  for (const slug of p.items) {
    if (!slugs.has(slug)) problems.push(`「${p.title}」指向不存在的词条：${slug}`);
    covered.add(slug);
  }
}

const uncovered = [...slugs].filter((s) => !covered.has(s));
console.log(`  路径覆盖 ${covered.size}/${slugs.size} 条词条；未收录 ${uncovered.length} 条（正常，首页不必塞满）`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 入口路径的 slug 全部合法。\n');
