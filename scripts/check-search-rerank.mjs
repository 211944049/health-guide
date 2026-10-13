/**
 * 搜索重排效果验证。
 *
 * 做法：用真实的 Pagefind 索引拿到结果，**从构建产物里提取页面上那份 rerank 逻辑**，
 * 验证重排的行为符合预期。这样验证的是真正跑的代码，而不是我重新实现的一份。
 *
 * ⚠️ 断言的写法（第一版写错，值得记）：
 *   第一版断言「重排前后顺序必须完全一致」——这在**内容增长后必然失败**：
 *   新增词条会改变 Pagefind 的原始排序，重排结果自然跟着变。
 *   那次失败报的是「「睡眠」重排后第一条变了：午睡睡多久 → 睡眠环境怎么调」，
 *   而实际上这是**重排在正常工作**（把标题含完整查询词的「睡眠环境怎么调」提上来了），
 *   不是退化。**把"顺序稳定"当成正确性标准是错的**——内容站会不断新增词条。
 *
 *   现在的断言针对**性质**而不是**具体顺序**：
 *     1. 标题含完整查询词的结果，必须排在标题不含的前面（这是重排的目的）
 *     2. 同分结果保持 Pagefind 原序（稳定排序，不能打乱它已有的判断）
 *     3. 「外 卖」这个原始 bug 必须仍然被修复（这是当初做重排的起因）
 *
 * 用法：node scripts/check-search-rerank.mjs
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/*
  默认用 dist/。允许覆盖：反向验证脚本（_probe-rerank.mjs）需要在临时目录里
  对「故意破坏稳定性」的副本跑校验，而不去动真实产物。
*/
const distDir = process.env.RERANK_DIST ? path.resolve(process.env.RERANK_DIST) : path.join(root, 'dist');

/* ---------- 从构建产物里提取 rerank 逻辑 ---------- */

const page = await readFile(path.join(distDir, 'search', 'index.html'), 'utf8');
const match = page.match(/function rerank\([\s\S]*?\n      \}/);
if (!match) {
  console.error('\n✗ 没能从 dist/search/index.html 里提取到 rerank 函数（实现可能被改名或移除了）\n');
  process.exit(1);
}
const rerank = new Function(`return (${match[0]})`)();
if (typeof rerank !== 'function') {
  console.error('\n✗ 提取到的 rerank 不是函数\n');
  process.exit(1);
}
console.log('\n搜索重排验证：已从构建产物提取 rerank 逻辑');

/* ---------- 起服务器跑 Pagefind ---------- */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.join(distDir, rel);
  const info = await stat(full).catch(() => null);
  if (!info || !info.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] ?? 'application/octet-stream' });
  res.end(await readFile(full));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const pf = await import(pathToFileURL(path.join(distDir, 'pagefind', 'pagefind.js')).href);
if (pf.options) await pf.options({ basePath: `http://127.0.0.1:${server.address().port}/pagefind/` });

const problems = [];
const titleOf = (d) => String(d.meta?.title ?? d.url);
const titles = (list, n = 4) => list.slice(0, n).map(titleOf).join(' / ');

/* ---------- 断言 1：标题命中必须排在标题不命中之前 ---------- */

console.log('\n一、标题含完整查询词的结果是否都排在前面');
for (const q of ['睡眠', '外卖', '久坐', '血压', '防晒']) {
  const res = await pf.search(q, { resultCount: 60 });
  const raw = await Promise.all(res.results.map((r) => r.data()));
  const after = rerank(raw, q);

  const lastHit = after.findLastIndex((d) => titleOf(d).includes(q));
  const firstMiss = after.findIndex((d) => !titleOf(d).includes(q));
  const ordered = lastHit === -1 || firstMiss === -1 || lastHit < firstMiss;
  const hitCount = after.filter((d) => titleOf(d).includes(q)).length;

  console.log(`  「${q}」${raw.length} 条，标题命中 ${hitCount} 条 → ${ordered ? '✓ 顺序正确' : '✗ 标题命中被排在后面'}`);
  console.log(`      重排后前 4：${titles(after)}`);
  if (!ordered) problems.push(`「${q}」重排后标题命中的没有排在前面`);
}

