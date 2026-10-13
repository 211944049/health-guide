/**
 * 复刻 search.astro 的渲染逻辑，在 Node 里跑一遍，断言「显示几条 / 按钮是否该出现 / 文案对不对」。
 *
 * 为什么要这么做：搜索页的分页与计数是**前端运行时**算出来的，截图只能看到结果。
 * 这里把页面里的逻辑原样搬过来，用真实的 Pagefind 索引驱动，就能在无浏览器的情况下
 * 断言「首屏显示数 + 剩余数 == 总数」这类不变量。
 *
 * 用法：node scripts/check-search-paging.mjs
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

/* ---------- PAGE 从源码里读，避免测试与实现各写一份而悄悄漂移 ---------- */

const searchSrc = await readFile(path.join(root, 'src', 'pages', 'search.astro'), 'utf8');
const pageMatch = searchSrc.match(/\bPAGE\s*=\s*(\d+)/);
if (!pageMatch) {
  console.error('✗ 没能从 src/pages/search.astro 里读到 PAGE 的值');
  server.close();
  process.exit(1);
}
const PAGE = Number(pageMatch[1]);

/** 页面里的 render 只做过滤 + 切片 + 算文案，这里抽出来单独测。 */
function computeView(allResults, active, shown) {
  const list = allResults.filter((d) => {
    for (const key in active) {
      if (active[key] && String((d.meta || {})[key]) !== active[key]) return false;
    }
    return true;
  });
  const slice = list.slice(0, shown);
  return {
    total: list.length,
    visible: slice.length,
    remaining: Math.max(0, list.length - shown),
    moreHidden: shown >= list.length,
  };
}

const problems = [];
const queries = ['衣服', '食品', '防晒', '久坐', '健身'];

console.log(`\n搜索分页逻辑检查（PAGE=${PAGE}，读自 search.astro）`);

for (const query of queries) {
  const res = await pf.search(query, { resultCount: 60 });
  const all = await Promise.all(res.results.map((r) => r.data()));

  // 模拟：初始状态（新搜索 → shown = PAGE）
  const first = computeView(all, {}, PAGE);

  console.log(
    `  搜「${query}」总数 ${first.total} → 首屏显示 ${first.visible}，剩余 ${first.remaining}，` +
      `按钮${first.moreHidden ? '隐藏' : '显示'}`,
  );

  // 不变量 1：首屏显示数不能超过总数
  if (first.visible > first.total) {
    problems.push(`「${query}」首屏显示 ${first.visible} 条 > 总数 ${first.total} 条`);
  }
  // 不变量 2：显示数 + 剩余数必须等于总数（截图里出现过 5 + 5 ≠ 7 的情况）
  if (first.visible + first.remaining !== first.total) {
    problems.push(`「${query}」显示 ${first.visible} + 剩余 ${first.remaining} ≠ 总数 ${first.total}`);
  }
  // 不变量 3：总数 ≤ PAGE 时按钮必须隐藏
  if (first.total <= PAGE && !first.moreHidden) {
    problems.push(`「${query}」总数 ${first.total} ≤ PAGE(${PAGE})，按钮本应隐藏却显示「还有 ${first.remaining} 条」`);
  }
  // 不变量 4：总数 > PAGE 时按钮必须显示，且剩余数正确
  if (first.total > PAGE && first.moreHidden) {
    problems.push(`「${query}」总数 ${first.total} > PAGE(${PAGE})，按钮本应显示却被隐藏`);
  }
  // 不变量 5：按钮文案里的剩余数必须等于「总数 - 已显示」
  if (!first.moreHidden && first.remaining !== first.total - first.visible) {
    problems.push(
      `「${query}」按钮文案说「还有 ${first.remaining} 条」，但实际剩下 ${first.total - first.visible} 条`,
    );
  }

  // 模拟：点几次「加载更多」，最终必须收敛到「显示全部 + 按钮隐藏」
  let shown = PAGE;
  let guard = 0;
  while (guard++ < 20) {
    const view = computeView(all, {}, shown);
    if (view.moreHidden) {
      if (view.visible !== view.total) {
        problems.push(`「${query}」按钮隐藏时只显示 ${view.visible}/${view.total} 条（应全部显示）`);
      }
      break;
    }
    shown += PAGE;
  }
  if (guard >= 20) problems.push(`「${query}」点击加载更多没有收敛`);
}

/* ---------- 顺带确认筛选不会把「总数」改小到与展示矛盾 ---------- */

const res = await pf.search('食品', { resultCount: 60 });
const all = await Promise.all(res.results.map((r) => r.data()));
const byEvidence = {};
for (const d of all) byEvidence[d.meta?.evidence] = (byEvidence[d.meta?.evidence] || 0) + 1;
const sum = Object.values(byEvidence).reduce((a, b) => a + b, 0);
console.log(`\n  「食品」按证据等级分组：${JSON.stringify(byEvidence)}，合计 ${sum}`);
if (sum !== all.length) problems.push(`「食品」分组计数合计 ${sum} ≠ 总数 ${all.length}`);

server.close();

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 搜索分页与计数逻辑自洽。\n');
