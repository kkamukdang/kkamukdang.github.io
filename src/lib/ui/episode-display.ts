/** Display assets only; unknown speakers retain their real name and a text fallback. */
export function speakerAvatar(who: string): string | undefined {
  return ({ '나': '/ui/avatar-crow.webp', '친구': '/ui/avatar-friend.webp' } as Record<string, string>)[who];
}

type Question = { title: string; answer: string };
type Comparison = { terms: [string, string]; second: string; intro?: string; conclusion?: string };
const comparisons: Record<string, Comparison> = {
  '1:頼む / 注文する는 어떻게 다를까?': { terms: ['頼む', '注文する'], intro: '음식을 시킬 때는 두 표현 모두 사용할 수 있어요. ', second: '음식을 주문하는' },
  '1:始まる / 始める는 어떻게 다를까?': { terms: ['始まる', '始める'], second: '始める는', conclusion: '대화에서는' },
  '2:持ち帰り / 取りに行く는 어떻게 다를까?': { terms: ['持ち帰り', '取りに行く'], second: '取りに行く는' },
  '2:助ける / 助かる는 어떻게 다를까?': { terms: ['助ける', '助かる'], second: '助かる는' },
  '3:席を立つ / 席を離れる는 어떻게 다를까?': { terms: ['席を立つ', '席を離れる'], second: '席を離れる는' },
  '4:두 문장의 まだ는 어떻게 다를까?': { terms: ['まだマシ', 'まだいける?'], intro: '같은 まだ인데 느낌이 달라요. ', second: 'まだいける?' },
  '5:見なかった / まだ見てない는 어떻게 다를까?': { terms: ['見なかった', 'まだ見てない'], second: 'まだ見てない는' },
  '6:とりあえず / 一応은 어떻게 다를까?': { terms: ['とりあえず', '一応'], second: '一応은' },
};

/** Explicit known-content adapter. Every answer character survives; no slash inference. */
export function questionDisplay(season: number, no: number, question: Question) {
  const map = season === 1 ? comparisons[`${no}:${question.title}`] : undefined;
  if (!map) return { kind: 'explanation' as const, text: question.answer };
  const answer = question.answer;
  const intro = map.intro ?? '';
  const start = intro.length;
  const split = answer.indexOf(map.second, start);
  const end = map.conclusion ? answer.indexOf(map.conclusion, split) : answer.length;
  if (!answer.startsWith(intro) || split <= start || end <= split) {
    return { kind: 'explanation' as const, text: answer };
  }
  return { kind: 'comparison' as const, intro,
    items: [{ term: map.terms[0], text: answer.slice(start, split) }, { term: map.terms[1], text: answer.slice(split, end) }],
    conclusion: answer.slice(end) };
}
