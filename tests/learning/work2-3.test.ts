import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createLearningClient,
  reviewableExpressions,
  type BrowserExpression,
  type BrowserReviewPrompt,
} from '../../src/lib/client/learning-client';
import {
  buildReviewScreenModel,
  graduatedExpressionCount,
  makeReactivationEventId,
  makeReviewEventId,
  reviewFeedback,
} from '../../src/lib/client/review-flow';
import { STORAGE_KEYS } from '../../src/lib/learning/local-storage';
import { selectDueExpressions } from '../../src/lib/learning/queue';
import { createEmptyState } from '../../src/lib/learning/state';
import type { ExpressionId, ExpressionStateV2, LearningStateV2, ReviewStage } from '../../src/lib/learning/types';
import { MemoryStorage } from '../helpers';

const NOW = '2026-09-10T03:00:00.000Z';
const TODAY = '2026-09-10' as const;
const ids = ['s01e01-temoii', 's01e01-gaman', 's01e01-baiiyo'] as ExpressionId[];

function prompt(id: ExpressionId, stage: ReviewStage): BrowserReviewPrompt {
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

function expression(id: ExpressionId): BrowserExpression {
  return {
    id,
    jp: id,
    kr: id,
    emoji: '🌙',
    no: 1,
    season: 1,
    slug: '001-fixture',
    registry: { active: true },
    prompts: { R1: prompt(id, 'R1'), R2: prompt(id, 'R2'), R3: prompt(id, 'R3') },
  };
}

function due(patch: Partial<ExpressionStateV2> = {}): ExpressionStateV2 {
  return {
    registeredAt: NOW,
    registeredSource: 'episode',
    reviewStage: 'R1',
    rememberStreak: 0,
    lastRating: null,
    cueBoost: 0,
    graduated: false,
    nextReviewDate: TODAY,
    ...patch,
  };
}

function prepared(): { storage: MemoryStorage; state: LearningStateV2 } {
  const storage = new MemoryStorage();
  const state = createEmptyState(NOW);
  ids.forEach((id) => { state.expressions[id] = due(); });
  storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
  return { storage, state };
}

describe('Work 2-3 평가·피드백·졸업·재활성화', () => {
  it('평가 mutation과 answeredIds를 원자적으로 반영하고 다음 미응답 표현을 선택한다', () => {
    const { storage } = prepared();
    const catalog = ids.map(expression);
    const client = createLearningClient(storage, reviewableExpressions(catalog), () => new Date(NOW));
    const flow = client.service.getOrCreateReviewFlow(TODAY, NOW);
    expect(flow.ok).toBe(true);
    if (!flow.ok) return;

    const firstId = flow.flow.batches[0].expressionIds[0];
    const result = client.service.rateReview({
      eventId: makeReviewEventId(flow.state, firstId),
      now: NOW,
      expressionId: firstId,
      rating: 'remembered',
      source: 'again',
      promptId: `${firstId}:R1`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.expressions[firstId]).toMatchObject({
      reviewStage: 'R2', rememberStreak: 1, cueBoost: 0, nextReviewDate: '2026-09-17',
    });
    expect(result.state.reviewFlow?.batches[0].answeredIds).toEqual([firstId]);
    const next = buildReviewScreenModel(result.state, client.byId);
    expect(next.kind === 'question' && next.expression.id).toBe(ids[1]);
    expect(next.kind === 'question' && next.current).toBe(2);
  });

  it('동일 평가 command는 중복 적용하지 않고 다른 payload 재전송은 거부한다', () => {
    const { storage } = prepared();
    const client = createLearningClient(storage, ids.map(expression), () => new Date(NOW));
    const flow = client.service.getOrCreateReviewFlow(TODAY, NOW);
    if (!flow.ok) throw new Error('flow 준비 실패');
    const expressionId = ids[0];
    const eventId = makeReviewEventId(flow.state, expressionId);
    const command = { eventId, now: NOW, expressionId, rating: 'remembered' as const, source: 'again' as const };
    expect(client.service.rateReview(command).ok).toBe(true);
    const duplicate = client.service.rateReview(command);
    expect(duplicate.ok && duplicate.status).toBe('duplicate');
    if (duplicate.ok) {
      expect(duplicate.state.expressions[expressionId].rememberStreak).toBe(1);
      expect(duplicate.state.history.filter((event) => event.type === 'review_answered')).toHaveLength(1);
      expect(duplicate.state.reviewFlow?.batches[0].answeredIds).toEqual([expressionId]);
    }
    expect(client.service.rateReview({ ...command, rating: 'unfamiliar' })).toEqual({ ok: false, code: 'invalid-command' });
  });

  it('마지막 평가 뒤 완료 상태를 저장하고 새로고침에도 응답 표현을 되돌리지 않는다', () => {
    const { storage } = prepared();
    const catalog = ids.map(expression);
    let client = createLearningClient(storage, catalog, () => new Date(NOW));
    const flow = client.service.getOrCreateReviewFlow(TODAY, NOW);
    if (!flow.ok) throw new Error('flow 준비 실패');
    const ratings = ['remembered', 'fuzzy', 'unfamiliar'] as const;
    let state = flow.state;
    ids.forEach((expressionId, index) => {
      const result = client.service.rateReview({
        eventId: makeReviewEventId(state, expressionId), now: NOW, expressionId, rating: ratings[index], source: 'again',
      });
      if (!result.ok) throw new Error('평가 실패');
      state = result.state;
    });
    expect(state.reviewFlow?.batches[0].answeredIds).toEqual(ids);
    expect(state.reviewFlow?.baseCompletedAt).toBe(NOW);
    expect(buildReviewScreenModel(state, client.byId)).toEqual({ kind: 'empty', completedToday: true });

    client = createLearningClient(storage, catalog, () => new Date(NOW));
    const restored = client.service.getOrCreateReviewFlow(TODAY, '2026-09-10T04:00:00.000Z');
    expect(restored.ok && restored.flow.batches[0].answeredIds).toEqual(ids);
    expect(restored.ok && buildReviewScreenModel(restored.state, client.byId)).toEqual({ kind: 'empty', completedToday: true });
  });

  it('세 번째 연속 기억나요는 졸업시키고 이후 자동 queue에서 제외한다', () => {
    const storage = new MemoryStorage();
    const state = createEmptyState(NOW);
    state.expressions[ids[0]] = due({ reviewStage: 'R3', rememberStreak: 2 });
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
    const catalog = ids.map(expression);
    const client = createLearningClient(storage, catalog, () => new Date(NOW));
    const flow = client.service.getOrCreateReviewFlow(TODAY, NOW);
    if (!flow.ok) throw new Error('flow 준비 실패');
    const result = client.service.rateReview({
      eventId: makeReviewEventId(flow.state, ids[0]), now: NOW, expressionId: ids[0], rating: 'remembered', source: 'again',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.expressions[ids[0]]).toMatchObject({
      reviewStage: 'R3', rememberStreak: 3, graduated: true, nextReviewDate: null,
    });
    const registry = { [ids[0]]: { active: true, episodeId: 's01e01' } };
    expect(selectDueExpressions(result.state, registry, '2026-12-31')).toEqual([]);
    const restored = createLearningClient(storage, catalog, () => new Date('2026-09-11T03:00:00.000Z')).service
      .getOrCreateReviewFlow('2026-09-11', '2026-09-11T03:00:00.000Z');
    expect(restored.ok && restored.flow.batches).toEqual([]);
  });

  it('#001 졸업 표현은 identity와 history를 유지한 채 R1/+2로 재활성화한다', () => {
    const storage = new MemoryStorage();
    const state = createEmptyState(NOW);
    state.expressions[ids[0]] = due({
      reviewStage: 'R3', rememberStreak: 3, graduated: true, graduatedAt: NOW, nextReviewDate: null,
    });
    state.history.push({ eventId: 'old-graduation', type: 'expression_graduated', at: NOW, expressionId: ids[0] });
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
    const client = createLearningClient(storage, ids.map(expression), () => new Date(NOW));
    const eventId = makeReactivationEventId(ids[0], NOW);
    const result = client.service.reactivate({
      eventId, now: NOW, expressionId: ids[0],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.state.expressions)).toEqual([ids[0]]);
    expect(result.state.expressions[ids[0]]).toMatchObject({
      reviewStage: 'R1', rememberStreak: 0, cueBoost: 0, graduated: false, nextReviewDate: '2026-09-12',
    });
    expect(result.state.expressions[ids[0]].graduatedAt).toBeUndefined();
    expect(result.state.history.map((event) => event.eventId)).toEqual(['old-graduation', eventId]);
    expect(graduatedExpressionCount(result.state)).toBe(0);
  });

  it('졸업 → 재활성화 → 재졸업 → 재활성화를 같은 날에도 독립 이벤트로 처리한다', () => {
    const secondNow = '2026-09-10T04:00:00.000Z';
    const storage = new MemoryStorage();
    const initial = createEmptyState(NOW);
    initial.expressions[ids[0]] = due({
      reviewStage: 'R3', rememberStreak: 3, graduated: true, graduatedAt: NOW, nextReviewDate: null,
    });
    initial.history.push({ eventId: 'first-graduation', type: 'expression_graduated', at: NOW, expressionId: ids[0] });
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(initial));

    let client = createLearningClient(storage, ids.map(expression), () => new Date(NOW));
    const firstEventId = makeReactivationEventId(ids[0], NOW);
    const firstCommand = { eventId: firstEventId, now: NOW, expressionId: ids[0] };
    const first = client.service.reactivate(firstCommand);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.expressions[ids[0]].graduated).toBe(false);
    expect(graduatedExpressionCount(first.state)).toBe(0);

    const duplicate = client.service.reactivate(firstCommand);
    expect(duplicate.ok && duplicate.status).toBe('duplicate');

    const secondCycle = JSON.parse(JSON.stringify(first.state)) as LearningStateV2;
    Object.assign(secondCycle.expressions[ids[0]], {
      reviewStage: 'R3', rememberStreak: 2, lastRating: 'remembered', cueBoost: 0,
      graduated: false, nextReviewDate: TODAY,
    });
    delete secondCycle.expressions[ids[0]].graduatedAt;
    secondCycle.reviewFlow = {
      date: TODAY,
      activeBatchId: `${TODAY}:daily:second-cycle`,
      batches: [{
        id: `${TODAY}:daily:second-cycle`, kind: 'daily', expressionIds: [ids[0]], answeredIds: [], createdAt: secondNow,
      }],
    };
    secondCycle.revision += 1;
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(secondCycle));

    client = createLearningClient(storage, ids.map(expression), () => new Date(secondNow));
    const regraduated = client.service.rateReview({
      eventId: makeReviewEventId(secondCycle, ids[0]), now: secondNow,
      expressionId: ids[0], rating: 'remembered', source: 'again',
    });
    expect(regraduated.ok).toBe(true);
    if (!regraduated.ok) return;
    expect(regraduated.state.expressions[ids[0]]).toMatchObject({
      graduated: true, graduatedAt: secondNow, rememberStreak: 3, nextReviewDate: null,
    });
    expect(graduatedExpressionCount(regraduated.state)).toBe(1);

    const secondEventId = makeReactivationEventId(ids[0], secondNow);
    expect(secondEventId).not.toBe(firstEventId);
    const second = client.service.reactivate({ eventId: secondEventId, now: secondNow, expressionId: ids[0] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.expressions[ids[0]]).toMatchObject({
      reviewStage: 'R1', rememberStreak: 0, cueBoost: 0, graduated: false, nextReviewDate: '2026-09-12',
    });
    expect(Object.keys(second.state.expressions)).toEqual([ids[0]]);
    expect(second.state.history.filter((event) => event.type === 'expression_reactivated')).toHaveLength(2);
    expect(second.state.history.some((event) => event.eventId === 'first-graduation')).toBe(true);
    expect(graduatedExpressionCount(second.state)).toBe(0);
  });

  it('사용자 피드백에 내부 상태명을 노출하지 않고 평가 후 수동 다음 흐름을 렌더한다', async () => {
    expect(reviewFeedback('remembered', due({ reviewStage: 'R2', rememberStreak: 1, nextReviewDate: '2026-09-17' })))
      .toBe('기억하고 있었네요. 9월 17일에 다시 만나요.');
    expect(reviewFeedback('fuzzy', due({ nextReviewDate: '2026-09-15' })))
      .toBe('한 번 더 만나기로 해요. 9월 15일에 다시 만나요.');
    expect(reviewFeedback('unfamiliar', due({ nextReviewDate: '2026-09-12' })))
      .toBe('떠오르지 않아도 괜찮아요. 9월 12일에 다시 만나요.');
    expect(reviewFeedback('remembered', due({ reviewStage: 'R3', rememberStreak: 3, graduated: true, graduatedAt: NOW, nextReviewDate: null })))
      .toContain('세 번 연속 떠올렸어요.');

    const page = await readFile('src/pages/again.astro', 'utf8');
    const controller = await readFile('src/lib/client/review-flow.ts', 'utf8');
    expect(page).toContain('data-rating="remembered"');
    expect(page).toContain('data-rating="fuzzy"');
    expect(page).toContain('data-rating="unfamiliar"');
    expect(page).toContain('id="qNext"');
    expect(page).toContain('id="reactivation"');
    expect(controller).toContain('client.service.rateReview');
    expect(controller).toContain('client.service.reactivate');
    expect(controller).toContain("next.addEventListener('click'");
    expect(controller).toContain("element<HTMLElement>('qStage').textContent = '다시 만난 표현'");
    expect(controller).toContain('reactivation.hidden = graduated.length === 0');
    expect(controller).not.toContain('첫 번째 다시 만나기');
    expect(controller).not.toContain('reviewStage를');
  });
});
