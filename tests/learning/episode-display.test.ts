import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler';
import { experimental_AstroContainer } from 'astro/container';
import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'js-yaml';
import { beforeAll, describe, expect, it } from 'vitest';
import { getVisibleMoreContent, type Question } from '../../src/lib/content/more-content';
import { isSameSpeakerContinuation, speakerAvatar, sceneLineSchema, splitSceneLines, type SceneLine } from '../../src/lib/ui/episode-display';
import { toRubyRich } from '../../src/lib/furigana';

// Exact current HEAD structure, including optional fields and markup.
const expectedQuestionsByEpisode: Record<number, Question[]> = {
  1: [
    {
      kind: 'compare',
      title: '頼む / 注文する는 어떻게 다를까?',
      items: [
        { term: '頼む', description: '‘나는 치킨 시킬래’처럼 친구에게 말할 때' },
        { term: '注文する', description: '음식을 주문하는 배달앱 화면이나 가게 안내문 등에서' },
      ],
      note: '음식을 시킬 때는 두 표현 모두 사용할 수 있어요.',
    },
    {
      kind: 'compare',
      title: '始まる / 始める는 어떻게 다를까?',
      items: [
        { term: '始まる', description: '어떤 일이 시작돼요' },
        { term: '始める', description: '누군가 그 일을 시작해요' },
      ],
      note: '대화에서는 스스로 다이어트를 다시 시작하는 장면이라 始める가 쓰였어요.',
    },
  ],
  2: [
    {
      kind: 'compare',
      title: '持ち帰り / 取りに行く는 어떻게 다를까?',
      items: [
        { term: '持ち帰り', description: '가게에서 직접 받아 가는 주문 방식' },
        { term: '取りに行く', description: '그 물건을 받으러 직접 가는 행동' },
      ],
    },
    {
      kind: 'compare',
      title: '助ける / 助かる는 어떻게 다를까?',
      items: [
        { term: '助ける', description: '내가 누군가를 돕는 행동' },
        { term: '助かる', description: '도움을 받아 내가 안도하는 상황에 사용' },
      ],
    },
  ],
  3: [{
    kind: 'compare',
    title: '席を立つ / 席を離れる는 어떻게 다를까?',
    items: [
      { term: '席を立つ', description: '자리에서 일어나거나 자리를 뜨는 동작에 초점을 둠' },
      { term: '席を離れる', description: '자리에서 떨어져 이동하는 데 초점을 둠' },
    ],
  }],
  4: [{
    kind: 'compare',
    title: '두 문장의 まだ는 어떻게 다를까?',
    note: '같은 まだ인데 의미가 다르니 주의하세요. ',
    items: [
      { term: 'まだマシ', description: '그나마 낫다는 "그나마"의 의미로 사용' },
      { term: 'まだいける?', description: '아직 가능해?로 "아직"이라는 뜻으로 사용' },
    ],
  }],
  5: [{
    kind: 'compare',
    title: '見なかった / まだ見てない는 어떻게 다를까?',
    items: [
      { term: '見なかった', description: '그때 보지 않았다는 과거의 일' },
      { term: 'まだ見てない', description: '지금까지 안 본 상태' },
    ],
  }],
  6: [
    {
      kind: 'compare',
      title: 'とりあえず / 一応는 어떻게 다를까?',
      items: [
        { term: 'とりあえず', description: '나중에 할 일은 잠시 미뤄두고 지금 당장 할 것부터 하는 느낌' },
        { term: '一応', description: '완벽하지 않아도 최소한의 준비나 기준은 일단 갖추거나 해두는 느낌' },
      ],
    },
    {
      kind: 'text',
      title: '6週間前는 무슨 뜻일까?',
      answer: '일본어에서는 몇 주라는 기간을 말할 때 <b class="jp">週間(しゅうかん)</b>을 자주 써요. <b class="jp">6週間前</b>는 “6주 전에”라는 뜻이에요.',
    },
  ],
};
function seasonQuestions() {
  const dir = new URL('../../src/data/episodes/', import.meta.url);
  return readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort().flatMap((file) => {
    const data = yaml.load(readFileSync(new URL(file, dir), 'utf8')) as Parameters<typeof getVisibleMoreContent>[0];
    return getVisibleMoreContent(data).questions;
  });
}

