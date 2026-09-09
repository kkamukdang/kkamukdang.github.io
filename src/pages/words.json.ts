/**
 * 단어 목록 (빌드할 때 만들어지는 정적 JSON)
 * -------------------------------------------------------------
 * 「단어 카드」가 이걸 받아 씁니다.
 *
 * 「다시 만나기」와 방향이 반대입니다.
 *   다시 만나기 : 한국어 상황 → 일본어를 떠올림 (말하기)
 *   단어 카드   : 일본어 → 뜻을 확인          (뜻 확인)
 *
 * 다루는 것도 달라요. 1층은 회차당 3개(표현)만, 여기는 단어·문법 전부입니다.
 */
import type { APIRoute } from 'astro';
import { getListed } from '../lib/episodes';
import { toRuby, toPlain, toKanji } from '../lib/furigana';

export const GET: APIRoute = async () => {
  const episodes = await getListed();

  const out = episodes.flatMap((ep) => {
    const d = ep.data;
    return d.wordGroups.flatMap((g) =>
      g.items.map((it) => ({
        jp: toRuby(it.jp),                    // 앞면 — 후리가나가 붙은 일본어
        speak: toPlain(it.speak ?? it.jp),    // 발음
        key: toKanji(it.jp),
        mean: it.mean,                        // 뒷면 — 뜻
        note: it.note ?? '',                  //        보충 설명
        group: g.label,
        no: d.no,
        season: d.season,
        emoji: d.emoji,
        subtitle: d.subtitle,
        slug: ep.id,
      }))
    );
  });

  return new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
