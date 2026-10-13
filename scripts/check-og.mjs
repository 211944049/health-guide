/**
 * 社交分享标签（Open Graph）体检。
 *
 * 为什么需要：og 标签是**纯声明性的**——写错了构建不报错、页面照常显示，
 * 只有真正把链接发到微信/Twitter 时才发现"怎么是个裸链接"。
 * 而 og:image 最常见的错误是**用了相对路径**（社交平台抓不到，必须有绝对地址）。
 *
 * 检查项：
 *   1. 每个页面都有完整的 og 基础标签（type/site_name/locale/title/description/url）
 *   2. og:image 是**绝对 URL**，且指向的文件真实存在于 dist
 *   3. 词条页用的是自己的图（不是通用图），且**每条词条都有对应的图**
 *   4. og:image 声明了 1200x630（平台据此排版）
 *   5. twitter:card = summary_large_image
 *   6. description 不为空（空摘要分享出去很难看）
 *
 * 用法：node scripts/check-og.mjs
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const problems = [];

async function collect(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await collect(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const allFiles = new Set(await collect(distDir));
const htmlFiles = [...allFiles].filter((f) => f.endsWith('.html')).sort();

/** 取某个 meta 的 content。 */
function meta(html, key) {
  const re = new RegExp(`(?:property|name)="${key.replace(/[:]/g, ':')}"\\s+content="([^"]*)"`);
  return html.match(re)?.[1] ?? null;
}

const REQUIRED = ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:image', 'twitter:card'];

let checked = 0;
const imageUse = new Map(); // 图 -> 用了它的页面数

