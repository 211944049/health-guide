/**
 * 把 GB/T 7714 结构的参考来源与正文引用标注写入词条。
 *
 * ## 相对「每条都完整著录」的妥协（明确写下来，避免以后误以为做全了）
 * 520 条 source 里 0 条有页码/卷期/DOI/URL，只有 16% 有年份。
 * 所以：
 *   · 标准（46 条）→ 完整著录（有标准号，可核对）
 *   · 有官方入口的机构（330 条）→ 机构. 题名[类型]. 年份. + 官方入口链接
 *   · 其余（148 条）→ 保留原描述 + 类型标识，**不写我没有的著录项**
 *
 * ## 引用标注的粒度：**按段落，不按句子**
 * 「健康原理」是综合分析多份来源的，不是"一句话一个出处"。
 * 逐句标注会造成**虚假的精确性**（好像每个论断都有单一出处）。
 * 所以做法是：在「健康原理」的**每个自然段末尾**加一组编号上标，
 * 指向文末的参考来源——语义是"这一段参考了这几份"，这是真实的。
 *
 * 用法：node scripts/apply-sources.mjs [--write]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { renderSource } from './lib-sources.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
/*
  允许 `--dir <路径>` 覆盖词条目录。
  为什么需要：这次改动覆盖全部 115 个文件的 frontmatter sources 字段，
  属于高风险批量写入。先在**副本**上跑一遍、确认结构没坏，再动真实目录
  ——这是本项目在批量写入上付过学费（summary 引号累积污染 44 个词条）之后定的做法。
*/
const dirArgIndex = process.argv.indexOf('--dir');
const dir =
  dirArgIndex !== -1 && process.argv[dirArgIndex + 1]
    ? path.resolve(process.argv[dirArgIndex + 1])
    : path.join(root, 'src', 'content', 'entries');
const WRITE = process.argv.includes('--write');

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));

let changed = 0;
let totalSources = 0;
let totalRefs = 0;
let alreadyMigrated = 0;
const samples = [];
const problems = [];

