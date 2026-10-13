/**
 * 安装 PortableGit（免安装版）到用户目录，并写一个 git 包装脚本。
 *
 * ## 为什么用 PortableGit 而不是 winget / 安装包
 * 用户的账户**不是管理员**。装到 `Program Files` 会弹 UAC 授权框，需要人工点。
 * PortableGit 是官方免安装版（自解压 7z），解压到用户目录即可，
 * **不需要管理员权限、不改系统 PATH、不写注册表**，卸载只需删目录。
 *
 * ## 这个脚本做什么
 *   1. 用自解压参数把 PortableGit 解到 %USERPROFILE%\PortableGit
 *   2. 验证 git.exe 能跑
 *   3. 写一个 run-git.cmd 包装脚本（免去每次敲完整路径）
 *   4. 打印**可以直接复制粘贴**的推送命令
 *
 * 用法：node scripts/install-git.mjs [--archive <路径>]
 */
import { spawn, execFileSync } from 'node:child_process';
import { stat, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const archive = process.argv.includes('--archive')
  ? process.argv[process.argv.indexOf('--archive') + 1]
  : path.join(os.tmpdir(), 'PortableGit.7z.exe');

const target = path.join(os.homedir(), 'PortableGit');

console.log('\n=== 安装 PortableGit ===\n');

const info = await stat(archive).catch(() => null);
if (!info) {
  console.error(`✗ 找不到安装包: ${archive}`);
  console.error('  先运行下载命令（见 README / 上一次对话输出）。');
  process.exit(1);
}
console.log(`安装包: ${archive}`);
console.log(`  大小: ${(info.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`安装到: ${target}`);
console.log('');

// 已经装过就跳过解压（幂等）
const existing = await stat(path.join(target, 'cmd', 'git.exe')).catch(() => null);
if (existing) {
  console.log('✓ 已经安装过，跳过解压');
} else {
  await mkdir(target, { recursive: true });
  console.log('解压中（约 300 MB，需要一两分钟）...');
  /*
    自解压 7z 的参数：-o 指定输出目录，-y 全部覆盖且不询问。
    注意 -o 后面**不能有空格**，这是 7-Zip 的约定。
  */
  await new Promise((resolve, reject) => {
    const child = spawn(archive, [`-o${target}`, '-y'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`解压失败，退出码 ${code}\n${err.slice(0, 400)}`))));
  });
  console.log('✓ 解压完成');
}

/* ---------- 验证 ---------- */
const gitExe = path.join(target, 'cmd', 'git.exe');
const ver = execFileSync(gitExe, ['--version'], { encoding: 'utf8' }).trim();
console.log(`\n✓ ${ver}`);
console.log(`  路径: ${gitExe}`);

/* ---------- 写包装脚本 ---------- */
/*
  为什么不改系统 PATH：改 PATH 是全局副作用，而且要重开终端才生效。
  写一个 run-git.cmd 放在工作区，随时 `.\run-git.cmd status` 即可，
  不改动用户的系统环境。想加到 PATH 的话用户可自行决定。

  ⚠️ 取工作区路径必须用 fileURLToPath，**不能用 URL.pathname**：
  在 Windows 上 pathname 会给出 `/C:/...` 这种带前导斜杠的形式，
  而且遇到空格会保留 %20 —— 第一版就是这么崩的。
*/
const ws = path.resolve(fileURLToPath(new URL('..', import.meta.url)), '..');
const wrapper = `@echo off
REM PortableGit 包装脚本（由 scripts/install-git.mjs 生成）
REM 用法：在解压出来的仓库目录里执行   ..\\run-git.cmd <git 子命令>
REM   例：..\\run-git.cmd status
"${gitExe}" %*
`;
const wrapperPath = path.join(ws, 'run-git.cmd');
await writeFile(wrapperPath, wrapper, 'utf8');
console.log(`\n✓ 已写出包装脚本: ${wrapperPath}`);

/* ---------- 打印推送命令 ---------- */
console.log(`
────────────────────────────────────────────────────────
 接下来：推送仓库
────────────────────────────────────────────────────────

 先解压 github-repo-lean.zip 到一个目录，比如 D:\\health-guide
 然后在**那个目录**里依次执行（把 <用户名> 换成 211944049）：

   "${gitExe}" init
   "${gitExe}" add .
   "${gitExe}" -c user.name="211944049" -c user.email="211944049@users.noreply.github.com" commit -m "init: 高性价比健康指南（136 条词条）"
   "${gitExe}" branch -M main
   "${gitExe}" remote add origin https://github.com/211944049/<仓库名>.git
   "${gitExe}" push -u origin main

 ⚠️ 第一次 push 会要求登录 GitHub。推荐用 Token 而不是密码：
    GitHub → Settings → Developer settings → Personal access tokens
      → Tokens (classic) → Generate new token → 勾选 repo → 复制
    推送时用户名填 211944049，密码**粘贴那个 token**。

 💡 把 git 加到 PATH（可选，方便以后直接用 git 命令）：
    在 PowerShell 里执行一次：
      [Environment]::SetEnvironmentVariable('PATH', $env:PATH + ';${path.join(target, 'cmd')}', 'User')
    然后**重开**终端。
`);
