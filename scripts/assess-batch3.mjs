/**
 * 第三批选题评估：判断「继续写内容」的边际收益，并给出候选排序。
 *
 * 为什么要做这个评估而不是直接写：
 *   前两批是「补缺口」——第一批 10 条 → 50 条，第二批按覆盖分析补最薄的分类（50 → 69）。
 *   到第三批时，**缺口已经变小**，所以要先算清楚：
 *     · 分类均衡度还剩多少提升空间？
 *     · 候选里有多少是「和现有词条高度重叠」的（写了等于重复）？
 *     · 有多少是「读者会搜、站上没有」的真空白？
 *   如果大部分候选都是重叠或长尾，那诚实结论是「该转做别的」，而不是硬写。
 *
 * 用法：node scripts/assess-batch3.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const entries = [];
for (const f of files) {
  const text = await readFile(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const title = (fm.match(/^title:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
  const category = (fm.match(/^category:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
  const evidence = (fm.match(/^evidence:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
  entries.push({ slug: f.replace(/\.md$/, ''), title, category, evidence, body: text });
}

/* ---------- 1. 分类均衡度 ---------- */

/*
  ⚠️ 分类列表**从 site.config.ts 读取，不写死**（2026-10-12 改）。

  原因：原来是 `const CATS = ['食','衣','住','行','身心','健康管理']`。
  这一轮新增了「护理」分类，如果这里不同步，这个评估脚本会**静默漏掉整个分类**
  （不报错，只是数字少了）—— 这类"配置改了但派生列表没跟上"是最难发现的隐患。
  现在唯一来源是 site.config.ts 的 CATEGORY_LABELS。
*/
const { CATEGORY_LABELS: CATS } = await import('../src/site.config.ts');

const counts = Object.fromEntries(CATS.map((c) => [c, entries.filter((e) => e.category === c).length]));
const values = Object.values(counts);
const mean = values.reduce((a, b) => a + b, 0) / values.length;
// 变异系数：越小越均衡
const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
const cv = sd / mean;

console.log('\n第三批选题评估\n');
console.log('='.repeat(64));
console.log('一、分类均衡度');
console.log('='.repeat(64));
for (const c of [...CATS].sort((a, b) => counts[a] - counts[b])) {
  const bar = '█'.repeat(counts[c]);
  console.log(`  ${c.padEnd(6)} ${String(counts[c]).padStart(2)}  ${bar}`);
}
console.log(`\n  平均 ${mean.toFixed(1)} 条/类，标准差 ${sd.toFixed(2)}，变异系数 ${cv.toFixed(3)}`);
console.log(`  最薄与最厚相差 ${Math.max(...values) - Math.min(...values)} 条`);

// 如果补到完全均衡，每类应有多少
const balanced = Math.round(mean);
console.log(`  若追求完全均衡，每类约 ${balanced} 条；当前差距：`);
for (const c of CATS) {
  const diff = balanced - counts[c];
  if (diff > 0) console.log(`    ${c} 还差 ${diff} 条`);
}

/* ---------- 2. 候选与现有内容的重叠度 ---------- */

/*
  重叠度用「候选关键词在现有词条正文里出现的词条数」衡量。
  出现得多 = 这个主题已经被反复讲过 = 新写一条大概率重复。
*/
const CANDIDATES = [
  { q: '长期加班怎么把伤害降到最低', cat: '身心', keys: ['加班', '熬夜', '轮班'] },
  { q: '感冒了还能运动吗', cat: '行', keys: ['感冒', '发热', '带病运动'] },
  { q: '二手家具和旧书会不会有污染', cat: '住', keys: ['二手家具', '旧书'] },
  { q: '燃气热水器和一氧化碳怎么防', cat: '住', keys: ['一氧化碳', '燃气'] },
  { q: '床垫怎么选、多久换', cat: '住', keys: ['床垫'] },
  { q: '怎么吃能减重（不反弹）', cat: '食', keys: ['减重', '减肥', '热量缺口'] },
  { q: '腌制和熏制食品能不能吃', cat: '食', keys: ['腌制', '熏制', '腊肉', '亚硝酸盐'] },
  { q: '骑车通勤要注意什么', cat: '行', keys: ['骑车', '骑行', '头盔'] },
  { q: '怎么开始爬山或徒步', cat: '行', keys: ['爬山', '徒步', '登山'] },
  { q: '怎么减少刷手机的时间', cat: '身心', keys: ['刷手机', '手机使用'] },
  { q: '养宠物对健康的影响', cat: '住', keys: ['宠物', '养猫', '养狗', '过敏原'] },
  { q: '衣服多久洗一次', cat: '衣', keys: ['多久洗', '清洗频率'] },
];

console.log('\n' + '='.repeat(64));
console.log('二、候选与现有内容的重叠度');
console.log('='.repeat(64));
console.log('  （「命中词条数」= 有多少条现有词条的正文提到相关关键词；越多说明越可能重复）\n');

const scored = CANDIDATES.map((c) => {
  const hits = entries.filter((e) => c.keys.some((k) => e.body.includes(k)));
  // 标题级命中：已经有专门的词条讲这个
  const titleHit = entries.some((e) => c.keys.some((k) => e.title.includes(k)));
  return { ...c, hitCount: hits.length, titleHit, hitTitles: hits.map((h) => h.title) };
}).sort((a, b) => a.hitCount - b.hitCount);

for (const c of scored) {
  const verdict = c.titleHit ? '【已有专条，别写】' : c.hitCount <= 2 ? '【真空白，值得写】' : c.hitCount <= 5 ? '【部分覆盖，需设计】' : '【重叠高，慎写】';
  console.log(`  ${verdict} ${c.cat} · ${c.q}`);
  console.log(`      命中 ${c.hitCount} 条现有词条${c.hitTitles.length ? `：${c.hitTitles.slice(0, 4).join('、')}${c.hitTitles.length > 4 ? '…' : ''}` : ''}`);
}

/* ---------- 3. 结论 ---------- */

const realGaps = scored.filter((c) => !c.titleHit && c.hitCount <= 2);
const partial = scored.filter((c) => !c.titleHit && c.hitCount > 2 && c.hitCount <= 5);
const overlap = scored.filter((c) => c.titleHit || c.hitCount > 5);

console.log('\n' + '='.repeat(64));
console.log('三、结论');
console.log('='.repeat(64));
console.log(`  真空白（可直接写）：${realGaps.length} 条`);
for (const c of realGaps) console.log(`    · ${c.cat} · ${c.q}`);
console.log(`  部分覆盖（需要设计，避免与现有条目重复）：${partial.length} 条`);
for (const c of partial) console.log(`    · ${c.cat} · ${c.q}`);
console.log(`  重叠高或已有专条（不建议写）：${overlap.length} 条`);
for (const c of overlap) console.log(`    · ${c.cat} · ${c.q}`);

const thinnest = [...CATS].sort((a, b) => counts[a] - counts[b]).slice(0, 2);
console.log(`\n  最需要补的分类：${thinnest.join('、')}`);
console.log(`  内容线的边际收益：${realGaps.length >= 4 ? '仍有真空白，值得再写一批' : '真空白已很少，建议转做分发与专题'}`);
console.log('');
