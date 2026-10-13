/**
 * 移动端截图：用**同源 iframe** 在真实窄视口下渲染并截图。
 *
 * ## ⚠️ 为什么不能用 `--window-size=390`
 *
 * 无头 Edge 有约 **500px 的最小视口宽度** —— `--window-size=390` 会被忽略，
 * 但 `--screenshot` 仍按 390px **裁切**。结果看起来"右侧被切掉"，
 * 很容易被误判成**页面横向溢出**。
 *
 * 这不是假设，是实测的：一个对照页在请求 390px 时报告
 * `innerWidth = 504 / devicePixelRatio = 1`。
 *
 * **我一开始就据此判定「移动端导航被截断」并准备改 CSS —— 差点修一个不存在的 bug。**
 * 教训：**截图工具的边界会伪装成页面的 bug**，动手前必须用对照实验确认
 * "到底是页面溢出，还是工具在裁切"。
 *
 * ## 正确做法
 * 把页面放进一个**指定宽度的 iframe**。iframe 是独立视口，宽度由 CSS 决定，
 * 不受窗口下限影响；wrapper 与目标页同源（都从本地服务器取），
 * 所以能读 iframe 内部的 `scrollWidth` 来**验证确实没有溢出**。
 *
 * 用法：node scripts/shoot-mobile.mjs
 * 输出：handoff/移动端截图/*.png
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const outDir = path.join(root, '..', 'handoff', '移动端截图');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

/** 手机逻辑像素。320 是仍在使用的窄机型下限，用来当压力测试。 */
const VIEWPORTS = [
  { name: 'phone', w: 390, h: 1500 },
  { name: 'phone-small', w: 320, h: 1400 },
];

const PAGES = [
  { slug: 'home', url: '/' },
  { slug: 'browse', url: '/browse/' },
  { slug: 'entry-acne-care', url: '/entry/acne-care/' },
  { slug: 'entry-earplugs', url: '/entry/earplugs/' },
  { slug: 'topic-index', url: '/topic/' },
  { slug: 'search', url: '/search/' },
];

/* ---------- 静态服务器（子进程，理由见 lib-static-server.mjs） ---------- */
const server = spawn(process.execPath, ['scripts/lib-static-server.mjs', dist], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('服务器启动超时')), 20000);
  server.stdout.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/PORT=(\d+)/);
    if (m) { clearTimeout(t); resolve(m[1]); }
  });
});
const origin = `http://127.0.0.1:${port}`;
console.log(`本地服务器: ${origin}`);

/**
 * wrapper 页：iframe 宽 = 目标视口宽；测量结果写进可见文字，
 * 这样 `--dump-dom` 能读到（无头模式下 JS 注入不可靠，但页面自己的脚本会执行）。
 */
function wrapperHtml(pageUrl, w, h) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#8a8a8a}
  iframe{width:${w}px;height:${h}px;border:0;display:block;margin:0 auto;background:#fff}
  #out{position:fixed;left:0;bottom:0;background:#000;color:#0f0;font:11px monospace;padding:2px 4px;z-index:9}
</style></head><body>
<iframe id="f" src="${pageUrl}"></iframe>
<div id="out">WAITING</div>
<script>
(function(){
  var f = document.getElementById('f');
  f.addEventListener('load', function(){
    setTimeout(function(){
      try{
        var w = f.contentWindow, d = f.contentDocument, de = d.documentElement;
        var res = { innerW: w.innerWidth, docScrollW: de.scrollWidth,
                    bodyScrollW: d.body.scrollWidth, overflow: de.scrollWidth - w.innerWidth };
        var wide = [];
        var all = d.querySelectorAll('body *');
        for (var i = 0; i < all.length; i++){
          var r = all[i].getBoundingClientRect();
          if (r.width > w.innerWidth + 1){
            var cls = (typeof all[i].className === 'string' && all[i].className) ? '.' + all[i].className.trim().split(/\\s+/).join('.') : '';
            wide.push(all[i].tagName.toLowerCase() + cls + ' w=' + Math.round(r.width));
          }
        }
        res.wideCount = wide.length;
        res.wide = wide.slice(0, 6);
        document.getElementById('out').textContent = 'RESULT ' + JSON.stringify(res);
      } catch(e){ document.getElementById('out').textContent = 'ERR ' + e.message; }
    }, 300);
  });
})();
<\/script>
</body></html>`;
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(EDGE, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', () => resolve({ out, err }));
  });
}

/** 窗口必须给足宽度，否则会被 500px 下限裁掉 iframe。 */
const BASE = [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disable-extensions', '--virtual-time-budget=9000', '--window-size=1000,1700',
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

let overflowFound = 0;

for (const vp of VIEWPORTS) {
  console.log(`\n=== ${vp.name}  ${vp.w}×${vp.h} ===`);
  for (const p of PAGES) {
    const fname = `__w_${vp.name}_${p.slug}.html`;
    const inDist = path.join(dist, fname);
    await writeFile(inDist, wrapperHtml(`${origin}${p.url}`, vp.w, vp.h), 'utf8');
    const wrapperUrl = `${origin}/${fname}`;

    const out = path.join(outDir, `${vp.name}-${p.slug}.png`);
    const shot = await run([...BASE, `--screenshot=${out}`, wrapperUrl]);
    const dom = await run([...BASE, '--dump-dom', wrapperUrl]);

    const m = dom.out.match(/RESULT (\{[\s\S]*?\})<\/div>/);
    const err = dom.out.match(/ERR ([^<]*)/);
    let note;
    if (m) {
      const r = JSON.parse(m[1]);
      const bad = r.overflow > 1 || r.wideCount > 0;
      if (bad) overflowFound += 1;
      note = `${bad ? '✗ 有溢出' : '✓ 无溢出'}  innerW=${r.innerW} scrollW=${r.docScrollW} 过宽元素=${r.wideCount}`;
      if (r.wide.length) note += `\n        ${r.wide.join('\n        ')}`;
    } else if (err) {
      note = `测量失败: ${err[1]}`;
    } else {
      note = '（未取到测量结果）';
    }
    const bytes = shot.err.match(/(\d+) bytes/);
    console.log(`  ${bytes ? '✓' : '✗'} ${p.url.padEnd(24)} ${note}`);

    await rm(inDist, { force: true });
  }
}

server.kill();
console.log(`\n截图目录: ${path.relative(root, outDir)}`);
if (overflowFound) {
  console.error(`\n发现 ${overflowFound} 个页面/视口存在横向溢出 —— 需要修页面的 CSS。\n`);
  process.exitCode = 1;
} else {
  console.log('\n✓ 所有检查的页面在 320px 与 390px 下都没有横向溢出。\n');
}
