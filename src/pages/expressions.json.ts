/**
 * 표현 목록 (빌드할 때 만들어지는 정적 JSON)
 * -------------------------------------------------------------
 * 「다시 만나기」가 이걸 받아 복습 문항을 만듭니다.
 *
 * 문항은 회차 데이터에서 자동으로 나옵니다.
 *   시간 맥락  ← memoryScene
 *   질문       ← 대화에 나왔던 문장에서 그 표현만 빈칸으로
 *   정답       ← 빈칸에 들어갈 부분
 *
 * 본문에서 밑줄이 그어진 곳이 그대로 빈칸이 되므로,
 * "읽을 때 본 것" 과 "나중에 물어보는 것" 이 어긋나지 않습니다.
 */
import type { APIRoute } from 'astro';
import { getListed } from '../lib/episodes';
import { toChunks, toRubyCloze, toRuby, toKanji } from '../lib/furigana';
import { createRegistryIndex, loadExpressionRegistry } from '../lib/content/expression-registry';
import type { ExpressionId } from '../lib/learning/types';

export const GET: APIRoute = async () => {
  const episodes = await getListed();
  const registry = createRegistryIndex(await loadExpressionRegistry());

  const out = episodes.flatMap((ep) => {
    const d = ep.data;
    return d.keyPoints.map((kp) => {
      const expressionId = kp.id as ExpressionId;
      const registryEntry = registry.active[expressionId] ?? registry.retired[expressionId];
      const line = kp.sceneIndex == null ? undefined : d.scene[kp.sceneIndex];
      const cloze = line
        ? toRubyCloze(line.jp, [toChunks(kp.jp)])
        : { html: '', answer: '' };

      return {
        id: kp.id,
        // 정답으로 보여줄 것
        jp: toRuby(kp.jp),
        plain: toKanji(kp.jp),
        kr: kp.kr,
        note: kp.note ?? '',

        /**
         * 문항 — 한국어로 상황을 주고 일본어를 떠올리게 합니다.
         * memoryScene 은 화면에 내보내지 않습니다. 대신 그 회차의 부제를
         * "지난번에 만난 자리" 를 알려주는 한 줄로 씁니다.
         */
        ask: line ? line.kr : kp.kr,
        // 정답을 본 뒤 함께 보여줄 원문
        sentence: line ? toRuby(line.jp) : '',
        sentenceKr: line?.kr ?? '',
        // 빈칸형이 필요할 때를 위해 남겨둡니다 (지금 화면에서는 쓰지 않아요)
        cloze: cloze.html,
        answer: cloze.answer,

        // 어디서 왔는지
        emoji: d.emoji,
        // 장면 태그 (tags 의 1번째 자리). 골라 풀기 필터에 씁니다.
        tag: d.tags[0] ?? '',
        no: d.no,
        season: d.season,
        slug: ep.id,
        subtitle: d.subtitle,
        registry: registryEntry ? {
          canonical: registryEntry.canonical,
          display: registryEntry.display,
          aliases: registryEntry.aliases,
          status: registryEntry.status,
          active: Boolean(registry.active[expressionId]),
        } : null,
      };
    });
  });

  return new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
