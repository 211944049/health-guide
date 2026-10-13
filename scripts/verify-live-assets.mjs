/**
 * 反向验证 `check-live-content.mjs` 的「静态资源 404」检测。
 *
 * ## 为什么这是一个**长期保留**的脚本（而不是一次性探针）
 * 2026-10-12 发生了一次真实事故：我改了 CSS → Astro 生成新的哈希文件名
 * → 部署时 HTML 先上传、资源文件后上传 → 中间那段时间**整站无样式**（用户截图确认）。
 * 更麻烦的是这些文件带 `Cache-Control: immutable`（一年），
 * **浏览器会把那次 404 长期记住**。
 *
 * 而在此之前**所有闸门都抓不到这个失败**：本地构建里文件当然存在，
 * 逐页比"可见文本"也发现不了（文本照样在，只是没样式）。
 * 所以我给 `check-live-content.mjs` 加了资源检查——而加了检查就必须证明它真的在测东西。
 * 这个脚本就是那个证明，**每次改动 check-live-content.mjs 的资源检查后都应重跑它**。
 *
 * ## 这个验证改过三版，前两版完全测不到东西 —— 三次教训
 * 1. **只改本地副本、`--dist` 指过去** → 资源检查是去 ORIGIN（线上）取文件的，
 *    线上有真 CSS，照样通过。→ 所以给检查器加了 `--origin`。
 * 2. **本地服务器跑在同一进程里** → 主脚本用 `execFileSync`（阻塞事件循环），
 *    服务器永远排不上队 → **死锁**，两次各卡 10 分钟。→ 服务器改为子进程。
 * 3. **抽查页面集合漏了首页** → 检查器当时写的是 `htmlFiles.slice(0, 12)`，
 *    而排序后 `index.html` 排在第 13 位之后，**首页根本不在抽查范围内**；
 *    我特意改坏首页的 CSS 引用，检查器却看不到。→ 抽查范围改成「首页 + 12 个页面」。
 *
 * 用法：node scripts/verify-live-assets.mjs
 */

import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const realDist = path.join(root, 'dist');

/** 在独立子进程里起静态服务器（原因见 lib-static-server.mjs 的注释）。 */
function startServer(dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/lib-static-server.mjs', dir], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('静态服务器启动超时'));
    }, 20000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/PORT=(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ origin: `http://127.0.0.1:${m[1]}`, close: () => child.kill() });
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function makeDist(breakIt) {
  const dir = await mkdtemp(path.join(tmpdir(), 'live-asset-'));
  const dist = path.join(dir, 'dist');
  await cp(realDist, dist, { recursive: true });
  let fake = null;
  if (breakIt) {
    const p = path.join(dist, 'index.html');
    const h = await readFile(p, 'utf8');
    const m = h.match(/\/_astro\/[A-Za-z0-9._-]+\.css/);
    if (!m) throw new Error('本地首页里找不到 CSS 引用');
    fake = '/_astro/BaseLayout.NOTEXIST000.css';
    await writeFile(p, h.replace(m[0], fake), 'utf8');
  }
  return { dir, dist, fake };
}

/** 跑检查器，返回 { failed, out }。用 --no-retry 避免对故意制造的 404 反复退避。 */
function runChecker(dist, origin) {
  try {
    const out = execFileSync(
      'node',
      ['scripts/check-live-content.mjs', '--dist', dist, '--origin', origin, '--no-retry'],
      { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 },
    );
    return { failed: false, out };
  } catch (e) {
    return { failed: true, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

console.log('\n反向验证：check-live-content.mjs 的静态资源 404 检测\n');

/* ---------- 探针：改坏首页的 CSS 引用 ---------- */
const broken = await makeDist(true);
console.log(`  改坏：首页的 CSS 引用换成 ${broken.fake}`);
const brokenServer = await startServer(broken.dist);
const r1 = runChecker(broken.dist, brokenServer.origin);
const caught = /取不到的引用/.test(r1.out);
console.log(
  `  ${r1.failed && caught ? '✓' : '✗'} 校验器${r1.failed ? '失败了' : '没失败'}，${caught ? '报出「取不到的引用」' : '没报出'}`,
);
if (!caught) {
  for (const l of r1.out.split('\n').filter((x) => x.includes('静态资源') || x.includes('✗')).slice(0, 4)) {
    console.log('    ', l.trim());
  }
}
brokenServer.close();
await rm(broken.dir, { recursive: true, force: true });

/* ---------- 基线：不改坏应当通过（证明不是"总是报错"） ---------- */
const clean = await makeDist(false);
const cleanServer = await startServer(clean.dist);
const r0 = runChecker(clean.dist, cleanServer.origin);
console.log(`  ${!r0.failed ? '✓' : '✗'} 基线（未改坏）：${r0.failed ? '失败（不该失败）' : '通过，不误报'}`);
if (r0.failed) {
  for (const l of r0.out.split('\n').filter((x) => x.includes('✗')).slice(0, 4)) console.log('    ', l.trim());
}
cleanServer.close();
await rm(clean.dir, { recursive: true, force: true });

const ok = r1.failed && caught && !r0.failed;
console.log(ok ? '\n✓ 反向验证通过：资源 404 能被抓住，且不误报。\n' : '\n[X] 反向验证失败。\n');
process.exitCode = ok ? 0 : 1;
