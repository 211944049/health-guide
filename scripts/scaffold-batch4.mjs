/**
 * 批量创建第四批词条的骨架。
 *
 * 第四批的选题依据（与前三批相同的做法，不凭感觉）：
 *   · `run.cmd assess3` 显示分类均衡度：**衣 10 条最薄**、食 18 条最厚，
 *     变异系数 0.228。所以这一批**优先补衣**（+4）。
 *   · 其余选题按「高频但站上没有」选：药品相互作用、在家测血糖、看懂化验单、
 *     食品中毒、衣物面料成分、二手烟、家里有虫、旧房水管……
 *     这些是读者会问、而现有 80 条没有正面回答的问题。
 *
 * ⚠️ 骨架的 summary 与 sources 是 TODO 占位，`pnpm build` 会因占位而失败——故意的：
 *    没补来源的词条不允许上线。
 *
 * 用法：node scripts/scaffold-batch4.mjs [--force]
 */

import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');
const force = process.argv.includes('--force');

const BATCH = [
  // ---- 健康管理（4）----
  { slug: 'drug-interactions', q: '药能不能一起吃', cat: '健康管理', evidence: 'B', cost: '免费', time: '15分钟', audience: ['长期服药的人', '有老人或慢性病患者的家庭', '同时看多个科室的人'] },
  { slug: 'blood-sugar-home', q: '在家怎么测血糖', cat: '健康管理', evidence: 'B', cost: '中', time: '15分钟', audience: ['糖尿病患者', '糖尿病前期的人', '有家族史的人'] },
  { slug: 'lab-report-basics', q: '怎么看懂化验单', cat: '健康管理', evidence: 'B', cost: '免费', time: '15分钟', audience: ['刚做完检查的人', '中老年人', '陪家人看病的人'] },
  { slug: 'supplement-interactions', q: '保健品会不会和药冲突', cat: '健康管理', evidence: 'C', cost: '免费', time: '15分钟', audience: ['吃保健品的人', '长期服药的人', '给父母买保健品的人'] },

  // ---- 衣（4）—— 最薄的分类，这批重点补 ----
  { slug: 'fabric-labels', q: '怎么看衣服面料成分', cat: '衣', evidence: 'C', cost: '免费', time: '5分钟', audience: ['买衣服的人', '皮肤敏感的人', '想买耐穿衣服的人'] },
  { slug: 'underwear-replacement', q: '内衣多久该换', cat: '衣', evidence: 'C', cost: '低', time: '5分钟', audience: ['所有家庭', '皮肤敏感的人', '女性'] },
  { slug: 'sock-choice', q: '袜子怎么选', cat: '衣', evidence: 'C', cost: '低', time: '5分钟', audience: ['脚容易出汗的人', '糖尿病患者', '运动人群'] },
  { slug: 'clothing-storage', q: '换季衣服怎么收纳防霉防虫', cat: '衣', evidence: 'C', cost: '低', time: '30分钟', audience: ['所有家庭', '南方潮湿地区住户', '过敏人群'] },

  // ---- 身心（3）----
  { slug: 'social-anxiety', q: '社交焦虑怎么缓解', cat: '身心', evidence: 'C', cost: '免费', time: '15分钟', audience: ['社交场合紧张的人', '学生', '职场新人'] },
  { slug: 'phone-addiction', q: '手机成瘾怎么破', cat: '身心', evidence: 'C', cost: '免费', time: '15分钟', audience: ['刷手机停不下来的人', '学生', '家长'] },
  { slug: 'racing-mind-at-night', q: '睡前脑子停不下来怎么办', cat: '身心', evidence: 'C', cost: '免费', time: '5分钟', audience: ['入睡困难的人', '压力大的上班族', '焦虑倾向的人'] },

  // ---- 住（3）----
  { slug: 'household-pests', q: '家里有蟑螂和虫子怎么处理', cat: '住', evidence: 'C', cost: '低', time: '30分钟', audience: ['所有家庭', '租房族', '有婴幼儿的家庭'] },
  { slug: 'secondhand-smoke', q: '二手烟三手烟怎么防', cat: '住', evidence: 'B', cost: '免费', time: '15分钟', audience: ['家里有人吸烟的人', '有孕妇或幼儿的家庭', '租房族'] },
  { slug: 'old-building-water', q: '老房子的水管和水质要注意什么', cat: '住', evidence: 'C', cost: '低', time: '15分钟', audience: ['老房住户', '租房族', '有婴幼儿的家庭'] },

  // ---- 食（2）----
  { slug: 'food-poisoning', q: '食物中毒怎么预防和处理', cat: '食', evidence: 'B', cost: '免费', time: '15分钟', audience: ['在家做饭的人', '所有家庭', '有老人孩子的家庭'] },
  { slug: 'freezing-food', q: '冷冻和解冻怎么做才对', cat: '食', evidence: 'B', cost: '免费', time: '5分钟', audience: ['在家做饭的人', '囤菜的人', '上班族'] },
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
