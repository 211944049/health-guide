/**
 * 生成「离线阅读版」单文件 HTML：把站点里所有词条拼成一个自包含的 HTML。
 *
 * 为什么要它：预览服务器要占端口、依赖 localhost 解析、还可能被浏览器代理拦截；
 * 直接把词条正文和样式打成一个文件，双击就能看，不依赖任何服务或网络。
 * 也方便把稿子发给别人审阅。
 *
 * 用法（先构建）：node scripts/make-offline-reader.mjs [输出文件]
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const outFile = path.resolve(process.argv[2] ?? '离线阅读版-全部词条.html');

// 1) 样式内联，保证单文件自包含
const assetsDir = path.join(distDir, '_astro');
const cssFiles = (await readdir(assetsDir).catch(() => [])).filter((name) => name.endsWith('.css'));
const css = (await Promise.all(cssFiles.map((name) => readFile(path.join(assetsDir, name), 'utf8')))).join('\n');

// 2) 词条顺序：从 browse 页取，那里是按「最后更新」倒序排的
const browse = await readFile(path.join(distDir, 'browse', 'index.html'), 'utf8');
const order = [...browse.matchAll(/href="\/entry\/([^/"]+)\/"/g)].map((m) => m[1]);
const slugs = [...new Set(order)];
if (slugs.length === 0) {
  console.error('✗ 没能从 dist/browse/index.html 里读到词条列表，先跑一次构建。');
  process.exit(1);
}

const sections = [];
const toc = [];

for (const slug of slugs) {
  const html = await readFile(path.join(distDir, 'entry', slug, 'index.html'), 'utf8');
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!main) {
    console.warn(`  跳过 ${slug}：没找到 <main>`);
    continue;
  }
  let body = main[1];

  // 页内跳转（本文目录）保留；词条之间的链接改成同一文件内的锚点
  body = body.replace(/href="\/entry\/([^/"]+)\/"/g, 'href="#entry-$1"');
  // 其余站内链接（首页、分类、搜索）在离线文件里点不动，拆成纯文字，避免点了报错
  body = body.replace(/<a\b[^>]*href="\/(?!#)[^"]*"[^>]*>([\s\S]*?)<\/a>/g, '$1');

  const title = (body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) ?? [, slug])[1].replace(/<[^>]+>/g, '').trim();
  toc.push({ slug, title });
  sections.push(`<section class="offline-entry" id="entry-${slug}">${body}</section>`);
}

const nav = toc
  .map((item, index) => `      <li><a href="#entry-${item.slug}">${index + 1}. ${item.title}</a></li>`)
  .join('\n');

const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>高性价比健康指南 · 离线阅读版（${toc.length} 条词条）</title>
<style>
${css}
.offline-banner {
  background: var(--warn-soft, #fbf0e0);
  border-bottom: 1px solid var(--line, #e3dfd7);
  padding: 0.75rem 1rem;
  font-size: 0.88rem;
  color: var(--warn, #a3601a);
}
.offline-entry {
  border-top: 3px solid var(--line, #e3dfd7);
  margin-top: 3rem;
  padding-top: 1.5rem;
  max-width: 760px;
}
.offline-entry:first-of-type { border-top: none; margin-top: 1rem; }
.offline-toc { max-width: 760px; }
.offline-toc ol { padding-left: 1.4em; }
</style>
</head>
<body>
<div class="offline-banner">
  离线阅读版 · 共 ${toc.length} 条词条 · 生成于 ${new Date().toISOString().slice(0, 10)}<br>
  这是站点内容的静态副本，用于审阅和存档。正文里的站内链接已改为本文锚点或纯文字，不会跳出。
</div>
<main class="wrap" style="padding-top:1rem">
  <h1>高性价比健康指南 · 全部词条</h1>
  <p class="muted">定位：不做在线诊所，做生活决策助手。每条词条都标注证据等级、成本、耗时与适用人群。</p>
  <nav class="offline-toc">
    <ol>
${nav}
    </ol>
  </nav>
${sections.join('\n')}
</main>
</body>
</html>
`;

await writeFile(outFile, doc, 'utf8');
const size = (await readFile(outFile)).length;
console.log(`✓ ${path.relative(process.cwd(), outFile)}`);
console.log(`  ${toc.length} 条词条，${(size / 1024).toFixed(1)} KB`);
for (const item of toc) console.log(`    · ${item.title}`);
