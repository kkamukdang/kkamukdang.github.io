import { isValidDateOnly, isValidInstant } from './date-kst';
import type {
  EpisodeId, ExpressionId, ExpressionStateV2, LearningStateV2, Rating,
  ReviewStage, SeasonId, ValidationResult,
} from './types';

export const SEASON_ID_RE = /^s\d{2}$/;
export const EPISODE_ID_RE = /^s\d{2}e\d{2}$/;
export const EXPRESSION_ID_RE = /^s\d{2}e\d{2}-[a-z]+$/;
export const EVENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const STAGES = new Set<ReviewStage>(['R1', 'R2', 'R3']);
const RATINGS = new Set<Rating>(['remembered', 'fuzzy', 'unfamiliar']);
const REGISTRATION_SOURCES = new Set(['episode', 'unsure', 'newsletter', 'season-review', 'reactivation']);
const REVIEW_SOURCES = new Set(['again', 'newsletter', 'season-review']);
const RECEIPT_TYPES = new Set([
  'episode_completed', 'newsletter_rating', 'season_completed', 'expression_reactivated',
  'review_answered', 'unsure_accelerated', 'season_review_answered',
]);
const EVENT_TYPES = new Set([
  'expression_registered', 'unsure_accelerated', 'review_answered', 'expression_graduated',
  'expression_reactivated', 'episode_completed', 'season_review_answered', 'season_completed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scanUnsafeKeys(value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanUnsafeKeys(item, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) issues.push(`${path}.${key}: 허용되지 않는 key`);
    scanUnsafeKeys(value[key], `${path}.${key}`, issues);
  }
}

function validateExpression(value: unknown, path: string, issues: string[]): value is ExpressionStateV2 {
  if (!isRecord(value)) { issues.push(`${path}: object가 아님`); return false; }
  if (!isValidInstant(value.registeredAt)) issues.push(`${path}.registeredAt: UTC Instant가 아님`);
  if (!REGISTRATION_SOURCES.has(String(value.registeredSource))) issues.push(`${path}.registeredSource: 허용값이 아님`);
  if (!STAGES.has(value.reviewStage as ReviewStage)) issues.push(`${path}.reviewStage: 허용값이 아님`);
  if (![0, 1, 2, 3].includes(value.rememberStreak as number)) issues.push(`${path}.rememberStreak: 0~3이 아님`);
  if (value.lastRating !== null && !RATINGS.has(value.lastRating as Rating)) issues.push(`${path}.lastRating: 허용값이 아님`);
  if (value.cueBoost !== 0 && value.cueBoost !== 1) issues.push(`${path}.cueBoost: 0 또는 1이 아님`);
  if (typeof value.graduated !== 'boolean') issues.push(`${path}.graduated: boolean이 아님`);
  if (value.graduated) {
    if (value.rememberStreak !== 3) issues.push(`${path}: 졸업 streak는 3이어야 함`);
    if (!isValidInstant(value.graduatedAt)) issues.push(`${path}.graduatedAt: 졸업 시 필수`);
    if (value.nextReviewDate !== null) issues.push(`${path}.nextReviewDate: 졸업 시 null이어야 함`);
  } else if (!isValidDateOnly(value.nextReviewDate)) {
    issues.push(`${path}.nextReviewDate: 미졸업 시 DateOnly 필수`);
  }
  if (value.lastReviewedAt !== undefined && !isValidInstant(value.lastReviewedAt)) issues.push(`${path}.lastReviewedAt: UTC Instant가 아님`);
  if (value.lastSource !== undefined && !REVIEW_SOURCES.has(String(value.lastSource))) issues.push(`${path}.lastSource: 허용값이 아님`);
  return true;
}

