import { describe, expect, it } from 'vitest';
import { applyHistorySoftCap } from '../../src/lib/learning/history';
import { LocalStorageAdapter, STORAGE_KEYS } from '../../src/lib/learning/local-storage';
import { LearningService } from '../../src/lib/learning/service';
import { createEmptyState } from '../../src/lib/learning/state';
import type { EventReceipt, ExpressionId, LearningEvent } from '../../src/lib/learning/types';
import { MemoryStorage } from '../helpers';

const NOW = '2026-09-10T03:00:00.000Z';
const id = 's01e01-temoii' as ExpressionId;
const options = { activeExpressionIds: [id], queueRegistry: { [id]: { active: true, episodeId: 's01e01' } } };

describe('저장 검증과 idempotency', () => {
  it('동일 eventId+payload는 duplicate이고 상태/history를 다시 바꾸지 않는다', () => {
    const storage = new MemoryStorage(); const adapter = new LocalStorageAdapter(storage, () => new Date(NOW));
    expect(adapter.write(createEmptyState(NOW)).ok).toBe(true);
    const service = new LearningService(adapter, options);
    const command = { eventId: 'review-answer-1', now: NOW, expressionId: id, rating: 'remembered' as const, source: 'again' as const, registerIfMissing: true };
    const first = service.rateReview(command); const second = service.rateReview(command);
    expect(first.ok && first.status).toBe('applied'); expect(second.ok && second.status).toBe('duplicate');
    if (second.ok) { expect(second.state.expressions[id].rememberStreak).toBe(1); expect(second.state.history.filter((event) => event.type === 'review_answered')).toHaveLength(1); }
  });
  it('동일 eventId+다른 payload는 invalid-command다', () => {
    const storage = new MemoryStorage(); const adapter = new LocalStorageAdapter(storage, () => new Date(NOW)); adapter.write(createEmptyState(NOW));
    const service = new LearningService(adapter, options);
    service.rateReview({ eventId: 'review-answer-1', now: NOW, expressionId: id, rating: 'remembered', source: 'again', registerIfMissing: true });
    expect(service.rateReview({ eventId: 'review-answer-1', now: NOW, expressionId: id, rating: 'unfamiliar', source: 'again' })).toEqual({ ok: false, code: 'invalid-command' });
  });
  it('revision/receipt/core 검증이 계속 실패하면 conflict다', () => {
    const storage = new MemoryStorage(); const adapter = new LocalStorageAdapter(storage, () => new Date(NOW)); adapter.write(createEmptyState(NOW));
    storage.corruptAfterWrite = (key, value) => {
      if (key !== STORAGE_KEYS.state) return value;
      const parsed = JSON.parse(value); if (parsed.receipts.evt) parsed.receipts.evt.payloadHash = 'wrong'; return JSON.stringify(parsed);
    };
    const result = adapter.update((current) => ({ ...current, receipts: { ...current.receipts, evt: { type: 'review_answered', payloadHash: 'right', processedAt: NOW } as EventReceipt } }), { eventId: 'evt', payloadHash: 'right', verify: (state) => Boolean(state.receipts.evt) });
    expect(result).toEqual({ ok: false, code: 'conflict' });
  });
  it('history soft cap은 일반 review부터 지우고 lifecycle은 보존한다', () => {
    const lifecycle = Array.from({ length: 1001 }, (_, index) => ({ eventId: `life-${index}`, type: 'episode_completed', at: NOW } as LearningEvent));
    expect(applyHistorySoftCap(lifecycle)).toHaveLength(1001);
    const mixed = [...lifecycle.slice(0, 999), { eventId: 'r1', type: 'review_answered', at: NOW }, { eventId: 'r2', type: 'review_answered', at: NOW }] as LearningEvent[];
    const trimmed = applyHistorySoftCap(mixed); expect(trimmed).toHaveLength(1000); expect(trimmed.filter((event) => event.type === 'review_answered')).toHaveLength(1);
  });
  it('history에서 review event가 사라져도 receipt는 중복을 막는다', () => {
    const state = createEmptyState(NOW); state.receipts.evt = { type: 'review_answered', payloadHash: 'hash', processedAt: NOW };
    state.history = applyHistorySoftCap(Array.from({ length: 1001 }, (_, index) => ({ eventId: `review-${index}`, type: 'review_answered', at: NOW })) as LearningEvent[]);
    expect(state.history).toHaveLength(1000); expect(state.receipts.evt.payloadHash).toBe('hash');
  });
});

