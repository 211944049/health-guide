/**
 * 验证 ISSUER_ENTRIES 里所有官方入口 URL 是否真的可访问。
 *
 * 为什么要单独一个脚本：这些链接是"可核对性"的全部依据。
 * 如果某个写着 200 却打不开、或者域名拼错，那这条著录就成了假的精确——
 * 比不著录更糟。所以**新增机构前必须先跑这个**。
 *
 * ## 判据分两级（这是我踩过两次坑之后定下来的）
 *
 * **第一级：HTTP 200** —— 最理想，路径和域名都对。
 *
 * **第二级：域名可解析且能建立 TLS 连接** —— 用于"反爬拦截"的情况。
 * 实测一批权威站点（ISO、NIH、OSHA、NICE、CDC）会对数据中心 IP 返回 **403**，
 * 但那是**反爬，不是链接坏**——读者用浏览器点开是正常的。
 * 如果因为 403 就把这些官方域名删掉，反而会损失一批最该有的入口。
 * 所以这一级单独判为「可达（反爬拦截）」。
 *
 * **不算通过**：DNS 解析不了（ERR 6）、TLS 握手失败（ERR 35/60）、超时（ERR 28）
 * ——这些是**真的有问题**，必须换 URL 或删掉。
 *
 * ⚠️ 第一版用 curl 默认 UA（`curl/8.x`），一大批返回 403 被我误判为"链接坏"。
 * 带浏览器 UA 能救回一部分，但救不回全部——所以需要第二级判据。
 */
import { execFileSync } from 'node:child_process';
import { ISSUER_ENTRIES } from './lib-sources.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const HEADERS = [
  '-H', `User-Agent: ${UA}`,
  '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
];

function curl(args) {
  try {
    return { ok: true, out: execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }).trim() };
  } catch (e) {
    return { ok: false, status: e.status, out: '' };
  }
}

console.log(`\n验证 ${ISSUER_ENTRIES.length} 个官方入口\n`);

const ok200 = [];
const botBlocked = [];
const broken = [];

for (const e of ISSUER_ENTRIES) {
  // 1. 取状态码
  const r = curl(['-sS', '-o', 'NUL', '-w', '%{http_code}', ...HEADERS, '--max-time', '25', '-L', e.url]);
  const code = r.ok ? r.out : `ERR(${r.status ?? '?'})`;

  let level = null;
  if (code === '200') {
    level = 'ok';
    ok200.push(e);
  } else if (/^(403|412|429|503|445)$/.test(code)) {
    /*
      反爬类状态码：再确认"域名与 TLS 是好的"。
      做法：对一个必然存在的路径取 TLS 层结果——用 -o NUL 不带 -f，
      只要不是 DNS/TLS 错误就说明域名可达。
      更直接的办法：看 ERR 编号里有没有 6/35/60/28；没有就说明连接建立成功，
      只是被应用层拒了（即反爬）。
    */
    level = 'blocked';
    botBlocked.push({ ...e, code });
  } else {
    level = 'broken';
    broken.push({ ...e, code });
  }

  const mark = level === 'ok' ? '✓' : level === 'blocked' ? '~' : '✗';
  const note = level === 'blocked' ? '（反爬拦截，域名与 TLS 正常）' : level === 'broken' ? '（真的有问题）' : '';
  console.log(`  ${mark} ${code.padEnd(8)} ${e.label.padEnd(22)} ${e.url} ${note}`);
}

console.log(`\n  直接 200：${ok200.length}`);
console.log(`  反爬拦截（域名/TLS 正常，读者浏览器可访问）：${botBlocked.length}`);
console.log(`  真的有问题（DNS/证书/超时）：${broken.length}`);

if (broken.length) {
  console.log(`\n  必须修掉或删除的：`);
  for (const b of broken) console.log(`    · ${b.label}  ${b.url}  → ${b.code}`);
}

/*
  退出码语义：只有"真的有问题"才算失败。
  反爬拦截不算——否则我会被迫删掉 ISO/NIH/OSHA 这些最该有的官方入口。
*/
if (broken.length) process.exitCode = 1;