export function validateLearningState(raw: unknown): ValidationResult<LearningStateV2> {
  const issues: string[] = [];
  scanUnsafeKeys(raw, '$', issues);
  if (!isRecord(raw)) return { ok: false, issues: [...issues, '$: object가 아님'] };
  if (raw.schemaVersion !== 2) issues.push('schemaVersion: 2가 아님');
  if (!Number.isInteger(raw.revision) || Number(raw.revision) < 0) issues.push('revision: 0 이상 정수가 아님');
  if (!isValidInstant(raw.createdAt)) issues.push('createdAt: UTC Instant가 아님');
  if (!isValidInstant(raw.updatedAt)) issues.push('updatedAt: UTC Instant가 아님');
  if (raw.timezone !== 'Asia/Seoul') issues.push('timezone: Asia/Seoul이 아님');
  if (!isRecord(raw.clock) || !isValidInstant(raw.clock.lastObservedAt) || !isValidDateOnly(raw.clock.lastObservedDate)) {
    issues.push('clock: 유효하지 않음');
  }

  if (!isRecord(raw.expressions)) issues.push('expressions: object가 아님');
  else for (const [id, expression] of Object.entries(raw.expressions)) {
    if (!EXPRESSION_ID_RE.test(id)) issues.push(`expressions.${id}: ID 형식 오류`);
    validateExpression(expression, `expressions.${id}`, issues);
  }

  if (!isRecord(raw.episodes)) issues.push('episodes: object가 아님');
  else for (const [id, episode] of Object.entries(raw.episodes)) {
    if (!EPISODE_ID_RE.test(id)) issues.push(`episodes.${id}: ID 형식 오류`);
    if (!isRecord(episode) || episode.completed !== true || !isValidInstant(episode.completedAt)) issues.push(`episodes.${id}: 완료 상태 오류`);
  }

  if (!isRecord(raw.seasons)) issues.push('seasons: object가 아님');
  else for (const [id, season] of Object.entries(raw.seasons)) {
    if (!SEASON_ID_RE.test(id)) issues.push(`seasons.${id}: ID 형식 오류`);
    if (!isRecord(season) || typeof season.completed !== 'boolean' || !isRecord(season.review) || !isRecord(season.review.responses)) {
      issues.push(`seasons.${id}: 상태 오류`);
      continue;
    }
    if (season.completed && !isValidInstant(season.completedAt)) issues.push(`seasons.${id}.completedAt: 완료 시 필수`);
    if (season.completedAt !== undefined && !isValidInstant(season.completedAt)) issues.push(`seasons.${id}.completedAt: UTC Instant가 아님`);
    if (season.stampCode !== undefined && (typeof season.stampCode !== 'string' || !season.stampCode)) issues.push(`seasons.${id}.stampCode: 문자열이 아님`);
    if (season.review.visitedAt !== undefined && !isValidInstant(season.review.visitedAt)) issues.push(`seasons.${id}.review.visitedAt: UTC Instant가 아님`);
    for (const [expressionId, response] of Object.entries(season.review.responses)) {
      if (!EXPRESSION_ID_RE.test(expressionId)) issues.push(`seasons.${id}.review.responses.${expressionId}: ID 형식 오류`);
      if (!isRecord(response) || !RATINGS.has(response.rating as Rating) || !isValidInstant(response.answeredAt)
        || typeof response.eventId !== 'string' || !response.eventId) {
        issues.push(`seasons.${id}.review.responses.${expressionId}: 응답 오류`);
      }
    }
  }

  if (!isRecord(raw.receipts)) issues.push('receipts: object가 아님');
  else for (const [eventId, receipt] of Object.entries(raw.receipts)) {
    if (!eventId || FORBIDDEN_KEYS.has(eventId)) issues.push(`receipts.${eventId}: eventId 오류`);
    if (!isRecord(receipt) || !RECEIPT_TYPES.has(String(receipt.type)) || typeof receipt.payloadHash !== 'string'
      || !receipt.payloadHash || !isValidInstant(receipt.processedAt)) {
      issues.push(`receipts.${eventId}: receipt 오류`);
    }
  }

  if (!Array.isArray(raw.history)) issues.push('history: array가 아님');
  else raw.history.forEach((event, index) => {
    if (!isRecord(event) || typeof event.eventId !== 'string' || !EVENT_TYPES.has(String(event.type)) || !isValidInstant(event.at)) {
      issues.push(`history[${index}]: event 오류`);
      return;
    }
    if (event.expressionId !== undefined && !EXPRESSION_ID_RE.test(String(event.expressionId))) issues.push(`history[${index}].expressionId: ID 형식 오류`);
    if (event.episodeId !== undefined && !EPISODE_ID_RE.test(String(event.episodeId))) issues.push(`history[${index}].episodeId: ID 형식 오류`);
    if (event.seasonId !== undefined && !SEASON_ID_RE.test(String(event.seasonId))) issues.push(`history[${index}].seasonId: ID 형식 오류`);
    if (event.rating !== undefined && !RATINGS.has(event.rating as Rating)) issues.push(`history[${index}].rating: 허용값이 아님`);
  });

  if (raw.reviewFlow !== undefined) {
    const flow = raw.reviewFlow;
    if (!isRecord(flow) || !isValidDateOnly(flow.date) || !Array.isArray(flow.batches)) issues.push('reviewFlow: 구조 오류');
    else {
      const batchIds = new Set<string>();
      for (const [index, batch] of flow.batches.entries()) {
        if (!isRecord(batch) || typeof batch.id !== 'string' || !batch.id || !['daily', 'extra'].includes(String(batch.kind))
          || !Array.isArray(batch.expressionIds) || batch.expressionIds.length < 1 || batch.expressionIds.length > 3
          || !Array.isArray(batch.answeredIds) || !isValidInstant(batch.createdAt)) {
          issues.push(`reviewFlow.batches[${index}]: batch 오류`);
          continue;
        }
        if (batchIds.has(batch.id)) issues.push(`reviewFlow.batches[${index}].id: 중복`);
        batchIds.add(batch.id);
        const expressionIds = batch.expressionIds.map(String);
        const answeredIds = batch.answeredIds.map(String);
        if (new Set(expressionIds).size !== expressionIds.length || expressionIds.some((id) => !EXPRESSION_ID_RE.test(id))) {
          issues.push(`reviewFlow.batches[${index}].expressionIds: ID 오류`);
        }
        if (new Set(answeredIds).size !== answeredIds.length || answeredIds.some((id) => !expressionIds.includes(id))) {
          issues.push(`reviewFlow.batches[${index}].answeredIds: 대상 또는 중복 오류`);
        }
      }
      if (flow.activeBatchId !== undefined && (typeof flow.activeBatchId !== 'string' || !batchIds.has(flow.activeBatchId))) {
        issues.push('reviewFlow.activeBatchId: 존재하지 않는 batch');
      }
      if (flow.baseCompletedAt !== undefined && !isValidInstant(flow.baseCompletedAt)) issues.push('reviewFlow.baseCompletedAt: UTC Instant가 아님');
    }
  }
  if (raw.migration !== undefined) {
    const migration = raw.migration;
    if (!isRecord(migration) || migration.from !== 1 || !isValidInstant(migration.migratedAt)
      || typeof migration.sourceFingerprint !== 'string' || !migration.sourceFingerprint) {
      issues.push('migration: 구조 오류');
    } else if (migration.legacyCounters !== undefined && (!isRecord(migration.legacyCounters)
      || Object.values(migration.legacyCounters).some((value) => !Number.isFinite(value) || Number(value) < 0))) {
      issues.push('migration.legacyCounters: 0 이상 숫자가 아님');
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: raw as unknown as LearningStateV2 };
}

export function asSeasonId(value: string): SeasonId | null { return SEASON_ID_RE.test(value) ? value as SeasonId : null; }
export function asEpisodeId(value: string): EpisodeId | null { return EPISODE_ID_RE.test(value) ? value as EpisodeId : null; }
export function asExpressionId(value: string): ExpressionId | null { return EXPRESSION_ID_RE.test(value) ? value as ExpressionId : null; }
