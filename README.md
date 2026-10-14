# 高性价比健康指南

## 本仓库是什么

**「高性价比健康指南」的源文件仓库。** 网站：<https://costlifehealth.com>

这是一个**个人项目**，把日常健康问题拆成能直接照做的动作。每条词条都标注：

- **证据等级**（A 强 / B 中 / C 弱 / D 争议）与判定依据
- **成本**与**做一次要多久**
- **适用人群**，以及不适用的人
- **什么时候必须去看医生**（这一节每条都有）
- **来源**（指南、国家标准、研究报告）

**不是医疗机构，也不是在线诊所。** 本站不诊断、不开方、不推荐具体药品品牌。
以下两点请务必注意：

> ⚠️ **内容仅供参考，不能替代医生诊断。** 出现词条里列出的「何时求助专业人士」情形，请及时就医。
>
> ⚠️ **健康建议会过时。** 每条词条有 `updated` 和 `review_after` 两个日期字段，
> 到期后需要重新核对来源。如果你看到某条已经过时，欢迎提 issue（见 `CONTRIBUTING.md`）。

### 已知的局限（不掩饰）

- **证据等级是自评的**，依据写在每条词条的「健康原理」一节里，但**没有经过第三方审核**
- 来源以**机构指南、国家标准、综述**为主；少部分结论是机制推论，那些会明确标成 C 级
- 词条**不覆盖诊断和用药**（少数几条讲用药安全，但只到"该不该问医生"这一层）

### 许可

- **代码**：MIT（`LICENSE`）
- **健康词条内容**：CC BY 4.0，**附加要求「不得改写结论与数字」**（`LICENSE-CONTENT.md`）
- **第三方指南与标准的著作权属于各自机构**，本仓库只做著录与链接

---


循证健康生活百科。定位是**生活决策助手**，不是在线诊所：把健康问题拆成能在日常生活里执行的动作，每条都标注证据等级、成本、耗时和适用人群，并写清什么时候该去看医生。

- **工具为骨，媒体为肉**：先做「带问题来、找到答案就走」的工具站，再补内容。
- 首页 = 搜索框 + 分类入口 + 最新更新 + 排期中的选题。

## 技术栈

| 环节 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Astro 6（静态输出） | 构建后是纯静态 HTML，无服务端 |
| 内容 | Markdown，一词条一文件 | 字段由 `src/content.config.ts` 的 Zod schema 校验 |
| 搜索 | Pagefind 1.5 | 纯前端全文搜索，索引在构建时生成，搜索词不上传 |
| 筛选 | 原生 JS | 按分类 / 证据等级 / 成本 / 时间 / 人群组合筛选 |
| 部署 | Cloudflare Pages / Vercel / GitHub Pages | 把 `dist/` 目录直接发布即可 |

## 内容维护约定

### 写完一条就删一条

`src/site.config.ts` 的 `PLANNED_QUESTIONS` 是**排期清单**，不是总目录。
首页的「还没写的题」直接渲染它，**不会**跟已发布的词条去重——所以写完一条词条，
必须同时把这条从 `PLANNED_QUESTIONS` 里删掉。2026-10 已全部写完（数组清空），
累计四批共 **96 条**（`PLANNED_TOTAL = 96`，首页用它算进度）。
首页该区块会自动隐藏（`plannedCount > 0` 才渲染）。

下一批选题确定后按同样格式加回即可。

### 正文互链必须指向存在的词条

正文里可以写 `[净水器怎么选](/entry/water-purifier-choice/)` 这样的行内互链，
但**目标词条必须存在**，否则页面上就是个 404 链接而 `astro build` 不会报错。
`scripts/check-links.mjs` 专门拦这个，已接进 `build` 和 `pnpm check`。

### 证据等级怎么标（口径）

| 等级 | 口径 |
| --- | --- |
| **A 强** | 多国指南一致推荐 **且** 有高质量研究（RCT / 荟萃分析）支持，结论稳定 |
| **B 中** | 有权威指南支持，但证据以观察性研究为主，或细节存在分歧 |
| **C 弱** | 机制合理、方向可靠，但缺少高质量研究；多为操作性建议 |
| **D 争议** | 不同权威机构结论不一致，或学界仍在争论，不当作定论 |

**每条词条的「健康原理」末尾都要写清「为什么标这个等级」**，这是「循证」立场最容易被读者验证的地方。

