import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { createRegistryIndex, loadExpressionRegistry } from '../../src/lib/content/expression-registry';
import type { EpisodeData } from '../../src/lib/content/episode-types';
import { toRubyReviewTarget } from '../../src/lib/furigana';
import { isEpisodeReviewReady, resolveReviewPrompt, validateEpisodeReviewContent } from '../../src/lib/learning/review-content';
import type { ExpressionStateV2, ReviewStage } from '../../src/lib/learning/types';

const NOW = '2026-09-15T03:00:00.000Z';
const ids = ['s01e06-ashitakara', 's01e06-majide', 's01e06-toriaezu'] as const;

type Episode6 = EpisodeData & {
  wordGroups: Array<{ label: string; items: Array<{ jp: string; mean: string; note?: string }> }>;
  reviewTargets: Array<{ id: string; scene: string; cloze: string; answer: string }>;
};

function stageState(reviewStage: ReviewStage): ExpressionStateV2 {
  return {
    registeredAt: NOW,
    registeredSource: 'episode',
    reviewStage,
    rememberStreak: reviewStage === 'R1' ? 0 : reviewStage === 'R2' ? 1 : 2,
    lastRating: null,
    cueBoost: 0,
    graduated: false,
    nextReviewDate: '2026-09-15',
  };
}

async function loadEpisode(file: string): Promise<EpisodeData> {
  return yaml.load(await readFile(`src/data/episodes/${file}`, 'utf8')) as EpisodeData;
}

async function episode6(): Promise<Episode6> {
  return yaml.load(await readFile('src/data/episodes/006-diet-again.yaml', 'utf8')) as Episode6;
}

