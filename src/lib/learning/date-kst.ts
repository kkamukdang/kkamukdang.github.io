import type { DateOnly, Instant, LearningStateV2 } from './types';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ALLOWED_DAYS = new Set([1, 2, 3, 5, 7, 14]);

export function isValidDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== 'string') return false;
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidInstant(value: unknown): value is Instant {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

export function getKstDate(now: Date): DateOnly {
  if (!Number.isFinite(now.getTime())) throw new TypeError('유효한 Date가 필요합니다');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now) as DateOnly;
}

export function addCalendarDays(date: DateOnly, days: 1 | 2 | 3 | 5 | 7 | 14): DateOnly {
  if (!isValidDateOnly(date) || !ALLOWED_DAYS.has(days)) throw new TypeError('유효한 DateOnly와 간격이 필요합니다');
  const [year, month, day] = date.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day, 12));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10) as DateOnly;
}

export function isDue(next: DateOnly | null, today: DateOnly): boolean {
  if (next === null) return false;
  if (!isValidDateOnly(next) || !isValidDateOnly(today)) return false;
  return next <= today;
}

export interface EffectiveClock {
  date: DateOnly;
  rollbackDetected: boolean;
  observedAt: Instant;
}

export function getEffectiveClock(
  now: Date,
  previous?: LearningStateV2['clock'],
): EffectiveClock {
  const observedAt = now.toISOString();
  const deviceDate = getKstDate(now);
  if (!previous) return { date: deviceDate, rollbackDetected: false, observedAt };
  const rollbackDetected = now.getTime() < Date.parse(previous.lastObservedAt) - 5 * 60_000;
  return {
    date: rollbackDetected && previous.lastObservedDate > deviceDate
      ? previous.lastObservedDate
      : deviceDate,
    rollbackDetected,
    observedAt,
  };
}

