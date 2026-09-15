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
const ids = ['s01e04-imanonani', 's01e04-madamashi', 's01e04-madaikeru'] as const;

type Episode4 = EpisodeData & {
  wordGroups: Array<{ label: string; items: Array<{ jp: string; mean: string; note?: string }> }>;
  kanjiPractice?: unknown[];
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

async function episode4(): Promise<Episode4> {
  return yaml.load(await readFile('src/data/episodes/004-baseball-terms.yaml', 'utf8')) as Episode4;
}

describe('Work 3-4 Episode #004 콘텐츠 계약', () => {
  it('최종 핵심 표현 3개가 published Registry와 대응하고 회차가 review-ready다', async () => {
    const episode = await episode4();
    const registry = createRegistryIndex(await loadExpressionRegistry());

    expect(episode.keyPoints.map((keyPoint) => keyPoint.id)).toEqual(ids);
    expect(validateEpisodeReviewContent(episode)).toEqual([]);
    expect(isEpisodeReviewReady(episode, registry.active)).toBe(true);
    expect(episode.keyPoints.every((keyPoint) => registry.active[keyPoint.id]?.status === 'published')).toBe(true);
  });

  it('세 표현의 R1 memory cue와 명시형 R2/R3를 choice 없이 해석한다', async () => {
    const episode = await episode4();
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

  it('今の何? R2/R3가 확정 문구와 일치한다', async () => {
    const keyPoint = (await episode4()).keyPoints.find((item) => item.id === 's01e04-imanonani')!;
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '방금 뭐야? 한 번 더 보고 싶어.',
        answer: '今[いま]の何[[なに]]?もう一回[いっかい]見[み]たい。',
        answerHighlight: '今[いま]の何[[なに]]',
        explanation: '今の는 ‘방금 그거’를 가리켜서, 방금 본 상황을 물을 때 자연스럽게 쓸 수 있어요.',
        mode: 'cloze',
      },
      R3: {
        cue: '“방금 뭐야?”',
        answer: '今[いま]の何[[なに]]?',
        answerHighlight: '今[いま]の何[[なに]]',
        explanation: '방금 본 장면이나 상황이 무엇이었는지 물을 때 쓰는 표현이에요.',
        mode: 'cued-recall',
      },
    });
  });

  it('〜のほうがまだマシ R2/R3가 확정 문구와 일치한다', async () => {
    const keyPoint = (await episode4()).keyPoints.find((item) => item.id === 's01e04-madamashi')!;
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '밤새우느니 차라리 일찍 일어나는 게 낫지.',
        answer: '徹夜[てつや]より、早起[はやお]きのほうがまだマシ。',
        answerHighlight: 'のほうがまだマシ',
        explanation: '둘 다 썩 좋지는 않지만 그중 덜 나쁜 쪽을 고를 때 〜のほうがまだマシ를 써요.',
        mode: 'cloze',
      },
      R3: {
        cue: '차라리 아까 삼진이 나았어.',
        answer: 'さっきの三振[さんしん]のほうがまだマシだったよ。',
        answerHighlight: 'のほうがまだマシ',
        explanation: '둘 다 좋지는 않지만 그나마 덜 나쁜 쪽을 말할 때 쓰는 표현이에요.',
        mode: 'cloze',
      },
    });
  });

  it('まだいける? R2/R3와 apply가 확정 문구와 일치한다', async () => {
    const episode = await episode4();
    const keyPoint = episode.keyPoints.find((item) => item.id === 's01e04-madaikeru')!;
    expect(keyPoint.applyIndex).toBe(2);
    expect(episode.apply[keyPoint.applyIndex!]).toEqual({
      situation: '🍻 술자리나 모임에서 2차 갈까 고민할 때',
      jp: 'もう一軒[いっけん]、まだいける?',
      kr: '한 군데 더 갈 수 있어?',
    });
    expect(keyPoint.reviewPrompt).toEqual({
      R2: {
        cue: '한 군데 더 갈 수 있어?',
        answer: 'もう一軒[いっけん]、まだいける?',
        answerHighlight: 'まだいける',
        explanation: '지금 상황이나 여력을 보고 아직 더 할 수 있는지 가볍게 물을 때 まだいける?라고 해요.',
        mode: 'cloze',
      },
      R3: {
        cue: '“아직 가능해?”',
        answer: 'まだいける?',
        answerHighlight: 'まだいける',
        explanation: '아직 괜찮은지, 더 해볼 수 있는지 가볍게 묻는 회화 표현이에요.',
        mode: 'cued-recall',
      },
    });
  });

  it('말풍선 분리와 지정된 본문 변경만 유지하고 間に合う 부속 콘텐츠를 제거한다', async () => {
    const episode = await episode4();
    const source = await readFile('src/data/episodes/004-baseball-terms.yaml', 'utf8');

    expect(episode.scene).toHaveLength(7);
    expect(episode.scene[6]).toMatchObject({ jp: '逆転[ぎゃくてん]、まだいける?', kr: '역전, 아직 가능해?' });
    expect(source).not.toContain('id: s01e04-maniau');
    expect(source).not.toContain('まだ終電[しゅうでん]に間[[ま]]に合[あ]う?');
    expect(episode.compare.some((item) => item.title.includes('間に合う / できる'))).toBe(false);
    expect(episode).not.toHaveProperty('quiz');
    expect(episode).not.toHaveProperty('kanjiPractice');
  });

  it('더 파보기에서 まだ의 두 쓰임만 남기고 できる? / いける?를 헷갈리는 것들로 옮긴다', async () => {
    const episode = await episode4();
    const items = episode.wordGroups.flatMap((group) => group.items);
    expect(items.find((item) => item.jp === 'まだ')).toMatchObject({
      mean: '① 그나마 ② 아직',
      note: '오늘 대화에서는 두 쓰임이 나와요.<br><b>まだマシ</b> = 그나마 낫다, <b>まだいける?</b> = 아직 괜찮아? / 아직 가능해?',
    });
    expect(items.find((item) => item.jp === 'まだいける?')).toBeUndefined();
    expect(items.find((item) => item.jp === 'できる? / いける?')).toBeUndefined();

    expect(episode.compare.at(-1)).toEqual({
      title: 'できる? / いける?',
      bad: { mark: '△', jp: 'できる?', aside: '능력·수행 가능성' },
      good: { jp: 'いける?' },
      tip: '<b>できる?</b>는 어떤 일을 할 수 있는지, 또는 해낼 수 있는지를 비교적 직접적으로 물어요.<br><b>いける?</b>는 지금 상황이나 여력을 보고 “아직 괜찮아?”, “아직 할 만해?”처럼 직관적인 판단을 묻는 회화 표현이에요.<br>두 표현은 완전히 배타적이라기보다 회화에서 묻는 초점이 달라요.',
    });
  });

  it('間に合う는 retired-only로 보존하며 학습 기록 이전 계약이 없다', async () => {
    const registry = createRegistryIndex(await loadExpressionRegistry());
    expect(registry.active['s01e04-madaikeru']?.status).toBe('published');
    expect(registry.active['s01e04-maniau']).toBeUndefined();
    expect(registry.retired['s01e04-maniau']).toMatchObject({
      status: 'retired-before-learning-v2',
      replacementId: null,
      migration: 'preserve-history-do-not-transfer',
    });
  });

  it('audit에서 #004 gap 5건이 제거되고 남은 11건은 fixture와 일치한다', () => {
    const result = JSON.parse(execFileSync(process.execPath, ['scripts/audit-season1.mjs', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }));

    expect(result).toMatchObject({ ok: true, summary: { expectedGaps: 11, actualGaps: 11 } });
    expect(result.gaps.some((gap: { episodeId: string }) => gap.episodeId === 's01e04')).toBe(false);
  });
});
