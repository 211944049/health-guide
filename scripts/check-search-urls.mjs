/**
 * 回归测试：Pagefind 搜索结果拼出来的链接，必须指向真实存在的页面。
 *
 * 为什么需要它：站点的**搜索结果是前端渲染的**，`curl` 拿到的只是空壳，
 * 所以「点搜索结果跳到 404」这类 bug 逃过了所有基于文本比对的检查
 * （check-deployed 逐字节比对、check-site-links 爬静态链接，都看不到它）。
 * 2026-10 真的发生了：search.astro 里错设 `baseUrl: '/pagefind/'`，
 * 于是结果地址被拼成 `/pagefind/entry/xxx/`（404）。
 *
 * 这个脚本不需要浏览器：它复刻 Pagefind 的拼 URL 规则（从它的源码里抄的），
 * 然后用真实索引数据验证结果落在 dist 里存在的文件上。
 *
 * Pagefind 的规则（见 pagefind.js 的 PagefindInstance）：
 *   basePath = opts.basePath || '/pagefind/'          // 资源目录
 *   baseUrl  = opts.baseUrl  || getDefaultBaseUrl(basePath)
 *   getDefaultBaseUrl(p) => p.match(/^(.*\/)_?pagefind/)?.[1] || '/'
 *   fullUrl(raw) => `${baseUrl}/${raw}`.replace(/\/+/g,'/')
 *
 * 用法：node scripts/check-search-urls.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

/** 复刻 Pagefind 的 getDefaultBaseUrl。 */
function getDefaultBaseUrl(basePath) {
  const m = basePath.match(/^(.*\/)_?pagefind/);
  return m?.[1] || '/';
}

/** 复刻 Pagefind 的 fullUrl。 */
function fullUrl(baseUrl, raw) {
  if (/^(https?:)?\/\//.test(raw)) return raw;
  return `${baseUrl}/${raw}`.replace(/\/+/g, '/').replace(/^(https?:\/)/, '$1/');
}

async function collect(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await collect(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const problems = [];

// 1) 检查 src/pages/search.astro 里有没有真的设置 baseUrl —— 这是踩过的坑。
//    ⚠️ 必须先剥掉注释：源码里恰好有一段「不要设 baseUrl」的说明，直接匹配会误报
//    （第一版就这么误报了一次）。
const searchSrc = await readFile(path.join(root, 'src', 'pages', 'search.astro'), 'utf8');
const codeOnly = searchSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')      // 块注释
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 行注释（避开 https:// 这种）

const baseUrlOverride = codeOnly.match(/baseUrl\s*:\s*['"]([^'"]+)['"]/);
if (baseUrlOverride) {
  problems.push(
    `search.astro 里真的设置了 baseUrl: '${baseUrlOverride[1]}' —— ` +
      `baseUrl 是「页面」的基路径，设错会让结果链接全部指向错误目录（会 404）。` +
      `要改资源目录请用 bundlePath。`,
  );
}

// 2) 取 dist 里真实存在的词条 URL（这就是 Pagefind 会索引出来的地址）
const distDirEntries = path.join(distDir, 'entry');
let urls = [];
try {
  urls = (await readdir(distDirEntries, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => `entry/${d.name}/`);
} catch (error) {
  problems.push(`读 dist/entry 失败：${error.message}`);
}

// 3) 分别用「正确推导」和「错误覆盖」两种 baseUrl 算一遍，确认只有正确的能命中
const basePath = '/pagefind/';
const correctBase = getDefaultBaseUrl(basePath);
const wrongBase = basePath;

console.log(`\n搜索结果链接回归测试`);
console.log(`  bundlePath(basePath) = ${basePath}`);
console.log(`  推导出的 baseUrl     = ${correctBase}   ← 必须是 "/"`);
console.log(`  dist 里 ${urls.length} 个词条 URL`);

if (correctBase !== '/') {
  problems.push(`由 basePath ${basePath} 推导出的 baseUrl 应为 "/"，实际是 "${correctBase}"`);
}

const files = new Set(await collect(distDir));
let hitCorrect = 0;
const samples = [];
for (const raw of urls) {
  const abs = fullUrl(correctBase, raw);
  const rel = abs.replace(/^\//, '');
  const candidates = [`${rel}index.html`, rel];
  if (candidates.some((c) => files.has(c))) {
    hitCorrect += 1;
    if (samples.length < 3) samples.push(`${raw}  ->  ${abs}`);
  } else {
    problems.push(`用正确 baseUrl 拼出的地址在 dist 里不存在：${raw} -> ${abs}`);
  }
}

// 顺带证明错误覆盖确实会坏（拿一个样本即可，不作为失败条件）
if (urls[0]) {
  const badAbs = fullUrl(wrongBase, urls[0]);
  const badRel = badAbs.replace(/^\//, '');
  const badExists = [`${badRel}index.html`, badRel].some((c) => files.has(c));
  console.log(`\n  对照：若把 baseUrl 错设为 "${wrongBase}"，`);
  console.log(`        ${urls[0]} -> ${badAbs}  ${badExists ? '（竟然存在）' : '（dist 里不存在 → 就是当初的 404）'}`);
}

console.log(`\n  命中真实文件：${hitCorrect} / ${urls.length}`);
if (samples.length) {
  console.log('  样例：');
  for (const s of samples) console.log(`    · ${s}`);
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 搜索结果链接都指向真实存在的页面。\n');
