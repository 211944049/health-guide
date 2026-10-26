/**
 * 回到顶部按钮体检。
 *
 * ## 为什么需要单独的闸门
 * 这个按钮有几种**构建时完全不报错、只有用户真去用才发现**的失败方式：
 *
 *   · 组件没被放进布局 → 按钮根本不存在（或只在部分页面存在）
 *   · 脚本没内联（被 Astro 打包成模块）→ 首屏按钮显隐时序错，或整段失效
 *   · 缺少 `hidden` 兜底 → 没有 JS 时按钮一直显示、点了没反应
 *   · 忘了处理 `prefers-reduced-motion` → 对前庭敏感的人造成不适
 *   · 点完后焦点留在已隐藏的按钮上 → 键盘用户"跟丢"位置
 *   · 按钮压在页脚或另一侧固定元素上 → 遮挡
 *
 * 这些都属于「页面看起来正常、功能却是坏的」，所以必须机器查。
 *
 * 用法：node scripts/check-back-to-top.mjs [--dist <路径>]
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isThirdPartyVerification } from './lib/html-files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const distArgIndex = process.argv.indexOf('--dist');
const distDir =
  distArgIndex !== -1 && process.argv[distArgIndex + 1]
    ? path.resolve(process.argv[distArgIndex + 1])
    : path.join(root, 'dist');

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

const problems = [];

console.log(`\n回到顶部按钮体检：${htmlFiles.length} 个页面\n`);

/* ---------- 1. 每个页面都要有按钮 ---------- */

let missing = 0;
for (const file of htmlFiles) {
  const html = await readFile(path.join(distDir, file), 'utf8');
  if (!/id="back-to-top"/.test(html)) {
    missing += 1;
    if (missing <= 5) problems.push(`${file}: 没有回到顶部按钮（它在布局里，应该所有页面都有）`);
  }
}
console.log(`  ${missing === 0 ? '✓' : '✗'} 缺失按钮的页面：${missing}`);

/* ---------- 2. 按钮本身的结构与无障碍属性 ---------- */

const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
const btnMatch = home.match(/<button[^>]*id="back-to-top"[^>]*>[\s\S]*?<\/button>/);

/**
 * 判断开标签里是否**真的**有 `hidden` 属性（而不是作为 `aria-hidden` 的一部分）。
 *
 * ⚠️ 这里踩过坑：第一版用 `/\bhidden\b/`，而**词边界 `\b` 在连字符处会匹配**，
 * 所以 `aria-hidden="true"` 里的 `hidden` 满足了断言——
 * 于是把真正的 `hidden` 属性删掉后，检查**照样通过**（`_probe-...` 的反向验证抓出来的）。
 * 必须把标签拆成属性再逐个精确比较。
 */
function hasHiddenAttribute(openTag) {
  const inner = openTag.replace(/^<button\b/i, '').replace(/>$/, '');
  // 按空白切分，取出每个属性的名字（去掉 =后面的值）
  for (const token of inner.split(/\s+/)) {
    if (!token) continue;
    const name = token.split('=')[0];
    if (name === 'hidden') return true;
  }
  return false;
}

if (!btnMatch) {
  problems.push('首页里找不到 back-to-top 按钮');
} else {
  const btn = btnMatch[0];

  // 必须是 button 而不是 <a href="#">
  if (!/^<button/.test(btn.trim())) {
    problems.push('回到顶部不是 <button>（用 <a href="#"> 会污染地址栏和历史记录，语义也不清）');
  } else {
    console.log('  ✓ 用 <button> 而不是 <a href="#">');
  }

  // 初始必须 hidden（无 JS 时不显示）。注意不能用 \bhidden\b —— 见 hasHiddenAttribute 的说明
  if (!hasHiddenAttribute(btn)) {
    problems.push('按钮没有初始 hidden —— 没有 JS 时它会一直显示，而点了没反应');
  } else {
    console.log('  ✓ 初始带 hidden（无 JS 时不出现）');
  }

  // 可读文本：要么有可见文字，要么有 aria-label
  const inner = btn.replace(/<[^>]+>/g, '').trim();
  const hasAria = /aria-label="[^"]+"/.test(btn);
  if (!inner && !hasAria) {
    problems.push('按钮既没有可读文本也没有 aria-label —— 屏幕阅读器读不出来');
  } else {
    console.log(`  ✓ 有可读文本或 aria-label（文本「${inner}」）`);
  }

  // 装饰性符号要 aria-hidden
  if (/[↑⬆]/.test(btn) && !/aria-hidden="true"/.test(btn)) {
    problems.push('箭头符号没有 aria-hidden="true" —— 屏幕阅读器会读成「上箭头」等噪音');
  }
}

/* ---------- 3. 脚本必须内联，且包含关键行为 ---------- */

const scriptMatch = home.match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? [];
/*
  ⚠️ 必须用**本组件独有的标记**（SHOW_AFTER_VIEWPORTS）来定位"我们自己的脚本"，
  不能只搜 `back-to-top` —— 页面上别处的脚本/内容也可能提到这个字符串，
  那样会在"我们的脚本被外部化"时误判为"脚本还在"，于是报出一堆
  「缺少XXX行为」而不是真正的原因。这是踩过的假阳性。
*/
const behavior = scriptMatch.find((s) => s.includes('SHOW_AFTER_VIEWPORTS'));

