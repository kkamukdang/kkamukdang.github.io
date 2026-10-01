import { describe, expect, it } from 'vitest';
import { homeHeroModel } from '../../src/lib/client/home-hero';
import type { BrowserExpression } from '../../src/lib/client/learning-client';
import { createEmptyState } from '../../src/lib/learning/state';
import { STORAGE_KEYS } from '../../src/lib/learning/local-storage';
import type { ExpressionId, ExpressionStateV2 } from '../../src/lib/learning/types';
import { MemoryStorage } from '../helpers';

const now = new Date('2026-09-30T15:30:00.000Z'); // Already October 1 in KST.
const id = 's01e01-gaman' as ExpressionId;
const second = 's01e01-baiiyo' as ExpressionId;
const catalog = [id, second].map((id) => ({
  id, jp: '我慢できない', kr: '못 참겠어', no: 1, season: 1,
  registry: { active: true }, prompts: { R1: {}, R2: {}, R3: {} },
})) as BrowserExpression[];
const expression = (nextReviewDate: ExpressionStateV2['nextReviewDate']): ExpressionStateV2 => ({
  registeredAt: now.toISOString(), registeredSource: 'episode', reviewStage: 'R1',
  rememberStreak: 0, lastRating: null, cueBoost: 0, graduated: false, nextReviewDate,
});
function fixture(value?: ExpressionStateV2) {
  const storage = new MemoryStorage();
  const state = createEmptyState(now.toISOString());
  if (value) state.expressions[id] = value;
  storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
  storage.writeCount = 0;
  return { storage, state };
}
describe('Main Hero read-only state', () => {
  it('무기록 및 미래 만기는 기본 Hero', () => {
    expect(homeHeroModel(new MemoryStorage(), catalog, now)).toEqual({ kind: 'intro' });
    expect(homeHeroModel(fixture().storage, catalog, now)).toEqual({ kind: 'intro' });
    expect(homeHeroModel(fixture(expression('2026-10-02')).storage, catalog, now)).toEqual({ kind: 'intro' });
  });
  it('KST 만기를 기존 selector로 선택하며 저장/queue/history/receipt를 변경하지 않음', () => {
    const { storage } = fixture(expression('2026-10-01'));
    const before = [...storage.data];
    expect(homeHeroModel(storage, catalog, now)).toEqual({ kind: 'due', expression: catalog[0] });
    expect(homeHeroModel(storage, catalog, now).kind).toBe('due');
    expect([...storage.data]).toEqual(before);
    expect(storage.writeCount).toBe(0);
  });
  it('여러 만기 중 기존 날짜 우선순위의 한 표현만 사용', () => {
    const { storage, state } = fixture(expression('2026-10-01'));
    state.expressions[second] = expression('2026-09-28');
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
    const model = homeHeroModel(storage, catalog, now);
    expect(model.kind === 'due' && model.expression.id).toBe(second);
  });
  it('졸업/비활성/복습 콘텐츠 없는 표현은 노출하지 않음', () => {
    const graduated = { ...expression(null), graduated: true, rememberStreak: 3 as const, reviewStage: 'R3' as const, graduatedAt: now.toISOString() };
    expect(homeHeroModel(fixture(graduated).storage, catalog, now).kind).toBe('intro');
    const { storage } = fixture(expression('2026-09-01'));
    expect(homeHeroModel(storage, [{ ...catalog[0], registry: { active: false } }], now).kind).toBe('intro');
    expect(homeHeroModel(storage, [{ ...catalog[0], prompts: null }], now).kind).toBe('intro');
  });
  it('v2를 legacy보다 우선하고 corrupt v2를 legacy로 덮어 해석하지 않음', () => {
    const { storage } = fixture(expression('2026-10-02'));
    storage.setItem(`kkmd:expr:${id}`, JSON.stringify({ nextDue: '2026-09-01', streak: 0 }));
    expect(homeHeroModel(storage, catalog, now).kind).toBe('intro');
    storage.setItem(STORAGE_KEYS.state, '{broken'); storage.writeCount = 0;
    expect(homeHeroModel(storage, catalog, now).kind).toBe('intro');
    expect(storage.writeCount).toBe(0);
    expect(storage.getItem(STORAGE_KEYS.corrupt)).toBeNull();
  });
  it('legacy profile은 기존 migration을 메모리에서만 투영', () => {
    const storage = new MemoryStorage();
    storage.setItem(`kkmd:expr:${id}`, JSON.stringify({ nextDue: '2026-09-01', streak: 0 }));
    storage.writeCount = 0; const before = [...storage.data];
    expect(homeHeroModel(storage, catalog, now).kind).toBe('due');
    expect([...storage.data]).toEqual(before);
    expect(storage.writeCount).toBe(0);
  });
  it('차단된 storage는 기본 Hero로 복구', () => {
    const storage = { length: 0, key: () => null, getItem: () => { throw new Error('blocked'); } };
    expect(homeHeroModel(storage, catalog, now)).toEqual({ kind: 'intro' });
  });
});
