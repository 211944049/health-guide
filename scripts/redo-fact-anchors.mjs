/**
 * 撤销并重做 fact 锚点，正确处理三种行类型。
 *
 * ## 背景：add-fact-anchors.mjs 第一版造成了两类破坏
 * 它按「第一个句号之后」插入锚点，而很多行**行内有句号**，于是锚点落在行中间，
 * 把内容和 Markdown 结构劈开：
 *   · humidity 的 frontmatter summary 被切开（`。` 与 `高于 60%…` 分成两行）
 *   · sleep-environment 的**表格单元格**被切开，破坏了整行表格
 *   · freezing-food 里 `。<!-- fact -->** 建议放…` 把加粗标记切断
 *
 * ## 正确做法：按行类型决定锚点位置
 *   · **表格行**（以 `|` 开头）：锚点插在**最后一个 `|` 之前**，保证列数不变
 *   · **frontmatter**（在 `---` 之间，如 summary）：锚点放在**引号之后的行尾**，
 *     这样 YAML 值本身不含注释，解析不受影响
 *   · **其他行**：锚点直接接在**行尾**
 *
 * 用法：node scripts/redo-fact-anchors.mjs [--write]
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entriesDir = path.join(root, 'src', 'content', 'entries');
const WRITE = process.argv.includes('--write');

/*
  每条：把锚点放到「包含 contains 的那一整行」上。
  mustHave 是护栏：该行必须含这个数值，否则说明定位错了。
*/
const PLACEMENTS = [
  { key: 'danger-zone', file: 'food-poisoning', contains: '细菌在 4–60 ℃ 之间繁殖最快', mustHave: '4–60' },
  { key: 'reheat-temp', file: 'food-poisoning', contains: '中心温度达到 70 ℃ 以上', mustHave: '70' },
  { key: 'danger-zone', file: 'freezing-food', contains: '外层会在几十分钟内进入 4–60 ℃ 的危险温度带', mustHave: '4–60' },
  { key: 'reheat-temp', file: 'freezing-food', contains: '**复热要热透**：中心 70 ℃ 以上', mustHave: '70' },
  { key: 'fridge-temp', file: 'freezing-food', contains: '冷藏室温度应在 4 ℃ 以下', mustHave: '4' },
  { key: 'danger-zone', file: 'leftovers', contains: '危险温度带', mustHave: '4–60' },
  { key: 'reheat-temp', file: 'leftovers', contains: '复热要热透', mustHave: '70' },
  { key: 'fridge-temp', file: 'leftovers', contains: '冷藏', mustHave: '0–4' },
  { key: 'bath-water-temp', file: 'warmth', contains: '用 37–40 ℃ 温水缓慢复温并就医', mustHave: '37–40' },
  { key: 'bath-water-temp', file: 'winter-accessories', contains: '应使用温水（约 37–40 ℃）并尽快就医', mustHave: '37–40' },
  { key: 'room-temp-winter', file: 'humidity', contains: '冬天室温 18–22 ℃、夏天 24–26 ℃', mustHave: '18–22' },
  { key: 'room-temp-winter', file: 'sleep-environment', contains: '多数建议大致 18–22 ℃', mustHave: '18–22' },
  { key: 'indoor-humidity', file: 'humidity', contains: '保持在 40%–60%、最好 50% 上下', mustHave: '40%–60%' },
  { key: 'indoor-humidity', file: 'clothing-storage', contains: '室内相对湿度控制在', mustHave: '40%–60%' },
];

/*
  leftovers 原本没有「复热到 70 ℃」这个事实（只写了「彻底复热」而不给温度），
  所以没有锚点声明它。这里补上这句话——这是真实的内容缺口：讲复热却不给温度，
  读者无法执行。补完它就和 food-poisoning / freezing-food 一致了。
*/
const NEW_SENTENCE = {
  file: 'leftovers',
  after: '- **吃之前先分出来**',
  text: '- **复热要热透**：中心温度要达到 70 ℃ 以上，汤类要煮开。<!-- fact:reheat-temp -->',
};

const problems = [];
const done = [];

const targetFiles = [...new Set([...PLACEMENTS.map((p) => p.file), NEW_SENTENCE.file])];

/* ---------- 第一步：清掉所有旧锚点，并把被切开的行合回原状 ---------- */

for (const file of targetFiles) {
  const full = path.join(entriesDir, `${file}.md`);
  let text = await readFile(full, 'utf8');
  const before = text;

  // 1a. 删除所有 fact 锚点
  text = text.replace(/<!--\s*fact:[a-z0-9-]+\s*-->/g, '');

  /*
    1b. 合并被切开的行。
    旧锚点被删掉后，原本一行变成两行：第一行以标点结尾且**没有以空格收尾**，
    第二行以 `**`、`[`、「建议」「被子」「高于」「所以」「参考」「南方」「冬天」等
    续写内容开头。用「第一行不以空格结尾 且 第二行不以列表/标题/表格标记开头」来判定，
    这样不会误合并正常的换行（Markdown 里正常换行前通常有空格，或下一行是标记）。
  */
  const isMarkdownStart = (l) =>
    /^\s*([-*+]|\d+\.|#{1,6}\s|\||>|<!--|```|---)/.test(l) || /^\s*$/.test(l);

  let changed = true;
  while (changed) {
    changed = false;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length - 1; i += 1) {
      const cur = lines[i];
      const next = lines[i + 1];
      if (isMarkdownStart(next)) continue;
      // 当前行以中文标点结尾，且行尾不是空格（说明原来就接在一起）
      if (/[。！？；：、）】」』]$/.test(cur) && !/\s$/.test(cur)) {
        // 但要排除正常段落结束：正常段落结束后跟空行或标记，上面已排除
        lines[i] = `${cur}${next}`;
        lines.splice(i + 1, 1);
        changed = true;
        break;
      }
    }
    text = lines.join('\n');
  }

  if (text !== before) {
    if (WRITE) await writeFile(full, text, 'utf8');
    done.push(`${file}: 清除旧锚点 + 合并被切开的行`);
  }
}