describe('Explicit Episode question content and speaker grouping', () => {
  it('matches all current compare/text structures, including terms, descriptions, intro and note', () => {
    const questions = seasonQuestions();
    expect(questions).toEqual(Object.values(expectedQuestionsByEpisode).flat());
    for (const [no, expected] of Object.entries(expectedQuestionsByEpisode)) {
      expect(getVisibleMoreContent({ season: 1, no: Number(no), wordGroups: [] }).questions).toEqual(expected);
    }
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
    expect({ ...compare, title: '다른 제목 — 슬래시 없음', intro: '소개.', note: '마무리.' }).toEqual({ kind: 'compare', title: '다른 제목 — 슬래시 없음', items: compare.items, intro: '소개.', note: '마무리.' });
    expect({ kind: 'text', title, answer: '일반 문단.' } satisfies Question).toEqual({ kind: 'text', title, answer: '일반 문단.' });
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

// Compile the real Astro components and their real child components; no renderer mocks.
async function loadAstroComponent(name: string) {
  const file = new URL(`../../src/components/${name}.astro`, import.meta.url);
  const result = await build({ entryPoints: [fileURLToPath(file)], bundle: true, write: false,
    platform: 'node', format: 'esm', packages: 'external',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    plugins: [{ name: 'astro-test-compiler', setup(builder) {
      builder.onLoad({ filter: /\.astro$/ }, async ({ path }) => ({
        contents: (await transform(readFileSync(path, 'utf8'), { filename: path, internalURL: 'astro/compiler-runtime', resolvePath: async specifier => specifier })).code,
        loader: 'ts', resolveDir: dirname(path),
      }));
    } }],
  });
  const require = createRequire(import.meta.url);
  const code = result.outputFiles[0].text.replace(/from "([^".][^"]*)"/g,
    (_, specifier: string) => `from "${pathToFileURL(require.resolve(specifier)).href}"`);
  return (await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
}

let sceneComponent: Awaited<ReturnType<typeof loadAstroComponent>>;
let questionComponent: Awaited<ReturnType<typeof loadAstroComponent>>;
beforeAll(async () => {
  [sceneComponent, questionComponent] = await Promise.all([loadAstroComponent('EpisodeScene'), loadAstroComponent('EpisodeQuestion')]);
});

const speech = { who: '나', side: 'a', jp: '今夜[こんや]は?', kr: '오늘 밤은?' } as const;
const narration = { kind: 'narration', text: '잠시 후' } as const;

describe('Narration schema, rendered structure and boundaries', () => {
  it('accepts existing speech unchanged and narration only with readable text', () => {
    expect(sceneLineSchema.parse(speech)).toEqual(speech);
    expect(sceneLineSchema.parse({ who: '친구', jp: 'うん', kr: '응' })).toEqual({ who: '친구', side: 'a', jp: 'うん', kr: '응' });
    expect(sceneLineSchema.parse(narration)).toEqual(narration);
    for (const value of [{ kind: 'narration', text: ' ' }, { kind: 'narration' }, { kind: 'narration', text: '잠시 후', audio: '/a.mp3' }, { ...speech, kind: 'narration', text: '잠시 후' }]) {
      expect(sceneLineSchema.safeParse(value).success).toBe(false);
    }
  });
  it('preserves speech-only sceneIndex while retaining every narration in UI order', () => {
    const next = { ...speech, jp: 'いいよ', kr: '괜찮아' };
    const lines: SceneLine[] = [narration, speech, narration, next, narration];
    const projected = splitSceneLines(lines);
    expect(projected.scene).toEqual([speech, next]);
    expect(projected.scene[1]).toEqual(next);
    expect(projected.sceneLines).toEqual(lines);
    expect(splitSceneLines([speech, next]).scene).toEqual([speech, next]);
  });
  it('narration breaks same-speaker continuity before and after it', () => {
    const lines: SceneLine[] = [speech, speech, narration, speech, speech, narration, narration, speech];
    expect(lines.map((_, index) => isSameSpeakerContinuation(lines, index))).toEqual([false, true, false, false, true, false, false, false]);
  });
  it('renders narration as readable text with no avatar, name, bubble, Speak or audio', async () => {
    const container = await experimental_AstroContainer.create();
    const html = await container.renderToString(sceneComponent, { props: { lines: [narration] } });
    expect(html).toContain('<p class="scene-narration">잠시 후</p>');
    for (const token of ['scene-avatar', 'bubble-row', 'class="bubble"', 'class="who"', 'class="jp"', 'class="kr"', 'spk', 'data-jp', 'data-audio', 'aria-hidden']) expect(html).not.toContain(token);
    const escaped = await container.renderToString(sceneComponent, { props: { lines: [{ kind: 'narration', text: '<img src=x> 잠시 후' }] } });
    expect(escaped).toContain('&lt;img src=x&gt;');
    expect(escaped).not.toContain('<img');
  });
  it('renders one dialogue DOM and restores the normal avatar after narration; ruby and Speak remain', async () => {
    const container = await experimental_AstroContainer.create();
    const html = await container.renderToString(sceneComponent, { props: { lines: [speech, speech, narration, speech] } });
    expect(html.match(/class="phone episode-scene"/g)).toHaveLength(1);
    expect(html.match(/class="bubble-row a"/g)).toHaveLength(2);
    expect(html.match(/class="bubble-row a same-speaker"/g)).toHaveLength(1);
    expect(html.match(/class="who">나/g)).toHaveLength(3);
    expect(html.match(/class="spk"/g)).toHaveLength(3);
    expect(html).toContain('<rt>こんや</rt>');
    expect(html).toContain('/ui/ico_speaker.webp');
    expect(html).toContain('/ui/avatar-crow.webp');
  });
});

describe('Question renderer follows explicit kind without flattening content', () => {
  it('renders compare items, optional intro/note and Rich independently of title syntax', async () => {
    const container = await experimental_AstroContainer.create();
    const question: Question = { kind: 'compare', title: '<span lang="ja">頼[たの]む / 注文[ちゅうもん]する</span>는 어떻게 다를까?',
      intro: '소개.', items: [{ term: '頼[たの]む', description: '친구에게 말해요.' }, { term: '注文[ちゅうもん]する', description: '주문할 때 보여요.' }], note: '둘 다 가능해요.' };
    for (const title of [question.title, '슬래시 없는 제목']) {
      const html = await container.renderToString(questionComponent, { props: { question: { ...question, title } } });
      expect(html).toContain('<dl class="episode-comparison">');
      expect(html.match(/<dt /g)).toHaveLength(2); expect(html.match(/<dd>/g)).toHaveLength(2);
      for (const value of ['소개.', '친구에게 말해요.', '주문할 때 보여요.', '둘 다 가능해요.', '<rt>たの</rt>', '<rt>ちゅうもん</rt>']) expect(html).toContain(value);
    }
  });
  it('renders a text question as its original answer, without comparison markup', async () => {
    const container = await experimental_AstroContainer.create();
    const question: Question = { kind: 'text', title: 'A / B 설명', answer: '일반 <b>문단</b>.' };
    const html = await container.renderToString(questionComponent, { props: { question } });
    expect(html).toContain('일반 <b>문단</b>.');
    expect(html).not.toContain('<dl'); expect(html).not.toContain('<dt'); expect(html).not.toContain('<dd');
  });
});
