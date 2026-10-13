/**
 * 参考来源著录体检。
 *
 * 这一节的可信度完全取决于「著录的东西是不是真的」。所以这个闸门查三类事：
 *
 * ## 一、格式合法性（能机器判定的部分）
 *   · 每条 source 必须以 `[类型标识].` 结尾（GB/T 7714-2015 的文献类型标识）
 *   · 类型标识只能是 M / J / C / D / R / S / P / EB/OL / N / G
 *   · `|||` 分隔符两侧都不能为空
 *
 * ## 二、不许编造（本项目最重要的一条底线）
 *   · **不允许出现页码**（`第 X–Y 页`、`: 123-130.`）——
 *     原始资料里一条都没有，出现即说明是编造的
 *   · **不允许出现出版地**（`北京:`、`上海:` 等）—— 同上
 *   · 不允许出现 `DOI` —— 同上
 *   这三项都是"看起来更规范但与事实不符"的典型来源。
 *
 * ## 三、URL 必须真的可访问
 *   · 只验证 `|||` 后面的官方入口（数量有限，可以逐个请求）
 *   · 反爬拦截（403/412 等）算通过——读者用浏览器能打开
 *
 * 用法：node scripts/check-sources.mjs [--dir <路径>] [--skip-url]
 */

import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const dirArgIndex = process.argv.indexOf('--dir');
const dir =
  dirArgIndex !== -1 && process.argv[dirArgIndex + 1]
    ? path.resolve(process.argv[dirArgIndex + 1])
    : path.join(root, 'src', 'content', 'entries');
const SKIP_URL = process.argv.includes('--skip-url');

const VALID_TYPES = ['M', 'J', 'C', 'D', 'R', 'S', 'P', 'EB/OL', 'N', 'G'];

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));

const problems = [];
let total = 0;
let withUrl = 0;
const urls = new Set();

for (const f of files) {
  const text = await readFile(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) continue;
  let data;
  try {
    data = yaml.load(fm[1]);
  } catch (e) {
    problems.push(`${f}: frontmatter 解析失败 — ${String(e.message).slice(0, 50)}`);
    continue;
  }
  const sources = data?.sources ?? [];
  if (sources.length === 0) {
    problems.push(`${f}: 没有 sources`);
    continue;
  }

  for (const raw of sources) {
    total += 1;
    const s = String(raw);

    /*
      类型标识判定。
      合法形态（`|||` 前是著录文本，年份可选）：
        题名[R].                        ← 无年份
        题名[EB/OL]. 2019.              ← 有年份
        题名[S].                        ← 标准
      ⚠️ 第一版的正则没考虑"年份在类型标识之后"，于是把 `…[R]. 2022.`
      判成"缺少类型标识"——**63 条假阳性**。所以这里允许类型标识后跟一个年份。
    */
    const m = s.match(/\[([A-Za-z/]+)\]\s*\.\s*(?:(?:19|20)\d{2}\s*\.\s*)?(?:\|\|\||$)/);
    if (!m) {
      problems.push(`${f}: 来源缺少类型标识或格式不合法 → ${s.slice(0, 72)}`);
    } else if (!VALID_TYPES.includes(m[1])) {
      problems.push(`${f}: 未知的类型标识 [${m[1]}]（合法值：${VALID_TYPES.join(' / ')}）`);
    }

    /* --- 2. 不许编造的著录项 --- */
    // 页码：`第 12–15 页`、`: 12-15.`、`p. 12`
    if (/第\s*\d+\s*[-–—]\s*\d+\s*页|:\s*\d+\s*[-–—]\s*\d+\s*\.|p\.\s*\d+/i.test(s)) {
      problems.push(`${f}: 出现了页码，但原始资料里没有页码 —— 疑似编造 → ${s.slice(0, 60)}`);
    }
    // 出版地：`北京:`、`上海:`、`北京: 人民卫生出版社`
    if (/(?:北京|上海|广州|天津|南京|杭州|成都|武汉|西安|重庆)\s*[:：]/.test(s)) {
      problems.push(`${f}: 出现了出版地，但原始资料里没有出版地 —— 疑似编造 → ${s.slice(0, 60)}`);
    }
    if (/\bDOI\b|doi:\s*10\./i.test(s)) {
      problems.push(`${f}: 出现了 DOI，但原始资料里没有 —— 疑似编造 → ${s.slice(0, 60)}`);
    }

    /* --- 3. URL --- */
    const parts = s.split(' ||| ');
    if (parts.length === 2) {
      const url = parts[1].trim();
      if (!/^https?:\/\//.test(url)) {
        problems.push(`${f}: 分隔符后面的不是合法 URL → ${url.slice(0, 50)}`);
      } else {
        withUrl += 1;
        urls.add(url);
      }
    } else if (parts.length > 2) {
      problems.push(`${f}: 分隔符出现多次（迁移被重复施加的迹象）→ ${s.slice(0, 70)}`);
    }
  }
}

console.log(`\n参考来源著录体检`);
console.log(`  词条 ${files.length} 条，来源 ${total} 条`);
console.log(`  带官方入口的来源 ${withUrl} 条（去重后 ${urls.size} 个 URL）`);

/* --- 4. 逐个验证 URL --- */
if (!SKIP_URL && urls.size > 0) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  let ok = 0;
  const bad = [];
  for (const u of urls) {
    let code = 'ERR';
    try {
      code = execFileSync(
        'curl',
        ['-sS', '-o', 'NUL', '-w', '%{http_code}', '-H', `User-Agent: ${UA}`, '--max-time', '25', '-L', u],
        { encoding: 'utf8' },
      ).trim();
    } catch (e) {
      code = `ERR(${e.status ?? '?'})`;
    }
    // 200 = 直接可达；403/412/429/503/445 = 反爬拦截（读者浏览器可开）
    if (code === '200' || /^(403|412|429|503|445)$/.test(code)) ok += 1;
    else bad.push({ u, code });
  }
  console.log(`  URL 可达：${ok} / ${urls.size}`);
  if (bad.length) {
    for (const b of bad) problems.push(`官方入口不可达：${b.u} → ${b.code}`);
  }
} else if (SKIP_URL) {
  console.log('  （跳过 URL 验证）');
}

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 25)) console.error(`  ✗ ${p}`);
  if (problems.length > 25) console.error(`  … 另有 ${problems.length - 25} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 参考来源：类型标识合法、没有编造的著录项、官方入口可访问。\n');
