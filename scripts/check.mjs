/**
 * 회차 원고 점검
 * -------------------------------------------------------------
 *   npm run check              모든 회차 점검
 *   npm run check 002          002 로 시작하는 회차만 점검
 *
 * 봐주는 것
 *   ① 중복       이전 회차에 이미 나온 단어·문법·예문
 *   ② 획순 누락  kanjiPractice 에 썼는데 public/kanji 에 데이터가 없는 글자
 *   ③ 발음 위험  음성이 틀리게 읽기 쉬운 한자 (대괄호 두 개 후보)
 *   ④ 형식       회차 번호·슬러그 중복, 퀴즈 정답 개수, 비어 있는 항목
 *
 * 빌드를 막지는 않습니다. "확인해보라"는 알림이에요.
 * 일부러 복습으로 다시 다루는 거면 그냥 넘어가면 됩니다.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const DIR = path.resolve('src/data/episodes');
const KANJI_DIR = path.resolve('public/kanji');

// 음성 합성기가 자주 틀리는 글자. 대괄호 하나로 쓰면 경고합니다.
const RISKY = {
  中: 'なか / ちゅう',
  方: 'かた / ほう',
  人: 'ひと / にん / じん',
  日: 'ひ / にち / か',
  月: 'つき / がつ / げつ',
  年: 'とし / ねん',
  分: 'ふん / ぶん / わ(ける)',
  間: 'あいだ / かん / ま',
  上: 'うえ / じょう / あ(げる)',
  下: 'した / か / さ(げる)',
  生: 'い(きる) / せい / なま',
  行: 'い(く) / おこな(う) / ぎょう',
  一日: 'いちにち / ついたち',
  明日: 'あした / あす / みょうにち',
  何: 'なに / なん',
  大人: 'おとな',
  今日: 'きょう',
};

const KANJI_RE = /[\u4E00-\u9FFF\u3005]/;
// 대괄호 하나짜리 표기만 잡습니다 (두 개짜리는 이미 교정된 것)
const SINGLE_RE = /([\u4E00-\u9FFF\u3005]+)(?<!\])\[(?!\[)([^\]]+)\]/g;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/** 대괄호 표기를 걷어낸 순수 한자 표기 */
function bare(text = '') {
  return String(text).replace(
    /([\u4E00-\u9FFF\u3005\u30F6\u30F5]+)(?:\[\[([^\]]+)\]\]|\[([^\]]+)\])/g,
    (_m, k) => k
  );
}

/** 비교용 표준형: 공백·물결·구두점을 걷어내고 맞춰봅니다 */
function norm(text = '') {
  return bare(text)
    .replace(/[〜~。、，,.!?！？「」『』()（）\s]/g, '')
    .toLowerCase();
}

/** 회차 하나에서 비교 대상이 될 항목들을 뽑아냅니다 */
function harvest(ep) {
  const words = [];
  const sentences = [];

  for (const g of ep.wordGroups ?? []) {
    for (const it of g.items ?? []) {
      words.push({ raw: it.jp, key: norm(it.jp), mean: it.mean, group: g.label });
    }
  }
  for (const l of ep.scene ?? []) {
    sentences.push({ raw: l.jp, key: norm(l.jp), where: 'SCENE' });
  }
  for (const a of ep.apply ?? []) {
    sentences.push({ raw: a.jp, key: norm(a.jp), where: 'APPLY' });
  }
  for (const cm of ep.compare ?? []) {
    if (cm.good?.jp) sentences.push({ raw: cm.good.jp, key: norm(cm.good.jp), where: 'CHECK' });
  }
  return { words, sentences };
}

/** 텍스트에 들어 있는 모든 필드를 재귀적으로 훑습니다 */
function* strings(node) {
  if (typeof node === 'string') yield node;
  else if (Array.isArray(node)) for (const v of node) yield* strings(v);
  else if (node && typeof node === 'object') for (const v of Object.values(node)) yield* strings(v);
}

// ─────────────────────────────────────────────

const filter = process.argv[2];

const files = (await readdir(DIR))
  .filter((f) => f.endsWith('.yaml'))
  .sort();

const episodes = [];
for (const f of files) {
  const raw = await readFile(path.join(DIR, f), 'utf8');
  try {
    const data = yaml.load(raw);
    episodes.push({ file: f, slug: f.replace(/\.yaml$/, ''), data });
  } catch (e) {
    console.log(c.red(`\n✗ ${f} — YAML 문법 오류`));
    console.log(c.dim(`  ${e.message.split('\n')[0]}`));
    process.exit(1);
  }
}

episodes.sort((a, b) => (a.data.no ?? 0) - (b.data.no ?? 0));

let problems = 0;
let notes = 0;

// ── 전체 형식 점검 ──
const seenNo = new Map();
for (const ep of episodes) {
  if (ep.data.no == null) {
    console.log(c.red(`✗ ${ep.file} — no: 가 없습니다`));
    problems++;
    continue;
  }
  if (seenNo.has(ep.data.no)) {
    console.log(c.red(`✗ 회차 번호 ${ep.data.no} 중복 — ${seenNo.get(ep.data.no)} / ${ep.file}`));
    problems++;
  }
  seenNo.set(ep.data.no, ep.file);
}

