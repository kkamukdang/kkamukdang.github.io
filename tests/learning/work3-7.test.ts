import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { createRegistryIndex, loadExpressionRegistry } from '../../src/lib/content/expression-registry';
import type { EpisodeData } from '../../src/lib/content/episode-types';
import { toRubyReviewTarget } from '../../src/lib/furigana';
import { isEpisodeReviewReady, resolveReviewPrompt, validateEpisodeReviewContent } from '../../src/lib/learning/review-content';
import { createEmptyState } from '../../src/lib/learning/state';
import { completeEpisodeTransition } from '../../src/lib/learning/transitions';
import type { EpisodeId, ExpressionId, ExpressionStateV2, ReviewStage } from '../../src/lib/learning/types';

const NOW = '2026-09-15T03:00:00.000Z';
const TODAY = '2026-09-15' as const;

const expectedEpisodes = [
  {
    file: '001-late-night-food.yaml', episodeId: 's01e01' as EpisodeId,
    keyPoints: [
      ['s01e01-temoii', '〜でもいい?', 0],
      ['s01e01-gaman', '我慢[がまん]できない', 3],
      ['s01e01-baiiyo', '〜ばいいよ', 4],
    ],
  },
  {
    file: '002-chicken-order-mistake.yaml', episodeId: 's01e02' as EpisodeId,
    keyPoints: [
      ['s01e02-natteru', 'Aじゃなくて Bになってる', 1],
      ['s01e02-moraeba', '〜てもらえば?', 4],
      ['s01e02-tasukaru', '助[たす]かる', 6],
    ],
  },
  {
    file: '003-baseball-beer-run.yaml', episodeId: 's01e03' as EpisodeId,
    keyPoints: [
      ['s01e03-tekuru', '〜てくる', 0],
      ['s01e03-nanikairu', '何[なに]かいる?', 1],
      ['s01e03-sekiwotatsu', '席[せき]を立[た]つ', 5],
    ],
  },
  {
    file: '004-baseball-terms.yaml', episodeId: 's01e04' as EpisodeId,
    keyPoints: [
      ['s01e04-imanonani', '今[いま]の何[[なに]]?', 0],
      ['s01e04-madamashi', '〜のほうがまだマシ', 5],
      ['s01e04-madaikeru', 'まだいける?', 6],
    ],
  },
  {
    file: '005-drama-netabare.yaml', episodeId: 's01e05' as EpisodeId,
    keyPoints: [
      ['s01e05-yamete', 'やめて', 3],
      ['s01e05-noni', '〜のに', 4],
      ['s01e05-chatta', '〜ちゃった', 5],
    ],
  },
  {
    file: '006-diet-again.yaml', episodeId: 's01e06' as EpisodeId,
    keyPoints: [
      ['s01e06-ashitakara', 'また〜から', 1],
      ['s01e06-majide', 'マジで', 3],
      ['s01e06-toriaezu', 'とりあえず', 6],
    ],
  },
] as const;

function stageState(reviewStage: ReviewStage): ExpressionStateV2 {
  return {
    registeredAt: NOW,
    registeredSource: 'episode',
    reviewStage,
    rememberStreak: reviewStage === 'R1' ? 0 : reviewStage === 'R2' ? 1 : 2,
    lastRating: null,
    cueBoost: 0,
    graduated: false,
    nextReviewDate: TODAY,
  };
}

async function loadEpisodes(): Promise<Array<{ episodeId: EpisodeId; data: EpisodeData }>> {
  return Promise.all(expectedEpisodes.map(async ({ file, episodeId }) => ({
    episodeId,
    data: yaml.load(await readFile(`src/data/episodes/${file}`, 'utf8')) as EpisodeData,
  })));
}

