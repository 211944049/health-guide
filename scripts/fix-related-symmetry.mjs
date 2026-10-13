/**
 * 通用的 related 双向对称修复：
 *   扫描全部词条，找出所有单向链接，双向补齐。
 *
 * 为什么写通用版：手写 NEED 表漏掉了"新条目之间"的单向链接
 * （home-appliance-hygiene → air-conditioner-use 等）。通用扫描一次解决，
 * 而且以后加词条后可以随时重跑。
 *
 * ⚠️ 幂等：已对称的不会被改动；正文一律不动（有护栏校验）。
 * 用法：node scripts/fix-related-symmetry.mjs [--check]
 *   --check  只报告不修改（给闸门用）
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');
const CHECK_ONLY = process.argv.includes('--check');

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const entries = new Map();

for (const f of files) {
  const text = await readFile(path.join(dir, f), 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  let d;
  try {
    d = yaml.load(m[1]);
  } catch {
    continue;
  }
  entries.set(f.replace(/\.md$/, ''), { file: f, text, fm: m[1], related: (d.related ?? []).filter(Boolean) });
}

/* ---- 找出所有单向链接 ---- */
const pending = new Map(); // slug -> 要补的 slug 集合
for (const [slug, e] of entries) {
  for (const target of e.related) {
    const t = entries.get(target);
    if (!t) continue; // 不存在的目标由 check-links 负责报错，这里不管
    if (!t.related.includes(slug)) {
      if (!pending.has(target)) pending.set(target, new Set());
      pending.get(target).add(slug);
    }
  }
}

if (pending.size === 0) {
  console.log('\n✓ related 双向对称，无需修改\n');
  process.exit(0);
}

console.log(`\n发现 ${pending.size} 个条目需要补反向链接\n`);

if (CHECK_ONLY) {
  for (const [slug, adds] of pending) console.log(`  ✗ ${slug}  ← ${[...adds].join(', ')}`);
  console.log('\n（--check 模式，未修改任何文件）\n');
  process.exit(1);
}

let changed = 0;
for (const [slug, adds] of pending) {
  const e = entries.get(slug);
  const lines = e.fm.split('\n');
  const relStart = lines.findIndex((l) => /^related:/.test(l));
  if (relStart === -1) continue;
  let relEnd = lines.length;
  for (let i = relStart + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z_][A-Za-z0-9_]*:/.test(lines[i])) {
      relEnd = i;
      break;
    }
  }

  const existing = lines.slice(relStart + 1, relEnd).map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  const toAdd = [...adds].filter((a) => !existing.includes(a));
  if (toAdd.length === 0) continue;

  const newBlock = [...lines.slice(relStart, relEnd), ...toAdd.map((a) => `  - ${a}`)];
  const newFm = [...lines.slice(0, relStart), ...newBlock, ...lines.slice(relEnd)].join('\n');

  const text = e.text;
  const rebuilt = `---\n${newFm}\n---${text.slice(text.indexOf('\n---', 4) + 4)}`;

  // 护栏：正文必须逐字节不变
  const bodyBefore = text.slice(text.indexOf('\n---', 4) + 4);
  const bodyAfter = rebuilt.slice(rebuilt.indexOf('\n---', 4) + 4);
  if (bodyBefore !== bodyAfter) {
    console.log(`  ✗ ${slug}: 正文被改动，已跳过`);
    continue;
  }

  await writeFile(path.join(dir, e.file), rebuilt, 'utf8');
  changed += 1;
  console.log(`  ✓ ${slug}  +${toAdd.join(', ')}`);
}

console.log(`\n修改 ${changed} 个文件\n`);
