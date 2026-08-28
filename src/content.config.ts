import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 회차 하나 = YAML 파일 하나.
 * 레이아웃·스타일·스크립트는 컴포넌트가 담당하고,
 * 여기에는 "무엇을 가르치는가"만 남깁니다.
 *
 * 일본어 필드에는 후리가나 단축 표기를 씁니다: 今夜[こんや]
 */

const jp = z.string(); // 후리가나 단축 표기가 허용되는 일본어 문자열

const episodes = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/episodes' }),
  schema: z.object({
    // --- 기본 정보 ---
    no: z.number(),                       // 회차 번호. 정렬과 이전/다음 연결에 씁니다.
    date: z.date(),
    title: jp,                            // 예: 今夜[こんや]チキン頼[たの]んでもいい?
    subtitle: z.string(),                 // 한국어 한 줄 설명
    emoji: z.string().default('📮'),
    description: z.string(),              // 목록·OG 태그에 쓰는 소개문
    tags: z.array(z.string()).default([]),
    /**
     * draft    : 페이지 자체를 만들지 않습니다. 아직 쓰는 중인 회차.
     * unlisted : 페이지는 만들되 목록·검색·단어카드에서 숨깁니다.
     *            주소를 아는 사람만 볼 수 있어요. 발행 전 점검용입니다.
     */
    draft: z.boolean().default(false),
    unlisted: z.boolean().default(false),

    /**
     * 지난 편 복습 한 줄. 본문 맨 위, SCENE 앞에 작게 붙습니다.
     * 비워두면 아예 나타나지 않아요. 인라인 HTML 과 후리가나 표기를 쓸 수 있습니다.
     */
    recap: z.string().optional(),

    // --- SCENE : 대화 ---
    scene: z.array(
      z.object({
        who: z.string(),                  // 화자 이름
        side: z.enum(['a', 'b']).default('a'), // a = 왼쪽(나), b = 오른쪽(상대)
        jp,
        kr: z.string(),
      })
    ).default([]),

    // --- WORD : 단어 / 문법 ---
    wordGroups: z.array(
      z.object({
        label: z.string(),                // 예: 🍗 야식 실전 표현
        items: z.array(
          z.object({
            jp,
            mean: z.string(),
            note: z.string().optional(),  // 인라인 HTML 허용 (<b>, <br>)
            speak: z.string().optional(), // 읽어줄 텍스트를 따로 지정할 때
          })
        ),
      })
    ).default([]),

    // --- CHECK : ❌ vs ✅ ---
    compare: z.array(
      z.object({
        title: z.string(),
        bad: z.object({
          mark: z.enum(['✕', '△']).default('✕'),
          jp,
          aside: z.string().optional(),   // 괄호 안 회색 보충 설명
        }),
        good: z.object({ jp }),
        tip: z.string(),
      })
    ).default([]),

    // --- APPLY : 응용 문장 ---
    apply: z.array(
      z.object({
        situation: z.string(),
        jp,
        kr: z.string(),
      })
    ).default([]),

    // --- QUIZ : 선택형 ---
    quiz: z.array(
      z.object({
        q: z.string(),                    // 후리가나 표기 사용 가능
        options: z.array(
          z.object({
            label: z.string(),            // a) / b)
            jp: z.string(),
            correct: z.boolean().default(false),
          })
        ),
      })
    ).default([]),

    // --- 한자 쓰기 연습 ---
    kanjiPractice: z.array(
      z.object({
        w: z.string(),                    // 쓰기 대상 단어 (후리가나 표기 없이)
        kana: z.string(),
        ko: z.string(),
        ex: z.string(),
        exko: z.string(),
      })
    ).default([]),

    // --- 마무리 ---
    keyPoints: z.array(jp).default([]),   // 푸터의 "오늘의 핵심"
    nextPreview: z.string().optional(),   // NEXT 카드 본문 (HTML 허용)
  }),
});

export const collections = { episodes };
