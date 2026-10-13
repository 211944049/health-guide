/**
 * 参考来源的规范化与著录（GB/T 7714-2015 结构，只著录真实拥有的信息）。
 *
 * ## 设计原则（重要，不要为了"看起来规范"而破坏它）
 *
 * 1. **标准类（[S]）完整著录**：有标准号，是真实可核对的。
 * 2. **外文机构文件给「官方入口」**：WHO/CDC/NIH 等的官网栏目页，
 *    而**不是**"我引用的那一份的确切链接"——因为原文只写了
 *    「WHO 关于免疫接种的实况报道」，没有具体是哪一篇。
 *    页面上会**如实说明这是官方入口**，不假装精确出处。
 * 3. **其余保留描述**：缺年份/出版地/页码的，**就不写这些项**，绝不编造。
 *
 * ## 为什么不做全自动解析
 * 曾尝试用正则把「国家卫生健康委员会《X》与成人接种相关技术指南」拆成
 * 「机构 + 题名」，结果在「与」字中间被切开（`…及说明》与. 成人接种相关…`）。
 * 根因：这 520 条 source 本来是**自然语言描述**（57% 含「关于/相关/有关」），
 * 没有可供解析的结构。所以改为**规则化重写**（下面 ISSUER_RULES 是显式表），
 * 而不是猜测式解析。
 *
 * 用法（作为库被 import，也可单独跑做统计）：
 *   node scripts/lib-sources.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

/**
 * 机构的官方入口。
 *
 * ⚠️ 这些是**栏目/检索入口页**，不是具体文件链接。
 * 写在这里的每个 URL 都必须**真的可访问**（check-sources.mjs 会逐个验证 200）。
 * 加新机构时：先确认该 URL 能打开，再写进来。
 */
