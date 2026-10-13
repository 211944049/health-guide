/**
 * 生成可直接上传到 Cloudflare Pages / Workers 的 zip。
 *
 * 为什么不用 PowerShell 的 Compress-Archive：它写出来的 zip 条目用**反斜杠**做分隔符，
 * 上传到托管平台后可能解出名字里带字面反斜杠的文件，整站直接挂掉。这个脚本按 ZIP 规范
 * 写正斜杠，并把 UTF-8 文件名标记（general purpose bit 11）打开。
 *
 * 用法：node scripts/make-zip.mjs [源目录=dist] [输出文件=dist.zip] [跳过的顶层名，逗号分隔]
 * 例：  node scripts/make-zip.mjs . ../health-guide-source.zip node_modules,.pnpm-store,dist,.git
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const sourceDir = path.resolve(process.argv[2] ?? 'dist');
const outFile = path.resolve(process.argv[3] ?? 'dist.zip');
const skip = new Set(
  (process.argv[4] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);

/**
 * 递归收集文件，返回相对路径（正斜杠）排序后的列表。
 *
 * ⚠️ 排除规则的匹配方式（2026-10-13 修）：
 * 原来只检查**顶层名字**（`if (!prefix && skip.has(entry.name))`），
 * 所以传 `public/og` 这种**带路径的规则永远匹配不上**——
 * 打包 GitHub 精简版时踩到了这个坑（排除了 `public/og` 但文件数一个没少）。
 *
 * 现在按**相对路径**匹配，并且顶层名字的写法仍然有效：
 *   `node_modules`    → 匹配顶层的 node_modules（原有用法，不变）
 *   `public/og`       → 匹配 public/og 整个目录（新增能力）
 */
async function collect(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (skip.has(rel) || skip.has(entry.name)) continue;
    if (entry.isDirectory()) {
      files.push(...(await collect(path.join(dir, entry.name), rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

/** DOS 时间戳（ZIP 用的老格式）。 */
function dosDateTime(date) {
  return {
    time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31),
    date: (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31),
  };
}

const files = (await collect(sourceDir)).sort();
if (files.length === 0) {
  console.error(`✗ ${path.relative(process.cwd(), sourceDir)} 是空的，先跑构建。`);
  process.exit(1);
}

const chunks = [];
const central = [];
let offset = 0;
let stored = 0;

for (const rel of files) {
  const full = path.join(sourceDir, rel);
  const info = await stat(full);
  const data = await readFile(full);
  const { time, date } = dosDateTime(info.mtime);

  const deflated = deflateRawSync(data, { level: 9 });
  // 已经压过的文件（wasm、图片）再压反而变大，这种情况直接原样存。
  const useDeflate = deflated.length < data.length;
  const method = useDeflate ? 8 : 0;
  const payload = useDeflate ? deflated : data;
  if (!useDeflate) stored += 1;

  const nameBuf = Buffer.from(rel, 'utf8');
  const sum = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // 文件名按 UTF-8 解释
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  chunks.push(local, nameBuf, payload);

  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x0800, 8);
  record.writeUInt16LE(method, 10);
  record.writeUInt16LE(time, 12);
  record.writeUInt16LE(date, 14);
  record.writeUInt32LE(sum, 16);
  record.writeUInt32LE(payload.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(nameBuf.length, 28);
  record.writeUInt16LE(0, 30);
  record.writeUInt16LE(0, 32);
  record.writeUInt16LE(0, 34);
  record.writeUInt16LE(0, 36);
  record.writeUInt32LE(0, 38);
  record.writeUInt32LE(offset, 42);
  central.push(record, nameBuf);

  offset += local.length + nameBuf.length + payload.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

await writeFile(outFile, Buffer.concat([...chunks, centralBuf, eocd]));

const size = (await stat(outFile)).size;
console.log(`\n✓ ${path.relative(process.cwd(), outFile)}`);
console.log(`  ${files.length} 个文件（其中 ${stored} 个未压缩），${(size / 1024).toFixed(1)} KB`);
if (files.includes('index.html')) {
  console.log('  根目录有 index.html —— 可以直接上传部署');
} else {
  console.log('  根目录没有 index.html —— 这是源码归档，不是部署包');
}
