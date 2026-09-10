import { addCalendarDays } from './date-kst';
import { applyHistorySoftCap } from './history';
import { cloneState } from './state';
import type {
  CompleteEpisodeCommand, CompleteSeasonCommand, DateOnly, ExpressionStateV2,
  LearningEvent, LearningStateV2, MarkUnsureCommand, RateReviewCommand,
  ReactivateCommand, SeasonReviewCommand, TransitionResult,
} from './types';

function registered(now: string, source: ExpressionStateV2['registeredSource'], due: DateOnly): ExpressionStateV2 {
  return {
    registeredAt: now, registeredSource: source, reviewStage: 'R1', rememberStreak: 0,
    lastRating: null, cueBoost: 0, graduated: false, nextReviewDate: due,
  };
}

function finish(state: LearningStateV2, events: LearningEvent[]): TransitionResult {
  state.history = applyHistorySoftCap([...state.history, ...events]);
  return { status: 'applied', state };
}

export function completeEpisodeTransition(state: LearningStateV2, command: CompleteEpisodeCommand, today: DateOnly): TransitionResult {
  if (state.episodes[command.episodeId]) return { status: 'no-change', state };
  const next = cloneState(state);
  const events: LearningEvent[] = [];
  const due = addCalendarDays(today, 3);
  for (const expressionId of command.expressionIds) {
    if (!next.expressions[expressionId]) {
      next.expressions[expressionId] = registered(command.now, 'episode', due);
      events.push({ eventId: command.eventId, type: 'expression_registered', at: command.now, expressionId, source: 'episode', after: { reviewStage: 'R1', rememberStreak: 0, nextReviewDate: due } });
    }
  }
  next.episodes[command.episodeId] = { completed: true, completedAt: command.now };
  events.push({ eventId: command.eventId, type: 'episode_completed', at: command.now, episodeId: command.episodeId, seasonId: command.seasonId });
  return finish(next, events);
}

export function markUnsureTransition(state: LearningStateV2, command: MarkUnsureCommand, today: DateOnly): TransitionResult {
  const existing = state.expressions[command.expressionId];
  if (existing?.graduated) return { status: 'no-change', state };
  const due = addCalendarDays(today, 1);
  if (existing?.nextReviewDate && existing.nextReviewDate <= due) return { status: 'no-change', state };
  const next = cloneState(state);
  if (!existing) {
    next.expressions[command.expressionId] = registered(command.now, 'unsure', due);
    return finish(next, [{ eventId: command.eventId, type: 'expression_registered', at: command.now, expressionId: command.expressionId, source: 'unsure', after: { reviewStage: 'R1', rememberStreak: 0, nextReviewDate: due } }]);
  }
  next.expressions[command.expressionId].nextReviewDate = due;
  return finish(next, [{ eventId: command.eventId, type: 'unsure_accelerated', at: command.now, expressionId: command.expressionId, before: { nextReviewDate: existing.nextReviewDate }, after: { nextReviewDate: due } }]);
}

function rateExisting(expression: ExpressionStateV2, command: RateReviewCommand, today: DateOnly): { next: ExpressionStateV2; graduated: boolean } {
  const next = { ...expression, lastRating: command.rating, lastReviewedAt: command.now, lastSource: command.source };
  if (command.promptId) next.lastPromptId = command.promptId;
  if (command.rating === 'remembered') {
    const streak = Math.min(3, expression.rememberStreak + 1) as 1 | 2 | 3;
    next.rememberStreak = streak;
    next.cueBoost = 0;
    if (streak === 3) {
      next.reviewStage = 'R3'; next.graduated = true; next.graduatedAt = command.now; next.nextReviewDate = null;
      return { next, graduated: true };
    }
    next.reviewStage = expression.reviewStage === 'R1' ? 'R2' : 'R3';
    next.nextReviewDate = addCalendarDays(today, streak === 1 ? 7 : 14);
  } else if (command.rating === 'fuzzy') {
    next.rememberStreak = 0; next.cueBoost = 1; next.nextReviewDate = addCalendarDays(today, 5);
  } else {
    next.rememberStreak = 0; next.reviewStage = 'R1'; next.cueBoost = 1; next.nextReviewDate = addCalendarDays(today, 2);
  }
  return { next, graduated: false };
}

