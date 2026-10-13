/**
 * 组装 GitHub 开源仓库的分发包。
 *
 * ## 为什么值得做（相对"在 Google 拼反链排名"）
 *
 * 用户真正的问题不是排名，而是**Googlebot 抓得太慢**（37 已索引 / 33 排队）。
 * 对一个新域名，外链是抓取优先级的主要信号。而 GitHub 是**最省力、最有效**的一环：
 *   · GitHub 域名权重高，Google 抓得飞快
 *   · 「开源 + 每条标证据等级 + 可核实来源」本身有传播性
 *   · 副作用是别人能核对来源 —— 与本站"不编造"的定位一致
 *
 * ## 这个脚本做什么
 *   · 生成 LICENSE（代码 MIT）与 LICENSE-CONTENT（内容 CC BY 4.0）
 *   · 生成 CONTRIBUTING.md（纠错流程：**必须给来源**）
 *   · 在 README.md 顶部插入"公开说明 + 免责声明"（只插一次，幂等）
 *   · 打包成 handoff/github-repo.zip（排除 node_modules / dist / 备份目录）
 *
 * ⚠️ **不会**自动推送到 GitHub —— 那需要用户自己的账号。
 *    脚本只输出分发包和推送命令。
 *
 * ⚠️ 许可建议：代码 MIT、内容 CC BY 4.0 是最常见的组合。
 *    但**这是用户的著作权**，脚本生成的只是建议值，用户可以随时改。
 *
 * 用法：node scripts/make-github-repo.mjs
 */
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const handoff = path.join(root, '..', 'handoff');

/* ---------- 1. LICENSE（代码） ---------- */

const MIT = `MIT License

Copyright (c) 2026 高性价比健康指南

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

/* ---------- 2. LICENSE-CONTENT（健康内容） ---------- */

/*
  内容单独用一个许可，理由必须写清楚：
  健康内容与代码的风险不同——代码写错是 bug，健康建议被误用是伤害。
  所以内容用 CC BY 4.0（可转载、需署名），并**明确要求不得改写结论与数字**。
*/
const CC_CONTENT = `# 内容许可（健康词条正文）

本仓库的**健康词条正文**（\`src/content/entries/*.md\` 及其衍生文本）采用
**知识共享 署名 4.0 国际（CC BY 4.0）** 许可。

你可以自由地共享、转载、改编，但**必须遵守以下条件**：

## 1. 署名

转载或改编时须注明来源，并提供指向本站或本仓库的链接：

> 内容来自「高性价比健康指南」https://costlifehealth.com

## 2. 不得改写结论与数字

这是**本许可的附加要求**，也是与标准 CC BY 4.0 的主要差别：

- **可以**润色语气、调整排版、加 emoji、按平台习惯改写开头
- **不可以**改动**结论、阈值、剂量、温度、时长、频次**这类具体数字
- **不可以**删掉「什么时候该去看医生」「风险与禁忌」这两节中的内容后当作完整建议发布

理由：这些数字和边界条件是内容的全部价值所在。改动它们会让一条原本安全的建议
变成有害的建议，而读者无从察觉。

## 3. 不得暗示医学背书

不得声称本内容经过任何医疗机构、学会或专家审核，也不得用于暗示诊断或治疗建议。

## 4. 免责声明必须保留

转载时请保留这句话：

> 本站是生活决策助手，不是在线诊所。内容仅供参考，不能替代医生诊断。
> 出现文中列出的「何时求助专业人士」情形，请及时就医。

---

## 代码部分

仓库中的**代码**（Astro 站点、构建脚本、校验脚本）采用 **MIT 许可**，见 \`LICENSE\`。

## 第三方来源

词条中引用的指南、标准与研究报告，**著作权属于各自发布机构**。
本仓库只做著录与链接，不复制其正文。引用时请遵守原机构的转载规定。
`;

/* ---------- 3. CONTRIBUTING.md ---------- */

const CONTRIBUTING = `# 纠错与贡献

这个仓库最有价值的地方是**它可以被核实**：每条词条都标了证据等级和来源，
每句话都应该能在来源里找到依据。所以贡献的核心规则只有一条：

## 提出修改时，请给出出处

**只说「我觉得不对」很难处理。** 请提供以下任一种：

- 指南 / 标准的**名称 + 年份**（例如《中国居民膳食指南（2022）》）
- **论文**（能给链接或 DOI 最好）
- **权威机构页面**的链接

有了出处才能核对，也才能判断是"原文写错了"还是"我们的结论需要更新"。

## 特别欢迎的几类修正

| 类型 | 说明 |
| --- | --- |
| **事实错误** | 数字写错、机构名写错、年份写错 |
| **证据等级标错** | 例如一条只有专家经验的建议被标成了 A 级 |
| **来源过时** | 引用的指南已被新版替代 |
| **表述会引起误用** | 例如某个禁忌没有写清、容易被理解成"所有人都适用" |
| **缺失的「何时就医」** | 某条词条没有写清什么情况必须看医生 |

## 不接受的内容

- **没有出处的健康主张**。这个仓库不收录"我听说""网上都说"。
- **产品推荐、带货链接**。
- **把内容改成更像医疗建议**。本站定位是生活决策助手，不是在线诊所；
  我们不诊断、不开方、不推荐具体药品品牌。

## 提 issue 还是提 PR

- **不确定对不对** → 开 issue，写清哪条词条、哪句话、你的依据
- **确定要改** → 直接提 PR，改 \`src/content/entries/<slug>.md\`，
  并在 PR 描述里说明依据

改完之后请跑一遍校验（需要 Node）：

\`\`\`bash
pnpm install
pnpm run build
\`\`\`

\`build\` 里有 28 道校验闸门，会检查来源合法性、行内互链、相关词条对称性、
markdown 渲染、无障碍等。**校验不通过 CI 不会合并。**

## 关于「证据等级」

| 等级 | 口径 |
| --- | --- |
| **A 强** | 多国指南一致推荐，且有高质量研究（RCT / 荟萃分析）支持 |
| **B 中** | 有较好研究或权威指南支持，但存在细节分歧 |
| **C 弱** | 证据有限，以专家经验或间接推论为主 |
| **D 争议** | 研究结论不一致，学界仍在争论 |

**我们宁可标低也不标高。** 如果你发现某条被标高了，那是我们最希望被指出的错误。
`;

