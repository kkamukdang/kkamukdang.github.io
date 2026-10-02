import { describe, expect, it } from 'vitest';
import { heroPreviewScenes, HERO_PREVIEW_SCENES, HERO_DESKTOP_LIMIT, HERO_MOBILE_LIMIT } from '../../src/lib/ui/hero-scenes';
import { selectDueExpressions } from '../../src/lib/learning/queue';
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
  registry: { active: true }, prompts: { R1: { scene: { kr: `대화 문장 전체 ${id}` } }, R2: {}, R3: {} },
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
const intro = { kind: 'intro', scenes: heroPreviewScenes() };
describe('Main Hero read-only state', () => {
  it('무기록은 샘플, 학습 후 미래 만기는 empty Hero', () => {
    expect(homeHeroModel(new MemoryStorage(), catalog, now)).toEqual(intro);
    expect(homeHeroModel(fixture().storage, catalog, now)).toEqual(intro);
    expect(homeHeroModel(fixture(expression('2026-10-02')).storage, catalog, now)).toEqual({ kind: 'empty', scenes: [] });
  });
  it('KST 만기를 기존 selector로 선택하며 저장/queue/history/receipt를 변경하지 않음', () => {
    const { storage } = fixture(expression('2026-10-01'));
    const before = [...storage.data];
    expect(homeHeroModel(storage, catalog, now)).toEqual({ kind: 'due', scenes: [{ id, text: catalog[0].prompts!.R1.scene!.kr }] });
    expect(homeHeroModel(storage, catalog, now).kind).toBe('due');
    expect([...storage.data]).toEqual(before);
    expect(storage.writeCount).toBe(0);
  });
  it('여러 만기 중 기존 날짜 우선순위 유지', () => {
    const { storage, state } = fixture(expression('2026-10-01'));
    state.expressions[second] = expression('2026-09-28');
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
    const model = homeHeroModel(storage, catalog, now);
    expect(model.kind === 'due' && model.scenes[0].id).toBe(second);
  });
  it('졸업/비활성/복습 콘텐츠 없는 표현은 노출하지 않음', () => {
    const graduated = { ...expression(null), graduated: true, rememberStreak: 3 as const, reviewStage: 'R3' as const, graduatedAt: now.toISOString() };
    expect(homeHeroModel(fixture(graduated).storage, catalog, now).kind).toBe('empty');
    const { storage } = fixture(expression('2026-09-01'));
    expect(homeHeroModel(storage, [{ ...catalog[0], registry: { active: false } }], now).kind).toBe('empty');
    expect(homeHeroModel(storage, [{ ...catalog[0], prompts: null }], now).kind).toBe('empty');
  });
  it('v2를 legacy보다 우선하고 corrupt v2를 legacy로 덮어 해석하지 않음', () => {
    const { storage } = fixture(expression('2026-10-02'));
    storage.setItem(`kkmd:expr:${id}`, JSON.stringify({ nextDue: '2026-09-01', streak: 0 }));
    expect(homeHeroModel(storage, catalog, now).kind).toBe('empty');
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
    expect(homeHeroModel(storage, catalog, now)).toEqual(intro);
  });
});


