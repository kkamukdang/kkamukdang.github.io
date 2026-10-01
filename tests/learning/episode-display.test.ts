import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { getVisibleMoreContent } from '../../src/lib/content/more-content';
import { questionDisplay, speakerAvatar } from '../../src/lib/ui/episode-display';

describe('Episode display adapters preserve Work 4 content', () => {
  it('all nine real answers survive comparison segmentation without rewriting', () => {
    const dir = new URL('../../src/data/episodes/', import.meta.url);
    let count = 0, comparisons = 0, explanations = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
      const data = yaml.load(readFileSync(new URL(file, dir), 'utf8')) as Parameters<typeof getVisibleMoreContent>[0];
      for (const question of getVisibleMoreContent(data).questions) {
        count++;
        const result = questionDisplay(data.season, data.no, question);
        if (result.kind === 'comparison') {
          comparisons++;
          expect(result.items).toHaveLength(2);
          expect(result.intro + result.items.map((i) => i.text).join('') + result.conclusion).toBe(question.answer);
        } else { explanations++; expect(result.text).toBe(question.answer); }
      }
    }
    expect([count, comparisons, explanations]).toEqual([9, 8, 1]);
  });
  it('a slash in an unknown title or another season never implies comparison', () => {
    const question = { title: 'A / B', answer: '일반 설명.' };
    expect(questionDisplay(1, 1, question)).toEqual({ kind: 'explanation', text: question.answer });
    const known = { title: '助ける / 助かる는 어떻게 다를까?', answer: '변경된 원문.' };
    expect(questionDisplay(1, 2, known)).toEqual({ kind: 'explanation', text: known.answer });
    expect(questionDisplay(2, 2, known).kind).toBe('explanation');
  });
  it('real speakers map to display-only assets; unknown speakers keep text fallback', () => {
    expect(speakerAvatar('나')).toBe('/ui/avatar-crow.webp');
    expect(speakerAvatar('친구')).toBe('/ui/avatar-friend.webp');
    expect(speakerAvatar('가게 직원')).toBeUndefined();
  });
});
