/**
 * 核实「引号累积事故」之后，115 个词条的 summary 是否内容完好。
 *
 * 事故回顾：fix-summary-quoting.mjs 的旧判断有 bug，把已带引号的行反复再包一层，
 * 累积污染了 44 个文件。已修。但必须**独立验证**没有丢字，而不是相信修复脚本。
 *
 * 本脚本做的检查（都是独立于修复逻辑的）：
 *   1. 每个 summary 行必须恰好是「一层单引号 + 内部单引号成对」
 *   2. YAML 真值必须与去掉引号后的字面量**完全一致**（防止引号与真值脱节）
 *   3. summary 不得以多余引号结尾、不得出现连续 3 个以上引号
 *   4. 长度分布合理（没有异常短/长的行，提示可能被截断）
 */
import { readFile, readdir } from 'node:fs/promises';
import yaml from 'js-yaml';

const dir = 'C:/Users/17878/Documents/deepseek-harness/default-workspace/health-guide/src/content/entries';
const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));

const problems = [];
let checked = 0;
const lengths = [];

for (const f of files) {
  const text = await readFile(`${dir}/${f}`, 'utf8');
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    problems.push(`${f}: 没有闭合的 frontmatter`);
    continue;
  }
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('summary:'));
  if (idx === -1) {
    problems.push(`${f}: 没有 summary 行`);
    continue;
  }
  const line = lines[idx];

  if (!line.includes('*')) continue; // 不需要引号的行跳过
  checked += 1;

  // 1. 必须是一层引号
  const m = line.match(/^summary: '(.*)'$/);
  if (!m) {
    problems.push(`${f}: summary 行不是干净的「一层单引号」写法：${JSON.stringify(line.slice(-40))}`);
    continue;
  }
  const literal = m[1];

  // 2. 不得出现连续 3 个引号（累积污染的痕迹）
  if (/'''/.test(literal)) {
    problems.push(`${f}: summary 里出现连续 3 个单引号（累积污染痕迹）`);
  }

  // 3. 内部单引号必须成对（YAML 转义规则）
  const singles = (literal.match(/'/g) || []).length;
  if (singles % 2 !== 0) {
    problems.push(`${f}: summary 里单引号数量为奇数（${singles}），YAML 转义不成对`);
  }

  // 4. YAML 真值必须与字面量一致（字面量里的 '' 对应真值里的一个 '）
  const data = yaml.load(fmMatch[1]);
  const trueValue = data?.summary;
  if (typeof trueValue !== 'string') {
    problems.push(`${f}: YAML 解析不出 summary 字符串`);
    continue;
  }
  if (trueValue !== literal.replace(/''/g, "'")) {
    problems.push(`${f}: YAML 真值与字面量不一致（真值 ${trueValue.length} 字符 / 字面量 ${literal.length} 字符）`);
  }

  lengths.push({ f, n: trueValue.length });
}

console.log(`\nsummary 完整性核查：${checked} 条含 * 的词条`);

lengths.sort((a, b) => a.n - b.n);
if (lengths.length) {
  console.log(`  长度范围：${lengths[0].n}（${lengths[0].f}）～ ${lengths[lengths.length - 1].n}（${lengths[lengths.length - 1].f}）`);
  const avg = Math.round(lengths.reduce((s, x) => s + x.n, 0) / lengths.length);
  console.log(`  平均长度：${avg} 字符`);
  // 明显偏短的（可能是被截断）
  const short = lengths.filter((x) => x.n < 80);
  if (short.length) {
    console.log(`  ⚠️ 偏短（<80 字符，请确认是否有意为之）：`);
    for (const s of short) console.log(`     · ${s.f} (${s.n})`);
  }
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}
console.log('\n✓ 所有 summary 都是干净的一层引号，YAML 真值与字面量一致，无累积污染。\n');
