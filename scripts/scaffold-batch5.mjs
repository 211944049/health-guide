/**
 * 第五批 16 条骨架。
 *
 * 选题依据（两个真实缺口，不是凑数）：
 *
 * ① **个人护理线刚刚开始，但不成体系。** 上一批新开了 `toothbrush` / `face-wash` /
 *    `body-lotion` 三条，但相邻的都没写：牙线、漱口水、洗发、防晒的用法、
 *    晒后修复、洗手、毛巾浴巾、指甲手足、剃须。
 *
 * ② **女性健康是 99 条里最明显的空缺。** 全站没有任何关于月经、避孕、经期不适的内容，
 *    而这是读者基数最大、搜索量最高的一类问题之一。这个空白不应该留着。
 *
 * ③ 其余按「有明确可执行结论的操作」选：耳朵进水/耳垢处理（很常见但危险动作多）、
 *    提重物的搬运姿势（腰伤预防，与已有的 muscle-soreness 相邻）。
 *
 * ⚠️ summary 与 sources 是 TODO 占位，补完之前构建会故意失败——这是设计。
 *
 * 用法：node scripts/scaffold-batch5.mjs
 */

import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');

const BATCH = [
  // ---- 口腔：补齐 oral-care 里只提过一句的两件工具 ----
  { slug: 'flossing', q: '牙线怎么用', cat: '健康管理', evidence: 'A', cost: '低', time: '5分钟', audience: ['所有人', '刷牙总出血的人', '有牙周病史的人', '戴牙套的人'] },
  { slug: 'mouthwash', q: '漱口水怎么用', cat: '健康管理', evidence: 'B', cost: '低', time: '5分钟', audience: ['口气困扰的人', '有牙龈炎的人', '正在做牙周治疗的人', '戴牙套的人'] },

  // ---- 头发与皮肤：接续 face-wash / body-lotion ----
  { slug: 'hair-washing', q: '洗头怎么洗、会不会掉头发', cat: '衣', evidence: 'C', cost: '低', time: '5分钟', audience: ['担心洗头掉发的人', '油性头皮', '头皮屑多的人', '长发人群'] },
  { slug: 'sunscreen-use', q: '防晒霜怎么涂才有用', cat: '衣', evidence: 'B', cost: '低', time: '5分钟', audience: ['夏天户外的人', '每天通勤的人', '带孩子的家长', '用酸类护肤的人'] },
  { slug: 'after-sun', q: '晒伤和晒后怎么处理', cat: '衣', evidence: 'B', cost: '低', time: '15分钟', audience: ['户外活动的人', '去海边旅行的人', '带孩子的家长', '皮肤敏感的人'] },
  { slug: 'hand-foot-nail-care', q: '手脚干裂和指甲怎么护理', cat: '衣', evidence: 'C', cost: '低', time: '15分钟', audience: ['手脚皲裂的人', '做家务多的人', '中老年人', '常穿高跟鞋或运动鞋的人'] },
  { slug: 'shaving', q: '刮胡子怎么刮不伤皮肤', cat: '衣', evidence: 'C', cost: '低', time: '5分钟', audience: ['每天刮胡子的人', '容易刮出红点的人', '敏感肌', '想减少毛茬刺激的人'] },

  // ---- 居家卫生：洗手与毛巾是高频但没人讲清楚的 ----
  { slug: 'handwashing', q: '洗手要怎么洗才有用', cat: '住', evidence: 'A', cost: '免费', time: '5分钟', audience: ['所有家庭', '有婴幼儿的家庭', '做饭的人', '经常外出的人'] },
  { slug: 'towels-bedding', q: '毛巾和床品多久换洗', cat: '住', evidence: 'C', cost: '低', time: '15分钟', audience: ['所有家庭', '长痘或皮肤敏感的人', '过敏和哮喘人群', '租房族'] },
  { slug: 'ear-care', q: '耳朵进水、耳垢要不要掏', cat: '健康管理', evidence: 'B', cost: '免费', time: '5分钟', audience: ['游泳的人', '习惯掏耳朵的人', '耳朵闷堵的人', '给孩子掏耳朵的家长'] },
  { slug: 'toilet-hygiene', q: '马桶和卫生间怎么清洁才安全', cat: '住', evidence: 'C', cost: '低', time: '30分钟', audience: ['所有家庭', '合租的人', '做家务多的人', '有婴幼儿的家庭'] },

  // ---- 女性健康：99 条里最大的空白 ----
  { slug: 'menstrual-care', q: '经期不适怎么缓解、卫生用品怎么选', cat: '健康管理', evidence: 'B', cost: '低', time: '15分钟', audience: ['来月经的人', '经期腹痛明显的人', '青春期的孩子和家长', '经期不规律的人'] },
  { slug: 'contraception', q: '常见避孕方式怎么选', cat: '健康管理', evidence: 'A', cost: '中', time: '30分钟', audience: ['有性生活的人', '备孕前想了解的人', '产后人群', '对紧急避孕有疑问的人'] },

  // ---- 运动与日常动作 ----
  { slug: 'lifting-technique', q: '搬东西怎么搬不伤腰', cat: '行', evidence: 'B', cost: '免费', time: '5分钟', audience: ['需要搬重物的人', '腰不好的人', '搬家或装修的人', '有孩子要抱的家长'] },
  { slug: 'hydration-signs', q: '怎么判断自己喝水够不够', cat: '食', evidence: 'B', cost: '免费', time: '5分钟', audience: ['不爱喝水的人', '运动人群', '老年人', '户外和高温作业的人'] },
  { slug: 'caffeine-timing', q: '咖啡因什么时候喝、喝多少', cat: '食', evidence: 'B', cost: '低', time: '5分钟', audience: ['每天喝咖啡的人', '睡不好的人', '需要提神的上班族', '学生'] },
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
  await writeFile(target, tpl, { encoding: 'utf-8' });
  created.push(item.slug);
}

console.log(`\n[OK] 新建 ${created.length} 个骨架，跳过 ${skipped.length} 个已存在的`);
if (created.length) console.log(`     ${created.join(', ')}`);
console.log('\n提醒：summary 和 sources 还是 TODO，补完之前构建会故意失败。\n');
