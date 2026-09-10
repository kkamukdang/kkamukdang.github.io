import type { LearningEvent } from './types';

export const HISTORY_SOFT_CAP = 1_000;
const PRUNE_ORDER: LearningEvent['type'][] = [
  'review_answered', 'season_review_answered', 'unsure_accelerated',
];

export function applyHistorySoftCap(history: LearningEvent[], cap = HISTORY_SOFT_CAP): LearningEvent[] {
  if (history.length <= cap) return history;
  const remove = new Set<number>();
  let overflow = history.length - cap;
  for (const type of PRUNE_ORDER) {
    for (let index = 0; index < history.length && overflow > 0; index += 1) {
      if (!remove.has(index) && history[index]?.type === type) {
        remove.add(index);
        overflow -= 1;
      }
    }
  }
  return history.filter((_event, index) => !remove.has(index));
}

