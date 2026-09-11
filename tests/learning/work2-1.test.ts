import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import {
  createLearningClient,
  makeEpisodeEventId,
  makeUnsureEventId,
  type BrowserExpression,
} from '../../src/lib/client/learning-client';
import { loadExpressionRegistry } from '../../src/lib/content/expression-registry';
import type { EpisodeData } from '../../src/lib/content/episode-types';
import { resolveReviewPrompt, validateEpisodeReviewContent } from '../../src/lib/learning/review-content';
import type { ExpressionId, ExpressionStateV2, ReviewStage } from '../../src/lib/learning/types';
import { MemoryStorage } from '../helpers';

const now = '2026-09-10T00:00:00.000Z';
const ids = ['s01e01-temoii', 's01e01-gaman', 's01e01-baiiyo'] as const;
const catalog = ids.map((id) => ({
  id,
  no: 1,
  season: 1,
  registry: { active: true },
})) satisfies BrowserExpression[];

function client(storage = new MemoryStorage()) {
  return createLearningClient(storage, catalog, () => new Date(now));
}

function completeCommand() {
  return {
    eventId: makeEpisodeEventId('s01e01'),
    now,
    episodeId: 's01e01' as const,
    seasonId: 's01' as const,
    expressionIds: [...ids] as [typeof ids[0], typeof ids[1], typeof ids[2]],
  };
}

function stageState(reviewStage: ReviewStage): ExpressionStateV2 {
  return {
    registeredAt: now,
    registeredSource: 'episode',
    reviewStage,
    rememberStreak: 0,
    lastRating: null,
    cueBoost: 0,
    graduated: false,
    nextReviewDate: '2026-09-10',
  };
}

describe('Work 2-1 #001 콘텐츠 계약', () => {
  it('핵심 표현 3개가 Registry active 항목과 정확히 대응한다', async () => {
    const episode = yaml.load(await readFile('src/data/episodes/001-late-night-food.yaml', 'utf8')) as EpisodeData;
    const registry = await loadExpressionRegistry();
    const activeIds = new Set(registry.expressions.map((expression) => expression.id));
    expect(episode.keyPoints.map((keyPoint) => keyPoint.id)).toEqual(ids);
    expect(episode.keyPoints.every((keyPoint) => activeIds.has(keyPoint.id))).toBe(true);
  });

  it('R1/R2/R3 resolver 원천과 memory cue를 검증한다', async () => {
    const episode = yaml.load(await readFile('src/data/episodes/001-late-night-food.yaml', 'utf8')) as EpisodeData;
    const registry = await loadExpressionRegistry();
    expect(validateEpisodeReviewContent(episode)).toEqual([]);
    expect(episode.memoryScene).toBe('밤 11시 + 다이어트 3일차 + 치킨');

    for (const keyPoint of episode.keyPoints) {
      const registryEntry = registry.expressions.find((expression) => expression.id === keyPoint.id)!;
      const r1 = resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R1') });
      expect(r1.source).toBe('scene');
      expect(r1.memoryScene).toBe(episode.memoryScene);
      expect(r1.memoryCue).toEqual(keyPoint.memoryCue);
      await access(`public${keyPoint.memoryCue!.asset}`);
      expect(resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R2') }).source).toBe('apply');
      expect(resolveReviewPrompt({ episode, keyPoint, registry: registryEntry, state: stageState('R3') }).source).toBe('reviewPrompt.R3');
      expect(keyPoint.reviewPrompt).not.toHaveProperty('R1');
    }
  });
});

describe('Work 2-1 Episode controller 서비스 연결', () => {
  it('Episode 완료 시 R1/streak 0/+3일로 세 표현을 등록한다', () => {
    const result = client().service.completeEpisode(completeCommand());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe('applied');
    ids.forEach((id) => expect(result.state.expressions[id]).toMatchObject({
      reviewStage: 'R1',
      rememberStreak: 0,
      nextReviewDate: '2026-09-13',
    }));
  });

  it('같은 Episode 완료 event를 중복 적용하지 않는다', () => {
    const learning = client();
    learning.service.completeEpisode(completeCommand());
    const duplicate = learning.service.completeEpisode(completeCommand());
    expect(duplicate.ok && duplicate.status).toBe('duplicate');
  });

  it('자신 없어요는 미등록 표현을 +1일로 등록한다', () => {
    const result = client().service.markUnsure({
      eventId: makeUnsureEventId(ids[0], '2026-09-10'),
      now,
      expressionId: ids[0] as ExpressionId,
    });
    expect(result.ok && result.state.expressions[ids[0]]).toMatchObject({
      registeredSource: 'unsure',
      reviewStage: 'R1',
      rememberStreak: 0,
      nextReviewDate: '2026-09-11',
    });
  });

  it('자신 없어요 이후 Episode 완료가 더 이른 일정을 늦추지 않는다', () => {
    const learning = client();
    learning.service.markUnsure({
      eventId: makeUnsureEventId(ids[0], '2026-09-10'),
      now,
      expressionId: ids[0],
    });
    const completed = learning.service.completeEpisode(completeCommand());
    expect(completed.ok && completed.state.episodes.s01e01.completed).toBe(true);
    expect(completed.ok && completed.state.expressions[ids[0]].nextReviewDate).toBe('2026-09-11');
  });
});
