/**
 * 专题覆盖检查：新增词条有没有被专题漏掉。
 *
 * 为什么需要：专题是在 69 条时建的，之后又加了 11 条。**新词条不会自动进专题**，
 * 而"某个好词条没人能通过专题找到"是静默的损失——构建不会报错。
 *
 * 判断方式：对每条**不在任何专题里**的词条，看它的 related 邻居落在哪个专题里。
 * 如果大多数邻居都在某个专题，说明它天然属于那个专题，被漏掉了。
 *
 * 用法：node scripts/check-topic-coverage.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = path.join(root, 'src', 'content', 'entries');

/* ---------- 读词条 ---------- */

const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
const entries = new Map();
for (const f of files) {
  const text = await readFile(path.join(dir, f), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const list = (k) => {
    const lines = fm.split(/\r?\n/);
    const start = lines.findIndex((l) => new RegExp(`^${k}:`).test(l));
    if (start === -1) return [];
    const items = [];
    for (const line of lines.slice(start + 1)) {
      if (/^\s+-\s+/.test(line)) { items.push(line.replace(/^\s+-\s+/, '').trim()); continue; }
      if (/^\S/.test(line)) break;
    }
    return items;
  };
  const slug = f.replace(/\.md$/, '');
  entries.set(slug, {
    slug,
    title: (fm.match(/^title:[ \t]*(.*)$/m) ?? [, ''])[1].trim(),
    category: (fm.match(/^category:[ \t]*(.*)$/m) ?? [, ''])[1].trim(),
    related: list('related'),
  });
}

/* ---------- 读专题 ---------- */

const topicsSrc = await readFile(path.join(root, 'src', 'lib', 'topics.ts'), 'utf8');
const topics = [];
for (const chunk of topicsSrc.split(/\n  \{\n/).slice(1)) {
  const slug = chunk.match(/slug:\s*'([^']+)'/)?.[1];
  const title = chunk.match(/title:\s*'([^']+)'/)?.[1];
  if (!slug) continue;
  const members = [...chunk.matchAll(/entries:\s*\[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]));
  topics.push({ slug, title, members: new Set(members) });
}

const inAnyTopic = new Set(topics.flatMap((t) => [...t.members]));

console.log(`\n专题覆盖检查：${entries.size} 条词条，${topics.length} 个专题`);
console.log(`  已被专题收录：${inAnyTopic.size} 条`);
console.log(`  未被任何专题收录：${entries.size - inAnyTopic.size} 条\n`);

/* ---------- 对未收录词条，看它的邻居落在哪个专题 ---------- */

const uncovered = [...entries.values()].filter((e) => !inAnyTopic.has(e.slug));
const suggestions = [];

for (const e of uncovered) {
  const votes = new Map();
  for (const r of e.related) {
    for (const t of topics) {
      if (t.members.has(r)) votes.set(t.title, (votes.get(t.title) ?? 0) + 1);
    }
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  if (best && best[1] >= 2) {
    suggestions.push({ entry: e, topic: best[0], votes: best[1], total: e.related.length });
  }
}

console.log('=== 建议补进专题的词条（related 邻居有 ≥2 条落在同一专题）===');
if (suggestions.length === 0) {
  console.log('  没有明显该补的。');
} else {
  const byTopic = new Map();
  for (const s of suggestions) {
    if (!byTopic.has(s.topic)) byTopic.set(s.topic, []);
    byTopic.get(s.topic).push(s);
  }
  for (const [topic, list] of byTopic) {
    console.log(`\n  【${topic}】`);
    for (const s of list.sort((a, b) => b.votes - a.votes)) {
      console.log(`    · ${s.entry.title}（${s.entry.category}）—— ${s.votes}/${s.total} 个邻居在这个专题里`);
    }
  }
}

/* ---------- 其余未收录词条 ---------- */

const suggested = new Set(suggestions.map((s) => s.entry.slug));
const rest = uncovered.filter((e) => !suggested.has(e.slug));
console.log(`\n=== 其余未收录（邻居分散，可能不需要进专题）===\n  共 ${rest.length} 条`);
for (const e of rest.slice(0, 20)) {
  console.log(`    · ${e.title}（${e.category}）`);
}
if (rest.length > 20) console.log(`    … 另有 ${rest.length - 20} 条`);
console.log('');
