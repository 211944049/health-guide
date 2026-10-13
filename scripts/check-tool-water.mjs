/**
 * 饮水工具体检。
 *
 * 为什么单独一个脚本：这个工具有一类别的工具没有的风险——
 * **它显示的数字必须和权威词条一致**。如果 `daily-water.md` 更新了推荐量
 * （比如指南改版），而工具里的 1700/1500 没跟着改，站点就会自相矛盾：
 * 词条说 1700，工具却按别的数字提示。构建不会报错，页面上也看不出来。
 *
 * 另外它有三个「安全相关」的内容要求，都是刻意写进页面的，必须验证还在：
 *   1. 明确警告心衰/肾病/透析/限液人群**不能照这个量喝**
 *   2. 明确说明目标是**最低建议量，不是上限**（避免"喝够就停"的误解）
 *   3. 明确警告**不要在短时间内猛灌**（低钠血症风险）
 *
 * 用法：node scripts/check-tool-water.mjs
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const problems = [];

const page = await readFile(path.join(distDir, 'tools', 'water', 'index.html'), 'utf8').catch(() => null);
if (!page) {
  console.error('\n[X] 找不到 dist/tools/water/index.html（工具页没有产出）\n');
  process.exit(1);
}

console.log('\n饮水工具体检');

/* ---------- 1. 数值必须与权威词条一致 ---------- */

const entrySrc = await readFile(path.join(root, 'src', 'content', 'entries', 'daily-water.md'), 'utf8');

// 从词条里抓推荐量（表格：成年男性 1700 ml / 成年女性 1500 ml）
const male = entrySrc.match(/成年男性\s*\|\s*(\d+)\s*ml/)?.[1];
const female = entrySrc.match(/成年女性\s*\|\s*(\d+)\s*ml/)?.[1];
// 每次一杯的量（正文：「每次 1 杯约 200 ml」）
const cup = entrySrc.match(/每次\s*1\s*杯约\s*(\d+)\s*ml/)?.[1];

console.log(`  词条 daily-water.md 里的数值：男 ${male} ml / 女 ${female} ml / 每杯 ${cup} ml`);

/*
  ⚠️ 只看「数字出现在页面上某处」是不够的——**这个检查第一版就是这么写的，被反向验证证伪了**：
  探针把工具里的 1700 全改成 1800，但因为页面上别处（正文段落、结论摘要、注释）仍有 1700，
  检查照样通过。也就是说「页面上有 1700」并不能保证**实际生效的数值**是 1700。

  所以改成检查**真正决定行为的渲染点**：
    · 目标选择器的 option value
    · 自定义目标的默认 value
    · JS 里 goal 的初始值
*/
const selectHtml = page.match(/<select id="goal-source">[\s\S]*?<\/select>/)?.[0] ?? '';
const optionValues = [...selectHtml.matchAll(/<option value="(\d+)"/g)].map((m) => m[1]);
const customDefault = page.match(/id="custom-goal"[^>]*value="(\d+)"/)?.[1];
const goalInit = page.match(/var goal = (\d+);/)?.[1];

console.log(`  渲染点：选项值 [${optionValues.join(', ')}] / 自定义默认 ${customDefault} / JS 初始 ${goalInit}`);

if (!male || !female) {
  problems.push('没能从 daily-water.md 里解析出推荐量（表格格式可能变了）—— 本检查需要同步更新');
} else {
  if (!optionValues.includes(male)) {
    problems.push(`目标选择器里没有男性的 ${male} ml 选项（实际选项值：${optionValues.join(', ') || '无'}）`);
  } else {
    console.log(`  ✓ 选择器含男性选项 ${male}`);
  }
  if (!optionValues.includes(female)) {
    problems.push(`目标选择器里没有女性的 ${female} ml 选项（实际选项值：${optionValues.join(', ') || '无'}）`);
  } else {
    console.log(`  ✓ 选择器含女性选项 ${female}`);
  }
  if (customDefault && customDefault !== male) {
    problems.push(`自定义目标的默认值是 ${customDefault}，但男性推荐量是 ${male} —— 应保持一致或明确说明`);
  }
  if (goalInit && goalInit !== male) {
    problems.push(`JS 里 goal 的初始值是 ${goalInit}，但男性推荐量是 ${male} —— 应保持一致`);
  }
}

if (cup && !page.includes(cup)) {
  problems.push(`工具页面里找不到词条中的单杯量 ${cup} ml`);
} else if (cup) {
  console.log(`  ✓ 页面含单杯量 ${cup}`);
}

// 工具页里不应出现与词条冲突的其他推荐量
const suspicious = [...page.matchAll(/\b(1[0-9]{3}|[2-9][0-9]{3})\s*ml/g)].map((m) => m[1]);
const allowed = new Set([male, female, cup, '500', '300', '100', '1000'].filter(Boolean));
const unexpected = [...new Set(suspicious)].filter((v) => !allowed.has(v));
if (unexpected.length) {
  console.log(`  ⚠️ 页面里还有这些 ml 数值（确认是有意为之）：${unexpected.join(', ')}`);
}

