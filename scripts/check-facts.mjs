/**
 * 跨词条「事实一致性」体检。
 *
 * ## 为什么需要
 * 96 条词条里，很多**具体数字在多处重复出现**（水温、室温、湿度、复热温度、
 * 冷藏温度……）。如果两条词条给了互相矛盾的数字，站点就自相矛盾，
 * **而构建完全不报错**。本项目已有先例：饮水工具的 1700/1500 必须与
 * 「每天喝多少水」词条一致，当时靠专门的闸门守住。这个脚本把同样的思路
 * 推广到全部词条之间。
 *
 * ## 为什么用「锚点」而不是直接搜数字
 * 第一版是直接在词条里搜数字范围，结果**报了 11 个「不一致」，而真问题为 0**——
 * 全是同一个数字在不同语境下的正常使用：
 *   · warmth 里的「44–50 ℃」是**低温烫伤**区间，不是洗澡水温
 *   · humidity 里的「70%–80%」是**尘螨最活跃**的湿度
 *   · food-poisoning 里的「80 ℃」是**豆浆假沸**温度
 *   · 「−18 ℃ 以下」是**冷冻室**，负号没被正则捕获
 *
 * **一个报 11 个问题而真问题为 0 的闸门，比没有闸门更糟**——它会训练人忽略它。
 * 所以改成：词条在句子末尾加一个 HTML 注释锚点
 *     湿度保持在 40%–60%。<!-- fact:indoor-humidity -->
 * 检查器**只在带锚点的句子里**核对数值。这样既精确，也让「这条词条声明了这条事实」
 * 这件事对人可见。
 *
 * ## 维护方式
 * 改了某个权威值 → 改下面的 FACTS 表 → 跑这个脚本 → 它会指出所有需要同步的词条。
 * 这正是想要的效果：**宁可报错，不要静默矛盾。**
 *
 * 用法：node scripts/check-facts.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/*
  默认检查 src/content/entries/。允许用 `--entries <路径>` 覆盖：
  反向验证脚本（_probe-facts.mjs）需要在**临时副本**上做「故意写矛盾数值」，
  而不是去动真实词条——本项目在"改文件再还原"上出过两次事故，
  所以探针一律在副本上做（与 check-a11y.mjs 的 --dist 同一模式）。
*/
const entriesArgIndex = process.argv.indexOf('--entries');
const entriesDir =
  entriesArgIndex !== -1 && process.argv[entriesArgIndex + 1]
    ? path.resolve(process.argv[entriesArgIndex + 1])
    : path.join(root, 'src', 'content', 'entries');

const files = (await readdir(entriesDir)).filter((f) => f.endsWith('.md'));

/*
  FACTS：跨词条必须一致的事实。key 就是词条里锚点的名字。

    label    人读说明
    files    声明了这条事实的词条（少了会报，多了也会报）
    expected 权威值（单个数字，或 [下限, 上限]）
    why      依据
    unit     单位，用于在句子里定位数值
*/
const FACTS = {
  'danger-zone': {
    label: '食品危险温度带',
    files: ['food-poisoning', 'freezing-food', 'leftovers'],
    expected: [4, 60],
    unit: '℃',
    why: 'WHO《食品安全五大要点》与各国食品安全标准：细菌在 4–60 ℃ 繁殖最快',
  },
  'bath-water-temp': {
    label: '沐浴/泡澡水温',
    files: ['warmth', 'winter-accessories'],
    expected: [37, 40],
    unit: '℃',
    why: '接近体温的温水；也是冻伤复温的推荐温度',
  },
  'room-temp-winter': {
    label: '冬季室内舒适温度',
    files: ['humidity', 'sleep-environment'],
    expected: [18, 22],
    unit: '℃',
    why: '室内舒适温度与睡眠环境的通行建议范围',
  },
  'indoor-humidity': {
    label: '室内相对湿度目标',
    files: ['humidity', 'clothing-storage'],
    expected: [40, 60],
    unit: '%',
    why: 'WHO 与美国 EPA 室内湿度建议：低于 60% 抑制霉菌与尘螨，高于 40% 避免黏膜干燥',
  },
  'reheat-temp': {
    label: '熟食复热中心温度',
    files: ['food-poisoning', 'freezing-food', 'leftovers'],
    expected: [70, null],
    unit: '℃',
    why: '熟食复热中心温度应达 70 ℃ 以上（食品安全标准）',
  },
  'fridge-temp': {
    label: '冷藏室温度',
    files: ['freezing-food', 'leftovers'],
    expected: [null, 4],
    unit: '℃',
    why: '冷藏应在 4 ℃ 以下（危险温度带下限）',
  },
};

