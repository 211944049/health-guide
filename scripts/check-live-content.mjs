/**
 * 线上内容核验：用「**本地产物里的真实文本**」去线上找，而不是我自己手打的短语。
 *
 * ## 为什么这样设计（这是本脚本存在的全部理由）
 *
 * 2026-10-11 我写了一个一次性脚本做同样的核验，**报了 4 个假警报**：
 *   1. 我搜「沾水不改变清洁力」，但正文实际写的是「至于「沾不沾水」，那是偏好不是规矩」——
 *      **我手打的短语和真正写进内容里的句子不一样**，于是"找不到"被当成"没上线"。
 *   2. 我断言「首页应该有 toothbrush 入口」，**但首页的设计本来就不列词条**
 *      （只列 6 条入口路径 + 专题 + 工具）。所以这个断言从根上就是错的。
 *
 * 结果是：线上其实**逐字节一致**（部署正常），而我的核验却报"发现 4 处不一致"。
 *
 * **这是同一类错误在本项目的第二次**（上一次是 check-search-rerank 的假"回归"）。
 * 共同点：**断言写的是"我以为的内容"，而不是"产物里真实的内容"。**
 *
 * 所以这个脚本的做法是：
 *   · **期望值从本地 dist/ 提取**，不手打。手打的短语会跟内容漂移。
 *   · **不假设页面结构**（比如"首页应该列词条"）。要检查的存在性，从 sitemap 拿。
 *   · 逐页比对**可见文本**（剥脚本/样式/标签后的文本），而不是比对 HTML——
 *     这样能容忍属性顺序、空白、构建哈希的差异，只关注读者真正看到的内容。
 *
 * 用法：node scripts/check-live-content.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isThirdPartyVerification } from './lib/html-files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
/*
  默认用 dist/ 作为"本地基准"。允许 `--dist <路径>` 覆盖，好让反向验证脚本
  在**临时副本**上做"故意改内容"，而不是动真实产物
  —— 与 check-a11y.mjs / check-facts.mjs 同一模式。
*/
const distArgIndex = process.argv.indexOf('--dist');
const distDir =
  distArgIndex !== -1 && process.argv[distArgIndex + 1]
    ? path.resolve(process.argv[distArgIndex + 1])
    : path.join(root, 'dist');

/*
  默认比线上。允许 `--origin <URL>` 覆盖。
  为什么需要它：反向验证「静态资源 404」检测时，必须让"本地基准"和"被抓取的来源"
  是**同一个被改坏的副本**——起一个本地静态服务器、把 origin 指过去，
  才能验出"引用了不存在的文件"这类故障。
  只用 --dist 是验不到的：改了本地产物，但被抓取的还是线上（线上文件是全的），
  检查当然通过。**这个坑我踩过一次**（探针报"没被拦住"，其实是探针无效）。
*/
const originArgIndex = process.argv.indexOf('--origin');
const ORIGIN =
  originArgIndex !== -1 && process.argv[originArgIndex + 1]
    ? process.argv[originArgIndex + 1].replace(/\/$/, '')
    : 'https://costlifehealth.com';

/**
 * 用 curl 抓取（本项目里 Node fetch 在网络不稳时不可靠）。
 *
 * ⚠️ 必须带 `-f`（fail on HTTP error）：否则 404 也会**返回错误页的内容**，
 * 于是"能不能取到"这个判断永远是"能"——我就这么写出过一个假阳性：
 * 用一个确定 404 的文件名做反向验证，检查器照样报「全部可访问」。
 * HTTP ≥400 时 curl -f 退出码非 0，这里统一转成 null（表示"取不到"）。
 */
function get(url) {
  /*
    是否重试。
    默认开（线上偶发抖动时避免假警报）。但**反向验证必须关掉**：
    反向验证要故意制造 404，而 `--retry 3 --retry-all-errors`
    会对每个 404 做指数退避重试——实测把一次检查拖到 10 分钟以上不返回。
  */
  const args = ['-fsS', '--max-time', '60'];
  /*
    带上**浏览器的 Accept 头**。
    为什么：2026-10-12 发生过"服务器正常、用户看到无样式"的事故——
    用户到 Cloudflare 的路径上有代理缓存，它回源拿过一次 404 的 HTML 页，
    之后就把那份 HTML 当成了该 CSS URL 的内容（且**不看 Accept 头**），
    浏览器因为 nosniff 拒绝它 → 整站裸 HTML（连无痕模式也坏，因为缓存在代理里）。
    带上真实的 Accept 能让请求形状更接近浏览器，从而更容易暴露这类中间层差异。
  */
  args.push('-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,text/css,*/*;q=0.1');
  if (!process.argv.includes('--no-retry')) args.push('--retry', '3', '--retry-all-errors');
  args.push('-L', url);
  try {
    return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** 剥掉脚本、样式和标签，只留读者可见的文本；压缩空白以便稳定比较。 */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- 要核验的页面：从本地产物里取，不手写清单 ---------- */

const htmlFiles = [];
async function collect(dir, prefix = '') {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) await collect(path.join(dir, e.name), rel);
    else if (rel.endsWith('.html') && !isThirdPartyVerification(rel)) htmlFiles.push(rel);
  }
}
await collect(distDir);
htmlFiles.sort();

console.log(`\n线上内容核验：本地 ${htmlFiles.length} 个页面，逐页比可见文本\n`);

let mismatched = [];
let unreachable = [];
let identical = 0;

