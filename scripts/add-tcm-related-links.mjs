/**
 * 把 5 条**真正相关**的现有词条链到新中医词条。
 *
 * ## ⚠️ 为什么只有 5 条（原本扫出 24 条）
 *
 * 第一版按关键词命中找机会，得到 24 条，但**逐条核对语境后大部分是假阳性**：
 *
 *   · `duvet-care` / `clothing-storage` 命中「湿气」，但那里的意思是**物理潮气**
 *     （「让夜间积聚的湿气散掉」「潮湿天气开柜反而引入湿气」），
 *     不是中医的"湿气"。**链过去就是错的。**
 *   · `drinkware-material` / `tableware-material` 命中「中药」，
 *     但讲的是**材质耐腐蚀性**（不锈钢不要长期装中药），不是药理相互作用。
 *   · `sunscreen-choice` 命中「中药」，讲的是**光敏反应**，不是相互作用。
 *   · `bottled-water` / `daily-water` / `hydration-signs` / `contraception` 命中「排毒」，
 *     它们真正需要链的是**「排毒」词条，而那条还没写**（第三梯队候选）。
 *
 * **这一轮验证了"按关键词自动加链接"是错的** —— 会让"相关词条"这个机制
 * 失去可信度。只有语境确实在讲那件事时才加。
 *
 * 用法：node scripts/add-tcm-related-links.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, writeAll } from './lib-batch.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

/** 要补的链接：slug → 新增的 related 目标。 */
const ADD = [
  ['ear-care', 'shanghuo'],                    // 「外耳道炎是上火」误区
  ['painkiller-safety', 'herb-drug-interaction'], // 「中药止痛药没副作用」误区 + 马兜铃酸
  ['soup-nutrition', 'herb-drug-interaction'],    // 汤里泡中药材 → 相互作用
  ['menstrual-care', 'acupuncture-pain'],        // 针灸/TENS 缓解痛经
  ['lifting-technique', 'tuina-massage'],        // 急性腰痛不要立刻推拿正骨
];

let changed = 0;
for (const [slug, target] of ADD) {
  const p = path.join(dir, `${slug}.md`);
  const t = await readFile(p, 'utf8');
  const block = t.match(/^(related:\n)((?:  - .*\n)*)/m);
  if (!block) {
    console.log(`  ✗ ${slug} 找不到 related 块`);
    continue;
  }
  if (block[2].includes(`- ${target}`)) {
    console.log(`  · ${slug} 已有 → ${target}`);
    continue;
  }
  // 插在 related 列表末尾（保持原有顺序，只追加）
  const items = block[2].trimEnd().split('\n');
  const newBlock = `related:\n${items.join('\n')}\n  - ${target}\n`;
  const out = t.replace(block[0], newBlock);
  await writeFile(p, out, 'utf8');
  changed += 1;
  console.log(`  ✓ ${slug} += ${target}`);
}

console.log(`\n  修改 ${changed} 个文件`);
console.log('  下一步：跑 fix-related-symmetry.mjs 让目标条目也指回来。');
