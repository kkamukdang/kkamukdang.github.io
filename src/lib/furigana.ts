/**
 * 후리가나 단축 표기 파서
 * -------------------------------------------------------------
 * 원고에는 이렇게 한 번만 씁니다.
 *
 *   今夜[こんや]チキン頼[たの]んでもいい?
 *
 * 여기서 두 가지를 자동으로 만들어냅니다.
 *   toRuby()  → <ruby>今夜<rt>こんや</rt></ruby>チキン…   (화면용)
 *   toPlain() → 今夜チキン頼んでもいい?                   (음성·검색용)
 *
 * 같은 문장을 두 번 적지 않으므로 둘이 어긋날 일이 없습니다.
 *
 * ── 대괄호 두 개 = 읽는 법 강제 ──────────────────
 * 음성 합성기가 한자를 엉뚱하게 읽을 때가 있습니다.
 * 예) ダイエット中[ちゅう] → "なか" 로 잘못 읽힘
 *
 * 이럴 때만 대괄호를 두 개로 감싸면, 화면에는 한자를 그대로 두고
 * 음성에는 가나를 넘겨줍니다.
 *
 *   ダイエット中[[ちゅう]]じゃなかった?
 *     화면 → ダイエット中(ちゅう)          ← 보이는 건 똑같습니다
 *     음성 → ダイエットちゅうじゃなかった?   ← 정확하게 읽습니다
 *
 * 평소에는 대괄호 하나면 충분하고, 발음이 틀릴 때만 두 개로 바꾸세요.
 */

// 한자 + 반복기호(々) + 카타카나 장음 보조기호
const KANJI = '\\u4E00-\\u9FFF\\u3005\\u30F6\\u30F5';

/**
 * 대괄호 하나와 두 개를 한 번에 잡습니다.
 *   그룹1 = 한자 / 그룹2 = [[강제]] 안의 가나 / 그룹3 = [보통] 안의 가나
 */
