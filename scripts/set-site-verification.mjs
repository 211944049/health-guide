/**
 * 写入站长平台的站点验证码。
 *
 * 用法：
 *   node scripts/set-site-verification.mjs google <验证码>
 *   node scripts/set-site-verification.mjs bing   <验证码>
 *   node scripts/set-site-verification.mjs        # 查看当前状态
 *
 * 验证码从哪来：
 *   · Google Search Console → 添加资源 → 选「网址前缀」→ 输入 https://costlifehealth.com/
 *     → 验证方式选「HTML 标记」→ 它会给你一行
 *       <meta name="google-site-verification" content="XXXXXXXX" />
 *     把 content 引号里的那串作为 <验证码> 传进来（整行贴进来也可以，脚本会自动提取）。
 *   · Bing 站长工具 → 同样有 meta 标签方式，name 是 msvalidate.01。
 *
 * ⚠️ 只改 site.config.ts 里那一个字段，用精确替换而不是正则重写整个文件——
 *    万一格式对不上会明确报错，不会写坏配置（本项目有过文件被写空的教训）。
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cfgPath = path.join(root, 'src', 'site.config.ts');

const [, , platform, raw] = process.argv;

const FIELD = { google: 'google', bing: 'bing' };
const META_NAME = { google: 'google-site-verification', bing: 'msvalidate.01' };

const src = await readFile(cfgPath, 'utf8');

/** 读出当前值。 */
function current(which) {
  const m = src.match(new RegExp(`${which}:\\s*'([^']*)'`));
  return m ? m[1] : null;
}

if (!platform) {
  console.log('\n当前站点验证码状态：');
  for (const p of Object.keys(FIELD)) {
    const v = current(p);
    console.log(`  ${p.padEnd(7)} ${v ? `已设置（${v.slice(0, 12)}…）` : '未设置'}`);
  }
  console.log('\n用法：node scripts/set-site-verification.mjs <google|bing> <验证码>\n');
  process.exit(0);
}

if (!FIELD[platform]) {
  console.error(`\n[X] 平台只能是 google 或 bing，收到的是「${platform}」\n`);
  process.exit(1);
}

// 允许清空：传 '-' 或 'clear' 就把该平台的验证码置空
const CLEAR_TOKENS = ['-', 'clear', 'none', '空'];
if (CLEAR_TOKENS.includes(raw)) {
  const patternClear = new RegExp(`(${platform}:\\s*)'[^']*'`);
  if (!patternClear.test(src)) {
    console.error(`\n[X] 找不到 verification.${platform} 字段\n`);
    process.exit(1);
  }
  await writeFile(cfgPath, src.replace(patternClear, `$1''`), 'utf8');
  console.log(`\n[OK] 已清空 ${platform} 的验证码（对应 meta 标签不再输出）\n`);
  process.exit(0);
}

if (!raw) {
  console.error(`\n[X] 缺少验证码。`);
  console.error(`    用法：node scripts/set-site-verification.mjs ${platform} <验证码>`);
  console.error(`    清空：node scripts/set-site-verification.mjs ${platform} -\n`);
  process.exit(1);
}

/*
  容错：允许把整行 <meta ...> 贴进来。从里面提取 content 的值；
  如果没找到 meta 标签，就把输入本身当作验证码（去掉可能的引号和空白）。
*/
let value = raw;
const fromMeta = raw.match(/content=["']([^"']+)["']/);
if (fromMeta) {
  value = fromMeta[1];
  console.log(`从 <meta> 标签里提取到验证码：${value}`);
} else {
  value = raw.replace(/^['"]|['"]$/g, '').trim();
}

if (!/^[A-Za-z0-9_\-.:+/=]{8,200}$/.test(value)) {
  console.error(`\n[X] 验证码格式看起来不对：「${value}」`);
  console.error('    验证码通常是一串字母数字（可能含 - _ .）。请确认复制完整。\n');
  process.exit(1);
}

const before = current(platform);
if (before === value) {
  console.log(`\n[OK] ${platform} 的验证码已经是这个值，无需修改。\n`);
  process.exit(0);
}

// 精确替换该字段的值（只动这一处）
const pattern = new RegExp(`(${platform}:\\s*)'[^']*'`);
if (!pattern.test(src)) {
  console.error(`\n[X] 在 site.config.ts 里找不到 verification.${platform} 字段。`);
  console.error('    请确认 src/site.config.ts 里有：verification: { google: \'\', bing: \'\' }\n');
  process.exit(1);
}

const next = src.replace(pattern, `$1'${value}'`);

// 写前护栏：结果必须仍有合法结构、且长度没有明显缩水（防止意外截断）
if (!next.includes('verification:') || next.length < src.length * 0.95) {
  console.error('\n[X] 替换结果看起来不对（长度异常），已放弃写入。\n');
  process.exit(1);
}

await writeFile(cfgPath, next, 'utf8');

console.log(`\n[OK] 已写入 ${platform} 的站点验证码`);
console.log(`     meta 标签：<meta name="${META_NAME[platform]}" content="${value}" />`);
console.log('');
console.log('     下一步：');
console.log('       1. run.cmd build            构建（会重新生成 dist/）');
console.log('       2. 上传 handoff\\dist.zip 到 Cloudflare');
console.log('       3. 回到站长平台点「验证」');
console.log('');
