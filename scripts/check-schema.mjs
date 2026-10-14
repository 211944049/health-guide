/**
 * 结构化数据（JSON-LD）体检。
 *
 * 为什么需要：结构化数据的失败模式很隐蔽——
 *   1. JSON 写坏了 → 搜索引擎读不到，但页面看起来完全正常
 *   2. 声明了页面上不存在的信息（假评分、假作者、假 FAQ）→ 可能被判作弊
 *   3. `@id` 引用指向图里不存在的节点 → 语义断裂，校验工具会报错
 *   4. 内容里出现 `</script>` 没转义 → **直接破坏页面**（这是最严重的一种）
 * 这四种构建都不会报错，所以必须机器查。
 *
 * 检查项：
 *   · 每个页面恰好一个 JSON-LD，且能完整解析
 *   · @context 正确、@graph 结构完整
 *   · 必需的节点存在（WebPage/MedicalWebPage、WebSite、Organization）
 *   · 每个 `@id` 引用都能在图内解析（不悬空）
 *   · 词条页必须有 Article 节点，且 headline/description/dateModified 与页面一致
 *   · 面包屑的每一项都指向真实存在的页面
 *   · **不出现**被搜索引擎限制或我们刻意不用的类型（FAQPage、Review、AggregateRating）
 *   · 页面 HTML 里没有未转义的 `</script>` 导致的截断
 *
 * 用法：node scripts/check-schema.mjs
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/*
  默认检查 dist/。允许用 `--dist <路径>` 覆盖：反向验证脚本（_probe-schema.mjs）
  需要在临时目录里对「故意坏掉」的副本跑校验，而不去动真实产物。
*/
const distArgIndex = process.argv.indexOf('--dist');
const distDir =
  distArgIndex !== -1 && process.argv[distArgIndex + 1]
    ? path.resolve(process.argv[distArgIndex + 1])
    : path.join(root, 'dist');

const problems = [];

async function collect(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await collect(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

const allFiles = new Set(await collect(distDir));
const htmlFiles = [...allFiles].filter((f) => f.endsWith('.html')).sort();

/*
  刻意不使用的类型：
  · FAQPage —— Google 已把富媒体结果限制在政府/医疗权威站点，而且我们的内容不是问答对，
    硬凑成 FAQ 既不诚实也无效。
  · Review / AggregateRating —— 我们没有评分系统，声明就是造假。
  一旦有人（包括未来的我）手滑加进来，这里会立刻拦住。
*/
const FORBIDDEN_TYPES = ['FAQPage', 'Review', 'AggregateRating', 'HowTo'];

console.log(`\n结构化数据体检：${htmlFiles.length} 个页面`);

let entryPages = 0;
let articleNodes = 0;
let breadcrumbNodes = 0;

for (const file of htmlFiles) {
  const html = await readFile(path.join(distDir, file), 'utf8');

  // JSON-LD 块
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) {
    problems.push(`${file}: 期望恰好 1 个 JSON-LD 块，实际 ${blocks.length} 个`);
    continue;
  }

  let doc;
  try {
    doc = JSON.parse(blocks[0][1]);
  } catch (error) {
    problems.push(`${file}: JSON-LD 解析失败 —— ${error.message}`);
    continue;
  }

  if (doc['@context'] !== 'https://schema.org') {
    problems.push(`${file}: @context 应为 https://schema.org，实际 ${doc['@context']}`);
  }
  if (!Array.isArray(doc['@graph']) || doc['@graph'].length === 0) {
    problems.push(`${file}: 缺少 @graph 数组`);
    continue;
  }

  const graph = doc['@graph'];
  const types = new Set();
  const ids = new Set();
  for (const node of graph) {
    if (node['@type']) types.add(node['@type']);
    if (node['@id']) ids.add(node['@id']);
  }

  // 禁止的类型
  for (const t of FORBIDDEN_TYPES) {
    if (types.has(t)) problems.push(`${file}: 出现了刻意不用的类型 ${t}`);
  }

  // 必需节点
  const isEntry = file.startsWith('entry/') && file.endsWith('/index.html');
  const expectedPageType = isEntry ? 'MedicalWebPage' : 'WebPage';
  if (!types.has(expectedPageType)) {
    problems.push(`${file}: 缺少 ${expectedPageType} 节点`);
  }
  for (const t of ['WebSite', 'Organization']) {
    if (!types.has(t)) problems.push(`${file}: 缺少 ${t} 节点`);
  }

  // @id 引用必须能在图内解析
  const dangling = [];
  const walk = (value, keyPath) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${keyPath}[${i}]`));
      return;
    }
    if (value && typeof value === 'object') {
      // 只有「纯引用」对象（只有 @id）才算引用
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === '@id' && !ids.has(value['@id'])) {
        dangling.push(`${keyPath} → ${value['@id']}`);
      }
      for (const [k, v] of Object.entries(value)) walk(v, `${keyPath}.${k}`);
    }
  };
  walk(graph, '@graph');
  if (dangling.length) {
    problems.push(`${file}: 有 ${dangling.length} 处 @id 引用在图内找不到（悬空引用）：${dangling.slice(0, 2).join('；')}`);
  }

  // 词条页：Article 必须存在且字段与页面一致
  if (isEntry) {
    entryPages += 1;
    const article = graph.find((n) => n['@type'] === 'Article');
    if (!article) {
      problems.push(`${file}: 词条页缺少 Article 节点`);
    } else {
      articleNodes += 1;
      for (const field of ['headline', 'description', 'dateModified']) {
        if (!article[field]) problems.push(`${file}: Article 缺少 ${field}`);
      }
      /*
        比较 JSON-LD 与 HTML 里的字符串时，**必须先把 HTML 实体解码回字符**。
        JSON-LD 里是原始字符，而 HTML 里 `"` 会写成 `&quot;`、`'` 会写成 `&#39;`——
        直接比较必然误报。

        2026-10-13：这条以前只用在 description 上，headline 漏了。写
        「"上火"到底是什么」这条词条时立刻被自己的闸门拦下：
          Article.headline「"上火"到底是什么」与页面标题「&quot;上火&quot;到底是什么」不一致
        抽成函数，避免以后再有哪个字段忘了解码。
      */
      const decodeEntities = (s) =>
        s
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');

      // headline 必须与 <title> 里的词条标题一致（防止复制粘贴写错）
      const docTitle = decodeEntities(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
      const expectedHeadline = docTitle.split(' · ')[0];
      if (article.headline && article.headline !== expectedHeadline) {
        problems.push(`${file}: Article.headline「${article.headline}」与页面标题「${expectedHeadline}」不一致`);
      }
      // description 必须与 meta description 一致（同样要先解码实体）
      const metaDesc = decodeEntities(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
      if (article.description && metaDesc && article.description !== metaDesc) {
        problems.push(`${file}: Article.description 与 meta description 不一致`);
      }
      // dateModified 必须是合法 ISO 日期
      if (article.dateModified && Number.isNaN(new Date(article.dateModified).getTime())) {
        problems.push(`${file}: Article.dateModified 不是合法日期：${article.dateModified}`);
      }
    }
  }

  // 面包屑：每项都要指向真实页面
  const bc = graph.find((n) => n['@type'] === 'BreadcrumbList');
  if (bc) {
    breadcrumbNodes += 1;
    for (const item of bc.itemListElement ?? []) {
      if (!item.name || !item.item) {
        problems.push(`${file}: 面包屑项缺少 name 或 item`);
        continue;
      }
      const rel = item.item.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '/index.html');
      // 首页的路径是空串（`https://host/` 去掉前缀后为空），对应 dist/index.html
      const target = rel === '' || rel === 'index.html' ? 'index.html' : rel;
      if (!allFiles.has(target)) {
        problems.push(`${file}: 面包屑指向不存在的页面：${item.item}`);
      }
    }
    // position 必须从 1 连续递增
    const positions = (bc.itemListElement ?? []).map((x) => x.position);
    const expected = positions.map((_, i) => i + 1);
    if (JSON.stringify(positions) !== JSON.stringify(expected)) {
      problems.push(`${file}: 面包屑 position 不是从 1 连续递增：${positions.join(',')}`);
    }
  }
}