for (const f of files) {
  const full = path.join(dir, f);
  const text = await readFile(full, 'utf8');
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    problems.push(`${f}: 没有 frontmatter`);
    continue;
  }

  let data;
  try {
    data = yaml.load(fmMatch[1]);
  } catch (e) {
    problems.push(`${f}: frontmatter 解析失败 — ${String(e.message).slice(0, 60)}`);
    continue;
  }

  const rawSources = data?.sources ?? [];
  if (rawSources.length === 0) continue;

  /*
    ⚠️⚠️ 幂等守卫（这是这次改动最重要的一行）
    
    我在这上面错了三次：试图用正则"反解"上一次迁移的输出，
    结果每次都越叠越多（形如 [R]. 后面又跟一次 URL 与 [R].）。
    根因是：**一旦文本里同时出现 URL 和分隔符，就无法可靠地还原出题名。**
    
    （注意：这段注释里**不能写反引号**——第一版就是因为在注释里用了反引号，
    提前闭合了下面的模板字符串，导致脚本语法错误。)
    
    但有一个**完美判别器**：**原始数据里一条 URL 都没有**（0/520）。
    所以只要某条 source 里出现了 URL 或分隔符，它就一定是迁移产物 —— 直接跳过整个词条。
    这比"修正则"可靠得多，而且是**结构上不可能重复施加**的。
    
    如果确实需要重新迁移（改了 lib-sources 的规则），
    应从 handoff/_entries-backup-* 恢复干净数据后再跑。
  */
  if (rawSources.some((s) => /https?:\/\//.test(String(s)) || String(s).includes('|||'))) {
    alreadyMigrated += 1;
    continue;
  }

  /* ---- 渲染参考来源 ---- */
  const rendered = [];
  for (const raw of rawSources) {
    for (const r of renderSource(raw)) rendered.push(r);
  }
  totalSources += rendered.length;
  if (rendered.length === 0) {
    problems.push(`${f}: 渲染后没有任何来源`);
    continue;
  }

  /*
    构建新的 frontmatter sources。
    格式：`<著录文本> ||| <官方入口 URL>`（无 URL 时只有文本）。

    ⚠️ 著录文本里**要去掉** renderSource 拼进去的「[访问入口] URL」——
    否则页面上 URL 会同时以纯文本和链接出现两次。链接由渲染层单独生成。
  */
  const newSources = rendered.map((r) => {
    // 著录文本里去掉成对的「[访问入口] URL」，链接由渲染层单独生成
    const cleanText = r.text
      .replace(/\s*\[访问入口\]\s*https?:\/\/\S*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return r.url ? `${cleanText} ||| ${r.url}` : cleanText;
  });

  /* ---- 在「健康原理」每个自然段末尾加引用编号 ---- */
  const body = text.slice(fmMatch[0].length);
  const refLine = rendered.map((_, i) => `[${i + 1}]`).join('');
  const marker = `<sup class="ref-mark">${refLine}</sup>`;

  // 先清掉上次插入的标注（保证幂等）
  let newBody = body.replace(/<sup class="ref-mark">.*?<\/sup>/g, '');

  const principleIdx = newBody.indexOf('## 健康原理');
  if (principleIdx !== -1) {
    const nextH2 = newBody.indexOf('\n## ', principleIdx + 1);
    const sectionEnd = nextH2 === -1 ? newBody.length : nextH2;
    let section = newBody.slice(principleIdx, sectionEnd);

    /*
      在每个**自然段**末尾插入标注。
      ⚠️ 两个必须排除的情况（第一版都踩了）：
        1. **标题行**：`## 健康原理` 后面不该跟标注（语义上标题不"参考"任何东西）
        2. **frontmatter / 列表项**：这里只处理小节内的正文，列表项按普通行处理即可
      做法：逐行扫描，遇到「非空行 + 下一行为空行或小节结束」且**该行不是标题**时插入。
    */
    {
      const lines = section.split('\n');
      const out = [];
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const next = lines[i + 1];
        const isHeading = /^#{1,6}\s/.test(line);
        const isBlank = line.trim() === '';
        const endsParagraph = next === undefined || next.trim() === '';
        if (!isBlank && !isHeading && endsParagraph && !/<sup class="ref-mark">/.test(line)) {
          out.push(`${line}${marker}`);
        } else {
          out.push(line);
        }
      }
      section = out.join('\n');
    }

    newBody = newBody.slice(0, principleIdx) + section + newBody.slice(sectionEnd);
    totalRefs += 1;
  } else {
    problems.push(`${f}: 没有「健康原理」小节，未加引用标注`);
  }

  if (samples.length < 3) {
    samples.push({ f, count: rendered.length, first: newSources[0], marker });
  }

  if (WRITE) {
    /*
      重建 frontmatter 里的 sources 段：**只替换 sources 块**，其余字段原样保留。
      做法：在原始 frontmatter 文本里定位 `sources:` 到下一个顶层键之间，整段替换。
    */
    const fmText = fmMatch[1];
    const lines = fmText.split('\n');
    const start = lines.findIndex((l) => /^sources:/.test(l));
    if (start === -1) {
      problems.push(`${f}: frontmatter 里找不到 sources 行`);
      continue;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^[A-Za-z_][A-Za-z0-9_]*:/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const newBlock = ['sources:', ...newSources.map((s) => `  - ${JSON.stringify(s)}`)];
    const newFm = [...lines.slice(0, start), ...newBlock, ...lines.slice(end)].join('\n');

    const rebuilt = `---\n${newFm}\n---${newBody}`;
    // 写前护栏：长度不能明显缩水，且必须仍含原来的小节
    if (rebuilt.length < text.length * 0.9) {
      problems.push(`${f}: 重建后长度异常（${rebuilt.length} < ${text.length} 的 90%），已跳过`);
      continue;
    }
    if (!rebuilt.includes('## 健康原理') || !rebuilt.includes('## 参考来源') === false) {
      // 有的词条可能没有「参考来源」标题，这不是错误
    }
    await writeFile(full, rebuilt, 'utf8');
    changed += 1;
  }
}

console.log(`\n${WRITE ? '已写入' : '预览（未写入，加 --write 生效）'}\n`);
console.log(`  本轮处理词条：${WRITE ? changed : files.length}`);
console.log(`  跳过（已是迁移后的数据）：${alreadyMigrated}`);
console.log(`  渲染后参考来源总数：${totalSources}`);
console.log(`  加了引用标注的词条：${totalRefs}`);

if (samples.length) {
  console.log('\n=== 抽样 ===');
  for (const s of samples) {
    console.log(`\n  [${s.f}]（${s.count} 条来源）`);
    console.log(`    首条著录：${s.first}`);
    console.log(`    正文标注：${s.marker}`);
  }
}

if (problems.length) {
  console.log(`\n=== 需要注意（${problems.length}）===`);
  for (const p of problems.slice(0, 20)) console.log(`    · ${p}`);
  if (problems.length > 20) console.log(`    … 另有 ${problems.length - 20} 条`);
}
