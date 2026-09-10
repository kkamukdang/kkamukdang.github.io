import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter, STORAGE_KEYS } from '../../src/lib/learning/local-storage';
import { MemoryStorage } from '../helpers';

const NOW = new Date('2026-09-10T03:00:00.000Z');

describe('v1 → v2 migration', () => {
  it('표현, 졸업, 도장, counter를 보존하고 원본 backup을 만든다', () => {
    const storage = new MemoryStorage();
    storage.setItem('kkmd:expr:s01e01-temoii', JSON.stringify({ state: 'ok', streak: 2, nextDue: '2026-09-20', lastSeen: '2026-09-09', graduated: false }));
    storage.setItem('kkmd:expr:s01e01-gaman', JSON.stringify({ state: 'ok', streak: 3, nextDue: '2026-09-20', lastSeen: '2026-09-08', graduated: true }));
    storage.setItem('kkmd:stamps:s1', JSON.stringify({ episodes: [1, 2], completed: true, completedAt: '2026-09-09', code: 'S1-TEST' }));
    storage.setItem('kkmd:counter', JSON.stringify({ reunions: 4, graduated: 1 }));
    const result = new LocalStorageAdapter(storage, () => NOW).migrate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expressions['s01e01-temoii']).toMatchObject({ reviewStage: 'R3', rememberStreak: 2, lastRating: 'remembered' });
    expect(result.value.expressions['s01e01-gaman']).toMatchObject({ graduated: true, rememberStreak: 3, nextReviewDate: null });
    expect(result.value.episodes.s01e01.completed).toBe(true);
    expect(result.value.seasons.s01.completed).toBe(true);
    expect(result.value.migration?.legacyCounters).toEqual({ reunions: 4, graduated: 1 });
    expect(storage.getItem(STORAGE_KEYS.backup)).not.toBeNull();
    expect(storage.getItem(STORAGE_KEYS.migration)).not.toBeNull();
    expect(storage.getItem('kkmd:expr:s01e01-temoii')).not.toBeNull();
  });
  it('retired ID를 그대로 보존하고 replacement로 이전하지 않는다', () => {
    const storage = new MemoryStorage();
    storage.setItem('kkmd:expr:s01e04-maniau', JSON.stringify({ state: 'vague', streak: 0, nextDue: '2026-09-11', lastSeen: '2026-09-01', graduated: false }));
    const result = new LocalStorageAdapter(storage, () => NOW).migrate();
    expect(result.ok && result.value.expressions['s01e04-maniau']).toBeTruthy();
    expect(result.ok && result.value.expressions['s01e04-madaikeru']).toBeUndefined();
  });
  it('migration 실패 시 v1 원본을 유지하고 v2를 쓰지 않는다', () => {
    const storage = new MemoryStorage(); storage.setItem('kkmd:expr:s01e01-temoii', '{bad');
    const result = new LocalStorageAdapter(storage, () => NOW).migrate();
    expect(result.ok).toBe(false);
    expect(storage.getItem('kkmd:expr:s01e01-temoii')).toBe('{bad');
    expect(storage.getItem(STORAGE_KEYS.state)).toBeNull();
  });
  it('persist:false preview는 어떤 key도 쓰지 않는다', () => {
    const storage = new MemoryStorage(); storage.setItem('kkmd:counter', JSON.stringify({ reunions: 1 }));
    const before = storage.length; const writesBefore = storage.writeCount;
    const result = new LocalStorageAdapter(storage, () => NOW).migrate({ persist: false });
    expect(result.ok && result.persisted).toBe(false); expect(storage.length).toBe(before); expect(storage.writeCount).toBe(writesBefore);
  });
  it('동일 fingerprint의 완료 marker가 있으면 v2 유실 후 중복 migration하지 않는다', () => {
    const storage = new MemoryStorage();
    storage.setItem('kkmd:counter', JSON.stringify({ reunions: 1 }));
    const adapter = new LocalStorageAdapter(storage, () => NOW);
    expect(adapter.migrate().ok).toBe(true);
    storage.removeItem(STORAGE_KEYS.state);
    const writesBefore = storage.writeCount;
    const retried = adapter.migrate();
    expect(retried).toMatchObject({ ok: false, code: 'invalid-v2' });
    expect(storage.writeCount).toBe(writesBefore + 1); // availability probe만 기록
    expect(storage.getItem('kkmd:counter')).not.toBeNull();
  });
});
