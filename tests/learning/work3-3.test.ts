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
const ids = ['s01e03-nanikairu', 's01e03-tekuru', 's01e03-ndayone'] as const;

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

async function episode3(): Promise<EpisodeData & { reviewTargets: Array<{ id: string; scene: string; cloze: string; answer: string }> }> {
  return yaml.load(await readFile('src/data/episodes/003-baseball-beer-run.yaml', 'utf8')) as EpisodeData & {
    reviewTargets: Array<{ id: string; scene: string; cloze: string; answer: string }>;
  };
}

describe('Work 3-3 Episode #003 콘텐츠 계약', () => {
  it('세 핵심 표현이 published Registry와 대응하고 회차가 review-ready다', async () => {
    const episode = await episode3();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    expect(episode.keyPoints.map((keyPoint) => keyPoint.id)).toEqual(ids);
    expect(validateEpisodeReviewContent(episode)).toEqual([]);
    expect(isEpisodeReviewReady(episode, registry.active)).toBe(true);
    expect(episode.keyPoints.every((keyPoint) => registry.active[keyPoint.id]?.status === 'published')).toBe(true);
  });

  it('세 표현의 R1 memory cue와 확정 R2/R3를 choice 없이 해석한다', async () => {
    const episode = await episode3();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    for (const keyPoint of episode.keyPoints) {
      const registryEntry = registry.active[keyPoint.id]!;
      const r1 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R1') });
      const r2 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R2') });
      const r3 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R3') });

      expect(r1).toMatchObject({ source: 'scene', memoryScene: episode.memoryScene, memoryCue: keyPoint.memoryCue });
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

  it('何かいる?의 기본 읽기와 회화형 안내가 확정값과 일치한다', async () => {
    const episode = await episode3();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e03-nanikairu')!;

    expect(keyPoint.jp).toBe('何[なに]かいる?');
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '편의점 가는데, 뭐 필요한 거 있어?',
        answer: 'コンビニ行[い]くけど、何[なに]かいる?',
        answerHighlight: '何[なに]かいる',
        explanation: '何かいる?는 なにかいる?로 읽고, 일상 회화에서는 何か가 なんか가 되어 なんかいる?처럼도 자주 말해요.',
        mode: 'cloze',
      },
      R3: {
        cue: '“뭐 필요한 거 있어?”',
        answer: '何[なに]かいる?',
        answerHighlight: '何[なに]かいる',
        explanation: '상대에게 필요한 것이 있는지 가볍게 확인할 때 쓰는 표현이에요.',
        mode: 'cued-recall',
      },
    });
  });

  it('〜てくる R2/R3와 applyIndex가 확정값과 일치한다', async () => {
    const episode = await episode3();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e03-tekuru')!;

    expect(keyPoint.applyIndex).toBe(0);
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '편의점 갔다 올게.',
        answer: 'コンビニ行[い]ってくる。',
        answerHighlight: '行[い]ってくる',
        explanation: '어떤 곳에 갔다가 다시 돌아올 때 行く가 아니라 行ってくる라고 해요.',
        mode: 'cloze',
      },
      R3: {
        cue: '잠깐 갔다 올게.',
        answer: 'ちょっと行[い]ってくる。',
        answerHighlight: '行[い]ってくる',
        explanation: '〜てくる의 여러 뜻 중 여기서는 ‘갔다가 돌아오는 이동’ 의미를 익혀요.',
        mode: 'cloze',
      },
    });
  });

  it('〜んだよね R2/R3가 확정값과 일치하고 잘못된 compareIndex를 사용하지 않는다', async () => {
    const episode = await episode3();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e03-ndayone')!;

    expect(keyPoint).not.toHaveProperty('compareIndex');
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '이 가게, 전에도 왔었지.',
        answer: 'この店[みせ]、前[まえ]にも来[き]たんだよね。',
        answerHighlight: 'んだよね',
        explanation: '서로 알고 있는 배경을 꺼내면서 상대의 공감이나 확인을 구할 때 써요.',
        mode: 'cloze',
      },
      R3: {
        cue: '전에 왔던 거지.',
        answer: '前[まえ]にも来[き]たんだよね。',
        answerHighlight: 'んだよね',
        explanation: '이미 공유된 배경을 설명하면서 ‘그렇지?’ 하는 느낌을 더하는 말투예요.',
        mode: 'cloze',
      },
    });
  });

  it('#003 newsletter의 s01e01-baiiyo 대상이 확정 cloze와 answer를 사용한다', async () => {
    const episode = await episode3();
    expect(episode.reviewTargets.find((target) => target.id === 's01e01-baiiyo')).toMatchObject({
      cloze: '明日からまた______。',
      answer: '始めればいいよ',
    });
  });

  it('audit에서 #003 gap 5건이 제거되고 남은 16건은 fixture와 일치한다', () => {
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/audit-season1.mjs', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }));

    expect(result).toMatchObject({ ok: true, summary: { expectedGaps: 16, actualGaps: 16 } });
    expect(result.gaps.some((gap: { episodeId: string }) => gap.episodeId === 's01e03')).toBe(false);
  });
});
