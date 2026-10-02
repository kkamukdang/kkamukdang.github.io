export interface HeroScene { id: string; text: string; icon?: string }
export const HERO_DESKTOP_LIMIT = 4;
export const HERO_MOBILE_LIMIT = 2;
/** UI-only preview: the original approved sentences/icons, independent of learning data. */
export const HERO_PREVIEW_SCENES: readonly Readonly<HeroScene>[] = Object.freeze([
  Object.freeze({ id: 'preview-spoiler', text: '야 잠깐! 스포 하지 마!', icon: '🙊' }),
  Object.freeze({ id: 'preview-baseball', text: '내가 자리만 비우면 꼭 점수 나더라…', icon: '⚾' }),
  Object.freeze({ id: 'preview-takeout', text: '배달이 아니라 포장으로 되어있잖아!?', icon: '🛵' }),
  Object.freeze({ id: 'preview-chicken', text: '있잖아… 오늘 밤 치킨 시켜도 될까?', icon: '🍗' }),
]);
export function heroPreviewScenes(): HeroScene[] {
  return HERO_PREVIEW_SCENES.map(scene => ({ ...scene }));
}
