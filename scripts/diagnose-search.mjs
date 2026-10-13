/**
 * 搜索相关性诊断：看 Pagefind 对中文到底怎么匹配的。
 *
 * 用户反馈「搜索会搜出不相关内容」。这里直接调 Pagefind API，
 * 把每个查询的**命中词**（Pagefind 会返回它实际匹配到的词）打出来，
 * 判断是「分词/模糊匹配过头」还是「前端状态错乱」。
 *
 * 用法：node scripts/diagnose-search.mjs
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.join(distDir, rel);
  if (!full.startsWith(distDir)) return res.writeHead(403).end();
  const info = await stat(full).catch(() => null);
  if (!info || !info.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] ?? 'application/octet-stream' });
  res.end(await readFile(full));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const pf = await import(pathToFileURL(path.join(distDir, 'pagefind', 'pagefind.js')).href);
if (pf.options) await pf.options({ basePath: `${origin}/pagefind/` });

// 这些是用户实际会搜的词；混杂「该命中」和「不该命中」的对照
const queries = ['外卖', '久坐', '防晒', '耳塞', '跑步鞋', '睡眠'];

console.log('\n搜索相关性诊断\n');

for (const q of queries) {
  const res = await pf.search(q, { resultCount: 60 });
  const datas = await Promise.all(res.results.map((r) => r.data()));
  console.log(`搜「${q}」→ ${datas.length} 条`);

  // 每条结果：标题 + Pagefind 报告命中的词
  for (const d of datas.slice(0, 6)) {
    const words = (d.words ?? []).slice(0, 6).join(',');
    console.log(`    ${String(d.meta?.title ?? d.url).slice(0, 18).padEnd(20)} 命中词: [${words}]`);
  }
  if (datas.length > 6) console.log(`    … 另有 ${datas.length - 6} 条`);
  console.log('');
}

server.close();
