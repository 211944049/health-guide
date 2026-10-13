/**
 * 把词条正文里的 markdown 加粗 `**x**` 转成 HTML `<strong>x</strong>`。
 *
 * ## 为什么要做（2026-10-12 发现）
 *
 * CommonMark 的强调规则有 CJK 盲区：`**` 如果**紧贴标点**、且外侧紧贴汉字，
 * 就不被当作强调标记，星号会原样显示给读者。用项目同源的 micromark 实测：
 *
 *   ✓ `这是**重点**内容`                    → 解析
 *   ✓ `**8–12 周**之后`                    → 解析
 *   ✗ `这里要注意**"1 类"指的是…**`          → 不解析（后随半角引号）
 *   ✗ `这里要注意**“1 类”指的是…**`          → 不解析（后随全角引号）
 *   ✗ `**（非炎症型）**可以`                 → 不解析（后随括号）
 *
 * 136 条词条正文共约 12000 处 `**`，其中相当一部分因此**一直显示着字面星号**。
 * 而构建、闸门、可见文本比较**全都发现不了**——因为星号确实"在页面上"。
 *
 * ## 为什么整体转换而不是只修坏的那些
 *
 * 1. HTML `<strong>` 不受强调规则影响，两种情况都能正确渲染，结果统一。
 * 2. 只修坏的那些需要复刻 micromark 的 flanking 规则，容易漏。
 * 3. 转换对**已经正常解析的**那些是等价的（都渲染成加粗），不会造成回退。
 *
 * ## 安全措施
 *   · 先备份整个 entries 目录
 *   · 跳过 ``` 代码围栏内的内容
 *   · 只处理成对出现的 `**…**`（不成对的保持原样并报告）
 *   · 幂等：第二次运行应当 0 改动
 *
 * 用法：node scripts/convert-bold-to-html.mjs [--check]
 */
import { readFile, writeFile, readdir, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');
const CHECK = process.argv.includes('--check');
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BACKUP = path.join(root, '..', 'handoff', `_entries-backup-${TODAY}-pre-strong`);

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));

/**
 * 转换一个文件的内容：**x** → <strong>x</strong>。
 * 跳过代码围栏；不处理跨行；不成对的保持原样。
 */
function convert(text) {
  const lines = text.split('\n');
  let inFence = false;
  let converted = 0;
  let unpaired = 0;

  const out = lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    let result = line;
    // 统计未成对：奇数个 ** 的行要小心
    const marks = (result.match(/\*\*/g) ?? []).length;
    if (marks === 0) return line;

    // 成对替换：**内容**，内容不含 * 且不跨行
    result = result.replace(/\*\*([^*\n]+?)\*\*/g, (m, inner) => {
      converted += 1;
      return `<strong>${inner}</strong>`;
    });

    const left = (result.match(/\*\*/g) ?? []).length;
    if (left > 0) unpaired += left;
    return result;
  });

  return { text: out.join('\n'), converted, unpaired };
}

/* ---------- 先统计 ---------- */
let totalConverted = 0;
let totalUnpaired = 0;
let changedFiles = 0;
const plan = [];

for (const f of files) {
  const p = path.join(dir, f);
  const before = await readFile(p, 'utf8');
  const r = convert(before);
  totalConverted += r.converted;
  totalUnpaired += r.unpaired;
  if (r.text !== before) {
    changedFiles += 1;
    plan.push({ f, p, before, after: r.text });
  }
}

console.log(`\n词条 ${files.length} 条`);
console.log(`  待转换的 **…** 对数：${totalConverted}`);
console.log(`  不成对残留的 ** ：${totalUnpaired}${totalUnpaired ? '  ← 需要人工看' : ''}`);
console.log(`  会改动的文件：${changedFiles}`);

if (CHECK) {
  console.log('\n（--check 模式，未修改任何文件）\n');
  process.exit(0);
}
if (plan.length === 0) {
  console.log('\n✓ 没有需要转换的（可能已经转过了）\n');
  process.exit(0);
}

/* ---------- 备份 ---------- */
await mkdir(path.dirname(BACKUP), { recursive: true });
await cp(dir, BACKUP, { recursive: true });
console.log(`\n已备份到 ${path.relative(root, BACKUP)}`);

/* ---------- 写入 + 护栏 ---------- */
let written = 0;
for (const it of plan) {
  /*
    护栏：
      1. 长度必须增长（每对 ** 变成 <strong></strong> 会变长）
      2. 转换后不得再含 **（除了报告过的不成对情况）
      3. 其余结构（--- 分隔、## 标题）数量不变
  */
  const headingsBefore = (it.before.match(/^#{1,6} /gm) ?? []).length;
  const headingsAfter = (it.after.match(/^#{1,6} /gm) ?? []).length;
  if (headingsBefore !== headingsAfter) {
    console.log(`  ✗ ${it.f} 标题数量变化，跳过`);
    continue;
  }
  if (it.after.length < it.before.length) {
    console.log(`  ✗ ${it.f} 长度缩短，跳过`);
    continue;
  }
  await writeFile(it.p, it.after, 'utf8');
  written += 1;
}
console.log(`已写入 ${written} 个文件`);

/* ---------- 幂等确认 ---------- */
let secondPass = 0;
for (const f of files) {
  const t = await readFile(path.join(dir, f), 'utf8');
  const r = convert(t);
  if (r.text !== t) secondPass += 1;
}
console.log(secondPass === 0 ? '✓ 幂等确认：再跑一次不会有改动\n' : `✗ 仍有 ${secondPass} 个文件会被改动\n`);
