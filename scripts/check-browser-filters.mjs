/**
 * 词条筛选器体检（/browse/ 与分类页）。
 *
 * ## 为什么需要它
 * 2026-10-12 用户反馈：「适用人群这里，分类很细，太多了，建议可以收纳」。
 * 实测那一组有 **100 多个标签**，全部铺开占满整屏，把结果列表推得很远。
 * 所以给这一组加了折叠（默认露前 8 个 + 「展开全部」）。
 *
 * 但这个折叠有几处**构建时不报错、只有真去用才发现**的坏法：
 *
 *   · 折叠按钮的 threshold 判断写错（预览数 ≥ 总数）→ 按钮没有意义
 *   · **已选中的标签被藏在收起状态里** → 读者点了却看不到自己被点亮，
 *     以为没生效，于是再点一次（反复开关）。这是最要紧的一条。
 *   · 展开/收起按钮的可读文本不随状态变化 → 屏幕阅读器不知道会发生什么
 *   · 用了 `<details>` 却没给 `<summary>` → 键盘无法操作
 *   · 折叠后的标签仍然存在于 DOM 但被 CSS 显示出来（hidden 被 display 盖过）
 *
 * 用法：node scripts/check-browser-filters.mjs [--dist <路径>]
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

const problems = [];
const browsePath = path.join(distDir, 'browse', 'index.html');
const browse = await readFile(browsePath, 'utf8').catch(() => null);

if (!browse) {
  console.error('\n[X] 读不到 dist/browse/index.html\n');
  process.exit(1);
}

console.log('\n词条筛选器体检（/browse/）\n');

/* ---------- 1. 适用人群这一组必须可折叠 ---------- */

const moreMatch = browse.match(/<details[^>]*data-audience-more[^>]*>/);
if (!moreMatch) {
  problems.push('「适用人群」没有折叠容器（data-audience-more）—— 一百多个标签会占满整屏');
} else {
  console.log('  ✓ 有折叠容器');

  const preview = Number(moreMatch[0].match(/data-preview-count="(\d+)"/)?.[1] ?? NaN);
  if (!Number.isFinite(preview) || preview <= 0) {
    problems.push('折叠容器缺少有效的 data-preview-count');
  } else {
    console.log(`  ✓ 预览数量 = ${preview}`);
  }

  // 必须有 summary 才能键盘操作
  const detailsStart = browse.indexOf(moreMatch[0]);
  const detailsEnd = browse.indexOf('</details>', detailsStart);
  const inner = browse.slice(detailsStart, detailsEnd === -1 ? undefined : detailsEnd);
  if (!/<summary[\s>]/.test(inner)) {
    problems.push('折叠容器里没有 <summary> —— 键盘和屏幕阅读器无法展开它');
  } else {
    console.log('  ✓ 有 <summary>（键盘可操作）');
  }
  if (!/data-audience-toggle/.test(inner)) {
    problems.push('折叠开关缺少 data-audience-toggle 标记 —— 脚本无法更新它的文本');
  }
  if (!/data-audience-toggle-text/.test(inner)) {
    problems.push('折叠开关的文本缺少 data-audience-toggle-text 标记 —— 文本不会随状态变化');
  }
}

/* ---------- 2. 每个标签都要有索引，且总数必须大于预览数 ---------- */

const chipMatches = [...browse.matchAll(/data-audience-index="(\d+)"/g)];
const indexes = chipMatches.map((m) => Number(m[1]));

if (indexes.length === 0) {
  problems.push('找不到任何带 data-audience-index 的标签 —— 脚本无法判断哪个该收起');
} else {
  console.log(`  ✓ 适用人群标签 ${indexes.length} 个，索引 0–${Math.max(...indexes)}`);

  // 索引必须是连续的 0..n-1，否则"前 N 个"的判断会错
  const sorted = [...indexes].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => v === i);
  if (!contiguous) {
    problems.push(`标签索引不连续（${sorted.slice(0, 5).join(',')}…）—— 「前 N 个」的判断会出错`);
  } else {
    console.log('  ✓ 索引连续，从 0 开始');
  }

  const preview = Number(moreMatch?.[0].match(/data-preview-count="(\d+)"/)?.[1] ?? NaN);
  if (Number.isFinite(preview) && indexes.length <= preview) {
    problems.push(
      `标签总数（${indexes.length}）不超过预览数（${preview}）—— 折叠按钮没有意义；` +
        '要么调小预览数，要么干脆不渲染折叠容器',
    );
  }
}

/* ---------- 3. 脚本逻辑：必须处理「选中项可见」和「文本随状态变化」 ---------- */

const scripts = browse.match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? [];
const behavior = scripts.find((s) => s.includes('data-audience-index'));