const PATTERN = new RegExp(
  `([${KANJI}]+)(?:\\[\\[([^\\]]+)\\]\\]|\\[([^\\]]+)\\])`,
  'g'
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ruby(kanji: string, kana: string): string {
  return `<ruby>${kanji}<rt>${kana}</rt></ruby>`;
}

/** 화면에 보여줄 ruby HTML. rt 는 검색 인덱스에서 제외합니다. */
export function toRuby(text: string): string {
  if (!text) return '';
  return escapeHtml(text).replace(PATTERN, (_m, kanji, forced, normal) =>
    ruby(kanji, forced ?? normal)
  );
}

/**
 * 설명문용. 후리가나 표기는 바꿔주되 <b>, <br> 같은 인라인 태그는 살려둡니다.
 * 원고에 직접 쓰는 내용에만 사용하세요.
 */
export function toRubyRich(text: string): string {
  if (!text) return '';
  return text.replace(PATTERN, (_m, kanji, forced, normal) =>
    ruby(kanji, forced ?? normal)
  );
}

/**
 * 음성 합성과 검색 인덱스에 쓸 텍스트.
 * 대괄호 하나 → 한자 그대로 / 대괄호 두 개 → 가나로 바꿔서 넘깁니다.
 */
export function toPlain(text: string): string {
  if (!text) return '';
  return text.replace(PATTERN, (_m, kanji, forced) => forced ?? kanji);
}

/** 읽는 법만 이어붙인 가나 표기. */
export function toKana(text: string): string {
  if (!text) return '';
  return text.replace(PATTERN, (_m, _kanji, forced, normal) => forced ?? normal);
}

/** 순수 한자 표기 (강제 표기도 한자로 되돌립니다). 목록·단어장 키에 씁니다. */
export function toKanji(text: string): string {
  if (!text) return '';
  return text.replace(PATTERN, (_m, kanji) => kanji);
}

/** 문자열에 등장하는 한자를 중복 없이 뽑아냅니다. */
export function extractKanji(text: string): string[] {
  const found = toKanji(text).match(new RegExp(`[${KANJI}]`, 'g')) ?? [];
  return [...new Set(found)];
}

/**
 * 문장을 "덩어리" 목록으로 쪼갭니다.
 *   今夜[こんや]チキン  →  [{t:'今夜', r:'こんや'}, {t:'チ'}, {t:'キ'}, {t:'ン'}]
 *
 * 한자 덩어리는 읽는 법을 함께 들고 있고, 나머지는 글자 하나씩입니다.
 * 검색에서 "はいたつ 로 찾았을 때 配達 만 칠하기" 같은 일을 하려면
 * 어느 읽기가 어느 한자에 붙는지 알아야 해서 이렇게 나눠둡니다.
 */
export function toParts(text: string): { t: string; r?: string }[] {
  const parts: { t: string; r?: string }[] = [];
  if (!text) return parts;

  let last = 0;
  const re = new RegExp(PATTERN.source, 'g');
  let m: RegExpExecArray | null;

  const pushPlain = (chunk: string) => {
    for (const ch of chunk) parts.push({ t: ch });
  };

  while ((m = re.exec(text))) {
    pushPlain(text.slice(last, m.index));
    parts.push({ t: m[1], r: m[2] ?? m[3] });
    last = m.index + m[0].length;
  }
  pushPlain(text.slice(last));
  return parts;
}

/**
 * 표현 표제를 "찾을 조각" 목록으로 나눕니다.
 *   〜てもいい?            → ['てもいい']
 *   また〜から              → ['また', 'から']
 *   Aじゃなくて Bになってる  → ['じゃなくて', 'になってる']
 *
 * 물결·A/B·공백에서 끊습니다. 밑줄은 조각이 **전부, 순서대로** 있는
 * 문장에만 그어져요. また 만 있는 문장이 걸리지 않게 하려는 것입니다.
 */
export function toChunks(label: string): string[] {
  const plain = toKanji(label).replace(/[?？!！。、]/g, '');
  const chunks = plain
    .split(/[〜~ABＡＢ\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return chunks.length ? chunks : [plain].filter((t) => t.length >= 2);
}

/** 탁음 차이를 눈감아 줍니다. 頼んでもいい 의 で 는 てもいい 의 て 예요. */
const VOICED: Record<string, string> = {
  て: 'で', で: 'て', た: 'だ', だ: 'た',
  か: 'が', が: 'か', こ: 'ご', ご: 'こ',
};

function matchAt(flat: string, chunk: string, from: number): [number, number] | null {
  // ① 그대로 찾기
  let at = flat.indexOf(chunk, from);
  if (at >= 0) return [at, chunk.length];

  // ② 첫 글자의 탁음만 바꿔 찾기 (てもいい ↔ でもいい)
  const head = VOICED[chunk[0]];
  if (head) {
    const swapped = head + chunk.slice(1);
    at = flat.indexOf(swapped, from);
    if (at >= 0) return [at, swapped.length];
  }

  // ③ 어미가 활용된 경우, 끝에서 한두 글자를 덜어내고 어간으로 찾습니다.
  //    찾은 뒤에는 뒤따르는 활용 어미까지 밑줄에 포함시켜요 (助か → 助かった).
  for (let cut = 1; cut <= 2; cut++) {
    const stem = chunk.slice(0, -cut);
    if (stem.length < 2) break;
    at = flat.indexOf(stem, from);
    if (at >= 0) return [at, stem.length + tailLength(flat, at + stem.length)];
  }
  return null;
}

/** 활용 어미로 자주 오는 글자들. 여기 있는 동안만 밑줄을 늘립니다. */
const TAIL = new Set('っただてでているらりれろないんましょ'.split(''));

function tailLength(flat: string, from: number): number {
  let n = 0;
  while (n < 3 && TAIL.has(flat[from + n] ?? '')) n++;
  return n;
}

/**
 * 문장을 ruby 로 그리되, 조각이 전부 순서대로 들어 있으면 그 부분에 밑줄을 답니다.
 * 한자 덩어리 단위로 칠하므로 후리가나가 깨지지 않아요.
 *
 * specs 는 표현 하나당 조각 목록 하나입니다. (toChunks 의 결과)
 */
export function toRubyMarked(text: string, specs: string[][]): string {
  const parts = toParts(text);
  if (!parts.length) return '';

  const chars: string[] = [];
  const owner: number[] = [];
  parts.forEach((p, i) => {
    for (const ch of p.t) {
      chars.push(ch);
      owner.push(i);
    }
  });
  const flat = chars.join('');

  const marked = new Set<number>();
  for (const chunks of specs) {
    if (!chunks?.length) continue;

    // 조각을 순서대로 찾습니다. 하나라도 없으면 이 문장은 건너뜁니다.
    const hits: [number, number][] = [];
    let cursor = 0;
    let ok = true;
    for (const chunk of chunks) {
      const found = matchAt(flat, chunk, cursor);
      if (!found) { ok = false; break; }
      hits.push(found);
      cursor = found[0] + found[1];
    }
    if (!ok) continue;
    for (const [at, len] of hits) {
      for (let k = at; k < at + len; k++) marked.add(owner[k]);
    }
  }

  let out = '';
  let open = false;
  parts.forEach((p, i) => {
    const on = marked.has(i);
    if (on && !open) { out += '<mark class="key">'; open = true; }
    if (!on && open) { out += '</mark>'; open = false; }
    out += p.r
      ? `<ruby>${p.t}<rt>${p.r}</rt></ruby>`
      : p.t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
  return out + (open ? '</mark>' : '');
}

/**
 * 문장에서 표현에 해당하는 부분을 빈칸으로 만듭니다.
 *   今夜チキン頼んでもいい?  →  今夜チキン頼ん______?   (정답: でもいい)
 *
 * 밑줄 긋기와 같은 규칙으로 찾으므로, 본문에서 밑줄이 그어진 곳이
 * 그대로 빈칸이 됩니다. 후리가나는 유지돼요.
 */
export function toRubyCloze(
  text: string,
  specs: string[][]
): { html: string; answer: string } {
  const parts = toParts(text);
  if (!parts.length) return { html: '', answer: '' };

  const chars: string[] = [];
  const owner: number[] = [];
  parts.forEach((p, i) => {
    for (const ch of p.t) {
      chars.push(ch);
      owner.push(i);
    }
  });
  const flat = chars.join('');

  const hidden = new Set<number>();
  for (const chunks of specs) {
    if (!chunks?.length) continue;
    const hits: [number, number][] = [];
    let cursor = 0;
    let ok = true;
    for (const chunk of chunks) {
      const found = matchAt(flat, chunk, cursor);
      if (!found) { ok = false; break; }
      hits.push(found);
      cursor = found[0] + found[1];
    }
    if (!ok) continue;
    for (const [at, len] of hits) {
      for (let k = at; k < at + len; k++) hidden.add(owner[k]);
    }
  }

  // 찾지 못했으면 빈칸 없이 문장만 돌려줍니다 (문제로 내지 않습니다).
  if (hidden.size === 0) return { html: '', answer: '' };

  let html = '';
  let answer = '';
  let blankOpen = false;
  parts.forEach((p, i) => {
    if (hidden.has(i)) {
      answer += p.t;
      if (!blankOpen) { html += '<span class="cloze-blank">______</span>'; blankOpen = true; }
      return;
    }
    blankOpen = false;
    html += p.r
      ? `<ruby>${p.t}<rt>${p.r}</rt></ruby>`
      : p.t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
  return { html, answer };
}

/** 한자 한 글자 → 획순 데이터 파일 이름 (예: 注 → 6ce8) */
export function kanjiFileName(ch: string): string {
  return ch.codePointAt(0)!.toString(16).padStart(4, '0');
}