export function rateReviewTransition(state: LearningStateV2, command: RateReviewCommand, today: DateOnly): TransitionResult {
  let existing = state.expressions[command.expressionId];
  if (existing?.graduated) return { status: 'no-change', state };
  const nextState = cloneState(state);
  const events: LearningEvent[] = [];
  if (!existing) {
    if (!command.registerIfMissing) return { status: 'no-change', state };
    existing = registered(command.now, command.source === 'season-review' ? 'season-review' : 'newsletter', today);
    nextState.expressions[command.expressionId] = existing;
    events.push({ eventId: command.eventId, type: 'expression_registered', at: command.now, expressionId: command.expressionId, source: existing.registeredSource });
  }
  const result = rateExisting(existing, command, today);
  nextState.expressions[command.expressionId] = result.next;
  events.push({ eventId: command.eventId, type: 'review_answered', at: command.now, expressionId: command.expressionId, source: command.source, rating: command.rating,
    before: { reviewStage: existing.reviewStage, rememberStreak: existing.rememberStreak, nextReviewDate: existing.nextReviewDate },
    after: { reviewStage: result.next.reviewStage, rememberStreak: result.next.rememberStreak, nextReviewDate: result.next.nextReviewDate, cueBoost: result.next.cueBoost, graduated: result.next.graduated },
  });
  if (result.graduated) events.push({ eventId: command.eventId, type: 'expression_graduated', at: command.now, expressionId: command.expressionId, source: command.source, after: { graduated: true, graduatedAt: command.now, nextReviewDate: null } });
  return finish(nextState, events);
}

export function reactivateTransition(state: LearningStateV2, command: ReactivateCommand, today: DateOnly): TransitionResult {
  const existing = state.expressions[command.expressionId];
  if (!existing?.graduated) return { status: 'no-change', state };
  const next = cloneState(state);
  const due = addCalendarDays(today, 2);
  const reactivated: ExpressionStateV2 = {
    ...existing, reviewStage: 'R1', rememberStreak: 0, lastRating: null,
    cueBoost: 0, graduated: false, nextReviewDate: due,
  };
  delete reactivated.graduatedAt;
  next.expressions[command.expressionId] = reactivated;
  return finish(next, [{ eventId: command.eventId, type: 'expression_reactivated', at: command.now, expressionId: command.expressionId, source: 'reactivation', before: { graduated: true, graduatedAt: existing.graduatedAt }, after: { graduated: false, rememberStreak: 0, reviewStage: 'R1', cueBoost: 0, nextReviewDate: due } }]);
}

export function answerSeasonReviewTransition(state: LearningStateV2, command: SeasonReviewCommand, today: DateOnly): TransitionResult {
  const previous = state.seasons[command.seasonId]?.review.responses[command.expressionId];
  if (previous) return { status: 'no-change', state };
  const ratingCommand: RateReviewCommand = { ...command, source: 'season-review', registerIfMissing: true };
  const rated = rateReviewTransition(state, ratingCommand, today);
  const next = cloneState(rated.state);
  const season = next.seasons[command.seasonId] ?? { review: { responses: {} }, completed: false };
  season.review.responses[command.expressionId] = { rating: command.rating, answeredAt: command.now, eventId: command.eventId };
  next.seasons[command.seasonId] = season;
  return finish(next, [{ eventId: command.eventId, type: 'season_review_answered', at: command.now, seasonId: command.seasonId, expressionId: command.expressionId, source: 'season-review', rating: command.rating }]);
}

export function completeSeasonTransition(state: LearningStateV2, command: CompleteSeasonCommand): TransitionResult {
  if (!command.requiredEpisodeIds.every((id) => state.episodes[id]?.completed)) return { status: 'no-change', state };
  if (state.seasons[command.seasonId]?.completed) return { status: 'no-change', state };
  const next = cloneState(state);
  const season = next.seasons[command.seasonId] ?? { review: { responses: {} }, completed: false };
  season.completed = true; season.completedAt = command.now; season.stampCode ||= command.stampCode;
  next.seasons[command.seasonId] = season;
  return finish(next, [{ eventId: command.eventId, type: 'season_completed', at: command.now, seasonId: command.seasonId }]);
}

