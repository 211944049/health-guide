/**
 * 批量创建第二批词条的骨架。
 *
 * 为什么要批量：第二批 22 条如果一条条手敲 new-entry 命令，
 * 容易写错 slug/分类，而且 Windows 下传中文参数还要处理引号（本项目已在这上面踩过坑）。
 * 这里用一张表（slug / 标题 / 分类 / 预设字段）一次性建好，然后人工填正文。
 *
 * ⚠️ 生成的骨架里 sources 是 TODO 占位，`pnpm build` 会因占位而失败——这是故意的：
 *    没补来源的词条不允许上线。所以这个脚本只负责建骨架，不负责让它通过构建。
 *
 * 用法：node scripts/scaffold-batch2.mjs [--force]
 *   不加 --force 时，已存在的文件会被跳过（不会覆盖你写好的内容）。
 */

import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');
const force = process.argv.includes('--force');

/*
  第二批选题。字段来源：
    · q        读者会问的问题（= 标题）
    · slug     URL 段
    · cat      分类
    · evidence 预判证据等级 —— 只是初判，写正文时若发现证据更强/更弱要改
    · cost/time/audience  预计的口径，写正文时按实际调整
  排序按「分类均衡」：健康管理最薄，先补它。
*/
const BATCH = [
  // ---- 健康管理（最薄：原有 4 条）----
  { slug: 'blood-pressure-at-home', q: '在家怎么量血压', cat: '健康管理', evidence: 'A', cost: '低', time: '15分钟', audience: ['高血压人群', '中老年人', '有家族史的人'] },
  { slug: 'medicine-storage', q: '家里的药怎么存、怎么扔', cat: '健康管理', evidence: 'B', cost: '免费', time: '30分钟', audience: ['所有家庭', '有老人或幼儿的家庭'] },
  { slug: 'first-aid-kit', q: '家里该备哪些急救物品', cat: '健康管理', evidence: 'B', cost: '中', time: '30分钟', audience: ['所有家庭', '独居者', '有幼儿的家庭'] },
  { slug: 'reading-test-results', q: '体检报告上的箭头要紧吗', cat: '健康管理', evidence: 'B', cost: '免费', time: '15分钟', audience: ['刚做完体检的人', '中老年人'] },
  { slug: 'prepare-for-visit', q: '看医生前该准备什么', cat: '健康管理', evidence: 'C', cost: '免费', time: '15分钟', audience: ['需要就诊的人', '陪老人看病的人'] },

  // ---- 身心 ----
  { slug: 'meditation', q: '冥想有用吗，怎么做', cat: '身心', evidence: 'B', cost: '免费', time: '15分钟', audience: ['压力大的人', '睡眠不好的人', '久坐上班族'] },
  { slug: 'stress-eating', q: '压力大就想吃东西怎么办', cat: '身心', evidence: 'C', cost: '免费', time: '15分钟', audience: ['情绪性进食的人', '压力大的上班族'] },

  // ---- 行 ----
  { slug: 'swimming', q: '游泳怎么开始、注意什么', cat: '行', evidence: 'B', cost: '中', time: '30分钟', audience: ['想开始游泳的人', '关节不适的人', '减重人群'] },
  { slug: 'muscle-soreness', q: '运动后肌肉酸痛要不要继续练', cat: '行', evidence: 'B', cost: '免费', time: '5分钟', audience: ['运动新手', '力量训练者', '跑步爱好者'] },
  { slug: 'sports-drink', q: '运动时该不该喝运动饮料', cat: '行', evidence: 'B', cost: '低', time: '5分钟', audience: ['运动人群', '马拉松跑者', '健身人群'] },

  // ---- 食 ----
  { slug: 'breakfast', q: '早餐吃什么', cat: '食', evidence: 'B', cost: '低', time: '5分钟', audience: ['上班族', '学生', '减重人群'] },
  { slug: 'dairy-choice', q: '牛奶和奶制品怎么选', cat: '食', evidence: 'B', cost: '低', time: '5分钟', audience: ['乳糖不耐受的人', '需要补钙的人', '有孩子的家庭'] },
  { slug: 'snack-choice', q: '零食怎么选', cat: '食', evidence: 'B', cost: '低', time: '5分钟', audience: ['上班族', '学生', '控糖人群'] },
  { slug: 'fruit-intake', q: '水果怎么吃、吃多少', cat: '食', evidence: 'B', cost: '低', time: '5分钟', audience: ['控糖人群', '减重人群', '糖尿病患者'] },
  { slug: 'soup-nutrition', q: '喝汤有营养吗', cat: '食', evidence: 'B', cost: '低', time: '5分钟', audience: ['家庭主厨', '术后恢复人群', '老年人'] },

  // ---- 住 ----
  { slug: 'kitchen-fumes', q: '厨房油烟怎么处理', cat: '住', evidence: 'B', cost: '中', time: '30分钟', audience: ['家庭主厨', '开放式厨房住户', '有呼吸道疾病的人'] },
  { slug: 'pillow-choice', q: '枕头怎么选', cat: '住', evidence: 'C', cost: '低', time: '15分钟', audience: ['睡不好的人', '颈肩不适的人'] },

  // ---- 衣 ----
  { slug: 'laundry-frequency', q: '衣服多久洗一次', cat: '衣', evidence: 'C', cost: '免费', time: '5分钟', audience: ['所有家庭', '皮肤敏感的人'] },
  { slug: 'winter-accessories', q: '围巾帽子手套怎么选', cat: '衣', evidence: 'C', cost: '低', time: '15分钟', audience: ['怕冷的人', '户外通勤人群', '老年人'] },
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
console.log('\n提醒：这些文件的 summary 和 sources 还是 TODO 占位，');
console.log('      在补完之前 `run.cmd build` 会**故意失败**——没来源的词条不允许上线。\n');
