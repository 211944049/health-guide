/**
 * 新词条脚手架：生成一个字段齐全、结构合规的骨架，省得每次手抄模板。
 *
 * 用法：
 *   node scripts/new-entry.mjs --title "隔夜菜能不能吃" --slug leftover-dishes --category 食
 *
 * 可选参数（都有默认值）：
 *   --evidence A|B|C|D   --cost 免费|低|中|高   --time 1分钟|5分钟|15分钟|30分钟|1小时|长期
 *   --audience 上班族     --status 完整|简版
 *
 * 生成的骨架里 sources 是 TODO 占位，pnpm build 会因为占位而失败 —— 这是故意的：
 * 没补来源的词条不允许上线。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORY_LABELS, COST_LEVELS, EVIDENCE_KEYS, TIME_LEVELS } from '../src/site.config.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');

const args = new Map();
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 2) {
  const key = argv[index]?.replace(/^--/, '');
  if (key) args.set(key, argv[index + 1]);
}

const title = args.get('title');
const slug = args.get('slug');
const category = args.get('category');

const fail = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
};

if (!title) fail('缺少 --title，例如 --title "隔夜菜能不能吃"');
if (!slug) fail('缺少 --slug（英文短横线命名，会变成 URL），例如 --slug leftover-dishes');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`--slug 只能用小写字母、数字和短横线，现在是「${slug}」`);
if (!category) fail(`缺少 --category，可选：${CATEGORY_LABELS.join(' / ')}`);
if (!CATEGORY_LABELS.includes(category)) fail(`--category 必须是 ${CATEGORY_LABELS.join(' / ')}，现在是「${category}」`);

const evidence = args.get('evidence') ?? 'C';
const cost = args.get('cost') ?? '低';
const time = args.get('time') ?? '5分钟';
const audience = args.get('audience') ?? '所有人';
const status = args.get('status') ?? '完整';

if (!EVIDENCE_KEYS.includes(evidence)) fail(`--evidence 必须是 ${EVIDENCE_KEYS.join(' / ')}`);
if (!COST_LEVELS.includes(cost)) fail(`--cost 必须是 ${COST_LEVELS.join(' / ')}`);
if (!TIME_LEVELS.includes(time)) fail(`--time 必须是 ${TIME_LEVELS.join(' / ')}`);

const today = new Date().toISOString().slice(0, 10);

const template = `---
title: ${title}
category: ${category}
evidence: ${evidence}
cost: ${cost}
time: ${time}
audience: ${audience}
updated: ${today}
status: ${status}
summary: 用一句话写清结论，最好是能直接照做的动作。
sources:
  - TODO 补一条权威来源（指南 / 标准 / 综述名 + 年份）
---

## 适用人群

- 谁适合照做：
- 谁不适用：

## 具体做法

1.
2.
3.

## 健康原理

为什么这么做有效。

## 常见误区

- 误区：

## 风险与禁忌

- 什么情况下不要这么做：

## 何时求助专业人士

出现以下情况先看医生，不要只靠本文：
`;

await mkdir(entriesDir, { recursive: true });
const target = path.join(entriesDir, `${slug}.md`);
await writeFile(target, template, { encoding: 'utf-8', flag: 'wx' }).catch((error) => {
  if (error.code === 'EEXIST') fail(`文件已存在：${path.relative(root, target)}`);
  throw error;
});

console.log(`\n✓ 已创建 src/content/entries/${slug}.md`);
console.log('  下一步：补正文 → 补 sources → 跑 node scripts/check-content.mjs 体检。\n');