describe('Work 3-7 Season 1 최종 통합 계약', () => {
  it('Episode #001~#006의 핵심 표현 순서·표시명·sceneIndex와 review-ready를 고정한다', async () => {
    const episodes = await loadEpisodes();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    expect(episodes).toHaveLength(6);
    for (const [index, episode] of episodes.entries()) {
      const expected = expectedEpisodes[index];
      expect(episode.data.no).toBe(index + 1);
      expect(episode.data.keyPoints).toHaveLength(3);
      expect(episode.data.keyPoints.map(({ id, jp, sceneIndex }) => [id, jp, sceneIndex])).toEqual(expected.keyPoints);
      expect(validateEpisodeReviewContent(episode.data)).toEqual([]);
      expect(isEpisodeReviewReady(episode.data, registry.active)).toBe(true);
    }
  });

  it('active 18개가 published Registry와 일대일 대응하고 retired 2개는 active keyPoint가 아니다', async () => {
    const episodes = await loadEpisodes();
    const registryData = await loadExpressionRegistry();
    const registry = createRegistryIndex(registryData);
    const keyPointIds = episodes.flatMap(({ data }) => data.keyPoints.map(({ id }) => id));
    const activeIds = Object.keys(registry.active);

    expect(keyPointIds).toHaveLength(18);
    expect(new Set(keyPointIds).size).toBe(18);
    expect(activeIds).toHaveLength(18);
    expect(new Set(activeIds).size).toBe(18);
    expect([...keyPointIds].sort()).toEqual([...activeIds].sort());

    for (const { episodeId, data } of episodes) {
      for (const keyPoint of data.keyPoints) {
        expect(registry.active[keyPoint.id]).toMatchObject({
          id: keyPoint.id,
          display: expect.any(String),
          status: 'published',
          episodes: expect.arrayContaining([{ id: episodeId, role: 'keyPoint' }]),
        });
      }
    }

    expect(registryData.retiredExpressions).toHaveLength(2);
    for (const retiredId of ['s01e03-ndayone', 's01e04-maniau'] as ExpressionId[]) {
      expect(keyPointIds).not.toContain(retiredId);
      expect(registry.active[retiredId]).toBeUndefined();
      expect(registry.retired[retiredId]).toMatchObject({
        replacementId: null,
        migration: 'preserve-history-do-not-transfer',
      });
    }
  });

  it('active 18개의 R1/R2/R3가 모두 resolve되고 지원 mode·highlight·memory asset 계약을 지킨다', async () => {
    const episodes = await loadEpisodes();
    const registry = createRegistryIndex(await loadExpressionRegistry());
    const modes = { scene: 0, cloze: 0, 'cued-recall': 0, choice: 0 };

    for (const { data: episode } of episodes) {
      for (const keyPoint of episode.keyPoints) {
        const registryEntry = registry.active[keyPoint.id]!;
        const r1 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R1') });
        const r2 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R2') });
        const r3 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R3') });

        expect(r1).toMatchObject({ mode: 'scene', source: 'scene', scene: episode.scene[keyPoint.sceneIndex] });
        expect(r1.memoryCue).toEqual(keyPoint.memoryCue);
        expect(keyPoint.memoryCue?.alt.trim().length).toBeGreaterThanOrEqual(10);
        await access(`public${keyPoint.memoryCue!.asset}`);

        for (const prompt of [r2, r3]) {
          expect(['cloze', 'cued-recall']).toContain(prompt.mode);
          expect(prompt.cue.trim()).not.toBe('');
          expect(prompt.answer.trim()).not.toBe('');
          expect(prompt.stage).toBe(prompt === r2 ? 'R2' : 'R3');
          if (prompt.answerHighlight) expect(prompt.answer).toContain(prompt.answerHighlight);
          if (prompt.mode === 'cloze') {
            expect(prompt.answerHighlight).toBeTruthy();
            expect(toRubyReviewTarget(prompt.answer, prompt.answerHighlight).clozeHtml).toContain('cloze-blank');
          }
          modes[prompt.mode] += 1;
        }
        modes[r1.mode] += 1;
      }
    }

    expect(modes).toEqual({ scene: 18, cloze: 21, 'cued-recall': 15, choice: 0 });
  });

  it('Episode #001~#006 완료가 각 핵심 3개만 등록하고 재방문 시 중복 등록하지 않는다', async () => {
    const episodes = await loadEpisodes();
    let state = createEmptyState(NOW);

    for (const { episodeId, data } of episodes) {
      const expressionIds = data.keyPoints.map(({ id }) => id) as [ExpressionId, ExpressionId, ExpressionId];
      const command = { eventId: `complete:${episodeId}`, now: NOW, episodeId, seasonId: 's01' as const, expressionIds };
      const completed = completeEpisodeTransition(state, command, TODAY);
      expect(completed.status).toBe('applied');
      state = completed.state;
      expect(state.episodes[episodeId]).toMatchObject({ completed: true, completedAt: NOW });
      for (const expressionId of expressionIds) {
        expect(state.expressions[expressionId]).toMatchObject({
          registeredSource: 'episode', reviewStage: 'R1', rememberStreak: 0,
          graduated: false, nextReviewDate: '2026-09-18',
        });
      }

      const revisited = completeEpisodeTransition(state, { ...command, eventId: `revisit:${episodeId}` }, TODAY);
      expect(revisited.status).toBe('no-change');
      expect(revisited.state).toBe(state);
    }

    const expectedIds = expectedEpisodes.flatMap(({ keyPoints }) => keyPoints.map(([id]) => id)).sort();
    expect(Object.keys(state.expressions).sort()).toEqual(expectedIds);
    expect(Object.keys(state.episodes).sort()).toEqual(expectedEpisodes.map(({ episodeId }) => episodeId));
    expect(state.history.filter(({ type }) => type === 'expression_registered')).toHaveLength(18);
    expect(state.history.filter(({ type }) => type === 'episode_completed')).toHaveLength(6);
  });

  it('Season 1 audit이 expected/actual gap 0/0으로 일치한다', () => {
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/audit-season1.mjs', '--json'], {
      cwd: process.cwd(), encoding: 'utf8',
    }));

    expect(result).toMatchObject({
      ok: true,
      matchedExpectedGaps: true,
      summary: {
        episodes: 6,
        registryActive: 18,
        registryRetired: 2,
        episodeKeyPoints: 18,
        expectedGaps: 0,
        actualGaps: 0,
      },
      gaps: [],
    });
  });
});
