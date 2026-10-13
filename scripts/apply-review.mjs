/**
 * 把复核到期日（`review_after`）写入词条 frontmatter。
 *
 * 这是**派生机器的写入口**：到期日由 `updated` + 证据等级对应的复核周期算出，
 * 不手工维护。改了复核策略（`src/lib/review.ts` 的 REVIEW_MONTHS）之后重跑即可。
 *
 * ⚠️ 写入护栏（沿用 apply-related.mjs 的做法，那次有过词条被写空的教训）：
 *   · 原文件为空 / 没有闭合 frontmatter → 拒绝写入
 *   · 结果缺少合法 frontmatter → 拒绝
 *   · 结果比原文短超过 20% → 拒绝（疑似截断）
 *
 * 用法：
 *   node scripts/apply-review.mjs            # 查看将要写入什么（不写）
 *   node scripts/apply-review.mjs --write    # 实际写入
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');
const write = process.argv.includes('--write');

/*
  复核策略从 src/lib/review.ts 读取。
  不 import 那个文件（它是 .ts），而是用正则解析常数——这样校验器和写入器
  都基于同一份来源，策略改了不会漏改。
*/
const policySrc = await readFile(path.join(root, 'src', 'lib', 'review.ts'), 'utf8');
const monthsBlock = policySrc.match(/REVIEW_MONTHS[^{]*\{([^}]*)\}/)?.[1] ?? '';
const REVIEW_MONTHS = {};
for (const m of monthsBlock.matchAll(/([A-D]):\s*(\d+)/g)) REVIEW_MONTHS[m[1]] = Number(m[2]);
if (Object.keys(REVIEW_MONTHS).length === 0) {
  console.error('\n[X] 没能从 src/lib/review.ts 解析出 REVIEW_MONTHS\n');
  process.exit(1);
}
const graceDays = Number(policySrc.match(/REVIEW_GRACE_DAYS\s*=\s*(\d+)/)?.[1] ?? 60);

const addMonths = (isoDate, months) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();

console.log(`\n复核到期日计算（策略：A ${REVIEW_MONTHS.A} 月 / B ${REVIEW_MONTHS.B} 月 / C ${REVIEW_MONTHS.C} 月 / D ${REVIEW_MONTHS.D} 月）\n`);

const MIN_KEEP_RATIO = 0.8;
let written = 0;
let unchanged = 0;
const skipped = [];
const rows = [];

for (const file of files) {
  const full = path.join(dir, file);
  const text = await readFile(full, 'utf8');

  if (text.trim().length === 0) {
    skipped.push(`${file}（文件为空，拒绝写入）`);
    continue;
  }
  const lines = text.split('\n');
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) {
    skipped.push(`${file}（没有闭合的 frontmatter，拒绝写入）`);
    continue;
  }

  const fm = lines.slice(1, end);
  const scalarOf = (key) => {
    const line = fm.find((l) => new RegExp(`^${key}:`).test(l));
    return line ? line.replace(new RegExp(`^${key}:[ \\t]*`), '').trim() : '';
  };

  const updated = scalarOf('updated');
  const evidence = scalarOf('evidence');
  const overrideRaw = scalarOf('reviewMonths');
  if (!updated || !evidence) {
    skipped.push(`${file}（缺少 updated 或 evidence，拒绝写入）`);
    continue;
  }
  const override = overrideRaw ? Number(overrideRaw) : undefined;
  const months = Number.isFinite(override) && override > 0 ? override : REVIEW_MONTHS[evidence];
  if (!months) {
    skipped.push(`${file}（证据等级 ${evidence} 没有对应周期，拒绝写入）`);
    continue;
  }

  const due = addMonths(updated, months);
  rows.push({ file, evidence, updated, months, due, title: scalarOf('title') });

  // 已有 review_after 就先删掉（可重复运行）
  const existing = fm.findIndex((l) => /^review_after:/.test(l));
  if (existing !== -1) {
    if (fm[existing].trim() === `review_after: ${due}`) {
      unchanged += 1;
      continue;
    }
    fm.splice(existing, 1);
  }

  // 插到 updated 之后（同类信息放在一起，便于人工查看）
  const updatedAt = fm.findIndex((l) => /^updated:/.test(l));
  const insertAt = updatedAt === -1 ? fm.length : updatedAt + 1;
  fm.splice(insertAt, 0, `review_after: ${due}`);

  const result = [lines[0], ...fm, ...lines.slice(end)].join('\n');

  if (!/^---\n[\s\S]*?\n---\n/.test(result)) {
    skipped.push(`${file}（结果缺少合法 frontmatter，拒绝写入）`);
    continue;
  }
  if (result.length < text.length * MIN_KEEP_RATIO) {
    skipped.push(`${file}（结果比原文短超过 20%，疑似截断，拒绝写入）`);
    continue;
  }

  if (write) await writeFile(full, result, 'utf8');
  written += 1;
}

// 按到期日排序打印，便于看哪些最先到期
rows.sort((a, b) => a.due.localeCompare(b.due));
console.log('最早到期的 12 条：');
for (const r of rows.slice(0, 12)) {
  console.log(`  ${r.due}  ${r.evidence}  ${String(r.months).padStart(2)}月  ${r.title}`);
}
const byDue = new Map();
for (const r of rows) byDue.set(r.due, (byDue.get(r.due) ?? 0) + 1);
console.log('\n到期日分布：');
for (const [d, n] of [...byDue.entries()].sort()) console.log(`  ${d}  ${n} 条`);

if (skipped.length > 0) {
  console.error(`\n⚠️ 跳过 ${skipped.length} 个文件：`);
  for (const s of skipped) console.error(`  · ${s}`);
}

if (!write) {
  console.log(`\n（这是检查模式，没有写入。将更新 ${written} 个文件，${unchanged} 个已是最新）`);
  console.log('  加 --write 才写入。\n');
} else {
  console.log(`\n[OK] 已写入 ${written} 个文件，${unchanged} 个已是最新`);
  console.log(`     逾期宽限期 ${graceDays} 天（由 check-review.mjs 使用）\n`);
}
if (skipped.length > 0) process.exit(1);