/* ---------- 解析锚点：锚点在**行尾**，所以作用域就是那一行 ---------- */

/**
 * 取出所有「带 <!-- fact:xxx --> 锚点的行」。
 *
 * 为什么作用域是「行」而不是「句子」：锚点是放在行尾的（见 redo-fact-anchors.mjs
 * 的说明——放在句子结尾会劈开表格单元格、YAML 值和加粗标记）。
 * 行是一个结构上安全的边界，而且词条里声明事实的行本身就是完整的语义单元。
 */
function claimsIn(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(/<!--\s*fact:([a-z0-9-]+)\s*-->/g)) {
      out.push({ key: m[1], line: lines[i], lineNo: i + 1 });
    }
  }
  return out;
}

/**
 * 从一行里取所有数值（区间或单值）。
 *
 * ⚠️ 单位的位置在中文里有两种写法，必须都支持——这是第一版的 bug：
 *   · 温度类：`4–60 ℃`   → 单位只在**区间末尾**出现一次
 *   · 百分比类：`40%–60%` → 单位在**每个数字后面**都出现
 * 第一版只按「末尾一次」解析，于是 `40%–60%` 被读成 40 和 60 两个孤立单值，
 * 结果报出 3 个假「不一致」。所以这里让单位在**每个数字后都可有可无**。
 */
function extractNumbers(line, unit) {
  const u = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /*
    ⚠️ 这里的写法踩过两次坑，都要留着说明：

    坑 1：单位在中文里有两种位置。
      · 温度类 `4–60 ℃`   —— 单位只在区间末尾出现一次
      · 百分比类 `40%–60%` —— 每个数字后面都有单位
      所以**第一个数字后的单位必须可选**，否则 `40%–60%` 解析不出来。

    坑 2（刚踩的）：把单位全改成可选之后，`2–3 天内吃完` 里的 `2–3` 被当成了
      温度区间，数值 3 拿去比对就报了假「不一致」。
      所以要**要求区间的第二个数字后面紧跟单位**——`0–4 ℃` 匹配，`2–3 天` 不匹配。
      这正是「单位可选」必须只用在第一个数字上的原因。
  */
  const rangeRe = new RegExp(
    `(-?[\\d.]+)\\s*(?:${u})?\\s*[–\\-~至]\\s*(-?[\\d.]+)\\s*${u}`,
    'g',
  );
  // 单值：数字后面必须跟单位
  const singleRe = new RegExp(`(-?[\\d.]+)\\s*${u}`, 'g');

  const ranges = [...line.matchAll(rangeRe)].map((m) => [Number(m[1]), Number(m[2])]);
  if (ranges.length > 0) return ranges;
  return [...line.matchAll(singleRe)].map((m) => [Number(m[1]), null]);
}

/**
 * 判断一组数值是否满足期望。
 *
 * ⚠️ 这里踩过两次坑，两种判断方式都不能一刀切：
 *
 * 坑 1：**全部用"两端精确相等"** → leftovers 的 `| 冷藏 | 0–4 ℃ |` 被报成
 *   「应为 4 ℃ 以下」而失败。但 `0–4 ℃` 在语义上**就是** ≤4 ℃，它不矛盾。
 *
 * 坑 2：**全部用"区间包含"** → 把锚点行的 `70 ℃` 改成 `90 ℃` 竟然**通过了**，
 *   因为「≥70」被实现成 `actualLo >= 70`，而 90 ≥ 70 恒真。
 *   **这是个真漏洞**：`[70, null]` 的含义是「我声明的具体值是 70（并带"以上"的说法）」，
 *   不是「任何大于 70 的值都对」。换个数字就该报错。
 *
 * 所以现在的规则：
 *   · expected 是**有界区间** → 用包含关系（`0–4` 满足 `≤4`，`37–40` 满足 `37–40`）
 *   · expected 是**单界**（`[v, null]` 或 `[null, v]`）→ 要求实际的**对应端点恰好等于 v**，
 *     允许实际是有界区间（`0–4` 的上端 = 4 ✓）或退化的单值（`70` = 70 ✓；
 *     `90` ≠ 70 ✗ —— 这正是坑 2 要抓住的情况）
 */
