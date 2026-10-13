# 部署

站点是纯静态的：`pnpm build` 产出 `dist/`，把它发布出去就行，没有服务端、没有数据库、没有环境变量。

## 当前线上状态（2026-10 更新）

| 项 | 值 |
| --- | --- |
| 地址 | **<https://costlifehealth.com>**（生产，已生效） |
| 测试地址 | <https://health-guide.211944049.workers.dev>（保留；国内直连被 DNS 污染，需代理） |
| 域名托管 | 域名在阿里云注册，NS 已改为 `amalia.ns.cloudflare.com` / `eugene.ns.cloudflare.com`，由 Cloudflare 托管 DNS |
| www 处理 | `www.costlifehealth.com` 已作为第二个自定义域绑到同一个 Worker，并用**重定向规则**（模板「从 WWW 重定向到根」）301 跳到裸域名。规则实际动作是 `wildcard_replace(http.request.full_uri, r"https://www.*", r"https://${1}")`——作用在 full_uri 上，所以**路径和查询串都会被保留**，「保留查询字符串」不需要勾 |
| 改 DNS 记录后打不开？ | 先确认是不是**负缓存**：用 `Resolve-DnsName -Server 223.5.5.5` 等公共解析器对照。本机解析器（路由器/运营商）会把"域名不存在"缓存住，时长由 SOA TTL 决定——本域名是 **1800 秒（30 分钟）**。清 `ipconfig /flushdns` 只清本机，清不掉上一级。等够时间或换解析器即可，**不是配置错误** |
| 平台 | Cloudflare Workers **静态资产**（在控制台用「Upload your static files」直接上传，不是 Pages 项目、也没连 Git） |
| 账号 | 用项目邮箱注册的 Cloudflare 账号（邮箱与 Account ID 不写进仓库） |
| **当前版本** | **2026-10 上传的 50 条词条构建**，135 个文件；索引哈希 **`zh-cn_4dcffba72b514`**（10 条版本是 `zh-cn_33cc02bff4f6c`，更早是 `zh-cn_fd75cceaa9d57`，可用来判断线上是哪一版） |
| **核验方式** | `run.cmd check:deployed` —— 逐字节比对全部 HTML 页 + 校验 pagefind 索引哈希与收录页数。**这是判断「线上是否最新」的硬证据**，比看哈希或看页面文字可靠 |
| 源码仓库 | `https://github.com/211944049/health-guide`（私有），分支 `main` |
| 请求额度 | 控制台明确写：**仅含静态资产的 Worker，请求免费**，没有每天 10 万次的限制 |

> **⚠️ 核验时别被截断骗到**：国内直连 Cloudflare 时响应**偶发被截断**（同一页重试即好，实测 61 页里 20+ 页首次抓取不完整），
> 表现为「线上文件明显比本地小」（如 3318 B vs 16292 B）。这**既不是部署问题也不是 CDN 缓存**。
> `check-deployed.mjs` 已内置重试，并把「长度不符」判为不通过。


**`workers.dev` 在国内不可用，这已经被实测证实**：它被 DNS 污染，解析到 `31.13.84.34`（Facebook 的 IP 段），关掉代理就打不开。绑了自定义域名之后问题解决——`costlifehealth.com` 解析到 Cloudflare 的 `104.21.66.84` / `172.67.202.36`，`web_fetch` 直接抓到 HTTP 200。同一环境访问 `workers.dev` 仍然失败，说明问题**只出在那个共享域名上，与 Cloudflare 的网络无关**。

## 更新线上内容的两种方式

**方式 1：网页上传（现在用的）**

```bat
run.cmd build          :: 记得先设 SITE_URL，见下面「部署后要改一处」
run.cmd deploy:zip     :: 生成 dist.zip（Node 手写 ZIP，保证正斜杠）
```

然后把 `dist.zip` 拖到 Cloudflare 控制台该 Worker 的上传区，点部署。同一路径覆盖，不会产生第二个站点。

> 不要用 PowerShell 的 `Compress-Archive` 生成这个包：它写的条目用反斜杠分隔，上传后可能解出名字里带字面反斜杠的文件，整站直接挂。`run.cmd deploy:zip` 已经处理好了这一点。

**方式 2：接上 Git 自动部署（推荐长期用）**

见下面「路线 A」。

---

部署前先在本地跑通一次（`run.cmd` 是本机入口，见 README）：

```bat
run.cmd build
run.cmd preview        :: 打开 http://localhost:4321 确认搜索和筛选都正常
```

> 本机受限环境里构建需要放开沙箱：Vite 在 Windows 上会执行 `net use` 探测网络盘，沙箱禁止管道 stdio 的子进程。普通终端没这个问题。

---

## 路线 A：GitHub + Cloudflare Pages（推荐）

推一次代码就自动部署，有版本历史和每次提交的预览链接。内容站每周更新，这条路的长期成本最低。

**前提**：这台机器没有 git，需要先装：

```powershell
winget install --id Git.Git -e
```

装完**新开一个终端**（PATH 要重新加载），然后：

```powershell
cd C:\Users\86173\Documents\deepseek-harness\default-workspace\health-guide
git init
git add .
git commit -m "初始版本：站点骨架 + 10 个词条"
```

到 GitHub 建一个空仓库（不要勾选 README / .gitignore），然后：

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

再到 Cloudflare 控制台：**Workers & Pages → Create → Pages → Connect to Git**，选这个仓库，构建配置填：

