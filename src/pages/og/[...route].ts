import { OGImageRoute } from 'astro-og-canvas';
import { getListed } from '../../lib/episodes';
import { toKanji } from '../../lib/furigana';

const episodes = await getListed();

const pages = Object.fromEntries(
  episodes.map((ep) => [
    ep.id,
    {
      title: toKanji(ep.data.title),
      description: `#${String(ep.data.no).padStart(3, '0')} · ${ep.data.subtitle}`,
    },
  ])
);

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[6, 7, 10], [16, 18, 24]],
    border: { color: [53, 200, 181], width: 14, side: 'inline-start' },
    padding: 72,
    /**
     * families 를 지정하지 않으면 기본값이 'Noto Sans' 라서
     * 두 번째 폰트가 무시되고 한글이 빈 네모로 나옵니다.
     */
    font: {
      title: {
        size: 58, weight: 'Bold', color: [245, 239, 226], lineHeight: 1.35,
        families: ['Noto Sans JP', 'Noto Sans KR'],
      },
      description: {
        size: 28, weight: 'Normal', color: [150, 150, 160], lineHeight: 1.5,
        families: ['Noto Sans KR', 'Noto Sans JP'],
      },
    },
    /** CanvasKit 은 TTF/OTF 만 읽습니다. woff2 는 못 써요. */
    fonts: [
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf',
    ],
  }),
});