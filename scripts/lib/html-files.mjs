/**
 * 第三方「站点验证文件」的识别规则（所有页面级闸门共用）。
 *
 * ## 为什么需要这个模块
 *
 * 搜索引擎做站点归属验证时，会要求把一个**别人给的裸 HTML 文件**放到站点根目录：
 *
 *   · 百度：`baidu_verify_codeva-XXXXXXXXXX.html`，内容是一行哈希
 *   · 搜狗：`sogou_verify_XXXX.html`
 *   · Google：`googleXXXX.html`（多数情况走 DNS TXT 或 meta 标签，不产生文件）
 *
 * 这些文件**不属于站点的任何页面**：没有布局、没有导航、没有 `<html lang>`、
 * 没有 `<h1>`、没有跳过链接 —— 而且**本该如此**。百度只检查"这个 URL 返回的内容对不对"，
 * 不关心它是不是一个合规的网页。
 *
 * 但本项目有 10 个闸门会遍历 `dist/` 下所有 `.html` 做页面级断言
 * （无障碍、回到顶部、结构化数据、链接、可信度……）。每次新增一个验证文件，
 * 就会让 10 个闸门同时误报。
 *
 * **所以排除规则必须是集中的一份**，而不是在每个闸门里各写一遍——
 * 那样下次加一个搜狗验证就会漏掉某几个闸门（这个项目已经吃过"内容格式变了、
 * 检查没跟上"的亏，见 HANDOFF 里 RSS 那条）。
 */

const VERIFICATION_FILE =
  /(^|\/)(baidu_verify_[^/]+|sogou_verify_[^/]+|google[0-9a-f]{8,}|Baiduspider|360spider)\.html$/i;

/**
 * 判断一个相对路径是不是第三方的站点验证文件。
 * @param {string} rel 相对 dist 的路径，例如 `baidu_verify_codeva-ZaEgPHoX8X.html`
 */
export function isThirdPartyVerification(rel) {
  return VERIFICATION_FILE.test(rel);
}
