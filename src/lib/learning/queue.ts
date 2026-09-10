import { isDue } from './date-kst';
import { cloneState } from './state';
import type { DateOnly, ExpressionId, LearningStateV2, ReviewBatch, ReviewFlowState } from './types';

export interface QueueRegistryEntry { active: boolean; episodeId: string }
export type QueueRegistryIndex = Record<ExpressionId, QueueRegistryEntry>;

function risk(value: LearningStateV2['expressions'][ExpressionId]): number {
  return value.lastRating === 'unfamiliar' ? 0 : value.lastRating === 'fuzzy' ? 1 : 2;
}

export function selectDueExpressions(
  state: LearningStateV2,
  registry: QueueRegistryIndex,
  today: DateOnly,
  excluded = new Set<ExpressionId>(),
  limit = 3,
): ExpressionId[] {
  return (Object.entries(state.expressions) as [ExpressionId, LearningStateV2['expressions'][ExpressionId]][])
    .filter(([id, value]) => registry[id]?.active && !value.graduated && isDue(value.nextReviewDate, today) && !excluded.has(id))
    .sort(([idA, a], [idB, b]) => {
      const due = String(a.nextReviewDate).localeCompare(String(b.nextReviewDate));
      if (due) return due;
      const risky = risk(a) - risk(b);
      if (risky) return risky;
      const reviewed = String(a.lastReviewedAt ?? '').localeCompare(String(b.lastReviewedAt ?? ''));
      if (reviewed) return reviewed;
      const episode = registry[idA].episodeId.localeCompare(registry[idB].episodeId);
      return episode || idA.localeCompare(idB);
    })
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}

function makeBatch(kind: ReviewBatch['kind'], ids: ExpressionId[], today: DateOnly, now: string, ordinal: number): ReviewBatch {
  return { id: `${today}:${kind}:${ordinal}`, kind, expressionIds: ids, answeredIds: [], createdAt: now };
}

export function getOrCreateReviewFlow(state: LearningStateV2, registry: QueueRegistryIndex, today: DateOnly, now: string): { state: LearningStateV2; flow: ReviewFlowState; changed: boolean } {
  if (state.reviewFlow?.date === today) return { state, flow: state.reviewFlow, changed: false };
  const next = cloneState(state);
  const ids = selectDueExpressions(next, registry, today, new Set(), 3);
  const batch = ids.length ? makeBatch('daily', ids, today, now, 1) : undefined;
  next.reviewFlow = { date: today, batches: batch ? [batch] : [], ...(batch ? { activeBatchId: batch.id } : {}) };
  return { state: next, flow: next.reviewFlow, changed: true };
}

export function createExtraBatch(state: LearningStateV2, registry: QueueRegistryIndex, today: DateOnly, now: string): { state: LearningStateV2; flow: ReviewFlowState; changed: boolean } {
  const base = getOrCreateReviewFlow(state, registry, today, now);
  const next = cloneState(base.state);
  const excluded = new Set(next.reviewFlow!.batches.flatMap((batch) => batch.expressionIds));
  const ids = selectDueExpressions(next, registry, today, excluded, 3);
  if (!ids.length) return { state: base.state, flow: base.flow, changed: base.changed };
  const batch = makeBatch('extra', ids, today, now, next.reviewFlow!.batches.length + 1);
  next.reviewFlow!.batches.push(batch); next.reviewFlow!.activeBatchId = batch.id;
  return { state: next, flow: next.reviewFlow!, changed: true };
}

export function markReviewFlowAnswered(state: LearningStateV2, expressionId: ExpressionId, now: string): LearningStateV2 {
  const next = cloneState(state);
  const batch = next.reviewFlow?.batches.find((item) => item.id === next.reviewFlow?.activeBatchId);
  if (batch?.expressionIds.includes(expressionId) && !batch.answeredIds.includes(expressionId)) batch.answeredIds.push(expressionId);
  if (batch && batch.answeredIds.length === batch.expressionIds.length) next.reviewFlow!.baseCompletedAt ||= now;
  return next;
}
