/**
 * 线上可达性/延迟诊断：回答「访问慢，是站点问题还是链路问题」。
 *
 * 为什么要做成脚本：这个判断需要**大量重复采样**才有意义——
 * 大陆到 Cloudflare 的链路丢包时，单次测量会给出完全误导的结论
 * （实测同一天里同一地址，有时 0.7 s，有时 30 s 超时，有时 TLS 握手要 5 s）。
 * 手工敲几次 curl 判断不出来，必须统计分布。
 *
 * 判读方法：
 *   · 看**中位数**：正常应该 < 1.5 s。若中位数就很大，说明稳定地慢。
 *   · 看**成功率与最大值**：若中位数正常但偶发 30–120 s 超时，说明是丢包/卡住，不是"页面重"。
 *   · 对比 `www.cloudflare.com`：它在同一个 Cloudflare 网络上，作为**链路基线**。
 *     如果它也慢 → 是这条国际链路的问题；如果它快而本站慢 → 才需要查站点侧。
 *
 * 用法：
 *   node scripts/diagnose-latency.mjs            # 默认每个目标 8 次
 *   node scripts/diagnose-latency.mjs --runs 15
 *
 * 需要 curl（本机 Node 的 fetch 在这条线路上丢包严重，实测不可用，见 HANDOFF）。
 */

import { execFile } from 'node:child_process';

const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg !== -1 ? Number(process.argv[runsArg + 1]) : 8;
const TIMEOUT = 30; // 秒；超过就算"卡住"

const targets = [
  { label: '本站首页', url: 'https://costlifehealth.com/' },
  { label: '本站浏览页', url: 'https://costlifehealth.com/browse/' },
  { label: '本站词条页', url: 'https://costlifehealth.com/entry/oral-care/' },
  { label: '链路基线 www.cloudflare.com', url: 'https://www.cloudflare.com/' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function measure(url) {
  return new Promise((resolve) => {
    execFile(
      'curl',
      [
        '-sS', '-o', 'NUL',
        '--max-time', String(TIMEOUT),
        '-w', '%{http_code} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total} %{size_download}',
        url,
      ],
      { encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        const parts = (stdout || '').trim().split(/\s+/);
        if (error || parts.length < 6 || parts[0] === '000') {
          resolve({ failed: true, stderr: (stderr || error?.message || '').trim().slice(0, 60) });
          return;
        }
        resolve({
          failed: false,
          code: parts[0],
          connect: Number(parts[1]),
          tls: Number(parts[2]),
          ttfb: Number(parts[3]),
          total: Number(parts[4]),
          size: Number(parts[5]),
        });
      },
    );
  });
}

const stat = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  };
};

const fmt = (n) => (n == null ? '—' : `${n.toFixed(2)}s`);

console.log(`\n线上延迟诊断：每个目标 ${RUNS} 次，单次超时 ${TIMEOUT}s\n`);

for (const target of targets) {
  const ok = [];
  let failed = 0;

  for (let i = 1; i <= RUNS; i++) {
    const r = await measure(target.url);
    if (r.failed) {
      failed += 1;
    } else {
      ok.push(r);
    }
    await sleep(400);
  }

  const totals = stat(ok.map((r) => r.total));
  const conns = stat(ok.map((r) => r.connect));
  const tlss = stat(ok.map((r) => r.tls));
  const ttfbs = stat(ok.map((r) => r.ttfb));
  const sizes = ok.length ? ok[0].size : 0;

  console.log(`【${target.label}】`);
  console.log(`  成功 ${ok.length}/${RUNS}，失败/超时 ${failed}`);
  if (totals) {
    console.log(`  TCP 连接   中位 ${fmt(conns.median)}   (${fmt(conns.min)} – ${fmt(conns.max)})`);
    console.log(`  TLS 握手   中位 ${fmt(tlss.median)}   (${fmt(tlss.min)} – ${fmt(tlss.max)})`);
    console.log(`  首字节     中位 ${fmt(ttfbs.median)}   (${fmt(ttfbs.min)} – ${fmt(ttfbs.max)})`);
    console.log(`  总耗时     中位 ${fmt(totals.median)}   (${fmt(totals.min)} – ${fmt(totals.max)})`);
    console.log(`  传输大小   ${sizes} B`);
  }
  console.log('');
}

console.log('判读：若「链路基线」同样慢或超时 → 是国际链路问题，优化站点无用；');
console.log('      若基线快而本站慢 → 才需要查站点侧（Worker、缓存、体积）。\n');
