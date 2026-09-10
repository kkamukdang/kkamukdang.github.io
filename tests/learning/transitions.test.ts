import { describe, expect, it } from 'vitest';
import { createEmptyState } from '../../src/lib/learning/state';
import { completeEpisodeTransition, markUnsureTransition, rateReviewTransition, reactivateTransition } from '../../src/lib/learning/transitions';
import type { ExpressionId, ExpressionStateV2 } from '../../src/lib/learning/types';

const NOW = '2026-09-10T03:00:00.000Z';
const IDS = ['s01e01-temoii', 's01e01-gaman', 's01e01-baiiyo'] as [ExpressionId, ExpressionId, ExpressionId];
const episode = { eventId: 'episode-complete:s01e01', now: NOW, episodeId: 's01e01' as const, seasonId: 's01' as const, expressionIds: IDS };

function baseExpression(patch: Partial<ExpressionStateV2> = {}): ExpressionStateV2 {
  return { registeredAt: NOW, registeredSource: 'episode', reviewStage: 'R1', rememberStreak: 0, lastRating: null, cueBoost: 0, graduated: false, nextReviewDate: '2026-09-10', ...patch };
}

describe('학습 상태 전이', () => {
  it('episode 완료로 세 표현을 R1/+3 등록한다', () => {
    const result = completeEpisodeTransition(createEmptyState(NOW), episode, '2026-09-10');
    expect(result.state.episodes.s01e01.completed).toBe(true);
    expect(IDS.map((id) => result.state.expressions[id].nextReviewDate)).toEqual(['2026-09-13', '2026-09-13', '2026-09-13']);
  });
  it('자신 없어요 +1을 episode 완료가 덮어쓰지 않는다', () => {
    const unsure = markUnsureTransition(createEmptyState(NOW), { eventId: 'unsure:temoii', now: NOW, expressionId: IDS[0] }, '2026-09-10').state;
    const done = completeEpisodeTransition(unsure, episode, '2026-09-10').state;
    expect(done.expressions[IDS[0]].nextReviewDate).toBe('2026-09-11');
    expect(done.expressions[IDS[1]].nextReviewDate).toBe('2026-09-13');
  });
  it('R1/R2/R3 remembered 후 세 번째에 졸업한다', () => {
    const state = createEmptyState(NOW); state.expressions[IDS[0]] = baseExpression();
    const r1 = rateReviewTransition(state, { eventId: 'review-1', now: NOW, expressionId: IDS[0], rating: 'remembered', source: 'again' }, '2026-09-10').state;
    expect(r1.expressions[IDS[0]]).toMatchObject({ rememberStreak: 1, reviewStage: 'R2', nextReviewDate: '2026-09-17', graduated: false });
    const r2 = rateReviewTransition(r1, { eventId: 'review-2', now: NOW, expressionId: IDS[0], rating: 'remembered', source: 'again' }, '2026-09-10').state;
    expect(r2.expressions[IDS[0]]).toMatchObject({ rememberStreak: 2, reviewStage: 'R3', nextReviewDate: '2026-09-24' });
    const r3 = rateReviewTransition(r2, { eventId: 'review-3', now: NOW, expressionId: IDS[0], rating: 'remembered', source: 'again' }, '2026-09-10').state;
    expect(r3.expressions[IDS[0]]).toMatchObject({ rememberStreak: 3, reviewStage: 'R3', graduated: true, nextReviewDate: null });
    expect(r3.history.some((event) => event.type === 'expression_graduated')).toBe(true);
  });
  it('fuzzy는 stage 유지/+5, unfamiliar는 R1/+2로 보낸다', () => {
    const state = createEmptyState(NOW); state.expressions[IDS[0]] = baseExpression({ reviewStage: 'R3', rememberStreak: 2 });
    const fuzzy = rateReviewTransition(state, { eventId: 'fuzzy-1', now: NOW, expressionId: IDS[0], rating: 'fuzzy', source: 'again' }, '2026-09-10').state.expressions[IDS[0]];
    expect(fuzzy).toMatchObject({ reviewStage: 'R3', rememberStreak: 0, cueBoost: 1, nextReviewDate: '2026-09-15' });
    const unfamiliar = rateReviewTransition(state, { eventId: 'lost-1', now: NOW, expressionId: IDS[0], rating: 'unfamiliar', source: 'again' }, '2026-09-10').state.expressions[IDS[0]];
    expect(unfamiliar).toMatchObject({ reviewStage: 'R1', rememberStreak: 0, cueBoost: 1, nextReviewDate: '2026-09-12' });
  });
  it('졸업 상태를 history 보존 상태로 재활성화한다', () => {
    const state = createEmptyState(NOW); state.expressions[IDS[0]] = baseExpression({ reviewStage: 'R3', rememberStreak: 3, graduated: true, graduatedAt: NOW, nextReviewDate: null });
    state.history.push({ eventId: 'old', type: 'expression_graduated', at: NOW, expressionId: IDS[0] });
    const result = reactivateTransition(state, { eventId: 'reactivate-1', now: NOW, expressionId: IDS[0] }, '2026-09-10').state;
    expect(result.expressions[IDS[0]]).toMatchObject({ reviewStage: 'R1', rememberStreak: 0, cueBoost: 0, graduated: false, nextReviewDate: '2026-09-12' });
    expect(result.expressions[IDS[0]].graduatedAt).toBeUndefined();
    expect(result.history[0].eventId).toBe('old');
  });
});

