// 站点全局配置：改名、换域名、调分类都只改这一个文件。
// 词条文件里的 frontmatter 字段值必须在这里的枚举里，否则构建会报错。

/**
 * 一级分类的中文名。这是词条 frontmatter 里 `category` 的合法取值。
 *
 * ⚠️ 2026-10-12 新增「护理」。
 * 起因：用户问「长痘为什么归在衣？跟衣有什么关系」——问得对。
 * 原来的「衣」把**穿在身上的**（内衣、袜子、鞋、面料）和
 * **抹在身上的**（洗面奶、唇膏、防晒霜、祛痘、美白）混在一起，
 * 用户看到「长痘」在「衣」下会以为分类错了。而且「衣」的 desc 里
 * 本来就写着「防晒、洗护」——等于自认越界。
 *
 * 拆法：
 *   · **衣** = 买和洗的织物与鞋帽（15 条）
 *   · **护理** = 用在皮肤/身体/口腔上的（17 条）—— 顺带把原本放在
 *     「健康管理」里的 4 条口腔护理（牙线、漱口水、口腔护理、牙刷）也收进来，
 *     它们和护肤是同类：**日常自己做、靠习惯而非就医的事**。
 */
export const CATEGORY_LABELS = ['食', '衣', '住', '行', '护理', '身心', '健康管理'] as const;
export type CategoryLabel = (typeof CATEGORY_LABELS)[number];

/** 证据等级。A 强 / B 中 / C 弱 / D 争议。 */
export const EVIDENCE_KEYS = ['A', 'B', 'C', 'D'] as const;
export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];

/** 成本口径：免费 / 低（每月 50 元以内）/ 中（每月 50–300 元）/ 高（一次性 500 元以上或每月 300 元以上）。 */
export const COST_LEVELS = ['免费', '低', '中', '高'] as const;
export type CostLevel = (typeof COST_LEVELS)[number];

/** 时间口径：读完并照着做一次大概要花多久。 */
export const TIME_LEVELS = ['1分钟', '5分钟', '15分钟', '30分钟', '1小时', '长期'] as const;
export type TimeLevel = (typeof TIME_LEVELS)[number];

export interface StartPath {
  emoji: string;
  title: string;
  desc: string;
  entries: string[];
}

