/**
 * 部署后待办清单生成器。
 *
 * 为什么需要：现在「还需要你做的事」散落在 HANDOFF、两份清单文档、和对话里。
 * 这个脚本把它们收成一份**按顺序、可勾选**的清单，并且标出哪些是**卡住我的**
 * （没做完我就只能盲猜），哪些是「做了更好」。
 *
 * 用法：node scripts/next-steps.mjs
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const ORIGIN = 'https://costlifehealth.com';

/**
 * 用 curl 查 URL（本机 Node 的 fetch 在这条链路上会失败）。
 *
 * ⚠️ 必须区分三种情况（这个项目已经在这上面误报过两次）：
 *   · 200        正常
 *   · 4xx/5xx    真的有问题
 *   · 000        连不上——**这是本机链路的抖动，不代表站点有问题**
 * 所以这里重试多次，并在结论里把 000 单独标注为「未确认」而不是「失败」。
 */
async function head(url, attempts = 3) {
  let last = '000';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-sS', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '60', '--retry', '2', '--retry-all-errors', '-L', url],
        { encoding: 'utf8' },
      );
      last = stdout.trim();
      if (last === '200') return { code: last, kind: 'ok' };
    } catch {
      last = '000';
    }
  }
  return { code: last, kind: last === '000' ? 'unknown' : 'bad' };
}

/* ---------- 本地状态 ---------- */

const keyFileLocal = (await import('node:fs/promises')).then ?? null;
let key = '';
try {
  const { readFile: rf } = await import('node:fs/promises');
  key = (await rf(path.join(root, 'scripts', '.indexnow-key'), 'utf8')).trim();
} catch {
  key = '';
}