// ── 회차별 점검 ──
const past = { words: new Map(), sentences: new Map() };

for (const ep of episodes) {
  const target = !filter || ep.slug.startsWith(filter);
  const { words, sentences } = harvest(ep.data);
  const label = `#${String(ep.data.no).padStart(3, '0')} ${ep.slug}`;
  const lines = [];

  if (target) {
    // ① 중복
    for (const w of words) {
      const prev = past.words.get(w.key);
      if (prev) {
        lines.push(
          c.yellow('  중복 단어  ') +
            `${w.raw}` +
            c.dim(`  ← #${String(prev.no).padStart(3, '0')} 에서 이미 다뤘어요 (${prev.mean})`)
        );
        notes++;
      }
    }
    for (const s of sentences) {
      const prev = past.sentences.get(s.key);
      if (prev) {
        lines.push(
          c.yellow('  중복 문장  ') +
            `${bare(s.raw)}` +
            c.dim(`  ← #${String(prev.no).padStart(3, '0')} ${prev.where}`)
        );
        notes++;
      }
    }

    // 같은 회차 안에서의 중복
    const inside = new Map();
    for (const w of words) {
      if (inside.has(w.key)) {
        lines.push(c.yellow('  회차 내 중복') + `  ${w.raw}` + c.dim('  같은 회차에 두 번 나옵니다'));
        notes++;
      }
      inside.set(w.key, true);
    }

    // ② 획순 데이터 누락
    const need = new Set();
    for (const k of ep.data.kanjiPractice ?? []) {
      for (const ch of String(k.w)) if (KANJI_RE.test(ch)) need.add(ch);
    }
    for (const ch of need) {
      const file = path.join(KANJI_DIR, `${ch.codePointAt(0).toString(16).padStart(4, '0')}.json`);
      if (!existsSync(file)) {
        lines.push(
          c.red('  획순 없음  ') +
            `${ch}` +
            c.dim(`  → node scripts/add-kanji.mjs ${ch}`)
        );
        problems++;
      }
    }

    // ③ 발음 위험
    const flagged = new Set();
    for (const text of strings(ep.data)) {
      SINGLE_RE.lastIndex = 0;
      let m;
      while ((m = SINGLE_RE.exec(text))) {
        const kanji = m[1];
        const hit = RISKY[kanji] ?? (kanji.length === 1 ? RISKY[kanji] : null);
        if (hit && !flagged.has(kanji)) {
          flagged.add(kanji);
          lines.push(
            c.cyan('  발음 확인  ') +
              `${kanji}[${m[2]}]` +
              c.dim(`  읽기가 여럿이에요 (${hit}). 틀리게 들리면 ${kanji}[[${m[2]}]] 로 바꾸세요`)
          );
          notes++;
        }
      }
    }

    // ④ 내용 형식
    for (const [i, q] of (ep.data.quiz ?? []).entries()) {
      const right = (q.options ?? []).filter((o) => o.correct).length;
      if (right !== 1) {
        lines.push(c.red('  퀴즈 정답  ') + `Q${i + 1} 의 정답이 ${right}개입니다 (1개여야 해요)`);
        problems++;
      }
    }
    if (!ep.data.scene?.length) { lines.push(c.dim('  SCENE 이 비어 있어요')); notes++; }
    if (!ep.data.quiz?.length) { lines.push(c.dim('  QUIZ 가 비어 있어요')); notes++; }

    const draft = ep.data.draft ? c.dim(' (draft)') : '';
    if (lines.length) {
      console.log(`\n${c.bold(label)}${draft}`);
      lines.forEach((l) => console.log(l));
    } else {
      console.log(`\n${c.bold(label)}${draft}  ${c.green('문제 없음')}`);
    }
  }

  // 다음 회차 비교를 위해 누적 (draft 도 포함합니다)
  for (const w of words) {
    if (!past.words.has(w.key)) past.words.set(w.key, { no: ep.data.no, mean: w.mean });
  }
  for (const s of sentences) {
    if (!past.sentences.has(s.key)) past.sentences.set(s.key, { no: ep.data.no, where: s.where });
  }
}

// ── 요약 ──
console.log('');
console.log(c.dim('─'.repeat(52)));
if (problems === 0 && notes === 0) {
  console.log(c.green('점검 완료 — 고칠 것이 없습니다'));
} else {
  const p = problems ? c.red(`고쳐야 할 것 ${problems}건`) : c.green('고쳐야 할 것 없음');
  const n = notes ? c.yellow(`확인해볼 것 ${notes}건`) : '확인할 것 없음';
  console.log(`${p} · ${n}`);
  if (notes) console.log(c.dim('확인 항목은 일부러 그런 것이면 넘어가도 됩니다 (복습용 반복 등)'));
}
console.log(c.dim(`회차 ${episodes.length}개 · 누적 단어 ${past.words.size}개`));
