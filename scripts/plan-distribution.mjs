/**
 * 分发优先级：从 136 条里挑出**最适合首发**的，并给出理由。
 *
 * ## 为什么不能按"证据等级"简单排序
 *
 * 首发要的是**被点开、被转发**，所以真正相关的维度是：
 *
 *   1. **有明确定论** —— A/B 级、且摘要是"给答案"而不是"看情况"
 *      （首页已有类似的「证据最强」区块，所以这里要按**分发**的目标重排）
 *   2. **生活场景** —— 衣食住行这类"每天都会遇到"的话题比疾病话题更容易被转发
 *   3. **低医疗风险** —— 涉及重症、精神科用药、性健康、儿童的话题容易被平台限流，
 *      发布也更容易引起误用，不适合**首发**（不是不写，而是不排在前面）
 *   4. **明确的"反常识"钩子** —— 存在常见误区、且本站能给出纠正的，点击率更高
 *
 * 脚本按这四个维度打分并排序，**理由逐条打印**，便于人工复核。
 *
 * 用法：node scripts/plan-distribution.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

/** 高风险话题：不是不发布，而是**不适合首发**（平台限流 + 误用风险）。 */
const RISKY = [
  /避孕|经期|月经|性|HPV/,
  /癌|肿瘤/,
  /抑郁|焦虑|精神|心理专业人士/,
  /婴儿|婴幼儿|儿童|孩子|青少年/,
  /药|处方|抗生|激素|维 A 酸/,
  /糖尿病|血压|血糖|心脏|脑|卒中|癫痫/,
  /减肥|减重|肥胖/,
  /戒烟|酒精|成瘾/,
];

/** 生活场景：越"每天都会遇到"越适合首发。 */
const DAILY_SCENE = /洗脸|刷牙|洗头|洗澡|洗手|防晒|喝水|喝水|咖啡|睡|枕|床|被|内衣|袜|鞋|衣服|面|菜|饭|水果|奶茶|外卖|食堂|零食|早餐|水杯|餐具|纸巾|毛巾|空调|加湿器|湿度|霉菌|清洁|收纳|家具|灯|噪音/;

/** 反常识钩子：摘要里出现这些信号词，说明"存在普遍误解且我们给了纠正"。 */
const HOOK = /不是|并不|误区|其实|反而|而不是|无需|不必|没有证据|不等于/;