export const SITE = {
  name: '高性价比健康指南',
  /** 品牌名里用主色高亮的那一段（必须与 name 的开头一致，否则整名都用正文色）。 */
  nameAccent: '高性价比',
  short: '健康指南',
  tagline: '不做在线诊所，做生活决策助手',
  description:
    '把健康从医院拉回日常生活：衣食住行、护理、睡眠、运动、心理与健康管理，每个问题给一个能直接照做的答案，并标注证据等级、成本与时间。',
  // 注意：这里故意不放站点域名。域名只在 astro.config.mjs 的 site 里定义一处
  // （可用 SITE_URL 环境变量覆盖），页面里的 canonical 从 Astro.site 取。
  disclaimer: '本站内容仅供参考，不构成医疗建议，不能替代面诊、诊断与处方。',
  editionNote: '每个词条都标注证据等级与最后更新时间；内容随指南更新而修订。',
  /**
   * 纠错与联系的邮箱。
   *
   * 为什么这是一个**结构字段**而不是随便写在页面里的文字：
   * ① 健康内容一定有错的时候，没有纠错渠道就意味着错误会一直留在线上、没人能告诉你。
   * ② Google 的搜索质量指南对医疗健康类内容（YMYL）有额外要求，其中一项就是
   *    「读者能联系到发布者、能报告错误」——属于 E-E-A-T 里 Trust 的一部分。
   *
   * 只有一个地方定义，关于页与页脚都从这里取；`check-trust.mjs` 会校验它
   * 格式合法、且三处显示一致。留空时页面会如实显示「尚未开通」，而不是留一个假地址。
   */
  contactEmail: '211944049@qq.com',
  /**
   * 发布者身份的如实声明。
   *
   * YMYL 内容建议有明确的发布者身份。本站是个人维护的科普站，所以**如实说明**，
   * 不虚构医学机构或专家背书——**虚构背书比没有背书更糟**，既误导读者，
   * 也可能违反平台规范。这段话会显示在关于页。
   */
  publisherNote:
    '本站由个人独立维护，不是医疗机构，也不提供诊疗服务。所有词条都由维护者查阅公开指南与标准后撰写，并在文末列出依据。',
  /**
   * 源码仓库地址。
   *
   * ## 为什么要在站点上放这个链接
   *
   * ① **可核实性**。本站反复强调"来源透明、不编造"，而把 136 条词条的源文件
   *    公开，读者和同行可以**直接检查**我们的写法、证据等级判断和引用方式。
   *    这比在页面上声明"我们很严谨"有力得多。
   * ② **纠错渠道**。`CONTRIBUTING.md` 里写了提交修正的流程（核心规则是"必须给出处"），
   *    比邮件更结构化。
   * ③ 顺带的：仓库与站点互相引用，对搜索引擎来说是双向的可信信号。
   *
   * ## 为什么留空时页面显示"尚未开通"而不是隐藏这一项
   *
   * 与 `contactEmail` 同一个理由：宁可如实显示"还没有"，也不要让读者以为
   * 有而找不到。`check-trust.mjs` 会校验这里填的地址格式合法。
   */
  githubRepo: 'https://github.com/211944049/health-guide',
  /**
   * 支持/打赏渠道地址（爱发电等）。留空时 `/support/` 页面会如实说明「还没有开通渠道」。
   *
   * ## 为什么只放一个链接，而不是贴收款码
   *
   * ① **性质要清楚**：打赏是**赠与**，不是交易。一旦出现「打赏解锁内容」
   *    或「付费提问」，性质就变成经营性服务和**有偿医疗建议**——后者需要资质。
   *    爱发电把「支持创作者」这件事规范化，也自己处理实名，比贴个人收款码稳。
   * ② **观感**：本站的定位是「不卖货、不接广告、每条标出处」。贴收款码像是在要钱；
   *    一个规范的「支持」页面则说得清「为什么会有这一页、钱花在哪」。
   * ③ **可替换**：渠道换了只改这一处；`check-trust.mjs` 会校验格式。
   *
   * 填法：把爱发电主页地址（形如 https://afdian.com/a/xxx）粘进来。
   *
   * ## ⚠️ 2026-10-25 实测：爱发电当前不可用
   *
   * | 域名 | 结果 |
   * | --- | --- |
   * | `afdian.com` | **403**（nginx 拒答；国内 IP、换 UA 都是 403） |
   * | `ifdian.net`（长期备用域名） | 跳转后 **403** |
   * | `www.ifdian.net` | 301 → `ifdian.net/` → 403 |
   * | `guide.afdian.com` | 200（只有帮助文档可访问） |
   * | `afdian.net` | DNS 解析失败 |
   *
   * 出口 IP 已确认是**中国广东联通**，同期百度 / 知乎 / 小红书均正常，
   * 所以**不是代理问题、也不是地区限制**，是站点本身在拒答。
   *
   * 因此这条暂时留空，改用下面的 `supportQr`（微信赞赏码）。
   * 爱发电恢复后把地址填回来、清空 `supportQr` 即可，**页面代码不用改**。
   */
  supportUrl: '',
  /**
   * 赞赏码图片路径（图片放在 `public/` 下，如 `/support-qr.png`）。
   *
   * ## 为什么改用赞赏码
   *
   * 实测第三方打赏平台在这个网络下大多不可用：
   *   · 爱发电 afdian.com / ifdian.net → **403**
   *   · Ko-fi → **403**
   *   · BuyMeACoffee → 301
   *   · 面包多 mbd.pub → 200（可用，但更偏"卖数字商品"）
   *
   * 而**微信赞赏码不依赖任何第三方，谁也关不掉**。
   *
   * ## 赞赏码 vs 个人收款码
   *
   * 两者是分开的：赞赏码是微信支付为「收受赞赏」单独提供的功能
   * （微信 → 我 → 服务 → 收付款 → 赞赏码），
   * **不会暴露你的个人收款二维码**，性质也明确是赠与而不是交易。
   *
   * 获取：微信 → 我 → 服务 → 收付款 → 赞赏码 → 保存图片 → 放到 public/support-qr.png
   *
   * ## ⚠️ 微信导出的原图**必须裁切**
   *
   * 实测微信导出的赞赏码是 **1280×1280**，但二维码图案只占中间 **491px（38%）**，
   * 其余是白边、引导语文字和底部黄色横条。
   * 若按网页 240px 显示，真正的码只剩 **92px** —— **手机扫不出来**。
   *
   * 已裁切成 **632×632**（码占 78%），网页按 280px 显示，实际码约 217px。
   * 裁切只去掉白边和文字，**没有动码本身**（三个定位角、中心头像都完整）。
   * 引导语文字不放进图里——网页上有正文，重复没意义，还会把码挤小。
   */
  supportQr: '/support-qr.png',
  /**
   * 搜索引擎站长平台的站点验证码。留空则**不输出**对应的 meta 标签。
   *
   * 为什么用 meta 标签而不是 DNS 验证：Google Search Console 选「网域」资源时
   * 只能改 DNS TXT 记录；选「网址前缀」就可以用 HTML 标记，**不用碰 DNS**，
   * 对非技术操作更省事。这里只放 content 的值（不含整个 <meta> 标签）。
   *
   * 填法：scripts/set-site-verification.mjs <值>
   */
  verification: {
    google: '',
    bing: '',
  },
};

