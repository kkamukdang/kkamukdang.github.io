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
  return `<ruby>${kanji}<rt data-pagefind-ignore>${kana}</rt></ruby>`;
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

/** 한자 한 글자 → 획순 데이터 파일 이름 (예: 注 → 6ce8) */
export function kanjiFileName(ch: string): string {
  return ch.codePointAt(0)!.toString(16).padStart(4, '0');
}
