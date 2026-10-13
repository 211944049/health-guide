/**
 * 工具页脚本内链接 + 计时器逻辑体检。
 *
 * 为什么需要单独一个脚本：
 *   `check-site-links.mjs` 会**剥掉 `<script>` 块**再爬链接（否则会把脚本里拼字符串的代码
 *   当成链接，第一版就误报过）。代价是**脚本里真正写死的站内链接它看不到**——
 *   工具页的「相关词条」链接有一部分写在 `<script is:inline>` 里，写错了没人管。
 *   所以这里拿 `lib/tools.ts` 的 `TOOL_INTERNAL_LINKS` 清单，去构建产物里逐个验证。
 *
 * 顺带校验计时器这类交互组件的关键实现特征（用时间戳计时、可选通知、可访问性属性），
 * 因为这些同样属于"构建不报错但可能悄悄坏掉"的部分。
 *
 * 用法：node scripts/check-tool-links.mjs
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const problems = [];

/* ---------- 1. 解析 lib/tools.ts 里的 TOOL_INTERNAL_LINKS ---------- */

const src = await readFile(path.join(root, 'src', 'lib', 'tools.ts'), 'utf8');
const block = src.match(/TOOL_INTERNAL_LINKS[^{]*\{([\s\S]*?)\n\};/);
if (!block) {
  console.error('\n[X] 在 src/lib/tools.ts 里找不到 TOOL_INTERNAL_LINKS\n');
  process.exit(1);
}

/** slug -> [{ text, href }] */
const linkMap = {};
for (const m of block[1].matchAll(/([a-z0-9-]+):\s*\[([\s\S]*?)\]/g)) {
  const slug = m[1];
  linkMap[slug] = [...m[2].matchAll(/\{\s*text:\s*'([^']*)',\s*href:\s*'([^']*)'\s*\}/g)].map((x) => ({
    text: x[1],
    href: x[2],
  }));
}

const slugs = Object.keys(linkMap);
console.log(`\n工具脚本内链接体检：${slugs.length} 个工具，共 ${slugs.reduce((n, s) => n + linkMap[s].length, 0)} 条链接`);

/* ---------- 2. 每条链接都必须出现在页面里，且目标存在 ---------- */

for (const slug of slugs) {
  const pagePath = path.join(distDir, 'tools', slug, 'index.html');
  const info = await stat(pagePath).catch(() => null);
  if (!info) {
    problems.push(`工具 ${slug} 没有构建产物`);
    continue;
  }
  const html = await readFile(pagePath, 'utf8');
  let ok = 0;

  for (const link of linkMap[slug]) {
    // 链接必须在页面里出现（脚本内联，所以会出现在 HTML 源码里）
    if (!html.includes(link.href)) {
      problems.push(`工具 ${slug} 的页面里找不到链接 ${link.href}`);
      continue;
    }
    // 目标页面必须真实存在
    const rel = link.href.replace(/^\//, '').replace(/\/$/, '/index.html');
    const target = await stat(path.join(distDir, rel)).catch(() => null);
    if (!target) {
      problems.push(`工具 ${slug} 的链接指向不存在的页面：${link.href}`);
      continue;
    }
    ok += 1;
  }
  console.log(`  · ${slug}: ${ok}/${linkMap[slug].length} 条链接有效`);
}

/* ---------- 3. 计时器的实现特征（构建不报错但会悄悄坏的部分） ---------- */

const timerPath = path.join(distDir, 'tools', 'sedentary', 'index.html');
const timer = await readFile(timerPath, 'utf8').catch(() => null);

if (!timer) {
  problems.push('找不到久坐计时器页面 dist/tools/sedentary/index.html');
} else {
  // 交互元素
  for (const id of ['interval', 'duration', 'timer-clock', 'timer-phase', 'start', 'pause', 'reset', 'ring-progress']) {
    if (!timer.includes(`id="${id}"`)) problems.push(`计时器缺少 id="${id}" 的元素`);
  }
  // 进度环要有 svg 圆
  if (!/timer-ring-progress/.test(timer) || !/<circle[^>]*id="ring-progress"/.test(timer)) {
    problems.push('计时器缺少进度环的 <circle id="ring-progress">');
  }
  /*
    必须用时间戳计时，不能用计数器递减。
    浏览器会把后台标签页的定时器节流到分钟级，递减写法会越走越慢甚至停住。
    这里断言实现里出现 Date.now() 与 endsAt 的比较。
  */
  if (!/Date\.now\(\)/.test(timer) || !/endsAt/.test(timer)) {
    problems.push('计时器没有用 Date.now()/endsAt 做时间戳计时（后台标签页会被节流，倒计时会失准）');
  }
  // 通知必须是可选增强：权限被拒也要能跑
  if (!/Notification\.permission/.test(timer)) {
    problems.push('计时器没有检查 Notification.permission');
  }
  if (!/requestPermission/.test(timer)) {
    problems.push('计时器没有申请通知权限的逻辑（到点提醒会静默失效）');
  }
  // 切回页面要校正
  if (!/visibilitychange/.test(timer)) {
    problems.push('计时器没有处理 visibilitychange（切回页面时不会校正时间）');
  }
  // 活动菜单要有内容
  const menu = timer.match(/id="activity-menu"([\s\S]*?)<\/ul>/);
  const items = menu ? (menu[1].match(/<li>/g) ?? []).length : 0;
  if (items < 5) problems.push(`活动菜单只有 ${items} 条，偏少（建议 ≥5）`);
  else console.log(`  · sedentary: 活动菜单 ${items} 条，含进度环 / 时间戳计时 / 可选通知 / 切回校正`);

  // 计时页不能声明「数据上传」
  if (!/本地/.test(timer)) problems.push('计时器页面没有说明「计时在本地进行」');
}

/* ---------- 4. 工具目录页要列全 ---------- */

const indexPage = await readFile(path.join(distDir, 'tools', 'index.html'), 'utf8');
for (const slug of slugs) {
  if (!indexPage.includes(`/tools/${slug}/`)) problems.push(`工具目录页没有列出 ${slug}`);
}
// 首页也要有入口
const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
for (const slug of slugs) {
  if (!home.includes(`/tools/${slug}/`)) problems.push(`首页没有 ${slug} 的入口`);
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 工具页脚本内链接有效，计时器实现特征齐全。\n');
