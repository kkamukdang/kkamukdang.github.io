import { STORAGE_KEYS, type StorageLike } from '../learning/local-storage';
import { isLegacyKey, migrateLegacySnapshot } from '../learning/migration-v1';
import { validateLearningState } from '../learning/validation';
import { selectDueExpressions } from '../learning/queue';
import { reviewableExpressions, todayKst, type BrowserExpression } from './learning-client';

export type HomeHeroModel = { kind: 'intro' } | { kind: 'due'; expression: BrowserExpression };

/** Display-only snapshot. Never probe/write storage, persist migration, or create a batch. */
export function homeHeroModel(
  storage: Pick<StorageLike, 'length' | 'key' | 'getItem'>,
  catalog: BrowserExpression[],
  now = new Date(),
): HomeHeroModel {
  try {
    const raw = storage.getItem(STORAGE_KEYS.state);
    let state;
    if (raw !== null) {
      const validated = validateLearningState(JSON.parse(raw));
      if (!validated.ok) return { kind: 'intro' };
      state = validated.value;
    } else {
      const legacy: Record<string, string> = {};
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key && isLegacyKey(key)) {
          const value = storage.getItem(key);
          if (value !== null) legacy[key] = value;
        }
      }
      const projected = migrateLegacySnapshot(legacy, now.toISOString());
      if (!projected.ok) return { kind: 'intro' };
      state = projected.value;
    }
    const ready = reviewableExpressions(catalog);
    const registry = Object.fromEntries(ready.map((item) => [item.id, {
      active: true,
      episodeId: `s${String(item.season).padStart(2, '0')}e${String(item.no).padStart(2, '0')}`,
    }]));
    const [id] = selectDueExpressions(state, registry, todayKst(now), new Set(), 1);
    const expression = ready.find((item) => item.id === id);
    return expression ? { kind: 'due', expression } : { kind: 'intro' };
  } catch {
    return { kind: 'intro' };
  }
}

export function initHomeHero(): void {
  const root = document.querySelector<HTMLElement>('[data-home-hero]');
  const title = root?.querySelector<HTMLElement>('#home-intro-title');
  const link = root?.querySelector<HTMLAnchorElement>('.home-browse');
  const representative = root?.querySelector<HTMLElement>('[data-hero-expression]');
  const jp = representative?.querySelector<HTMLElement>('[data-hero-jp]');
  const kr = representative?.querySelector<HTMLElement>('[data-hero-kr]');
  if (!root || !title || !link || !representative || !jp || !kr) return;
  let catalog: BrowserExpression[] = [];
  function paint(): void {
    let model: HomeHeroModel = { kind: 'intro' };
    try { model = homeHeroModel(window.localStorage, catalog); } catch { /* Storage getter can be denied. */ }
    root!.dataset.heroState = model.kind;
    representative!.hidden = model.kind !== 'due';
    if (model.kind === 'due') {
      title!.textContent = '지난번에 만난 표현, 기억나세요?';
      jp!.innerHTML = model.expression.jp; // Existing catalog's trusted ruby HTML.
      kr!.textContent = model.expression.kr;
      link!.textContent = '다시 만나기 →';
      link!.href = root!.dataset.againUrl!;
    } else {
      title!.replaceChildren(document.createTextNode('이런 표현을'), document.createElement('br'), document.createTextNode('만날 수 있어요!'));
      jp!.textContent = ''; kr!.textContent = '';
      link!.textContent = '에피소드 둘러보기 ↓'; link!.href = '#episodes';
    }
  }
  fetch(root.dataset.catalogUrl!)
    .then((response) => { if (!response.ok) throw new Error('catalog unavailable'); return response.json(); })
    .then((value: unknown) => { if (!Array.isArray(value)) throw new Error('invalid catalog'); catalog = value; paint(); })
    .catch(() => { /* Keep server-rendered intro and existing navigation. */ });
  window.addEventListener('storage', (event) => { if (!event.key || event.key === STORAGE_KEYS.state || isLegacyKey(event.key)) paint(); });
  window.addEventListener('pageshow', paint);
}
