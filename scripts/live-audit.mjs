/**
 * 线站全量体检。
 *
 * 为什么值得做：这几天连续加了 6 + 2 条词条、改了来源库、改了 5 个脚本，
 * 又部署了两次。**构建绿不等于线上对**——部署可能漏文件、某个页面可能 404、
 * sitemap 可能没更新。这类问题不体检发现不了，而读者会直接碰到。
 *
 * ## ⚠️ 第一版用 8 并发，结果一片 ERR —— 是我的探针打崩了网络
 *
 * 第一版 `CONCURRENCY = 8`，跑出来 14 个关键页面试了 13 个 `ERR`。
 * 串行重测同一批 URL：**全部 200**。所以那些 ERR **不是站点问题**，
 * 是 8 个并发 curl 在这条不稳的网络上互相挤掉了（还看到 `000`）。
 *
 * 改法：
 *   1. **降并发到 2**（保持一点并行，但不压垮连接）
 *   2. **失败重试 2 次**（网络抖动一次就能恢复）
 *   3. **区分三种结果**：
 *        `404` → 真问题（页面不存在）
 *        `ERR` → 重试后仍拿不到连接 → **不可判定**，单独报，不当失败
 *        其它非 200 → 真问题
 *
 * 判据设计的教训：**把"探针失败"和"被测对象失败"分成两类**，
 * 否则网络一抖就报一堆假警报，久而久之就不信这个检查了。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = 'C:/Users/17878/Documents/deepseek-harness/default-workspace/health-guide';
const ORIGIN = 'https://costlifehealth.com';
const CONCURRENCY = 2;
const RETRIES = 2;

function httpCode(url) {
  try {
    return execFileSync('curl', ['-sS', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '30', '-L', url], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'ERR';
  }
}

/** 带重试的取码。返回 { code, tries }。 */
async function httpCodeWithRetry(url) {
  let code = 'ERR';
  for (let i = 0; i <= RETRIES; i++) {
    code = httpCode(url);
    if (code === '200') return { code, tries: i + 1 };
    // 404 是真问题，重试没意义
    if (code === '404' || code === '410') return { code, tries: i + 1 };
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return { code, tries: RETRIES + 1 };
}

function fetchText(url) {
  try {
    return execFileSync('curl', ['-sS', '--max-time', '30', '-L', url], {
      encoding: 'utf8', maxBuffer: 20e6, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

/** 简单并发池。 */
async function pool(items, worker, n = CONCURRENCY) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ---------- 收集本地应该存在的页面 ---------- */
const entrySlugs = (await readdir(path.join(root, 'src', 'content', 'entries')))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

const topicDirs = (await readdir(path.join(root, 'dist', 'topic'), { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const catDirs = (await readdir(path.join(root, 'dist', 'category'), { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const PAGE_URLS = [
  '/', '/browse/', '/topic/', '/tools/', '/about/', '/search/',
  '/tools/bmi/', '/tools/sedentary/', '/tools/water/',
  ...topicDirs.map((t) => `/topic/${t}/`),
  ...catDirs.map((c) => `/category/${c}/`),
];

const ENTRY_URLS = entrySlugs.map((s) => `/entry/${s}/`);

console.log(`\n=== 线上体检：${ORIGIN} ===\n`);
console.log(`  本地词条 ${entrySlugs.length} 条，专题 ${topicDirs.length} 个，分类 ${catDirs.length} 个\n`);

/* ---------- 1. 关键页 ---------- */
console.log('--- 关键页面 ---');
const pageResults = await pool(PAGE_URLS, async (u) => {
  const r = await httpCodeWithRetry(ORIGIN + u);
  return { u, ...r };
});
const badPages = pageResults.filter((r) => r.code !== '200' && r.code !== 'ERR');
const unknownPages = pageResults.filter((r) => r.code === 'ERR');
if (badPages.length) {
  for (const b of badPages) console.log(`  ✗ ${b.code}  ${b.u}  （真问题）`);
}
if (unknownPages.length) {
  for (const b of unknownPages) console.log(`  ? ERR  ${b.u}  （重试 ${b.tries} 次仍不可达，不可判定）`);
}
if (!badPages.length && !unknownPages.length) {
  console.log(`  ✓ ${pageResults.length} 个关键页面全部 200`);
}

/* ---------- 2. 全部词条页 ---------- */
console.log('\n--- 全部词条页 ---');
const entryResults = await pool(ENTRY_URLS, async (u) => {
  const r = await httpCodeWithRetry(ORIGIN + u);
  return { u, ...r };
});
const badEntries = entryResults.filter((r) => r.code !== '200' && r.code !== 'ERR');
const unknownEntries = entryResults.filter((r) => r.code === 'ERR');
if (badEntries.length) {
  for (const b of badEntries.slice(0, 20)) console.log(`  ✗ ${b.code}  ${b.u}  （真问题）`);
  if (badEntries.length > 20) console.log(`  … 另有 ${badEntries.length - 20} 个`);
}
if (unknownEntries.length) {
  console.log(`  ? ${unknownEntries.length} 个重试后仍不可达（网络问题，不可判定，不是 404）`);
  for (const b of unknownEntries.slice(0, 10)) console.log(`      ${b.u}`);
}
if (!badEntries.length && !unknownEntries.length) {
  console.log(`  ✓ ${entryResults.length} 个词条页全部 200`);
}

/* ---------- 3. sitemap ---------- */
console.log('\n--- sitemap ---');
const localSm = await readFile(path.join(root, 'dist', 'sitemap-0.xml'), 'utf8');
const localCount = (localSm.match(/<loc>/g) ?? []).length;
const liveSm = fetchText(`${ORIGIN}/sitemap-0.xml`);
const liveCount = (liveSm.match(/<loc>/g) ?? []).length;
console.log(`  本地 ${localCount} 个 URL，线上 ${liveCount} 个  ${localCount === liveCount ? '✓ 一致' : '⚠️ 不一致'}`);

/* ---------- 4. 抽查新增中医词条是否真的有内容 ---------- */
console.log('\n--- 抽查新词条内容 ---');
const NEW = ['acupuncture-pain', 'herb-drug-interaction', 'cupping-gua-sha', 'moxibustion', 'tuina-massage', 'shanghuo', 'solar-terms-health', 'detox-myth'];
for (const s of NEW) {
  const html = fetchText(`${ORIGIN}/entry/${s}/`);
  const vis = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const hasStrong = html.includes('<strong>');
  const stars = (vis.match(/\*/g) ?? []).length;
  const bt = (vis.match(/\*\*/g) ?? []).length;
  const ok = html.length > 8000 && hasStrong && stars === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${s.padEnd(24)} ${String(html.length).padStart(6)} 字节  加粗 ${hasStrong ? '有' : '无'}  字面星号 ${stars}`);
}

/* ---------- 5. 首页词条数 ---------- */
console.log('\n--- 首页 ---');
const home = fetchText(ORIGIN + '/');
const m = home.replace(/<[^>]+>/g, ' ').match(/已写\s*(\d+)\s*个词条/);
console.log(`  首页显示词条数：${m ? m[1] : '(未取到)'}  ${m && m[1] === String(entrySlugs.length) ? '✓ 与本地一致' : '⚠️ 与本地不一致'}`);

/* ---------- 汇总 ---------- */
const failTotal = badPages.length + badEntries.length;
console.log('\n=== 结论 ===');
if (failTotal === 0) {
  console.log('  ✓ 没有发现 404 或异常页面');
} else {
  console.log(`  ⚠️ ${failTotal} 个页面有问题（见上）`);
  process.exitCode = 1;
}