/* ---------- 断言 2：同分结果保持原序（稳定排序） ---------- */

/*
  ⚠️ 这条断言在**真实数据上必然空跑**，所以改用构造数据显式测试。

  原因（实测出来的）：Pagefind 返回的 `plain_excerpt` 是**围绕匹配位置生成**的，
  所以只要一个结果被返回，它的摘要里几乎一定包含查询词 —— 实测「睡眠」40 条里
  标题命中 1 条、摘要命中 39 条、**两者都不命中的 0 条**。
  于是"取出同分元素比较顺序"永远拿到空数组，断言通过但什么也没测。

  改成构造数据：给一组有序的假结果，让其中若干条同分（标题和摘要都不含查询词），
  重排后检查这些同分元素是否仍按输入顺序排列。这才真正验证了比较器里的
  `b.s - a.s || a.i - b.i` 那个稳定排序逻辑。
*/
console.log('\n二、同分结果是否保持输入顺序（稳定排序，构造数据）');
{
  const q = '测试词';
  // 构造：3 条同分（都不含查询词），中间夹一条标题命中、一条摘要命中
  const make = (title, excerpt) => ({ meta: { title }, plain_excerpt: excerpt });
  const input = [
    make('同分甲', '与查询无关的摘要'),
    make(`${q}标题命中`, '无关摘要'),
    make('同分乙', '与查询无关的摘要'),
    make('摘要命中条目', `这里出现了${q}`),
    make('同分丙', '与查询无关的摘要'),
  ];
  const out = rerank(input, q);

  const zeroIn = input.filter((d) => !titleOf(d).includes(q) && !String(d.plain_excerpt).includes(q)).map(titleOf);
  const zeroOut = out.filter((d) => !titleOf(d).includes(q) && !String(d.plain_excerpt).includes(q)).map(titleOf);

  const sameOrder = JSON.stringify(zeroIn) === JSON.stringify(zeroOut);
  const titleFirst = titleOf(out[0]) === `${q}标题命中`;
  const excerptBeforeZero = out.findIndex((d) => String(d.plain_excerpt).includes(q)) <
    out.findIndex((d) => !titleOf(d).includes(q) && !String(d.plain_excerpt).includes(q));

  console.log(`  输入同分元素顺序：${zeroIn.join(' → ')}`);
  console.log(`  输出同分元素顺序：${zeroOut.join(' → ')}`);
  console.log(`  同分保持输入顺序：${sameOrder ? '✓' : '✗'}`);
  console.log(`  标题命中排第一：${titleFirst ? '✓' : '✗'}`);
  console.log(`  摘要命中排在零分之前：${excerptBeforeZero ? '✓' : '✗'}`);

  if (zeroIn.length === 0) problems.push('稳定性测试的构造数据里没有同分元素，断言无效（测试本身写错了）');
  if (!sameOrder) problems.push('同分结果没有保持输入顺序（稳定排序失效）');
  if (!titleFirst) problems.push('构造数据里标题命中的没有排到第一');
  if (!excerptBeforeZero) problems.push('构造数据里摘要命中的没有排在零分之前');
}

/* ---------- 断言 3：原始 bug 仍被修复（做重排的起因） ---------- */