if (!behavior) {
  problems.push('找不到处理适用人群折叠的脚本 —— 标签不会被收起，或收起后无法展开');
} else {
  console.log('  ✓ 找到折叠脚本');

  const checks = [
    {
      /*
        「收起时按索引隐藏」的稳定特征：
        出现 `data-audience-index`、且附近有对 `.hidden` 的赋值、
        并且这个赋值里带 `!`（即"满足某条件就隐藏"的取反逻辑）。
        ⚠️ 不要断言变量名（如 PREVIEW）——**Astro 会把脚本压缩，变量名会被改写**
        （PREVIEW → S），第一版就是这么写的，于是报了 3 个假阳性。
      */
      label: '收起时按索引隐藏超出预览数的标签',
      test: (s) =>
        s.includes('data-audience-index') &&
        /\.hidden\s*=/.test(s) &&
        /\.hidden\s*=\s*!/.test(s),
    },
    {
      /*
        「已选中的标签在收起时仍可见」的稳定特征。
        压缩后的表达式形如：
            e.hidden = !展开 && 索引 >= 预览数 && !已选中
        也就是 **`.hidden=!` 之后必须有两个 `&&`，且第二个是 `&&!`（取反）**。

        ⚠️ 这条断言改过三次，每一次都是因为"太松"：
          1. 断言变量名 `selected`（压缩后变 o）→ 假阳性。
          2. 只要求"脚本里出现 aria-pressed" → 太松：删掉 `&&!o` 后，
             读取 aria-pressed 的那行还在，断言照样通过。
          3. 用"hidden 赋值附近 120 字符内出现 aria-pressed" → 仍然太松：
             aria-pressed 的读取就在赋值前一行，落在窗口内。
        最终改用**表达式结构**判定，不再依赖字符串距离：
        `.hidden=!` 后出现 `&&...&&!` 即说明"或上了一个取反条件"，
        而那正是"已选中就不隐藏"的实现方式。
      */
      label: '显隐表达式里包含「已选中则不隐藏」的取反条件（&&!）',
      test: (s) => /\.hidden=![^;}]*&&[^;}]*&&!/.test(s),
    },
    {
      label: '展开/收起的文本随状态变化',
      test: (s) => /收起/.test(s) && /展开全部/.test(s),
    },
    {
      label: '维护 aria-expanded（屏幕阅读器要知道会展开还是收起）',
      test: (s) => /aria-expanded/.test(s),
    },
    {
      label: '监听 details 的 toggle 事件',
      test: (s) => /addEventListener\(\s*"toggle"|addEventListener\(\s*'toggle'/.test(s),
    },
  ];

  for (const c of checks) {
    /*
      test 既可能是 RegExp 也可能是函数（有的断言需要组合多个条件）。
      统一在这里判定，避免调用处耦合类型。
    */
    const ok = typeof c.test === 'function' ? c.test(behavior) : c.test.test(behavior);
    console.log(`  ${ok ? '✓' : '✗'} ${c.label}`);
    if (!ok) problems.push(`折叠脚本缺少：${c.label}`);
  }
}

/* ---------- 4. hidden 必须真的能隐藏（复用全局兜底规则的存在性） ---------- */

const cssFiles = (await readdir(path.join(distDir, '_astro'))).filter((f) => f.endsWith('.css'));
let css = '';
for (const f of cssFiles) css += await readFile(path.join(distDir, '_astro', f), 'utf8');

if (!/\[hidden\][^{]*\{[^}]*display:\s*none/.test(css)) {
  problems.push(
    'CSS 里没有 [hidden]{display:none} 兜底 —— JS 设 chip.hidden 可能被 .chip 的 display 盖过，标签不会真的收起',
  );
} else {
  console.log('  ✓ 有 [hidden]{display:none} 兜底（chip.hidden 会真的生效）');
}

// .chip 不应自己设置 display 而不处理 hidden（有全局兜底就没问题，这里只提示）
if (/\.chip\s*\{[^}]*display:/.test(css)) {
  console.log('  ⚠️ .chip 自己设置了 display —— 确认全局 [hidden] 兜底带 !important');
}

/* ---------- 5. 分类页也应该有这个折叠（同一个组件） ---------- */

const categoryDir = path.join(distDir, 'category');
const categoryPages = await readdir(categoryDir).catch(() => []);
let categoryWithAudience = 0;
for (const c of categoryPages) {
  const p = path.join(categoryDir, c, 'index.html');
  const html = await readFile(p, 'utf8').catch(() => null);
  if (!html) continue;
  if (/data-audience-index=/.test(html)) {
    categoryWithAudience += 1;
    if (!/data-audience-more/.test(html)) {
      // 分类页词条少时可能不需要折叠，这不算问题（但要知道）
    }
  }
}
console.log(`  · 分类页里有适用人群标签的：${categoryWithAudience} 个（是否折叠取决于该分类的标签数）`);

/* ---------- 汇总 ---------- */

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 适用人群已可折叠，且「选中项可见」「文本随状态变化」等都具备。\n');
