/**
 * 生成「分发素材」：把词条改写成可直接粘贴到小红书/公众号的分享卡片。
 *
 * ⚠️ 核心原则：**所有内容都从词条程序化提取，不在这里手写文案**。
 * 原因有两个：
 *   1. 手写会和源词条脱节——改了词条，素材不会跟着变；
 *   2. 健康内容的每句话都该能在词条里找到出处，生成器保证这一点。
 * 如果某条文案要人工润色，应该改词条本身（这样站点和分发素材同时更新）。
 *
 * 输出：handoff/分发素材-小红书公众号.md
 *
 * 用法：node scripts/make-share-cards.mjs
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');
const outFile = path.join(root, '..', 'handoff', '分发素材-小红书公众号.md');

const SITE = 'https://costlifehealth.com';

/** 解析 frontmatter（只取本站用到的简单结构，但每个键单独界定范围，避免串行）。 */
function parse(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const body = text.slice(text.indexOf('\n---\n', 4) + 5);

  /** 取某个键的标量值。 */
  const scalar = (key) => {
    const m = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^'(.*)'$/s, '$1') : '';
  };

  /** 取某个键下的列表项（只到下一个顶层键为止）。 */
  const list = (key) => {
    const lines = fm.split(/\r?\n/);
    const start = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
    if (start === -1) return [];
    const items = [];
    for (const line of lines.slice(start + 1)) {
      if (/^\s+-\s+/.test(line)) {
        items.push(line.replace(/^\s+-\s+/, '').trim());
        continue;
      }
      if (/^\S/.test(line)) break; // 遇到下一个顶层键就停
    }
    return items;
  };

  /** 取某个二级标题下的正文。 */
  const section = (heading) => {
    const m = body.match(new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`));
    return m ? m[1].trim() : '';
  };

  return {
    title: scalar('title'),
    category: scalar('category'),
    evidence: scalar('evidence'),
    cost: scalar('cost'),
    time: scalar('time'),
    summary: scalar('summary'),
    audience: list('audience'),
    tags: list('tags'),
    related: list('related'),
    sources: list('sources'),
    howto: section('具体做法'),
    risks: section('风险与禁忌'),
    myths: section('常见误区'),
  };
}

/**
 * 把作者写在词条里的行内标记，转成**纯文本**，供分享文案使用。
 *
 * ⚠️ 为什么需要它（2026-10-13 发现的 bug）
 *
 * 词条正文里有两种加粗写法，而且**是历史遗留的混用**：
 *   · 早期写的用 markdown `**x**`
 *   · 2026-10-12 之后统一转成了 HTML `<strong>x</strong>`
 *     （原因：CommonMark 的强调规则在中文标点旁会失效，星号会原样显示）
 *
 * 而本脚本原来的 `clean()` **只剥 `**`，没剥 `<strong>`** ——
 * 于是生成的分享卡片里出现了**字面的标签**：
 *
 *     2. <strong>判断标准很简单</strong>：<strong>只要有明显的红肿…
 *
 * 用户直接复制这段发到小红书/公众号，就会带着标签发出去。
 *
 * **教训：这是"改了数据格式但忘了同步所有消费方"的典型。**
 * 转换脚本改了 136 个文件的正文格式，而消费方（分享卡片生成器）
 * 只认识旧格式。构建和闸门都发现不了——因为分享卡片不参与构建校验。
 *
 * 现在两种写法都剥，新写的内容用哪种都不会再出问题。
 */
function toPlainText(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')          // HTML 标签（<strong> 等）
    .replace(/\*\*/g, '')             // markdown 加粗
    .replace(/`/g, '')                // 行内代码
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // markdown 链接 → 只留文字
    .trim();
}

/**
 * 把 source 字符串转成**读者可读**的来源说明。
 *
 * 词条里的 sources 是给网站渲染用的，形如：
 *   世界卫生组织. 免疫接种实况报道[EB/OL]. ||| https://www.who.int/health-topics
 * 其中 ` [访问入口] URL ||| URL` 是数据格式，**不该出现在分享文案里**
 * （用户会整段复制，裸 URL 和分隔符很扎眼）。
 */