export interface CategoryMeta {
  key: string;
  label: CategoryLabel;
  emoji: string;
  desc: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'food', label: '食', emoji: '🍚', desc: '怎么吃、怎么买、怎么点、厨房、饮水、咖啡酒精' },
  { key: 'clothing', label: '衣', emoji: '👕', desc: '内衣、袜子、鞋、保暖透气、面料与洗护' },
  { key: 'home', label: '住', emoji: '🏠', desc: '空气、水、光、噪音、湿度霉菌、清洁' },
  { key: 'move', label: '行', emoji: '🚶', desc: '通勤、久坐、运动、旅行、户外' },
  { key: 'care', label: '护理', emoji: '🧴', desc: '护肤、防晒、洗护、口腔与身体护理' },
  { key: 'mind', label: '身心', emoji: '🧠', desc: '睡眠、压力、屏幕、心理' },
  { key: 'manage', label: '健康管理', emoji: '🩺', desc: '体检、疫苗、用药、就医、慢病与减重' },
];

export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
export const CATEGORY_BY_LABEL = new Map(CATEGORIES.map((c) => [c.label, c]));

export const EVIDENCE_META: Record<EvidenceKey, { short: string; full: string; desc: string }> = {
  A: { short: 'A 强', full: 'A · 证据强', desc: '多项高质量研究或权威指南一致支持，结论稳定' },
  B: { short: 'B 中', full: 'B · 证据中', desc: '有较好研究或权威指南支持，但存在细节分歧' },
  C: { short: 'C 弱', full: 'C · 证据弱', desc: '证据有限、以专家经验或间接推论为主，仅供参考' },
  D: { short: 'D 争议', full: 'D · 有争议', desc: '研究结论不一致，或学界仍在争论，不当作定论' },
};

