import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import {
  createLearningClient,
  reviewReadyEpisodeNumbers,
  reviewableExpressions,
  stampSummary,
  type BrowserExpression,
  type BrowserReviewPrompt,
} from '../../src/lib/client/learning-client';
import { createRegistryIndex, loadExpressionRegistry } from '../../src/lib/content/expression-registry';
import type { EpisodeData } from '../../src/lib/content/episode-types';
import { isEpisodeReviewReady, resolveReviewPrompt, validateEpisodeReviewContent } from '../../src/lib/learning/review-content';
import { createEmptyState } from '../../src/lib/learning/state';
import type { ExpressionId, ExpressionStateV2, ReviewStage } from '../../src/lib/learning/types';
import { toRuby, toRubyReviewTarget } from '../../src/lib/furigana';
import { MemoryStorage } from '../helpers';

const NOW = '2026-09-10T03:00:00.000Z';
const ids = ['s01e02-natteru', 's01e02-moraeba', 's01e02-tasukaru'] as const;

function stageState(reviewStage: ReviewStage): ExpressionStateV2 {
  return {
    registeredAt: NOW,
    registeredSource: 'episode',
    reviewStage,
    rememberStreak: reviewStage === 'R1' ? 0 : reviewStage === 'R2' ? 1 : 2,
    lastRating: null,
    cueBoost: 0,
    graduated: false,
    nextReviewDate: '2026-09-10',
  };
}

function browserPrompt(id: ExpressionId, stage: ReviewStage): BrowserReviewPrompt {
  return {
    id: `${id}:${stage}`,
    stage,
    mode: stage === 'R1' ? 'scene' : 'cued-recall',
    cue: `${stage} cue`,
    answer: `${stage} answer`,
    answerHtml: `${stage} answer`,
    source: stage === 'R1' ? 'scene' : stage === 'R2' ? 'apply' : 'reviewPrompt.R3',
  };
}

function browserExpression(id: typeof ids[number]): BrowserExpression {
  return {
    id,
    jp: id,
    kr: id,
    emoji: '🛵',
    no: 2,
    season: 1,
    slug: '002-chicken-order-mistake',
    registry: { active: true },
    prompts: {
      R1: browserPrompt(id, 'R1'),
      R2: browserPrompt(id, 'R2'),
      R3: browserPrompt(id, 'R3'),
    },
  };
}

async function episode2(): Promise<EpisodeData> {
  return yaml.load(await readFile('src/data/episodes/002-chicken-order-mistake.yaml', 'utf8')) as EpisodeData;
}

describe('Work 3-2 Episode #002 콘텐츠 계약', () => {
  it('핵심 표현 3개가 published Registry와 정확히 대응하고 회차가 review-ready다', async () => {
    const episode = await episode2();
    const registry = createRegistryIndex(await loadExpressionRegistry());
    expect(episode.keyPoints.map((keyPoint) => keyPoint.id)).toEqual(ids);
    expect(validateEpisodeReviewContent(episode)).toEqual([]);
    expect(isEpisodeReviewReady(episode, registry.active)).toBe(true);
    expect(episode.keyPoints.every((keyPoint) => registry.active[keyPoint.id]?.status === 'published')).toBe(true);
  });

  it('세 표현의 R1 memory cue와 mode별 R2/R3 문항을 모두 해석한다', async () => {
    const episode = await episode2();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    for (const keyPoint of episode.keyPoints) {
      const registryEntry = registry.active[keyPoint.id]!;
      const r1 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R1') });
      const r2 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R2') });
      const r3 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R3') });
      expect(r1).toMatchObject({ source: 'scene', memoryScene: episode.memoryScene, memoryCue: keyPoint.memoryCue });
      await access(`public${keyPoint.memoryCue!.asset}`);
      expect(r2.source).toBe('reviewPrompt.R2');
      expect(r2.mode).toBe('cloze');
      expect(r2.answerHighlight).toBeTruthy();
      expect(r3.source).toBe('reviewPrompt.R3');
      expect(r3.mode).toBe('cued-recall');
      expect(r3.answerHighlight).toBeTruthy();
      expect([r2.mode, r3.mode]).not.toContain('choice');
      expect(r2.cue).not.toBe(r3.cue);
      expect(r2.answer).not.toBe(r3.answer);
      const r2Target = toRubyReviewTarget(r2.answer, r2.answerHighlight);
      expect(r2Target.answerHtml).toContain(`<strong class="q-answer-target">${toRuby(r2.answerHighlight!)}</strong>`);
      expect(r2Target.clozeHtml).toContain('<span class="cloze-blank" aria-label="빈칸">______</span>');
      if (r3.mode === 'cloze') {
        expect(r3.answerHighlight).toBeTruthy();
        expect(r3.answer).toContain(r3.answerHighlight);

        const r3Target = toRubyReviewTarget(
          r3.answer,
          r3.answerHighlight
        );

        expect(r3Target.clozeHtml).toContain('<span class="cloze-blank');
      } else {
        expect(r3.mode).toBe('cued-recall');
      }
    }
  });

  it('助かる R2가 회차 밖의 우산 상황 응용 문장으로 확장된다', async () => {
    const episode = await episode2();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e02-tasukaru')!;
    expect(episode.apply[keyPoint.applyIndex!]).toEqual({
      situation: '☔ 갑자기 비가 와서 친구에게 우산을 빌렸을 때',
      jp: '傘[かさ]を貸[か]してくれて助[たす]かった。',
      kr: '우산 빌려줘서 살았어.',
    });
    expect(keyPoint.reviewPrompt?.R2).toMatchObject({
      cue: '우산을 빌려줘서 살았어.',
      answer: '傘[かさ]を貸[か]してくれて助[たす]かった。',
      answerHighlight: '助[たす]かった',
    });
    expect(keyPoint.reviewPrompt?.R3).toMatchObject({
      cue: '“덕분에 살았다 / 큰 도움이 됐다”',
      answer: '助[たす]かった',
      answerHighlight: '助[たす]かった',
    });
  });

  it('audit 결과가 expected-gap fixture와 일치한다', () => {
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/audit-season1.mjs', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }));
    expect(result).toMatchObject({ ok: true, summary: { expectedGaps: 16, actualGaps: 16 } });
    expect(result.gaps.some((gap: { episodeId: string }) => gap.episodeId === 's01e02')).toBe(false);
  });
});

