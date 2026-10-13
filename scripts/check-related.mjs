/**
 * 相关词条（related）字段体检。
 *
 * 为什么单独查：`related` 里的 slug 写错时**构建不会报错**，页面只是少一张推荐卡片——
 * 和行内互链（`check-links.mjs`）是同一类静默失败。
 * 这个脚本在构建时拦住：
 *   1. slug 是否存在
 *   2. 是否指向自己
 *   3. 是否重复
 *   4. 双向对称（A 推荐 B，B 也应推荐 A）——不对称会让内链变成单向的死路
 *   5. 覆盖度（每个词条都该有相关词条）
 *
 * 用法：node scripts/check-related.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const slugs = new Set(files.map((f) => f.replace(/\.md$/, '')));

/** 从 frontmatter 里取 related 列表。 */
function relatedOf(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const lines = fm[1].split(/\r?\n/);
  const start = lines.findIndex((l) => /^related:/.test(l));
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s+-\s+/.test(line)) {
      items.push(line.replace(/^\s+-\s+/, '').trim());
      continue;
    }
    if (/^\S/.test(line)) break;
  }
  return items;
}

const graph = Object.create(null);
const problems = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const items = relatedOf(await readFile(path.join(dir, file), 'utf8'));
  if (items === null) {
    problems.push(`${file}: 没有合法的 frontmatter`);
    continue;
  }
  graph[slug] = items;

  if (items.length === 0) problems.push(`${file}: 没有相关词条（related 为空）`);
  if (new Set(items).size !== items.length) problems.push(`${file}: 相关词条有重复`);
  if (items.includes(slug)) problems.push(`${file}: 把自己列为相关词条`);

  for (const item of items) {
    if (!slugs.has(item)) problems.push(`${file}: 相关词条不存在 —— ${item}`);
  }
}

// 双向对称
let pairs = 0;
for (const [slug, items] of Object.entries(graph)) {
  for (const item of items) {
    if (!slugs.has(item)) continue;
    pairs += 1;
    if (!(graph[item] ?? []).includes(slug)) {
      problems.push(`关联不对称：${slug} → ${item}，但 ${item} 没有指回 ${slug}`);
    }
  }
}

const avg = pairs / files.length;
console.log(`\n相关词条体检：${files.length} 条词条，${pairs} 对关系，平均 ${avg.toFixed(1)} 个/词条`);

// 顺带统计：加了 related 之后，还有多少词条正文里一条出链都没有
let noInline = 0;
for (const file of files) {
  const text = await readFile(path.join(dir, file), 'utf8');
  const body = text.split(/^---\s*$/m).slice(2).join('---');
  if (!/\]\(\/entry\//.test(body)) noInline += 1;
}
console.log(`  正文里没有任何行内互链的词条：${noInline} 条（related 已保证它们仍有出口）`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 25)) console.error(`  ✗ ${p}`);
  if (problems.length > 25) console.error(`  … 另有 ${problems.length - 25} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 相关词条字段全部合法且双向对称。\n');
