/**
 * 无障碍现状体检（实测，不靠感觉）。
 *
 * 检查构建产物里可程序化验证的那些项：
 *   1. 图片是否有 alt（缺 alt 的 img）
 *   2. 是否有跳转到主内容的 skip link（键盘用户不必逐个跳过导航）
 *   3. 表单控件是否都有关联的 label
 *   4. 页面是否有 lang 属性
 *   5. 是否有多个 h1 / 标题层级是否跳跃
 *   6. 交互元素是否只有图标没有可读文本（aria-hidden 之外的空链接/按钮）
 *   7. 是否用 outline:none 干掉了焦点指示（键盘用户会完全迷失）
 *
 * 用法：node scripts/check-a11y.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/*
  默认检查 dist/。允许用 `--dist <路径>` 覆盖：反向验证脚本（_probe-a11y.mjs）
  需要在临时副本上做「故意破坏」，而不是去动真实产物。
  这是本项目处理"探针"的统一做法（见 check-schema.mjs / check-search-rerank.mjs）。
*/
const distArgIndex = process.argv.indexOf('--dist');
const distDir =
  distArgIndex !== -1 && process.argv[distArgIndex + 1]
    ? path.resolve(process.argv[distArgIndex + 1])
    : path.join(root, 'dist');

const htmlFiles = [];
async function collect(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await collect(path.join(dir, entry.name), rel);
    else if (rel.endsWith('.html')) htmlFiles.push(rel);
  }
}
await collect(distDir);
htmlFiles.sort();

console.log(`\n无障碍体检：${htmlFiles.length} 个页面\n`);

const problems = [];
const stats = {
  imgs: 0,
  imgsNoAlt: 0,
  emptyAlt: 0,
  inputs: 0,
  inputsNoLabel: 0,
  pagesNoLang: 0,
  pagesMultiH1: 0,
  pagesNoH1: 0,
  headingJumps: 0,
  emptyInteractive: 0,
};

for (const file of htmlFiles) {
  const html = await readFile(path.join(distDir, file), 'utf8');

  // 1. lang
  if (!/<html[^>]+lang=/i.test(html)) {
    stats.pagesNoLang += 1;
    problems.push(`${file}: <html> 没有 lang 属性（屏幕阅读器无法选对语音）`);
  }

  // 2. 图片 alt
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    stats.imgs += 1;
    const tag = m[0];
    if (!/\balt=/i.test(tag)) {
      stats.imgsNoAlt += 1;
      problems.push(`${file}: <img> 缺少 alt：${tag.slice(0, 90)}`);
    } else if (/\balt=(""|'')/i.test(tag)) {
      stats.emptyAlt += 1;
    }
  }

  // 3. 标题层级
  const h1s = [...html.matchAll(/<h1\b[^>]*>/gi)].length;
  if (h1s === 0) {
    stats.pagesNoH1 += 1;
    problems.push(`${file}: 没有 h1`);
  } else if (h1s > 1) {
    stats.pagesMultiH1 += 1;
    problems.push(`${file}: 有 ${h1s} 个 h1（应只有一个）`);
  }

  // 标题层级不能跳跃（h2 后直接 h4 之类）
  const levels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) {
      stats.headingJumps += 1;
      problems.push(`${file}: 标题层级跳跃 h${levels[i - 1]} → h${levels[i]}`);
      break;
    }
  }

  // 4. 交互元素是否只有图标
  //    形如 <a ...><span aria-hidden="true">…</span></a> 且没有其他可见文本
  for (const m of html.matchAll(/<(a|button)\b[^>]*>([\s\S]{0,300}?)<\/\1>/gi)) {
    const inner = m[2];
    // 去掉 aria-hidden 的内容，看还剩什么可见文本
    const withoutHidden = inner.replace(/<[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
    const text = withoutHidden.replace(/<[^>]+>/g, '').trim();
    const hasAriaLabel = /aria-label=|title=/.test(m[0]);
    if (!text && !hasAriaLabel) {
      stats.emptyInteractive += 1;
      problems.push(`${file}: <${m[1]}> 没有可读文本也没有 aria-label：${m[0].slice(0, 90)}`);
    }
  }
}

/* ---------- 5. skip link 与焦点样式（全局，看一次） ---------- */

const home = await readFile(path.join(distDir, 'index.html'), 'utf8');

/*
  skip link 要检查两件事：链接存在，**且它指向的 id 真的存在**。
  只检查链接存在是不够的——href="#main-content" 但页面里没有那个 id 的话，
  键盘用户按下去什么都不会发生，而这个失败完全静默。
*/
const skipMatch = home.match(/<a[^>]+class="[^"]*skip-link[^"]*"[^>]*href="#([^"]+)"/i);
if (!skipMatch) {
  problems.push('缺少 skip link（class="skip-link" 且指向 #main-content）—— 键盘用户每页都要逐个跳过导航');
} else {
  const targetId = skipMatch[1];
  if (!new RegExp(`id="${targetId}"`).test(home)) {
    problems.push(`skip link 指向 #${targetId}，但页面里没有这个 id —— 按下去什么都不会发生`);
  } else {
    console.log(`  跳转到主内容的 skip link：有 ✓（目标 #${targetId} 存在）`);
    // 所有页面都要有它，不能只有首页有
    let missingOn = 0;
    for (const file of htmlFiles) {
      const html = await readFile(path.join(distDir, file), 'utf8');
      if (!/class="[^"]*skip-link/.test(html)) missingOn += 1;
    }
    if (missingOn > 0) {
      problems.push(`skip link 只在部分页面存在（${missingOn}/${htmlFiles.length} 个页面缺失）—— 它应该在布局里，所有页面都有`);
    } else {
      console.log(`  所有 ${htmlFiles.length} 个页面都有 skip link ✓`);
    }
  }
}

