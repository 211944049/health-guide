import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES } from '../site.config';

export type Entry = CollectionEntry<'entries'>;

/** 全部词条，按最后更新时间倒序。 */
export async function getEntriesSorted(): Promise<Entry[]> {
  const entries = await getCollection('entries');
  return entries.sort((a, b) => b.data.updated.getTime() - a.data.updated.getTime());
}

/** audience 允许写字符串或数组，统一成数组。 */
export function audienceList(entry: Entry): string[] {
  const value = entry.data.audience;
  return Array.isArray(value) ? value : [value];
}

/** 标题按类别取用；title 即问题。 */
export function entryHref(entry: Entry): string {
  return `/entry/${entry.id}/`;
}

export function categoryHref(label: string): string {
  const category = CATEGORIES.find((c) => c.label === label);
  return category ? `/category/${category.key}/` : '/browse/';
}

export function formatDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function isoDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** 一句话结论：优先用 frontmatter 的 summary，否则取正文第一段。 */
export function summaryOf(entry: Entry): string {
  const explicit = entry.data.summary?.trim();
  if (explicit) return explicit;
  const body = entry.body ?? '';
  const paragraph = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith('#') && !block.startsWith('---'));
  if (!paragraph) return '';
  return paragraph
    .replace(/^[-*>]\s*/gm, '')
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

/**
 * 把**行内标记**转成可渲染的 HTML，供 set:html 输出。
 *
 * ⚠️ 为什么**不转义尖括号**（这一点踩过坑）：
 *
 * 第一版先做 HTML 转义再做 markdown 转换。结果 frontmatter 的 summary 里
 * 已经写成 `<strong>x</strong>` 的内容被转义成 `&lt;strong&gt;x&lt;/strong&gt;`，
 * **读者看到的是标签本身**（只有截图能发现，构建和文本比较都正常）。
 *
 * 原因是：正文（.md）走 markdown 解析，而 summary / 专题字段**不经过解析**，
 * 两者都允许作者直接写 HTML 标签（项目早期就在用 `<strong>`，从未转义）。
 * 所以这里**保持原有行为，不做 HTML 转义**——这些内容是作者自己写在仓库里的，
 * 不是外来输入。与 Astro 对 `.md` 正文的处理方式一致。
 *
 * 只做三件事：markdown 链接 → <a>、行内代码 → <code>、`**x**` → <strong>。
 */
export function renderInline(raw: string, opts: { links?: boolean } = {}): string {
  if (!raw) return '';
  const allowLinks = opts.links !== false;
  let out = String(raw);

  // 链接 [文字](url) —— 只允许站内相对路径与 http(s)，挡掉 javascript: 之类
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) => {
    if (!/^(\/|https?:)/.test(href)) return whole;
    /*
      卡片内部要去掉链接，只留文字（opts.links === false）。

      ⚠️ 为什么必须这样（2026-10-26 修的既有 bug）
      EntryCard 的外层就是 `<a class="entry-card">`，摘要里再渲染一个 `<a>`
      就是**锚点嵌套**——非法 HTML。浏览器遇到内层 <a> 会提前闭合外层，于是：

        · 卡片结构崩坏，摘要文字溢出到卡片外
        · `-webkit-line-clamp` 失效（盒子已经断了），卡片高度参差不齐
        · 整张卡片的点击区域变得不可预测

      这个 bug 在改版前就存在，只是列表页扫一眼就能看见。
    */
    if (!allowLinks) return text;
    const external = /^https?:/.test(href);
    const attrs = external ? ' rel="nofollow noopener" target="_blank"' : '';
    return `<a href="${href}"${attrs}>${text}</a>`;
  });

  // 行内代码 `x`（放在加粗之前，避免 `` `**x**` `` 被误解析）
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 加粗 **x**（不跨行）。已经写成 <strong> 的内容不受影响。
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

  return out;
}

/**
 * 把 summary 转成可渲染的 HTML。
 * 保留这个包装是为了不改动已有的 7 处调用点；实现见 renderInline。
 *
 * 传 `{ links: false }` 时把 markdown 链接降级成纯文字 —— **卡片内部必须这样**，
 * 因为卡片本身已经是 <a>，内部不能再有锚点（详见 renderInline 里的说明）。
 */
export function summaryHtml(entry: Entry, opts: { links?: boolean } = {}): string {
  return renderInline(summaryOf(entry), opts);
}

/** 按分类标签统计词条数量，用于首页分类卡片。 */
export function countByCategory(entries: Entry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.data.category;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * 取某个词条的相关词条。
 *
 * frontmatter 里只存 slug（改标题不该动关联关系），所以在这里还原成词条对象。
 * 找不到的 slug 会被静默跳过——真正的把关交给 `scripts/check-related.mjs`，
 * 它在构建时报错，而不是让页面悄悄少一个推荐。
 */
export function relatedEntries(entry: Entry, all: Entry[]): Entry[] {
  const byId = new Map(all.map((e) => [e.id, e]));
  return (entry.data.related ?? [])
    .map((id) => byId.get(id))
    .filter((e): e is Entry => Boolean(e) && e!.id !== entry.id);
}

/** 一句话描述某个相关词条为什么可能相关：用它的分类标签，最省事也最不啰嗦。 */
export function relatedReason(entry: Entry): string {
  return entry.data.category;
}
