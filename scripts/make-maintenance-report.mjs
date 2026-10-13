/**
 * 生成内容维护报告：把「该复核哪些词条」和「要核对哪些来源」列成一份可执行清单。
 *
 * ── 为什么这个脚本是整套复核机制的关键 ──────────────────────────
 * 只记录到期日而不给出「到期后具体要做什么」，复核计划必然变成一堆没人看的日期。
 * 真正让复核可执行的，是把**词条引用的来源逐条列出来**——这样复核就变成
 * 「打开链接、确认还是最新版」，而不是「重读一遍整篇再想哪里有出处」。
 *
 * 报告分三部分：
 *   ① 已逾期、需要现在处理的词条（含它们的全部来源）
 *   ② 即将到期（提前 REVIEW_WARN_DAYS 天）的词条
 *   ③ 全部词条的到期日历（便于安排时间）
 *
 * 输出：handoff/内容维护报告.md
 *
 * 用法：node scripts/make-maintenance-report.mjs
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');
const outFile = path.join(root, '..', 'handoff', '内容维护报告.md');

/* ---------- 读策略 ---------- */

const policySrc = await readFile(path.join(root, 'src', 'lib', 'review.ts'), 'utf8');
const monthsBlock = policySrc.match(/REVIEW_MONTHS[^{]*\{([^}]*)\}/)?.[1] ?? '';
const REVIEW_MONTHS = {};
for (const m of monthsBlock.matchAll(/([A-D]):\s*(\d+)/g)) REVIEW_MONTHS[m[1]] = Number(m[2]);
const WARN_DAYS = Number(policySrc.match(/REVIEW_WARN_DAYS\s*=\s*(\d+)/)?.[1] ?? 30);
const GRACE_DAYS = Number(policySrc.match(/REVIEW_GRACE_DAYS\s*=\s*(\d+)/)?.[1] ?? 60);
const evidenceDesc = {};
for (const m of (await readFile(path.join(root, 'src', 'site.config.ts'), 'utf8'))
  .matchAll(/([A-D]):\s*\{\s*short:\s*'[^']*',\s*full:\s*'[^']*',\s*desc:\s*'([^']*)'/g)) {
  evidenceDesc[m[1]] = m[2];
}

/* ---------- 读词条 ---------- */

const list = (fm, key) => {
  const lines = fm.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s+-\s+/.test(line)) { items.push(line.replace(/^\s+-\s+/, '').trim()); continue; }
    if (/^\S/.test(line)) break;
  }
  return items;
};

