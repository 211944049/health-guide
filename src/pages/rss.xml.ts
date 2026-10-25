import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getEntriesSorted, summaryOf, isoDate } from '../lib/entries';
import { SITE } from '../site.config';

/**
 * RSS 2.0 订阅源，输出到 /rss.xml。
 *
 * 为什么手写而不用 @astrojs/rss：
 * 本机 pnpm install 会卡在供应链校验（见 HANDOFF 坑清单），而这个 feed 的格式很固定，
 * 手写一百行以内就能覆盖，不值得为它引入依赖和安装风险。
 *
 * 几个容易写错、这里刻意处理了的点：
 *   - XML 里 `&` `<` `>` `"` `'` 必须转义，否则 feed 直接解析失败
 *   - 日期用 RFC 822（RSS 要求），不是 ISO 8601
 *   - Atom 的 self link 要指向自己的真实地址，否则部分阅读器会报错
 *   - 正文里的相对链接（/entry/xxx/）要补成绝对地址，否则在阅读器里点不开
 */
export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.href ?? 'https://costlifehealth.com').replace(/\/$/, '');
  const entries = await getEntriesSorted();

  const escapeXml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  /** RSS 要求 RFC 822 日期。 */
  const rfc822 = (date: Date) => date.toUTCString();

  /*
    摘要里要剥掉 Markdown 标记**和 HTML 标签**。

    为什么：description 是**纯文本**（已做 XML 转义，不能放 HTML），
    而 summaryOf() 返回的是 Markdown 源文，里面常有加粗写法——

      · 早期是 `**加粗**`，不剥的话订阅器里会看到一串星号
      · 2026-10 全站把 12402 处 `**` 换成了 `<strong>`（修中文强调在
        标点旁失配的问题），于是摘要里变成了 HTML 标签。
        只剥 `**` 不剥标签的话，订阅器里会看到字面的 `<strong>…</strong>`。

    实测：改这一行之前，144 条里有 **101 条**的 description 带字面标签
    （453 对 `<strong>`）。而 `check-rss.mjs` 当时**没拦住**——它只查
    「残留 Markdown」不查「残留 HTML」，属于闸门没跟上内容格式的变化。
  */
  const stripMarkdown = (value: string) =>
    value
      .replace(/<[^>]+>/g, '') // HTML 标签（先剥，避免标签内的属性被后续规则破坏）
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接只留文字
      .replace(/\*\*([^*]+)\*\*/g, '$1') // 粗体
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2') // 斜体
      .replace(/`([^`]+)`/g, '$1') // 行内代码
      .replace(/^[-*>]\s*/gm, '') // 行首列表/引用符号
      .replace(/\s+/g, ' ')
      .trim();

  const items = entries.map((entry) => {
    const url = `${origin}/entry/${entry.id}/`;
    const summary = stripMarkdown(summaryOf(entry));

    /*
      只放一句话结论（description），不放全文。
      为什么：50 条词条的全文加起来 600+ KB，全塞进 feed 会让订阅器每次刷新都拉一遍，
      对读者和流量都不友好。想读全文点标题跳站内即可。
    */
    return `    <item>
      <title>${escapeXml(entry.data.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <category>${escapeXml(entry.data.category)}</category>
      <pubDate>${rfc822(entry.data.updated)}</pubDate>
      <description>${escapeXml(summary)}</description>
    </item>`;
  });

  const lastBuild = entries[0]?.data.updated ?? new Date();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <link>${escapeXml(origin)}/</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>zh-cn</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <atom:link href="${escapeXml(origin)}/rss.xml" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