| 配置项 | 值 |
| --- | --- |
| Framework preset | Astro |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| 环境变量 | `NODE_VERSION` = `22`（Astro 6 要求 Node ≥ 20） |

之后每次 `git push` 都会自动重新构建并发布。

---

## 路线 B：wrangler 直接上传（想今天就拿到 URL）

不需要 git，但每次更新都要手动重跑一次，也没有版本历史。

```powershell
run.cmd dlx wrangler@latest login
run.cmd dlx wrangler@latest pages deploy dist --project-name=health-guide
```

`login` 会在浏览器里让你授权 Cloudflare 账号；`deploy` 第一次运行会让你创建项目，之后每次上传都会给一个新的部署 URL，同时更新生产域名。

---

## 绑定自定义域名（域名审核通过后做）

**为什么必须绑**：`*.workers.dev` 在国内被 DNS 污染（实测解析到 `31.13.84.34`，这是 Facebook 的 IP 段），不挂代理打不开。而 Cloudflare 自己的 IP 是通的（`www.cloudflare.com` 正常解析到 104.16.x.x），所以绑自定义域名是最省事的解法。

**控制台路径**：Cloudflare → Workers 和 Pages → `health-guide` → **设置 → 域和路由 → 添加 → 自定义域** → 填 **`costlifehealth.com`**（直接填裸域名，不要填 `health-guide.costlifehealth.com` 这种子域，除非你确实想用子域）。

**再把 www 一起处理**：建议同时添加 `www.costlifehealth.com`，然后用 Cloudflare 的 **规则 → 重定向规则** 把 `www` 永久跳转到裸域名。否则两个地址都能打开，搜索引擎会当成重复内容。

Cloudflare 会自动建 DNS 记录并签发证书，通常几分钟内生效。绑之前确认域名的 NS 已经指向 Cloudflare（把域名加进 Cloudflare 时它会给你两个 NS，要在域名注册商那边改）。

**生效后要做两件事**：

1. 用新域名重新构建打包（canonical 要跟着改）：
   ```powershell
   $env:SITE_URL = "https://costlifehealth.com"
   run.cmd build
   run.cmd deploy:zip
   ```
   （`SITE_URL` 的默认值已经是这个域名，所以其实不设也对；显式写上是为了避免以后换域名时漏掉。）
2. 把新的 `dist.zip` 传到 Worker（同一路径覆盖，不会产生第二个站点）。

**验证**：手机流量（关 WiFi、关代理）打开新域名。最好找不同运营商的人各试一次——国内可达性因运营商和地区而异。

**一个诚实的预期**：Cloudflare 免费版在国内**通常能打开，但速度一般**，晚高峰可能偏慢。如果实测下来慢到影响阅读，下一步是域名备案 + 国内对象存储/CDN（备案周期 1–3 周，需要域名和主体资质）。

## 部署时必须设 SITE_URL

`SITE_URL` 决定每个页面的 canonical 链接。默认值已经是生产域名 `https://costlifehealth.com`，做预览或临时用别的地址构建时才需要覆盖：

```powershell
$env:SITE_URL = "https://health-guide.211944049.workers.dev"
run.cmd build
```

验证是否生效：

```powershell
Select-String -Path dist\index.html -Pattern 'rel="canonical"'
```

如果挂了 Git 自动部署，在 Cloudflare 的环境变量里加一条 `SITE_URL` 即可。绑定自定义域名后，记得把它改成新域名并重新部署。

---

## 仓库里这几个文件是干什么的

| 文件 | 作用 |
| --- | --- |
| `public/_headers` | Cloudflare Pages / Netlify 的响应头：安全头 + 静态资源缓存策略。**故意没加 CSP**，因为 Pagefind 依赖 wasm / Worker / blob，CSP 写错会让搜索失效 |
| `public/robots.txt` | 允许全站抓取。等做了 sitemap 再把 `Sitemap:` 加进去 |
| `public/favicon.svg` | 站点图标 |
| `.gitignore` | 排除 `node_modules/`、`dist/`、`.astro/` 和 pnpm 的本地 store |

---

## CI 上容易踩的坑（已经在仓库里处理好了）

1. **Pagefind 的平台二进制**放在 `optionalDependencies` 里，六个平台都列了。用 `devDependencies` 钉死 Windows 那个包的话，Linux 构建机会因平台不匹配直接报错。
2. **pnpm 的 store / cache 用相对路径**（`.pnpm-store` 等），不是 `C:\Users\...` 绝对路径 —— 绝对路径在 Linux 上会变成一个名字里带反斜杠的奇怪目录。
3. **`minimumReleaseAgeExclude` 里列了六个平台的 pagefind 包**，否则 pnpm 的供应链策略会拦下"刚发布"的包，导致 pagefind 找不到可执行文件。
4. **`verifyDepsBeforeRun: false`**：pnpm 默认会在 `pnpm run` 前自动 install，那一步会去拉 sharp / esbuild 的全平台二进制（几百 MB）。CI 上一般会显式跑 `pnpm install`，不受影响。
5. Astro 锁在 6.x。升到 7.x 会因为内容集合同步时把 CJS 依赖当 ESM 执行而构建失败，详见 README。

## 还没做的

- **sitemap**：装了 `@astrojs/sitemap` 才能给搜索引擎提交，需要先定下真实域名。
- **自定义域名**：在 Cloudflare Pages 的 Custom domains 里绑定，绑定后记得改 `astro.config.mjs` 的 `site`。