/* ---------- 页面完整性的最严重风险：未转义的 </script> 截断 ---------- */

console.log(`  词条页 ${entryPages} 个，Article 节点 ${articleNodes} 个，面包屑 ${breadcrumbNodes} 个`);

/*
  扫描每个 <script> 块，确认它真的有对应的结束标签。

  为什么需要这个检查（第一版漏了，反向验证才发现的）：
  只检查 `</body>` 是否存在是不够的——如果有人往页面里插入**未转义**的 `</script>`，
  浏览器会在那里提前结束脚本块，后面的内容被当成 HTML 文本渲染；
  而文档末尾原本就有的 `</body>` 仍然存在，所以「完整性」检查会误判为正常。
  这里的扫描能在构建产物层面立刻发现这种破坏，不必等浏览器。
*/
let truncated = 0;
for (const file of htmlFiles) {
  const html = await readFile(path.join(distDir, file), 'utf8');

  // 逐个 <script> 找它的结束标签；找不到闭合就是截断
  const opens = [...html.matchAll(/<script\b[^>]*>/gi)];
  let scan = 0;
  let unclosed = 0;
  for (const open of opens) {
    const start = open.index + open[0].length;
    scan = Math.max(scan, start);
    const closeRel = html.slice(start).search(/<\/script\s*>/i);
    if (closeRel === -1) {
      unclosed += 1;
      break;
    }
    scan = start + closeRel;
  }
  if (unclosed > 0) {
    problems.push(`${file}: 有 <script> 块没有结束标签（内容可能未转义，会在浏览器里提前截断）`);
    truncated += 1;
  }

  if (!html.includes('</body>') || !html.includes('</html>')) {
    problems.push(`${file}: HTML 不完整（缺少 </body> 或 </html>）`);
    truncated += 1;
  }
}
if (truncated === 0) console.log(`  所有页面结构完整：没有未闭合的 <script>，也没有被截断的文档`);

if (problems.length > 0) {
  console.error(`\n发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 20)) console.error(`  ✗ ${p}`);
  if (problems.length > 20) console.error(`  … 另有 ${problems.length - 20} 个`);
  console.error('');
  process.exit(1);
}

console.log('\n✓ 结构化数据结构正确、引用完整、无造假字段。\n');
