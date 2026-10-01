/** 더 파보기 화면에만 노출하는 선별 콘텐츠. YAML 원본은 복습·검색 참조용으로 보존합니다. */
interface WordItem { jp: string; mean: string; note?: string; speak?: string }
interface WordGroup { items: WordItem[] }
interface MoreSource { season: number; no: number; wordGroups: WordGroup[] }
interface Question { title: string; answer: string }
interface SceneNote { jp: string; note: string; mean?: string; sourceJp?: string }

const sceneNotes: Record<number, SceneNote[]> = {
  1: [{ jp: 'それだ!', note: '친구의 제안이 딱 맞아떨어져 반갑게 받아들이는 말이에요.' }],
  2: [{
    jp: '持[も]ち帰[かえ]り',
    note: '배달이 아니라 가게에서 직접 받아오는 주문 방식이에요. 그래서 걸어가서 가져와야 하냐고 묻는 거예요.',
  }, {
    jp: '取[と]りに行[い]く',
    mean: '가지러 가다 / 찾으러 가다',
    note: '물건을 받으러 직접 가는 행동이에요. 포장 주문을 찾으러 가거나, 맡겨둔 물건을 찾으러 갈 때처럼 쓸 수 있어요.',
  }, {
    jp: '15分[[ふん]]もかかる',
    sourceJp: '〜も かかる',
    mean: '15분이나 걸려',
    note: 'も가 붙으면 예상보다 오래 걸린다는 불만이나 놀람이 느껴져요.',
  }],
  3: [{
    jp: '満塁[まんるい]ホームラン',
    note: '주자 세 명이 있는 상태에서 친 홈런이라 한 번에 네 명이 득점해요. 맥주를 사러 간 사이에 그 장면을 놓친 거예요.',
  }, {
    jp: '点[てん]が入[はい]る',
    mean: '점수가 나다 / 득점하다',
    note: '스포츠 경기나 게임에서 점수를 얻었을 때 쓰는 표현이에요. 이 대화에서는 点入る라고 짧게 말했어요.',
  }],
  4: [
    { jp: 'ヒット', note: '타자가 친 공으로 안전하게 베이스에 나가는 안타예요. 경기에서는 ヒット出た!처럼 말하는 표현도 볼 수 있어요.' },
    { jp: 'ゲッツー', note: '한 번의 수비로 두 명이 아웃되는 병살이에요. get two에서 온 말로, 일본 야구에서는 併殺과 함께 쓰는 표현이에요.' },
    { jp: '三振[さんしん]', note: '스트라이크 세 번으로 타자 한 명이 아웃되는 거예요.' },
    { jp: '逆転[ぎゃくてん]', note: '뒤지고 있던 쪽이 앞서는 상황이에요. 逆転する는 역전하다, 逆転勝ちは 역전승이라는 뜻이에요.' },
  ],
  5: [{
    jp: '聞[き]かなかったことにする',
    note: '실제로 못 들었다는 뜻이 아니라, 스포일러를 못 들은 걸로 치겠다는 반응이에요.',
  }, {
    jp: 'ネタバレ',
    note: '이야기의 중요한 내용을 미리 알려버리는 스포일러를 말해요.',
  }, {
    jp: '最終回[さいしゅうかい]',
    mean: '최종화 / 마지막 회',
    note: '드라마나 애니메이션의 마지막 편을 말해요.',
  }],
  6: [{
    jp: 'はいはい',
    note: '여기서는 진지한 대답보다 “또 시작이구나” 하고 장난스럽게 받아넘기는 느낌이에요.',
  }],
};

const questions: Record<number, Question[]> = {
  1: [
    {
      title: '<span lang="ja">頼[たの]む / 注文[ちゅうもん]する</span>는 어떻게 다를까?',
      answer: '음식을 시킬 때는 두 표현 모두 사용할 수 있어요. ‘나는 치킨 시킬래’처럼 친구에게 말할 때는 頼む, 음식을 주문하는 배달앱 화면이나 가게 안내문에서는 注文する를 볼 수 있어요.',
    },
    {
      title: '<span lang="ja">始[はじ]まる / 始[はじ]める</span>는 어떻게 다를까?',
      answer: '始まる는 어떤 일이 시작되는 것, 始める는 누군가 그 일을 시작하는 것이에요. 대화에서는 스스로 다이어트를 다시 시작하는 장면이라 始める가 쓰였어요.',
    },
  ],
  2: [
    {
      title: '持ち帰り / 取りに行く는 어떻게 다를까?',
      answer: '持ち帰り는 가게에서 직접 받아 가는 주문 방식, 取りに行く는 그 물건을 받으러 직접 가는 행동이에요.',
    },
    {
      title: '助ける / 助かる는 어떻게 다를까?',
      answer: '助ける는 내가 누군가를 돕는 행동, 助かる는 도움을 받아 내가 안도하는 상황에 써요.',
    },
  ],
  3: [{
    title: '席を立つ / 席を離れる는 어떻게 다를까?',
    answer: '席を立つ는 자리에서 일어나거나 자리를 뜨는 동작, 席を離れる는 자리에서 떨어져 이동하는 데 초점이 있어요.',
  }],
  4: [{
    title: '두 문장의 まだ는 어떻게 다를까?',
    answer: '같은 まだ인데 느낌이 달라요. まだマシ는 그나마 낫다, まだいける?는 아직 가능해?에 가까워요.',
  }],
  5: [{
    title: '見なかった / まだ見てない는 어떻게 다를까?',
    answer: '見なかった는 그때 보지 않았다는 과거의 일, まだ見てない는 지금까지 안 본 상태예요.',
  }],
  6: [
    {
      title: 'とりあえず / 一応은 어떻게 다를까?',
      answer: 'とりあえず는 나중에 할 일은 잠시 미뤄두고 지금 당장 할 것부터 하는 느낌, 一応은 완벽하지 않아도 최소한의 준비나 기준은 일단 갖추거나 해두는 느낌이에요.',
    },
    {
      title: '6週間前는 무슨 뜻일까?',
      answer: '일본어에서는 몇 주라는 기간을 말할 때 週間을 자주 써요. 6週間前는 “6주 전에”라는 뜻이에요.',
    },
  ],
};

export function getVisibleMoreContent(source: MoreSource) {
  if (source.season !== 1) return { sceneWords: [], questions: [] };
  const allWords = source.wordGroups.flatMap((group) => group.items);
  const sceneWords = (sceneNotes[source.no] ?? []).flatMap(({ jp, note, mean, sourceJp }) => {
    const original = allWords.find((word) => word.jp === (sourceJp ?? jp));
    return original || mean ? [{ jp, mean: mean ?? original!.mean, note, speak: sourceJp ? undefined : original?.speak }] : [];
  });
  return { sceneWords, questions: questions[source.no] ?? [] };
}
