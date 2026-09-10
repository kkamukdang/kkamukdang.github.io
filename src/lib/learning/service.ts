import { getEffectiveClock, isValidDateOnly, isValidInstant } from './date-kst';
import {
  createExtraBatch as createExtraBatchTransition,
  getOrCreateReviewFlow as getOrCreateReviewFlowTransition,
  markReviewFlowAnswered,
  type QueueRegistryIndex,
} from './queue';
import type { StorageAdapter } from './storage';
import {
  answerSeasonReviewTransition, completeEpisodeTransition, completeSeasonTransition,
  markUnsureTransition, rateReviewTransition, reactivateTransition,
} from './transitions';
import type {
  CompleteEpisodeCommand, CompleteSeasonCommand, EventReceipt, ExpressionId,
  LearningStateV2, MarkUnsureCommand, MigrationResult, MutationResult,
  RateReviewCommand, ReactivateCommand, ReceiptType, ReviewFlowState,
  SeasonReviewCommand, StorageReadResult, TransitionResult,
} from './types';
import { EPISODE_ID_RE, SEASON_ID_RE } from './validation';

export interface LearningServiceOptions {
  activeExpressionIds: Iterable<ExpressionId>;
  queueRegistry: QueueRegistryIndex;
  episodeExpressions?: Record<string, ExpressionId[]>;
}

export type ReviewFlowResult =
  | { ok: true; status: 'applied' | 'no-change'; state: LearningStateV2; flow: ReviewFlowState }
  | { ok: false; code: 'storage-unavailable' | 'write-failed' | 'invalid-state' | 'conflict' };

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stableValue(child)]));
  return value;
}

export function commandPayloadHash(command: object): string {
  const payload = Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'eventId' && key !== 'now'));
  const text = JSON.stringify(stableValue(payload));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function receipt(type: ReceiptType, payloadHash: string, processedAt: string): EventReceipt { return { type, payloadHash, processedAt }; }

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function sameExpression(stored: LearningStateV2, expected: LearningStateV2, expressionId: ExpressionId): boolean {
  return sameValue(stored.expressions[expressionId], expected.expressions[expressionId]);
}

export class LearningService {
  private readonly active: Set<ExpressionId>;
  constructor(private readonly adapter: StorageAdapter, private readonly options: LearningServiceOptions) {
    this.active = new Set(options.activeExpressionIds);
  }

  getSnapshot(): StorageReadResult { return this.adapter.read(); }
  previewMigration(): MigrationResult { return this.adapter.migrate({ persist: false }); }

  completeEpisode(command: CompleteEpisodeCommand): MutationResult {
    const expected = this.options.episodeExpressions?.[command.episodeId];
    if (!EPISODE_ID_RE.test(command.episodeId) || !SEASON_ID_RE.test(command.seasonId)
      || command.expressionIds.length !== 3 || command.expressionIds.some((id) => !this.active.has(id))
      || (expected && expected.join('|') !== command.expressionIds.join('|'))) return { ok: false, code: 'invalid-command' };
    return this.run(command, 'episode_completed', (state, today) => completeEpisodeTransition(state, command, today),
      (stored, target) => sameValue(stored.episodes[command.episodeId], target.episodes[command.episodeId])
        && command.expressionIds.every((id) => sameExpression(stored, target, id)));
  }

  markUnsure(command: MarkUnsureCommand): MutationResult {
    if (!this.active.has(command.expressionId)) return { ok: false, code: 'invalid-command' };
    return this.run(command, 'unsure_accelerated', (state, today) => markUnsureTransition(state, command, today),
      (stored, target) => sameExpression(stored, target, command.expressionId));
  }

  rateReview(command: RateReviewCommand): MutationResult {
    if (!this.active.has(command.expressionId) || !['remembered', 'fuzzy', 'unfamiliar'].includes(command.rating)
      || !['again', 'newsletter', 'season-review'].includes(command.source)) return { ok: false, code: 'invalid-command' };
    const type: ReceiptType = command.source === 'newsletter' ? 'newsletter_rating' : 'review_answered';
    return this.run(command, type, (state, today) => {
      const result = rateReviewTransition(state, command, today);
      if (result.status === 'no-change' || command.source !== 'again') return result;
      return { ...result, state: markReviewFlowAnswered(result.state, command.expressionId, command.now) };
    }, (stored, target) => sameExpression(stored, target, command.expressionId)
      && sameValue(stored.reviewFlow, target.reviewFlow));
  }

  reactivate(command: ReactivateCommand): MutationResult {
    if (!this.active.has(command.expressionId)) return { ok: false, code: 'invalid-command' };
    return this.run(command, 'expression_reactivated', (state, today) => reactivateTransition(state, command, today),
      (stored, target) => sameExpression(stored, target, command.expressionId));
  }