当前分布（**96 条**）：**A 8 · B 51 · C 35 · D 2**。

## 常用命令

本机 PATH 里既没有 `node` 也没有 `pnpm`，直接敲 `pnpm build` 会报 `'node' is not recognized`。
项目根目录放了一个 `run.cmd`：它把 DSH 自带的 node 加进 PATH，再把命令转发给 pnpm。**用这个入口**：

```bat
run.cmd install        :: 装依赖（改动 package.json 后要手动跑，见下方说明）
run.cmd dev            :: 本地开发，http://localhost:4321
run.cmd build          :: 内容体检 → 互链体检 → 构建 → 生成搜索索引，输出到 dist/
run.cmd preview        :: 预览 dist/（搜索只有在 build 之后才可用）
run.cmd check:content  :: 只跑内容体检
run.cmd check:links    :: 只跑互链体检
run.cmd check          :: 内容体检 + 互链体检 + 全站链接爬取
run.cmd check:sitelinks :: 只跑全站链接爬取（扫 dist/，需先构建）
run.cmd check:livelinks :: 线上死链扫描（把线上页面里的链接真的请求一遍）
run.cmd check:deployed :: 线上核验：把线上站点与本地 dist/ 逐字节比对 + 校验 pagefind 收录页数
run.cmd deploy:zip     :: 生成 dist.zip（1053 KB / 135 个文件），可直接拖到 Cloudflare
run.cmd new --title "隔夜菜能不能吃" --slug leftover-dishes --category 食
```

已经装好 Node 的机器上，直接用 `pnpm <命令>` 效果一样（`run.cmd` 会自动走 PATH 上的 pnpm）。

> `pnpm dev` 下**没有**搜索索引：Pagefind 的索引是构建产物。要看搜索效果，先 `pnpm build` 再 `pnpm preview`。

## 目录结构

```
src/
  site.config.ts          站点名、域名、六大分类、证据等级口径、排期选题（改名字只改这里）
  content.config.ts       词条 frontmatter 的 Zod schema
  content/entries/*.md    词条正文，一词条一文件（文件名即 URL）
  layouts/BaseLayout.astro
  components/             SiteHeader / SiteFooter / EntryCard / EntryBrowser / SearchBox
  lib/entries.ts          取词条、排序、日期与摘要的公共函数
  pages/
    index.astro                   首页
    browse.astro                  全部词条 + 筛选
    category/[category].astro     分类页（复用同一套筛选组件）
    entry/[slug].astro            词条页
    search.astro                  Pagefind 搜索页
    about.astro                   定位与编辑规范
scripts/
  check-content.mjs       内容体检：字段枚举、必需小标题、占位符
  new-entry.mjs           新词条脚手架
```

## 词条怎么改

### Frontmatter

```yaml
---
title: 外卖怎么点更健康
category: 食            # 食 / 衣 / 住 / 行 / 身心 / 健康管理
evidence: B             # A 强 / B 中 / C 弱 / D 争议
cost: 低                # 免费 / 低 / 中 / 高
time: 5分钟             # 1分钟 / 5分钟 / 15分钟 / 30分钟 / 1小时 / 长期
audience: [上班族, 学生] # 也可以是单个字符串
updated: 2026-10-07
status: 完整            # 完整 / 简版
summary: 一句话结论……
sources:
  - 中国营养学会《中国居民膳食指南（2022）》
tags: [外卖, 减盐]
---
```

字段名和取值都定义在 `src/site.config.ts` 与 `src/content.config.ts` 里，写错会被构建拦住。

### 正文

正文必须出现六个 `##` 小标题：**适用人群、具体做法、健康原理、常见误区、风险与禁忌、何时求助专业人士**。

词条模板里的另外五段（一句话结论、证据等级、成本与时间、参考来源、最后更新）由词条页从 frontmatter **自动生成**，正文里不要重复写 —— 这样数字只有一处，不会两处对不上。`pnpm check:content` 会检查这一点。

正文里可以直接写 `[久坐怎么缓解](/entry/sedentary-breaks/)` 这样的行内互链。

**来源里有冒号要加引号**：YAML 会把 `- 世界卫生组织《Screening programmes: a short guide》` 里的 `: ` 当成键值对，数组项就变成了对象，构建时报 `Expected type "string", received "object"`。写成 `- '……: ……'` 即可，`pnpm check:content` 已经会提前拦这类写法。

### 新词条流程

