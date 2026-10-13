/**
 * 向 IndexNow 提交 URL，让 Bing / Yandex / Seznam / Naver 等尽快重新抓取。
 *
 * 为什么要做：部署了新内容之后，搜索引擎不会立刻知道。等它自己来爬可能几天到几周。
 * IndexNow 是一次主动通知，协议由 Microsoft/Yandex 等共同支持，
 * **不需要注册账号、不需要 API key**——只在站点根目录放一个密钥文件证明所有权即可。
 *
 * ⚠️ 前提条件（否则提交会被拒）：
 *   1. 密钥文件必须能通过 `https://<host>/<key>.txt` 访问，内容是密钥本身。
 *      所以本脚本**会先在线验证这个文件**，不通过就直接退出。
 *   2. 提交的 URL 必须与密钥文件的 host 同源。
 *
 * 用法：
 *   node scripts/submit-indexnow.mjs              # 先校验密钥文件，再提交全部 URL
 *   node scripts/submit-indexnow.mjs --dry-run    # 只列出将要提交的 URL
 *   node scripts/submit-indexnow.mjs --limit 10   # 只提交前 10 条（试跑用）
 *
 * ⚠️ 本机网络实测：Node 的 fetch 在这个链路上会失败（见 HANDOFF 的坑清单），
 *    所以 HTTP 请求统一走 curl，并带重试。
 */

import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const publicDir = path.join(root, 'public');
const keyFile = path.join(root, 'scripts', '.indexnow-key');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? Number(args[limitIndex + 1]) : 0;

/* ---------- 读取密钥 ---------- */

let key;
try {
  key = (await readFile(keyFile, 'utf8')).trim();
} catch {
  console.error('\n[X] 找不到密钥文件 scripts/.indexnow-key');
  console.error('    先生成：见 HANDOFF 里「IndexNow」一节的步骤。\n');
  process.exit(1);
}

if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
  console.error(`\n[X] 密钥格式不合法（应为 8–128 位 a-z0-9 和短横线）：${key}\n`);
  process.exit(1);
}

/* ---------- 确认密钥文件在构建产物里 ---------- */

const builtKeyFile = path.join(distDir, `${key}.txt`);
const builtContent = await readFile(builtKeyFile, 'utf8').catch(() => null);
if (builtContent === null) {
  console.error(`\n[X] dist/${key}.txt 不存在 —— 密钥文件没有被构建进产物。`);
  console.error('    检查 public/ 下是否有这个文件，以及是否跑过构建。\n');
  process.exit(1);
}
if (builtContent.trim() !== key) {
  console.error(`\n[X] dist/${key}.txt 的内容与密钥不一致。`);
  console.error(`    文件内容："${builtContent.trim()}"，期望："${key}"\n`);
  process.exit(1);
}
console.log(`\nIndexNow 密钥：${key}`);
console.log(`  密钥文件：dist/${key}.txt（内容一致 ✓）`);

/* ---------- 从 sitemap 收集 URL ---------- */