function cleanSource(s) {
  return String(s)
    .replace(/\s*\|\|\|\s*\S+/g, '')     // 去掉 ||| 之后的部分
    .replace(/\s*\[访问入口\]\s*/g, ' ') // 去掉入口标记
    .replace(/https?:\/\/\S+/g, '')      // 去掉裸 URL
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 从「具体做法 / 风险与禁忌 / 常见误区」里抽出要点。
 *
 * 词条的写法不统一，实测至少三种：
 *   1. 有序/无序列表（「- 高血压、心衰…」）
 *   2. `### 小标题` + 说明段（说明段的第一句才是要点，如「目标不是"做运动"，只是打断连续坐姿」）
 *   3. `### 小标题` + 表格（第一版只取表格行首格，结果「接水、上厕所」这种短标签被长度过滤掉，
 *      整条词条抽不出任何要点——久坐那条的正文骨架因此是空的）
 * 所以这里三种都处理，按块（### 或列表）逐个抽。
 */
function extractPoints(markdown, limit) {
  const points = [];

  const clean = toPlainText;

  const useful = (s) => s.length >= 8 && !/^[^：]{1,6}：/.test(s);

  /** 从一段文本里取第一个像样的句子（跳过表格、标题、空行）。 */
  const firstSentenceOf = (text) => {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('|') || line.startsWith('#') || line.startsWith('---')) continue;
      const s = clean(line).split(/(?<=[。！？])/)[0];
      if (useful(s)) return s;
    }
    return '';
  };

  /** 从一段文本里取表格行：首格（动作）+ 末格（注意/作用）。 */
  const tableRowsOf = (text) => {
    const rows = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map((c) => clean(c)).filter(Boolean);
      if (cells.length < 2) continue;
      if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue; // 分隔行
      if (cells[0] === '动作' || cells[0] === '人群') continue; // 表头
      // 优先用「动作 + 最后一格」，最后一格通常是最有用的提醒
      const last = cells[cells.length - 1];
      rows.push(last && last !== cells[0] ? `${cells[0]}（${last}）` : cells[0]);
    }
    return rows;
  };

  // 按 ### 切块；没有 ### 的整段也算一块
  const blocks = markdown.split(/\r?\n(?=### )/);

  for (const block of blocks) {
    if (points.length >= limit) break;

    // 1) 列表项
    const listItems = [];
    for (const line of block.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:\d+\.|[-*])\s+(.+)$/);
      if (!m) continue;
      const s = clean(m[1]);
      if (useful(s)) listItems.push(s);
    }
    if (listItems.length) {
      for (const s of listItems) {
        if (points.length >= limit) break;
        points.push(s);
      }
      continue;
    }

    // 2) 表格行
    const rows = tableRowsOf(block);
    if (rows.length) {
      for (const s of rows) {
        if (points.length >= limit) break;
        points.push(s);
      }
      continue;
    }

    // 3) 说明段的第一句
    const sentence = firstSentenceOf(block.replace(/^### .*$/m, ''));
    if (sentence) points.push(sentence);
  }

  return points.slice(0, limit);
}

/** 抽出词条里「第 1 段小结论」那种简短句子（用于封面文案）。 */
function firstSentence(markdown) {
  const plain = markdown
    .replace(/^###? .*$/gm, '')
    .split(/\n\s*\n/)
    .map((s) => toPlainText(s))
    .find((s) => s.length > 20 && !s.startsWith('|') && !s.startsWith('-'));
  if (!plain) return '';
  const sentence = plain.split(/(?<=[。！？])/)[0] ?? plain;
  return sentence.trim();
}

const files = (await readdir(entriesDir)).filter((f) => f.endsWith('.md')).sort();
const cards = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const raw = await readFile(path.join(entriesDir, file), 'utf8');
  const d = parse(raw);
  if (!d.title) continue;
  cards.push({ slug, ...d });
}

/* ---------- 组装成 Markdown ---------- */

const lines = [];
lines.push('# 分发素材（小红书 / 公众号）');
lines.push('');
lines.push('> **这份文件是自动生成的**，运行 `run.cmd share:cards` 重新生成。');
lines.push('>');
lines.push('> 所有文案都从词条正文里提取，不另写一遍——这样改了词条，素材会跟着更新；');
lines.push('> 也保证每句话都能在词条里找到出处。**要改文案就改词条本身。**');
lines.push('>');
lines.push('> 每个卡片包含：**标题备选（3 条）**、**正文骨架**、**话题标签**、**原文链接**。');
lines.push('> 正文骨架是「要点 + 一句结论」，发布时按平台习惯润色语气、加 emoji 和换行即可，');
lines.push('> 但**不要改动结论和数字**——那些是有出处的。');
lines.push('');
lines.push(`共 ${cards.length} 条词条。`);
lines.push('');

// 目录
lines.push('## 目录');
lines.push('');
for (const c of cards) {
  lines.push(`- [${c.title}](#${c.slug}) — ${c.category} · 证据 ${c.evidence}`);
}
lines.push('');
lines.push('---');
lines.push('');

for (const c of cards) {
  const url = `${SITE}/entry/${c.slug}/`;
  const points = extractPoints(c.howto, 4);
  const riskPoints = extractPoints(c.risks, 2);
  const audience = c.audience.filter((a) => a.length <= 12).slice(0, 4);
  const tags = c.tags.slice(0, 5);

  lines.push(`<a id="${c.slug}"></a>`);
  lines.push('');
  lines.push(`## ${c.title}`);
  lines.push('');
  lines.push(`**分类** ${c.category} · **证据等级** ${c.evidence} · **成本** ${c.cost} · **耗时** ${c.time}`);
  lines.push('');

  // 标题备选：都基于原文，不自己加"很多人做反了"这类无依据的钩子。
  // （第一版这么干过，结果生成出「优先——很多人做反了」这种病句：
  //  表格行「优先：蒸、煮、炖…」被当成列表项截断了。教训：钩子必须来自原文。）
  lines.push('### 标题备选');
  lines.push('');
  lines.push(`1. ${c.title}`); // 词条标题本身已是问句或动作，直接可用
  const hook = firstSentence(c.howto); // 第一条做法里的完整句子
  if (hook && hook !== c.title) {
    lines.push(`2. ${hook.replace(/[。！？]$/, '')}`);
  }
  lines.push(
    `3. ${c.title}｜${
      c.evidence === 'A'
        ? '证据最扎实的一类'
        : c.evidence === 'D'
          ? '学界还有争议，先说清分歧在哪'
          : '把依据和例外都讲清楚'
    }`,
  );
  lines.push('');

  // 开头 / 摘要也要剥标记：summary 里同样可能有 <strong>
  lines.push('### 开头（可直接用）');
  lines.push('');
  lines.push(`> ${toPlainText(c.summary)}`);
  lines.push('');

  // 正文骨架
  lines.push('### 正文骨架');
  lines.push('');
  if (points.length) {
    points.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  } else {
    lines.push(`（这条词条的「具体做法」没有条目式内容，建议直接引用一句话结论展开）`);
  }
  lines.push('');

  if (riskPoints.length) {
    lines.push('### 必须带上的提醒');
    lines.push('');
    riskPoints.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
  }

  if (audience.length) {
    lines.push(`**适合谁**：${audience.join('、')}`);
    lines.push('');
  }

  if (tags.length) {
    lines.push(`**话题标签**：${tags.map((t) => `#${t}`).join(' ')} #健康科普 #循证`);
    lines.push('');
  }

  lines.push(`**原文**：${url}`);
  lines.push('');
  lines.push('**来源**（如需在文末标注）：');
  // 去掉数据格式（||| 分隔符、[访问入口]、裸 URL），只留读者可读的著录
  c.sources.slice(0, 3).map(cleanSource).filter(Boolean).forEach((s) => lines.push(`- ${s}`));
  lines.push('');
  lines.push('---');
  lines.push('');
}

await writeFile(outFile, lines.join('\n'), 'utf8');
const kb = (Buffer.byteLength(lines.join('\n')) / 1024).toFixed(1);
console.log(`[OK] 已生成 ${cards.length} 张分享卡片 -> ${path.relative(root, outFile)}`);
console.log(`     ${kb} KB`);

/* ---------- 自检 ----------
   空卡片会静默通过——第一版因为只认列表项，久坐那条的正文骨架是空的，
   而生成器照样报"成功"。所以这里主动检查。
*/
const emptyPoints = cards.filter((c) => extractPoints(c.howto, 1).length === 0);
const emptySummary = cards.filter((c) => !c.summary);
const noAudience = cards.filter((c) => c.audience.filter((a) => a.length <= 12).length === 0);

console.log(`     正文要点为空：${emptyPoints.length} 条${emptyPoints.length ? `（${emptyPoints.map((c) => c.slug).join(', ')}）` : ''}`);
console.log(`     缺少一句话结论：${emptySummary.length} 条`);
console.log(`     没有可用受众：${noAudience.length} 条`);

if (emptyPoints.length || emptySummary.length) {
  console.error('\n[X] 有卡片内容缺失——检查解析逻辑，或在语料上确认这些词条的结构。');
  process.exit(1);
}
