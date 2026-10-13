/**
 * 给词条写入 related（相关词条）字段。
 *
 * 为什么需要脚本而不是手改 50 个文件：related 的正确性依赖**双向对称**
 * （A 推荐 B，则 B 也应推荐 A），手工维护必然出现单向箭头。
 * 这里用一份显式映射，脚本负责：
 *   1. 校验映射里每个 slug 都真实存在
 *   2. 校验双向对称（不满足就直接报错，不写入）
 *   3. 把 related 写进 frontmatter，已存在则跳过
 *
 * 用法：
 *   node scripts/apply-related.mjs          # 只检查，不写文件
 *   node scripts/apply-related.mjs --write  # 实际写入
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');
const write = process.argv.includes('--write');

/*
  关联关系表：slug -> 相关 slug 列表（每条 3–4 个）。
  关系依据是「读者读完这条，最可能接着想知道什么」，不是关键词相似度。
  注意：脚本会检查双向对称，所以下面必须是「互相都写」的。
*/
const RELATED = {
  // ---- 食 ----
  'daily-water': ['water-purifier-choice', 'coffee', 'daily-steps', 'alcohol'],
  'sugar-substitutes': ['nutrition-label', 'oil-salt-sugar', 'staple-food', 'supplements'],
  'supplements': ['protein', 'sugar-substitutes', 'health-checkup', 'daily-water'],
  'coffee': ['daily-water', 'insomnia', 'screen-time', 'alcohol'],
  'alcohol': ['coffee', 'insomnia', 'when-to-see-a-doctor', 'daily-water'],
  'staple-food': ['protein', 'oil-salt-sugar', 'nutrition-label', 'sugar-substitutes'],
  'protein': ['strength-training', 'staple-food', 'supplements', 'running-knee-health'],
  'oil-salt-sugar': ['nutrition-label', 'staple-food', 'takeout-ordering', 'sugar-substitutes'],
  'leftovers': ['nutrition-label', 'cleaning-products', 'when-to-see-a-doctor', 'takeout-ordering'],
  'canteen-eating': ['takeout-ordering', 'nutrition-label', 'oil-salt-sugar'],
  'takeout-ordering': ['canteen-eating', 'oil-salt-sugar', 'nutrition-label', 'leftovers'],
  'nutrition-label': ['sugar-substitutes', 'oil-salt-sugar', 'staple-food', 'takeout-ordering'],

  // ---- 衣 ----
  'sun-protective-clothing': ['sunscreen-choice', 'underwear-material', 'lighting'],
  'sunscreen-choice': ['sun-protective-clothing', 'underwear-material', 'when-to-see-a-doctor'],
  'commuter-shoes': ['running-shoes', 'commute-exercise', 'sedentary-breaks', 'underwear-material'],
  'underwear-material': ['laundry-detergent', 'sportswear', 'sun-protective-clothing', 'sunscreen-choice'],
  'warmth': ['sportswear', 'sleep-environment', 'underwear-material', 'humidity'],
  'sportswear': ['warmth', 'running-shoes', 'running-knee-health', 'laundry-detergent'],
  'laundry-detergent': ['humidity', 'underwear-material', 'sportswear', 'cleaning-products'],

  // ---- 住 ----
  'mold-prevention': ['humidity', 'air-purifier-choice', 'cleaning-products', 'laundry-detergent'],
  'humidity': ['mold-prevention', 'laundry-detergent', 'air-purifier-choice', 'sleep-environment'],
  'water-purifier-choice': ['daily-water', 'water-dispenser-cleaning', 'formaldehyde-testing'],
  'water-dispenser-cleaning': ['water-purifier-choice', 'daily-water', 'cleaning-products'],
  'lighting': ['blue-light-glasses', 'screen-time', 'sleep-environment', 'sun-protective-clothing'],
  'blue-light-glasses': ['lighting', 'screen-time', 'insomnia'],
  'noise-reduction': ['earplugs', 'white-noise', 'sleep-environment', 'insomnia'],
  'earplugs': ['noise-reduction', 'white-noise', 'sleep-environment'],
  'white-noise': ['noise-reduction', 'earplugs', 'sleep-environment', 'insomnia'],
  'cleaning-products': ['mold-prevention', 'laundry-detergent', 'air-purifier-choice', 'water-dispenser-cleaning'],
  'air-purifier-choice': ['formaldehyde-testing', 'humidity', 'mold-prevention', 'cleaning-products'],
  'formaldehyde-testing': ['air-purifier-choice', 'mold-prevention', 'when-to-see-a-doctor', 'water-purifier-choice'],

  // ---- 行 ----
  'commute-exercise': ['sedentary-breaks', 'daily-steps', 'strength-training', 'running-knee-health'],
  'running-knee-health': ['running-shoes', 'strength-training', 'stretching', 'commuter-shoes'],
  'running-shoes': ['running-knee-health', 'commuter-shoes', 'stretching', 'sportswear'],
  'strength-training': ['stretching', 'protein', 'commute-exercise', 'running-knee-health'],
  'stretching': ['strength-training', 'running-knee-health', 'sedentary-breaks', 'sportswear'],
  'sedentary-breaks': ['daily-steps', 'commute-exercise', 'stretching', 'sleep-environment'],
  'daily-steps': ['sedentary-breaks', 'commute-exercise', 'daily-water', 'sleep-environment'],
  'jet-lag': ['insomnia', 'sleep-environment', 'screen-time', 'mosquito-protection', 'daily-water'],
  'mosquito-protection': ['sun-protective-clothing', 'when-to-see-a-doctor', 'sunscreen-choice'],

  // ---- 身心 ----
  'insomnia': ['sleep-environment', 'noise-reduction', 'screen-time', 'when-to-seek-mental-health-help'],
  'sleep-environment': ['insomnia', 'noise-reduction', 'lighting', 'humidity'],
  'nap-length': ['insomnia', 'sleep-environment', 'screen-time', 'coffee'],
  'screen-time': ['insomnia', 'blue-light-glasses', 'stress-management', 'lighting'],
  'stress-management': ['screen-time', 'insomnia', 'when-to-seek-mental-health-help', 'strength-training'],
  'when-to-seek-mental-health-help': ['insomnia', 'stress-management', 'when-to-see-a-doctor', 'screen-time'],

  // ---- 健康管理 ----
  'health-checkup': ['when-to-see-a-doctor', 'adult-vaccines', 'oral-care', 'supplements'],
  'adult-vaccines': ['health-checkup', 'oral-care', 'when-to-see-a-doctor'],
  'oral-care': ['health-checkup', 'adult-vaccines', 'when-to-see-a-doctor', 'toothbrush'],
  'when-to-see-a-doctor': ['health-checkup', 'when-to-seek-mental-health-help', 'adult-vaccines', 'oral-care'],

  // ---- 第二批（2026-10-09 新增 19 条）----
  // 健康管理（原有只有 4 条，这批补得最多）
  'blood-pressure-at-home': ['oil-salt-sugar', 'reading-test-results', 'when-to-see-a-doctor', 'medicine-storage', 'daily-steps', 'stress-management'],
  'medicine-storage': ['first-aid-kit', 'blood-pressure-at-home', 'when-to-see-a-doctor', 'prepare-for-visit'],
  'first-aid-kit': ['medicine-storage', 'when-to-see-a-doctor', 'kitchen-fumes', 'prepare-for-visit'],
  'reading-test-results': ['health-checkup', 'blood-pressure-at-home', 'when-to-see-a-doctor', 'prepare-for-visit'],
  'prepare-for-visit': ['when-to-see-a-doctor', 'reading-test-results', 'medicine-storage', 'health-checkup'],
  // 身心
  'meditation': ['stress-management', 'stress-eating', 'insomnia', 'screen-time'],
  'stress-eating': ['stress-management', 'meditation', 'snack-choice', 'fruit-intake'],
  // 行
  'swimming': ['strength-training', 'stretching', 'muscle-soreness', 'running-knee-health', 'daily-steps'],
  'muscle-soreness': ['strength-training', 'stretching', 'sports-drink', 'protein'],
  'sports-drink': ['daily-water', 'muscle-soreness', 'swimming', 'dairy-choice'],
  // 食
  'breakfast': ['staple-food', 'protein', 'dairy-choice', 'nutrition-label'],
  'dairy-choice': ['protein', 'breakfast', 'supplements', 'nutrition-label'],
  'snack-choice': ['nutrition-label', 'sugar-substitutes', 'stress-eating', 'fruit-intake'],
  'fruit-intake': ['staple-food', 'sugar-substitutes', 'nutrition-label', 'snack-choice'],
  'soup-nutrition': ['protein', 'oil-salt-sugar', 'leftovers', 'nutrition-label'],
  // 住
  'kitchen-fumes': ['air-purifier-choice', 'first-aid-kit', 'mold-prevention', 'formaldehyde-testing'],
  'pillow-choice': ['sleep-environment', 'humidity', 'insomnia', 'noise-reduction'],
  // 衣
  'laundry-frequency': ['laundry-detergent', 'underwear-material', 'humidity', 'mold-prevention'],
  'winter-accessories': ['warmth', 'sportswear', 'sleep-environment', 'stretching'],

  // ---- 第三批（2026-10-09 新增 11 条）----
  // 身心
  'overtime-health': ['sleep-environment', 'sedentary-breaks', 'stress-management', 'coffee', 'emotion-regulation', 'low-energy'],
  'emotion-regulation': ['stress-management', 'meditation', 'overtime-health', 'insomnia', 'stress-eating'],
  'low-energy': ['sleep-environment', 'insomnia', 'daily-steps', 'stress-management', 'breakfast', 'meditation'],
  // 健康管理
  'quit-smoking': ['when-to-see-a-doctor', 'alcohol', 'stress-management', 'adult-vaccines'],
  'fall-prevention': ['strength-training', 'blood-pressure-at-home', 'medicine-storage', 'pillow-choice', 'mattress-choice'],
  'painkiller-safety': ['medicine-storage', 'when-to-see-a-doctor', 'prepare-for-visit', 'alcohol'],
  // 住
  'carbon-monoxide': ['kitchen-fumes', 'formaldehyde-testing', 'first-aid-kit', 'air-purifier-choice'],
  'mattress-choice': ['pillow-choice', 'sleep-environment', 'humidity', 'mold-prevention', 'fall-prevention'],
  'secondhand-furniture': ['formaldehyde-testing', 'mold-prevention', 'humidity', 'air-purifier-choice'],
  // 行
  'hiking-basics': ['daily-steps', 'muscle-soreness', 'sunscreen-choice', 'mosquito-protection', 'warmth', 'sports-drink'],
  // 食
  'cured-meat': ['oil-salt-sugar', 'nutrition-label', 'fruit-intake', 'leftovers'],

  // ---- 第四批（2026-10-11 新增 16 条）----
  // 健康管理
  'drug-interactions': ['medicine-storage', 'painkiller-safety', 'supplement-interactions', 'when-to-see-a-doctor', 'blood-pressure-at-home', 'prepare-for-visit'],
  'supplement-interactions': ['drug-interactions', 'supplements', 'painkiller-safety', 'medicine-storage'],
  'blood-sugar-home': ['blood-pressure-at-home', 'reading-test-results', 'lab-report-basics', 'sock-choice', 'daily-steps', 'staple-food'],
  'lab-report-basics': ['reading-test-results', 'health-checkup', 'blood-sugar-home', 'prepare-for-visit'],
  // 衣（本批重点：补最薄的分类）
  'fabric-labels': ['underwear-material', 'sportswear', 'laundry-frequency', 'underwear-replacement', 'sock-choice'],
  'underwear-replacement': ['underwear-material', 'fabric-labels', 'laundry-frequency', 'laundry-detergent'],
  'sock-choice': ['commuter-shoes', 'running-shoes', 'fabric-labels', 'sportswear', 'blood-sugar-home'],
  'clothing-storage': ['humidity', 'mold-prevention', 'laundry-frequency', 'fabric-labels'],
  // 身心
  'social-anxiety': ['stress-management', 'emotion-regulation', 'when-to-seek-mental-health-help', 'meditation'],
  'phone-addiction': ['screen-time', 'racing-mind-at-night', 'sleep-environment', 'social-anxiety'],
  'racing-mind-at-night': ['insomnia', 'sleep-environment', 'meditation', 'phone-addiction', 'emotion-regulation'],
  // 住
  'household-pests': ['mold-prevention', 'humidity', 'cleaning-products', 'air-purifier-choice'],
  'secondhand-smoke': ['quit-smoking', 'air-purifier-choice', 'carbon-monoxide', 'mold-prevention', 'kitchen-fumes'],
  'old-building-water': ['water-purifier-choice', 'daily-water', 'water-dispenser-cleaning', 'formaldehyde-testing'],
  // 食
  'food-poisoning': ['leftovers', 'freezing-food', 'takeout-ordering', 'when-to-see-a-doctor', 'daily-water'],
  'freezing-food': ['food-poisoning', 'leftovers', 'nutrition-label'],

  // ---- 追加批（2026-10-11）：口腔工具 + 面部/身体护理 ----
  // 这三条是读者点名要的（刷牙细节、洗面奶、身体乳）。
  // 注意 toothbrush 与 oral-care 是「同一主题的细节 vs 总览」，互为强相关。
  'toothbrush': ['oral-care', 'health-checkup', 'when-to-see-a-doctor', 'lab-report-basics'],
  'face-wash': ['body-lotion', 'fabric-labels', 'laundry-detergent', 'underwear-replacement'],
  'body-lotion': ['face-wash', 'cleaning-products', 'laundry-detergent', 'fabric-labels', 'daily-water'],

  // ---- 第五批（2026-10-12 新增 16 条）----
  // 口腔：补齐 oral-care 里只提过一句的两件工具
  'flossing': ['oral-care', 'mouthwash', 'toothbrush', 'when-to-see-a-doctor'],
  'mouthwash': ['oral-care', 'flossing', 'toothbrush', 'when-to-see-a-doctor'],
  // 头发与皮肤：接续 face-wash / body-lotion
  'hair-washing': ['face-wash', 'body-lotion', 'when-to-see-a-doctor', 'lab-report-basics'],
  'sunscreen-use': ['after-sun', 'sun-protective-clothing', 'face-wash', 'sunscreen-choice'],
  'after-sun': ['sunscreen-use', 'sunscreen-choice', 'first-aid-kit', 'when-to-see-a-doctor', 'hydration-signs'],
  'hand-foot-nail-care': ['handwashing', 'sock-choice', 'body-lotion', 'winter-accessories', 'fall-prevention'],
  'shaving': ['face-wash', 'body-lotion', 'when-to-see-a-doctor', 'hand-foot-nail-care'],
  // 居家卫生
  'handwashing': ['food-poisoning', 'toilet-hygiene', 'towels-bedding', 'when-to-see-a-doctor'],
  'towels-bedding': ['humidity', 'mold-prevention', 'laundry-frequency', 'laundry-detergent', 'air-purifier-choice'],
  'toilet-hygiene': ['cleaning-products', 'handwashing', 'mold-prevention', 'fall-prevention', 'food-poisoning'],
  'ear-care': ['earplugs', 'when-to-see-a-doctor', 'swimming', 'noise-reduction'],
  // 女性健康（本批新增的重要空白）
  'menstrual-care': ['contraception', 'painkiller-safety', 'lab-report-basics', 'when-to-see-a-doctor', 'when-to-seek-mental-health-help'],
  'contraception': ['menstrual-care', 'when-to-see-a-doctor', 'prepare-for-visit', 'when-to-seek-mental-health-help'],
  // 运动与日常动作
  'lifting-technique': ['strength-training', 'muscle-soreness', 'sedentary-breaks', 'when-to-see-a-doctor', 'fall-prevention'],
  'hydration-signs': ['daily-water', 'sports-drink', 'coffee', 'food-poisoning', 'when-to-see-a-doctor'],
  'caffeine-timing': ['coffee', 'insomnia', 'racing-mind-at-night', 'daily-water', 'sleep-environment'],
};

