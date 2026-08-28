/** 사이트 전체에서 쓰는 값. 바꿀 일이 있으면 이 파일만 고치면 됩니다. */
export const SITE = {
  name: '까먹당',
  tagline: '잘 까먹는 사람들의 일본어 모임',
  description:
    '매주 목요일 일상에서 꼭 쓸 일본어 한 문장씩',

  /** 메일리 구독 페이지 주소로 바꿔주세요. */
  subscribeUrl: 'https://maily.so/kkamukdang',
  subscribeNote: '주 1회 · 언제든 탈당 가능 · 회비 없음',

  email: 'kkamukdang@gmail.com',

  /** 저작권 표기에 쓰는 시작 연도 */
  since: 2026,

  /**
   * 회차 본문 아래에도 구독 카드를 넣을지.
   * false 로 두면 목록 페이지에만 나옵니다.
   */
  subscribeOnEpisodes: true,
  subscribeOnHome: false, 
} as const;

/**
 * 저장소 이름이 붙는 주소(아이디.github.io/저장소)에서도 링크가 깨지지 않도록
 * 모든 내부 링크는 이 함수를 거칩니다.
 */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