/* ---------- 写入许可与贡献指南（幂等） ---------- */

async function writeIfChanged(p, content, label) {
  const before = await readFile(p, 'utf8').catch(() => null);
  if (before === content) {
    console.log(`  · ${label} 已是最新`);
    return false;
  }
  await writeFile(p, content, 'utf8');
  console.log(`  ${before === null ? '+' : '~'} ${label}`);
  return true;
}

console.log('\n生成许可与贡献指南：');
await writeIfChanged(path.join(root, 'LICENSE'), MIT, 'LICENSE（代码 · MIT）');
await writeIfChanged(path.join(root, 'LICENSE-CONTENT.md'), CC_CONTENT, 'LICENSE-CONTENT.md（内容 · CC BY 4.0）');
await writeIfChanged(path.join(root, 'CONTRIBUTING.md'), CONTRIBUTING, 'CONTRIBUTING.md');

/* ---------- 4. README 顶部插入公开说明 + 免责声明 ---------- */

const README = path.join(root, 'README.md');
let readme = await readFile(README, 'utf8');

const ANCHOR = '## 本仓库是什么';
if (!readme.includes(ANCHOR)) {
  const intro = `## 本仓库是什么

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
> ⚠️ **健康建议会过时。** 每条词条有 \`updated\` 和 \`review_after\` 两个日期字段，
> 到期后需要重新核对来源。如果你看到某条已经过时，欢迎提 issue（见 \`CONTRIBUTING.md\`）。

### 已知的局限（不掩饰）

- **证据等级是自评的**，依据写在每条词条的「健康原理」一节里，但**没有经过第三方审核**
- 来源以**机构指南、国家标准、综述**为主；少部分结论是机制推论，那些会明确标成 C 级
- 词条**不覆盖诊断和用药**（少数几条讲用药安全，但只到"该不该问医生"这一层）

### 许可

- **代码**：MIT（\`LICENSE\`）
- **健康词条内容**：CC BY 4.0，**附加要求「不得改写结论与数字」**（\`LICENSE-CONTENT.md\`）
- **第三方指南与标准的著作权属于各自机构**，本仓库只做著录与链接

---

`;
  readme = readme.replace(/^# 高性价比健康指南\n/, `# 高性价比健康指南\n\n${intro}`);
  await writeFile(README, readme, 'utf8');
  console.log('  ~ README.md（顶部插入公开说明与免责声明）');
} else {
  console.log('  · README.md 已含公开说明');
}

/* ---------- 5. package.json 补 license 字段 ---------- */

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
if (pkg.license !== 'MIT') {
  pkg.license = 'MIT';
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('  ~ package.json（license: MIT）');
} else {
  console.log('  · package.json 已有 license');
}

/* ---------- 6. 打包 ---------- */

const zip = path.join(handoff, 'github-repo.zip');
await mkdir(handoff, { recursive: true });
// 复用项目的打包脚本，保持排除规则一致
execFileSync(
  process.execPath,
  [
    'scripts/make-zip.mjs',
    '.',
    zip,
    [
      'node_modules', 'dist', 'dist.zip', '.git', '.astro',
      '离线阅读版-全部词条.html', 'scripts/__pycache__',
      'pnpm-store', 'pnpm-cache', 'pnpm-state', '.pnpm-store', '.pnpm-cache', '.pnpm-state',
    ].join(','),
  ],
  { cwd: root, stdio: 'inherit' },
);

const info = await stat(zip);
console.log(`\n分发包: ${path.relative(root, zip)}  (${(info.size / 1024 / 1024).toFixed(1)} MB)`);

/* ---------- 7. 打印推送命令 ---------- */

console.log(`
下一步（需要你自己的 GitHub 账号）：

  1. 在 https://github.com/new 建一个空仓库
     建议名字：health-guide
     描述（可直接粘贴）：
       循证健康生活指南 · 136 条生活决策词条，每条标注证据等级与来源 | An evidence-graded Chinese health guide

  2. 解压分发包，然后在解压出来的目录里执行：

       git init
       git add .
       git commit -m "init: 高性价比健康指南（136 条词条，28 道校验闸门）"
       git branch -M main
       git remote add origin https://github.com/<你的用户名>/health-guide.git
       git push -u origin main

  3. 推上去之后，在仓库页面右侧 About 里设置 Topics（有助于被搜到）：
       chinese  health  health-guide  evidence-based  astro  static-site
       markdown  healthcare  preventive-medicine  self-care  wellness

  4. 最后把仓库地址加到网站「关于」页，形成双向引用。

⚠️ 许可说明：脚本生成的是**建议**许可（代码 MIT / 内容 CC BY 4.0 + 不得改写结论）。
   这是你的著作权，任何时候都可以改。改完记得同步 LICENSE-CONTENT.md。
`);
