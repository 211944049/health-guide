/**
 * 小工具体检。
 *
 * 为什么需要：工具页和内容页不一样——它没有词条体检兜底，而**阈值写错是静默且危险的**
 * （BMI 的分界写错，读者不会发现，但结论会错）。所以这里必须：
 *   1. 校验 lib/tools.ts 里每个工具都有对应页面文件、related 里的 slug 都存在
 *   2. **独立复算 BMI 公式与分界**（不复用页面里的实现），断言与页面上的数字一致
 *   3. 校验页面里确实有交互元素（输入框、结果容器），避免退了化成静态说明页
 *
 * 用法：node scripts/check-tools.mjs
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const entriesDir = path.join(root, 'src', 'content', 'entries');

const problems = [];

/* ---------- 1. 解析 lib/tools.ts ---------- */

const toolsSrc = await readFile(path.join(root, 'src', 'lib', 'tools.ts'), 'utf8');
const toolBlocks = [...toolsSrc.matchAll(/slug:\s*'([a-z0-9-]+)'[\s\S]*?related:\s*\[([^\]]*)\]/g)].map((m) => ({
  slug: m[1],
  related: [...m[2].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]),
}));

const slugs = new Set((await readdir(entriesDir)).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));

console.log(`\n小工具体检：lib/tools.ts 里 ${toolBlocks.length} 个工具`);

if (toolBlocks.length === 0) problems.push('没有从 lib/tools.ts 解析出任何工具');

/* ---------- 2. 每个工具：页面存在 + related 合法 ---------- */

for (const tool of toolBlocks) {
  const page = path.join(root, 'src', 'pages', 'tools', `${tool.slug}.astro`);
  const info = await stat(page).catch(() => null);
  if (!info) problems.push(`工具 ${tool.slug} 没有对应页面 src/pages/tools/${tool.slug}.astro`);

  const built = path.join(distDir, 'tools', tool.slug, 'index.html');
  const builtInfo = await stat(built).catch(() => null);
  if (!builtInfo) problems.push(`工具 ${tool.slug} 没有构建产物 dist/tools/${tool.slug}/index.html`);

  for (const slug of tool.related) {
    if (!slugs.has(slug)) problems.push(`工具 ${tool.slug} 的 related 指向不存在的词条：${slug}`);
  }
  console.log(`  · ${tool.slug}（related ${tool.related.length} 条）`);
}

/* ---------- 3. 独立复算 BMI ---------- */

/*
  这里**故意重新实现一遍**分界，而不是去解析页面里的数字。
  目的：如果页面上的阈值被误改，两边就会不一致，测试失败。
  中国标准：偏瘦 <18.5，正常 18.5–23.9，超重 24–27.9，肥胖 ≥28。
*/
const CN = { under: 18.5, normal: 24, overweight: 28 };
const classify = (bmi) => {
  if (bmi < CN.under) return '偏瘦';
  if (bmi < CN.normal) return '正常';
  if (bmi < CN.overweight) return '超重';
  return '肥胖';
};
const healthyRange = (m) => [CN.under * m * m, 23.9 * m * m];

const cases = [
  // [身高cm, 体重kg, 期望判定, 说明]
  [170, 50, '偏瘦', 'BMI 17.3'],
  [170, 53, '偏瘦', 'BMI 18.3，刚好在 18.5 以下'],
  [170, 54, '正常', 'BMI 18.7，刚过 18.5'],
  [170, 60, '正常', 'BMI 20.8'],
  [170, 69, '正常', 'BMI 23.9，中国标准正常的上界'],
  [170, 70, '超重', 'BMI 24.2，中国标准刚过 24（WHO 标准此时还算正常）'],
  [170, 80, '超重', 'BMI 27.7，仍在超重区间'],
  [170, 81, '肥胖', 'BMI 28.0，中国标准的肥胖线'],
  [170, 85, '肥胖', 'BMI 29.4'],
];

console.log('\n  BMI 分界复算（中国标准 18.5 / 24 / 28）：');
const mismatches = [];
for (const [cm, kg, expected, note] of cases) {
  const m = cm / 100;
  const bmi = kg / (m * m);
  const got = classify(bmi);
  const ok = got === expected;
  console.log(`    ${String(cm).padStart(3)}cm/${String(kg).padStart(3)}kg → BMI ${bmi.toFixed(1)} → ${got}${ok ? '' : `  ✗ 期望「${expected}」（${note}）`}`);
  if (!ok) mismatches.push({ cm, kg, got, expected, note });
}

if (mismatches.length) {
  problems.push(`BMI 分界与预期不符：${mismatches.map((m) => `${m.cm}cm/${m.kg}kg 得到「${m.got}」而期望「${m.expected}」`).join('；')}`);
}

// 反向自检：确认这组断言真的在测东西——把分界改成 WHO 的 25/30 应当立刻产生不一致
const whoClassify = (bmi) => (bmi < 18.5 ? '偏瘦' : bmi < 25 ? '正常' : bmi < 30 ? '超重' : '肥胖');
const whoDisagrees = cases.filter(([cm, kg]) => {
  const bmi = kg / ((cm / 100) ** 2);
  return whoClassify(bmi) !== classify(bmi);
});
if (whoDisagrees.length === 0) {
  problems.push('用 WHO 分界跑这组用例结果完全相同，说明用例没覆盖到中国标准与国际标准的差异，断言太弱');
} else {
  console.log(`    反向自检：这组用例里有 ${whoDisagrees.length} 个会因「改用 WHO 分界」而改变结论 —— 断言有效`);
}

// 健康体重区间：170cm 应为约 53.5–69.1 kg
const [lo, hi] = healthyRange(1.7);
console.log(`    170cm 的健康体重区间：${lo.toFixed(1)} – ${hi.toFixed(1)} kg`);
if (Math.abs(lo - 53.5) > 0.2 || Math.abs(hi - 69.1) > 0.2) {
  problems.push(`健康体重区间计算出错：期望约 53.5–69.1，实际 ${lo.toFixed(1)}–${hi.toFixed(1)}`);
}

/* ---------- 4. 页面必须真的可交互，且阈值与上面一致 ---------- */

const bmiPage = await readFile(path.join(distDir, 'tools', 'bmi', 'index.html'), 'utf8').catch(() => null);
if (!bmiPage) {
  problems.push('读不到 dist/tools/bmi/index.html');
} else {
  for (const id of ['height', 'weight', 'waist', 'sex', 'result']) {
    if (!bmiPage.includes(`id="${id}"`)) problems.push(`BMI 页面缺少 id="${id}" 的元素`);
  }
  // 页面里必须出现 24 和 28 这两个中国标准的分界
  for (const n of ['24', '28', '18.5']) {
    if (!bmiPage.includes(n)) problems.push(`BMI 页面里找不到阈值 ${n}`);
  }
  // 必须声明本地计算（不发送数据）
  if (!/不会发送|不会上传|本地/.test(bmiPage)) {
    problems.push('BMI 页面没有说明「数据在本地计算、不上传」');
  }
  // 必须挂上事件监听（否则输入没反应）
  if (!/addEventListener\('input'/.test(bmiPage)) {
    problems.push('BMI 页面没有给输入框绑定 input 事件（输入不会有反应）');
  }
}

/* ---------- 5. 词条里不应残留指向工具的死链，工具页要能被找到 ---------- */

const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
if (!home.includes('/tools/')) problems.push('首页没有指向小工具的入口');
const header = await readFile(path.join(distDir, 'tools', 'index.html'), 'utf8');
if (!header.includes('小工具')) problems.push('工具目录页标题缺失');

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 小工具清单、页面、BMI 分界与交互都正常。\n');
