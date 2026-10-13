/**
 * 小工具清单。
 *
 * 为什么要单独一个文件：工具会陆续增加（BMI、久坐计时、饮水提醒…），
 * 清单放在这里，首页和 /tools/ 目录页共用一份；词条页将来也可以按 slug 关联。
 *
 * `related` 里写词条 slug：工具的流量应该能导流到内容，反之亦然。
 * `scripts/check-tools.mjs` 会校验这些 slug 存在、且页面文件也在。
 */

export interface Tool {
  /** URL 段，页面在 src/pages/tools/<slug>.astro。 */
  slug: string;
  emoji: string;
  title: string;
  /** 首页/目录页上的一句话说明。 */
  desc: string;
  /** 相关的词条 slug，用于「相关词条」互导。 */
  related: string[];
}

/**
 * 小工具里用到的站内链接。
 *
 * 为什么单独导出一份：有些链接写在**前端脚本**（`<script is:inline>`）里，
 * 而 `check-site-links.mjs` 会剥掉 script 块再爬链接——它看不到这些链接，
 * 写错了也没人管。`scripts/check-tool-links.mjs` 会拿这份清单在构建产物里逐个验证。
 * （工具页里直接写在模板里的「相关词条」链接不在此清单，那些脚本已经能爬到。）
 */
export const TOOL_INTERNAL_LINKS: Record<string, { text: string; href: string }[]> = {
  sedentary: [
    { text: '久坐怎么缓解', href: '/entry/sedentary-breaks/' },
    { text: '通勤怎么增加运动量', href: '/entry/commute-exercise/' },
    { text: '拉伸怎么做', href: '/entry/stretching/' },
    { text: '力量训练怎么入门', href: '/entry/strength-training/' },
  ],
  water: [
    { text: '每天喝多少水', href: '/entry/daily-water/' },
    { text: '运动时该不该喝运动饮料', href: '/entry/sports-drink/' },
    { text: '净水器怎么选', href: '/entry/water-purifier-choice/' },
    { text: '饮水机怎么清洁', href: '/entry/water-dispenser-cleaning/' },
  ],
};

export const TOOLS: Tool[] = [
  {
    slug: 'bmi',
    emoji: '⚖️',
    title: 'BMI 与健康体重区间',
    desc: '填身高体重，算出 BMI、对应的健康体重区间，以及是否需要用腰围补充判断。',
    related: ['oil-salt-sugar', 'strength-training', 'staple-food', 'daily-steps'],
  },
  {
    slug: 'sedentary',
    emoji: '⏱️',
    title: '久坐提醒计时器',
    desc: '按 30–60 分钟循环提醒你起身，2–3 分钟的活动菜单直接照着挑，不用自己想。',
    related: ['sedentary-breaks', 'commute-exercise', 'stretching', 'strength-training'],
  },
  {
    slug: 'water',
    emoji: '💧',
    title: '饮水提醒与记录',
    desc: '按性别算出你的每日目标，点一下记一杯，超过间隔没喝就提醒你。不用数杯子。',
    related: ['daily-water', 'sports-drink', 'water-purifier-choice', 'water-dispenser-cleaning'],
  },
];
