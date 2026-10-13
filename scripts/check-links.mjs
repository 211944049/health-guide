/**
 * 互链体检：检查词条正文里的站内链接是否都有对应页面。
 *
 * 为什么需要它：正文可以写 `[净水器怎么选](/entry/water-purifier-choice/)` 这样的行内互链，
 * 但如果那条词条还没写，构建**不会报错**，只是页面上多一个 404 链接。
 * 补词条时一边写一边链，最容易出这种问题，所以单独拦一道。
 *
 * 用法：node scripts/check-links.mjs
 *
 * 检查两类目标：
 *   /entry/<slug>/     → src/content/entries/<slug>.md 必须存在
 *   其它站内路径        → 在 src/pages 里能找到对应的页面文件或动态路由
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');

const files = (await readdir(entriesDir).catch(() => [])).filter((f) => f.endsWith('.md'));
const slugs = new Set(files.map((f) => f.replace(/\.md$/, '')));

/** 静态页面路径：把 src/pages 下的文件映射成可访问路径。 */
async function collectRoutes(dir, prefix = '') {
  const routes = new Set();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const r of await collectRoutes(path.join(dir, entry.name), rel)) routes.add(r);
    } else if (/\.(astro|md)$/.test(entry.name)) {
      const base = rel.replace(/\.(astro|md)$/, '');
      const withoutIndex = base.replace(/\/index$/, '').replace(/^index$/, '');
      // 动态路由（如 category/[category]）记成前缀，后面按前缀放行
      routes.add(`/${withoutIndex}`.replace(/\/$/, '') || '/');
    }
  }
  return routes;
}

const routes = await collectRoutes(path.join(root, 'src', 'pages'));
const problems = [];
let checked = 0;

for (const file of files.sort()) {
  const raw = await readFile(path.join(entriesDir, file), 'utf-8');
  // 只看行内链接的目标，忽略锚点和外链
  for (const match of raw.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    const href = match[1];
    if (href.startsWith('//')) continue; // 协议相对的外链
    checked += 1;
    const clean = href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';

    const entryMatch = clean.match(/^\/entry\/([a-z0-9-]+)$/);
    if (entryMatch) {
      if (!slugs.has(entryMatch[1])) {
        problems.push(`${file}: 链接 /entry/${entryMatch[1]}/ 没有对应词条（缺 src/content/entries/${entryMatch[1]}.md）`);
      }
      continue;
    }

    // 其它站内路径：允许精确命中，或命中动态路由的前缀
    const hit = routes.has(clean) || [...routes].some((r) => r.includes('[') && clean.startsWith(r.split('/[')[0]));
    if (!hit) problems.push(`${file}: 链接 ${href} 在 src/pages 里找不到对应页面`);
  }
}

console.log(`\n互链体检：检查 ${checked} 条站内链接，覆盖 ${slugs.size} 条词条`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('全部通过。\n');