/*
  背景：用户输入带空格时（「外 卖」），Pagefind 会把它当成两个词、
  变成"匹配到「外」就算命中"，拉进大量无关结果。

  ⚠️ 2026-10-12 的重大修正：**这个 bug 的正确修法是搜索前归一化查询词，不是重排。**
  之前我只在重排里做了归一化，但 `pf.search()` 用的还是带空格的原文——
  于是结果集里根本没有「外卖怎么点更健康」（实测「外 卖」只返回 4 条、标题命中 0 条），
  **重排救不了一个不含正确答案的结果集**。
  现在 search.astro 在搜索前就 `replace(/[\s\u3000]+/g, '')`，这个断言也随之改为
  **复现应用的真实行为**（先归一化，再搜）。

  另外要检查构建产物里确实有那步归一化——否则断言会在"测试自己对"的情况下通过。
*/
console.log('\n三、原始 bug：「外 卖」（带空格）是否仍被修复');
{
  const rawTerm = '外 卖';
  const normalized = rawTerm.replace(/[\s\u3000]+/g, '');

  // 先确认构建产物里真的有"搜索前归一化"这一步
  const hasNormalize = /replace\(\/\[\\s\\u3000\]\+|replace\(\/\[\\s\\u3000\]/.test(page);
  console.log(`  search.astro 里有搜索前归一化：${hasNormalize ? '✓' : '✗'}`);

  const res = await pf.search(normalized, { resultCount: 60 });
  const raw = await Promise.all(res.results.map((r) => r.data()));
  const after = rerank(raw, normalized);

  console.log(`  归一化后查询「${normalized}」→ 共 ${raw.length} 条`);
  console.log(`  Pagefind 原序前 4：${titles(raw)}`);
  console.log(`  重排后前 4      ：${titles(after)}`);

  if (!hasNormalize) {
    problems.push('search.astro 里没有"搜索前去掉空白"的归一化——「外 卖」会退回到旧 bug');
  }
  if (raw.length < 5) {
    problems.push(
      `归一化后「${normalized}」只返回 ${raw.length} 条——结果集太小，说明归一化没生效（旧 bug 时是 4–5 条）`,
    );
  }
  if (after[0] && !titleOf(after[0]).includes('外卖')) {
    problems.push(`「外 卖」重排后第一条是「${titleOf(after[0])}」，期望标题含「外卖」的词条`);
  }
  const lastHit = after.findLastIndex((d) => titleOf(d).includes('外卖'));
  const firstMiss = after.findIndex((d) => !titleOf(d).includes('外卖'));
  if (lastHit !== -1 && firstMiss !== -1 && lastHit > firstMiss) {
    problems.push('「外 卖」重排后，标题含「外卖」的结果仍排在不含的后面');
  }
}

/* ---------- 断言 4：散落的单字命中不能拿分（2026-10-12 新增） ---------- */

/*
  起因：新增「洗脸巾怎么选」后，它含「额**外**添加」和「**卖**点」，
  于是被 Pagefind 当成「外卖」的字级命中拉进结果，并一度排在第一位。
  重排必须能识破这种"两个字都有、但挨不着"的情况——分数应为 0。

  这是构造数据测试，不依赖真实索引，所以不会随内容增长而失效。
*/
console.log('\n四、散落的单字命中必须得 0 分（构造数据）');
{
  const q = '外卖';
  const make = (title, excerpt) => ({ meta: { title }, plain_excerpt: excerpt });
  const scattered = make('洗脸巾怎么选', '这类额外添加要避开；不要只看一次性这个卖点。');
  const adjacent = make('外卖怎么点更健康', '……');
  const nearMiss = make('外卖的那些事', '……');

  const out = rerank([scattered, adjacent, nearMiss], q);
  const titlesOut = out.map(titleOf);
  const scatteredScoreOk = titlesOut[titlesOut.length - 1] === '洗脸巾怎么选';
  const adjacentFirst = titlesOut[0] === '外卖怎么点更健康';

  console.log(`  输入顺序：洗脸巾怎么选 / 外卖怎么点更健康 / 外卖的那些事`);
  console.log(`  输出顺序：${titlesOut.join(' / ')}`);
  console.log(`  相邻命中的排在前面：${adjacentFirst ? '✓' : '✗'}`);
  console.log(`  散落命中的排在最后：${scatteredScoreOk ? '✓' : '✗'}`);

  if (!adjacentFirst) problems.push('构造数据里标题相邻命中的没有排在前面');
  if (!scatteredScoreOk) {
    problems.push('散落的单字命中（如"额外添加…卖点"）拿到了不该有的分数——会污染搜索结果');
  }
}

server.close();

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 重排性质正确：标题命中优先、同分保持原序、原始 bug 已修复。\n');
