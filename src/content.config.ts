import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORY_LABELS, COST_LEVELS, EVIDENCE_KEYS, TIME_LEVELS } from './site.config';

// 一词条一文件。id 就是文件名（用英文短横线命名，URL 干净、换标题不会换链接）。
const entries = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/entries' }),
  schema: z.object({
    /** 词条标题，通常就是一个问题。 */
    title: z.string().min(2),
    /** 一级分类，必须是 site.config.ts 里 CATEGORY_LABELS 之一。 */
    category: z.enum(CATEGORY_LABELS),
    /** 证据等级 A/B/C/D。 */
    evidence: z.enum(EVIDENCE_KEYS),
    /** 成本档位。 */
    cost: z.enum(COST_LEVELS),
    /** 时间档位：照着做一次大概花多久。 */
    time: z.enum(TIME_LEVELS),
    /** 适用人群，可以写一个字符串，也可以写数组。 */
    audience: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).default('所有人'),
    /** 最后更新日期。注意：它只记「内容最后改过」，不等于「来源最后核对过」。 */
    updated: z.coerce.date(),
    /**
     * 复核到期日（YYYY-MM-DD）。
     *
     * 为什么需要独立字段：`updated` 只回答「最后改过是什么时候」，一次批量改格式
     * 也会刷新它；而这个词条站的核心卖点是「标注证据等级 + 列出权威来源」，
     * 必须能回答「最后核对过来源是什么时候」。详见 src/lib/review.ts 顶部的设计说明。
     *
     * 这是**派生值**——由 `updated` + 证据等级对应的复核周期算出，
     * `scripts/apply-review.mjs` 负责写入，`scripts/check-review.mjs` 校验它是否与策略一致。
     */
    review_after: z.coerce.date().optional(),
    /** 个别高度易变的主题可以覆盖默认复核周期（月）。 */
    reviewMonths: z.number().int().positive().optional(),
    /** 参考来源，至少一条，写清文件/机构名。 */
    sources: z.array(z.string().min(2)).min(1),
    /** 一句话结论。不填就从正文第一段取。 */
    summary: z.string().optional(),
    /** 完整 / 简版。简版表示只写了核心做法，待补。 */
    status: z.enum(['完整', '简版']).default('完整'),
    /**
     * 相关词条的 slug 列表（不带 /entry/ 前缀）。
     *
     * 为什么要有这个字段：正文里的行内互链是「顺手提到才链」，
     * 实测 50 条词条平均只有 1.94 条出链、其中 13 条完全没有出链——
     * 读者读完就成了死胡同。相关词条是**显式的、每条都有**的推荐出口。
     *
     * 用 slug 而不是标题，是因为改标题不该动关联关系。
     * `scripts/check-related.mjs` 会校验这里写的 slug 都存在、不是自己、且双向对称。
     */
    related: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'related 只能写小写字母/数字/短横线的 slug')).default([]),
    /** 自由标签，用于将来的专题聚合。 */
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { entries };
