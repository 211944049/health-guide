/**
 * 首屏负担估算：不靠浏览器，用构建产物算出「手机首屏要渲染多少东西」。
 *
 * 背景：词条从 10 条涨到 50 条后，`/browse/` 的 DOM 从 18 KB 涨到 60 KB。
 * 用户反馈过加载慢（已查明是国际链路），但「首屏要渲染的元素数量」是**站点侧**的事，
 * 这个脚本把它量化出来，用来判断要不要做首屏分批渲染。
 *
 * 为什么不用浏览器：本机无法起浏览器。这里按 CSS 断点 + 已知折叠行为做**上界估算**，
 * 结果会比真实首屏偏大（保守），用来判断"要不要优化"足够。
 *
 * 用法：node scripts/estimate-first-screen.mjs
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const pages = [
  { file: 'index.html', label: '首页' },
  { file: 'browse/index.html', label: '全部词条' },
  { file: 'search/index.html', label: '搜索页' },
  { file: 'tools/bmi/index.html', label: 'BMI 工具' },
  { file: 'entry/takeout-ordering/index.html', label: '词条页（示例）' },
];

const bytes = (s) => Buffer.byteLength(s, 'utf8');

console.log('\n首屏负担估算（单位：字节 / 元素个数）\n');
console.log(
  '页面'.padEnd(18) + 'HTML'.padStart(9) + 'gzip 估算'.padStart(11) + '卡片数'.padStart(8) + '链接数'.padStart(8) + '首屏可见卡片(上界)'.padStart(20),
);
console.log('-'.repeat(76));

const rows = [];
for (const p of pages) {
  const html = await readFile(path.join(distDir, p.file), 'utf8');
  const cards = (html.match(/class="entry-card"/g) ?? []).length;
  const links = (html.match(/<a\b/g) ?? []).length;
  const br = bytes(html);

  /*
    手机首屏可见内容估算（保守上界）：
    假设视口高约 700 CSS px，一张词条卡约 150 px（含间距），所以约 4–5 张可见。
    这里按「首屏可见卡片数 = 5」的上界，并把卡片按 150 px 计。
  */
  const visible = Math.min(cards, 5);

  rows.push({ ...p, br, cards, links, visible });
  console.log(
    p.label.padEnd(18) +
      String(br).padStart(9) +
      String(Math.round(br * 0.35)).padStart(11) +
      String(cards).padStart(8) +
      String(links).padStart(8) +
      String(visible).padStart(20),
  );
}

console.log('\n说明：');
console.log('  · gzip 估算按 0.35 倍计（实测 /browse/ 压缩率约 0.29，偏保守）');
console.log('  · 「首屏可见卡片」是上界：实际可见通常更少，因为首屏还有标题和筛选区');
console.log('  · 卡片总数远大于首屏可见数时，剩余卡片属于「滚动了才看到」的部分');

const browse = rows.find((r) => r.file === 'browse/index.html');
if (browse) {
  const ratio = browse.cards / browse.visible;
  console.log(`\n/browse/ 共 ${browse.cards} 张卡片，首屏上界可见 ${browse.visible} 张 —— 比值 ${ratio.toFixed(1)}×`);
  if (ratio > 8) {
    console.log('  → 首屏外的卡片占绝大多数。如果手机实测确实慢，值得做「首屏先渲染一部分、其余按需加载」。');
  } else {
    console.log('  → 首屏内外比例不悬殊，暂不需要分批渲染。');
  }
}
console.log('');
