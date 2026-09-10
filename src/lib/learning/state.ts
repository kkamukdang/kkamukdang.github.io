import { getKstDate } from './date-kst';
import type { Instant, LearningStateV2 } from './types';

export function createEmptyState(now: Instant = new Date().toISOString()): LearningStateV2 {
  const date = getKstDate(new Date(now));
  return {
    schemaVersion: 2,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    timezone: 'Asia/Seoul',
    clock: { lastObservedAt: now, lastObservedDate: date },
    expressions: {}, episodes: {}, seasons: {}, receipts: {}, history: [],
  };
}

export function cloneState(state: LearningStateV2): LearningStateV2 {
  return structuredClone(state);
}
