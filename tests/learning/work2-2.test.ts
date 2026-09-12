import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createLearningClient,
  reviewableExpressions,
  stampSummary,
  type BrowserExpression,
  type BrowserReviewPrompt,
} from '../../src/lib/client/learning-client';
import { buildReviewScreenModel, reviewInstruction } from '../../src/lib/client/review-flow';
import { STORAGE_KEYS } from '../../src/lib/learning/local-storage';
import { markReviewFlowAnswered } from '../../src/lib/learning/queue';
import { createEmptyState } from '../../src/lib/learning/state';
import type { ExpressionId, ExpressionStateV2, ReviewStage } from '../../src/lib/learning/types';
import { MemoryStorage } from '../helpers';

const NOW = '2026-09-10T03:00:00.000Z';
const TODAY = '2026-09-10' as const;
const ids = [
  's01e01-temoii',
  's01e01-gaman',
  's01e01-baiiyo',
  's01e02-natteru',
  's01e02-moraeba',
] as ExpressionId[];

function prompt(id: ExpressionId, stage: ReviewStage): BrowserReviewPrompt {
  return {
    id: `${id}:${stage}`,
    stage,
    mode: stage === 'R1' ? 'scene' : 'cued-recall',
    cue: `${stage} cue`,
    answer: `${stage} answer`,
    answerHtml: `${stage} answer`,
    source: stage === 'R1' ? 'scene' : stage === 'R2' ? 'apply' : 'reviewPrompt.R3',
    ...(stage === 'R1' ? {
      memoryScene: '밤 11시 + 치킨',
      memoryCue: { asset: '/characters/memory/cue.svg', alt: '밤 11시에 치킨을 바라보는 장면입니다' },
      scene: { who: '나', kr: '치킨 시켜도 될까?', jpHtml: 'チキン頼んでもいい?' },
    } : {}),
  };
}

function expression(id: ExpressionId, active = true): BrowserExpression {
  const no = Number(id.slice(4, 6));
  return {
    id,
    jp: id,
    kr: id,
    emoji: '🍗',
    no,
    season: 1,
    slug: `${String(no).padStart(3, '0')}-fixture`,
    registry: { active },
    prompts: {
      R1: prompt(id, 'R1'),
      R2: prompt(id, 'R2'),
      R3: prompt(id, 'R3'),
    },
  };
}

function due(reviewStage: ReviewStage = 'R1'): ExpressionStateV2 {
  return {
    registeredAt: NOW,
    registeredSource: 'episode',
    reviewStage,
    rememberStreak: reviewStage === 'R1' ? 0 : reviewStage === 'R2' ? 1 : 2,
    lastRating: null,
    cueBoost: 0,
    graduated: false,
    nextReviewDate: TODAY,
  };
}

function storageWith(idsToRegister = ids): MemoryStorage {
  const storage = new MemoryStorage();
  const state = createEmptyState(NOW);
  idsToRegister.forEach((id) => { state.expressions[id] = due(); });
  storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
  return storage;
}

