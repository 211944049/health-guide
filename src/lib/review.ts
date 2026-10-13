/**
 * 内容复核策略。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────
 * 这个站的核心卖点是「每条词条都标注证据等级并列出权威来源」。但**指南会更新**：
 * WHO 的钠摄入建议、中国膳食指南、GB 标准都有版本更替。如果词条里还引着旧版，
 * 「标注来源」这件事反而会变成负资产——读者会照着过时的建议做。
 *
 * 而原来的 frontmatter 只有一个 `updated` 字段，它只回答「最后改过是什么时候」，
 * **不回答「最后核对过来源是什么时候」**。这两件事差别很大：
 * 一次批量改格式会把 `updated` 全部刷新，但那不是复核。所以必须有独立机制。
 *
 * ── 设计决策 ──────────────────────────────────────────────────
 * 1. **复核周期由证据等级决定，而不是统一一个数字。**
 *    理由：A 级内容依赖的是稳定共识和高质量研究，结论变化慢；
 *    C 级内容依赖专家经验或间接推论，本身就更容易被推翻，而且读者更难自行判断，
 *    所以更应该勤核对。D 级是「有争议」，需要留意新研究。
 *
 * 2. **只写 `review_after`（到期日），不写「是否已复核」。**
 *    `review_after` 是**可由策略重新计算的派生值**，所以校验器能精确检查它是否与策略一致。
 *    如果写「上次复核时间」，脚本无法判断那个日期是真是假，校验就无从下手。
 *
 * 3. **复核周期的来源日期基准是 `updated`。**
 *    这是当前可用的最佳基准（见上文的已知局限）。真正的复核应当同时更新 `updated`
 *    ——因为核对来源往往会改内容。所以两者合并使用是可接受的近似。
 *
 * 4. **逾期只报告、不阻塞构建（有宽限期）。**
 *    理由很重要：复核需要**人工去核对来源**，脚本做不到。如果一个机械的日期检查
 *    让整站无法发布，正常反应是"把日期改掉让它过"——那会摧毁这套机制的诚信。
 *    所以 `check-review.mjs` 默认只报告，超过宽限期才失败。
 *
 * 5. **到期时真正要做的事，是打开那份「维护报告」。**
 *    `run.cmd maintenance` 会把逾期的词条连同**它们引用的来源逐条列出**，
 *    这样复核就是"打开链接、确认还是最新版"的过程，而不是"重读一遍整篇"。
 *    没有这一步，复核计划只会变成一堆没人看的日期。
 */

import type { EvidenceKey } from '../site.config';

/**
 * 各证据等级的复核周期（月）。
 *
 * 取值理由（不是拍脑袋）：
 *   · A（6 个月）：依赖稳定共识，变化慢。但正因为它被当作最可靠的内容，
 *     一旦过时危害最大，所以不给更长周期。
 *   · B（6 个月）：有较好研究支持但存在细节分歧，指南更新会直接影响。
 *   · C（4 个月）：证据有限、以专家经验或间接推论为主，最容易被新证据推翻，
 *     而且读者无法自行判断真伪，所以周期最短。
 *   · D（3 个月）：学界仍在争论，新研究出现的概率最高，重点在于"分歧是否已收敛"。
 */
export const REVIEW_MONTHS: Record<EvidenceKey, number> = {
  A: 6,
  B: 6,
  C: 4,
  D: 3,
};

/** 允许条目用 frontmatter 的 `reviewMonths` 覆盖默认周期（用于个别高度易变的主题）。 */
export function intervalMonths(evidence: EvidenceKey, override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) return override;
  return REVIEW_MONTHS[evidence] ?? 6;
}

/** 把 YYYY-MM-DD 加上 n 个月。用 UTC 计算，避免时区造成的差一天。 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** 计算到期日（YYYY-MM-DD）。 */
export function reviewAfter(updated: Date, evidence: EvidenceKey, override?: number): string {
  return addMonths(updated, intervalMonths(evidence, override)).toISOString().slice(0, 10);
}

/** 逾期天数（负数表示还没到期）。 */
export function daysOverdue(reviewAfterStr: string, now: Date): number {
  const due = new Date(`${reviewAfterStr}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

/**
 * 复核提醒开始显示在页面上的提前量（天）。
 * 到期前 30 天就在词条页提示「即将复核」，避免日期悄悄过去而无人注意。
 */
export const REVIEW_WARN_DAYS = 30;

/** 逾期多久才让构建失败（天）。给人工复核留出缓冲。 */
export const REVIEW_GRACE_DAYS = 60;
