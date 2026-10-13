/**
 * 分类迁移：把皮肤/身体/口腔护理类词条从「衣」和「健康管理」移到新的「护理」。
 *
 * ## 背景
 * 用户问「长痘为什么归在衣？跟衣有什么关系」——原来的「衣」把
 * **穿在身上的**和**抹在身上的**混在一起，用户看到「长痘」在「衣」下会以为分类错了。
 *
 * ## 拆法
 *   · **衣** = 买和洗的织物与鞋帽
 *   · **护理** = 用在皮肤/身体/口腔上的（含原在「健康管理」的 4 条口腔护理）
 *
 * ## 安全措施（本项目的教训都用上了）
 *   1. 先备份整个 entries 目录
 *   2. 只改 `category:` 一行，其余字节不动（有护栏校验）
 *   3. 幂等：已经是目标分类的跳过
 *   4. 先 `--check` 预览，再真正写入
 *
 * 用法：node scripts/migrate-category-care.mjs [--check]
 */
import { readFile, writeFile, readdir, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');
const CHECK_ONLY = process.argv.includes('--check');
const BACKUP = path.join(root, '..', 'handoff', `_entries-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-pre-care-category`);

/** 移到「护理」的词条。 */
const TO_CARE = [
  // —— 从「衣」移出：抹在身上、不穿在身上的 ——
  'face-wash',        // 洗面奶怎么用
  'face-towel',       // 洗脸巾怎么选（用后即弃的织物，但用途是护肤）
  'body-lotion',      // 身体乳怎么用
  'lip-balm',         // 唇膏怎么选
  'hand-foot-nail-care', // 手脚干裂和指甲怎么护理
  'shaving',          // 刮胡子怎么刮不伤皮肤
  'acne-care',        // 长痘怎么处理
  'skin-whitening',   // 美白产品有没有用
  'skin-moisture-oil',// 皮肤保湿和控油
  'sunscreen-choice', // 防晒霜怎么选（抹的）
  'sunscreen-use',    // 防晒霜怎么涂才有用（抹的）
  'after-sun',        // 晒伤和晒后怎么处理
  'hair-care',        // 头发日常怎么养护
  'hair-removal',     // 脱毛方法怎么选（处理皮肤上的毛发）
  // —— 从「健康管理」移出：口腔护理与护肤是同类（日常自己做、靠习惯）——
  'flossing',         // 牙线怎么用
  'mouthwash',        // 漱口水怎么用
  'oral-care',        // 口腔怎么护理
  'toothbrush',       // 牙刷怎么选、怎么用、什么时候换
];

const TARGET = '护理';

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const plan = [];
const skip = [];

for (const slug of TO_CARE) {
  const file = `${slug}.md`;
  if (!files.includes(file)) {
    console.log(`  ! 找不到文件：${file}`);
    continue;
  }
  const text = await readFile(path.join(dir, file), 'utf8');
  const m = text.match(/^category:\s*(.+)$/m);
  if (!m) {
    console.log(`  ! ${file} 没有 category 行`);
    continue;
  }
  const current = m[1].trim();
  if (current === TARGET) {
    skip.push(slug);
    continue;
  }
  plan.push({ slug, file, from: current, to: TARGET, text, before: m[0] });
}

console.log(`\n=== 迁移计划：${plan.length} 条移入「${TARGET}」，${skip.length} 条已在其中 ===\n`);
for (const p of plan) console.log(`  ${p.slug.padEnd(24)} ${p.from} → ${p.to}`);

if (skip.length) console.log(`\n已在「${TARGET}」：${skip.join(', ')}`);

if (CHECK_ONLY) {
  console.log('\n（--check 模式，未修改任何文件）\n');
  process.exit(0);
}
if (plan.length === 0) {
  console.log('\n没有需要迁移的，退出。\n');
  process.exit(0);
}

/* ---- 备份 ---- */
await mkdir(path.dirname(BACKUP), { recursive: true });
await cp(dir, BACKUP, { recursive: true });
console.log(`\n已备份到 ${path.relative(root, BACKUP)}（${(await readdir(BACKUP)).length} 个文件）`);

/* ---- 写入（只改 category 一行）---- */
let changed = 0;
for (const p of plan) {
  const after = p.text.replace(/^category:\s*.+$/m, `category: ${TARGET}`);
  // 护栏 1：正文与其余 frontmatter 必须逐字节不变（只差那一行）
  const stripCat = (s) => s.replace(/^category:\s*.+$/m, '');
  if (stripCat(after) !== stripCat(p.text)) {
    console.log(`  ✗ ${p.slug}: 除 category 外还有别的改动，已跳过`);
    continue;
  }
  // 护栏 2：长度变化应当很小（只差分类名）
  if (Math.abs(after.length - p.text.length) > 12) {
    console.log(`  ✗ ${p.slug}: 长度变化异常，已跳过`);
    continue;
  }
  await writeFile(path.join(dir, p.file), after, 'utf8');
  changed += 1;
}

console.log(`\n已修改 ${changed} 个文件\n`);

/* ---- 幂等确认：再跑一次应当全部跳过 ---- */
const recheck = [];
for (const slug of TO_CARE) {
  const text = await readFile(path.join(dir, `${slug}.md`), 'utf8');
  const cur = text.match(/^category:\s*(.+)$/m)[1].trim();
  if (cur !== TARGET) recheck.push(slug);
}
console.log(recheck.length === 0 ? '✓ 幂等确认：全部已就位\n' : `✗ 仍有未迁移：${recheck.join(', ')}\n`);
