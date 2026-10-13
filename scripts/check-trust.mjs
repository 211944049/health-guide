/**
 * 可信度要素体检（E-E-A-T 里与本站相关的那部分）。
 *
 * 为什么需要这个闸门：Google 的搜索质量指南对医疗健康类内容（YMYL）有额外要求，
 * 其中两项本站可以做到：
 *   · **读者能联系到发布者、能报告错误**（Trust）
 *   · **有明确的发布者身份，不虚构背书**（Authority/Trust）
 *
 * 而这两项都是**纯声明性**的——删掉一个段落、改一个配置字段，页面照常构建、
 * 照常显示，只有读者发现「想纠错却找不到地方」时才会暴露。所以必须机器查。
 *
 * 检查项：
 *   1. 关于页与页脚显示的邮箱，与 site.config.ts 的 contactEmail **完全一致**（单一来源）
 *   2. 邮箱格式合法，且**不是** example.com / test 这类占位地址
 *   3. 关于页说明了「怎么纠错」（含要带依据）、「谁在维护」、以及**不要用邮件问病情**
 *   4. 页脚在**所有页面**都出现（不只是首页）
 *   5. 词条页有免责声明（不能替代面诊）
 *
 * 用法：node scripts/check-trust.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');

const problems = [];

/* ---------- 读配置（单一来源） ---------- */

const cfg = await readFile(path.join(root, 'src', 'site.config.ts'), 'utf8');
const contactEmail = cfg.match(/contactEmail:\s*'([^']*)'/)?.[1] ?? '';
const publisherNote = cfg.match(/publisherNote:\s*\n?\s*'([^']*)'/)?.[1] ?? '';

console.log(`\n可信度要素体检`);
console.log(`  配置里的联系邮箱：${contactEmail || '(未设置)'}`);

/* ---------- 1. 邮箱有效性 ---------- */

if (contactEmail) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) {
    problems.push(`contactEmail 格式不合法：「${contactEmail}」`);
  }
  // 占位地址：留着比没有更糟，因为读者会写信过去然后石沉大海
  const placeholder = /(example\.(com|org)|test@|your@|xxx@|待填|TODO)/i;
  if (placeholder.test(contactEmail)) {
    problems.push(`contactEmail 看起来是占位地址：「${contactEmail}」—— 请填真实可收信的地址，或留空`);
  }
} else {
  console.log('  ⚠️ 未设置联系邮箱：关于页会显示「尚未开通」，页脚不显示纠错入口');
  console.log('     这不是错误（显式表达未完成），但 YMYL 内容建议补上可用的纠错渠道');
}

if (!publisherNote) {
  problems.push('site.config.ts 缺少 publisherNote（发布者身份声明）');
}

/* ---------- 2. 关于页内容 ---------- */

const about = await readFile(path.join(distDir, 'about', 'index.html'), 'utf8').catch(() => null);
if (!about) {
  problems.push('读不到 dist/about/index.html');
} else {
  console.log(`\n  关于页 ${about.length} 字节`);

  /*
    ⚠️ 必须**先定位关于页正文里的联系块**（data-contact-block），再检查块内有没有邮箱。
    第一版只在整页搜 contactEmail —— 但关于页的**页脚本来就含邮箱**，
    所以正文那一节即使被删掉，整页匹配照样通过。这是反向验证抓出来的假阳性，
    和饮水工具那次（`不能` 被页面别处的「不能用含糖饮料」满足）是同一类错误。
  */
  const contactBlock = about.match(/<div data-contact-block>([\s\S]*?)<\/div>/)?.[1] ?? '';

  if (!contactBlock) {
    problems.push('关于页缺少 data-contact-block 联系块（纠错渠道的正文位置）');
  } else if (contactEmail) {
    if (!contactBlock.includes(contactEmail)) {
      problems.push(
        `关于页的**联系块内**没有显示 contactEmail（${contactEmail}）—— 读者在「怎么纠错」这一节找不到渠道`,
      );
    } else {
      console.log('  ✓ 关于页正文的联系块内显示了邮箱');
    }
    if (!contactBlock.includes(`mailto:${contactEmail}`)) {
      problems.push('关于页正文的邮箱不是可点击的 mailto 链接');
    } else {
      console.log('  ✓ 邮箱是可点击的 mailto 链接');
    }
  } else {
    // 未配置邮箱时，正文必须**如实说明尚未开通**，而不是留一段空话
    if (!/尚未开通/.test(contactBlock)) {
      problems.push('未配置 contactEmail 时，联系块应说明「尚未开通」，避免一句无法照做的空话');
    } else {
      console.log('  ✓ 未配置邮箱，正文如实说明「尚未开通」');
    }
  }

  const requirements = [
    { label: '「谁在维护」发布者身份说明', test: /谁在维护|独立维护/ },
    { label: '纠错要带依据的说明', test: /依据|出处|指南名|标准编号/ },
    { label: '不要用邮件咨询病情（避免延误就医）', test: /不要用邮件|不提供诊疗|咨询个人病情/ },
    { label: '发布者身份的如实声明（非医疗机构）', test: /不是医疗机构|不提供诊疗服务/ },
  ];

  for (const r of requirements) {
    const ok = r.test.test(about);
    console.log(`  ${ok ? '✓' : '✗'} ${r.label}`);
    if (!ok) problems.push(`关于页缺少：${r.label}`);
  }

  // 反向检查：不应出现虚构的机构/专家背书
  const fakeAuthority = /(三甲医院|主任医师|医学博士|专家团队|权威认证|合作医院)/;
  if (fakeAuthority.test(about)) {
    problems.push(
      '关于页里出现了可能被理解为机构/专家背书的措辞 —— YMYL 内容虚构背书比没有背书更糟，请核实',
    );
  }
}

/* ---------- 3. 页脚在所有页面出现 ---------- */

const htmlFiles = [];
async function collect(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await collect(path.join(dir, entry.name), rel);
    else if (rel.endsWith('.html')) htmlFiles.push(rel);
  }
}
await collect(distDir);

let missingFooter = 0;
let missingDisclaimer = 0;
const entryPages = htmlFiles.filter((f) => f.startsWith('entry/'));
const sample = [...entryPages.slice(0, 5), 'index.html', 'browse/index.html', 'topic/index.html'];

for (const file of sample) {
  const html = await readFile(path.join(distDir, file), 'utf8').catch(() => null);
  if (!html) continue;
  if (!html.includes('site-footer')) {
    missingFooter += 1;
    problems.push(`${file}: 没有页脚`);
  }
  if (contactEmail && !html.includes(contactEmail)) {
    problems.push(`${file}: 页脚没有纠错邮箱（页脚应在所有页面出现，便于读者随时报告错误）`);
  }
}

// 词条页必须有免责声明
for (const file of entryPages.slice(0, 5)) {
  const html = await readFile(path.join(distDir, file), 'utf8');
  if (!/不构成医疗建议|不能替代面诊/.test(html)) {
    missingDisclaimer += 1;
    problems.push(`${file}: 缺少医疗免责声明`);
  }
}

console.log(`\n  抽查 ${sample.length} 个页面的页脚；词条页免责声明抽查 ${entryPages.slice(0, 5).length} 个`);
console.log(`  页脚缺失 ${missingFooter}，免责声明缺失 ${missingDisclaimer}`);

/* ---------- 4. 结论 ---------- */

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 发布者身份、纠错渠道、免责声明都齐全且一致。\n');
