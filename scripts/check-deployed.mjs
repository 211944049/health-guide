/**
 * 线上核验：把线上站点与本地 dist/ 逐字节比对。
 *
 * 为什么需要它：判断「线上是不是最新版」有几种弱办法——比 pagefind 哈希（只看词条正文，
 * 样式改动不动它）、看页面文字（会被缓存和截断骗到）。**逐字节比对才是硬证据**：
 * Astro 产出的 HTML 是确定性的，本地构建相同就应该和线上一个字都不差。
 *
 * 用法：
 *   node scripts/check-deployed.mjs                  # 核验全部 HTML 页 + pagefind 索引
 *   node scripts/check-deployed.mjs --only entry/    # 只核验路径匹配的页面
 *   node scripts/check-deployed.mjs --limit 8        # 最多核验 8 页（国内网络下全量约 10 分钟）
 *
 * 退出码：0 全部一致；1 有差异或抓取失败。
 *
 * ⚠️ 网络注意：国内直连 Cloudflare 时有两种偶发故障，**都不是部署问题**：
 *   1. 响应**被截断**（同一页重试即好）；
 *   2. 请求**被直接丢弃**（0 字节）。
 * 实测**必须用 curl 发起请求**：本机 Node 的 fetch/undici 在这条线路上丢失率很高（大页面几乎必失），
 * 同一 URL 用 curl 往往一次就成。所以这里 spawn curl，并且每页之间加节流（`--delay`，默认 800 ms）、
 * 每页多轮重试，**长度不符一律不算通过**。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const ORIGIN = process.env.SITE_URL ?? 'https://costlifehealth.com';
const ATTEMPTS = 4;

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg !== -1 ? process.argv[onlyArg + 1] : null;
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : null;
const delayArg = process.argv.indexOf('--delay');
const delayMs = delayArg !== -1 ? Number(process.argv[delayArg + 1]) : 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function collectHtml(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await collectHtml(path.join(dir, entry.name), rel)));
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

/** 用 curl 抓取（stdout 收成 Buffer）。curl 在本机这条线路上比 Node fetch 可靠得多。 */
function curlBuf(url) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      ['-sS', '-L', '--max-time', '120', '--retry', '2', '--retry-delay', '2', '--retry-all-errors', '-o', '-', url],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

/** 带重试的抓取：长度不符或报错都重试。 */
async function fetchWithRetry(url, expectedLength) {
  let last = Buffer.alloc(0);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(delayMs * attempt);
    try {
      const buf = await curlBuf(url);
      last = buf;
      // 长度不对 → 响应被截断或请求被丢弃，重试
      if (expectedLength === undefined || buf.length === expectedLength) return { buf, attempt };
    } catch {
      // 交给下一轮重试
    }
  }
  return { buf: last, attempt: ATTEMPTS, truncated: true };
}

const allPages = (await collectHtml(distDir)).filter((rel) => !only || rel.includes(only)).sort();
const pages = limit && limit > 0 ? allPages.slice(0, limit) : allPages;

console.log(`\n线上核验：${ORIGIN}`);
console.log(
  `本地基准：dist/（核验 ${pages.length} 个 HTML 页${allPages.length !== pages.length ? ` / 共 ${allPages.length}` : ''}` +
    `${only ? `，筛选「${only}」` : ''}）\n`,
);

let identical = 0;
const problems = [];
const retried = [];

for (const rel of pages) {
  await sleep(delayMs); // 页间节流：连续快速请求会被直接丢弃（0 字节）
  const localBuf = await readFile(path.join(distDir, rel));
  const { buf, attempt, truncated } = await fetchWithRetry(`${ORIGIN}/${rel}`, localBuf.length);
  const got = buf?.length ?? 0;

  if (truncated || got !== localBuf.length) {
    problems.push(`${rel}: 抓取不完整（重试 ${ATTEMPTS} 次，最大 ${got} B，本地 ${localBuf.length} B）`);
    continue;
  }
  if (sha(buf) === sha(localBuf)) {
    identical += 1;
    if (attempt > 1) retried.push(rel);
  } else {
    problems.push(`${rel}: 内容不一致（同为 ${got} B 但 SHA256 不同）`);
  }
}

// pagefind 索引单独核验：它决定搜索能不能搜到新词条。
//
// ⚠️ 关键：**索引哈希每次构建都会变**（实测连续两次构建得到 zh-cn_44f317c250bfc 与
// zh-cn_d69790bed72f9，内容完全相同）。所以哈希**不能**当作「线上是否最新」的判据——
// 交接文档里那条「用 pagefind 哈希判断线上是不是最新版」的说法只在「线上包与本地 dist
// 是同一份产物」时成立，重新构建过的本地 dist 永远对不上。
// 真正有意义的判据是 **page_count（收录了多少页）**：内容扩到 50 条时它必须变成 50。
// 哈希只作为信息打印出来，不一致不判失败。
let pfOk = null;
let pfDetail = '';
try {
  const local = JSON.parse(await readFile(path.join(distDir, 'pagefind', 'pagefind-entry.json'), 'utf8'));
  const live = JSON.parse((await curlBuf(`${ORIGIN}/pagefind/pagefind-entry.json`)).toString('utf8'));
  const localHash = local?.languages?.['zh-cn']?.hash;
  const liveHash = live?.languages?.['zh-cn']?.hash;
  const localCount = local?.languages?.['zh-cn']?.page_count;
  const liveCount = live?.languages?.['zh-cn']?.page_count;
  // 只有收录页数才对得上；哈希必然不同（见上）
  pfOk = localCount === liveCount && Number(localCount) > 0;
  pfDetail =
    `收录页数 本地 ${localCount} / 线上 ${liveCount}` +
    `（哈希 本地 ${localHash} / 线上 ${liveHash} —— 哈希每次构建都会变，仅作参考）`;
} catch (error) {
  pfOk = false;
  pfDetail = `核验失败：${error.message}`;
}

console.log(`HTML 逐字节一致 : ${identical} / ${pages.length}`);
if (retried.length > 0) console.log(`  （其中 ${retried.length} 页首次响应被截断，重试后一致：${retried.join(', ')}）`);
console.log(`pagefind 索引   : ${pfOk ? '一致' : '不一致'} —— ${pfDetail}`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\n提示：若线上明显小于本地，通常是网络截断而非部署问题，重跑一次即可。\n');
  process.exit(1);
}

if (!pfOk) {
  console.error('\n✗ pagefind 索引与本地不一致 —— 线上搜索可能搜不到新词条。\n');
  process.exit(1);
}

console.log('\n✓ 线上与本地构建完全一致。\n');