```bash
pnpm new --title "隔夜菜能不能吃" --slug leftover-dishes --category 食 --evidence B
# 补正文 → 补 sources（骨架里是 TODO）→ pnpm check:content → pnpm build
```

`sources` 里留着 `TODO` 或正文有占位内容时，`pnpm build` 会直接失败 —— 这是故意的，半成品不允许上线。

## 环境注意事项（换机器时重点看这一段）

这些都是本机踩过的坑，写下来省得重踩：

1. **pnpm 专有配置必须写在 `pnpm-workspace.yaml`**，不是 `.npmrc`。pnpm 11 会静默忽略 `.npmrc` 里的 `node-linker`。`nodeLinker: hoisted` 是必需的：默认的 isolated 布局用 junction，而本机 Node 不把 junction 解析回真实路径，会让 astro 和 pagefind 都找不到自己的依赖。
2. **Pagefind 的平台二进制放在 `optionalDependencies` 里，六个平台全列了**（`@pagefind/*`）。两个原因：一是 pnpm 的供应链策略会拦下"刚发布"的包，导致 pagefind 自带的 optional 依赖装不上，而 `require.resolve` 找不到二进制时它只会报「平台不支持」，很难查；二是必须放在 `optionalDependencies` 而不是 `devDependencies`，否则 Linux 构建机会因平台不匹配**直接报错**，而不是跳过。放行名单在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里。
3. **Astro 锁在 6.x，不要升到 7.x**。Astro 7 的内容集合同步用的是自定义 Vite environment，会把 CJS 依赖（`yaml`、`picomatch`）当 ESM 执行，直接报 `require is not defined`，构建中断。已确认 `ssr.external`、`environments.astro.resolve.external`、`vite@8.3.1` 都救不回来。
4. **pnpm 的 store / cache / state 用项目内相对路径**（`.pnpm-store` 等，已 gitignore）。写绝对路径（`C:\Users\...`）在 Linux 上不会报错，但会生成一个名字里带反斜杠的奇怪目录；放在项目内则各平台都能用。
5. **`verifyDepsBeforeRun: false`**：pnpm 默认会在 `pnpm run` 前检查依赖、必要时自动 install，那一步会去拉 sharp / esbuild 的全平台二进制（几百 MB）。所以改动 `package.json` 后请手动跑一次 `pnpm install`。
6. **受限沙箱里构建会失败，且不是项目的问题**：
   - Vite 在 Windows 上会执行 `net use` 探测网络盘，沙箱禁止管道 stdio 的子进程 → `spawn EPERM`。
   - Astro 遥测会往 `%APPDATA%\astro\Config` 建目录。用 `ASTRO_TELEMETRY_DISABLED=1` 可关掉（注意 `.env` 文件对它**无效**，必须是环境变量）。
   - 在普通终端里这两条都不存在，直接 `pnpm build` 即可。
7. **本机没有 node/pnpm**：用项目根的 `run.cmd`（见「常用命令」）。它指向 DSH 自带的那份运行时：
   `…\dsh-primary-runtime\dependencies\node\bin` + `…\pnpm\bin\pnpm.mjs`。换机器时改 `run.cmd` 里的两个路径，或者直接用系统里的 node/pnpm。注意 `run.cmd` 必须保持**纯 ASCII**：cmd.exe 按系统代码页读 .cmd 文件，写中文会让下一行被解析错。
8. **YAML 的 `*` 别名陷阱（2026-10 补词条时踩到）**：frontmatter 里 `summary:` 常写成
   `**加粗**……` 的 Markdown，而 YAML 里 `*` 是**别名**的开始符。值未加引号时
   `astro build` 报 `unidentified alias`，**错误信息只给出行列号**（形如 `blue-light-glasses.md:12:138`），
   而 `check-content.mjs` 当时拦不住——一次性 38 条中招。
   解决：**整行用单引号包住**（`summary: '…'`），单引号内的 `*` 和 `:` 都是普通字符。
   已把这条检查加进 `check-content.mjs`，并附了一次性修复脚本 `scripts/fix-summary-quoting.mjs`（幂等）。
9. **PowerShell 的 `.NET` API 不认当前目录的相对路径**：`[System.IO.Compression.ZipFile]::OpenRead("..\handoff\dist.zip")`
   会解析到意料之外的位置而报 `DirectoryNotFoundException`。校验 zip 时**用绝对路径**。
   （连带一条：PowerShell 5.1 用 `Get-Content -Encoding UTF8` 读含多字节字符的 JSON 会乱码并让 `ConvertFrom-Json` 失败，
   校验 `pagefind-entry.json` 这类文件要用 `read` 工具或 Node。）