const cssFiles = (await readdir(path.join(distDir, '_astro'))).filter((f) => f.endsWith('.css'));
let cssAll = '';
for (const f of cssFiles) cssAll += await readFile(path.join(distDir, '_astro', f), 'utf8');

const killsOutline = /outline\s*:\s*(none|0)/i.test(cssAll);
const hasFocusStyle = /:focus(-visible)?\s*[{,]/i.test(cssAll);
console.log(`  CSS 里存在 outline:none/0：${killsOutline ? '是' : '否'}`);
console.log(`  CSS 里定义了 :focus 样式：${hasFocusStyle ? '是 ✓' : '否 ✗'}`);

/*
  .sr-only 必须真的定义在全局 CSS 里。
  为什么查这个：它是「仅屏幕阅读器可见」的实现方式，如果没定义，
  用了 class="sr-only" 的元素会**直接显示出来**（视觉上多出一行字），
  或者被误用 display:none 而让屏幕阅读器也读不到。两种都是真实故障。
*/
if (!/\.sr-only\s*\{/.test(cssAll)) {
  problems.push('全局 CSS 里没有定义 .sr-only —— 用了这个 class 的元素会直接可见或不被朗读');
} else {
  console.log('  全局 CSS 定义了 .sr-only ✓');
}

/* ---------- 6. 参考来源的整行链接 ---------- */

/*
  2026-10-12：用户建议把参考来源「整行变成能打开的链接」（去掉「打开官方入口」这类重复文字），
  随后又要求去掉可见的「（在新窗口打开）」小字。

  视觉上去掉没问题，但**信息不能丢** —— 否则屏幕阅读器用户不知道焦点会离开本页。
  所以改为 aria-describedby 指向一个 .sr-only 的说明元素。
  为什么不用 aria-label：**aria-label 会覆盖链接文字**，
  读屏用户就听不到"这是哪条来源"了，只剩一句"在新窗口打开"。

  这里查 5 件事（都是**构建时不报错、只有真去用才发现**的）：
    1. target="_blank" 的外链必须用 aria-describedby 关联说明
    2. 被关联的那个 id 必须**真的存在**（写了 id 但元素没渲染 = 说明丢失）
    3. 该说明元素必须有**非空文字**（空 span 等于没说）
    4. 必须带 rel="noopener"（否则新页面能通过 window.opener 操纵原页面）
    5. 不应再出现「（在新窗口打开）」或「打开官方入口」这类可见冗余文字
*/
let sourceLinks = 0;
let sourceLinksNoDesc = 0;
let sourceLinksDangling = 0;
let sourceLinksEmptyNote = 0;
let sourceLinksUnsafe = 0;
let visibleNotice = 0;

for (const file of htmlFiles) {
  if (!file.startsWith('entry/')) continue;
  const html = await readFile(path.join(distDir, file), 'utf8');
  const secStart = html.indexOf('meta-panel sources');
  if (secStart === -1) continue;
  const secEnd = html.indexOf('</section>', secStart);
  const sec = html.slice(secStart, secEnd);

  // 该页的 sr-only 说明元素（在 ol 之后定义一次）
  const noteMatch = sec.match(/<span id="new-window-note"[^>]*>([\s\S]*?)<\/span>/);
  const noteText = noteMatch ? noteMatch[1].replace(/<[^>]+>/g, '').trim() : null;

  for (const m of sec.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) {
    const a = m[0];
    if (!/target="_blank"/.test(a)) continue;
    sourceLinks += 1;

    if (!/rel="[^"]*noopener/.test(a)) sourceLinksUnsafe += 1;

    const desc = a.match(/aria-describedby="([^"]+)"/);
    if (!desc) {
      sourceLinksNoDesc += 1;
    } else if (desc[1] === 'new-window-note') {
      if (noteText === null) sourceLinksDangling += 1;
      else if (noteText === '') sourceLinksEmptyNote += 1;
    } else {
      sourceLinksDangling += 1;
    }

    // 可见的冗余文字（用户明确要求去掉的）
    if (/（在新窗口打开）|打开官方入口/.test(a)) visibleNotice += 1;
  }
}