for (const file of htmlFiles) {
  // 本地路径 → URL。dist/entry/x/index.html → /entry/x/
  const urlPath = `/${file.replace(/index\.html$/, '')}`;
  const localText = visibleText(await readFile(path.join(distDir, file), 'utf8'));
  const remote = get(`${ORIGIN}${urlPath}`);

  if (remote === null) {
    unreachable.push(urlPath);
    continue;
  }
  const remoteText = visibleText(remote);
  if (remoteText === localText) {
    identical += 1;
  } else {
    mismatched.push({ urlPath, localLen: localText.length, remoteLen: remoteText.length });
  }
}

/* ---------- 报告 ---------- */

console.log(`  可见文本完全一致：${identical} / ${htmlFiles.length}`);
if (unreachable.length) {
  console.log(`  抓取失败（网络问题，不算内容问题）：${unreachable.length}`);
  for (const u of unreachable.slice(0, 5)) console.log(`    · ${u}`);
}
if (mismatched.length) {
  console.log(`  内容不一致：${mismatched.length}`);
  for (const m of mismatched.slice(0, 10)) {
    console.log(`    · ${m.urlPath}（本地 ${m.localLen} 字符 / 线上 ${m.remoteLen} 字符）`);
  }
}

// 顺带确认这些机制性文件在线（与内容无关，但坏了影响收录）
const infra = ['/robots.txt', '/sitemap-index.xml', '/rss.xml', '/4e1c3656b8d12dc76e51412b0113a32c.txt'];
console.log('');
for (const p of infra) {
  const ok = get(`${ORIGIN}${p}`) !== null;
  console.log(`  ${ok ? '✓' : '✗'} ${p}`);
}

/* ---------- 关键：页面引用的静态资源必须真的能取到 ---------- */

/*
  为什么必须查这个（2026-10-12 真实事故）：
  改了 CSS 之后 Astro 会生成**新的带哈希文件名**，于是部署时如果 HTML 先上去、
  资源文件后上去，中间那段时间页面引用的就是一个还不存在的文件 —— **整站无样式**。
  用户截图里就是这样（HTML 正常、CSS 404）。

  更麻烦的是：这些文件的响应头是 `Cache-Control: public, max-age=31536000, immutable`，
  所以**浏览器会把那次 404 长期记住**，用户可能持续看到无样式的页面，
  即使服务器早已修好。

  而**在此之前所有闸门都抓不到这个失败**：本地构建里文件当然存在，
  逐页比"可见文本"也发现不了（文本照样在，只是没样式）。
  所以必须在**线上**核验这一步。

  做法：从线上 HTML 里抽出所有 `/_astro/...` 引用（CSS 和 JS），逐个请求，
  任何非 200 都算问题。
*/
const assetRefs = new Set();

/*
  ⚠️ 抽查范围必须**显式包含首页**。
  第一版写的是 `htmlFiles.slice(0, 12)`，而 htmlFiles 是排序后的，
  `index.html` 按字母序排在 `404.html` / `about/` / `browse/` / `category/*` 之后
  ——**首页根本不在前 12 个里**。
  结果：我的反向验证特意改坏了首页的 CSS 引用，检查器却看不到，
  于是"没被拦住"，而真正的原因是被抽查的页面集合不对。
  所以这里改成「首页 + 前 12 个其它页面」，并按需去重。
*/
const sample = ['index.html', ...htmlFiles.filter((f) => f !== 'index.html').slice(0, 12)];

for (const file of sample) {
  const urlPath = `/${file.replace(/index\.html$/, '')}`;
  const html = get(`${ORIGIN}${urlPath}`);
  if (!html) continue;
  for (const m of html.matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)) {
    assetRefs.add(m[1]);
  }
}

console.log(`\n  页面引用的静态资源：${assetRefs.size} 个（抽查首页 + ${sample.length - 1} 个页面）`);
const missingAssets = [];
for (const ref of assetRefs) {
  const res = get(`${ORIGIN}${ref}`);
  if (res === null) missingAssets.push(ref);
}
if (missingAssets.length) {
  console.log(`  ✗ 取不到的引用：${missingAssets.length}`);
  for (const m of missingAssets.slice(0, 10)) console.log(`    · ${m}`);
} else if (assetRefs.size > 0) {
  console.log('  ✓ 全部可访问（CSS/JS 没有 404）');
}

// CSS 至少要被引用到一个——完全没有样式引用本身就是故障
if (assetRefs.size === 0) {
  console.log('  ✗ 线上 HTML 里没有任何 /_astro/ 资源引用 —— 样式或脚本没被引用，页面会是无样式的');
}

const bad =
  mismatched.length +
  infra.filter((p) => get(`${ORIGIN}${p}`) === null).length +
  missingAssets.length +
  (assetRefs.size === 0 ? 1 : 0);
if (bad > 0) {
  console.error(
    `\n发现 ${bad} 个问题 —— 线上可能落后于本地构建。` +
      '\n  如果是静态资源 404：多半是**部署时 HTML 先于资源文件上传**，' +
      '\n  请确认 dist/_astro/ 里的文件都已上传，然后强刷（Ctrl+Shift+R）再看。\n',
  );
  process.exit(1);
}
if (unreachable.length > 0) {
  console.log('\n⚠️ 有页面抓取失败。网络不稳时会这样，**不能据此判定内容不一致**，建议重跑。\n');
  process.exit(2);
}
console.log('\n✓ 线上可见文本与本地构建完全一致，机制性文件与静态资源都正常。\n');
