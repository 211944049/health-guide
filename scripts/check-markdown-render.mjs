/**
 * 可见文本里不得出现 markdown 标记残留。
 *
 * ## 为什么需要这个闸门（2026-10-12 发现的真实 bug）
 *
 * **CommonMark 的强调规则有 CJK 盲区**：`**` 紧贴标点、外侧紧贴汉字时
 * 不被当作强调标记，星号会**原样显示给读者**：
 *
 *   ✓ `这是**重点**内容`        → 解析
 *   ✗ `这里要注意**"1 类"…**`   → 不解析（后随引号）
 *   ✗ `**（非炎症型）**可以`     → 不解析（后随括号）
 *
 * 这个 bug 的可怕之处在于**所有既有检查都发现不了**：
 *   · 构建成功（星号是合法文本）
 *   · check-content 通过（只查 frontmatter 字段）
 *   · check-live-content 通过（比的是"可见文本"，而星号两边完全一致！）
 *
 * 也就是说：**我用来自证"线上和本地一致"的那个检查，恰好对这个 bug 是盲的**——
 * 因为两边都错，所以"一致"。这一类"错得一致"的 bug 只能靠**内容规则**发现。
 *
 * ## 检查项
 *   1. 可见文本里不得有字面 `**`（markdown 加粗未解析）
 *   2. 不得有行首 `##`（标题未解析）
 *   3. 不得有未解析的 `](` 链接语法
 *
 * 用法：node scripts/check-markdown-render.mjs [--dist <目录>]
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distArgIndex = process.argv.indexOf('--dist');
const distDir =
  distArgIndex !== -1 && process.argv[distArgIndex + 1]
    ? path.resolve(process.argv[distArgIndex + 1])
    : path.join(root, 'dist');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/**
 * 取出**读者可见的文本**。
 *
 * ⚠️ 三个都必须处理，少一个就会误报或漏报：
 *
 *   1. **只取 `<body>`** —— `<head>` 里的 `<meta content="…">` 属性值里
 *      含 markdown（summary 同时用作 meta description），但它不是可见文本。
 *      第一版没做这一步，于是把 meta 里的 `[失眠怎么办](/entry/insomnia/)`
 *      报成了"未解析的链接"（**假阳性**）。
 *   2. **剥掉 script/style 整块** —— 内联脚本的注释里可能出现 `**`
 *      （如 bmi.astro 的说明注释），那不是可见文本。
 *   3. **先剥整块再剥标签** —— 顺序反了会把 `<strong>a</strong>**b**` 里
 *      `>` 与 `<` 之间误数成星号。
 */
function visibleText(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ') // HTML 注释不可见
    .replace(/<[^>]+>/g, ' ');
}

const files = await walk(distDir);
const problems = [];
let checked = 0;

for (const f of files) {
  const html = await readFile(f, 'utf8');
  const text = visibleText(html);
  checked += 1;
  const rel = path.relative(distDir, f);

  // 1. 字面 markdown 加粗
  const bold = text.match(/\*\*/g) ?? [];
  if (bold.length) {
    const at = text.indexOf('**');
    problems.push(`${rel}: 可见文本里有 ${bold.length} 处未解析的 ** —— …${text.slice(Math.max(0, at - 30), at + 50).replace(/\s+/g, ' ')}…`);
  }

  // 2. 行首未解析的标题（可见文本里出现 "## "）
  if (/(^|\s)#{2,6}\s/.test(text)) {
    problems.push(`${rel}: 可见文本里有未解析的 markdown 标题（## 或多级 #）`);
  }

  // 3. 未解析的链接语法 ]( 
  if (/\]\([^)]{1,80}\)/.test(text)) {
    problems.push(`${rel}: 可见文本里有未解析的链接语法 ](…)`);
  }

  /*
    4. **被转义成实体、因而不显示为元素的 HTML 标签**
       这类是"双重转义"的症状：内容里本来是想加粗的 `<strong>`，
       被转义成 `&lt;strong&gt;`，于是**读者看到的是标签文字**。
       构建、可见文本比较**都发现不了**（标签文字确实"在页面上"），
       只有看截图或加这条断言才能发现 —— 这是我自己踩过的坑。
  */
  const escapedTags = text.match(/&lt;\/?(?:strong|em|code|b|i)&gt;/g) ?? [];
  if (escapedTags.length) {
    const at = text.indexOf('&lt;');
    problems.push(
      `${rel}: 可见文本里有 ${escapedTags.length} 处被转义的 HTML 标签（会显示成标签文字）—— …${text.slice(Math.max(0, at - 30), at + 60).replace(/\s+/g, ' ')}…`,
    );
  }
}

console.log(`\nmarkdown 渲染体检：${checked} 个页面`);

if (problems.length) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 20)) console.error(`  ✗ ${p}`);
  if (problems.length > 20) console.error(`  … 另有 ${problems.length - 20} 个`);
  console.error('');
  process.exit(1);
}

console.log('  ✓ 没有未解析的 markdown 标记（加粗 / 标题 / 链接）\n');
