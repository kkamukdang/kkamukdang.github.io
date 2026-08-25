import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { toKanji, toKana, toPlain, toParts } from '../lib/furigana';

const norm = (s: string) =>
  s.replace(/[\s、。，．！？!?「」『』()（）·・…~〜\-]/g, '').toLowerCase();

export const GET: APIRoute = async () => {
  const episodes = (await getCollection('episodes', ({ data }) => !data.draft))
    .sort((a, b) => b.data.no - a.data.no);

  const docs = episodes.map((ep) => {
    const d = ep.data;
    const entry = (jp: string, mean: string, kind: string) => ({
        p: toParts(jp).map((x) => (x.r ? [x.t, x.r] : [x.t])),
        mean,
        kind,
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
      q: norm(toKanji(d.title) + toKana(d.title) + d.subtitle + d.tags.join('')),
      entries,
    };
  });

  return new Response(JSON.stringify(docs), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};