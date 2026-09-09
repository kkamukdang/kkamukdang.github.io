/**
 * 검색 색인 (빌드할 때 만들어지는 정적 JSON)
 * -------------------------------------------------------------
 * 왜 직접 만드나
 *   Pagefind 는 "단어" 단위로 찾습니다. 영어라면 띄어쓰기로 단어가 나뉘지만
 *   일본어·한국어는 그렇지 않아서, もちかえり 안의 かえ 를 찾지 못했어요.
 *   또 색인용으로 숨겨둔 가나가 발췌문에 그대로 나와 지저분했고요.
 *
 * 그래서 회차 데이터를 항목별로 정리해 내보내고, 브라우저에서 부분 일치로 찾습니다.
 * 한자로도 가나로도 한국어 뜻으로도 걸리고, 화면에는 항상 한자 원문을 보여줍니다.
 *
 * 크기는 회차당 2KB 안팎이라 100회차라도 200KB 수준이에요.
 */
import type { APIRoute } from 'astro';
import { getListed } from '../lib/episodes';
import { toKanji, toKana, toPlain, toParts } from '../lib/furigana';

/** 검색용 표준형: 공백·구두점을 걷어내고 소문자로 */
const norm = (s: string) =>
  s.replace(/[\s、。，．！？!?「」『』()（）·・…~〜\-]/g, '').toLowerCase();

export const GET: APIRoute = async () => {
  const episodes = (await getListed()).reverse();

  const docs = episodes.map((ep) => {
    const d = ep.data;

    /** 검색 항목 하나: 화면에 보여줄 원문 + 찾을 때 쓸 여러 표기 */
    const entry = (jp: string, mean: string, kind: string) => ({
      /**
       * 덩어리 목록. 한자에는 읽는 법이 붙어 있습니다.
       *   [{t:'配達', r:'はいたつ'}, {t:'で'}, {t:'お'}, {t:'願', r:'ねが'}, ...]
       *
       * 이 형태로 넘겨야 "はいたつ 로 찾았을 때 配達 만 칠하기" 가 됩니다.
       * 예전처럼 문장 전체의 가나를 화면에 띄울 필요가 없어요.
       */
      p: toParts(jp).map((x) => (x.r ? [x.t, x.r] : [x.t])),
      mean,                            // 한국어 뜻·번역
      kind,
      // 찾을 때 대조할 문자열 (한자 + 가나 + 뜻)
      q: norm(toKanji(jp) + toKana(jp) + toPlain(jp) + mean),
    });

    const entries = [
      ...d.wordGroups.flatMap((g) => g.items.map((i) => entry(i.jp, i.mean, '단어'))),
      ...d.scene.map((l) => entry(l.jp, l.kr, '대화')),
      ...d.compare.map((c) => entry(c.good.jp, c.tip.replace(/<[^>]+>/g, ''), '비교')),
      ...d.apply.map((a) => entry(a.jp, a.kr, '응용')),
    ];

    return {
      url: `/ep/${ep.id}/`,
      no: d.no,
      p: toParts(d.title).map((x) => (x.r ? [x.t, x.r] : [x.t])),
      subtitle: d.subtitle,
      tags: d.tags,
      // 회차 자체가 걸리게 하는 문자열 (제목·부제·태그)
      // 장면 태그와 기억 장면도 검색으로 찾을 수 있게 합니다 (화면에는 안 나와요)
      q: norm(
        toKanji(d.title) + toKana(d.title) + d.subtitle +
        d.tags.join('') + (d.memoryScene ?? '')
      ),
      entries,
    };
  });

  return new Response(JSON.stringify(docs), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