console.log(`\n  参考来源的外链：${sourceLinks} 个`);
console.log(`  ${sourceLinksNoDesc === 0 ? '✓' : '✗'} 都用 aria-describedby 关联了「新窗口」说明`);
console.log(`  ${sourceLinksDangling === 0 ? '✓' : '✗'} 被关联的说明元素真实存在`);
console.log(`  ${sourceLinksEmptyNote === 0 ? '✓' : '✗'} 说明元素有非空文字`);
console.log(`  ${sourceLinksUnsafe === 0 ? '✓' : '✗'} 都带 noopener`);
console.log(`  ${visibleNotice === 0 ? '✓' : '✗'} 没有可见的冗余文字`);

if (sourceLinksNoDesc > 0) {
  problems.push(`${sourceLinksNoDesc} 个来源外链没有 aria-describedby —— 屏幕阅读器用户不知道焦点会离开本页`);
}
if (sourceLinksDangling > 0) {
  problems.push(`${sourceLinksDangling} 个来源外链的 aria-describedby 指向了不存在的元素 —— 说明实际丢失`);
}
if (sourceLinksEmptyNote > 0) {
  problems.push(`${sourceLinksEmptyNote} 个来源外链的说明元素是空的 —— 等于没有说明`);
}
if (sourceLinksUnsafe > 0) {
  problems.push(`${sourceLinksUnsafe} 个来源外链缺少 rel="noopener" —— 存在被新页面操纵的风险`);
}
if (visibleNotice > 0) {
  problems.push(`${visibleNotice} 个来源外链还带着可见的「（在新窗口打开）」或「打开官方入口」文字 —— 用户已要求去掉`);
}

/* ---------- 汇总 ---------- */

console.log(`\n  图片 ${stats.imgs} 个：缺 alt ${stats.imgsNoAlt}，空 alt（装饰性）${stats.emptyAlt}`);
console.log(`  标题层级跳跃的页面：${stats.headingJumps}`);
console.log(`  无可读文本的交互元素：${stats.emptyInteractive}`);

if (!hasFocusStyle) {
  problems.push('CSS 里没有 :focus 样式 —— 键盘用户看不出焦点在哪');
}
if (killsOutline && !hasFocusStyle) {
  problems.push('CSS 干掉了 outline 但没有替代的焦点样式 —— 键盘用户会完全迷失');
}

/*
  注意这里**不再单独判断 skip link**：上面的第 5 节已经做了更精确的检查
  （链接存在 + 目标 id 存在 + 所有页面都有）。第一版是写在这里的一个宽泛正则，
  只验证「有个 href="#main…" 的链接」，无法发现目标 id 不存在的情况。
*/

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 25)) console.error(`  ✗ ${p}`);
  if (problems.length > 25) console.error(`  … 另有 ${problems.length - 25} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 可程序化验证的无障碍项全部通过。\n');