const rows = [];
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.md'))) {
  const t = await readFile(path.join(dir, f), 'utf8');
  const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let d;
  try { d = yaml.load(m[1]); } catch { continue; }
  const body = t.slice(m[0].length);
  const slug = f.replace(/\.md$/, '');
  const summary = String(d.summary ?? '');
  const title = String(d.title ?? '');

  // 1. 证据等级分
  const evScore = { A: 3, B: 2, C: 1, D: 0 }[d.evidence] ?? 0;

  // 2. 生活场景分
  const sceneHit = DAILY_SCENE.test(title);
  const sceneScore = sceneHit ? 2 : 0;

  // 3. 风险分（命中高风险 → 扣分，不首发）
  const riskHits = RISKY.filter((re) => re.test(title) || re.test(summary));
  const riskScore = -riskHits.length * 2;

  // 4. 钩子分
  const hookScore = HOOK.test(summary) ? 1 : 0;

  // 5. 摘要是否"给答案"（含数字/具体动作）而不是"看情况"
  const concrete = /\d/.test(summary) && /要|需|应|用|选|做|时间|分钟|小时|℃/.test(summary);
  const concreteScore = concrete ? 1 : 0;

  // 6. 误区小节是否有内容（有误区 = 有可传播的反常识点）
  const hasMyths = /## 常见误区\n[\s\S]*?(?=\n## |$)/.test(body) &&
    (body.match(/## 常见误区\n([\s\S]*?)(?=\n## |$)/)?.[1].match(/^\s*[-*]/gm) ?? []).length >= 3;
  const mythScore = hasMyths ? 1 : 0;

  const score = evScore * 2 + sceneScore + riskScore + hookScore + concreteScore + mythScore;

  rows.push({
    slug, title, cat: d.category, evidence: d.evidence,
    score, evScore, sceneScore, riskScore, hookScore, concreteScore, mythScore,
    riskHits: riskHits.length,
    audience: (d.audience ?? []).length,
  });
}

rows.sort((a, b) => b.score - a.score || (b.evScore - a.evScore) || a.title.localeCompare(b.title, 'zh'));

console.log('\n=== 分发优先级（前 30）===\n');
console.log('  分  证据  场景  风险  钩子  具体  误区   标题');
for (const r of rows.slice(0, 30)) {
  const bar = String(r.score).padStart(3);
  console.log(
    `  ${bar}   ${r.evidence}    ${r.sceneScore ? '✓' : ' '}     ${r.riskScore ? String(r.riskScore).padStart(2) : ' 0'}    ${r.hookScore ? '✓' : ' '}     ${r.concreteScore ? '✓' : ' '}     ${r.mythScore ? '✓' : ' '}    ${r.title}`,
  );
}

console.log('\n=== 首发建议：前 12 条 ===\n');
rows.slice(0, 12).forEach((r, i) => {
  const why = [];
  if (r.evScore === 3) why.push('证据 A 级，结论稳定');
  else if (r.evScore === 2) why.push('证据 B 级，有指南支持');
  if (r.sceneScore) why.push('日常场景，受众广');
  if (r.hookScore) why.push('摘要含纠错钩子（"不是/并不/误区"）');
  if (r.mythScore) why.push('有独立的「常见误区」小节，可直接做反常识标题');
  if (r.concreteScore) why.push('结论含具体数字或动作，好落地');
  console.log(`${String(i + 1).padStart(2)}. ${r.title}   [${r.cat} · 证据 ${r.evidence}]`);
  console.log(`     /entry/${r.slug}/`);
  console.log(`     理由：${why.join('；') || '综合分较高'}`);
  console.log('');
});

console.log('=== 暂不首发（高风险话题，仍值得写但不排在前面）===\n');
for (const r of rows.filter((x) => x.riskHits > 0).slice(0, 12)) {
  console.log(`  ${r.title}   [证据 ${r.evidence}]  /entry/${r.slug}/`);
}

console.log(`\n共 ${rows.length} 条参与评分；其中 ${rows.filter((x) => x.riskHits === 0).length} 条无高风险标记。\n`);

/* ---------- 写入手递文件 ---------- */

const out = path.join(root, '..', 'handoff', '分发优先级-首发清单.md');
const L = [];
L.push('# 分发优先级：首发清单');
L.push('');
L.push('> 本文件由 `node scripts/plan-distribution.mjs` 生成，改动请改脚本或改词条本身。');
L.push('');
L.push('## 为什么不能按「证据等级」简单排序');
L.push('');
L.push('首发要的是**被点开、被转发**，所以排序用的是四个维度而不是单一的证据等级：');
L.push('');
L.push('| 维度 | 权重 | 理由 |');
L.push('| --- | --- | --- |');
L.push('| **证据等级** | 高 | A/B 级说明有指南支持，被质疑时站得住 |');
L.push('| **生活场景** | 中 | 衣食住行这类"每天都会遇到"的比疾病话题更容易被转发 |');
L.push('| **医疗风险（扣分）** | 负 | 涉及重症、精神科用药、性健康、儿童的话题容易被平台限流，也更易被误用 —— **不是不写，而是不排在前面** |');
L.push('| **纠错钩子** | 中 | 存在常见误区、且本站能纠正的，点击率更高 |');
L.push('| **结论具体** | 中 | 摘要里带数字或明确动作的，更好落地 |');
L.push('| **有误区小节** | 中 | 可直接抽成反常识标题 |');
L.push('');
L.push('## 首发建议（前 12 条）');
L.push('');
rows.slice(0, 12).forEach((r, i) => {
  const why = [];
  if (r.evScore === 3) why.push('证据 A 级，结论稳定');
  else if (r.evScore === 2) why.push('证据 B 级，有指南支持');
  if (r.sceneScore) why.push('日常场景，受众广');
  if (r.hookScore) why.push('摘要含纠错钩子');
  if (r.mythScore) why.push('有独立的「常见误区」小节');
  if (r.concreteScore) why.push('结论含具体数字或动作');
  L.push(`### ${i + 1}. ${r.title}`);
  L.push('');
  L.push(`- 分类：${r.cat} · 证据 **${r.evidence}**`);
  L.push(`- 页面：https://costlifehealth.com/entry/${r.slug}/`);
  L.push(`- 卡片：\`handoff/分发素材-小红书公众号.md\` 里搜「${r.title}」`);
  L.push(`- 首发理由：${why.join('；') || '综合分较高'}`);
  L.push('');
});
L.push('## 完整排序（前 40）');
L.push('');
L.push('| 分 | 证据 | 标题 | 链接 |');
L.push('| --- | --- | --- | --- |');
for (const r of rows.slice(0, 40)) {
  L.push(`| ${r.score} | ${r.evidence} | ${r.title} | \`/entry/${r.slug}/\` |`);
}
L.push('');
L.push('## 暂不首发（高风险话题）');
L.push('');
L.push('这些**同样值得写**，但不适合作为首发内容（平台限流 + 误用风险更高）：');
L.push('');
for (const r of rows.filter((x) => x.riskHits > 0).slice(0, 20)) {
  L.push(`- ${r.title}（证据 ${r.evidence}）\`/entry/${r.slug}/\``);
}
L.push('');
L.push('## 各平台发布时的注意点');
L.push('');
L.push('| 平台 | 能否放外链 | 实际做法 |');
L.push('| --- | --- | --- |');
L.push('| **GitHub** | 可以 | 仓库 README 里放站点链接；这是最有效的一条 |');
L.push('| **知乎** | 可以（会被审核） | 回答问题 + 文末放具体词条链接 |');
L.push('| **公众号** | 未认证号正文**不能**放外链 | 只能放「阅读原文」或菜单；主要作用是让人看到内容 |');
L.push('| **小红书** | 笔记内**不能**放可点击外链 | 靠主页简介引导；主要作用是曝光 |');
L.push('| **豆瓣 / 简书** | 可以 | 相对宽松，适合长文 |');
L.push('');
L.push('> ⚠️ **不要买链接、不要互换链接、不要群发目录站。**');
L.push('> Google 会识别这类模式，可能导致降权。对一个 136 条的诚实内容站来说，不值得冒这个风险。');
L.push('');
L.push('## 发布时不要做的事（内容侧）');
L.push('');
L.push('- **不要改动结论和数字**（温度、时长、剂量、频次）—— 那些是有出处的');
L.push('- **不要删掉「何时求助专业人士」** 那一节');
L.push('- **不要加"医生说""专家建议"** 这类无具体出处的表述');
L.push('- 卡片里的文案都从词条提取，**要改文案就改词条本身**，然后重新生成卡片');

await writeFile(out, L.join('\n') + '\n', 'utf8');
console.log(`清单已写入: ${path.relative(root, out)}\n`);
