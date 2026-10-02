import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { getVisibleMoreContent, questionAnswerText, type Question } from '../../src/lib/content/more-content';
import { isSameSpeakerContinuation, speakerAvatar } from '../../src/lib/ui/episode-display';
import { toRubyRich } from '../../src/lib/furigana';

// Approved HEAD 69f37ce content, including the user's Rich titles.
const originalQuestions = [
  {
    "title": "<span lang=\"ja\">頼[たの]む / 注文[ちゅうもん]する</span>는 어떻게 다를까?",
    "answer": "음식을 시킬 때는 두 표현 모두 사용할 수 있어요. ‘나는 치킨 시킬래’처럼 친구에게 말할 때는 頼む, 음식을 주문하는 배달앱 화면이나 가게 안내문에서는 注文する를 볼 수 있어요."
  },
  {
    "title": "<span lang=\"ja\">始[はじ]まる / 始[はじ]める</span>는 어떻게 다를까?",
    "answer": "始まる는 어떤 일이 시작되는 것, 始める는 누군가 그 일을 시작하는 것이에요. 대화에서는 스스로 다이어트를 다시 시작하는 장면이라 始める가 쓰였어요."
  },
  {
    "title": "持ち帰り / 取りに行く는 어떻게 다를까?",
    "answer": "持ち帰り는 가게에서 직접 받아 가는 주문 방식, 取りに行く는 그 물건을 받으러 직접 가는 행동이에요."
  },
  {
    "title": "助ける / 助かる는 어떻게 다를까?",
    "answer": "助ける는 내가 누군가를 돕는 행동, 助かる는 도움을 받아 내가 안도하는 상황에 써요."
  },
  {
    "title": "席を立つ / 席を離れる는 어떻게 다를까?",
    "answer": "席を立つ는 자리에서 일어나거나 자리를 뜨는 동작, 席を離れる는 자리에서 떨어져 이동하는 데 초점이 있어요."
  },
  {
    "title": "두 문장의 まだ는 어떻게 다를까?",
    "answer": "같은 まだ인데 느낌이 달라요. まだマシ는 그나마 낫다, まだいける?는 아직 가능해?에 가까워요."
  },
  {
    "title": "見なかった / まだ見てない는 어떻게 다를까?",
    "answer": "見なかった는 그때 보지 않았다는 과거의 일, まだ見てない는 지금까지 안 본 상태예요."
  },
  {
    "title": "とりあえず / 一応은 어떻게 다를까?",
    "answer": "とりあえず는 나중에 할 일은 잠시 미뤄두고 지금 당장 할 것부터 하는 느낌, 一応은 완벽하지 않아도 최소한의 준비나 기준은 일단 갖추거나 해두는 느낌이에요."
  },
  {
    "title": "6週間前는 무슨 뜻일까?",
    "answer": "일본어에서는 몇 주라는 기간을 말할 때 週間을 자주 써요. 6週間前는 “6주 전에”라는 뜻이에요."
  }
];

function seasonQuestions() {
  const dir = new URL('../../src/data/episodes/', import.meta.url);
  return readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort().flatMap((file) => {
    const data = yaml.load(readFileSync(new URL(file, dir), 'utf8')) as Parameters<typeof getVisibleMoreContent>[0];
    return getVisibleMoreContent(data).questions;
  });
}

describe('Explicit Episode question content and speaker grouping', () => {
  it('preserves all nine approved titles and answers exactly, with eight compare and one text', () => {
    const questions = seasonQuestions();
    expect(questions.map((q) => ({ title: q.title, answer: questionAnswerText(q) }))).toEqual(originalQuestions);
    expect(questions.filter((q) => q.kind === 'compare')).toHaveLength(8);
    expect(questions.filter((q) => q.kind === 'text')).toHaveLength(1);
    for (const q of questions) if (q.kind === 'compare') expect(q.items).toHaveLength(2);
  });
  it('supports Rich titles, terms and descriptions independently of slashes or title wording', () => {
    const title = '<span lang="ja">頼[たの]む / 注文[ちゅうもん]する</span>는 어떻게 다를까?';
    const compare: Question = { kind: 'compare', title, items: [
      { term: '頼[たの]む', description: '<b>친구</b>에게 말해요. ' },
      { term: '注文[ちゅうもん]する', description: '注文[ちゅうもん]할 때 보여요.' },
    ] };
    expect(toRubyRich(compare.title)).toContain('<span lang="ja">');
    expect(toRubyRich(compare.title)).toContain('<rt>たの</rt>');
    expect(toRubyRich(compare.items[1].term)).toContain('<rt>ちゅうもん</rt>');
    expect(toRubyRich(compare.items[0].description)).toContain('<b>친구</b>');
    expect(questionAnswerText({ ...compare, title: '다른 제목 — 슬래시 없음' })).toBe(questionAnswerText(compare));
    expect(questionAnswerText({ kind: 'text', title, answer: '일반 문단.' })).toBe('일반 문단.');
    expect(questionAnswerText({ ...compare, intro: '소개. ', note: ' 마무리.' })).toBe('소개. ' + questionAnswerText(compare) + ' 마무리.');
  });
  it('groups only consecutive identical speakers and sides, including unknown speakers and returns', () => {
    const lines = [
      { who: '친구', side: 'b' }, { who: '친구', side: 'b' }, { who: '친구', side: 'b' },
      { who: '나', side: 'a' }, { who: '친구', side: 'b' },
      { who: '직원', side: 'a' }, { who: '직원', side: 'a' }, { who: '직원', side: 'b' },
    ] as const;
    expect(lines.map((_, index) => isSameSpeakerContinuation(lines, index))).toEqual([false, true, true, false, false, false, true, false]);
    expect(isSameSpeakerContinuation([], 0)).toBe(false);
  });
  it('real speakers retain the existing assets; unknown speakers keep their accessible name', () => {
    expect(speakerAvatar('나')).toBe('/ui/avatar-crow.webp');
    expect(speakerAvatar('친구')).toBe('/ui/avatar-friend.webp');
    expect(speakerAvatar('가게 직원')).toBeUndefined();
  });
});
