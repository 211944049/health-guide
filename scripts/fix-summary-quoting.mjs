/**
 * 把 frontmatter 里未加引号的 summary 值加上单引号。
 *
 * 原因：summary 常写成 `**加粗**……` 的 Markdown，而 YAML 里 `*` 是**别名**的开始符。
 * 只要值里出现裸 `*`（未加引号），解析就会报 "unidentified alias"。
 * 用单引号包住整行最省事：单引号内的 `*` 和 `:` 都是普通字符，不需要转义
 * （单引号自身要写成两个）。
 *
 * ## ⚠️ 这个脚本曾经有一个**会造成数据损坏的 bug**，修法写在这里
 *
 * 原判断是 `if (value.startsWith("'")) continue;`（认为已带引号就跳过）。
 * 但 YAML 里引号后**常有一个尾随空格**（`summary: '……'`），而 value 含那个空格，
 * 于是**已经带引号的行没被识别出来，被再包一层**：
 *
 *     summary: '……理由**。'      ← 正常
 *     summary: '……理由**。''     ← 又包一层（内部 ' 被转义成 ''）
 *     summary: '……理由**。''''   ← 再跑一次继续累积
 *
 * 因为我把这个脚本接进了 `build`，**每次构建都会把内容改坏一点**，
 * 最终导致 44 个词条的 summary 行被污染，并使分享图指纹检查误报。
 *
 * **修法（现在的实现）**：不再靠字符串启发式判断"是否已带引号"，
 * 而是**用 YAML 解析出真值，再写回干净的引号形式**。
 * 这样它是**确定性且幂等**的：跑多少次结果都一样。
 *
 * 用法：node scripts/fix-summary-quoting.mjs
 * 幂等：已正确的行不会被动。
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const dir = path.resolve('src/content/entries');
const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));

let fixed = 0;
const touched = [];
const skipped = [];

for (const file of files) {
  const full = path.join(dir, file);
  const text = await readFile(full, 'utf8');

  // 取出 frontmatter 文本
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) continue;

  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('summary:'));
  if (idx === -1) continue;

  // 值里没有 `*` 就不需要引号，跳过（避免无谓改写）
  if (!lines[idx].includes('*')) continue;

  // 用 YAML 解析整段 frontmatter，拿到 summary 的**真值**。
  // 若整段解析失败（正是"裸 *"引起的那种失败），退化为按行取值并剥引号。
  let trueValue = null;
  try {
    const data = yaml.load(fmMatch[1]);
    if (data && typeof data.summary === 'string') trueValue = data.summary;
  } catch {
    // 解析失败：说明这一行确实有问题，用行内容推算真值
    const raw = lines[idx].replace(/^summary:[ \t]*/, '');
    trueValue = raw.replace(/^'/, '').replace(/'+$/, '').replace(/''/g, "'").trim();
    skipped.push(`${file}（frontmatter 解析失败，按行推算真值）`);
  }
  if (trueValue === null) continue;

  // 目标写法：单引号包住，内部单引号写两遍
  const clean = `summary: '${trueValue.replace(/'/g, "''")}'`;

  // 幂等判断：与当前行（去首尾空白）一致就跳过。
  // 注意不要用"是否以引号开头"这类启发式——那正是之前出 bug 的地方。
  if (lines[idx].trim() === clean.trim()) continue;

  lines[idx] = clean;
  await writeFile(full, lines.join('\n'), 'utf8');
  fixed += 1;
  touched.push(file);
}

console.log(`✓ 已修正 summary 引号：${fixed} 个文件`);
for (const file of touched) console.log(`    · ${file}`);
if (skipped.length) {
  console.log(`\n⚠️ 以下文件的 frontmatter 无法用 YAML 解析（已按行推算，请留意）：`);
  for (const s of skipped) console.log(`    · ${s}`);
}