function matches(expected, pair) {
  const lo = pair[0];
  const hi = pair[1] === null ? pair[0] : pair[1];
  const actualLo = Math.min(lo, hi);
  const actualHi = Math.max(lo, hi);
  const [eLo, eHi] = expected;

  if (eLo !== null && eHi !== null) {
    // 有界区间：实际区间必须落在期望区间内
    return actualLo >= Math.min(eLo, eHi) && actualHi <= Math.max(eLo, eHi);
  }
  if (eLo !== null) {
    // 下限约束：实际区间的**下界**必须恰好是 eLo（不是"至少"）
    return actualLo === eLo;
  }
  if (eHi !== null) {
    // 上限约束：实际区间的**上界**必须恰好是 eHi
    return actualHi === eHi;
  }
  return false;
}

/* ---------- 检查 ---------- */

console.log(`\n跨词条事实一致性体检：${files.length} 条词条，${Object.keys(FACTS).length} 类事实\n`);

const problems = [];
const seen = new Map(Object.keys(FACTS).map((k) => [k, new Set()]));
let checked = 0;

for (const file of files) {
  const text = await readFile(path.join(entriesDir, file), 'utf8');
  const slug = file.replace(/\.md$/, '');

  for (const claim of claimsIn(text)) {
    handleClaim(claim, slug);
  }
}

function handleClaim(claim, slug) {
  const fact = FACTS[claim.key];
  if (!fact) {
    problems.push(`${slug}: 锚点 fact:${claim.key} 没有在 check-facts.mjs 的 FACTS 表里定义`);
    return;
  }
  const nums = extractNumbers(claim.line, fact.unit);
  if (nums.length === 0) {
    problems.push(
      `${slug}:${claim.lineNo} 锚点 fact:${claim.key} 所在行找不到 ${fact.unit} 数值：「${claim.line.trim().slice(0, 70)}」`,
    );
    return;
  }
  seen.get(claim.key).add(slug);
  checked += 1;

  const ok = nums.some((pair) => matches(fact.expected, pair));
  if (!ok) {
    const got = nums.map(([a, b]) => (b === null ? `${a}` : `${a}–${b}`)).join('、');
    problems.push(
      `事实「${fact.label}」不一致：${slug}:${claim.lineNo} 写的是 ${got} ${fact.unit}，应为 ` +
        (fact.expected[0] !== null && fact.expected[1] !== null
          ? `${fact.expected[0]}–${fact.expected[1]} ${fact.unit}`
          : fact.expected[0] !== null
            ? `${fact.expected[0]} ${fact.unit} 以上`
            : `${fact.expected[1]} ${fact.unit} 以下`) +
        `　→ 行：「${claim.line.trim().slice(0, 70)}」`,
    );
  }
}

/* ---------- 覆盖检查：声明要有的词条必须有，反之亦然 ---------- */

for (const [key, fact] of Object.entries(FACTS)) {
  const found = seen.get(key);
  for (const want of fact.files) {
    if (!found.has(want)) {
      problems.push(
        `事实「${fact.label}」（fact:${key}）声明在 ${want} 里，但该词条没有这个锚点或锚点句里没有数值`,
      );
    }
  }
  for (const got of found) {
    if (!fact.files.includes(got)) {
      problems.push(
        `${got} 里出现了锚点 fact:${key}，但 FACTS 表的 files 里没列出它 —— 请补上（这是为了让人看得见"谁声明了这条事实"）`,
      );
    }
  }
}

/* ---------- 表格一致性：同一张「用量表」出现在多条词条时必须逐格相同 ---------- */

/*
  为什么需要单独一段（2026-10-20 加）

  起因：`sunscreen-use`（怎么涂）与 `sunscreen-choice`（怎么选）都有一张
  「各部位防晒用量」表，但**数值不一致**：

      部位      怎么涂        怎么选
      单侧手臂  约 3 ml       约 1 g     ← 差 3 倍
      单侧小腿  约 4 ml       约 2 g     ← 差 2 倍

  而且「怎么选」那组**算术上和「全身约 30 ml」不自洽**
  （1 + 1×2 + 2×2 = 7，加躯干也远不到 30 ml）。

  **32 道闸门全绿却没拦住它** —— 因为 FACTS 那套机制是「单行 + 单位取数」，
  用 `nums.some()` 判定，只要行里有一个数落在区间就通过。
  适合「一句话里一个权威值」，**不适合比对成组的单元格**。

  所以这里用另一种判据：**按部位名逐格比对**，任何一格不一致就报。
*/
const TABLE_PAIRS = [
  {
    label: '防晒各部位用量',
    // 两条词条都有这张表，必须逐格一致
    files: ['sunscreen-use', 'sunscreen-choice'],
    // 用部位名定位行；每行取第一个带 ml 或 g 的数值
    rows: ['脸 + 脖子', '单侧手臂', '单侧小腿', '全身'],
    why: '同站两处给出不同用量会直接损伤可信度；且用量需与「全身 30 ml」自洽',
  },
];