/** 还没写的选题，用来告诉读者接下来补什么。
 *
 * 维护约定：**写完一条就从这里删掉那一条**。这个列表是「排期」，不是「总目录」——
 * 首页的「还没写的题」直接渲染它，不会跟已发布的词条做去重，
 * 所以忘了删就会出现「已经写好的词条还挂在待写清单里」。
 * 已写条数由 entries 目录统计，不写死在这里。
 *
 * 2026-10-12：第五批 16 条（口腔工具、头发皮肤、居家卫生、女性健康），词条总数 99 → **115**。
 * 这一批的选题依据：`run.cmd assess3` 显示**衣只有 10 条、是最薄的分类**，
 * 所以重点补衣（+4）；其余按「高频但站上没有」选（药品相互作用、在家测血糖、
 * 看懂化验单、食物中毒、二手烟、老房子水质……）。
 *
 * **下一批的建议**：内容线已经连续四批，分类均衡度显著改善（变异系数 0.269 → 0.14）。
 * 再往下做，`assess3` 显示的候选要么重叠过高、要么是长尾。**所以更该做的是**：
 *   · 等 Search Console「效果」报告的真实搜索数据，按读者实际在搜的词定选题；
 *   · 或者把已有内容组织成新专题、新工具（投入产出比更高）。
 */
export const START_PATHS: StartPath[] = [
  {
    emoji: '🍚',
    title: '先管吃：买东西和点外卖',
    desc: '不用记热量，学会看标签、点外卖和控油盐糖，覆盖日常最高频的决策。',
    entries: ['nutrition-label', 'takeout-ordering', 'oil-salt-sugar', 'daily-water'],
  },
  {
    emoji: '💻',
    title: '久坐上班族：把活动量补回来',
    desc: '办公室人群最实际的一组——怎么打断久坐、通勤怎么凑运动量、走多少步、怎么开始练力量。',
    entries: ['sedentary-breaks', 'commute-exercise', 'daily-steps', 'strength-training'],
  },
  {
    emoji: '🌙',
    title: '睡不好：从环境到行为',
    desc: '先查环境和噪音，再处理失眠本身。失眠的一线治疗不是安眠药，这几条讲清了怎么做。',
    entries: ['sleep-environment', 'insomnia', 'noise-reduction', 'lighting'],
  },
  {
    emoji: '🩺',
    title: '健康管理：把预防做在前面',
    desc: '体检、疫苗、口腔、以及「什么情况必须去医院」——这几条是本站证据等级最高的内容。',
    entries: ['health-checkup', 'adult-vaccines', 'oral-care', 'when-to-see-a-doctor'],
  },
  {
    emoji: '🏠',
    title: '住得安心：空气、水、潮湿',
    desc: '装修后的甲醛、喝的水、家里发霉和湿度——都是长期暴露、容易被忽略的问题。',
    entries: ['formaldehyde-testing', 'water-purifier-choice', 'mold-prevention', 'humidity'],
  },
  {
    emoji: '☀️',
    title: '出门在外：防晒与防护',
    desc: '防晒怎么选、怎么穿、怎么防蚊。户外活动人群和敏感肌的一组。',
    entries: ['sunscreen-choice', 'sun-protective-clothing', 'mosquito-protection'],
  },
];

export const PLANNED_QUESTIONS: { category: CategoryLabel; items: string[] }[] = [];

/*
  原先这里有一行 `export const PLANNED_TOTAL = 115;`，用于首页进度展示。**已删除（2026-10-26）。**

  两个原因：
  ① 它会被超过。删之前实际已写到 144，首页于是显示「已写 144 个，计划 115 个」——
     一句自相矛盾的话。目标值一旦被超过，就只剩下尴尬。
  ② 维护者还会继续加词条，**固定总数本身就是错的设定**。
     改成报「已写多少 + 覆盖几个分类」，两个都是事实，永远不会过期。

  `PLANNED_QUESTIONS` 保留：它是一个「接下来补什么」的队列，空了就不显示；
  有内容时会列出选题。这个机制和「总目标」不是一回事。
*/

