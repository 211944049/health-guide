/**
 * 专题页体检。
 *
 * 为什么需要：专题页里写的是 slug，写错时**构建不报错**，页面只是少一条链接
 * （和行内互链、related、START_PATHS 同一类静默失败）。
 *
 * 检查项：
 *   1. 每个专题都有构建产物、slug 合法
 *   2. 步骤里所有 slug 都存在，且同一步内不重复
 *   3. 每个专题覆盖 **≥3 个分类** —— 这是专题与分类的本质区别。
 *      只覆盖 1–2 个分类的「专题」其实只是分类页的复制品，应该合并进分类而不是另开一页。
 *   4. 每个专题条目数 ≥6（少于 6 条撑不起一个专题）
 *   5. 每一步都有 heading 和 why（顺序和理由才是专题的核心价值，不能缺）
 *   6. 首页和 /topic/ 目录页都能到达每个专题
 *   7. 专题页的「其他专题」区列出了所有其他专题（避免遗漏）
 *
 * 用法：node scripts/check-topics.mjs
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const problems = [];

/* ---------- 解析 lib/topics.ts ---------- */

const src = await readFile(path.join(root, 'src', 'lib', 'topics.ts'), 'utf8');
const block = src.match(/export const TOPICS[\s\S]*?\n\];/)?.[0];
if (!block) {
  console.error('\n[X] 在 src/lib/topics.ts 里找不到 TOPICS\n');
  process.exit(1);
}

/*
  按专题切块再解析，避免跨专题串读。
  每个专题以 `slug: '...'` 开始，到下一个 `slug:` 或数组结尾为止。
*/
const chunks = block.split(/\n  \{\n/).slice(1);
const topics = [];
for (const chunk of chunks) {
  const slug = chunk.match(/slug:\s*'([^']+)'/)?.[1];
  const title = chunk.match(/title:\s*'([^']+)'/)?.[1];
  if (!slug) continue;

  // 按 steps 切，每个 step 取 heading / why / entries
  const steps = [];
  for (const m of chunk.matchAll(/heading:\s*'([^']*)',\s*\n\s*why:\s*'([^']*)',\s*\n\s*entries:\s*\[([^\]]*)\]/g)) {
    steps.push({
      heading: m[1],
      why: m[2],
      entries: [...m[3].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]),
    });
  }
  topics.push({ slug, title, steps });
}

if (topics.length === 0) problems.push('没有解析出任何专题（检查 lib/topics.ts 的格式）');

const entrySlugs = new Set(
  (await readdir(path.join(root, 'src', 'content', 'entries')))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, '')),
);

// 词条分类，用于判断跨分类数
const categoryOf = new Map();
for (const slug of entrySlugs) {
  const text = await readFile(path.join(root, 'src', 'content', 'entries', `${slug}.md`), 'utf8');
  const cat = text.match(/^category:\s*(.+)$/m)?.[1].trim();
  if (cat) categoryOf.set(slug, cat);
}

/* ---------- 先检查是否存在「新增专题但未构建」的死锁 ---------- */

/*
  ⚠️ 这是一个真实的死锁，第一次加专题时会撞上：
    本脚本是 `build` 的 **pre-build 闸门**，但它需要 `dist/topic/<slug>/index.html` 存在；
    而页面只有跑过 astro build 才会生成。于是新增专题时 → 闸门失败 → 构建不跑 → 页面永远不生成。

  解决办法是**提前给出明确指引**，而不是让人对着"没有构建产物"自己想。
*/
const missingPages = [];
for (const topic of topics) {
  const info = await stat(path.join(distDir, 'topic', topic.slug, 'index.html')).catch(() => null);
  if (!info) missingPages.push(topic);
}

if (missingPages.length > 0) {
  console.error(`\n[X] 有 ${missingPages.length} 个专题还没有构建产物：${missingPages.map((t) => t.slug).join(', ')}`);
  console.error('');
  console.error('    这是「新增专题」时的死锁：本脚本是 build 的 pre-build 闸门，');
  console.error('    但它需要 dist/ 里已有页面，而页面只有跑过 astro build 才会生成。');
  console.error('');
  console.error('    解决办法（先跳过闸门构建一次，生成页面，再跑完整构建）：');
  console.error('      run.cmd build:only     # 只跑 astro build，跳过 pre-build 闸门');
  console.error('      run.cmd build          # 再跑完整闸门');
  console.error('');
  process.exit(1);
}

console.log(`\n专题体检：${topics.length} 个专题\n`);

for (const topic of topics) {
  const all = topic.steps.flatMap((s) => s.entries);
  const unique = new Set(all);
  const cats = new Set(all.map((s) => categoryOf.get(s)).filter(Boolean));

  console.log(`  【${topic.title}】${topic.steps.length} 步 · ${unique.size} 条 · 跨 ${cats.size} 类（${[...cats].join(' ')}）`);

  // 页面产物
  const pagePath = path.join(distDir, 'topic', topic.slug, 'index.html');
  const info = await stat(pagePath).catch(() => null);
  if (!info) problems.push(`专题 ${topic.slug} 没有构建产物 dist/topic/${topic.slug}/index.html`);

  // slug 合法性
  for (const s of all) {
    if (!entrySlugs.has(s)) problems.push(`专题「${topic.title}」指向不存在的词条：${s}`);
  }

  // 同一步内重复 / 跨步重复
  for (const step of topic.steps) {
    if (new Set(step.entries).size !== step.entries.length) {
      problems.push(`专题「${topic.title}」的步骤「${step.heading}」里有重复 slug`);
    }
    if (!step.heading) problems.push(`专题「${topic.title}」有步骤缺少 heading`);
    if (!step.why) problems.push(`专题「${topic.title}」的步骤「${step.heading}」缺少 why（顺序的理由是这个页面的核心价值）`);
    if (step.entries.length === 0) problems.push(`专题「${topic.title}」的步骤「${step.heading}」没有任何词条`);
  }
  if (unique.size !== all.length) {
    problems.push(`专题「${topic.title}」在不同步骤里重复引用了同一词条（一个专题内应只出现一次）`);
  }

  // 跨分类数：专题与分类的本质区别
  if (cats.size < 3) {
    problems.push(
      `专题「${topic.title}」只覆盖 ${cats.size} 个分类 —— 专题必须跨至少 3 个分类，否则它只是分类页的复制品`,
    );
  }

  // 条目数
  if (unique.size < 6) {
    problems.push(`专题「${topic.title}」只有 ${unique.size} 条词条，少于 6 条撑不起一个专题`);
  }
}

/* ---------- 可到达性 ---------- */

const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
const indexPage = await readFile(path.join(distDir, 'topic', 'index.html'), 'utf8');

for (const topic of topics) {
  if (!indexPage.includes(`/topic/${topic.slug}/`)) {
    problems.push(`/topic/ 目录页没有列出专题 ${topic.slug}`);
  }
  if (!home.includes(`/topic/${topic.slug}/`)) {
    problems.push(`首页没有专题 ${topic.slug} 的入口`);
  }

  // 每个专题页要列出所有其他专题
  const page = await readFile(path.join(distDir, 'topic', topic.slug, 'index.html'), 'utf8').catch(() => null);
  if (page) {
    for (const other of topics) {
      if (other.slug === topic.slug) continue;
      if (!page.includes(`/topic/${other.slug}/`)) {
        problems.push(`专题 ${topic.slug} 的页面里没有指向 ${other.slug} 的链接`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 专题结构合法、全部跨分类、可到达。\n');