/* ---------- 2. 三条安全相关内容必须在 ---------- */

/*
  ⚠️ 这里必须先定位安全块、再检查块内内容，**不能在整页上做关键词匹配**。
  第一版就是整页匹配，而页面别处有「不能用含糖饮料代替白水」——
  那句话里的「不能」让「限液人群警告」的断言在块被删掉后也照样通过。
  这是反向验证（把块里的关键短语删掉）抓出来的假阳性。
*/
const limitFluidBlock =
  page.match(/<p class="notice" data-safety-notice="limit-fluid">([\s\S]*?)<\/p>/)?.[1] ?? '';

const safety = [
  {
    label: '限液人群警告',
    // 必须在**这个块内**点名这几类人，并给出明确的执行指引
    test: () =>
      limitFluidBlock.length > 0 &&
      /心(力)?衰|心力?衰竭/.test(limitFluidBlock) &&
      /(肾|透析)/.test(limitFluidBlock) &&
      /必须按医生|遵医嘱/.test(limitFluidBlock) &&
      /不要用本工具|不能|限制饮水/.test(limitFluidBlock),
    hint: '必须在 data-safety-notice="limit-fluid" 块内点名心衰/肾病/透析/限液人群，并明确不能照这个量喝',
  },
  {
    label: '「目标不是上限」说明',
    test: (h) => /不是上限|最低建议量|继续喝没问题/.test(h),
    hint: '必须说明推荐量是最低建议量，避免"喝够就停"的误解',
  },
  {
    label: '短时间猛灌的警告',
    test: (h) => /低钠|短时间内猛灌|1 小时|一小时/.test(h),
    hint: '必须警告短时间大量饮水的低钠血症风险',
  },
  {
    label: '不外传数据 / 本地说明',
    test: (h) => /本地|不会上传|不发送/.test(h),
    hint: '健康数据敏感，应说明记录只在本地',
  },
];

for (const s of safety) {
  const ok = s.test(page);
  console.log(`  ${ok ? '✓' : '✗'} ${s.label}`);
  if (!ok) problems.push(`${s.label}缺失：${s.hint}`);
}

/* ---------- 3. 交互元素与关键行为 ---------- */

for (const id of ['goal-source', 'custom-goal', 'water-total', 'water-progress', 'water-undo', 'water-reset', 'water-interval', 'water-status']) {
  if (!page.includes(`id="${id}"`)) problems.push(`缺少 id="${id}" 的元素`);
}

// 记录按钮
const addButtons = (page.match(/data-add="\d+"/g) ?? []).length;
if (addButtons < 3) problems.push(`快捷记录按钮只有 ${addButtons} 个，太少（建议 ≥3）`);
else console.log(`  ✓ 快捷记录按钮 ${addButtons} 个`);

// 用时间戳算间隔，不用递减计数（后台标签页会被节流）
if (!/Date\.now\(\)/.test(page) || !/lastDrinkAt/.test(page)) {
  problems.push('提醒没有用 Date.now()/lastDrinkAt 做时间戳比较（后台标签页会被节流，提醒会失准）');
}
if (!/visibilitychange/.test(page)) {
  problems.push('没有处理 visibilitychange（切回页面时不会校正提醒时间）');
}
/*
  刻意不用 localStorage：如果将来有人加上，这里要能提醒它需要重新考虑限液人群的问题。

  ⚠️ 必须先剥掉注释再检查——第一版直接匹配整页，结果**匹配到了我自己的注释**
  「1. **不用 localStorage。**」而误报。这个坑本项目记过一次（HANDOFF 坑清单：
  「用正则匹配源码前先剥注释，否则会被自己写的『不要这么做』的警告注释误报」），
  这次又踩了。所以这里先剥 /* *\/ 和 // 注释。
*/
const pageCode = page
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

if (/\blocalStorage\b/.test(pageCode)) {
  problems.push(
    '用了 localStorage —— 需要重新考虑：持久保存一个"你每天该喝多少"的目标，' +
      '对心衰/肾病/限液人群是有害的默认值。若确实要持久化，必须加上显眼的适用性提示',
  );
} else {
  console.log('  ✓ 未使用 localStorage（符合"会话记账本"而非"处方"的定位）');
}

/* ---------- 4. 可到达性 ---------- */

const toolsIndex = await readFile(path.join(distDir, 'tools', 'index.html'), 'utf8');
const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
if (!toolsIndex.includes('/tools/water/')) problems.push('/tools/ 目录页没有列出饮水工具');
if (!home.includes('/tools/water/')) problems.push('首页没有饮水工具的入口');
else console.log('  ✓ 首页与工具目录都有入口');

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 饮水工具的数值与词条一致，安全提示齐全。\n');
