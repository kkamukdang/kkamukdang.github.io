import { getKstDate, isValidDateOnly } from './date-kst';
import { createEmptyState } from './state';
import type {
  DateOnly, EpisodeId, ExpressionId, ExpressionStateV2, LearningEvent,
  LearningStateV2, Rating, ReviewStage, SeasonId,
} from './types';
import { EXPRESSION_ID_RE } from './validation';

export type LegacySnapshot = Record<string, string>;

export function isLegacyKey(key: string): boolean {
  return /^kkmd:expr:/.test(key) || /^kkmd:stamps:s\d+$/.test(key) || key === 'kkmd:counter' || key === 'kkmd:ui';
}

export function fingerprintLegacySnapshot(snapshot: LegacySnapshot): string {
  const text = Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}\u0000${value}`).join('\u0001');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function dateOnlyToInstant(value: unknown, fallback: string): string {
  if (!isValidDateOnly(value)) return fallback;
  return new Date(`${value}T00:00:00+09:00`).toISOString();
}

function legacyRating(value: unknown): Rating | null {
  return value === 'ok' ? 'remembered' : value === 'vague' ? 'fuzzy' : value === 'lost' ? 'unfamiliar' : null;
}

function stageFor(streak: number, graduated: boolean): ReviewStage {
  return graduated || streak >= 2 ? 'R3' : streak === 1 ? 'R2' : 'R1';
}

export function migrateLegacySnapshot(snapshot: LegacySnapshot, now: string): { ok: true; value: LearningStateV2; fingerprint: string } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const parsed = new Map<string, unknown>();
  for (const [key, raw] of Object.entries(snapshot)) {
    if (!isLegacyKey(key)) continue;
    try { parsed.set(key, JSON.parse(raw)); }
    catch { issues.push(`${key}: JSON을 읽을 수 없음`); }
  }
  if (issues.length) return { ok: false, issues };

  const state = createEmptyState(now);
  const today = getKstDate(new Date(now));
  const events: LearningEvent[] = [];
  for (const [key, value] of parsed) {
    if (key.startsWith('kkmd:expr:')) {
      const id = key.slice('kkmd:expr:'.length);
      if (!EXPRESSION_ID_RE.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) {
        issues.push(`${key}: 표현 상태 형식 오류`); continue;
      }
      const legacy = value as Record<string, unknown>;
      const rawStreak = Number.isInteger(legacy.streak) ? Number(legacy.streak) : 0;
      const streak = Math.max(0, Math.min(3, rawStreak)) as 0 | 1 | 2 | 3;
      const graduated = legacy.graduated === true || streak === 3;
      const observedAt = dateOnlyToInstant(legacy.lastSeen, now);
      const lastRating = legacyRating(legacy.state);
      const expression: ExpressionStateV2 = {
        registeredAt: observedAt,
        registeredSource: 'episode',
        reviewStage: stageFor(streak, graduated),
        rememberStreak: graduated ? 3 : streak,
        lastRating,
        cueBoost: lastRating === 'fuzzy' || lastRating === 'unfamiliar' ? 1 : 0,
        graduated,
        nextReviewDate: graduated ? null : (isValidDateOnly(legacy.nextDue) ? legacy.nextDue : today),
      };
      if (isValidDateOnly(legacy.lastSeen)) expression.lastReviewedAt = observedAt;
      if (graduated) expression.graduatedAt = observedAt;
      state.expressions[id as ExpressionId] = expression;
      events.push({ eventId: `migration:${id}`, type: 'expression_registered', at: now, expressionId: id as ExpressionId, source: 'episode', note: 'v1 lastSeen의 정확한 시각은 알 수 없어 KST 자정으로 변환' });
      if (graduated) events.push({ eventId: `migration:${id}:graduated`, type: 'expression_graduated', at: now, expressionId: id as ExpressionId });
    }
    if (/^kkmd:stamps:s\d+$/.test(key)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { issues.push(`${key}: 도장 상태 형식 오류`); continue; }
      const legacy = value as Record<string, unknown>;
      const seasonNumber = Number(key.match(/s(\d+)$/)?.[1]);
      const seasonId = `s${String(seasonNumber).padStart(2, '0')}` as SeasonId;
      for (const episodeNumber of Array.isArray(legacy.episodes) ? legacy.episodes : []) {
        if (!Number.isInteger(episodeNumber) || Number(episodeNumber) < 1) continue;
        const episodeId = `${seasonId}e${String(episodeNumber).padStart(2, '0')}` as EpisodeId;
        const completedAt = dateOnlyToInstant(legacy.completedAt, now);
        state.episodes[episodeId] = { completed: true, completedAt };
        events.push({ eventId: `migration:${episodeId}`, type: 'episode_completed', at: now, episodeId, seasonId });
      }
      const completed = legacy.completed === true;
      state.seasons[seasonId] = { review: { responses: {} }, completed };
      if (completed) {
        state.seasons[seasonId].completedAt = dateOnlyToInstant(legacy.completedAt, now);
        if (typeof legacy.code === 'string') state.seasons[seasonId].stampCode = legacy.code;
        events.push({ eventId: `migration:${seasonId}:completed`, type: 'season_completed', at: now, seasonId });
      }
    }
  }
  if (issues.length) return { ok: false, issues };
  const counter = parsed.get('kkmd:counter');
  const legacyCounters = counter && typeof counter === 'object' && !Array.isArray(counter)
    ? { reunions: Number((counter as Record<string, unknown>).reunions) || 0, graduated: Number((counter as Record<string, unknown>).graduated) || 0 }
    : undefined;
  const fingerprint = fingerprintLegacySnapshot(snapshot);
  state.history = events;
  state.migration = { from: 1, migratedAt: now, sourceFingerprint: fingerprint, ...(legacyCounters ? { legacyCounters } : {}) };
  return { ok: true, value: state, fingerprint };
}

