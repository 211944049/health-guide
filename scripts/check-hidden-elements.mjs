/**
 * 静态行为检查：JS 用 `hidden` 属性隐藏的元素，在 CSS 里真的会被隐藏吗？
 *
 * 为什么需要它（2026-10 真实踩的坑）：
 * 浏览器的默认样式是 `[hidden] { display: none }`，但**作者样式里的 display 会盖过它**。
 * 搜索页的 `.search-more { display: block }` 就导致了：JS 明明设了 `hidden = true`，
 * 「加载更多」按钮却一直显示、一直可点、点了一点反应都没有（因为确实没数据了），
 * 用户直接当成 bug 报了上来。
 *
 * 而这个 bug **骗过了所有已有检查**——逻辑测试断言的是「按钮应该隐藏」这个布尔值，
 * 它算得完全正确；逐字节比对和链接检查更看不到视觉行为。缺的是
 * 「CSS 是否真的让 hidden 生效」这一环。
 *
 * 做法（不需要浏览器）：解析构建产物里的 CSS，找出所有会给元素设置 display 的规则，
 * 与 dist 里带 `hidden` 属性的元素的 class 求交集，判断有没有规则会把它显示出来。
 *
 * 用法：node scripts/check-hidden-elements.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

async function collect(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await collect(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const files = await collect(distDir);
const cssFiles = files.filter((f) => f.endsWith('.css'));
const htmlFiles = files.filter((f) => f.endsWith('.html'));

/* ---------- 1. 收集 CSS 里所有「设置 display」的规则 ---------- */

const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(distDir, f), 'utf8')))).join('\n');

/** 找出形如 selector{...display:VALUE...} 的规则（够用的简化解析，CSS 已压缩）。 */
const displayRules = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selectors = m[1].trim();
  const body = m[2];
  const display = body.match(/(?:^|;)display\s*:\s*([^;!}]+)/);
  if (!display) continue;
  const value = display[1].trim().toLowerCase();

  // 一个规则可能有多条选择器（逗号分隔）。只看**每条选择器最后一个复合选择器**
  // ——那才是真正被命中的元素。否则 `.search-side>div` 会被误判成作用在 .search-side 上。
  for (const one of selectors.split(',')) {
    const last = one.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? '';
    const classes = [...last.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((c) => c[1]);
    if (classes.length === 0) continue;
    displayRules.push({ selectors: one.trim(), value, classes });
  }
}

/* ---------- 2. 找出全局的 [hidden] 兜底规则是否“足够强” ---------- */

// 一条兜底规则要能盖过 .search-more{display:block}，必须是 !important
// （作者样式之间比的是 specificity，.class 高于 [hidden]）。
const hiddenGuards = [...css.matchAll(/([^{}]*\[hidden\][^{}]*)\{([^{}]*)\}/g)];
const hasStrongGuard = hiddenGuards.some((m) => /display\s*:\s*none\s*!\s*important/.test(m[2]));

console.log(`\nhidden 属性静态检查`);
console.log(`  CSS 文件 ${cssFiles.length} 个，其中设置 display 的类规则 ${displayRules.length} 条`);
console.log(
  `  全局 [hidden] 兜底规则：${hiddenGuards.length ? '有' : '无'}` +
    `${hiddenGuards.length ? `，!important：${hasStrongGuard ? '是' : '否'}` : ''}`,
);

const problems = [];

/* ---------- 3. 检查每个带 hidden 属性的元素 ---------- */

let hiddenElements = 0;

for (const htmlFile of htmlFiles) {
  const html = await readFile(path.join(distDir, htmlFile), 'utf8');

  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bhidden\b[^>]*)>/gi)) {
    const tag = m[1];
    const attrs = m[2];
    hiddenElements += 1;

    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const classMatch = attrs.match(/\bclass="([^"]+)"/);
    const id = idMatch?.[1];
    const classes = classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [];

    // 找出会作用到这些 class 上的 display 规则，且值不是 none
    const offenders = displayRules.filter(
      (r) => r.classes.some((c) => classes.includes(c)) && r.value !== 'none',
    );

    if (offenders.length > 0 && !hasStrongGuard) {
      const label = id ? `#${id}` : `.${classes.join('.')}`;
      problems.push(
        `${htmlFile} 的 <${tag} ${label} hidden> 会被 CSS 显示出来：` +
          offenders
            .map((o) => `${o.selectors} → display:${o.value}`)
            .join('；') +
          `（需要一条 [hidden]{display:none!important} 兜底，或改掉这些规则）`,
      );
    }
  }
}

console.log(`  构建产物里带 hidden 属性的元素：${hiddenElements} 个`);

/* ---------- 顺带：产物里不应残留 HTML 注释 ---------- */

/*
  为什么查这个（2026-10-11 真实踩的坑）：
  我给词条加了 `<!-- fact:xxx -->` 锚点，本意只是给 check-facts.mjs 做标记。
  这些锚点在**正文**里没问题（浏览器不显示注释），但有一条被我错放进了
  frontmatter，导致 YAML 直接解析失败、构建中断。

  更普遍的问题是：**锚点/标记散落在正文里，没有任何机制保证它们不会泄漏到
  不该出现的地方**（比如被当成内容渲染、或者出现在 meta description、
  JSON-LD、RSS 这些机器可读的地方——那里出现 HTML 注释就是明确的脏数据）。

  所以这里统一检查：哪些页面的产物里残留了 HTML 注释，以及是否出现在
  机器可读的位置（meta / ld+json）。
  只把**机器可读位置的注释**算作问题；正文里的注释是设计的一部分（合法）。
*/
const commentOffenders = [];
for (const file of htmlFiles) {
  const html = await readFile(path.join(distDir, file), 'utf8');

  // meta description / og 描述里出现注释 → 脏数据
  for (const m of html.matchAll(/<meta\s+name="(description|twitter:description)"[^>]*>/g)) {
    if (/<!--/.test(m[0])) commentOffenders.push(`${file}: meta 描述里含 HTML 注释`);
  }
  // JSON-LD 里出现注释 → 脏数据
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (/<!--/.test(m[1])) commentOffenders.push(`${file}: JSON-LD 里含 HTML 注释`);
  }
}

if (commentOffenders.length > 0) {
  for (const c of commentOffenders.slice(0, 10)) problems.push(c);
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 15)) console.error(`  ✗ ${p}`);
  if (problems.length > 15) console.error(`  … 另有 ${problems.length - 15} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 所有用 hidden 隐藏的元素都会被真正隐藏；机器可读位置没有残留 HTML 注释。\n');