const sitemap = await readFile(path.join(distDir, 'sitemap-0.xml'), 'utf8').catch(() => '');
const urlCount = (sitemap.match(/<loc>/g) ?? []).length;
const topicCount = (sitemap.match(/\/topic\/[a-z-]+\//g) ?? []).length;
const entryCount = (sitemap.match(/\/entry\/[a-z0-9-]+\//g) ?? []).length;

console.log('\n部署后待办清单\n');
console.log('='.repeat(64));
console.log('本地构建产物');
console.log('='.repeat(64));
console.log(`  sitemap URL 数：${urlCount}（其中词条 ${entryCount}、专题 ${topicCount}）`);
console.log(`  IndexNow 密钥：${key || '(缺失)'}`);

/* ---------- 在线状态 ---------- */

console.log('\n' + '='.repeat(64));
console.log('线上状态（这一步会发几个 HTTP 请求）');
console.log('='.repeat(64));

const checks = [
  { label: '首页', url: `${ORIGIN}/` },
  { label: 'sitemap', url: `${ORIGIN}/sitemap-index.xml` },
  { label: 'robots.txt', url: `${ORIGIN}/robots.txt` },
  { label: 'RSS', url: `${ORIGIN}/rss.xml` },
  { label: '专题目录', url: `${ORIGIN}/topic/` },
  { label: 'IndexNow 密钥文件', url: key ? `${ORIGIN}/${key}.txt` : null },
];

const status = {};
for (const c of checks) {
  if (!c.url) {
    console.log(`  ${c.label.padEnd(20)} 跳过（本地无密钥）`);
    continue;
  }
  const r = await head(c.url);
  status[c.label] = r;
  const mark = r.kind === 'ok' ? 'OK' : r.kind === 'unknown' ? '??' : '!!';
  const note = r.kind === 'unknown' ? '（本机链路抖动，未确认——不代表站点有问题）' : '';
  console.log(`  [${mark}] ${c.label.padEnd(20)} HTTP ${r.code} ${note}`);
}

/* ---------- 判断：本地新内容是否已部署 ---------- */

/*
  抓首页正文。
  ⚠️ 这里也必须重试：第一版只抓一次，遇到本机链路抖动时返回空字符串，
  于是报告「首页不含专题入口」——而实际上站点早就部署好了（实测线上首页
  17678 字节、与本地逐字节相同）。**假警报比不报还糟**，因为它会让人白跑一趟。
  所以：重试，并校验返回长度合理才采信。
*/
async function fetchHtml(url, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-sS', '--max-time', '90', '--retry', '3', '--retry-all-errors', '-L', url],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      );
      // 首页至少几 KB；太短说明没抓全，不采信
      if (stdout.length > 3000) return stdout;
    } catch {
      /* 重试 */
    }
  }
  return '';
}

const homeHtml = await fetchHtml(`${ORIGIN}/`);

const liveHasTopics = homeHtml.includes('/topic/');
const liveHasSchema = /application\/ld\+json/.test(homeHtml);
const fetchOk = homeHtml.length > 0;

console.log('\n' + '='.repeat(64));
console.log('线上是否已是新版');
console.log('='.repeat(64));
if (!fetchOk) {
  console.log('  未能抓取首页（本机链路抖动），无法判断。');
  console.log('  请用浏览器确认导航里是否有「专题」。');
} else {
  console.log(`  首页含专题入口：${liveHasTopics ? '是' : '否（需要部署）'}`);
  console.log(`  首页含结构化数据：${liveHasSchema ? '是' : '否（需要部署）'}`);
}

/* ---------- 清单 ---------- */

// 抓取失败时不臆断「需要部署」，避免假警报
const needDeploy = fetchOk && (!liveHasTopics || !liveHasSchema);
const keyStatus = status['IndexNow 密钥文件'];
const keyDeployed = keyStatus?.kind === 'ok';
const keyUnknown = keyStatus?.kind === 'unknown';

console.log('\n' + '='.repeat(64));
console.log('要你做的事（按顺序）');
console.log('='.repeat(64));

let step = 1;

if (needDeploy) {
  console.log(`\n${step}. 【必须，5 分钟】部署新版`);
  console.log('   把 handoff\\dist.zip 上传到 Cloudflare。');
  console.log('   判断成功：刷新首页，导航里应出现「专题」。');
  step += 1;
}

if (!keyDeployed) {
  console.log(`\n${step}. 【必须，1 分钟】确认密钥文件可访问`);
  console.log(`   浏览器打开：${ORIGIN}/${key || '<key>'}.txt`);
  console.log(`   应看到一行：${key || '<key>'}`);
  if (keyUnknown) {
    console.log('   注：刚才没连上，是本机链路抖动。请用浏览器确认。');
  }
  console.log('   看到 404 说明密钥文件没上传成功，IndexNow 提交会被拒。');
  step += 1;
}

console.log(`\n${step}. 【必须，1 分钟】通知搜索引擎（IndexNow）`);
console.log('   命令行执行： cd health-guide  然后  run.cmd indexnow');
console.log(`   预期：成功 ${urlCount} 条，失败 0 条`);
console.log('   它覆盖 Bing / Yandex / Seznam / Naver，不需要账号。');
step += 1;

console.log(`\n${step}. 【最重要，10 分钟】认领 Google Search Console —— 这一步卡住我`);
console.log('   1) 打开 https://search.google.com/search-console');
console.log('   2) 添加资源 → 选「网址前缀」→ 输入 https://costlifehealth.com/');
console.log('      （选「网址前缀」而不是「网域」，这样可以用 HTML 标记验证，不用改 DNS）');
console.log('   3) 选验证方式「HTML 标记」，它会给你一行：');
console.log('      <meta name="google-site-verification" content="..." />');
console.log('      **把这行发给我**，我加进模板 → 重新构建 → 你上传 → 回去点「验证」。');
console.log('   4) 验证通过后：左侧 Sitemap → 提交  sitemap-index.xml');
console.log('');
console.log('   为什么这一步最重要：');
console.log('   「效果」报告会告诉我读者实际在搜什么词、哪些页面有展现。');
console.log('   现在所有内容决策都是我按常识判断的，**没有真实读者数据**。');
console.log('   拿到关键词之后，我能按真实需求调整内容——那比我再写十篇有用得多。');
step += 1;

console.log(`\n${step}. 【可选，10 分钟】认领 Bing 站长工具`);
console.log('   https://www.bing.com/webmasters —— 支持从 Google Search Console 一键导入。');
console.log('   Bing 支持 IndexNow，所以第 ' + (step - 2) + ' 步已经在通知它了。');
step += 1;

console.log('\n' + '='.repeat(64));
console.log('我能继续做的（不需要你）');
console.log('='.repeat(64));
console.log('  · 短视频口播稿（分发素材的第三形态，每条 60 秒）');
console.log('  · 第三批选题（还剩 3 个空白方向、14 个部分覆盖）');
console.log('  · 更多小工具（饮水提醒；框架已搭好，加一条配置 + 一个页面）');
console.log('  · 国内部署配置（等你决定备案；清单见 迁回国内-备案与CDN清单.md）');
console.log('');
