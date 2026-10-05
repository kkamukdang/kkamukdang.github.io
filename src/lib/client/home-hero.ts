import { STORAGE_KEYS, type StorageLike } from '../learning/local-storage';
import { isLegacyKey, migrateLegacySnapshot } from '../learning/migration-v1';
import { validateLearningState } from '../learning/validation';
import { selectDueExpressions } from '../learning/queue';
import { heroPreviewScenes, HERO_DESKTOP_LIMIT, type HeroScene } from '../ui/hero-scenes';
import { reviewableExpressions, todayKst, type BrowserExpression } from './learning-client';

export type HomeHeroModel = { kind: 'intro'; scenes: HeroScene[] } | { kind: 'due'; scenes: HeroScene[] } | { kind: 'empty'; scenes: [] };
const catalogScene = (item: BrowserExpression): HeroScene | undefined => {
  const text = item.prompts?.R1?.scene?.kr;
  return text?.trim() ? { id: item.id, text, ...(item.emoji ? { icon: item.emoji } : {}) } : undefined;
};

/** Display-only snapshot. Never probe/write storage, persist migration, or create a batch. */
export function homeHeroModel(
  storage: Pick<StorageLike, 'length' | 'key' | 'getItem'>,
  catalog: BrowserExpression[],
  now = new Date(),
): HomeHeroModel {
  const intro: HomeHeroModel = { kind: 'intro', scenes: heroPreviewScenes() };
  try {
    const raw = storage.getItem(STORAGE_KEYS.state);
    let state;
    if (raw !== null) {
      const validated = validateLearningState(JSON.parse(raw));
      if (!validated.ok) return intro;
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
      if (!projected.ok) return intro;
      state = projected.value;
    }
    const ready = reviewableExpressions(catalog);
    const registry = Object.fromEntries(ready.map((item) => [item.id, {
      active: true,
      episodeId: `s${String(item.season).padStart(2, '0')}e${String(item.no).padStart(2, '0')}`,
    }]));
    const today = todayKst(now);
    const flow = state.reviewFlow?.date === today ? state.reviewFlow : undefined;
    const answered = new Set(flow?.batches.flatMap(batch => batch.answeredIds) ?? []);
    const due = selectDueExpressions(state, registry, today, answered, ready.length);
    const dueSet = new Set(due);
    const active = flow?.batches.find(batch => batch.id === flow.activeBatchId);
    const pending = active?.expressionIds.filter(id => !active.answeredIds.includes(id) && dueSet.has(id)) ?? [];
    const ordered = [...pending, ...due.filter(id => !pending.includes(id))];
    const byId = new Map(ready.map(item => [item.id, item]));
    const scenes = ordered.slice(0, HERO_DESKTOP_LIMIT).flatMap(id => {
      const item = byId.get(id);
      const scene = item && catalogScene(item);
      return scene ? [scene] : [];
    });
    // Missing scene data never falls back to the Japanese answer or an intro sample.
    const hasHistory = Object.keys(state.expressions).length > 0 || Object.values(state.episodes).some(episode => episode.completed) || state.history.length > 0;
    return due.length ? { kind: 'due', scenes } : hasHistory ? { kind: 'empty', scenes: [] } : intro;
  } catch {
    return intro;
  }
}

/** Intro keeps all fixed icons; due exposes only its first ordered scene's icon. */
export function heroSceneIcon(model: HomeHeroModel, index: number): string | undefined {
  return model.kind === 'intro' || (model.kind === 'due' && index === 0)
    ? model.scenes[index]?.icon : undefined;
}

export function initHomeHero(): void {
  const root = document.querySelector<HTMLElement>('[data-home-hero]');
  const title = root?.querySelector<HTMLElement>('#home-intro-title');
  const link = root?.querySelector<HTMLAnchorElement>('.home-browse');
  const group = root?.querySelector<HTMLElement>('[data-hero-scenes]');
  if (!root || !title || !link || !group) return;
  let catalog: BrowserExpression[] = [];
  function firstHeroIcon(value = '') {
    const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    return [...segmenter.segment(value.trim())][0]?.segment ?? '';
  }
  function paint(): void {
    if (!catalog.length) return; // Keep the fixed server-rendered preview on load failure.
    let model: HomeHeroModel;
    try { model = homeHeroModel(window.localStorage, catalog); }
    catch { model = homeHeroModel({ length: 0, key: () => null, getItem: () => null }, catalog); }
    root!.dataset.heroState = model.kind;
    group!.dataset.count = String(model.scenes.length);
    group!.className = `home-hero-scenes count-${model.scenes.length}`;
    group!.hidden = model.kind === 'empty';

    group!.replaceChildren(...model.scenes.map((scene, index) => {
      const bubble = document.createElement('p');
      bubble.className = 'home-example';

      const icon = document.createElement('span');
      icon.className = 'hero-scene-icon';
      icon.setAttribute('aria-hidden', 'true');

      icon.textContent = firstHeroIcon(scene.icon ?? '');

      const text = document.createElement('span');
      text.className = 'hero-scene-text';
      text.textContent = scene.text;

      bubble.append(icon, text);
      return bubble;
    }));
    title!.replaceChildren(document.createTextNode(model.kind === 'due' ? '지난번 만난 표현,' : model.kind === 'empty' ? '오늘 만날' : '이런 표현을'), document.createElement('br'), document.createTextNode(model.kind === 'due' ? '기억나세요?' : model.kind === 'empty' ? '표현이 없어요.' : '만날 수 있어요!'));
    link!.textContent = model.kind === 'due' ? '다시 만나기 →' : '에피소드 둘러보기 ↓';
    link!.href = model.kind === 'due' ? root!.dataset.againUrl! : '#episodes';
    root!.dataset.heroPending = 'false';
  }
  fetch(root.dataset.catalogUrl!)
    .then((response) => { if (!response.ok) throw new Error('catalog unavailable'); return response.json(); })
    .then((value: unknown) => { if (!Array.isArray(value)) throw new Error('invalid catalog'); catalog = value; paint(); })
    .catch(() => { 
      root!.dataset.heroPending = 'false';
     });
  window.addEventListener('storage', (event) => { if (!event.key || event.key === STORAGE_KEYS.state || isLegacyKey(event.key)) paint(); });
  window.addEventListener('pageshow', paint);
}
