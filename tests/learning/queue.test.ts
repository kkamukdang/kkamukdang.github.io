import { describe, expect, it } from 'vitest';
import { createEmptyState } from '../../src/lib/learning/state';
import { createExtraBatch, getOrCreateReviewFlow, markReviewFlowAnswered, selectDueExpressions, type QueueRegistryIndex } from '../../src/lib/learning/queue';
import type { ExpressionId, ExpressionStateV2 } from '../../src/lib/learning/types';

const NOW = '2026-09-10T03:00:00.000Z';
const ids = ['s01e01-temoii', 's01e01-gaman', 's01e01-baiiyo', 's01e02-natteru', 's01e02-moraeba'] as ExpressionId[];
const registry = Object.fromEntries(ids.map((id) => [id, { active: true, episodeId: id.slice(0, 6) }])) as QueueRegistryIndex;
const expr = (due: `${number}-${number}-${number}`, rating: ExpressionStateV2['lastRating'] = null): ExpressionStateV2 => ({ registeredAt: NOW, registeredSource: 'episode', reviewStage: 'R1', rememberStreak: 0, lastRating: rating, cueBoost: 0, graduated: false, nextReviewDate: due });

describe('review queue', () => {
  it('날짜를 위험도보다 먼저 정렬하고 기본 3개를 만든다', () => {
    const state = createEmptyState(NOW); ids.forEach((id, index) => { state.expressions[id] = expr(index === 0 ? '2026-09-01' : '2026-09-02', index === 1 ? 'unfamiliar' : null); });
    expect(selectDueExpressions(state, registry, '2026-09-10', new Set(), 3)).toEqual([ids[0], ids[1], ids[2]]);
  });
  it('기본 batch 완료 후에만 기존 ID를 제외한 추가 batch를 만든다', () => {
    const state = createEmptyState(NOW); ids.forEach((id) => { state.expressions[id] = expr('2026-09-01'); });
    const daily = getOrCreateReviewFlow(state, registry, '2026-09-10', NOW);
    const refreshed = getOrCreateReviewFlow(daily.state, registry, '2026-09-10', NOW);
    expect(refreshed.changed).toBe(false); expect(refreshed.flow.batches[0].expressionIds).toEqual(['s01e01-baiiyo', 's01e01-gaman', 's01e01-temoii']);
    expect(createExtraBatch(daily.state, registry, '2026-09-10', NOW).flow.batches).toHaveLength(1);
    const completed = daily.flow.batches[0].expressionIds.reduce(
      (current, expressionId) => markReviewFlowAnswered(current, expressionId, NOW),
      daily.state,
    );
    expect(completed.reviewFlow?.baseCompletedAt).toBe(NOW);
    const extra = createExtraBatch(completed, registry, '2026-09-10', NOW);
    expect(extra.flow.batches[1].expressionIds).toEqual(['s01e02-moraeba', 's01e02-natteru']);
    const extraCompleted = extra.flow.batches[1].expressionIds.reduce(
      (current, expressionId) => markReviewFlowAnswered(current, expressionId, '2026-09-10T04:00:00.000Z'),
      extra.state,
    );
    expect(extraCompleted.reviewFlow?.baseCompletedAt).toBe(NOW);
  });
});