10. **批量写 YAML 时不要用 PowerShell 的 `-replace` + `Set-Content` 改项目文件**：容易踩编码和换行问题。
    用 Node 脚本按 UTF-8 读写（`scripts/fix-summary-quoting.mjs` 就是这么做的）。
11. **Pagefind 1.5 的默认 UI 不渲染 `data-pagefind-meta`**：`pagefind-ui.js` 里只有
    `pagefind-ui__result-title / -excerpt / -tags` 这些类名，**没有 result-meta**，所以
    `new PagefindUI({ showMeta: ... })` 传了也不会显示。要在搜索结果里显示额外信息，
    得用 Pagefind 的**核心 API**（`import('/pagefind/pagefind.js')` → `search()` → `result.data().meta`）
    自己取数据，再把它插进 UI 渲染好的 DOM 里——`src/pages/search.astro` 就是这么做的
    （用 `MutationObserver` 跟随异步渲染，且做成幂等，拿不到数据时静默跳过、不影响搜索本身）。
12. **`pnpm install` 在这台机器上会卡在供应链校验**：加了 `@astrojs/sitemap` 后跑安装，
    包已经落进 `node_modules`，但进程长时间不退出（在校验 lockfile / 拉元数据，受本机网络影响）。
    判断办法：**直接看 `node_modules/<包名>` 在不在**，在就先继续干活，别死等。
    另外这里装了新包要**显式指定镜像**才快：`pnpm install --registry https://registry.npmmirror.com`。
13. **加了 sitemap 之后 `dist/` 会多两个文件**（`sitemap-index.xml`、`sitemap-0.xml`），
    部署包从 135 个文件变成 138 个。`robots.txt` 里的 `Sitemap:` 行指向
    `https://costlifehealth.com/sitemap-index.xml`——**换域名时要一起改**。
14. **Pagefind 的 `baseUrl` 是「页面」基路径，别手动设**：它默认由 `bundlePath` 推导
    （`/pagefind/` → `/`），而结果地址是 `${baseUrl}/${rawUrl}` 拼出来的。
    错设成 `/pagefind/` 会让**所有搜索结果链接变成 `/pagefind/entry/xxx/`（404）**——
    这是 2026-10 真实发生过的 bug。要改资源目录请用 `bundlePath`。
    回归测试在 `scripts/check-search-urls.mjs`（已接进 `build`）。
15. **前端运行时行为测不到就等于没测**：搜索结果是 JS 渲染的，`curl` 只拿到空壳，
    所以「逐字节比对」和「静态链接爬取」**都发现不了运行时拼出来的坏链接**。
    凡是点了才知道对不对的功能，都要写一个复刻其逻辑的 Node 脚本——不需要浏览器。
16. **`000` 不是 404**：国内直连 Cloudflare 时 curl 会返回 `000`（连接被丢弃）。
    脚本里必须**重试**，并把 `000`（网络不可达）与真实 4xx/5xx **分开统计**，
    否则会把正常页面报成死链（这个坑连着踩了两次）。
17. **用正则匹配源码前先剥注释**：否则会被自己写的「不要这么做」的警告注释误报。
18. **Pagefind 对中文按单字切分，必须拦住单字搜索**：中文没有分词，「外卖」是拿「外」和「卖」
    查两次再合并。用户只输入一个字时会命中几十条无关词条——实测「外」返回 **37 条**
    （「卖」0 条）、「久」28 条、「坐」14 条。这是**输入中间态**造成的假象，
    不是排序坏了。修法：UI 层拦住单个汉字（`scripts/check-search-input.mjs` 有断言），
    并把防抖调到 200ms。英文/数字单字符不受影响。
19. **`apply-related.mjs` 会整文件覆写词条**，所以它自带写入护栏：原文件为空、没有闭合 frontmatter、
    结果比原文短超过 20% —— 任一情况都**拒绝写入**并报警。2026-10 真的发生过一次词条被写空
    （`air-purifier-choice.md` 变成 0 字节），靠 `health-guide-source.zip` 无损恢复。
    教训：**改项目文件不要用 PowerShell 的 `-replace` + `Set-Content` 做「改了再还原」的探针**，
    用 Node 读写；并且**定期重新生成源码归档**，它就是你的保险。