export const ISSUER_ENTRIES = [
  // ---- 国际组织 ----
  { match: /世界卫生组织|WHO/, label: '世界卫生组织', url: 'https://www.who.int/health-topics' },
  { match: /国际癌症研究机构|IARC/, label: '国际癌症研究机构', url: 'https://www.iarc.who.int/' },
  { match: /欧洲食品安全局|EFSA/, label: '欧洲食品安全局', url: 'https://www.efsa.europa.eu/en/topics' },
  { match: /国际标准化组织|ISO/, label: '国际标准化组织', url: 'https://www.iso.org/standards.html' },
  { match: /国际妇产科联盟|FIGO/, label: '国际妇产科联盟', url: 'https://www.figo.org/about-figo' },
  { match: /国际糖尿病联盟|IDF/, label: '国际糖尿病联盟', url: 'https://idf.org/' },
  { match: /国际临床化学与实验医学联合会|IFCC/, label: '国际临床化学与实验医学联合会', url: 'https://www.ifcc.org/' },

  // ---- 美国 ----
  { match: /美国疾病控制与预防中心|CDC/, label: '美国疾病控制与预防中心', url: 'https://www.cdc.gov/' },
  { match: /美国环境保护署|EPA/, label: '美国环境保护署', url: 'https://www.epa.gov/' },
  /*
    ⚠️ FDA（www.fda.gov）在当前网络下**响应不稳定**：同一路径先后得到 403 与 404，
    两种判据都无法稳定通过。所以**不写进表里** —— 与 中国睡眠研究会/中国高血压联盟 同样处理：
    宁可让这些来源以描述性条目呈现，也不给读者一个点不开的链接。
    （判定依据来自 check-issuer-links.mjs，不是猜测。）
  */
  { match: /美国国立卫生研究院|NIH/, label: '美国国立卫生研究院', url: 'https://www.nih.gov/' },
  { match: /美国皮肤病学会|AAD/, label: '美国皮肤病学会', url: 'https://www.aad.org/' },
  { match: /美国儿科学会|AAP/, label: '美国儿科学会', url: 'https://www.aap.org/' },
  /*
    AASM 主站 aasm.org 在当前网络下超时（ERR 28），
    但它面向公众的科普站 sleepeducation.org 稳定 200，且更适合作为读者入口。
  */
  { match: /美国睡眠医学会|AASM/, label: '美国睡眠医学会', url: 'https://sleepeducation.org/' },
  /*
    ⚠️ 顺序有讲究：`美国牙科协会` 必须排在 `美国糖尿病学会|ADA` 之前。
    两者缩写都是 ADA，谁先匹配谁赢——先匹配具体中文名才不会张冠李戴。
  */
  { match: /美国牙科协会/, label: '美国牙科协会', url: 'https://www.ada.org/' },
  { match: /美国糖尿病学会/, label: '美国糖尿病学会', url: 'https://diabetes.org/' },
  { match: /美国妇产科学会|ACOG/, label: '美国妇产科学会', url: 'https://www.acog.org/' },
  { match: /美国泌尿外科学会|AUA/, label: '美国泌尿外科学会', url: 'https://www.auanet.org/' },
  { match: /美国国家科学院、工程院与医学院|NASEM/, label: '美国国家科学院、工程院与医学院', url: 'https://www.nationalacademies.org/' },
  { match: /美国职业安全与健康管理局|OSHA/, label: '美国职业安全与健康管理局', url: 'https://www.osha.gov/' },
  { match: /美国国家职业安全卫生研究所|NIOSH/, label: '美国国家职业安全卫生研究所', url: 'https://www.cdc.gov/niosh/' },
  { match: /美国心理学会|APA/, label: '美国心理学会', url: 'https://www.apa.org/' },
  /* AAOS 主站 TLS 在本机不可用，其面向公众的骨科科普站可访问且更合适 */
  { match: /美国骨科医师学会|AAOS/, label: '美国骨科医师学会', url: 'https://orthoinfo.aaos.org/' },

  // ---- 欧洲 ----
  { match: /欧洲药品管理局|EMA/, label: '欧洲药品管理局', url: 'https://www.ema.europa.eu/' },
  { match: /欧洲心脏病学会|ESC/, label: '欧洲心脏病学会', url: 'https://www.escardio.org/' },
  { match: /欧洲高血压学会|ESH/, label: '欧洲高血压学会', url: 'https://www.eshonline.org/' },
  { match: /欧洲皮肤病与性病学会|EADV/, label: '欧洲皮肤病与性病学会', url: 'https://www.eadv.org/' },
  { match: /英国国家卫生与临床优化研究所|NICE/, label: '英国国家卫生与临床优化研究所', url: 'https://www.nice.org.uk/guidance' },
  { match: /英国国家医疗服务体系|英国国家卫生服务|NHS/, label: '英国国家医疗服务体系', url: 'https://www.nhs.uk/' },

  // ---- 中国 ----
  { match: /国家卫生健康委员会|国家卫生健康委|卫健委/, label: '国家卫生健康委员会', url: 'https://www.nhc.gov.cn/' },
  { match: /中国疾病预防控制中心|中国疾控中心|疾控中心/, label: '中国疾病预防控制中心', url: 'https://www.chinacdc.cn/' },
  { match: /中国营养学会/, label: '中国营养学会', url: 'https://www.cnsoc.org/' },
  { match: /中华医学会/, label: '中华医学会', url: 'https://www.cma.org.cn/' },
  { match: /中华口腔医学会/, label: '中华口腔医学会', url: 'https://www.cndent.com/' },
  { match: /中国医师协会/, label: '中国医师协会', url: 'https://www.cmda.net/' },
  { match: /中国药学会/, label: '中国药学会', url: 'https://www.cpa.org.cn/' },
  { match: /中国心理卫生协会/, label: '中国心理卫生协会', url: 'https://www.camh.org.cn/' },
  /*
    中国睡眠研究会（zgsmyjh.org / .org.cn）与 中国高血压联盟（chl.org.cn）
    在当前网络下**域名无法解析/证书不可用**——`check-issuer-links.mjs` 判定为"真的有问题"。
    **不写进表里**：宁可让这些来源以描述性条目呈现（不加链接），
    也不给一个读者点不开的链接——那会让著录变成假的精确。
    以后若确认了可用域名，加回来即可（加之前先跑那个脚本）。
  */
  { match: /中国气象局/, label: '中国气象局', url: 'https://www.cma.gov.cn/' },
  { match: /国家市场监督管理总局/, label: '国家市场监督管理总局', url: 'https://www.samr.gov.cn/' },
  { match: /国家标准化管理委员会/, label: '国家标准化管理委员会', url: 'https://www.sac.gov.cn/' },
  { match: /国家药品监督管理局/, label: '国家药品监督管理局', url: 'https://www.nmpa.gov.cn/' },
  { match: /中国互联网络信息中心|CNNIC/, label: '中国互联网络信息中心', url: 'https://www.cnnic.net.cn/' },
  { match: /中国纺织工业联合会/, label: '中国纺织工业联合会', url: 'https://www.cntac.org.cn/' },
];