describe('Work 2-2 reviewFlow 화면 계약', () => {
  it('active + due만 사용하고 retired를 제외하며 daily batch를 3개로 제한한다', () => {
    const catalog = [...ids.map((id) => expression(id)), expression('s01e03-retired', false)];
    const storage = storageWith([...ids, 's01e03-retired']);
    const client = createLearningClient(storage, reviewableExpressions(catalog), () => new Date(NOW));
    const result = client.service.getOrCreateReviewFlow(TODAY, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flow.batches[0].expressionIds).toHaveLength(3);
    expect(result.flow.batches[0].expressionIds).toEqual(ids.slice(0, 3));
    expect(result.flow.batches[0].expressionIds).not.toContain('s01e03-retired');
  });

  it('active batch 완료 전 extra를 만들지 않고 같은 날짜 flow를 복원한다', () => {
    const catalog = ids.map((id) => expression(id));
    const storage = storageWith();
    const first = createLearningClient(storage, reviewableExpressions(catalog), () => new Date(NOW));
    const flow = first.service.getOrCreateReviewFlow(TODAY, NOW);
    expect(flow.ok).toBe(true);
    if (!flow.ok) return;
    const gated = first.service.createExtraBatch(TODAY, NOW);
    expect(gated.ok && gated.state.reviewFlow?.batches).toHaveLength(1);

    const firstId = flow.flow.batches[0].expressionIds[0];
    const partial = markReviewFlowAnswered(flow.state, firstId, NOW);
    storage.setItem(STORAGE_KEYS.state, JSON.stringify({ ...partial, revision: partial.revision + 1 }));

    let refreshed = createLearningClient(storage, reviewableExpressions(catalog), () => new Date(NOW));
    let restored = refreshed.service.getOrCreateReviewFlow(TODAY, '2026-09-10T04:00:00.000Z');
    expect(restored.ok && restored.flow).toEqual(partial.reviewFlow);
    if (!restored.ok) return;
    const restoredModel = buildReviewScreenModel(restored.state, refreshed.byId);
    expect(restoredModel.kind === 'question' && restoredModel.expression.id).not.toBe(firstId);
    expect(restoredModel.kind === 'question' && restoredModel.current).toBe(2);

    let completed = partial;
    flow.flow.batches[0].expressionIds.slice(1).forEach((id) => {
      completed = markReviewFlowAnswered(completed, id, NOW);
    });
    storage.setItem(STORAGE_KEYS.state, JSON.stringify({ ...completed, revision: completed.revision + 1 }));

    refreshed = createLearningClient(storage, reviewableExpressions(catalog), () => new Date(NOW));
    restored = refreshed.service.getOrCreateReviewFlow(TODAY, '2026-09-10T04:00:00.000Z');
    expect(restored.ok && restored.flow).toEqual(completed.reviewFlow);
    const extra = refreshed.service.createExtraBatch(TODAY, '2026-09-10T04:00:00.000Z');
    expect(extra.ok && extra.flow.batches).toHaveLength(2);
  });

  it.each(['R1', 'R2', 'R3'] as const)('%s 상태에 해당하는 resolver 결과만 화면 모델로 선택한다', (stage) => {
    const id = ids[0];
    const state = createEmptyState(NOW);
    state.expressions[id] = due(stage);
    state.reviewFlow = {
      date: TODAY,
      activeBatchId: `${TODAY}:daily:1`,
      batches: [{ id: `${TODAY}:daily:1`, kind: 'daily', expressionIds: [id], answeredIds: [], createdAt: NOW }],
    };
    const item = expression(id);
    const model = buildReviewScreenModel(state, { [id]: item } as Record<ExpressionId, BrowserExpression>);
    expect(model.kind).toBe('question');
    if (model.kind === 'question') {
      expect(model.prompt.stage).toBe(stage);
      expect(model.prompt.source).toBe(stage === 'R1' ? 'scene' : stage === 'R2' ? 'apply' : 'reviewPrompt.R3');
    }
  });

  it('같은 표현의 R2와 R3가 서로 다른 문항과 단계 안내를 렌더한다', () => {
    const id = ids[2];
    const item = expression(id);
    const modelFor = (stage: 'R2' | 'R3') => {
      const state = createEmptyState(NOW);
      state.expressions[id] = due(stage);
      state.reviewFlow = {
        date: TODAY,
        activeBatchId: `${TODAY}:daily:1`,
        batches: [{ id: `${TODAY}:daily:1`, kind: 'daily', expressionIds: [id], answeredIds: [], createdAt: NOW }],
      };
      return buildReviewScreenModel(state, { [id]: item } as Record<ExpressionId, BrowserExpression>);
    };
    const r2 = modelFor('R2');
    const r3 = modelFor('R3');
    expect(r2.kind).toBe('question');
    expect(r3.kind).toBe('question');
    if (r2.kind !== 'question' || r3.kind !== 'question') return;
    expect(r2.prompt.source).toBe('apply');
    expect(r3.prompt.source).toBe('reviewPrompt.R3');
    expect(r2.prompt.cue).not.toBe(r3.prompt.cue);
    expect(r2.prompt.answerHtml).not.toBe(r3.prompt.answerHtml);
    expect(reviewInstruction(r2.prompt)).not.toBe(reviewInstruction(r3.prompt));
  });

  it('현재 stage와 다른 prompt는 교차 fallback하지 않는다', () => {
    const id = ids[0];
    const state = createEmptyState(NOW);
    state.expressions[id] = due('R3');
    state.reviewFlow = {
      date: TODAY,
      activeBatchId: `${TODAY}:daily:1`,
      batches: [{ id: `${TODAY}:daily:1`, kind: 'daily', expressionIds: [id], answeredIds: [], createdAt: NOW }],
    };
    const item = expression(id);
    item.prompts!.R3 = { ...item.prompts!.R2, stage: 'R2' };
    expect(() => buildReviewScreenModel(state, { [id]: item } as Record<ExpressionId, BrowserExpression>))
      .toThrow('현재 stage와 복습 문항 stage가 다름');
  });

  it('#001 Episode 완료 상태가 due 날짜의 /again/ 화면 모델로 이어진다', () => {
    const episodeIds = ids.slice(0, 3) as [ExpressionId, ExpressionId, ExpressionId];
    const catalog = episodeIds.map((id) => expression(id));
    const storage = new MemoryStorage();
    const client = createLearningClient(storage, reviewableExpressions(catalog), () => new Date('2026-09-01T03:00:00.000Z'));
    client.service.completeEpisode({
      eventId: 'complete-s01e01',
      now: '2026-09-01T03:00:00.000Z',
      episodeId: 's01e01',
      seasonId: 's01',
      expressionIds: episodeIds,
    });
    const flow = client.service.getOrCreateReviewFlow('2026-09-04', '2026-09-04T03:00:00.000Z');
    expect(flow.ok).toBe(true);
    if (!flow.ok) return;
    expect(buildReviewScreenModel(flow.state, client.byId).kind).toBe('question');
    expect(flow.state.episodes.s01e01.completed).toBe(true);
  });

  it('/again/이 v2 controller와 stage별 문항 연결을 유지한다', async () => {
    const page = await readFile('src/pages/again.astro', 'utf8');
    const controller = await readFile('src/lib/client/review-flow.ts', 'utf8');
    expect(page).toContain('data-review-v2="true"');
    expect(page).toContain('initReviewFlowPage');
    expect(page).not.toContain('window.Kkmd');
    expect(controller).toContain('getOrCreateReviewFlow');
    expect(controller).toContain("card.dataset.reviewStage = prompt.stage");
    expect(controller).toContain("card.dataset.promptSource = prompt.source");
    expect(controller).toContain('client.service.rateReview');
  });

  it('모든 공통 도장판이 v2 준비 회차와 기존 v1 회차를 같은 기준으로 합친다', async () => {
    const storage = new MemoryStorage();
    storage.setItem('kkmd:stamps:s1', JSON.stringify({ episodes: [1, 2, 3], completed: false }));
    const state = createEmptyState(NOW);
    const v2Episodes = new Set([1, 2]);
    expect([...stampSummary(storage, state, 's01', v2Episodes).completedEpisodes]).toEqual([3]);
    state.episodes.s01e01 = { completed: true, completedAt: NOW };
    expect([...stampSummary(storage, state, 's01', v2Episodes).completedEpisodes]).toEqual([1, 3]);
    storage.setItem('kkmd:stamps:s1', 'null');
    expect([...stampSummary(storage, state, 's01', v2Episodes).completedEpisodes]).toEqual([1]);

    const page = await readFile('src/pages/ep/[slug].astro', 'utf8');
    const controller = await readFile('src/lib/client/episode-learning.ts', 'utf8');
    const again = await readFile('src/lib/client/review-flow.ts', 'utf8');
    expect(page).toContain('if (v2Episodes.has(no)) return;');
    expect(controller).toContain('stampSummary(window.localStorage, state, seasonId, v2EpisodeNumbers)');
    expect(again).toContain("reviewReadyEpisodeNumbers(client?.expressions ?? [], 's01')");
  });

  it('R1은 scene 문장을 반복하지 않고 상황 회상 질문을 표시한다', async () => {
    const controller = await readFile('src/lib/client/review-flow.ts', 'utf8');
    const page = await readFile('src/pages/again.astro', 'utf8');
    expect(controller).toContain("prompt.stage === 'R1'");
    expect(controller).toContain("'이럴 때 뭐라고 했더라?'");
    expect(controller).toContain("promptText.hidden = prompt.stage === 'R1'");
    expect(controller).toContain("element<HTMLElement>('qSceneKr').textContent = prompt.scene?.kr");
    expect(page).not.toContain('id="qAnsMeaning"');
  });

  it('R2는 새로운 상황 cue와 데이터 기반 cloze를 별도 요소로 렌더한다', async () => {
    const page = await readFile('src/pages/again.astro', 'utf8');
    const controller = await readFile('src/lib/client/review-flow.ts', 'utf8');
    expect(page).toContain('id="qCloze"');
    expect(controller).toContain("cloze.innerHTML = prompt.clozeHtml ?? ''");
    expect(controller).toContain("cloze.hidden = prompt.mode !== 'cloze' || !prompt.clozeHtml");
  });
});
