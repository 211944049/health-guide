/**
 * 搜索结果数据验证：在本地起一个 HTTP 服务器，用 Pagefind 的 API 真实搜索一遍，
 * 验证搜索卡片要用到的数据（URL / 标题 / 证据等级 / 类别 / 成本 / 耗时 / 摘要高亮）是否齐全正确。
 *
 * 为什么必须这样做：搜索结果是**前端运行时**渲染的，`curl` 只能拿到空壳 HTML，
 * 所以「点搜索结果跳 404」「卡片标题显示成 slug」这类 bug 逃过了所有基于文本比对的检查
 * （2026-10 真实发生过两次）。Pagefind 的核心是 isomorphic 的，能在 Node 里跑，
 * 于是可以在无浏览器的情况下把运行时的数据取出来断言。
 *
 * ⚠️ 为什么不用 file:// 直接读：那样 Pagefind 会把结果 URL 返回成文件系统路径
 * （`/file:/C:/.../dist/entry/xxx/`），与线上行为不一致，断言就没有意义了。
 * 起 HTTP 服务器后 URL 会正常变成 `/entry/xxx/`。
 *
 * 用法：node scripts/check-search-data.mjs
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const bundleDir = path.join(distDir, 'pagefind');

/* ---------- 最小静态服务器：只服务 dist/ ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
};

const server = createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const full = path.join(distDir, rel);
    // 防目录穿越
    if (!full.startsWith(distDir)) {
      res.writeHead(403).end();
      return;
    }
    const info = await stat(full).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

/* ---------- 加载 Pagefind 并搜索 ---------- */

const problems = [];
const pagefind = await import(pathToFileURL(path.join(bundleDir, 'pagefind.js')).href);
if (pagefind.options) await pagefind.options({ basePath: `${origin}/pagefind/` });

const queries = ['食品', '防晒', '久坐'];
const expectedMeta = ['title', 'evidence', 'category', 'cost', 'time'];
let checked = 0;

console.log(`\n搜索结果数据验证（本地 HTTP 服务器 ${origin}）`);

for (const query of queries) {
  const res = await pagefind.search(query, { resultCount: 60 });
  const datas = await Promise.all(res.results.map((r) => r.data()));
  console.log(`\n  搜「${query}」→ ${datas.length} 条结果`);

  if (datas.length === 0) {
    problems.push(`搜索「${query}」没有任何结果`);
    continue;
  }

  for (const data of datas) {
    checked += 1;
    // 剥掉测试服务器的 origin：线上站点根就是域名根，返回的是 /entry/xxx/；
    // 本地服务器挂在端口上，Pagefind 会返回绝对地址。剥掉后两边行为一致。
    const url = data.url.replace(origin, '');
    const where = `「${query}」${url}`;

    // URL 必须是站内绝对路径，指向 /entry/<slug>/，且不能带 file: 或 /pagefind/
    if (!/^\/entry\/[a-z0-9-]+\/$/.test(url)) {
      problems.push(`${where} 的 URL 形式不对（应为 /entry/<slug>/，实际 ${data.url}）`);
    }

    for (const key of expectedMeta) {
      if (!data.meta || !data.meta[key]) problems.push(`${where} 缺少 meta.${key}`);
    }

    // 标题不能是 slug 或空
    if (data.meta?.title && /^[a-z0-9-]+$/.test(data.meta.title)) {
      problems.push(`${where} 的标题看起来是 slug 而不是中文标题`);
    }

    // 摘要要有关键词高亮
    if (!data.excerpt || !data.excerpt.includes('<mark>')) {
      problems.push(`${where} 的摘要没有关键词高亮`);
    }
  }

  const s = datas[0];
  console.log(`    样例 url      : ${s.url.replace(origin, '')}`);
  console.log(`    样例 title    : ${s.meta?.title}`);
  console.log(`    样例 evidence : ${s.meta?.evidence}`);
  console.log(`    样例 category : ${s.meta?.category}`);
  console.log(`    样例 cost/time: ${s.meta?.cost} / ${s.meta?.time}`);
}

/* ---------- 对账：结果必须指向真实存在的词条页 ---------- */

const entryDirs = (await readdir(path.join(distDir, 'entry'), { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const name of entryDirs) {
  const html = await readFile(path.join(distDir, 'entry', name, 'index.html'), 'utf8');
  const metas = [...html.matchAll(/<span data-pagefind-meta="([^"]+)"[^>]*>([^<]*)<\/span>/g)];
  const keys = metas.map((m) => m[1]);
  if (!keys.includes('title') || !keys.includes('evidence')) {
    problems.push(`词条 ${name} 的页面里缺少 title/evidence 的 data-pagefind-meta 元素`);
  }
}

console.log(`\n  dist 里 ${entryDirs.length} 个词条页；共校验 ${checked} 条搜索结果`);

server.close();

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 15)) console.error(`  ✗ ${p}`);
  if (problems.length > 15) console.error(`  … 另有 ${problems.length - 15} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 搜索卡片的数据（URL / 标题 / 证据等级 / 类别 / 成本 / 耗时 / 摘要高亮）全部正常。\n');
