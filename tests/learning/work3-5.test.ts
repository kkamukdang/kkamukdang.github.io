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
const ids = ['s01e05-yamete', 's01e05-noni', 's01e05-chatta'] as const;

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

async function episode5(): Promise<EpisodeData> {
  return loadEpisode('005-drama-netabare.yaml');
}

describe('Work 3-5 Episode #005 콘텐츠 계약', () => {
  it('대화 순서의 세 핵심 표현이 published Registry와 대응하고 회차가 review-ready다', async () => {
    const episode = await episode5();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    expect(episode.keyPoints.map((keyPoint) => keyPoint.id)).toEqual(ids);
    expect(validateEpisodeReviewContent(episode)).toEqual([]);
    expect(isEpisodeReviewReady(episode, registry.active)).toBe(true);
    expect(episode.keyPoints.every((keyPoint) => registry.active[keyPoint.id]?.status === 'published')).toBe(true);
  });

  it('세 표현의 R1 memory cue와 명시형 R2/R3를 choice 없이 해석한다', async () => {
    const episode = await episode5();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    for (const keyPoint of episode.keyPoints) {
      const registryEntry = registry.active[keyPoint.id]!;
      const r1 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R1') });
      const r2 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R2') });
      const r3 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R3') });

      expect(r1).toMatchObject({ source: 'scene', memoryScene: episode.memoryScene, memoryCue: keyPoint.memoryCue });
      expect(keyPoint.memoryCue?.alt.length).toBeGreaterThanOrEqual(10);
      await access(`public${keyPoint.memoryCue!.asset}`);
      expect(r2.source).toBe('reviewPrompt.R2');
      expect(r3.source).toBe('reviewPrompt.R3');
      expect(['cloze', 'cued-recall']).toContain(r2.mode);
      expect(['cloze', 'cued-recall']).toContain(r3.mode);
      expect([r2.mode, r3.mode]).not.toContain('choice');

      for (const prompt of [r2, r3]) {
        expect(prompt.answerHighlight).toBeTruthy();
        expect(prompt.answer).toContain(prompt.answerHighlight!);
        const target = toRubyReviewTarget(prompt.answer, prompt.answerHighlight);
        expect(target.answerHtml).toContain('q-answer-target');
        if (prompt.mode === 'cloze') expect(target.clozeHtml).toContain('cloze-blank');
      }
    }
  });

  it('やめて R1/R2/R3가 확정 장면과 문구를 사용한다', async () => {
    const episode = await episode5();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e05-yamete')!;
    expect(keyPoint.sceneIndex).toBe(3);
    expect(episode.scene[keyPoint.sceneIndex].jp).toBe('えっ、ちょっと!ネタバレやめてよ!');
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '그 얘기 그만해.',
        answer: 'その話[はなし]、やめて。',
        answerHighlight: 'やめて',
        explanation: '이미 하고 있는 행동이나 말을 멈춰 달라고 할 때 やめて를 써요.',
        mode: 'cloze',
      },
      R3: {
        cue: '“스포 하지 마!”',
        answer: 'ネタバレやめて!',
        answerHighlight: 'やめて',
        explanation: '이미 시작된 행동을 멈춰 달라고 할 때 쓰는 표현이에요.',
        mode: 'cued-recall',
      },
    });
  });

  it('〜のに R1/R2/R3와 확정 apply 문장이 일치한다', async () => {
    const episode = await episode5();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e05-noni')!;
    expect(keyPoint.sceneIndex).toBe(4);
    expect(episode.scene[keyPoint.sceneIndex].jp).toBe('まだ見[み]てないのに!');
    expect(keyPoint.applyIndex).toBe(3);
    expect(episode.apply[keyPoint.applyIndex!]).toEqual({
      situation: '🍜 아직 먹는 중인데 그릇을 치웠을 때',
      jp: 'まだ食[た]べてるのに、下[さ]げられちゃった。',
      kr: '아직 다 안 먹었는데 치워버리더라.',
    });
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '아직 다 안 먹었는데 치워버리더라.',
        answer: 'まだ食[た]べてるのに、下[さ]げられちゃった。',
        answerHighlight: 'のに',
        explanation: '예상과 다른 일이 생겼을 때, 아쉬움이나 억울함을 담아 〜のに를 써요.',
        mode: 'cloze',
      },
      R3: {
        cue: '나 아직 안 봤단 말이야!',
        answer: 'まだ見[み]てないのに!',
        answerHighlight: 'のに',
        explanation: '문장 끝의 〜のに는 사실 전달보다 서운함이나 항의하는 느낌을 더해요.',
        mode: 'cloze',
      },
    });
  });

  it('〜ちゃった R1/R2/R3가 확정 장면과 문구를 사용한다', async () => {
    const episode = await episode5();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e05-chatta')!;
    expect(keyPoint.sceneIndex).toBe(5);
    expect(episode.scene[keyPoint.sceneIndex].jp).toBe('あ…ごめん、うっかり言[い]っちゃった。');
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '마지막 하나, 먹어버렸어.',
        answer: '最後[さいご]の一個[いっこ]、食[た]べちゃった。',
        answerHighlight: 'ちゃった',
        explanation: '의도하지 않았거나 아쉬움이 남는 일을 말할 때 〜ちゃった를 자주 써요.',
        mode: 'cloze',
      },
      R3: {
        cue: '나도 모르게 말해버렸다.',
        answer: 'うっかり言[い]っちゃった。',
        answerHighlight: 'ちゃった',
        explanation: '〜ちゃった는 〜てしまった의 회화형으로, 실수나 후회가 섞인 느낌을 줘요.',
        mode: 'cloze',
      },
    });
  });

  it('Episode 대화와 지정된 기존 비교 설명을 그대로 유지한다', async () => {
    const episode = await episode5();
    expect(episode.scene.map((item) => item.jp)).toEqual([
      'ねえ、あのドラマの最終回[さいしゅうかい]、見[み]た?',
      '見[み]た見[み]た!',
      '最後[さいご]さ、実[じつ]は犯人[はんにん]がお兄[にい]さんだったんだよ!',
      'えっ、ちょっと!ネタバレやめてよ!',
      'まだ見[み]てないのに!',
      'あ…ごめん、うっかり言[い]っちゃった。',
      '今[いま]の、聞[き]かなかったことにする。',
    ]);
    expect(episode.scene.map((item) => item.kr)).toEqual([
      '야, 그 드라마 최종화 봤어?',
      '봤지 봤지!',
      '마지막에 있잖아, 알고 보니 범인이 오빠였어!',
      '야 잠깐! 스포 하지 마!',
      '나 아직 안 봤단 말이야!',
      '아… 미안, 나도 모르게 말해버렸다.',
      '방금 건, 못 들은 걸로 할래.',
    ]);
    expect(episode.compare[0].title).toBe('言った / 言っちゃった — 사실 전달이냐, 후회냐');
    expect(episode.compare[1].title).toBe('まだ見てない / まだ見てないのに — のに가 붙어야 항의가 됩니다');
  });

  it('#001~#005 review-ready 표현의 R2/R3에 choice mode가 없다', async () => {
    const registry = createRegistryIndex(await loadExpressionRegistry());
    const files = [
      '001-late-night-food.yaml',
      '002-chicken-order-mistake.yaml',
      '003-baseball-beer-run.yaml',
      '004-baseball-terms.yaml',
      '005-drama-netabare.yaml',
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

  it('세 ID는 active Registry에 유지되고 별도 migration 대상이 아니다', async () => {
    const registry = createRegistryIndex(await loadExpressionRegistry());
    for (const id of ids) {
      expect(registry.active[id]?.status).toBe('published');
      expect(registry.retired[id]).toBeUndefined();
    }
  });

  it('audit에서 #005 gap 5건이 제거되고 현재 fixture와 일치한다', () => {
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/audit-season1.mjs', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }));

    expect(result).toMatchObject({ ok: true, matchedExpectedGaps: true });
    expect(result.summary.actualGaps).toBe(result.summary.expectedGaps);
    expect(result.gaps.some((gap: { episodeId: string }) => gap.episodeId === 's01e05')).toBe(false);
  });
});
