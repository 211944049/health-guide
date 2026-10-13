/**
 * RSS feed 体检。
 *
 * 为什么需要：feed 格式错误是**静默失败**——构建不报错、页面正常，但订阅器打不开。
 * XML 里一个未转义的 `&`、日期格式不对、guid 重复，都足以让整个 feed 失效，
 * 而你在浏览器里直接看 rss.xml 往往看不出问题（浏览器会宽容地渲染坏 XML）。
 *
 * 检查项：
 *   1. 基本结构完整（rss/channel/title/link/description/atom:link）
 *   2. item 数 == 词条数，且 guid 唯一（重复会让阅读器去重丢条目）
 *   3. 日期是 RFC 822（RSS 要求），能被 Date 解析
 *   4. 没有未转义的裸 `&`（最常见的致命错误）
 *   5. 没有残留的 Markdown 标记（`**粗体**` 之类会原样显示成星号）
 *   6. 链接都是绝对地址、且对应真实存在的词条页
 *
 * 用法：node scripts/check-rss.mjs
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const feedPath = path.join(distDir, 'rss.xml');

const problems = [];

const info = await stat(feedPath).catch(() => null);
if (!info) {
  console.error('\n✗ 没有找到 dist/rss.xml —— feed 没有产出\n');
  process.exit(1);
}

const xml = await readFile(feedPath, 'utf8');
console.log(`\nRSS 体检：${(info.size / 1024).toFixed(1)} KB`);

/* 1. 基本结构 */
for (const tag of ['<rss', '<channel>', '<title>', '<link>', '<description>', '<atom:link', '</channel>', '</rss>']) {
  if (!xml.includes(tag)) problems.push(`缺少 ${tag}`);
}

/* 2. item 数与 guid 唯一性 */
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const entryDirs = (await readdir(path.join(distDir, 'entry'), { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

console.log(`  item 数 ${items.length}，词条页 ${entryDirs.length}`);
if (items.length !== entryDirs.length) {
  problems.push(`item 数 ${items.length} 与词条页数 ${entryDirs.length} 不一致`);
}

const guids = items.map((i) => i.match(/<guid[^>]*>([^<]*)<\/guid>/)?.[1]).filter(Boolean);
const dupes = guids.filter((g, i) => guids.indexOf(g) !== i);
if (dupes.length) problems.push(`guid 重复（阅读器会去重丢条目）：${[...new Set(dupes)].slice(0, 3).join(', ')}`);

/* 3. 日期格式（RSS 要求 RFC 822） */
const RFC822 = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const badDates = [];
for (const item of items) {
  const d = item.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1];
  if (!d) badDates.push('(缺失)');
  else if (!RFC822.test(d) || Number.isNaN(new Date(d).getTime())) badDates.push(d);
}
if (badDates.length) problems.push(`${badDates.length} 条 pubDate 不是合法 RFC 822：${badDates.slice(0, 2).join(' / ')}`);

const build = xml.match(/<lastBuildDate>([^<]*)<\/lastBuildDate>/)?.[1];
if (!build || !RFC822.test(build)) problems.push(`lastBuildDate 不合法：${build}`);

/* 4. 未转义的裸 & —— 最常见的致命错误 */
// 合法的实体：&amp; &lt; &gt; &quot; &apos; &#NN; &#xNN;
const bareAmp = [...xml.matchAll(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g)];
if (bareAmp.length) problems.push(`发现 ${bareAmp.length} 处未转义的裸 &（会让 XML 解析失败）`);

/* 5. 残留 Markdown 标记 */
const mdLeaks = [];
for (const item of items) {
  const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '';
  const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
  if (/\*\*|\[[^\]]+\]\(|`/.test(desc)) mdLeaks.push(title);
}
if (mdLeaks.length) problems.push(`${mdLeaks.length} 条摘要残留 Markdown 标记：${mdLeaks.slice(0, 3).join(' / ')}`);

/* 6. 链接必须是绝对地址、且指向真实词条页 */
const links = items.map((i) => i.match(/<link>([^<]*)<\/link>/)?.[1]).filter(Boolean);
const badLinks = links.filter((l) => !/^https?:\/\//.test(l));
if (badLinks.length) problems.push(`${badLinks.length} 条 link 不是绝对地址`);

const missingTargets = [];
for (const l of links) {
  const slug = l.match(/\/entry\/([a-z0-9-]+)\/$/)?.[1];
  if (!slug) { missingTargets.push(l); continue; }
  if (!entryDirs.includes(slug)) missingTargets.push(l);
}
if (missingTargets.length) problems.push(`${missingTargets.length} 条 link 指向不存在的词条：${missingTargets.slice(0, 3).join(', ')}`);

/* 自检：主页也应该有 <link rel="alternate"> 指向 feed */
const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
if (!/rel="alternate"[^>]*application\/rss\+xml/.test(home)) {
  problems.push('index.html 里没有指向 rss.xml 的 <link rel="alternate">（阅读器无法自动发现）');
}

if (items.length) {
  const first = items[0];
  console.log(`  首条：${first.match(/<title>([^<]*)<\/title>/)?.[1]}`);
  console.log(`  日期：${first.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1]}`);
  console.log(`  摘要：${(first.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '').slice(0, 60)}…`);
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ RSS feed 结构与内容都正常。\n');
