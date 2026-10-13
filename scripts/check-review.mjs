/**
 * 复核机制体检。
 *
 * 检查两类事情，性质完全不同：
 *
 * ① **一致性**（硬失败）——`review_after` 是否与策略算出来的一致。
 *    这是可以精确判断的：到期日由 `updated` + 证据等级周期派生，
 *    不一致说明有人手改了日期，或者改了 `updated` 却忘了重跑 apply-review。
 *    这种情况**必须拦**，否则复核机制会悄悄失效（日期看着有，但算错了）。
 *    修法很明确：跑 `run.cmd apply:review`。
 *
 * ② **逾期**（默认只报告）——到期日已过。
 *    这里**刻意不硬失败**（除超过宽限期外）。原因见 src/lib/review.ts：
 *    复核需要人工去核对来源，脚本做不到。如果一个机械的日期检查让整站无法发布，
 *    正常反应是"把日期改掉让它过"——那会摧毁这套机制的诚信。
 *    所以默认只提醒，超过 REVIEW_GRACE_DAYS 才失败（那时确实拖太久了）。
 *
 * 用法：node scripts/check-review.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

/* ---------- 从 lib/review.ts 读取策略（与 apply-review 同源） ---------- */

const policySrc = await readFile(path.join(root, 'src', 'lib', 'review.ts'), 'utf8');
const monthsBlock = policySrc.match(/REVIEW_MONTHS[^{]*\{([^}]*)\}/)?.[1] ?? '';
const REVIEW_MONTHS = {};
for (const m of monthsBlock.matchAll(/([A-D]):\s*(\d+)/g)) REVIEW_MONTHS[m[1]] = Number(m[2]);
const GRACE_DAYS = Number(policySrc.match(/REVIEW_GRACE_DAYS\s*=\s*(\d+)/)?.[1] ?? 60);

if (Object.keys(REVIEW_MONTHS).length === 0) {
  console.error('\n[X] 没能从 src/lib/review.ts 解析出 REVIEW_MONTHS\n');
  process.exit(1);
}

const addMonths = (isoDate, months) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/* ---------- 逐条检查 ---------- */

const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
const problems = []; // 硬失败
const overdue = []; // 逾期（报告）
const missing = []; // 缺 review_after

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

for (const file of files) {
  const text = await readFile(path.join(dir, file), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const scalar = (k) => (fm.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm')) ?? [, ''])[1].trim();

  const title = scalar('title');
  const updated = scalar('updated');
  const evidence = scalar('evidence');
  const reviewAfter = scalar('review_after');
  const overrideRaw = scalar('reviewMonths');
  const override = overrideRaw ? Number(overrideRaw) : undefined;

  if (!updated || !evidence) {
    problems.push(`${file}: 缺少 updated 或 evidence`);
    continue;
  }

  const months = Number.isFinite(override) && override > 0 ? override : REVIEW_MONTHS[evidence];
  if (!months) {
    problems.push(`${file}: 证据等级 ${evidence} 没有对应的复核周期`);
    continue;
  }
  const expected = addMonths(updated, months);

  if (!reviewAfter) {
    missing.push({ file, title, expected });
    continue;
  }
  if (reviewAfter !== expected) {
    problems.push(
      `${file}: review_after 是 ${reviewAfter}，按策略（updated ${updated} + ${evidence} 级 ${months} 月）应为 ${expected}`,
    );
    continue;
  }

  // 逾期天数
  const due = new Date(`${reviewAfter}T00:00:00Z`);
  const days = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - due.getTime()) / 86400000);
  if (days > 0) overdue.push({ file, title, evidence, reviewAfter, days });
}

/* ---------- 报告 ---------- */

console.log(`\n复核机制体检：${files.length} 条词条`);
console.log(`  策略：A ${REVIEW_MONTHS.A} 月 / B ${REVIEW_MONTHS.B} 月 / C ${REVIEW_MONTHS.C} 月 / D ${REVIEW_MONTHS.D} 月，宽限期 ${GRACE_DAYS} 天`);
console.log(`  今天：${todayStr}`);

if (missing.length > 0) {
  console.log(`\n  缺少 review_after：${missing.length} 条`);
  for (const m of missing.slice(0, 5)) console.log(`    · ${m.title}（应为 ${m.expected}）`);
  if (missing.length > 5) console.log(`    … 另有 ${missing.length - 5} 条`);
  console.log('    修法：run.cmd apply:review');
}

overdue.sort((a, b) => b.days - a.days);
if (overdue.length === 0) {
  // 报告最近到期的几条，让「还有多久」这件事可见
  const upcoming = [];
  for (const file of files) {
    const text = await readFile(path.join(dir, file), 'utf8');
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    const ra = (fm.match(/^review_after:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
    const ti = (fm.match(/^title:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
    const ev = (fm.match(/^evidence:[ \t]*(.*)$/m) ?? [, ''])[1].trim();
    if (ra) upcoming.push({ ti, ra, ev });
  }
  upcoming.sort((a, b) => a.ra.localeCompare(b.ra));
  console.log(`\n  没有逾期条目 ✓`);
  console.log(`  最近到期的 5 条：`);
  for (const u of upcoming.slice(0, 5)) console.log(`    ${u.ra}  ${u.ev}  ${u.ti}`);
} else {
  console.log(`\n  逾期条目：${overdue.length} 条`);
  for (const o of overdue.slice(0, 10)) {
    console.log(`    ${o.reviewAfter}（逾期 ${o.days} 天）  ${o.evidence}  ${o.title}`);
  }
  if (overdue.length > 10) console.log(`    … 另有 ${overdue.length - 10} 条`);
  console.log('\n    这些词条该核对来源了。复核清单见：run.cmd maintenance');

  const tooLate = overdue.filter((o) => o.days > GRACE_DAYS);
  if (tooLate.length > 0) {
    problems.push(
      `${tooLate.length} 条词条逾期超过 ${GRACE_DAYS} 天宽限期（最久 ${tooLate[0].days} 天：${tooLate[0].title}）——` +
        `请核对来源并更新 updated，或调整 src/lib/review.ts 的周期策略`,
    );
  }
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 10)) console.error(`  ✗ ${p}`);
  if (problems.length > 10) console.error(`  … 另有 ${problems.length - 10} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 复核到期日全部与策略一致。\n');
