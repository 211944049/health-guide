/**
 * 结构化数据（JSON-LD）构建。
 *
 * 为什么要做：搜索结果里的标题、摘要、日期、面包屑来自结构化数据。
 * 没有它，搜索引擎只能自己猜，展示形态不可控；有它，能出现更完整的条目
 * （标题、一句话摘要、更新时间、所在分类路径），点击率比裸链接高。
 *
 * ⚠️ 本文件必须遵守两条纪律：
 *   1. **只声明页面上真实存在的信息**。结构化数据造假（比如声明不存在的评分、
 *      作者、FAQ）会被搜索引擎判定为作弊。所以这里只用词条 frontmatter 里有的字段。
 *   2. **不把词条结论塞进 FAQPage**。我们的内容不是"问答对"，硬凑成 FAQ
 *      既容易触发限制，也不诚实。工具页的常见问题才是真问答，但数量不够，
 *      所以当前**不使用** FAQPage，只做 Article / WebPage / 面包屑。
 *
 * 类型选择：
 *   · 词条页 → `MedicalWebPage` + `Article`（健康内容，MedicalWebPage 更贴合）
 *   · 其他页面 → `WebPage`
 *   · 首页额外 → `WebSite` + `SearchAction`（让搜索引擎识别站内搜索）
 *   · 每页 → `BreadcrumbList`（展示层级路径）
 *
 * 用法：由 BaseLayout 调用，拼进 <head>。
 */

/** schema.org 里用 ISO 8601 日期。 */
const iso = (date: Date) => date.toISOString();

export interface Crumb {
  name: string;
  /** 站内绝对路径，如 `/entry/blood-pressure-at-home/`。 */
  path: string;
}

export interface SchemaInput {
  /** 站点根地址，如 https://costlifehealth.com（不带尾斜杠）。 */
  origin: string;
  siteName: string;
  siteDescription: string;
  pageTitle: string;
  pageDescription: string;
  /** 当前页路径，如 /entry/xxx/。 */
  path: string;
  /** 是否词条页（决定用 MedicalWebPage 还是 WebPage）。 */
  isEntry?: boolean;
  /** 词条页字段。 */
  entry?: {
    title: string;
    summary: string;
    updated: Date;
    category: string;
    audience: string[];
  };
  /** 面包屑（不含首页，会自动加上）。 */
  crumbs?: Crumb[];
}

/**
 * 生成一个页面完整的 JSON-LD 图。
 *
 * 用 `@graph` + `@id` 互相引用，而不是多个独立的 <script>：
 * 这样各节点关系明确（Article 的 isPartOf 指向 WebPage、breadcrumb 指向 BreadcrumbList），
 * 是 schema.org 推荐的组织方式。
 */
export function buildSchemaGraph(input: SchemaInput): Record<string, unknown>[] {
  const { origin, path } = input;
  const url = `${origin}${path}`;
  const pageId = `${url}#webpage`;
  const graph: Record<string, unknown>[] = [];

  // 1) 网页本身
  const webPage: Record<string, unknown> = {
    '@type': input.isEntry ? 'MedicalWebPage' : 'WebPage',
    '@id': pageId,
    url,
    name: input.pageTitle,
    description: input.pageDescription,
    inLanguage: 'zh-CN',
    isPartOf: { '@id': `${origin}/#website` },
  };
  if (input.isEntry && input.entry) {
    // MedicalWebPage 的受众：用词条里已有的受众字段，不编造
    if (input.entry.audience.length > 0) {
      webPage.audience = input.entry.audience.map((name) => ({ '@type': 'Audience', audienceType: name }));
    }
    webPage.lastReviewed = iso(input.entry.updated);
  }
  graph.push(webPage);

  // 2) 站点（含站内搜索入口）
  graph.push({
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: `${origin}/`,
    name: input.siteName,
    description: input.siteDescription,
    inLanguage: 'zh-CN',
    publisher: { '@id': `${origin}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/search/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  });

  /*
    3) 发布者。**不写 logo**：我们没有合适的方形 logo 文件，
    而 schema.org 的 publisher.logo 缺失会让部分校验工具报错。
    宁可少一个可选字段，也不要填一个假的或不存在的图片地址。
  */
  graph.push({
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: input.siteName,
    url: `${origin}/`,
  });

  // 4) 词条正文
  if (input.isEntry && input.entry) {
    graph.push({
      '@type': 'Article',
      '@id': `${url}#article`,
      isPartOf: { '@id': pageId },
      headline: input.entry.title,
      description: input.entry.summary,
      inLanguage: 'zh-CN',
      dateModified: iso(input.entry.updated),
      // 本站所有词条都由站方编辑撰写并核对来源，所以 author 是组织而非虚构的个人
      author: { '@id': `${origin}/#organization` },
      publisher: { '@id': `${origin}/#organization` },
      about: { '@type': 'Thing', name: input.entry.category },
      mainEntityOfPage: { '@id': pageId },
    });
  }

  // 5) 面包屑
  const crumbs: Crumb[] = [{ name: '首页', path: '/' }, ...(input.crumbs ?? [])];
  if (crumbs.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: `${origin}${c.path}`,
      })),
    });
  }

  return graph;
}

/**
 * 序列化成放进 <script type="application/ld+json"> 的字符串。
 *
 * ⚠️ 两个必须处理的转义问题：
 *   1. 内容里出现 `</script>` 会**提前结束 script 标签**，破坏页面。必须转义 `<`。
 *   2. JSON 里的 `-->` 之类在 HTML 注释上下文中也有风险，所以统一把 `<` 转成 `\u003c`。
 *      这是 JSON 合法转义，解析器读出来仍是 `<`，但 HTML 解析器不会把它当标签。
 */
export function serializeSchema(graph: Record<string, unknown>[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