const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
const entries = [];
for (const file of files) {
  const text = await readFile(path.join(dir, file), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const scalar = (k) => (fm.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm')) ?? [, ''])[1].trim();
  entries.push({
    slug: file.replace(/\.md$/, ''),
    title: scalar('title'),
    category: scalar('category'),
    evidence: scalar('evidence'),
    updated: scalar('updated'),
    reviewAfter: scalar('review_after'),
    summary: scalar('summary').replace(/^'(.*)'$/s, '$1'),
    sources: list(fm, 'sources'),
  });
}

/* ---------- 分类：逾期 / 即将到期 / 未到期 ---------- */

/*
  「今天」可用 REVIEW_TODAY 覆盖（格式 YYYY-MM-DD）。
  为什么留这个口子：所有到期日都在未来，所以报告里「逾期」那段代码平时永远不会执行——
  而它恰恰是整套机制真正起作用的地方。留一个可覆盖的今天，就能用假日期验证那段逻辑；
  否则要等到几年后真逾期了，才发现格式是坏的。
*/
const todayStr = process.env.REVIEW_TODAY ?? new Date().toISOString().slice(0, 10);
const dayDiff = (dateStr) =>
  Math.floor((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) / 86400000);

const overdue = [];
const soon = [];
const later = [];
for (const e of entries) {
  if (!e.reviewAfter) continue;
  const d = dayDiff(e.reviewAfter);
  if (d < 0) overdue.push({ ...e, days: -d });
  else if (d <= WARN_DAYS) soon.push({ ...e, days: d });
  else later.push({ ...e, days: d });
}
overdue.sort((a, b) => b.days - a.days);
soon.sort((a, b) => a.days - b.days);
later.sort((a, b) => a.reviewAfter.localeCompare(b.reviewAfter));

/* ---------- 组装报告 ---------- */

const L = [];
L.push('# 内容维护报告');
L.push('');
L.push(`> 生成时间：${todayStr}　|　运行 \`run.cmd maintenance\` 重新生成`);
L.push('>');
L.push('> **这份报告解决的问题**：词条站的核心卖点是「标注证据等级 + 列出权威来源」，');
L.push('> 而指南会更新（WHO 建议、中国膳食指南、GB 标准都有版本更替）。');
L.push('> 如果词条里还引着旧版，标注来源反而变成负资产。');
L.push('>');
L.push('> **复核怎么做**：下面每条词条都列出了它引用的**全部来源**。');
L.push('> 复核就是「打开链接、确认还是最新版、结论有没有变」，不需要重读整篇。');
L.push('> 核对完把 `updated` 改成当天，然后跑 `run.cmd apply:review` 重算到期日。');
L.push('');

L.push('## 复核周期策略');
L.push('');
L.push('| 证据等级 | 周期 | 含义 |');
L.push('| --- | --- | --- |');
for (const k of ['A', 'B', 'C', 'D']) {
  L.push(`| **${k}** | ${REVIEW_MONTHS[k]} 个月 | ${evidenceDesc[k] ?? ''} |`);
}
L.push('');
L.push('周期按证据等级区分，不是统一一个数字：**C 级最容易被新证据推翻，而且读者无法自行判断真伪，所以周期最短**；');
L.push('D 级是「学界有争议」，需要留意分歧是否收敛。逾期超过 ' + GRACE_DAYS + ' 天会让构建失败。');
L.push('');

/* ① 逾期 */
L.push(`## ① 需要现在复核（逾期）：${overdue.length} 条`);
L.push('');
if (overdue.length === 0) {
  L.push('目前没有逾期条目。');
  L.push('');
} else {
  for (const e of overdue) {
    L.push(`### ${e.title}`);
    L.push('');
    L.push(`- 证据等级 **${e.evidence}**（周期 ${REVIEW_MONTHS[e.evidence]} 个月）· 分类 ${e.category}`);
    L.push(`- 上次更新 ${e.updated} · 到期 ${e.reviewAfter} · **逾期 ${e.days} 天**`);
    L.push(`- 链接：/entry/${e.slug}/`);
    L.push('');
    L.push('**要核对的来源**：');
    for (const s of e.sources) L.push(`- [ ] ${s}`);
    L.push('');
    L.push('<details><summary>当前的一句话结论（核对时看结论有没有变）</summary>');
    L.push('');
    L.push(`> ${e.summary}`);
    L.push('');
    L.push('</details>');
    L.push('');
  }
}

/* ② 即将到期 */
L.push(`## ② 即将到期（${WARN_DAYS} 天内）：${soon.length} 条`);
L.push('');
if (soon.length === 0) {
  L.push(`目前没有 ${WARN_DAYS} 天内到期的条目。`);
  L.push('');
} else {
  for (const e of soon) {
    L.push(`- **${e.title}**（${e.evidence} 级）—— ${e.reviewAfter}，还有 ${e.days} 天 · /entry/${e.slug}/`);
  }
  L.push('');
}

/* ③ 完整日历 */
L.push('## ③ 全部词条的到期日历');
L.push('');
const byDue = new Map();
for (const e of later) {
  if (!byDue.has(e.reviewAfter)) byDue.set(e.reviewAfter, []);
  byDue.get(e.reviewAfter).push(e);
}
for (const [due, list2] of [...byDue.entries()].sort()) {
  L.push(`### ${due}（${list2.length} 条）`);
  L.push('');
  for (const e of list2) L.push(`- ${e.evidence} · ${e.title} · /entry/${e.slug}/`);
  L.push('');
}

L.push('---');
L.push('');
L.push('## 相关命令');
L.push('');
L.push('| 命令 | 作用 |');
L.push('| --- | --- |');
L.push('| `run.cmd maintenance` | 重新生成本报告 |');
L.push('| `run.cmd check:review` | 校验所有到期日与策略一致（构建闸门之一） |');
L.push('| `run.cmd apply:review` | 按当前策略重算并写入到期日 |');
L.push('');
L.push('> **改了复核周期怎么办**：修改 `src/lib/review.ts` 的 `REVIEW_MONTHS`，');
L.push('> 然后跑 `run.cmd apply:review --write` 重算全部词条——策略只有一处定义。');
L.push('');

await writeFile(outFile, L.join('\n'), 'utf8');
const kb = (Buffer.byteLength(L.join('\n')) / 1024).toFixed(1);
console.log(`\n[OK] 已生成维护报告 -> ${path.relative(root, outFile)}（${kb} KB）`);
console.log(`     逾期 ${overdue.length} 条，${WARN_DAYS} 天内到期 ${soon.length} 条，其余 ${later.length} 条`);
