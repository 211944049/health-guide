/**
 * 线上死链扫描：把线上页面里出现的**内部链接**抽出来，对着线上实际请求一遍，看有没有 404。
 *
 * 为什么需要它：`check-site-links.mjs` 检查的是**本地 dist**（能证明构建自洽），
 * `check-deployed.mjs` 比对的是**你指定/枚举的页面**。两者都覆盖不到
 * 「线上某个页面里的链接指向了一个线上不存在的地址」——只有真的去请求才会发现。
 *
 * 用法：
 *   node scripts/check-live-links.mjs                 # 从首页和 sitemap 出发
 *   node scripts/check-live-links.mjs --max 40        # 最多检查 40 个页面
 *
 * 退出码：0 无死链；1 发现死链。
 */

import { execFile } from 'node:child_process';

const ORIGIN = process.env.SITE_URL ?? 'https://costlifehealth.com';
const maxArg = process.argv.indexOf('--max');
const MAX_PAGES = maxArg !== -1 ? Number(process.argv[maxArg + 1]) : 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curl(args) {
  return new Promise((resolve) => {
    execFile('curl', args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      resolve({ error, stdout: stdout ?? Buffer.alloc(0) });
    });
  });
}

/**
 * 取 HTTP 状态码（不跟随重定向，好看出 307 这种）。
 *
 * ⚠️ 必须重试：国内直连 Cloudflare 时请求会被偶发丢弃，curl 返回 `000`（连接失败），
 * 而 `000` **不代表页面不存在**。第一版没重试，结果把 12 个正常页面（如 /entry/humidity/）
 * 全报成了死链——`000` 与真正的 404 必须分开对待。
 */
async function statusOf(url) {
  // 注意用 NUL 而不是 /dev/null：这是 Windows 上的空设备名，curl.exe 认它。
  for (let i = 1; i <= 4; i++) {
    const { stdout } = await curl([
      '-sS', '-o', 'NUL', '-w', '%{http_code}',
      '--max-time', '60', '--retry', '2', '--retry-delay', '2', '--retry-all-errors',
      url,
    ]);
    const code = stdout.toString().trim();
    if (code && code !== '000') return code;
    await sleep(700 * i);
  }
  return '000'; // 四次都没连上，才认定为网络不可达
}

/** 取正文（跟随重定向，带重试）。 */
async function bodyOf(url) {
  for (let i = 1; i <= 3; i++) {
    const { stdout, error } = await curl(['-sS', '-L', '--max-time', '90', '--retry', '2', '--retry-all-errors', url]);
    if (!error && stdout.length > 0) return stdout.toString('utf8');
    await sleep(600 * i);
  }
  return '';
}

/** 从 sitemap 拿全部已知 URL（这是站点自己声明的权威清单）。 */
async function urlsFromSitemap() {
  const idx = await bodyOf(`${ORIGIN}/sitemap-index.xml`);
  const children = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = [];
  for (const child of children) {
    const xml = await bodyOf(child);
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  return urls;
}

const sitemapUrls = await urlsFromSitemap();
console.log(`\n线上死链扫描：${ORIGIN}`);
console.log(`sitemap 声明 ${sitemapUrls.length} 个 URL`);

// 1) sitemap 里的每个 URL 都必须是 200（或 307→200）
const badStatus = [];
const unreachable = [];
for (const url of sitemapUrls.slice(0, MAX_PAGES)) {
  await sleep(700);
  const code = await statusOf(url);
  if (code === '000') unreachable.push(`[sitemap] ${url.replace(ORIGIN, '') || '/'}`);
  else if (code !== '200') badStatus.push(`${code}  ${url.replace(ORIGIN, '') || '/'}`);
}
console.log(`\n[1/2] sitemap URL 状态检查：${Math.min(sitemapUrls.length, MAX_PAGES)} 个，非 200 共 ${badStatus.length} 个，网络不可达 ${unreachable.length} 个`);

// 2) 抽出页面里的内部链接，逐个请求（抓「页面里链到不存在地址」）
const pages = [ORIGIN + '/', ORIGIN + '/browse/', ...sitemapUrls].slice(0, MAX_PAGES);
const seen = new Set();
const badLinks = [];

for (const page of pages) {
  await sleep(700);
  const html = await bodyOf(page);
  if (!html) continue;

  for (const m of html.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/g)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('data:') || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue;
    if (/^https?:\/\//.test(raw) && !raw.startsWith(ORIGIN)) continue; // 外链跳过
    const abs = raw.startsWith('/') ? ORIGIN + raw : new URL(raw, page).href;
    if (!abs.startsWith(ORIGIN)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);

    await sleep(500);
    const code = await statusOf(abs);
    if (code === '000') {
      unreachable.push(`[内链] ${abs.replace(ORIGIN, '')}   ← 出现在 ${page.replace(ORIGIN, '') || '/'}`);
    } else if (code !== '200' && code !== '307' && code !== '301' && code !== '308') {
      badLinks.push(`${code}  ${abs.replace(ORIGIN, '')}   ← 出现在 ${page.replace(ORIGIN, '') || '/'}`);
    }
  }
}
console.log(`[2/2] 页面内链检查：${seen.size} 个唯一链接，非 2xx/3xx 共 ${badLinks.length} 个，网络不可达 ${unreachable.length} 个`);

if (badStatus.length || badLinks.length) {
  console.error('\n发现真实异常（非网络问题）：');
  for (const b of badStatus) console.error(`  ✗ [sitemap] ${b}`);
  for (const b of badLinks) console.error(`  ✗ [内链]   ${b}`);
  if (unreachable.length) {
    console.error(`\n（另有 ${unreachable.length} 个地址因网络不可达没能确认，重跑一次通常会消失：）`);
    for (const u of unreachable.slice(0, 10)) console.error(`  ? ${u}`);
  }
  console.error('');
  process.exit(1);
}

console.log('\n✓ 线上无死链。');
if (unreachable.length) {
  console.log(`\n注意：有 ${unreachable.length} 个地址因网络不可达未能确认（0 字节响应，不是 404）：`);
  for (const u of unreachable.slice(0, 10)) console.log(`  ? ${u}`);
  console.log('重跑一次通常会消失；若持续出现同一个，才需要当问题查。');
}
console.log('');