const sitemap = await readFile(path.join(distDir, 'sitemap-0.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

if (urls.length === 0) {
  console.error('\n[X] 从 dist/sitemap-0.xml 里没读到任何 URL\n');
  process.exit(1);
}

const origin = new URL(urls[0]).origin;

// 同源检查：协议要求提交的 URL 必须与密钥文件同源
const offOrigin = urls.filter((u) => new URL(u).origin !== origin);
if (offOrigin.length) {
  console.error(`\n[X] 有 ${offOrigin.length} 个 URL 与密钥文件不同源（首个：${offOrigin[0]}）\n`);
  process.exit(1);
}

/*
  robots.txt 里 Disallow 的路径不应提交——提交一个被自己 robots 屏蔽的 URL 是自相矛盾的，
  也可能被视为无效提交。这里按 robots.txt 的规则过滤掉。
*/
const robots = await readFile(path.join(distDir, 'robots.txt'), 'utf8');
const disallow = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
const blocked = urls.filter((u) => disallow.some((d) => new URL(u).pathname.startsWith(d)));
const submittable = urls.filter((u) => !blocked.some((b) => b === u));

console.log(`  sitemap 共 ${urls.length} 条 URL`);
if (blocked.length) {
  console.log(`  按 robots.txt 过滤掉 ${blocked.length} 条（${disallow.join(' ')}）`);
}
console.log(`  将提交 ${submittable.length} 条`);

const finalUrls = limit > 0 ? submittable.slice(0, limit) : submittable;

if (dryRun) {
  console.log('\n--dry-run，实际不提交。将提交以下 URL：');
  for (const u of finalUrls) console.log(`  · ${u}`);
  process.exit(0);
}

/* ---------- 用 curl 发请求（带重试） ---------- */

async function curl(url, extraArgs = []) {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      ['-sS', '--max-time', '60', '--retry', '3', '--retry-all-errors', ...extraArgs, url],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
    return { ok: true, out: stdout };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}` };
  }
}

/* ---------- 先在线验证密钥文件真的能访问 ---------- */

const keyUrl = `${origin}/${key}.txt`;
console.log(`\n在线校验密钥文件：${keyUrl}`);
const keyCheck = await curl(keyUrl, ['-o', '-', '-w', '\n%{http_code}']);
if (!keyCheck.ok) {
  console.error('\n[X] 无法访问密钥文件。请先部署 dist.zip（含该密钥文件），再运行本脚本。');
  console.error(`    curl 输出：${keyCheck.out.slice(0, 300)}\n`);
  process.exit(1);
}
const lines = keyCheck.out.trim().split('\n');
const status = lines[lines.length - 1].trim();
const body = lines.slice(0, -1).join('\n').trim();
console.log(`  HTTP ${status}，返回内容："${body.slice(0, 80)}"`);
if (status !== '200') {
  console.error(`\n[X] 密钥文件返回 ${status}，应为 200。请确认已部署 dist.zip。\n`);
  process.exit(1);
}
if (body !== key) {
  console.error(`\n[X] 密钥文件内容不匹配：线上是 "${body.slice(0, 80)}"，本地是 "${key}"\n`);
  process.exit(1);
}
console.log('  密钥文件在线可访问且内容正确 ✓');

/* ---------- 提交 ---------- */

// IndexNow 的 POST 批量上限是 10000 条；分批更稳妥，也便于看每批结果
const BATCH = 100;
let submitted = 0;
let failed = 0;

console.log(`\n开始提交（每批 ${BATCH} 条）…`);
for (let i = 0; i < finalUrls.length; i += BATCH) {
  const batch = finalUrls.slice(i, i + BATCH);
  const payload = JSON.stringify({
    host: new URL(origin).host,
    key,
    keyLocation: keyUrl,
    urlList: batch,
  });

  const { writeFile, unlink } = await import('node:fs/promises');
  const tmp = path.join(root, 'scripts', '.indexnow-payload.json');
  await writeFile(tmp, payload, 'utf8');

  const res = await curl('https://api.indexnow.org/indexnow', [
    '-X', 'POST',
    '-H', 'Content-Type: application/json; charset=utf-8',
    '--data-binary', `@${tmp}`,
    '-o', '-',
    '-w', '\n%{http_code}',
  ]);
  await unlink(tmp).catch(() => {});

  const outLines = res.out.trim().split('\n');
  const code = outLines[outLines.length - 1].trim();
  const text = outLines.slice(0, -1).join(' ').trim();

  /*
    IndexNow 的响应码含义：
      200 提交成功；202 已接受（待验证密钥）；400 请求格式错；403 密钥无效；
      422 URL 与 host 不匹配或全部无效；429 提交过于频繁。
  */
  const okCodes = ['200', '202'];
  if (!res.ok || !okCodes.includes(code)) {
    failed += batch.length;
    console.error(`  批次 ${i / BATCH + 1}：失败（HTTP ${code || '无响应'}）${text.slice(0, 200)}`);
  } else {
    submitted += batch.length;
    console.log(`  批次 ${i / BATCH + 1}：${code} —— 已提交 ${batch.length} 条`);
  }
}

console.log(`\n[OK] 提交完成：成功 ${submitted} 条，失败 ${failed} 条`);
if (failed > 0) {
  console.log('     失败通常是密钥文件未部署或内容不匹配，先确认线上能访问密钥文件。');
}
console.log('');
process.exitCode = failed > 0 ? 1 : 0;