/**
 * 找到机构对应的官方入口（找不到返回 null，绝不猜）。
 *
 * ⚠️ 匹配顺序按「**中文名的具体程度**」排（名字更长 = 更具体 = 优先），
 * 而不是按表的书写顺序。这是踩坑后改的：
 *   source「世界卫生组织国际癌症研究机构（IARC）关于酒精饮料与癌症的分类」
 *   同时命中「世界卫生组织」和「国际癌症研究机构」，按书写顺序会取到前者，
 *   于是著录成 WHO 的入口——**归属错误**。按长度排序后取到 IARC，正确。
 *
 * 同理「美国牙科协会（ADA）」必须优先于「美国糖尿病学会（ADA）」——
 * 前者中文名更长，排序后自然在前。
 */
export function cleanSourceText(s) {
  let out = String(s);
  // 1. 去掉 [访问入口] + 完整 URL（**贪婪**，匹配到空白/行尾）
  out = out.replace(/\s*\[访问入口\]\s*https?:\/\/\S*/g, ' ');
  // 2. 循环剥尾部：类型标识、孤立年份、句点（剥到稳定为止，保证幂等）
  let prev;
  do {
    prev = out;
    out = out
      .replace(/\s*\[(?:M|J|C|D|R|S|P|EB\/OL|EB|OL|N|G)\]\s*\.?\s*$/g, '')
      .replace(/\s*[（(]?\s*(?:19|20)\d{2}\s*[）)]?\s*\.?\s*$/g, '');
  } while (out !== prev);
  return out.replace(/\s{2,}/g, ' ').trim();
}

let _sorted = null;
export function issuerEntry(text) {
  if (_sorted === null) {
    _sorted = [...ISSUER_ENTRIES].sort((a, b) => b.label.length - a.label.length);
  }
  for (const e of _sorted) {
    if (e.match.test(text)) return e;
  }
  return null;
}

/** 文献类型标识（GB/T 7714-2015）。 */
export function typeMark(text) {
  if (/(GB|WS)\s*\/?\s*T?\s*\d+/.test(text)) return 'S';
  if (/Cochrane|系统评价|系统综述|荟萃分析|meta.?分析|随机对照试验|RCT/i.test(text)) return 'J';
  if (/指南|共识|标准|规范|准则/.test(text)) return 'R';
  return 'EB/OL';
}

/** 提取年份（找不到返回 null，不编造）。 */
export function yearOf(text) {
  const m = text.match(/(?:（|\()?\s*((?:19|20)\d{2})\s*(?:）|\)|年)?/);
  return m ? m[1] : null;
}

/**
 * 把一条原始 source 渲染成著录文本。
 *
 * 规则（按优先级）：
 *   1. 标准 → `GB/T 18801—2022 空气净化器[S].`（多标准拆成多条）
 *   2. 有机构入口 → `世界卫生组织. 免疫接种实况报道[EB/OL]. 2020. https://…`
 *   3. 其余 → 保留原描述 + 类型标识（不加任何我没有的著录项）
 *
 * @returns {{ text: string, url: string|null, type: string, kind: 'standard'|'issuer'|'descriptive' }[]}
 */
