/**
 * 选题候选分析：枚举「读者会问、而站上没有对应词条」的具体问题。
 *
 * 与 analyze-coverage.mjs 的区别（那个脚本失败了，保留作反面教材）：
 *   那个脚本用一张「子主题探测表」去匹配现有词条，但表本身只覆盖了原 40 个选题的边界，
 *   所以结论永远是"都有覆盖"——它验证的是**表够不够宽**，不是内容够不够全。
 *   这个脚本改成：列出一批**具体的候选问题**，用词条标题/正文去匹配，
 *   逐一标注「已覆盖 / 部分覆盖 / 空白」，空白的就是真候选。
 *
 * 用法：node scripts/propose-topics.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

/*
  候选问题按分类列出。每条含：
    q      读者会问的问题（可作为词条标题）
    why    为什么值得写（证据强度 / 搜索量 / 与其他词条的衔接）
    keys   用于判断"是否已被现有词条覆盖"的关键词
    grade  预判证据等级（A/B/C/D），便于判断这一批的质量结构
*/
const CANDIDATES = [
  // ---- 健康管理（明显最薄：只有 4 条）----
  { cat: '健康管理', q: '家里的药怎么存、怎么扔', why: '几乎每家都有过期药；用药安全是高频且证据明确的主题', keys: ['药品储存', '过期药', '家庭药箱'], grade: 'B' },
  { cat: '健康管理', q: '家里该备哪些急救物品', why: '与「何时看医生」天然衔接；可给出清单，实用性强', keys: ['急救箱', '急救物品'], grade: 'B' },
  { cat: '健康管理', q: '在家怎么量血压', why: '高血压人群基数极大，测量方法错误会导致误判；有明确指南', keys: ['量血压', '血压测量'], grade: 'A' },
  { cat: '健康管理', q: '看医生前该准备什么', why: '提高就诊效率，减少漏说关键信息；与「何时看医生」互补', keys: ['就诊准备', '看病准备'], grade: 'C' },
  { cat: '健康管理', q: '体检报告上的箭头要紧吗', why: '体检类内容的下半场，读者最焦虑的部分', keys: ['体检报告', '化验单'], grade: 'B' },
  { cat: '健康管理', q: '什么时候该看急诊而不是门诊', why: '与「何时看医生」形成急诊/门诊的分工', keys: ['急诊'], grade: 'B' },

  // ---- 身心（6 条，偏少）----
  { cat: '身心', q: '压力大就想吃东西怎么办', why: '情绪性进食是极普遍的真实困扰，与「压力大怎么缓解」衔接', keys: ['情绪性进食', '压力性进食'], grade: 'C' },
  { cat: '身心', q: '冥想有用吗，怎么做', why: '被问得很多；正念有随机对照证据，需要区分有效与玄学', keys: ['冥想', '正念'], grade: 'B' },
  { cat: '身心', q: '怎么减少刷手机的时间', why: '与「屏幕时间怎么控制」是同一主题的另一切口，需判断是否重复', keys: ['刷手机'], grade: 'C' },
  { cat: '身心', q: '长期加班怎么把伤害降到最低', why: '中国职场高频处境；可整合睡眠、久坐、饮食几条', keys: ['加班'], grade: 'C' },

  // ---- 行（8 条，运动方向有缺口）----
  { cat: '行', q: '游泳怎么开始、注意什么', why: '常见运动方式，站上完全没有；有明确安全要点（如不要单独野泳）', keys: ['游泳'], grade: 'B' },
  { cat: '行', q: '骑车通勤要注意什么', why: '「通勤怎么增加运动量」提到骑车但没有展开；安全与装备有实际内容', keys: ['骑车', '骑行'], grade: 'C' },
  { cat: '行', q: '运动后肌肉酸痛要不要继续练', why: '几乎每个运动新手都问；与力量训练、拉伸衔接', keys: ['肌肉酸痛', '延迟性酸痛'], grade: 'B' },
  { cat: '行', q: '运动时该不该喝运动饮料', why: '与「每天喝多少水」互补，涉及糖和电解质；有明确适用边界', keys: ['运动饮料', '电解质'], grade: 'B' },
  { cat: '行', q: '感冒了还能运动吗', why: '高频疑问，有相对明确的原则（颈部以上/以下）', keys: ['感冒 运动'], grade: 'C' },
  { cat: '行', q: '怎么开始爬山或徒步', why: '户外人群增长快；与防晒、防蚊、保暖、鞋几条都能互链', keys: ['爬山', '徒步'], grade: 'C' },

  // ---- 衣（8 条，但都是"买什么"）----
  { cat: '衣', q: '衣服多久洗一次', why: '站上只有洗衣液怎么选，没有"该不该洗"；实用且可给出分品类频率', keys: ['多久洗', '衣服多久'], grade: 'C' },
  { cat: '衣', q: '围巾帽子手套怎么选', why: '「保暖怎么穿」的下沉细节；有实际保暖效果差异', keys: ['围巾', '帽子', '手套'], grade: 'C' },
  { cat: '衣', q: '拖鞋怎么选', why: '居家高频，与足部健康、老年人防跌倒相关', keys: ['拖鞋'], grade: 'C' },
  { cat: '衣', q: '衣服上的防晒标签怎么看', why: '与防晒衣衔接，但如果并入现有条目更好，需判断是否独立成条', keys: ['UPF'], grade: 'C' },

  // ---- 住（12 条，但缺"睡眠用品"和"厨房"）----
  { cat: '住', q: '枕头怎么选', why: '睡眠质量的高频影响因素；与睡眠环境、颈椎相关', keys: ['枕头'], grade: 'C' },
  { cat: '住', q: '床垫怎么选、多久换', why: '大件消费决策；与睡眠环境、防霉除螨衔接', keys: ['床垫'], grade: 'C' },
  { cat: '住', q: '厨房油烟怎么处理', why: '中式烹饪特有风险，与呼吸道健康相关；站上完全空白', keys: ['油烟', '抽油烟机'], grade: 'B' },
  { cat: '住', q: '燃气热水器和一氧化碳怎么防', why: '致命风险，且是冬季高频事故；有明确安全要求', keys: ['一氧化碳', '燃气'], grade: 'B' },
  { cat: '住', q: '二手家具和旧书会不会有污染', why: '租房族常见顾虑；与甲醛、防霉衔接', keys: ['二手家具'], grade: 'C' },
  { cat: '住', q: '养宠物对健康的影响', why: '过敏、寄生虫、心理健康三个方向都有内容；但可能偏离站点定位，需判断', keys: ['宠物', '养猫', '养狗'], grade: 'C' },

  // ---- 食（12 条，但缺"吃什么"的日常决策）----
  { cat: '食', q: '早餐吃什么', why: '一天里最高频的决策；现有词条没有一条正面回答', keys: ['早餐'], grade: 'B' },
  { cat: '食', q: '水果怎么吃、吃多少', why: '「控糖就不吃水果」是常见误区，值得单独澄清', keys: ['水果'], grade: 'B' },
  { cat: '食', q: '牛奶和奶制品怎么选', why: '乳糖不耐受、钙摄入、酸奶含糖都是实际问题', keys: ['牛奶', '酸奶', '奶制品'], grade: 'B' },
  { cat: '食', q: '零食怎么选', why: '与配料表、油盐糖衔接；是"看懂标签"的应用场景', keys: ['零食'], grade: 'B' },
  { cat: '食', q: '怎么吃能减重（不反弹）', why: '读者最关心的问题之一；可整合主食、蛋白质、油盐糖几条', keys: ['减重', '减肥'], grade: 'B' },
  { cat: '食', q: '腌制和熏制食品能不能吃', why: '与致癌风险相关，证据明确；中式饮食高频', keys: ['腌制', '熏制', '腊肉'], grade: 'B' },
  { cat: '食', q: '喝汤有营养吗', why: '「喝汤补身体」是普遍误区，与蛋白质、油盐糖衔接', keys: ['喝汤', '骨头汤'], grade: 'B' },
];

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const corpus = [];
for (const f of files) {
  const text = await readFile(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const title = (fm.match(/^title:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
  const category = (fm.match(/^category:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
  corpus.push({ slug: f.replace(/\.md$/, ''), title, category, body: text });
}

console.log(`\n选题候选分析：现有 ${corpus.length} 条词条，候选 ${CANDIDATES.length} 个问题\n`);

const blank = [];
const partial = [];

for (const c of CANDIDATES) {
  // 命中判断：同分类下，词条标题或正文出现关键词
  const hits = corpus.filter(
    (e) => e.category === c.cat && c.keys.some((k) => e.title.includes(k) || e.body.includes(k)),
  );
  const titleHit = hits.some((e) => c.keys.some((k) => e.title.includes(k)));

  let state;
  if (titleHit) state = '已覆盖';
  else if (hits.length) state = '部分覆盖';
  else state = '空白';

  if (state === '空白') blank.push({ ...c, hits });
  else if (state === '部分覆盖') partial.push({ ...c, hits });

  const mark = state === '空白' ? '[空白]' : state === '部分覆盖' ? '[部分]' : '[已有]';
  console.log(`${mark} ${c.cat} · ${c.q}  （预判证据 ${c.grade}）`);
  console.log(`       ${c.why}`);
  if (hits.length && state !== '已覆盖') {
    console.log(`       现有相关：${hits.map((e) => e.title).join('、')}`);
  }
}

console.log(`\n--- 汇总 ---`);
console.log(`空白（可独立成条）：${blank.length} 个`);
console.log(`部分覆盖（需判断是否独立成条，或并入现有条目）：${partial.length} 个`);

const byCat = {};
for (const b of blank) (byCat[b.cat] ??= []).push(b.q);
console.log('\n按分类看空白：');
for (const [cat, qs] of Object.entries(byCat)) {
  console.log(`  ${cat}（${qs.length}）：${qs.join('；')}`);
}

// 现有分类条数，用于判断哪一类最需要补
const catCount = {};
for (const e of corpus) catCount[e.category] = (catCount[e.category] ?? 0) + 1;
console.log('\n现有个数：' + Object.entries(catCount).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('');
