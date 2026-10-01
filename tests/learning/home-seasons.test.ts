import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { publicSeasonGroups } from '../../src/lib/ui/home-seasons';
import { initHomeSeasons } from '../../src/lib/client/home-seasons';

const episode = (season: number, no: number, flags = {}) => ({ id: `${season}-${no}`, data: { season, no, ...flags } });
describe('Home public seasons', () => {
  it('single season keeps all six cards and does not mutate source order', () => {
    const data = Array.from({ length: 6 }, (_, i) => episode(1, i + 1));
    const before = JSON.stringify(data);
    const groups = publicSeasonGroups(data);
    expect(groups.map(([season]) => season)).toEqual([1]);
    expect(groups[0][1].map((ep) => ep.data.no)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('two seasons with different sizes never mix cards', () => {
    const groups = publicSeasonGroups([episode(1, 1), episode(2, 3), episode(1, 2)]);
    expect(groups.map(([s, eps]) => [s, eps.length])).toEqual([[2, 1], [1, 2]]);
    for (const [season, eps] of groups) expect(eps.every((ep) => ep.data.season === season)).toBe(true);
  });
  it('three seasons numerically ordered; all 18 cards included beyond legacy page size 12', () => {
    const data = [1, 2, 10].flatMap((s) => Array.from({ length: 6 }, (_, i) => episode(s, i + 1)));
    const groups = publicSeasonGroups(data);
    expect(groups.map(([s]) => s)).toEqual([10, 2, 1]);
    expect(groups.map(([, eps]) => eps.length)).toEqual([6, 6, 6]);
    expect(groups.flatMap(([, eps]) => eps)).toHaveLength(18);
  });
  it('draft/unlisted never create options or cards, even in development input', () => {
    expect(publicSeasonGroups([episode(1, 1), episode(20, 2, { draft: true }), episode(30, 3, { unlisted: true })]).map(([s]) => s)).toEqual([1]);
    expect(publicSeasonGroups([episode(2, 1, { draft: true })])).toEqual([]);
  });
});

class Element {
  hidden = false; value = ''; textContent = ''; innerHTML = '';
  dataset: Record<string, string> = {}; style = { display: '' };
  events: Record<string, () => unknown> = {};
  classList = { toggle: (_name: string, _on: boolean) => {}, remove: (_name: string) => {} };
  addEventListener(name: string, callback: () => unknown) { this.events[name] = callback; }
}
function fixture(seasons = [2, 1]) {
  const select = new Element(); select.value = '1'; select.dataset.defaultSeason = String(seasons[0]);
  const control = new Element(); control.hidden = true;
  const label = new Element(), description = new Element(), announcement = new Element();
  const panels = seasons.map((s) => {
    const p = new Element(); p.hidden = s !== seasons[0];
    p.dataset = { homeSeasonPanel: String(s), description: `description-${s}`, count: '2' }; return p;
  });
  const controls: Record<string, Element> = {
    '[data-home-season-select]': select, '[data-home-season-control]': control,
    '[data-home-season-label]': label, '[data-home-season-description]': description,
    '[data-home-season-status]': announcement,
  };
  const ids = Object.fromEntries(['q', 'results', 'search-status', 'epList', 'tagRow', 'episodes'].map((id) => [id, new Element()]));
  const chips = ['', '거절·미루기'].map((tag) => { const c = new Element(); c.dataset.tag = tag; return c; });
  const cards = seasons.flatMap(() => ['거절·미루기', '상황 설명'].map((tag) => { const c = new Element(); c.dataset.tags = tag; return c; }));
  const doc = {
    querySelector: (query: string) => controls[query] ?? null,
    querySelectorAll: (query: string) => query === '[data-home-season-panel]' ? panels : query === '.ep-card' ? cards : query === '.tag-chip[data-tag]' ? chips : [],
    getElementById: (id: string) => ids[id] ?? null,
  };
  return { select, control, label, description, announcement, panels, ids, chips, cards, doc: doc as unknown as Document };
}
describe('Home season control and existing search/tag script', () => {
  it('one season leaves the fallback visible, without activating a control', () => {
    const f = fixture([1]); initHomeSeasons(f.doc);
    expect(f.control.hidden).toBe(true); expect(f.label.hidden).toBe(false);
    expect(f.panels[0].hidden).toBe(false); expect(f.select.events.change).toBeUndefined();
  });
  it('latest default, change, announcement and invalid selection protection', () => {
    const f = fixture([10, 2, 1]); initHomeSeasons(f.doc);
    expect(f.select.value).toBe('10'); expect(f.control.hidden).toBe(false); expect(f.label.hidden).toBe(true);
    expect(f.panels.map((p) => p.hidden)).toEqual([false, true, true]);
    f.select.value = '1'; f.select.events.change();
    expect(f.panels.map((p) => p.hidden)).toEqual([true, true, false]);
    expect(f.description.textContent).toBe('description-1');
    expect(f.announcement.textContent).toBe('시즌 1 · 2개 에피소드');
    f.select.value = '99'; f.select.events.change();
    expect(f.panels.map((p) => p.hidden)).toEqual([true, true, false]);
  });
  it('actual legacy script: tags cannot expose another season; global search/zero/failure/clear retain selected season', async () => {
    const f = fixture(); initHomeSeasons(f.doc);
    const page = readFileSync(new URL('../../src/pages/[...page].astro', import.meta.url), 'utf8');
    const script = page.match(/<script is:inline>([\s\S]*?)<\/script>/)![1];
    let timer: () => Promise<void> = async () => {}, delay = 0, fails = true;
    const data = [1, 2].map((season) => ({ no: season, p: [['我慢']], q: '我慢', subtitle: '참기', tags: [], url: `/ep/s${season}/`, entries: [] }));
    runInNewContext(script, {
      document: f.doc, window: { __INDEX__: '/search.json' },
      setTimeout: (fn: () => Promise<void>, ms: number) => { timer = fn; delay = ms; }, clearTimeout: () => {},
      fetch: async () => { if (fails) throw new Error('offline'); return { json: async () => data }; },
    });
    f.chips[1].events.click();
    expect(f.cards.map((c) => c.style.display)).toEqual(['', 'none', '', 'none']);
    expect(f.panels.map((p) => p.hidden)).toEqual([false, true]);
    f.select.value = '1'; f.select.events.change();
    expect(f.panels.map((p) => p.hidden)).toEqual([true, false]);
    f.ids.q.value = '我慢'; f.ids.q.events.input(); expect(delay).toBe(140); await timer();
    expect(f.ids['search-status'].textContent).toContain('불러오지 못');
    fails = false; f.ids.q.events.input(); await timer();
    expect(f.ids.results.innerHTML).toContain('/ep/s1/'); expect(f.ids.results.innerHTML).toContain('/ep/s2/');
    expect(f.ids.epList.style.display).toBe('none');
    f.ids.q.value = 'zzzz'; f.ids.q.events.input(); await timer();
    expect(f.ids['search-status'].textContent).toContain('결과가 없');
    f.ids.q.value = ''; f.ids.q.events.input(); await timer();
    expect(f.ids.epList.style.display).toBe(''); expect(f.ids.tagRow.style.display).toBe('');
    expect(f.panels.map((p) => p.hidden)).toEqual([true, false]);
    expect(f.cards.map((c) => c.style.display)).toEqual(['', 'none', '', 'none']);
    f.chips[0].events.click();
    expect(f.cards.every((c) => c.style.display === '')).toBe(true);
    expect(f.panels.map((p) => p.hidden)).toEqual([true, false]);
  });
});
