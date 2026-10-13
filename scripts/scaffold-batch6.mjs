/**
 * 第六批词条骨架 + 写作模板。
 *
 * ## 选题来源
 * 用户直接给出的一批生活场景（不是我猜的）：
 *   被子的清洗、脱毛、头发养护、水杯材质、餐具材质、洗脸巾材质、
 *   抽纸选择、电器拔不拔电、空调使用、其他家电
 *
 * ## 与现有条目的重叠处理（逐个核对过，不重复写）
 *   · 洗脸的方法  → **已有** `face-wash`，不重写
 *   · 毛巾/床品   → **已有** `towels-bedding`（讲换洗频率），
 *                   本批只写相邻的 `face-towel`（洗脸巾材质）
 *   · 洗头        → **已有** `hair-washing`（讲洗头与掉发），
 *                   本批只写 `hair-care`（日常养护与损伤防护）
 *   · 枕头/床垫   → **已有** `pillow-choice` / `mattress-choice`，
 *                   本批只写 `duvet-care`（被芯清洗，与"多久换洗"不同）
 *
 * ## ⚠️ 证据等级
 * 这批大多只能给 **B 或 C**，因为「某材质更安全」这类问题的证据链是
 * 「标准限值 + 机制 + 有限的人体研究」。**不为了好看而抬高等级。**
 *
 * 用法：node scripts/scaffold-batch6.mjs
 */

import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');

export const BATCH = [
  // ---------------- 衣：个人护理的相邻空白 ----------------
  {
    slug: 'face-towel',
    q: '洗脸巾怎么选、毛巾要不要换',
    cat: '衣',
    evidence: 'C',
    cost: '低',
    time: '5分钟',
    audience: ['长痘的人', '皮肤敏感的人', '习惯用毛巾擦脸的人', '经常出差或旅行的人'],
    related: ['face-wash', 'towels-bedding', 'acne-care'],
  },
  {
    slug: 'hair-care',
    q: '头发日常怎么养护、怎么减少损伤',
    cat: '衣',
    evidence: 'C',
    cost: '低',
    time: '15分钟',
    audience: ['头发干枯毛躁的人', '经常染烫的人', '长发人群', '担心掉发的人'],
    related: ['hair-washing', 'hair-removal'],
  },
  {
    slug: 'hair-removal',
    q: '脱毛方法怎么选',
    cat: '衣',
    evidence: 'C',
    cost: '中',
    time: '30分钟',
    audience: ['想脱毛的人', '毛发旺盛的人', '皮肤敏感的人', '考虑医美脱毛的人'],
    related: ['hair-care', 'shaving', 'after-sun'],
  },

  // ---------------- 食：容器与餐具材质 ----------------
  {
    slug: 'drinkware-material',
    q: '水杯材质怎么选',
    cat: '食',
    evidence: 'B',
    cost: '低',
    time: '15分钟',
    audience: ['每天带水杯的人', '给孩子选水杯的家长', '爱喝热水的人', '关注塑料安全的人'],
    related: ['bottle-cleaning', 'daily-water', 'tableware-material'],
  },
  {
    slug: 'tableware-material',
    q: '餐具材质怎么选',
    cat: '食',
    evidence: 'B',
    cost: '低',
    time: '15分钟',
    audience: ['所有家庭', '给孩子选餐具的家长', '常吃外卖的人', '关注塑料安全的人'],
    related: ['drinkware-material', 'takeout-ordering', 'leftovers'],
  },

  // ---------------- 住：家电与家居用品 ----------------
  {
    slug: 'duvet-care',
    q: '被芯怎么清洗和保养',
    cat: '住',
    evidence: 'C',
    cost: '中',
    time: '半天',
    audience: ['所有家庭', '过敏和哮喘人群', '养宠物的人', '租房族'],
    related: ['towels-bedding', 'mattress-choice', 'pillow-choice'],
  },
  {
    slug: 'tissue-choice',
    q: '抽纸和纸巾怎么选',
    cat: '住',
    evidence: 'B',
    cost: '低',
    time: '10分钟',
    audience: ['所有家庭', '有鼻炎的人', '给孩子用的家长', '经常擦嘴擦手的人'],
    related: ['toilet-hygiene', 'handwashing', 'drinkware-material'],
  },
  {
    slug: 'air-conditioner-use',
    q: '空调怎么用才健康',
    cat: '住',
    evidence: 'B',
    cost: '低',
    time: '30分钟',
    audience: ['夏天开空调的人', '办公室人群', '有鼻炎或哮喘的人', '有老人孩子的家庭'],
    related: ['humidity', 'air-purifier-choice', 'mold-prevention', 'sleep-environment'],
  },
  {
    slug: 'humidifier-cleaning',
    q: '加湿器怎么用和怎么清洁',
    cat: '住',
    evidence: 'B',
    cost: '低',
    time: '15分钟',
    audience: ['冬天用加湿器的人', '有鼻炎的人', '有婴幼儿的家庭', '北方供暖地区'],
    related: ['humidity', 'air-conditioner-use', 'mold-prevention'],
  },
  {
    slug: 'appliance-standby',
    q: '电器平时要不要拔电',
    cat: '住',
    evidence: 'C',
    cost: '免费',
    time: '15分钟',
    audience: ['所有家庭', '合租的人', '担心火灾风险的人', '关注电费的人'],
    related: ['carbon-monoxide', 'cleaning-products', 'toilet-hygiene'],
  },
];

const today = new Date().toISOString().slice(0, 10);
const created = [];
const skipped = [];

for (const item of BATCH) {
  const target = path.join(entriesDir, `${item.slug}.md`);
  if (await stat(target).catch(() => null)) {
    skipped.push(item.slug);
    continue;
  }
  const tpl = `---
title: ${item.q}
category: ${item.cat}
evidence: ${item.evidence}
cost: ${item.cost}
time: ${item.time}
audience:
${item.audience.map((a) => `  - ${a}`).join('\n')}
updated: ${today}
status: 完整
summary: TODO 一句话结论（注意：含 * 号时必须整体加单引号，否则 YAML 解析失败）
sources:
  - TODO 补权威来源
related:
${item.related.map((r) => `  - ${r}`).join('\n')}
tags:
  - TODO
---

## 适用人群

- 谁适合照做：
- 谁不适用：

## 具体做法

1.
2.
3.

## 健康原理

为什么这么做有效。必须写清 ${item.evidence} 级的依据。

## 常见误区

- 误区：

## 风险与禁忌

- 什么情况下不要这么做：

## 何时求助专业人士

出现以下情况先看医生，不要只靠本文：
`;
  await writeFile(target, tpl, { encoding: 'utf-8' });
  created.push(item.slug);
}

console.log(`\n[OK] 新建 ${created.length} 个骨架，跳过 ${skipped.length} 个已存在的`);
if (created.length) console.log(`     ${created.join(', ')}`);
if (skipped.length) console.log(`     已存在：${skipped.join(', ')}`);
console.log('\n提醒：summary 和 sources 还是 TODO，补完之前构建会故意失败。\n');