describe('Work 3-2 공통 학습 엔진 연결', () => {
  it('#002 완료와 remembered 3회의 일정·단계·졸업 전이를 공통 서비스로 처리한다', () => {
    const storage = new MemoryStorage();
    const catalog = ids.map(browserExpression);
    const learning = createLearningClient(
      storage,
      reviewableExpressions(catalog),
      () => new Date('2026-09-01T03:00:00.000Z'),
    );
    const completed = learning.service.completeEpisode({
      eventId: 'work3-2-complete',
      now: '2026-09-01T03:00:00.000Z',
      episodeId: 's01e02',
      seasonId: 's01',
      expressionIds: [...ids],
    });
    expect(completed.ok && completed.state.episodes.s01e02).toEqual({
      completed: true,
      completedAt: '2026-09-01T03:00:00.000Z',
    });
    ids.forEach((id) => expect(completed.ok && completed.state.expressions[id]).toMatchObject({
      reviewStage: 'R1', rememberStreak: 0, nextReviewDate: '2026-09-04', graduated: false,
    }));

    const expressionId = 's01e02-tasukaru';
    const r1 = learning.service.rateReview({ eventId: 'work3-2-review-r1', now: '2026-09-04T03:00:00.000Z', expressionId, rating: 'remembered', source: 'again' });
    expect(r1.ok && r1.state.expressions[expressionId]).toMatchObject({ reviewStage: 'R2', rememberStreak: 1, nextReviewDate: '2026-09-11' });
    const r2 = learning.service.rateReview({ eventId: 'work3-2-review-r2', now: '2026-09-11T03:00:00.000Z', expressionId, rating: 'remembered', source: 'again' });
    expect(r2.ok && r2.state.expressions[expressionId]).toMatchObject({ reviewStage: 'R3', rememberStreak: 2, nextReviewDate: '2026-09-25' });
    const r3 = learning.service.rateReview({ eventId: 'work3-2-review-r3', now: '2026-09-25T03:00:00.000Z', expressionId, rating: 'remembered', source: 'again' });
    expect(r3.ok && r3.state.expressions[expressionId]).toMatchObject({ reviewStage: 'R3', rememberStreak: 3, nextReviewDate: null, graduated: true });
  });

  it('review-ready 회차를 데이터로 판별하고 해당 회차의 legacy 도장을 합치지 않는다', () => {
    const catalog = ids.map(browserExpression);
    const ready = reviewReadyEpisodeNumbers(catalog, 's01');
    expect([...ready]).toEqual([2]);
    const storage = new MemoryStorage();
    storage.setItem('kkmd:stamps:s1', JSON.stringify({ episodes: [1, 2, 3] }));
    const summary = stampSummary(storage, createEmptyState(NOW), 's01', ready);
    expect([...summary.completedEpisodes]).toEqual([1, 3]);
  });

  it('Episode·카탈로그·다시 만나기 경로에 회차 번호별 구현 분기가 없다', async () => {
    const catalogRoute = await readFile('src/pages/expressions.json.ts', 'utf8');
    const episodePage = await readFile('src/pages/ep/[slug].astro', 'utf8');
    const episodeController = await readFile('src/lib/client/episode-learning.ts', 'utf8');
    const reviewController = await readFile('src/lib/client/review-flow.ts', 'utf8');
    expect(catalogRoute).toContain('isEpisodeReviewReady');
    expect(catalogRoute).not.toContain('d.no === 1');
    expect(catalogRoute).not.toContain('d.no === 2');
    expect(episodePage).toContain('data-v2-episodes');
    expect(episodePage).toContain('if (v2Episodes.has(no)) return;');
    expect(episodeController).toContain("asEpisodeId(root.dataset.episodeId ?? '')");
    expect(episodeController).not.toContain("const episodeId = 's01e01'");
    expect(reviewController).not.toContain('item.no === 1');
    expect(reviewController).not.toContain('item.no === 2');
    expect(reviewController).toContain("cloze.hidden = prompt.mode !== 'cloze' || !prompt.clozeHtml");
    expect(reviewController).toContain("return '일본어로 뭐라고 했더라?';");
  });
});
