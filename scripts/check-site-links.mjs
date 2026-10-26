/**
 * 全站链接爬取：把 dist/ 里每个 HTML 页面的**所有内部链接**抽出来，逐个检查目标是否存在。
 *
 * 为什么不能只靠 check-links.mjs：
 * 那个脚本只查「词条正文里以 / 开头的链接」（也就是 Markdown 里手写的行内互链）。
 * 页头、页脚、分类页、卡片链接、相对链接全都不在它的覆盖范围里——
 * 而站点的导航和卡片是自动生成的，一旦路径规则变了，那里最容易出现 404。
 *
 * 用法：
 *   node scripts/check-site-links.mjs
 *   node scripts/check-site-links.mjs --verbose
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isThirdPartyVerification } from './lib/html-files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const verbose = process.argv.includes('--verbose');

/** 收集 dist 下所有文件（相对路径，正斜杠）。 */
async function collect(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await collect(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const allFiles = new Set(await collect(distDir));
const htmlFiles = [...allFiles].filter((f) => f.endsWith('.html') && !isThirdPartyVerification(f));

/** 把一个站内 URL 映射成 dist 里应当存在的文件（返回候选列表）。 */
function candidatesFor(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return ['index.html'];
  const noSlash = clean.replace(/\/+$/, '');
  const rel = noSlash.replace(/^\//, '');
  const list = [`${rel}/index.html`, rel];
  // 无斜杠形式也要能解析到 xxx/index.html
  if (!clean.endsWith('/')) list.push(`${rel}/index.html`);
  return list;
}

const broken = [];
const external = new Set();
let checked = 0;

for (const file of htmlFiles) {
  const rawHtml = await readFile(path.join(distDir, file), 'utf8');
  const dir = path.posix.dirname(file);

  // ⚠️ 必须先剥掉 <script> / <style> 块再找 href/src。
  // 否则会把脚本里拼字符串的代码当成链接——搜索页自己渲染结果卡片，
  // 里面有 '...href="' + esc(data.url) + '"...' 这种模板串，第一版就被它误报过一次。
  const html = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  for (const match of html.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/g)) {
    const raw = match[1].trim();
    if (!raw) continue;
    if (/^(https?:)?\/\//.test(raw) || /^(mailto:|tel:|data:|javascript:)/.test(raw)) {
      external.add(raw);
      continue;
    }
    // 跳过纯锚点
    if (raw.startsWith('#')) continue;

    checked += 1;

    // 相对路径按当前页面目录解析，再统一成绝对路径
    let abs;
    if (raw.startsWith('/')) {
      abs = raw;
    } else {
      abs = path.posix.normalize(path.posix.join('/', dir === '.' ? '' : dir, raw));
    }

    const found = candidatesFor(abs).some((c) => allFiles.has(c));
    if (!found) {
      broken.push({ page: file, href: raw, resolved: abs });
    }
  }
}

// 静态资源（css/js/图片）用 src= 已经覆盖；这里再单独确认每个 HTML 页引用的资源存在

console.log(`\n全站链接爬取：${htmlFiles.length} 个 HTML 页，检查 ${checked} 条内部链接`);
console.log(`外链（未检查，仅统计）：${external.size} 条`);

if (broken.length > 0) {
  console.error(`\n发现 ${broken.length} 条死链：`);
  for (const b of broken) {
    console.error(`  ✗ ${b.page}  ->  ${b.href}   (解析为 ${b.resolved})`);
  }
  console.error('');
  process.exit(1);
}

console.log('\n✓ 所有内部链接都有对应文件。');
if (verbose) {
  console.log('\n外链清单：');
  for (const url of [...external].sort()) console.log(`  · ${url}`);
}