export function renderSource(raw) {
  /*
    ⚠️ 先剥掉上一次迁移可能留下的痕迹（类型标识、年份、[访问入口] URL），
    然后才渲染。**这是幂等性的前提** —— 第一版没有这一步，反复运行会累积成
    `…系统评价[J].[J].` 和 `..cndent.com/` 残片，把 115 个词条改坏过一次。
  */
  const s = cleanSourceText(raw);
  const type = typeMark(s);

  /* ---- 1. 标准：可能有多个标准号，逐个成条 ---- */
  if (type === 'S') {
    const out = [];
    const re = /(GB|WS)\s*\/?\s*T?\s*(\d+(?:\.\d+)?)(?:\s*[—\-–]\s*(\d{4}))?\s*[《]?([^》]*?)[》]?(?=(?:\s*[、,，;；]\s*(?:GB|WS))|\s*$)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const prefix = `${m[1]}${m[1] === 'GB' && /T/.test(m[0].slice(0, 6)) ? '/T' : ''}`;
      const code = `${prefix} ${m[2]}${m[3] ? `—${m[3]}` : ''}`;
      const title = (m[4] ?? '').replace(/^[\s《》]+|[\s《》]+$/g, '').replace(/[（(][^）)]*[）)]\s*$/, '').trim();
      out.push({
        text: `${code}${title ? ` ${title}` : ''}[S].`,
        url: null,
        type: 'S',
        kind: 'standard',
      });
    }
    if (out.length > 0) return out;
    // 标准号形式不标准时，退化为描述性条目（不猜）
  }

  /* ---- 2. 机构入口 ---- */
  const entry = issuerEntry(s);
  if (entry) {
    // 题名：去掉机构名和口语化前缀，剩下的作为题名
    let title = s
      .replace(/^关于\s*/, '')
      .replace(/[（(](?:作为对照参考|1 类致癌物)[）)]/g, '')
      .trim();
    // 去掉开头的机构名（含括号缩写）
    const issuerPattern = new RegExp(
      `^${entry.label}(?:[（(][^）)]*[）)])?\\s*(?:关于|有关|相关)?\\s*`,
      'i',
    );
    title = title.replace(issuerPattern, '').trim();
    if (!title) title = s.replace(issuerPattern, '').trim();
    const y = yearOf(s);
    const yStr = y ? ` ${y}.` : '';
    return [
      {
        text: `${entry.label}. ${title}[${type}].${yStr} [访问入口] ${entry.url}`,
        url: entry.url,
        type,
        kind: 'issuer',
      },
    ];
  }

  /* ---- 3. 描述性：保留内容，只加类型标识 ---- */
  const y = yearOf(s);
  const yStr = y ? ` ${y}.` : '';
  return [{ text: `${s}[${type}].${yStr}`, url: null, type, kind: 'descriptive' }];
}

/* ---------- 单独运行时输出统计（便于人工复核） ---------- */
if (process.argv[1] && process.argv[1].endsWith('lib-sources.mjs')) {
  const dir = path.join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'content', 'entries');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  let total = 0;
  const kinds = { standard: 0, issuer: 0, descriptive: 0 };
  const types = {};
  const noIssuer = [];

  for (const f of files) {
    const text = await readFile(path.join(dir, f), 'utf8');
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    let data;
    try { data = yaml.load(fm[1]); } catch { continue; }
    for (const raw of data?.sources ?? []) {
      for (const r of renderSource(raw)) {
        total += 1;
        kinds[r.kind] += 1;
        types[r.type] = (types[r.type] ?? 0) + 1;
        if (r.kind === 'descriptive' && !issuerEntry(String(raw))) noIssuer.push(String(raw));
      }
    }
  }

  console.log(`\n渲染后共 ${total} 条著录\n`);
  console.log('=== 条目来源 ===');
  console.log(`  标准（完整著录）     ${kinds.standard}`);
  console.log(`  机构（含官方入口）   ${kinds.issuer}`);
  console.log(`  描述性（不加著录项） ${kinds.descriptive}`);
  console.log('\n=== 类型标识分布 ===');
  for (const [t, n] of Object.entries(types).sort((a, b) => b[1] - a[1])) console.log(`  [${t}] ${n}`);
  console.log(`\n=== 没有官方入口的描述性条目：${noIssuer.length} 条（抽样 12）===`);
  for (const s of noIssuer.slice(0, 12)) console.log(`    · ${s}`);
}
