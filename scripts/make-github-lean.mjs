/**
 * 给 GitHub 分发包加一个「精简版」。
 *
 * ## 为什么需要
 * 用户的机器上**没有装 git**，所以只能用 GitHub 网页的「上传文件」。
 * 而网页上传有单次数量限制（实测约每次 100 个文件），
 * 完整分发包有 391 个文件 —— 要分 4 批，很折腾。
 *
 * 体积构成：
 *   public/og/*.png    136 张分享图，3.5 MB   ← 占大头，而且**可以重新生成**
 *   src/               165 个文件，1.8 MB     ← 内容主体
 *   scripts/            70 个文件，0.6 MB     ← 校验闸门
 *
 * 所以精简版**排除 public/og/**，并在 README 里说明怎么重新生成。
 * 代价：clone 的人要跑一次 `run.cmd og:images`（需要 Python + Pillow）
 * 才能得到分享图；但**内容、结构、校验、构建全都不缺**。
 *
 * 用法：node scripts/make-github-repo.mjs --lean
 */
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const handoff = path.join(root, '..', 'handoff');
const LEAN = process.argv.includes('--lean');

async function countFiles(dir, skip = []) {
  let n = 0;
  let bytes = 0;
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const rel = path.relative(root, path.join(d, e.name));
      if (skip.some((s) => rel === s || rel.startsWith(s + path.sep) || rel.startsWith(s + '/'))) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        n += 1;
        bytes += (await stat(p)).size;
      }
    }
  }
  await walk(dir);
  return { n, bytes };
}

const EXCLUDE = [
  'node_modules', 'dist', 'dist.zip', '.git', '.astro',
  '离线阅读版-全部词条.html', 'scripts/__pycache__',
  'pnpm-store', 'pnpm-cache', 'pnpm-state',
  '.pnpm-store', '.pnpm-cache', '.pnpm-state',
  /*
    ⚠️ HANDOFF.md 必须排除（2026-10-13 加）。

    它是**内部交接文档**（183 KB），写给项目所有者自己看的，内容是：
      · 用户的邮箱、网络环境（代理）、本地备份目录名
      · 部署平台细节与工具名
      · 作者对自己失误的复盘（"我把 115 个词条改坏过两次"）
      · 本机绝对路径

    这些**不适合放在公开仓库**。而且它对仓库访问者也没有价值 ——
    外部读者需要的是 README.md（怎么用）和 DEPLOY.md（怎么部署），
    不是开发过程中的内部备忘录。

    排除它同时也让仓库更干净：183 KB 的 Markdown 占整包近半。
  */
  'HANDOFF.md',
];
if (LEAN) EXCLUDE.push('public/og');

const outName = LEAN ? 'github-repo-lean.zip' : 'github-repo.zip';
const zip = path.join(handoff, outName);

const full = await countFiles(root, ['node_modules', 'dist', '.git', '.astro', '离线阅读版-全部词条.html']);
const lean = await countFiles(root, [...EXCLUDE]);
console.log(`\n完整版：${full.n} 个文件，${(full.bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`精简版：${lean.n} 个文件，${(lean.bytes / 1024 / 1024).toFixed(1)} MB`);

if (LEAN) {
  /*
    精简版要在 README 里说明「分享图需要自己生成」，
    否则 clone 的人会发现 public/og 是空的而不知道怎么办。
    这段说明是**追加到一个单独文件**而不是改 README ——
    因为 README 是用户的项目文档，不该被打包脚本反复改写。
  */
  const note = `# 这个分发包是精简版

为了让 GitHub 网页上传变得可行（网页上传每次约 100 个文件，
完整版有 394 个），本包排除了两处内容。

## 排除内容

| 排除的 | 大小 | 影响 | 怎么补 |
| --- | --- | --- | --- |
| \`public/og/*.png\` | 3.5 MB（136 张） | 分享到微信/小红书时**没有预览图**；站内页面本身不受影响 | 见下 |
| \`HANDOFF.md\` | 183 KB | **无影响** —— 那是项目所有者的内部开发备忘录，对仓库访问者没有价值 | 不需要补 |

## 生成分享图

需要 Python 3 + Pillow：

\`\`\`bash
python scripts/make-og-images.py
\`\`\`

它会为**每个词条**产出一张 1200×630 的分享图，输出到 \`public/og/entry/\`。
脚本按内容做指纹比对，只重新生成变化过的图，所以可以反复运行。

生成完再 \`pnpm run build\`，分享图的 meta 标签才会指向存在的文件
（否则 \`check-og\` 这道闸门会报错 —— 它专门检查 og:image 指向的文件是否存在）。

## 从别人的机器上构建时要注意

\`run.cmd\` 里的 \`NODEBIN\` / \`PYTHONDIR\` 是**原作者的机器路径**（那是为了在一台
没有全局 Node 的机器上跑构建）。你如果已经装了 Node 和 Python，
**直接用自己的 \`pnpm install && pnpm run build\` 即可**，不需要改这个文件。

## 其余部分完全完整

- \`src/content/entries/\` 全部词条（136 条）
- \`src/\` 全部页面与配置
- \`scripts/\` 全部校验闸门（28 道）
- \`pnpm-lock.yaml\`、\`astro.config.mjs\` 等构建所需文件
- \`README.md\`（怎么用）、\`DEPLOY.md\`（怎么部署）、\`CONTRIBUTING.md\`（怎么纠错）

\`pnpm install && pnpm run build\` 可以构建出**除分享图之外完整可用**的站点。
`;
  await writeFile(path.join(handoff, 'github-repo-精简版说明.md'), note, 'utf8');
  console.log('\n已写出 github-repo-精简版说明.md（提醒 clone 的人怎么补分享图）');
}

execFileSync(
  process.execPath,
  ['scripts/make-zip.mjs', '.', zip, EXCLUDE.join(',')],
  { cwd: root, stdio: 'inherit' },
);

const s = await stat(zip);
console.log(`\n${outName}  (${(s.size / 1024 / 1024).toFixed(1)} MB)`);