/** 从一条词条里抽出用量表：返回 { 部位: '数值单位' }。 */
function extractDoseTable(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const part = cells[0].replace(/\*\*/g, '').replace(/<[^>]+>/g, '').trim();
    // 在第二个单元格里找「数字 + ml/g」
    const m = cells[1].replace(/<[^>]+>/g, '').match(/([\d.]+(?:\s*[–-]\s*[\d.]+)?)\s*(ml|g)\b/i);
    if (m) out[part] = { value: m[1].replace(/\s/g, ''), unit: m[2].toLowerCase() };
  }
  return out;
}

console.log('  表格一致性：');
for (const pair of TABLE_PAIRS) {
  const tables = {};
  for (const slug of pair.files) {
    const p = path.join(entriesDir, `${slug}.md`);
    const text = await readFile(p, 'utf8').catch(() => '');
    tables[slug] = extractDoseTable(text);
  }

  let pairProblems = 0;
  for (const row of pair.rows) {
    /*
      按**前缀**匹配行名，不要求完全相同。
      理由：两条词条对同一部位的措辞可能略有差异（实测：
      `全身（含躯干）` vs `全身（泳装覆盖面积）`）——那是正常的表述差异，
      不该被当成不一致。要比的是**数值**，不是标题文字。
    */
    const findRow = (table) => {
      const key = Object.keys(table).find((k) => k.startsWith(row));
      return key ? table[key] : null;
    };
    const found = pair.files.map((s) => ({ slug: s, cell: findRow(tables[s]) }));
    const missing = found.filter((f) => !f.cell);
    if (missing.length) {
      problems.push(
        `表格「${pair.label}」在 ${missing.map((m) => m.slug).join(', ')} 里找不到以「${row}」开头的行，或该行没有 ml/g 数值`,
      );
      pairProblems += 1;
      continue;
    }
    // 先把单位统一到 ml（防晒霜密度近似 1 g/ml，所以数值可直接比；但单位不同仍报，避免混淆）
    const units = new Set(found.map((f) => f.cell.unit));
    const values = new Set(found.map((f) => f.cell.value));
    if (values.size > 1) {
      problems.push(
        `表格「${pair.label}」的「${row}」不一致：` +
          found.map((f) => `${f.slug} = ${f.cell.value} ${f.cell.unit}`).join(' / '),
      );
      pairProblems += 1;
    } else if (units.size > 1) {
      problems.push(
        `表格「${pair.label}」的「${row}」数值相同但单位不同：` +
          found.map((f) => `${f.slug} = ${f.cell.value} ${f.cell.unit}`).join(' / ') +
          '　→ 请统一单位，避免读者困惑',
      );
      pairProblems += 1;
    }
  }

  if (pairProblems === 0) {
    console.log(`  ✓ ${pair.label}：${pair.files.length} 条词条的 ${pair.rows.length} 个部位逐格一致`);
    console.log(`      依据：${pair.why}`);
  } else {
    console.log(`  ✗ ${pair.label}：${pairProblems} 处不一致`);
  }
}

/* ---------- 报告 ---------- */

for (const [key, fact] of Object.entries(FACTS)) {
  const found = [...seen.get(key)];
  const want = fact.expected;
  const shown =
    want[0] !== null && want[1] !== null
      ? `${want[0]}–${want[1]} ${fact.unit}`
      : want[0] !== null
        ? `≥${want[0]} ${fact.unit}`
        : `≤${want[1]} ${fact.unit}`;
  const ok = found.length === fact.files.length && !problems.some((p) => p.includes(`「${fact.label}」`));
  console.log(`  ${ok ? '✓' : '✗'} ${fact.label}：期望 ${shown}，${found.length} 条词条声明 [${found.join(', ') || '无'}]`);
  if (ok) console.log(`      依据：${fact.why}`);
}

console.log(`\n  共核对 ${checked} 处锚点数值`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    '\n  处理方式：词条写错了 → 改词条；期望值过时 → 改本脚本的 FACTS 表。' +
      '\n  两种情况都必须让它们重新一致 —— 这是这个闸门存在的全部意义。\n',
  );
  process.exit(1);
}

console.log('\n✓ 跨词条的事实数值全部一致，且声明关系清晰。\n');
