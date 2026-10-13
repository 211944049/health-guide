import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 站点域名。只用于生成每个页面的 canonical 链接，不影响站点功能。
// 这是全域唯一的域名来源：BaseLayout 用 Astro.site 取值，不要再去别处写一份。
//
// 默认值是生产域名。做预览、临时用别的地址构建时，用 SITE_URL 覆盖即可：
//   $env:SITE_URL = "https://health-guide.211944049.workers.dev"; run.cmd build
const siteUrl = process.env.SITE_URL ?? 'https://costlifehealth.com';

if (!siteUrl) {
  console.warn('\n[build] 未设置 SITE_URL，本次构建不会输出 canonical 链接。\n');
}

export default defineConfig({
  site: siteUrl,
  trailingSlash: 'ignore',
  // 不要设置 markdown.gfm / markdown.smartypants：Astro 6/7 已废弃这两个字段，
  // 而处理器默认就开着 GFM，所以词条里的对比表格可以直接用。
  devToolbar: { enabled: false },
  integrations: [
    // sitemap 只收正文页，把不需要被搜索引擎收录的页面排掉：
    //   404 页、搜索页（内容依赖前端 JS，抓不到实质内容）
    sitemap({
      filter: (page) => !/\/(404|search)\/?$/.test(page),
    }),
  ],
});