## 验证状态

**已上线**：<https://costlifehealth.com> —— 生产域名。**线上已是 144 条版本**（2026-10 部署），
用 `run.cmd check:deployed` 核验：**172/172 个 HTML 页与本地构建逐字节一致**，Pagefind 收录 **144 页**。
旧的测试地址 <https://health-guide.211944049.workers.dev> 保留着，但国内直连被 DNS 污染，需要代理才能开。

> **⚠️ 核验时的假警报**：国内直连 Cloudflare 时响应**偶发被截断**（同一页重试即好），
> 表现为「线上文件明显比本地小」。这**不是部署问题也不是缓存**——重试后全部一致。
> `check-deployed.mjs` 已内置重试与「长度不符不算通过」的判断，并会打印哪几页首次被截断。

**已在真实浏览器里确认**（2026-10-07，由项目所有者在线上页面实测）：

- 首页搜索框跳转带 `?q=` 后能自动填词并出结果。这个交互依赖脚本派发 `input` 事件触发 Pagefind 的搜索——因为 Pagefind 1.5 的默认 UI **不读** URL 参数（打包产物里没有 `URLSearchParams`），只能这么接。页内输入框类名是 `pagefind-ui__search-input`。
- 「全部词条」页的筛选 chips 多选联动正常（同组「或」、跨组「且」）。
- 站点在浏览器中可正常打开。
- **手机浏览器实测可打开 `https://costlifehealth.com`**（生产域名、不走代理，**首屏 2 秒内、不卡**）——这两条最关键，说明真实读者的网络环境能访问、速度也够用，`workers.dev` 那个"必须挂代理"的问题已经随自定义域名解决。

**本地构建已验证**（`run.cmd build` 一次跑通，退出码 0）：

- **144 条词条全部为「完整」**（简版 0 条）；分类分布 **食 26 · 衣 14 · 住 29 · 行 14 · 护理 20 · 身心 15 · 健康管理 24**；
  证据分布 **A 11 · B 74 · C 55 · D 2**。
- **172 个页面**生成；Pagefind 收录 **144 页**（只收录带 `data-pagefind-body` 的词条页，其余页面是 `data-pagefind-ignore`）。
- **互链体检**：487 条站内链接全部有对应页面（`scripts/check-links.mjs`）。
- 每条词条页都有 `<title>`、canonical、证据等级徽标、自动生成的目录与参考来源（逐页核验 0 问题）。
- 144 条词条都含至少 1 张对照表。
- 内容体检的拦截生效：带 TODO 的骨架词条会让构建失败；非法 slug / 分类会被脚手架拒绝；
  **未加引号的 `*`（YAML 别名）和列表项里的「冒号 + 空格」都会被提前拦下**。

**还没验的**：

- 暗色模式下的观感。
- 144 条词条上线后的手机端首屏表现（已用无头浏览器在 320px 与 390px 视口下量化，**确认无横向溢出**；但真机手感仍未看过）。

> **已更新（2026-10-13）**：**这台机器访问 GitHub 需要代理**——Windows 系统代理开着
> （`127.0.0.1:7890`），浏览器自动走代理，但 **git 与 curl 不读系统代理设置**，
> 所以直连会失败。实测：不走代理 `git ls-remote` 21 秒后失败；走代理 **0.9 秒成功**。
> 配置：`git config --global http.proxy http://127.0.0.1:7890`（https.proxy 同理）。
> `costlifehealth.com` 本身可以正常访问并完成**逐字节核验**：线上 CSS 资源的 SHA256
> 与本地 `dist.zip` 完全相同，172 个 HTML 页面也逐字节相同 —— 即**线上就是本地那一份构建**。

## 已实现 / 未实现

**已实现**：首页（从这里开始 / 小工具 / 证据最强 / 分类）、分类页、词条页、搜索页、**小工具页**（`/tools/`，含 BMI 计算器与久坐计时器）、关于页、404；按分类/证据/成本/时间/人群筛选；Pagefind 全文搜索（**结果带证据等级徽标**、单字输入会被拦、**按完整查询词重排**）；**相关词条推荐**（每条词条底部，772 对关系）；**sitemap**（`sitemap-index.xml`，已在 `robots.txt` 声明）；**RSS 订阅源**（`/rss.xml`，页面 head 里声明）；**社交分享图与 og 标签**（每词条一张）；内容体检 / 互链 / 相关词条 / 入口路径 / **专题** / 小工具 / 工具脚本内链接 / 全站链接 / 搜索（链接·数据·分页·输入·重排）/ RSS / 分享标签 / **结构化数据** / hidden 生效性共**二十八道构建闸门**；新词条脚手架与批量脚手架；选题覆盖分析；分发素材生成；每个词条页底部免责声明；部署所需的安全头与跨平台依赖配置（见 [DEPLOY.md](DEPLOY.md)）。

