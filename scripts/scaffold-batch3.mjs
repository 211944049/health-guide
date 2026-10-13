/**
 * 批量创建第三批词条的骨架。
 *
 * 与 scaffold-batch2.mjs 相同的思路：一张表一次建好，避免在 Windows 下反复传中文参数。
 *
 * ⚠️ 生成的骨架里 summary 和 sources 是 TODO 占位，`pnpm build` 会因占位而失败——故意的：
 *    没补来源的词条不允许上线。
 *
 * 用法：node scripts/scaffold-batch3.mjs [--force]
 */

import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');
const force = process.argv.includes('--force');

/*
  第三批 11 条。evidence 是预判，写正文时按实际证据强度调整（这是本站的核心纪律）。
  · 戒烟、防跌倒、止痛药、一氧化碳：都有权威指南，预判 B（部分可到 A）
  · 情绪调节、提不起劲：证据中等，C
  · 床垫、二手家具：机制清楚但缺乏专门研究，C
*/
const BATCH = [
  // 身心（原有 8 条，最薄）
  { slug: 'overtime-health', q: '长期加班怎么把伤害降到最低', cat: '身心', evidence: 'C', cost: '免费', time: '15分钟', audience: ['长期加班的人', '轮班工作者', '互联网从业者'] },
  { slug: 'emotion-regulation', q: '情绪上来时怎么让自己冷静', cat: '身心', evidence: 'C', cost: '免费', time: '5分钟', audience: ['容易急躁的人', '压力大的上班族', '家长'] },
  { slug: 'low-energy', q: '总是提不起劲怎么办', cat: '身心', evidence: 'C', cost: '免费', time: '15分钟', audience: ['长期疲惫的人', '久坐上班族', '情绪低落的人'] },

  // 健康管理（原有 9 条）
  { slug: 'quit-smoking', q: '怎么戒烟', cat: '健康管理', evidence: 'B', cost: '中', time: '长期', audience: ['吸烟者', '想戒烟的人', '吸烟者的家人'] },
  { slug: 'fall-prevention', q: '家里老人怎么防跌倒', cat: '健康管理', evidence: 'B', cost: '低', time: '30分钟', audience: ['老年人', '和老人同住的人', '有老人独自居住的家庭'] },
  { slug: 'painkiller-safety', q: '止痛药怎么吃才安全', cat: '健康管理', evidence: 'B', cost: '低', time: '15分钟', audience: ['经常头痛或关节痛的人', '长期服药的人', '有老人或孩子的家庭'] },

  // 住（原有 14 条，但这两条是真空白/高价值安全项）
  { slug: 'carbon-monoxide', q: '燃气热水器和一氧化碳怎么防', cat: '住', evidence: 'B', cost: '低', time: '30分钟', audience: ['燃气热水器用户', '租房族', '有老人孩子的家庭'] },
  { slug: 'mattress-choice', q: '床垫怎么选、多久换', cat: '住', evidence: 'C', cost: '高', time: '30分钟', audience: ['睡不好的人', '腰背不适的人', '换床垫的人'] },
  { slug: 'secondhand-furniture', q: '二手家具和旧书会不会有污染', cat: '住', evidence: 'C', cost: '免费', time: '15分钟', audience: ['租房族', '买二手家具的人', '新搬家的人'] },

  // 行（原有 11 条）
  { slug: 'hiking-basics', q: '怎么开始爬山或徒步', cat: '行', evidence: 'C', cost: '低', time: '30分钟', audience: ['户外新手', '想开始徒步的人', '周末出游的人'] },

  // 食（原有 17 条，这条与致癌风险相关，值得单独成条）
  { slug: 'cured-meat', q: '腌制和熏制食品能不能吃', cat: '食', evidence: 'B', cost: '免费', time: '5分钟', audience: ['喜欢腊肉香肠的人', '有家族肿瘤史的人', '给孩子做饭的家长'] },
];

const today = new Date().toISOString().slice(0, 10);
const created = [];
const skipped = [];

for (const item of BATCH) {
  const target = path.join(entriesDir, `${item.slug}.md`);
  const exists = await stat(target).catch(() => null);
  if (exists && !force) {
    skipped.push(item.slug);
    continue;
  }

  const template = `---
title: ${item.q}
category: ${item.cat}
evidence: ${item.evidence}
cost: ${item.cost}
time: ${item.time}
audience:
${item.audience.map((a) => `  - ${a}`).join('\n')}
updated: ${today}
status: 完整
summary: TODO 用一句话写清结论，最好是能直接照做的动作。
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

为什么这么做有效。（必须写清证据等级的依据：为什么是 ${item.evidence} 级）

## 常见误区

- 误区：

## 风险与禁忌

- 什么情况下不要这么做：

## 何时求助专业人士

出现以下情况先看医生，不要只靠本文：
`;

  await writeFile(target, template, { encoding: 'utf-8' });
  created.push(item.slug);
}

console.log(`\n[OK] 新建 ${created.length} 个骨架，跳过 ${skipped.length} 个已存在的文件`);
if (created.length) console.log(`     ${created.join(', ')}`);
if (skipped.length) console.log(`     跳过：${skipped.join(', ')}`);
console.log('\n提醒：summary 和 sources 还是 TODO 占位，补完之前构建会故意失败。\n');
