import { describe, expect, it } from 'vitest';
import { addCalendarDays, getEffectiveClock, getKstDate, isDue } from '../../src/lib/learning/date-kst';

describe('KST DateOnly', () => {
  it('KST 자정 경계를 사용한다', () => {
    expect(getKstDate(new Date('2026-09-10T14:59:59Z'))).toBe('2026-09-10');
    expect(getKstDate(new Date('2026-09-10T15:00:00Z'))).toBe('2026-09-11');
  });
  it('월말과 연말을 달력 날짜로 계산한다', () => {
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-12-20', 14)).toBe('2027-01-03');
  });
  it('지원 간격과 due를 계산한다', () => {
    expect(addCalendarDays('2026-09-10', 2)).toBe('2026-09-12');
    expect(addCalendarDays('2026-09-10', 3)).toBe('2026-09-13');
    expect(addCalendarDays('2026-09-10', 5)).toBe('2026-09-15');
    expect(addCalendarDays('2026-09-10', 7)).toBe('2026-09-17');
    expect(isDue('2026-09-10', '2026-09-10')).toBe(true);
    expect(isDue(null, '2026-09-10')).toBe(false);
  });
  it('clock rollback 때 마지막 관찰 날짜보다 과거로 가지 않는다', () => {
    const result = getEffectiveClock(new Date('2026-09-09T00:00:00Z'), { lastObservedAt: '2026-09-10T00:10:00Z', lastObservedDate: '2026-09-10' });
    expect(result.rollbackDetected).toBe(true);
    expect(result.date).toBe('2026-09-10');
  });
});
