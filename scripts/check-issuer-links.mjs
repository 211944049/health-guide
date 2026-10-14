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
 *
 * ## ⚠️ 第三级：本机无法检查证书吊销（2026-10-13 加）
 *
 * 实测发现 `ERR(35)` 有两种**完全不同**的原因，而第一版把它们混为一谈：
 *
 *   · `CRYPT_E_REVOCATION_OFFLINE (0x80092013)` —— Windows schannel 连不上
 *     CA 的 OCSP/CRL 端点，**这是本机的限制，不是站点的问题**。
 *     实测：`aad.org`、`acog.org`、`cma.org.cn`、`nmpa.gov.cn` 等 6 个站
 *     都报这个错，但加 `--ssl-no-revoke` 后全部返回 200 且**有真实内容**
 *     （检查过 title 与正文关键词，不是错误页）。
 *   · 真正的 TLS 握手失败（协议不匹配、证书过期/域名不符）—— 那才是链接坏。
 *
 * 所以现在：遇到 `CRYPT_E_REVOCATION_OFFLINE` 时**用 `--ssl-no-revoke` 重试一次**，
 * 以重试结果为准，并在输出里**如实标注**这次判定跳过了吊销检查。
 *
 * > **为什么这是修正而不是放水**：这个脚本要回答的问题是
 * > 「读者点这个链接能不能打开」。本机 curl 的吊销检查失败**不改变**答案，
 * > 而按原来的判据会把它报成"真的有问题"，从而**误删合法来源**
 * > —— 我差点因此放弃全部中医机构来源。
 *
 * ## ⚠️ 第四个坑：curl 非零退出时会丢掉 stdout（2026-10-13 修）
 *
 * 上面那条改完还剩 2 个报 `ERR(28)` 的，我以为"真的坏了"。实测强制 IPv4 后：
 *
 *     sleepeducation.org  → HTTP 200，收到 485 KB
 *     eadv.org            → HTTP 200，收到 174 KB
 *
 * **站点是好的**，`ERR(28)` 只是因为服务器**保持连接不关闭**，
 * curl 等不到连接结束就超时了 —— 但**状态码早就拿到了**。
 *
 * 根因：`execFileSync` 在 curl 非零退出时**抛异常**，而 `%{http_code}`
 * 是写在 **stdout** 里的，一抛异常就被丢掉了。
 * 改用 `spawnSync`（不抛异常）就能同时拿到 stdout、stderr 和退出码。
 *
 * 所以现在的判据是：**以 HTTP 状态码为准，curl 退出码只作兜底。**
 * `%{http_code}` 为 `000` 才说明真的没连上。
 */
import { spawnSync } from 'node:child_process';
import { ISSUER_ENTRIES } from './lib-sources.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const HEADERS = [
  '-H', `User-Agent: ${UA}`,
  '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
];

/**
 * 跑一次 curl。**不抛异常**，所以退出码非零时仍能拿到 stdout。
 *
 * ⚠️ 这里是关键：原来的 `execFileSync` 版本在 curl 超时（exit 28）时抛异常，
 * 把已经拿到的 `%{http_code}`（200）一起丢了，于是把好站点报成坏的。
 */
function curl(args) {
  const r = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  return {
    status: r.status,
    out: (r.stdout ?? '').trim(),
    err: (r.stderr ?? ''),
  };
}

/** 从 curl 结果里取状态码；拿不到就是 ERR(退出码)。 */
function codeOf(r) {
  if (/^\d{3}$/.test(r.out) && r.out !== '000') return r.out;
  return `ERR(${r.status ?? '?'})`;
}

/** 本机 schannel 无法完成证书吊销检查（不是站点的问题）。 */
function isRevocationFailure(r) {
  return codeOf(r).startsWith('ERR') && /CRYPT_E_REVOCATION_OFFLINE|revocation/i.test(r.err ?? '');
}

console.log(`\n验证 ${ISSUER_ENTRIES.length} 个官方入口\n`);

const ok200 = [];
const botBlocked = [];
const broken = [];
const skippedRevocationCheck = [];
const slowButOk = [];

for (const e of ISSUER_ENTRIES) {
  // 1. 取状态码
  const base = ['-sS', '-o', 'NUL', '-w', '%{http_code}', ...HEADERS, '--max-time', '25', '-L'];
  let r = curl([...base, e.url]);
  let code = codeOf(r);
  let revocationSkipped = false;

  /*
    本机无法校验证书吊销时重试。判据用重试结果，但**记住这次跳过**，
    输出里明确标出来 —— 不静默降级。
  */
  if (isRevocationFailure(r)) {
    const r2 = curl([...base, '--ssl-no-revoke', e.url]);
    if (!codeOf(r2).startsWith('ERR')) {
      r = r2;
      code = codeOf(r2);
      revocationSkipped = true;
      skippedRevocationCheck.push({ ...e, code });
    }
  }

  let level = null;
  if (code === '200') {
    level = 'ok';
    ok200.push(e);
    /*
      记录"拿到了 200 但 curl 仍然超时"的情况：服务器保持连接不关闭。
      这不是问题（内容已经拿到了），但值得在输出里区分出来，
      因为下次看到 ERR(28) 时不该再误判成"站点坏了"。
    */
    if (r.status !== 0) slowButOk.push({ ...e, status: r.status });
  } else if (/^(403|412|429|503|445)$/.test(code)) {
    /*
      反爬类状态码：域名与 TLS 都是好的，只是被应用层拒了。
      这类不算失败 —— 否则会丢掉 ISO/NIH/OSHA 这些最该有的官方入口。
    */
    level = 'blocked';
    botBlocked.push({ ...e, code });
  } else {
    level = 'broken';
    broken.push({ ...e, code });
  }

  const mark = level === 'ok' ? '✓' : level === 'blocked' ? '~' : '✗';
  const note =
    level === 'blocked'
      ? '（反爬拦截，域名与 TLS 正常）'
      : level === 'broken'
        ? '（真的有问题）'
        : revocationSkipped
          ? '（本机无法校验证书吊销，已跳过该项重试）'
          : '';
  console.log(`  ${mark} ${code.padEnd(8)} ${e.label.padEnd(22)} ${e.url} ${note}`);
}

console.log(`\n  直接 200：${ok200.length}`);
console.log(`  反爬拦截（域名/TLS 正常，读者浏览器可访问）：${botBlocked.length}`);
console.log(`  真的有问题（DNS/证书/超时）：${broken.length}`);
if (skippedRevocationCheck.length) {
  console.log(`  其中 ${skippedRevocationCheck.length} 个跳过了本机的证书吊销检查（站点本身可达）：`);
  for (const s of skippedRevocationCheck) console.log(`    · ${s.label}  ${s.url}`);
}
if (slowButOk.length) {
  console.log(`  其中 ${slowButOk.length} 个拿到了 200 但连接未正常关闭（服务器 keep-alive，不影响可用性）：`);
  for (const s of slowButOk) console.log(`    · ${s.label}  ${s.url}  curl 退出码 ${s.status}`);
}

if (broken.length) {
  console.log(`\n  必须修掉或删除的：`);
  for (const b of broken) console.log(`    · ${b.label}  ${b.url}  → ${b.code}`);
}

/*
  退出码语义：只有"真的有问题"才算失败。
  · 反爬拦截不算 —— 否则会丢掉 ISO/NIH/OSHA 这些最该有的入口。
  · 跳过吊销检查不算 —— 那是本机限制。
  · 拿到 200 但连接未关闭不算 —— 状态码才是判据。
*/
if (broken.length) process.exitCode = 1;
