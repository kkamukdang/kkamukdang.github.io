import { afterEach, describe, expect, it, vi } from 'vitest';
import { initEpisodeLearningPage } from '../../src/lib/client/episode-learning';
import { STORAGE_KEYS } from '../../src/lib/learning/local-storage';
import type { LearningStateV2 } from '../../src/lib/learning/types';
import { MemoryStorage } from '../helpers';

class Element {
  dataset: Record<string, string> = {}; disabled = false; hidden = false; textContent = '';
  classes = new Set<string>(); events: Record<string, () => void> = {};
  classList = { add: (s: string) => this.classes.add(s), toggle: (s: string, on: boolean) => on ? this.classes.add(s) : this.classes.delete(s) };
  attributes: Record<string, string> = {};
  setAttribute(k: string, v: string) { this.attributes[k] = v; }
  addEventListener(k: string, fn: () => void) { this.events[k] = fn; }
  querySelector(_q: string): Element | null { return null; }
  querySelectorAll(_q: string): Element[] { return []; }
}
const ids = ['s01e01-temoii', 's01e01-gaman', 's01e01-baiiyo'];
function setup(storage = new MemoryStorage()) {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T03:00:00Z'));
  const root = new Element(), board = new Element(), end = new Element(), status = new Element(), progress = new Element(), final = new Element();
  root.dataset = { learningV2: 'true', episodeId: 's01e01', seasonId: 's01', episodeNo: '1', catalogUrl: '/expressions.json' };
  board.dataset = { season: '1', mark: '1', exprs: ids.join(',') };
  const cells = Array.from({ length: 6 }, (_, i) => { const e = new Element(); e.dataset.no = String(i + 1); return e; });
  const buttons = ids.map((id) => { const e = new Element(); e.dataset.unsure = id; return e; });
  root.querySelector = (q) => q === '.stampboard' ? board : q === '#todayEnd' ? end : buttons.find((b) => q === `[data-unsure="${b.dataset.unsure}"]`) ?? null;
  root.querySelectorAll = (q) => q === '[data-unsure]' ? buttons : [];
  board.querySelector = (q) => q === '.stamp-said' ? status : q === '[data-progress]' ? progress : q === '.stamp-cell[data-final]' ? final : q === '.stamp-cell[data-final].on' ? (final.classes.has('on') ? final : null) : cells.find((c) => q === `.stamp-cell[data-no="${c.dataset.no}"]`) ?? null;
  board.querySelectorAll = (q) => q === '.stamp-cell[data-no]' ? cells : q === '.stamp-cell[data-no].on' ? cells.filter((c) => c.classes.has('on')) : [];
  const observed: Element[] = []; let callback: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  class Observer {
    constructor(fn: typeof callback, options: unknown) { callback = fn; expect(options).toEqual({ rootMargin: '0px 0px -10% 0px' }); }
    observe(e: Element) { observed.push(e); } disconnect() {}
  }
  vi.stubGlobal('document', { querySelector: () => root });
  vi.stubGlobal('window', { localStorage: storage, IntersectionObserver: Observer });
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ids.map((id) => ({ id, jp: id, kr: id, no: 1, season: 1, registry: { active: true }, prompts: { R1: { id: `${id}:R1`, mode: 'scene', stage: 'R1', cue: 'cue', answer: 'answer' }, R2: {}, R3: {} } })) }));
  return { storage, buttons, cells, end, observed, status, complete: () => callback!([{ isIntersecting: true }]), snapshot: () => JSON.parse(storage.getItem(STORAGE_KEYS.state)!) as LearningStateV2 };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Unchanged Episode client with redesigned DOM contract', () => {
  it('only #todayEnd is observed; seeing a board does not complete an episode', async () => {
    const f = setup(); await initEpisodeLearningPage();
    expect(f.observed).toEqual([f.end]);
    expect(f.storage.getItem(STORAGE_KEYS.state)).toBeNull();
    f.complete();
    expect(Object.keys(f.snapshot().expressions)).toHaveLength(3);
    expect(Object.keys(f.snapshot().episodes)).toEqual(['s01e01']);
    expect(f.cells[0].classes.has('on')).toBe(true);
  });
  it('unsure first retains tomorrow after completion; repeat arrival/revisit never duplicate history/receipts/stamp', async () => {
    const f = setup(); await initEpisodeLearningPage(); f.buttons[0].events.click();
    expect(f.buttons[0].disabled).toBe(true); expect(f.buttons[0].dataset.done).toBe('1');
    expect(f.buttons[0].textContent).toContain('내일 다시 만나요');
    expect(f.snapshot().expressions[ids[0] as keyof LearningStateV2['expressions']].nextReviewDate).toBe('2026-10-02');
    f.complete();
    const first = f.snapshot();
    expect(first.expressions[ids[0] as keyof typeof first.expressions].nextReviewDate).toBe('2026-10-02');
    expect(first.expressions[ids[1] as keyof typeof first.expressions].nextReviewDate).toBe('2026-10-04');
    f.complete(); expect(f.snapshot().receipts).toEqual(first.receipts); expect(f.snapshot().history).toEqual(first.history);
    const revisit = setup(f.storage); await initEpisodeLearningPage();
    expect(revisit.buttons[0].disabled).toBe(true); expect(revisit.buttons[0].dataset.done).toBe('1');
    revisit.complete(); expect(revisit.snapshot().receipts).toEqual(first.receipts); expect(revisit.snapshot().history).toEqual(first.history);
  });
  it('failed unsure writes restore button and announce an error', async () => {
    const f = setup(); await initEpisodeLearningPage(); f.storage.failWrites = true; f.buttons[0].events.click();
    expect(f.buttons[0].disabled).toBe(false); expect(f.buttons[0].dataset.done).toBeUndefined();
    expect(f.status.attributes.role).toBe('alert');
  });
});