  answerSeasonReview(command: SeasonReviewCommand): MutationResult {
    if (!SEASON_ID_RE.test(command.seasonId) || !this.active.has(command.expressionId)) return { ok: false, code: 'invalid-command' };
    return this.run(command, 'season_review_answered', (state, today) => answerSeasonReviewTransition(state, command, today),
      (stored, target) => sameValue(stored.seasons[command.seasonId], target.seasons[command.seasonId])
        && sameExpression(stored, target, command.expressionId));
  }

  completeSeason(command: CompleteSeasonCommand): MutationResult {
    if (!SEASON_ID_RE.test(command.seasonId) || command.requiredEpisodeIds.length !== 6
      || new Set(command.requiredEpisodeIds).size !== 6
      || command.requiredEpisodeIds.some((id) => !EPISODE_ID_RE.test(id) || !id.startsWith(command.seasonId))
      || !command.stampCode) return { ok: false, code: 'invalid-command' };
    return this.run(command, 'season_completed', (state) => completeSeasonTransition(state, command),
      (stored, target) => sameValue(stored.seasons[command.seasonId], target.seasons[command.seasonId]));
  }

  getOrCreateReviewFlow(today: `${number}-${number}-${number}`, now = new Date().toISOString()): ReviewFlowResult {
    if (!isValidDateOnly(today)) return { ok: false, code: 'invalid-state' };
    return this.updateFlow((state) => getOrCreateReviewFlowTransition(state, this.options.queueRegistry, today, now), now);
  }

  createExtraBatch(today: `${number}-${number}-${number}`, now = new Date().toISOString()): ReviewFlowResult {
    if (!isValidDateOnly(today)) return { ok: false, code: 'invalid-state' };
    return this.updateFlow((state) => createExtraBatchTransition(state, this.options.queueRegistry, today, now), now);
  }

  private run(
    command: { eventId: string; now: string },
    type: ReceiptType,
    transition: (state: LearningStateV2, today: `${number}-${number}-${number}`) => TransitionResult,
    verify: (stored: LearningStateV2, expected: LearningStateV2) => boolean,
  ): MutationResult {
    if (!command.eventId || command.eventId.length > 160 || !isValidInstant(command.now)) return { ok: false, code: 'invalid-command' };
    const loaded = this.adapter.read();
    if (!loaded.ok) return { ok: false, code: loaded.code === 'unavailable' ? 'storage-unavailable' : 'invalid-state' };
    const hash = commandPayloadHash({ ...command, commandType: type });
    const previous = loaded.value.receipts[command.eventId];
    if (previous) return previous.payloadHash === hash
      ? { ok: true, status: 'duplicate', state: loaded.value }
      : { ok: false, code: 'invalid-command' };
    const clock = getEffectiveClock(new Date(command.now), loaded.value.clock);
    const preview = transition(loaded.value, clock.date);
    if (preview.status === 'no-change') return { ok: true, status: 'no-change', state: loaded.value };
    let expectedState: LearningStateV2 | undefined;
    const updated = this.adapter.update((current) => {
      const collision = current.receipts[command.eventId];
      if (collision) return current;
      const currentClock = getEffectiveClock(new Date(command.now), current.clock);
      const result = transition(current, currentClock.date);
      if (result.status === 'no-change') return current;
      result.state.updatedAt = command.now;
      result.state.clock = { lastObservedAt: command.now, lastObservedDate: currentClock.date };
      result.state.receipts[command.eventId] = receipt(type, hash, command.now);
      expectedState = result.state;
      return result.state;
    }, {
      eventId: command.eventId,
      payloadHash: hash,
      verify: (stored) => Boolean(expectedState) && verify(stored, expectedState!),
    });
    if (!updated.ok) return { ok: false, code: updated.code === 'unavailable' ? 'storage-unavailable' : updated.code };
    return { ok: true, status: 'applied', state: updated.value };
  }

  private updateFlow(factory: (state: LearningStateV2) => { state: LearningStateV2; flow: ReviewFlowState; changed: boolean }, now: string): ReviewFlowResult {
    const loaded = this.adapter.read();
    if (!loaded.ok) return { ok: false, code: loaded.code === 'unavailable' ? 'storage-unavailable' : 'invalid-state' };
    const preview = factory(loaded.value);
    if (!preview.changed) return { ok: true, status: 'no-change', state: preview.state, flow: preview.flow };
    const updated = this.adapter.update((current) => {
      const made = factory(current);
      if (!made.changed) return current;
      made.state.updatedAt = now;
      return made.state;
    }, { verify: (stored) => Boolean(stored.reviewFlow) });
    if (!updated.ok) return { ok: false, code: updated.code === 'unavailable' ? 'storage-unavailable' : updated.code };
    return { ok: true, status: 'applied', state: updated.value, flow: updated.value.reviewFlow! };
  }
}