/* ---------- 1. 校验种子映射 ---------- */

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const slugs = new Set(files.map((f) => f.replace(/\.md$/, '')));
const problems = [];

for (const [slug, list] of Object.entries(RELATED)) {
  if (!slugs.has(slug)) {
    problems.push(`映射里有不存在的词条：${slug}`);
    continue;
  }
  if (list.includes(slug)) problems.push(`${slug} 把自己列为相关词条`);
  if (new Set(list).size !== list.length) problems.push(`${slug} 的相关词条有重复`);
  for (const other of list) {
    if (!slugs.has(other)) problems.push(`${slug} 指向不存在的词条：${other}`);
  }
}

const missing = [...slugs].filter((s) => !RELATED[s] || RELATED[s].length === 0);
for (const s of missing) problems.push(`${s} 没有相关词条`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

/* ---------- 2. 闭合成对称图 ----------
   上面的 RELATED 是**种子**关系（只写「最该推荐的」），不必手工保证双向。
   这里把它当成无向图，再给每个词条挑最多 MAX_RELATED 个相关词条。

   为什么不能简单粗暴地「补反向边 + 切片」：那样会互相 push，把上限冲破
   （实测 insomnia 一度涨到 19 个）。所以分三步，且有界：
     1. 由种子关系建无向图
     2. 每个词条按「对方连接度」降序取前 MAX_RELATED 个
     3. 有界对称修正：补缺失的反向边；若因此超限，按同样规则淘汰连接度最低的
*/

/** 每个词条最多展示几个相关词条（太多反而失去引导作用）。 */
const MAX_RELATED = 8;
/** 对称修正后允许的硬上限，超过就淘汰。 */
const HARD_MAX = MAX_RELATED;

const undirected = Object.create(null);
for (const slug of slugs) undirected[slug] = new Set(RELATED[slug] ?? []);
for (const [slug, list] of Object.entries(RELATED)) {
  for (const other of list) undirected[other].add(slug);
}

/** 连接度：在无向图里连了多少条边。越高的越是「枢纽」。 */
const degree = Object.create(null);
for (const slug of slugs) degree[slug] = undirected[slug].size;

const pick = (slug) =>
  [...undirected[slug]]
    .sort((a, b) => {
      if (degree[b] !== degree[a]) return degree[b] - degree[a];
      return a.localeCompare(b);
    })
    .slice(0, MAX_RELATED);

const finalRelated = Object.create(null);
for (const slug of slugs) finalRelated[slug] = pick(slug);

// 第 3 步：有界对称修正。
// 补反向边时如果超限，就把「连接度最低的」那个（不含正在补的这个）淘汰掉。
for (let pass = 0; pass < 3; pass++) {
  let changed = false;
  for (const slug of slugs) {
    for (const other of [...finalRelated[slug]]) {
      if (finalRelated[other].includes(slug)) continue;
      finalRelated[other].push(slug);
      if (finalRelated[other].length > HARD_MAX) {
        // 淘汰连接度最低的，且不能淘汰刚补进来的 slug
        const victims = finalRelated[other]
          .filter((s) => s !== slug)
          .sort((a, b) => degree[a] - degree[b] || a.localeCompare(b));
        const drop = victims[0];
        finalRelated[other] = finalRelated[other].filter((s) => s !== drop);
        finalRelated[drop] = finalRelated[drop].filter((s) => s !== other);
      }
      changed = true;
    }
  }
  if (!changed) break;
}

// 最终校验：对称 + 非空 + 不超限 + 不含自己
for (const slug of slugs) {
  const list = finalRelated[slug];
  if (list.length === 0) problems.push(`${slug} 闭合后没有相关词条`);
  if (list.length > HARD_MAX) problems.push(`${slug} 相关词条 ${list.length} 个，超过上限 ${HARD_MAX}`);
  if (list.includes(slug)) problems.push(`${slug} 把自己列为相关词条`);
  if (new Set(list).size !== list.length) problems.push(`${slug} 相关词条有重复`);
  for (const other of list) {
    if (!finalRelated[other].includes(slug)) problems.push(`闭合后仍不对称：${slug} ↔ ${other}`);
  }
}

if (problems.length > 0) {
  console.error(`\n闭合后仍有 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 20)) console.error(`  ✗ ${p}`);
  process.exit(1);
}

const totalEdges = Object.values(finalRelated).reduce((n, l) => n + l.length, 0);
const seedEdges = Object.values(RELATED).reduce((n, l) => n + l.length, 0);
console.log(`\nrelated 关系图`);
console.log(`  种子关系 ${seedEdges} 条 → 闭合后 ${totalEdges} 对`);
console.log(`  词条 ${slugs.size} 条，全部有相关词条，平均 ${(totalEdges / slugs.size).toFixed(1)} 个/词条，上限 ${MAX_RELATED}`);
console.log(`  最核心的几条（连接度最高）：`);
for (const slug of [...slugs].sort((a, b) => degree[b] - degree[a]).slice(0, 5)) {
  console.log(`    · ${slug}（连接 ${degree[slug]} 条）`);
}

/* ---------- 3. 写入 frontmatter ---------- */

if (!write) {
  console.log('\n（这是检查模式，没有写入文件。加 --write 才写入）\n');
  process.exit(0);
}

/*
  ⚠️ 写入护栏（2026-10 补的）：曾经发生过一次词条文件被写空，排查后发现
  不是本脚本的插入逻辑（已在隔离目录用 fixture 验证过），而是外部对文件的
  read-modify-write 把它清掉了。但既然本脚本会整文件覆写，就必须自己保证
  「绝不用坏内容覆盖好文件」。所以写之前先做三项检查：
    1. 原文件为空 / 没有合法 frontmatter → 跳过并警告，不写
    2. 结果里必须仍有闭合的 frontmatter
    3. 结果的长度不能明显小于原文（防止意外截断）
  任一不满足就跳过该文件，宁可少写一个也不破坏内容。
*/
const MIN_KEEP_RATIO = 0.8;

let written = 0;
const skipped = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const full = path.join(dir, file);
  const text = await readFile(full, 'utf8');

  if (text.trim().length === 0) {
    skipped.push(`${file}（文件为空，拒绝写入——请先从备份恢复）`);
    continue;
  }

  const lines = text.split('\n');
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) {
    skipped.push(`${file}（没有闭合的 frontmatter，拒绝写入）`);
    continue;
  }

  const list = finalRelated[slug];
  const block = `related:\n${list.map((s) => `  - ${s}`).join('\n')}`;

  // 已有 related 就先删掉原块（可重复运行）
  const existing = lines.findIndex((l, i) => i > 0 && i < end && /^related:/.test(l));
  if (existing !== -1) {
    let stop = existing + 1;
    while (stop < end && /^\s+-\s/.test(lines[stop])) stop += 1;
    lines.splice(existing, stop - existing);
  }

  const newEnd = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (newEnd === -1) {
    skipped.push(`${file}（删除旧 related 后没有闭合 frontmatter，拒绝写入）`);
    continue;
  }

  const statusAt = lines.findIndex((l, i) => i > 0 && i < newEnd && /^status:/.test(l));
  const insertAt = statusAt !== -1 ? statusAt + 1 : newEnd;
  lines.splice(insertAt, 0, ...block.split('\n'));

  const result = lines.join('\n');

  // 写前校验
  if (!/^---\n[\s\S]*?\n---\n/.test(result)) {
    skipped.push(`${file}（结果缺少合法 frontmatter，拒绝写入）`);
    continue;
  }
  if (result.length < text.length * MIN_KEEP_RATIO) {
    skipped.push(`${file}（结果比原文短了 ${(100 - (result.length / text.length) * 100).toFixed(0)}%，疑似截断，拒绝写入）`);
    continue;
  }

  await writeFile(full, result, 'utf8');
  written += 1;
}

if (skipped.length > 0) {
  console.error(`\n⚠️ 跳过了 ${skipped.length} 个文件（没有写入）：`);
  for (const s of skipped) console.error(`  · ${s}`);
}

console.log(`\n✓ 已写入 ${written} 个文件\n`);
if (skipped.length > 0) process.exit(1);
