/**
 * 内容体检：在构建前拦住"半成品"和"字段写错"的词条。
 *
 * 检查项：
 *   1. frontmatter 必填字段是否齐全
 *   2. category / evidence / cost / time 的值是否在 site.config.ts 的枚举里
 *   3. updated 是否是 YYYY-MM-DD
 *   4. sources 是否至少有一条
 *   5. 正文是否包含六个必需小标题
 *   6. 正文里有没有重复写"参考来源 / 最后更新"（这两段由词条页自动生成）
 *   7. 有没有留下 TODO / 待补 之类的占位
 *
 * 用法：node scripts/check-content.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORY_LABELS, COST_LEVELS, EVIDENCE_KEYS, TIME_LEVELS } from '../src/site.config.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');

const REQUIRED_KEYS = ['title', 'category', 'evidence', 'cost', 'time', 'audience', 'updated', 'sources'];
const REQUIRED_HEADINGS = ['适用人群', '具体做法', '健康原理', '常见误区', '风险与禁忌', '何时求助专业人士'];
const AUTO_HEADINGS = ['参考来源', '最后更新'];
const PLACEHOLDER = /\bTODO\b|待补|待填|写这里|xxxx/i;

/** 取 frontmatter 里某个 key 的原始值（只处理本站用到的简单标量）。 */
function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!match) return undefined;
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

/** sources 这类列表：key 后面必须跟着至少一条 "  - 值"。 */
function listItems(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*-\s+/.test(line)) {
      items.push(line.replace(/^\s*-\s+/, '').trim());
      continue;
    }
    if (/^\S/.test(line)) break;
  }
  return items;
}

const problems = [];
const stats = { total: 0, categories: new Map(), evidence: new Map(), draft: 0 };
const files = (await readdir(entriesDir).catch(() => [])).filter((file) => file.endsWith('.md'));

for (const file of files.sort()) {
  const raw = (await readFile(path.join(entriesDir, file), 'utf-8')).replace(/^\uFEFF/, '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    problems.push(`${file}: 开头没有合法的 frontmatter（需要 --- 包裹）`);
    continue;
  }
  const [, frontmatter, body] = match;
  const report = (message) => problems.push(`${file}: ${message}`);

  for (const key of REQUIRED_KEYS) {
    if (scalar(frontmatter, key) === undefined) report(`缺少 frontmatter 字段 ${key}`);
  }

  const category = scalar(frontmatter, 'category');
  if (category && !CATEGORY_LABELS.includes(category)) {
    report(`category 必须是 ${CATEGORY_LABELS.join(' / ')}，现在是「${category}」`);
  }

  const evidence = scalar(frontmatter, 'evidence');
  if (evidence && !EVIDENCE_KEYS.includes(evidence)) {
    report(`evidence 必须是 ${EVIDENCE_KEYS.join(' / ')}，现在是「${evidence}」`);
  }

  const cost = scalar(frontmatter, 'cost');
  if (cost && !COST_LEVELS.includes(cost)) {
    report(`cost 必须是 ${COST_LEVELS.join(' / ')}，现在是「${cost}」`);
  }

  const time = scalar(frontmatter, 'time');
  if (time && !TIME_LEVELS.includes(time)) {
    report(`time 必须是 ${TIME_LEVELS.join(' / ')}，现在是「${time}」`);
  }

  const updated = scalar(frontmatter, 'updated');
  if (updated && !/^\d{4}-\d{2}-\d{2}/.test(updated)) {
    report(`updated 需要写成 YYYY-MM-DD，现在是「${updated}」`);
  }

  const sources = listItems(frontmatter, 'sources');
  if (sources.length === 0) report('sources 至少要写一条来源');

  const headings = body
    .split(/\r?\n/)
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, '').trim());

  for (const heading of REQUIRED_HEADINGS) {
    if (!headings.includes(heading)) report(`正文缺少「## ${heading}」`);
  }

  for (const heading of AUTO_HEADINGS) {
    if (headings.includes(heading)) {
      report(`正文里的「## ${heading}」由词条页自动生成，正文不要重复写`);
    }
  }

  if (PLACEHOLDER.test(raw)) report('还有 TODO / 待补 之类的占位内容，不能发布');

  // YAML 里 "文字: 文字" 会被当成键值对，来源写成 "机构《标题: 副标题》" 就会让数组项变成对象，
  // 构建时才报 "Expected type string, received object"。这里提前拦下来。
  for (const line of frontmatter.split(/\r?\n/)) {
    if (/^\s*-\s/.test(line) && /:\s/.test(line) && !/^\s*-\s*['"]/.test(line)) {
      report(`数组项里的「冒号 + 空格」会被 YAML 当成键值对（来源、人群等列表都受影响），请给整行加引号：${line.trim()}`);
    }
  }

  // YAML 里 `*` 是**别名**的开始符。summary 常写成 `**加粗**……` 的 Markdown，
  // 未加引号时构建同步内容会报 "unidentified alias"（错误信息只给出行列号，很难定位）。
  // 单引号内的 `*` 是普通字符，包一层即可。
  for (const key of ['summary', 'title']) {
    const raw = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
    if (!raw) continue;
    const value = raw[1];
    if (value && !/^['"]/.test(value) && value.includes('*')) {
      report(`${key} 的值里有未加引号的「*」（YAML 会当成别名，构建报 unidentified alias），请用单引号包住整行：${key}: '…'`);
    }
  }

  // 列表项里未加引号的 `*` 同理（例如 tags 里写了 ** 或 *
  for (const line of frontmatter.split(/\r?\n/)) {
    if (/^\s*-\s/.test(line) && !/^\s*-\s*['"]/.test(line) && line.includes('*')) {
      report(`数组项里有未加引号的「*」（YAML 别名陷阱），请给整行加引号：${line.trim()}`);
    }
  }

  stats.total += 1;
  if (category) stats.categories.set(category, (stats.categories.get(category) ?? 0) + 1);
  if (evidence) stats.evidence.set(evidence, (stats.evidence.get(evidence) ?? 0) + 1);
  if (scalar(frontmatter, 'status') === '简版') stats.draft += 1;
}

const format = (map) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key} ${count}`)
    .join(' · ');

console.log(`\n词条体检：共 ${stats.total} 条（简版 ${stats.draft} 条）`);
console.log(`分类分布：${format(stats.categories) || '—'}`);
console.log(`证据分布：${format(stats.evidence) || '—'}`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('全部通过。\n');