describe('Hero real dialogue limits and fixed preview', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ ...catalog[0], id: `s01e01-test${String.fromCharCode(97 + i)}` as ExpressionId,
    prompts: { ...catalog[0].prompts!, R1: { ...catalog[0].prompts!.R1, scene: { who: '나', kr: `한국어 전체 문장 ${i}.`, jpHtml: '정답 HTML' } } },
  }));
  it.each([0, 1, 2, 3, 4, 6])('due %i — actual items only, Desktop 4 / Mobile 2', (count) => {
    const { storage, state } = fixture();
    for (const item of items.slice(0, count)) state.expressions[item.id] = expression('2026-10-01');
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state)); storage.writeCount = 0;
    const before = [...storage.data];
    const model = homeHeroModel(storage, items, now);
    expect(model.kind).toBe(count ? 'due' : 'intro');
    if (model.kind === 'due') {
      expect(model.scenes).toHaveLength(Math.min(count, HERO_DESKTOP_LIMIT));
      expect(model.scenes.slice(0, HERO_MOBILE_LIMIT)).toHaveLength(Math.min(count, 2));
      expect(model.scenes.every(scene => /^한국어 전체 문장/.test(scene.text))).toBe(true);
      expect(JSON.stringify(model)).not.toContain(catalog[0].jp);
      expect(JSON.stringify(model)).not.toContain('정답 HTML');
    }
    expect([...storage.data]).toEqual(before); expect(storage.writeCount).toBe(0);
  });
  it('uses active-batch remaining order before the normal due selector, without creating a stored flow', () => {
    const { storage, state } = fixture();
    for (const item of items) state.expressions[item.id] = expression('2026-10-01');
    state.reviewFlow = { date: '2026-10-01', activeBatchId: 'active', batches: [{ id: 'active', kind: 'daily',
      createdAt: now.toISOString(), expressionIds: [items[2].id, items[1].id, items[0].id], answeredIds: [items[2].id] }] };
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state)); storage.writeCount = 0;
    const model = homeHeroModel(storage, items, now);
    expect(model.kind === 'due' && model.scenes.map(scene => scene.id)).toEqual([items[1].id, items[0].id, items[3].id, items[4].id]);
    const registry = Object.fromEntries(items.map(item => [item.id, { active: true, episodeId: 's01e01' }]));
    delete state.reviewFlow;
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state)); storage.writeCount = 0;
    const fresh = homeHeroModel(storage, items, now);
    expect(fresh.kind === 'due' && fresh.scenes.map(scene => scene.id)).toEqual(selectDueExpressions(state, registry, '2026-10-01', new Set(), 4));
    expect(storage.writeCount).toBe(0);
  });
  it('keeps the four approved preview sentences/icons unchanged across days, seasons and catalog order', () => {
    const fixed = [
      { id: 'preview-spoiler', text: '야 잠깐! 스포 하지 마!', icon: '🙊' },
      { id: 'preview-baseball', text: '내가 자리만 비우면 꼭 점수 나더라…', icon: '⚾' },
      { id: 'preview-takeout', text: '배달이 아니라 포장으로 되어있잖아!?', icon: '🛵' },
      { id: 'preview-chicken', text: '있잖아… 오늘 밤 치킨 시켜도 될까?', icon: '🍗' },
    ];
    expect(heroPreviewScenes()).toEqual(fixed);
    for (const date of [now, new Date('2026-10-02T14:59:00Z'), new Date('2027-01-01T00:00:00Z')]) {
      for (const data of [[], items, [...items].reverse(), [{ ...items[0], season: 2 }]]) {
        expect(homeHeroModel(new MemoryStorage(), data, date)).toEqual({ kind: 'intro', scenes: fixed });
      }
    }
    expect(fixed.slice(0, HERO_MOBILE_LIMIT).map(scene => scene.icon)).toEqual(['🙊', '⚾']);
  });
  it('preview edits in one render cannot mutate the shared sample or the next render', () => {
    const first = heroPreviewScenes();
    first[0].text = 'changed'; first[0].icon = 'changed'; first.pop();
    expect(heroPreviewScenes()).toEqual(HERO_PREVIEW_SCENES);
    expect(heroPreviewScenes()).toHaveLength(4);
  });
  it('missing dialogue never exposes a Japanese answer or fills a due slot with an intro sample', () => {
    const { storage } = fixture(expression('2026-10-01'));
    const broken = { ...catalog[0], prompts: { ...catalog[0].prompts!, R1: { ...catalog[0].prompts!.R1, scene: undefined } } };
    expect(homeHeroModel(storage, [broken, catalog[1]], now)).toEqual({ kind: 'due', scenes: [] });
  });
});


describe('Hero empty state and representative icon', () => {
  it('never fills a small due list with past learning history, and keeps the actual Episode icon', () => {
    const { storage, state } = fixture(expression('2026-10-01'));
    state.expressions[second] = expression('2026-10-03');
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state)); storage.writeCount = 0;
    const withIcons = catalog.map(item => ({ ...item, emoji: '🍗🌙' }));
    const result = homeHeroModel(storage, withIcons, now);
    expect(result).toEqual({ kind: 'due', scenes: [{ id, text: catalog[0].prompts!.R1.scene!.kr, icon: '🍗🌙' }] });
    expect(storage.writeCount).toBe(0);
  });
  it('completed Episode history without a remaining expression yields no samples or bubbles', () => {
    const { storage, state } = fixture();
    state.episodes.s01e01 = { completed: true, completedAt: now.toISOString() };
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state)); storage.writeCount = 0;
    expect(homeHeroModel(storage, catalog, now)).toEqual({ kind: 'empty', scenes: [] });
    expect(storage.writeCount).toBe(0);
  });
  it('retains repeated Episode icons on every due bubble without substituting or merging them', () => {
    const { storage, state } = fixture(expression('2026-10-01'));
    state.expressions[second] = expression('2026-10-01');
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state)); storage.writeCount = 0;
    const result = homeHeroModel(storage, catalog.map(item => ({ ...item, emoji: '🍗🌙' })), now);
    expect(result.kind).toBe('due');
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes.map(scene => scene.icon)).toEqual(['🍗🌙', '🍗🌙']);
    expect(result.scenes.map(scene => scene.text)).toEqual(catalog.map(item => item.prompts!.R1.scene!.kr));
    expect(storage.writeCount).toBe(0);
  });

});
