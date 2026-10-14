/**
 * 批量写词条的共享工具。
 *
 * 第六批踩过的坑都固化在这里，避免每次重犯：
 *   1. **写入前全量校验**——任一条字段不全就整体中止，一条都不写。
 *      起因：A 批第一次"边写边崩"，脚本在第 6 条抛错，前 5 条因为排在它后面
 *      根本没写，留下"部分写入"状态（最难排查的失败模式）。
 *   2. **time 必须在允许值内**——`半天` 这种自造值会被 check-content 打回。
 *   3. **summary 含 * 或多个引号时**由 build 统一加单引号并转义内部单引号。
 *   4. **多余字段名即报错**——`cat:` / `sum:` 这类缩写我写过好几次。
 *
 * 用法：被 write-batch*.mjs import。
 */
import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** 全站允许的「照做一次要多久」取值（check-content.mjs 会校验）。 */
export const TIME_OK = ['1分钟', '5分钟', '15分钟', '30分钟', '1小时', '长期'];

const REQUIRED = [
  'slug', 'title', 'category', 'evidence', 'cost', 'time',
  'audience', 'summary', 'related', 'tags', 'sources', 'body',
];

/** 按证据等级算复审日期（A/B 6 个月，C 4 个月，D 3 个月——与全站策略一致）。 */
export function reviewAfter(evidence, today) {
  const months = { A: 6, B: 6, C: 4, D: 3 }[evidence] ?? 6;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * 把自由文本字段安全地写成 YAML 标量。
 *
 * ⚠️ 为什么需要它（2026-10-13 踩的坑）
 *
 * 写「"上火"到底是什么」这条时，标题**以双引号开头**，而 `build()` 原来把
 * title 原样拼进 frontmatter：
 *
 *     title: "上火"到底是什么
 *
 * YAML 会把开头的 `"` 当成**引号字符串的起始**，读到 `"上火"` 就结束了，
 * 后面剩下的 `到底是什么` 成为非法内容 —— 报错是
 * `bad indentation of a mapping entry`，**指向的却是第 1 行**，
 * 与真正的原因（标题里的引号）看起来毫无关系，比较难查。
 *
 * 修法：以 YAML 特殊字符开头的标量一律加单引号，内部的单引号按 YAML 规则翻倍。
 * 这样以后再写「"X"是什么」这类中文标题就不会踩到。
 */
function yamlScalar(v) {
  const s = String(v);
  // YAML 里这些字符出现在开头都有特殊含义；另外「冒号+空格」和「空格+井号」在中间也会截断
  const needsQuote = /^["'[\]{}#&*!|>%@`\-?:,]/.test(s) || /:\s/.test(s) || /\s#/.test(s);
  return needsQuote ? `'${s.replace(/'/g, "''")}'` : s;
}

/** 组装一个词条文件的完整内容。 */
export function build(e, today) {
  const quoted = `'${String(e.summary).replace(/'/g, "''")}'`;
  const fm = [
    '---',
    `title: ${yamlScalar(e.title)}`,
    `category: ${e.category}`,
    `evidence: ${e.evidence}`,
    `cost: ${e.cost}`,
    `time: ${e.time}`,
    'audience:',
    ...e.audience.map((a) => `  - ${yamlScalar(a)}`),
    `updated: ${today}`,
    `review_after: ${reviewAfter(e.evidence, today)}`,
    'status: 完整',
    'related:',
    ...e.related.map((r) => `  - ${r}`),
    `summary: ${quoted}`,
    'sources:',
    ...e.sources.map((s) => `  - ${JSON.stringify(s)}`),
    'tags:',
    ...e.tags.map((t) => `  - ${t}`),
    '---',
    '',
  ].join('\n');
  return `${fm}${e.body.trim()}\n`;
}

/** 写入前全量校验；有问题就 process.exit(1)，不写任何文件。 */
export function validate(entries) {
  const problems = [];
  const seen = new Set();
  for (const e of entries) {
    for (const k of REQUIRED) {
      const v = e[k];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)) {
        problems.push(`${e.slug ?? '(无 slug)'} 缺少字段「${k}」`);
      }
    }
    if (e.time && !TIME_OK.includes(e.time)) {
      problems.push(`${e.slug} 的 time「${e.time}」不在允许值内（${TIME_OK.join(' / ')}）`);
    }
    if (!['A', 'B', 'C', 'D'].includes(e.evidence)) {
      problems.push(`${e.slug} 的 evidence「${e.evidence}」必须是 A/B/C/D`);
    }
    if (seen.has(e.slug)) problems.push(`slug 重复：${e.slug}`);
    seen.add(e.slug);
    const extra = Object.keys(e).filter((k) => !REQUIRED.includes(k));
    if (extra.length) problems.push(`${e.slug} 有多余字段（疑似拼错）：${extra.join(', ')}`);
  }
  if (problems.length) {
    console.error('\n[X] 写入前校验失败，未写入任何文件：');
    for (const p of problems) console.error(`    · ${p}`);
    console.error('');
    process.exit(1);
  }
  console.log(`\n写入前校验通过：${entries.length} 条，字段齐全、time 与 evidence 合法。\n`);
}

/** 逐条写入（已存在的跳过），返回 { created, skipped }。 */
export async function writeAll(entries, entriesDir, today) {
  const created = [];
  const skipped = [];
  for (const e of entries) {
    const target = path.join(entriesDir, `${e.slug}.md`);
    if (await stat(target).catch(() => null)) {
      skipped.push(e.slug);
      continue;
    }
    await writeFile(target, build(e, today), { encoding: 'utf-8' });
    created.push(e.slug);
  }
  console.log(`[OK] 写入 ${created.length} 条，跳过已存在 ${skipped.length} 条`);
  if (created.length) console.log(`     ${created.join(', ')}`);
  if (skipped.length) console.log(`     已存在：${skipped.join(', ')}`);
  console.log('');
  return { created, skipped };
}
