/**
 * 搜索输入门槛检查。
 *
 * 背景（2026-10 用户反馈「搜索会搜出不相关内容」）：
 * Pagefind 对中文按**单字**切分，所以「外卖」是拿「外」和「卖」两次查询再合并。
 * 用户只输入一个字时（比如刚打完「外」），会命中所有含这个字的词条——
 * 实测「外」返回 37 条、「久」28 条、「坐」14 条，绝大多数与意图无关。
 * 截图里「37 条、第一条是耳塞怎么选」就是这么来的：那是**输入中间态**。
 *
 * 修法是在 UI 层拦住单字（中文），这个脚本断言那条规则本身。
 * 规则必须与 src/pages/search.astro 里的实现一致——两边都改才算改对。
 *
 * 用法：node scripts/check-search-input.mjs
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * 与 search.astro 里完全相同的判定规则（2026-10-12 更新）。
 *
 * ⚠️ 判定的输入是**去掉空白后的**查询词，不是 trim 后的原文。
 * 为什么：去掉空白是为了修「外 卖」这个真实 bug——
 * Pagefind 对中文按单字切分，输入「外 卖」会被当成两个独立的单字查询，
 * 结果集里根本没有「外卖怎么点更健康」（实测只返回 4 条、标题命中 0 条）。
 * 所以 search.astro 先把空白全部去掉再搜。
 * 这也顺带修好了「  外  」这类输入：去空白后是一个汉字，应被拦住。
 */
function normalize(term) {
  return String(term).replace(/[\s\u3000]+/g, '');
}
function shouldSearch(term) {
  const t = normalize(term);
  return !(t.length === 1 && /[\u4e00-\u9fff]/.test(t));
}

const cases = [
  // [输入, 期望是否发起搜索, 说明]
  ['', true, '空输入 = 显示全部词条'],
  ['外', false, '单个汉字：会命中几十条无关词条，必须拦住'],
  ['久', false, '单个汉字'],
  ['a', true, '单个英文字母：不是单字切分，可以搜'],
  ['5', true, '单个数字：可以搜'],
  ['外卖', true, '两个汉字：正常搜索'],
  ['久坐', true, '两个汉字'],
  ['  外  ', false, '单个汉字（去掉空白后仍是一个字）'],
  ['外 卖', true, '⚠️ 带空格的常见输入：去空白后是「外卖」，必须能搜（这是真实 bug）'],
  ['  外卖  ', true, '带空白的两字词'],
  ['防晒霜', true, '三个汉字'],
  ['deet', true, '英文单词'],
  ['防晒 deet', true, '混合'],
  ['·', true, '非汉字单字符：交给搜索引擎处理'],
];

const problems = [];

console.log('\n搜索输入门槛检查');
for (const [term, expected, why] of cases) {
  const got = shouldSearch(term);
  const ok = got === expected;
  if (!ok) problems.push(`「${term}」期望${expected ? '发起搜索' : '拦住'}，实际${got ? '发起搜索' : '拦住'}（${why}）`);
  console.log(`  ${ok ? '✓' : '✗'} 「${term}」→ ${got ? '搜索' : '拦住'}   ${why}`);
}

/* ---------- 确认实现里真的有这两条规则（防止只改测试不改代码） ---------- */

const src = await readFile(path.join(root, 'src', 'pages', 'search.astro'), 'utf8');
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// 规则 1：单个汉字不搜索（变量名现在是 normalized）
if (!/normalized\.length\s*===\s*1\s*&&\s*\/\[\\u4e00-\\u9fff\]\//.test(codeOnly)) {
  problems.push('src/pages/search.astro 里找不到「单个汉字不搜索」的判定，实现可能被改掉了');
}

// 规则 2：搜索前必须去掉空白（这是修「外 卖」的关键，缺了就会退回旧 bug）
if (!/replace\(\/\[\\s\\u3000\]\+\/g,\s*''\)/.test(codeOnly)) {
  problems.push('src/pages/search.astro 里找不到「搜索前去掉空白」的归一化——「外 卖」会退回旧 bug');
}

// 顺便确认防抖存在（避免每敲一个字都查一次）
if (!/setTimeout/.test(codeOnly)) {
  problems.push('src/pages/search.astro 里没有 setTimeout 防抖');
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 单字输入会被拦住，多字搜索正常，实现与预期一致。\n');
