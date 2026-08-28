import { getCollection } from 'astro:content';

/**
 * 회차 가져오기
 * -------------------------------------------------------------
 * 어디에 보이느냐에 따라 규칙이 다릅니다.
 *
 *   draft: true     아직 쓰는 중  → 페이지도 안 만듭니다
 *   unlisted: true  점검용        → 페이지는 만들되 목록에는 안 나옵니다
 *
 * 개발 중(npm run dev)에는 초안도 모두 보입니다.
 * 배포판에만 규칙이 적용되니, 미리보기를 위해 draft 를 껐다 켤 필요가 없어요.
 */

/** 페이지를 만들 회차. 회차 본문·한자 쓰기가 씁니다. */
export async function getPages() {
  return (await getCollection('episodes', ({ data }) =>
    import.meta.env.DEV || !data.draft
  )).sort((a, b) => a.data.no - b.data.no);
}

/** 목록·검색·단어 카드에 내보낼 회차. unlisted 도 빠집니다. */
export async function getListed() {
  return (await getCollection('episodes', ({ data }) =>
    import.meta.env.DEV || (!data.draft && !data.unlisted)
  )).sort((a, b) => a.data.no - b.data.no);
}