**未实现**（下一步候选）：

- ✅ 144 条词条全部写完（累计补充五批；选题依据是「读者高频疑问 + 站上空白」，用 `run.cmd topics` 分析）。
- ✅ **142 条版本已部署上线**，线上与本地 `170/170` 页逐字节一致（`run.cmd check:deployed`）。
- ✅ **sitemap**（`@astrojs/sitemap`），已过滤掉 404 与搜索页。**170 条 URL**。
- ✅ **搜索结果显示证据等级**（`data-pagefind-meta` + 前端注入徽标）。
- ✅ **相关词条推荐**（`related` 字段 + 自动闭合关系图；144 条词条的关系已自动闭合）。
- ✅ **RSS**（`/rss.xml`，手写 RSS 2.0，未引入依赖）。
- ✅ **首页改版**：从「最近更新」（同一天更新，排序无意义）改成「从这里开始」6 条入口路径 + 「证据最强的几条」。
- ✅ **小工具**：`/tools/` 目录页 + BMI 计算器（中国标准分界、给健康体重区间、可选腰围判断）+ 久坐提醒计时器（时间戳计时、进度环、活动菜单、可选通知）+ **饮水提醒与记录**（按指南推荐量设目标、点按记账、超时提醒；数值与「每天喝多少水」词条程序化对齐）。全部本地运行。
- ✅ **社交分享图与 og 标签**：**144 张**专属分享图（`public/og/`），分享到微信/小红书不再是裸链接。
- ✅ **结构化数据（JSON-LD）**：`MedicalWebPage` / `Article` / `WebSite`（含站内搜索）/ 面包屑，**不使用** `FAQPage`·`Review`·`AggregateRating`（无事实依据的字段一律不声明）。
- ✅ **专题聚合页**：`/topic/` 目录 + **11 个专题**（上班族 / 家庭健康 / 家里空气和水 / 从零开始运动 / 睡不好 / 家庭安全与应急 / 皮肤干燥修复 / 家电与化学风险 / 身体的信号 / 饮食决策 / 女性健康），按读者处境组织，**每个专题含建议阅读顺序**。选题依据来自 `run.cmd clusters` 的受众词频与跨分类枢纽分析；`run.cmd topiccoverage` 会找出「不在任何专题里」的词条。
- ✅ **内容复核机制**：每条词条有**按证据等级设定的复核到期日**（A/B 6 个月、C 4 个月、D 3 个月）；词条页显示「下次复核」并在到期前提示；`run.cmd maintenance` 生成维护报告，把逾期词条**连同要核对的全部来源**列成清单。
- ✅ **让搜索引擎收录**：`robots.txt` 屏蔽搜索页与 404；**IndexNow** 密钥文件 + 提交脚本（`run.cmd indexnow`），部署后主动通知 Bing/Yandex 等重新抓取。站长平台的认领步骤见项目本地的收录清单（未包含在本仓库中）。
- ✅ **分发素材**：`run.cmd share:cards` 从词条程序化生成 **142 张**社媒卡片（标题备选 / 正文骨架 / 话题标签 / 原文链接），文案不另写一遍，改了词条就会跟着更新。
- ✅ **选题分析工具**（`run.cmd topics`）：按分类找出「读者会问但站上没有」的空白，第二批 19 条就是这么定的。
- ✅ **首屏负担已量化**（`scripts/estimate-first-screen.mjs`）：`/browse/` 压缩后约 21 KB → **判定不需要分批渲染**。
- ⬜ 手机端首屏**真机**复测（已量化、判定不需优化，但始终没在真手机上看过）。
- ⬜ 第三批选题（`run.cmd topics` 显示还剩 3 个空白方向、14 个部分覆盖）。
- ⬜ 更多小工具：饮水提醒（`lib/tools.ts` 加一条 + 建页面即可）。
- ⬜ 专题页，如「上班族健康生活」。
- ⬜ 短视频脚本改编（目前只有图文卡片）。