/* ---------- 第二步：补上 leftovers 缺的那句话 ---------- */

{
  const full = path.join(entriesDir, `${NEW_SENTENCE.file}.md`);
  let text = await readFile(full, 'utf8');
  if (!text.includes('中心温度要达到 70 ℃ 以上')) {
    const idx = text.indexOf(NEW_SENTENCE.after);
    if (idx === -1) {
      problems.push(`${NEW_SENTENCE.file}: 找不到插入位置「${NEW_SENTENCE.after}」`);
    } else {
      const lineEnd = text.indexOf('\n', idx);
      text = `${text.slice(0, lineEnd + 1)}${NEW_SENTENCE.text}\n${text.slice(lineEnd + 1)}`;
      if (WRITE) await writeFile(full, text, 'utf8');
      done.push(`${NEW_SENTENCE.file}: 新增「复热要热透…70 ℃」并带锚点`);
    }
  } else {
    done.push(`${NEW_SENTENCE.file}: 该句已存在，跳过`);
  }
}

/* ---------- 第三步：按行类型把锚点放到正确位置 ---------- */

const byFile = new Map();
for (const p of PLACEMENTS) {
  if (!byFile.has(p.file)) byFile.set(p.file, []);
  byFile.get(p.file).push(p);
}

for (const [file, placements] of byFile) {
  const full = path.join(entriesDir, `${file}.md`);
  const text = await readFile(full, 'utf8');
  const lines = text.split('\n');

  // 找 frontmatter 范围
  let fmEnd = -1;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i] === '---') {
        fmEnd = i;
        break;
      }
    }
  }

  for (const p of placements) {
    /*
      找目标行：**在含 contains 的行里，选出真正含期望数值 mustHave 的那一行**。
      ⚠️ 不能直接取「第一个含 contains 的行」——leftovers 里第一个含「冷藏」的行
      是危险温度带那句（4–60 ℃），而不是表格里的 `| 冷藏 | 0–4 ℃ |`。
      第一版就因此把锚点定位到了错误的行（然后被 mustHave 护栏拦下，报
      「找不到含…的行」，其实行是找到了、只是选错了）。
      按数值筛选才是可靠的：数值是这个事实的唯一标识。
    */
    const candidates = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.includes(p.contains) && !/<!--\s*fact:/.test(l));
    if (candidates.length === 0) {
      problems.push(`${file}: 找不到含「${p.contains}」且未加锚点的行`);
      continue;
    }
    const picked = candidates.find(({ l }) => l.includes(p.mustHave));
    if (!picked) {
      problems.push(
        `${file}: 含「${p.contains}」的行都不含期望数值「${p.mustHave}」（候选 ${candidates.length} 行）`,
      );
      continue;
    }
    const idx = picked.i;

    const anchor = `<!-- fact:${p.key} -->`;
    const isTable = /^\s*\|/.test(lines[idx]);
    const inFrontmatter = fmEnd !== -1 && idx < fmEnd;

    /*
      ⚠️ frontmatter 里**不能**放锚点——第一版放了，构建直接失败：
        summary: '……。' <!-- fact:indoor-humidity -->
      YAML **不允许行内尾随注释**，这一行会报解析错误
      （js-yaml: "unexpected end of the stream within a single quoted scalar"）。
      所以遇到目标行在 frontmatter 里时，明确报错让人把锚点挪到正文——
      而不是悄悄跳过（跳过会让 check-facts 的"声明关系"检查失败，那是更难懂的报错）。
    */
    if (inFrontmatter) {
      problems.push(
        `${file}:${idx + 1} 目标行在 frontmatter 里（${p.key}）—— YAML 不允许行内注释，` +
          `请把锚点放到正文对应的一行`,
      );
      continue;
    }

    if (isTable) {
      // 插在最后一个 | 之前，保持列数不变
      const lastPipe = lines[idx].lastIndexOf('|');
      lines[idx] = `${lines[idx].slice(0, lastPipe).replace(/\s+$/, '')} ${anchor} ${lines[idx].slice(lastPipe)}`;
      done.push(`${file}:${idx + 1} ← fact:${p.key}（表格行，插在末列前）`);
    } else {
      lines[idx] = `${lines[idx].replace(/\s+$/, '')}${anchor}`;
      done.push(`${file}:${idx + 1} ← fact:${p.key}`);
    }
  }

  if (WRITE) await writeFile(full, lines.join('\n'), 'utf8');
}

console.log(`\n${WRITE ? '已写入' : '预览（未写入，加 --write 生效）'}\n`);
for (const d of done) console.log(`  · ${d}`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exitCode = 1;
} else {
  console.log('\n✓ 锚点已按行类型放到正确位置。\n');
}
