import { describe, expect, it } from 'vitest';
import { resolveReviewPrompt, validateEpisodeReviewContent } from '../../src/lib/learning/review-content';
import type { EpisodeData, KeyPoint } from '../../src/lib/content/episode-types';
import type { RegistryExpression } from '../../src/lib/content/expression-registry';
import type { ExpressionStateV2 } from '../../src/lib/learning/types';

const keyPoint: KeyPoint = { id: 's01e01-baiiyo', jp: '〜ばいいよ', kr: '~하면 돼', sceneIndex: 0, applyIndex: 0, compareIndex: 0, reviewPrompt: { R3: { cue: '내일부터 다시 시작하면 돼.', answer: '明日からまた始めればいいよ。', explanation: "여기서는 ‘다시 시작하다’이므로 始める → 始めれば를 사용해요." } } };
const episode: EpisodeData = { no: 1, season: 1, memoryScene: '밤 11시 + 치킨', scene: [{ who: '친구', jp: '明日からまた始めればいいよ', kr: '내일부터 다시 시작하면 돼' }], apply: [{ situation: '운동', jp: '運動も明日から始めればいいよ', kr: '운동도 내일부터 시작하면 돼' }], compare: [{ title: '始まる / 始める', bad: { jp: '始まれば' }, good: { jp: '始めれば' }, tip: '내가 시작하면 始める' }], quiz: [], keyPoints: [keyPoint, { ...keyPoint, id: 's01e01-temoii' }, { ...keyPoint, id: 's01e01-gaman' }] };
const registry = { id: keyPoint.id } as RegistryExpression;
const state = (reviewStage: ExpressionStateV2['reviewStage']): ExpressionStateV2 => ({ registeredAt: '2026-09-10T00:00:00.000Z', registeredSource: 'episode', reviewStage, rememberStreak: 0, lastRating: null, cueBoost: 0, graduated: false, nextReviewDate: '2026-09-10' });

describe('stage별 reviewPrompt resolver', () => {
  it('R1은 scene, R2는 apply, R3는 R3 prompt만 사용한다', () => {
    expect(resolveReviewPrompt({ episode, keyPoint, registry, state: state('R1') }).source).toBe('scene');
    expect(resolveReviewPrompt({ episode, keyPoint, registry, state: state('R2') }).source).toBe('apply');
    const r3 = resolveReviewPrompt({ episode, keyPoint, registry, state: state('R3') });
    expect(r3.source).toBe('reviewPrompt.R3'); expect(r3.answer).toBe('明日からまた始めればいいよ。');
  });
  it('R2/R3 교차 fallback을 하지 않는다', () => {
    const r2Only = { ...keyPoint, applyIndex: undefined, compareIndex: undefined, reviewPrompt: { R2: { cue: 'cue', answer: 'answer' } } };
    expect(() => resolveReviewPrompt({ episode, keyPoint: r2Only, registry, state: state('R3') })).toThrow('R3 prompt가 없음');
  });
  it('구조 validation으로 resolver 누락을 잡는다', () => {
    const broken = { ...episode, keyPoints: [{ ...keyPoint, applyIndex: undefined, compareIndex: undefined, reviewPrompt: undefined }, episode.keyPoints[1], episode.keyPoints[2]] };
    expect(validateEpisodeReviewContent(broken).some((issue) => issue.includes('R2 resolver 없음'))).toBe(true);
    expect(validateEpisodeReviewContent(broken).some((issue) => issue.includes('R3 resolver 없음'))).toBe(true);
  });
});