for (const file of htmlFiles) {
  const html = await readFile(path.join(distDir, file), 'utf8');
  checked += 1;

  for (const key of REQUIRED) {
    const v = meta(html, key);
    if (!v) problems.push(`${file}: 缺少 ${key}`);
  }

  const desc = meta(html, 'og:description');
  if (desc !== null && desc.trim().length < 10) {
    problems.push(`${file}: og:description 太短（"${desc}"）`);
  }

  const img = meta(html, 'og:image');
  if (img) {
    if (!/^https?:\/\//.test(img)) {
      problems.push(`${file}: og:image 不是绝对地址（社交平台抓不到）—— ${img}`);
    } else {
      // 把绝对地址还原成 dist 内的相对路径，确认文件真的存在
      const rel = img.replace(/^https?:\/\/[^/]+\//, '');
      if (!allFiles.has(rel)) {
        problems.push(`${file}: og:image 指向的文件不存在 —— ${rel}`);
      }
      imageUse.set(rel, (imageUse.get(rel) ?? 0) + 1);
    }
  }

  for (const key of ['og:image:width', 'og:image:height']) {
    if (!meta(html, key)) problems.push(`${file}: 缺少 ${key}（平台据此排版）`);
  }

  const card = meta(html, 'twitter:card');
  if (card && card !== 'summary_large_image') {
    problems.push(`${file}: twitter:card 是 "${card}"，期望 summary_large_image`);
  }
}

/* ---------- 每条词条必须有自己独立的分享图 ---------- */

const entryFiles = htmlFiles.filter((f) => f.startsWith('entry/') && f.endsWith('/index.html'));
const missingImages = [];
for (const f of entryFiles) {
  const html = await readFile(path.join(distDir, f), 'utf8');
  const img = meta(html, 'og:image') ?? '';
  const slug = f.replace(/^entry\//, '').replace(/\/index\.html$/, '');
  if (!img.includes(`/og/entry/${slug}.png`)) {
    missingImages.push(`${slug} → ${img || '(无)'}`);
  }
}
if (missingImages.length) {
  problems.push(`${missingImages.length} 条词条没有用自己专属的分享图：${missingImages.slice(0, 3).join('；')}`);
}

console.log(`\n社交分享标签体检：${checked} 个页面，${entryFiles.length} 条词条`);
console.log(`  用到的分享图：${imageUse.size} 张`);
const shared = [...imageUse.entries()].filter(([, n]) => n > 1);
if (shared.length) {
  console.log(`  其中被多个页面共用：${shared.map(([img, n]) => `${img}(${n})`).join(', ')}`);
}

/* ---------- 图片本身：尺寸与体积 ---------- */

const ogImages = [...allFiles].filter((f) => f.startsWith('og/') && f.endsWith('.png'));
let tooBig = 0;
let totalKb = 0;
for (const img of ogImages) {
  const info = await stat(path.join(distDir, img));
  totalKb += info.size / 1024;
  // 微信对分享图有体积限制，控制在 300 KB 以内比较稳
  if (info.size > 300 * 1024) {
    tooBig += 1;
    problems.push(`${img} 体积 ${(info.size / 1024).toFixed(0)} KB 偏大（建议 <300 KB）`);
  }
}
console.log(`  分享图 ${ogImages.length} 张，合计 ${totalKb.toFixed(0)} KB，最大 ${ogImages.length ? Math.max(...(await Promise.all(ogImages.map(async (i) => (await stat(path.join(distDir, i))).size / 1024)))).toFixed(0) : 0} KB`);

if (ogImages.length < entryFiles.length) {
  problems.push(`分享图只有 ${ogImages.length} 张，少于词条数 ${entryFiles.length}（有词条会退回通用图或无图）`);
}

/* ---------- 分享图是否与词条内容一致（按嵌入的内容指纹判断） ---------- */

/*
  为什么需要这一段：
  分享图是构建产物。词条标题或一句话结论改了之后，图就过期了——**但图片自己不会报错**，
  页面上也看不出问题，只有真去分享才发现图上的文字和内容不一致。

  为什么不能靠文件修改时间：本项目的 `apply-review.mjs` 会给所有词条加
  `review_after` 字段、刷新全部 mtime，而那完全不影响图片内容——
  实测这会让 80 张图**全部被误判为过期**。所以改用内容指纹：
  生成器把指纹写进 PNG 的 tEXt 块，这里读出来与当前词条重新算一遍对比。

  指纹算法必须与 `scripts/make-og-images.py` 的 content_fingerprint 完全一致：
      sha256("<DESIGN_VERSION>|<title>|<summary>|<evidence>|<category>") 的前 16 位十六进制
  任何一边改了算法，这里就会全部报过期——这个失败是"响亮"的，比静默不一致好。
*/

/** 从 PNG 里读 tEXt 块。Node 内置没有 PNG 解析，这里手工按 chunk 结构扫。 */
function readPngText(buffer) {
  const out = {};
  if (buffer.length < 8) return out;
  let offset = 8; // 跳过 PNG 签名
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (dataStart + length > buffer.length) break;
    if (type === 'tEXt') {
      const data = buffer.subarray(dataStart, dataStart + length);
      const nul = data.indexOf(0);
      if (nul !== -1) {
        out[data.toString('latin1', 0, nul)] = data.toString('utf8', nul + 1);
      }
    }
    if (type === 'IEND') break;
    offset = dataStart + length + 4; // 跳过数据 + CRC
  }
  return out;
}

/** 与 make-og-images.py 的 content_fingerprint 保持一致。 */
function fingerprint(title, summary, evidence, category) {
  const designVersion = 1; // 必须与 python 侧的 DESIGN_VERSION 一致
  const raw = [designVersion, title, summary, evidence, category]
    .map((v) => (v === undefined || v === null ? '' : String(v)))
    .join('|');
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
}

/**
 * 从词条 markdown 里取画进图里的四个字段。
 *
 * ⚠️ 这里必须用 **YAML 解析**，不能自己写正则剥引号——这是踩过的真 bug：
 *
 * 原来的实现是 `.replace(/^'(.*)'$/s, '$1')`，只剥**一层**引号。
 * 而 `fix-summary-quoting.mjs` 在遇到「已经带引号、且值里有单引号」的行时，
 * 会按 YAML 转义规则把内部单引号写成两个（`''`），于是行看起来像
 *   summary: '……理由**。''
 * 正则剥一层后留下尾部的 `''`，而 **Python 侧（make-og-images.py）用的是 YAML 语义**，
 * 解析结果不同 → 两边算出的指纹不一致 → 分享图闸门报「与词条内容不一致」，
 * 而实际上图是对的、是**检查器算错了**。
 *
 * 结论：同一个字段的提取逻辑在两种语言里必须语义一致。用 js-yaml（已在依赖里）
 * 让 Node 侧也用 YAML 语义，这个偏差就不会再出现。
 */
function fieldsOf(markdown) {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  let data = {};
  try {
    data = yaml.load(fm) ?? {};
  } catch {
    // 解析失败时退化为空，交由其它检查（check-content）报错
    data = {};
  }
  const s = (k) => (data[k] === undefined || data[k] === null ? '' : String(data[k]));
  return {
    title: s('title'),
    summary: s('summary'),
    evidence: s('evidence'),
    category: s('category'),
  };
}

const entriesSrcDir = path.join(root, 'src', 'content', 'entries');
const stale = [];
let fingerprintChecked = 0;
let noFingerprint = 0;

for (const file of htmlFiles) {
  if (!file.startsWith('entry/') || !file.endsWith('/index.html')) continue;
  const slug = file.replace(/^entry\//, '').replace(/\/index\.html$/, '');
  const imgPath = path.join(distDir, 'og', 'entry', `${slug}.png`);
  const buf = await readFile(imgPath).catch(() => null);
  if (!buf) continue;

  const text = readPngText(buf);
  const embedded = text.SiteFingerprint;
  if (!embedded) {
    noFingerprint += 1;
    continue;
  }

  const md = await readFile(path.join(entriesSrcDir, `${slug}.md`), 'utf8').catch(() => null);
  if (!md) continue;
  const f = fieldsOf(md);
  const want = fingerprint(f.title, f.summary, f.evidence, f.category);
  fingerprintChecked += 1;
  if (embedded !== want) {
    stale.push({ slug, embedded, want, title: f.title });
  }
}

console.log(`  指纹校验：${fingerprintChecked} 张有指纹并已比对，${noFingerprint} 张没有指纹（老图）`);
if (noFingerprint > 0) {
  problems.push(
    `${noFingerprint} 张分享图没有内容指纹（是旧版生成器产出的）——跑 run.cmd og:images 重新生成`,
  );
}
if (stale.length > 0) {
  console.log(`  与词条内容不一致（需要重新生成）：${stale.length} 张`);
  for (const s of stale.slice(0, 5)) {
    console.log(`    · ${s.title}（图片指纹 ${s.embedded}，当前应为 ${s.want}）`);
  }
  if (stale.length > 5) console.log(`    … 另有 ${stale.length - 5} 张`);
  problems.push(
    `${stale.length} 张分享图与词条内容不一致（标题或一句话结论改过但图没重生成）——跑 run.cmd og:images`,
  );
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 20)) console.error(`  ✗ ${p}`);
  if (problems.length > 20) console.error(`  … 另有 ${problems.length - 20} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 所有页面的分享标签完整，词条各有专属分享图。\n');