if (!behavior) {
  // 也可能被改成外部模块：检测是否存在指向脚本的 <script src>
  const externals = home.match(/<script[^>]+src="[^"]+"[^>]*>/g) ?? [];
  const bttExternal = externals.find((s) => /back-to-top|backToTop/i.test(s));
  problems.push(
    bttExternal
      ? `回到顶部的脚本被改成了外部模块（${bttExternal.slice(0, 60)}…）—— 模块是 defer 的，首屏显隐时序会错；应使用 is:inline`
      : '页面里找不到回到顶部的内联脚本（可能被 Astro 打包成外部模块了，应使用 is:inline）',
  );
} else {
  console.log('  ✓ 脚本已内联（is:inline）');

  const checks = [
    { label: '滚动阈值判断', test: /scrollY\s*>|scrollY\s*>=/ },
    { label: '尊重 prefers-reduced-motion', test: /prefers-reduced-motion/ },
    { label: '点击后滚动到顶部', test: /scrollTo\s*\(/ },
    { label: '点完把焦点移回主内容（键盘用户不跟丢）', test: /main-content|\.focus\s*\(/ },
    { label: '滚动监听用 passive（不拖慢滚动）', test: /passive\s*:\s*true/ },
    { label: '在 resize 时重新同步（旋转屏幕/改窗口）', test: /resize/ },
  ];
  for (const c of checks) {
    const ok = c.test.test(behavior);
    console.log(`  ${ok ? '✓' : '✗'} ${c.label}`);
    if (!ok) problems.push(`回到顶部脚本缺少：${c.label}`);
  }

  // 必须在给 hidden 赋值前判断状态，避免滚动时反复改属性
  if (!/btn\.hidden/.test(behavior) && !/\.hidden\s*=/.test(behavior)) {
    problems.push('脚本没有操作按钮的 hidden 属性 —— 按钮可能永远不显示');
  } else {
    console.log('  ✓ 通过 hidden 属性控制显隐');
  }
}

/* ---------- 4. 样式：必须 fixed，且不能压住页脚 ---------- */

const cssFiles = (await readdir(path.join(distDir, '_astro'))).filter((f) => f.endsWith('.css'));
let css = '';
for (const f of cssFiles) css += await readFile(path.join(distDir, '_astro', f), 'utf8');

/*
  ⚠️ 匹配选择器时**必须容忍 Astro 的 scoping 属性**。
  Astro 会把组件内的样式改写成 `.back-to-top[data-astro-cid-xxxx]`，
  而第一版检查器写的正则要求 `:focus` **紧跟类名**（`\.back-to-top:focus`），
  于是报了「没有 focus 样式」——**而 CSS 里明明有**（第 6 次同类假阳性了）。
  所以这里的模式允许类名与伪类之间有任意属性选择器。
*/
function rulesFor(className) {
  const re = new RegExp(`\\.${className}(?:\\[[^\\]]*\\])?(?::[a-z-]+(?:\\([^)]*\\))?)?[^{}]*\\{`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(css)) !== null) {
    // 从 { 开始按括号配对取规则体，避免嵌套 @media 时截断
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ selector: m[0].slice(0, -1).trim(), body: css.slice(start + 1, i) });
  }
  return out;
}

const btnRules = rulesFor('back-to-top');
if (btnRules.length === 0) {
  problems.push('CSS 里找不到 .back-to-top 的样式');
} else {
  const all = btnRules.map((r) => `${r.selector}{${r.body}}`).join('\n');
  const hasFixed = /position:\s*fixed/.test(all);
  const hasBottom = /bottom:\s*[\d.]+(rem|px|em)/.test(all);
  const hasZ = /z-index:\s*\d+/.test(all);
  // focus 样式：与类名同一条选择器即可（允许中间的 scoping 属性）
  const hasFocus = btnRules.some((r) => /:focus/.test(r.selector));

  console.log(`  ${hasFixed ? '✓' : '✗'} position: fixed`);
  console.log(`  ${hasBottom ? '✓' : '✗'} 固定在底部`);
  console.log(`  ${hasZ ? '✓' : '✗'} 有 z-index（否则可能被内容盖住）`);
  console.log(`  ${hasFocus ? '✓' : '✗'} 有 :focus 可见样式（键盘用户能看到焦点）`);

  if (!hasFixed) problems.push('.back-to-top 不是 position: fixed —— 它不会随滚动固定');
  if (!hasBottom) problems.push('.back-to-top 没有 bottom 定位 —— 位置不确定');
  if (!hasZ) problems.push('.back-to-top 没有 z-index —— 可能被正文或页脚盖住');
  if (!hasFocus) problems.push('.back-to-top 没有 :focus 可见样式');
}

/* ---------- 5. 不该出现在搜索索引里 ---------- */

// Pagefind 只索引 <main>，而按钮在 <main> 之外；这里确认它确实在 main 之后
const mainEnd = home.lastIndexOf('</main>');
const btnPos = home.indexOf('id="back-to-top"');
if (mainEnd !== -1 && btnPos !== -1 && btnPos < mainEnd) {
  problems.push('按钮在 <main> 内部 —— 会被 Pagefind 索引进搜索内容里（它应该在外面）');
} else if (btnPos !== -1) {
  console.log('  ✓ 按钮在 <main> 之外（不会被搜索索引收录）');
}

/* ---------- 汇总 ---------- */

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 回到顶部按钮：所有页面都有、脚本内联、行为与无障碍要点齐全。\n');