describe('Work 3-6 Episode #006 콘텐츠 계약', () => {
  it('세 핵심 표현이 순서대로 published Registry와 대응하고 회차가 review-ready다', async () => {
    const episode = await episode6();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    expect(episode.keyPoints.map((keyPoint) => keyPoint.id)).toEqual(ids);
    expect(episode.keyPoints.map((keyPoint) => keyPoint.jp)).toEqual(['また〜から', 'マジで', 'とりあえず']);
    expect(validateEpisodeReviewContent(episode)).toEqual([]);
    expect(isEpisodeReviewReady(episode, registry.active)).toBe(true);
    expect(episode.keyPoints.every((keyPoint) => registry.active[keyPoint.id]?.status === 'published')).toBe(true);
  });

  it('최종 7개 scene과 keyPoint sceneIndex가 실제 R1 장면에 대응한다', async () => {
    const episode = await episode6();
    expect(episode.memoryScene).toBe('체중계 + 다시 다이어트 결심 + 결국 치킨');
    expect(episode.scene).toEqual([
      { who: '나', side: 'a', jp: 'えっ…増[ふ]えてる。', kr: '어… 늘었네.' },
      { who: '나', side: 'a', jp: 'よし、また明日[[あした]]からダイエット頑張[がんば]ろう。', kr: '좋아, 내일부터 다시 다이어트 해야지.' },
      { who: '친구', side: 'b', jp: 'それ、6週間前[しゅうかんまえ]も言[い]ってたよね。', kr: '그거, 6주 전에도 말했잖아.' },
      { who: '나', side: 'a', jp: '今回[こんかい]はマジで。', kr: '이번엔 진짜로.' },
      { who: '나', side: 'a', jp: 'ほんとだって。', kr: '진짜라니까.' },
      { who: '친구', side: 'b', jp: 'はいはい(笑[わら])、明日[[あした]]からまた始[はじ]めればいいよ。', kr: '네네 ㅋㅋ, 내일부터 다시 시작하면 되지 뭐.' },
      { who: '나', side: 'a', jp: '…とりあえず、今夜[こんや]チキン頼[たの]んでもいい?', kr: '…일단, 오늘 밤 치킨 시켜도 돼?' },
    ]);

    const sceneIndexes = Object.fromEntries(episode.keyPoints.map((keyPoint) => [keyPoint.id, keyPoint.sceneIndex]));
    expect(sceneIndexes).toEqual({ 's01e06-ashitakara': 1, 's01e06-majide': 3, 's01e06-toriaezu': 6 });
  });

  it('세 표현의 R1 memory cue와 명시형 R2/R3를 choice 없이 해석한다', async () => {
    const episode = await episode6();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    for (const keyPoint of episode.keyPoints) {
      const registryEntry = registry.active[keyPoint.id]!;
      const r1 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R1') });
      const r2 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R2') });
      const r3 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R3') });

      expect(r1).toMatchObject({ source: 'scene', scene: episode.scene[keyPoint.sceneIndex], memoryCue: keyPoint.memoryCue });
      expect(keyPoint.memoryCue?.alt.length).toBeGreaterThanOrEqual(10);
      await access(`public${keyPoint.memoryCue!.asset}`);
      expect(r2.source).toBe('reviewPrompt.R2');
      expect(r3.source).toBe('reviewPrompt.R3');
      expect([r2.mode, r3.mode]).not.toContain('choice');

      for (const prompt of [r2, r3]) {
        expect(['cloze', 'cued-recall']).toContain(prompt.mode);
        expect(prompt.answerHighlight).toBeTruthy();
        expect(prompt.answer).toContain(prompt.answerHighlight!);
        const target = toRubyReviewTarget(prompt.answer, prompt.answerHighlight);
        expect(target.answerHtml).toContain('q-answer-target');
        if (prompt.mode === 'cloze') expect(target.clozeHtml).toContain('cloze-blank');
      }
    }
  });

  it('また〜から R2/R3가 확정 apply와 장면 문구를 사용한다', async () => {
    const episode = await episode6();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e06-ashitakara')!;
    expect(episode.apply[keyPoint.applyIndex!]).toEqual({
      situation: '🏃 오늘도 운동화를 안 신었을 때',
      jp: '運動[うんどう]はまた明日[[あした]]から。',
      kr: '운동은 내일부터 다시 해야지.',
    });
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '운동은 내일부터 다시 해야지.', answer: '運動[うんどう]はまた明日[[あした]]から。', answerHighlight: 'また明日[[あした]]から',
        explanation: 'また와 시작 시점을 나타내는 〜から를 함께 써서 “다시 ~부터”라는 반복의 느낌을 나타낼 수 있어요.', mode: 'cloze',
      },
      R3: {
        cue: '좋아, 내일부터 다시 다이어트 해야지.', answer: 'よし、また明日[[あした]]からダイエット頑張[がんば]ろう。', answerHighlight: 'また明日[[あした]]から',
        explanation: '이미 한 번 미뤘거나 다시 시작하는 상황에서 また〜から로 “다시 ~부터”라는 느낌을 만들어요.', mode: 'cloze',
      },
    });
  });

  it('マジで R2/R3가 확정 문구를 사용하고 本当に 비교를 유지한다', async () => {
    const episode = await episode6();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e06-majide')!;
    expect(episode.compare[keyPoint.compareIndex!].title).toBe('本当に / マジで — 친구 사이의 톤');
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '이번엔 진짜 일찍 잘 거야.', answer: '今回[こんかい]はマジで早[はや]く寝[ね]る。', answerHighlight: 'マジで',
        explanation: '친구 사이에서 “진짜로 / 진심으로”라고 강하게 강조할 때 マジで를 자주 써요.', mode: 'cloze',
      },
      R3: {
        cue: '“진짜로 / 진심으로”', answer: 'マジで', answerHighlight: 'マジで',
        explanation: '친한 사이에서 쓰는 캐주얼한 표현이에요. 격식을 차려야 할 때는 本当に가 더 안전해요.', mode: 'cued-recall',
      },
    });
  });

  it('とりあえず R2/R3가 확정 apply와 문구를 사용하고 一応 비교를 유지한다', async () => {
    const episode = await episode6();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e06-toriaezu')!;
    expect(episode.apply[keyPoint.applyIndex!]).toEqual({
      situation: '🍺 술집에서 뭐 마실지 정할 때',
      jp: 'とりあえずビール。',
      kr: '난 일단 맥주.',
    });
    expect(episode.compare[keyPoint.compareIndex!].title).toBe("とりあえず / 一応 — 우리말로는 둘 다 '일단'");
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '난 일단 맥주.', answer: 'とりあえずビール。', answerHighlight: 'とりあえず',
        explanation: '나중 일은 잠시 미뤄두고 지금 먼저 할 것을 정할 때 とりあえず를 써요.', mode: 'cloze',
      },
      R3: {
        cue: '“일단 / 우선”', answer: 'とりあえず', answerHighlight: 'とりあえず',
        explanation: '먼저 할 일을 임시로 정하거나 우선 행동할 때 자주 쓰는 회화 표현이에요.', mode: 'cued-recall',
      },
    });
  });

  it('やっぱり를 제거하고 週間 설명과 #001 표현 재등장을 유지한다', async () => {
    const episode = await episode6();
    const source = await readFile('src/data/episodes/006-diet-again.yaml', 'utf8');
    const items = episode.wordGroups.flatMap((group) => group.items);

    expect(source).not.toContain('やっぱり');
    expect(items.find((item) => item.jp === '週間[しゅうかん]')?.note).toContain('<b>6週間前</b> = 6주 전');
    expect(episode.scene[5].jp).toContain('始[はじ]めればいいよ');
    expect(episode.scene[6].jp).toContain('頼[たの]んでもいい?');
  });

  it('기존 reviewTargets를 그대로 유지한다', async () => {
    expect((await episode6()).reviewTargets).toEqual([
      { id: 's01e05-chatta', scene: '친구가 드라마 결말을 말해버렸을 때', cloze: 'うっかり言[い]っ______。', answer: 'ちゃった' },
      { id: 's01e03-nanikairu', scene: '야구장, 맥주 사러 가면서', cloze: '何[[なに]]か______?', answer: 'いる' },
      { id: 's01e01-temoii', scene: '다이어트 3일차 밤 11시, 치킨', cloze: '今夜[こんや]チキン頼[たの]んで______?', answer: 'もいい' },
    ]);
  });

  it('#001~#006 review-ready 표현의 R2/R3에 choice mode가 없다', async () => {
    const registry = createRegistryIndex(await loadExpressionRegistry());
    const files = [
      '001-late-night-food.yaml', '002-chicken-order-mistake.yaml', '003-baseball-beer-run.yaml',
      '004-baseball-terms.yaml', '005-drama-netabare.yaml', '006-diet-again.yaml',
    ];

    for (const file of files) {
      const episode = await loadEpisode(file);
      expect(isEpisodeReviewReady(episode, registry.active)).toBe(true);
      for (const keyPoint of episode.keyPoints) {
        const registryEntry = registry.active[keyPoint.id]!;
        const r2 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R2') });
        const r3 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R3') });
        expect([r2.mode, r3.mode]).not.toContain('choice');
      }
    }
  });

  it('audit expected/actual gap이 0/0으로 일치한다', () => {
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/audit-season1.mjs', '--json'], {
      cwd: process.cwd(), encoding: 'utf8',
    }));

    expect(result).toMatchObject({ ok: true, matchedExpectedGaps: true, summary: { expectedGaps: 0, actualGaps: 0 } });
    expect(result.gaps).toEqual([]);
  });
});
