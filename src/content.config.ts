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
const memoryCue = z.object({
  asset: z.string().regex(/^\/characters\/[a-z0-9/_-]+\.(webp|png|svg)$/),
  alt: z.string().trim().min(10).max(120),
});
const stageReviewPrompt = z.object({
  cue: z.string().trim().min(1).max(120),
  answer: z.string().trim().min(1).max(120),
  answerHighlight: z.string().trim().min(1).max(80).optional(),
  explanation: z.string().trim().max(160).optional(),
  mode: z.enum(['cloze', 'cued-recall', 'choice']).default('cued-recall'),
});
const reviewPrompt = z.object({
  R2: stageReviewPrompt.optional(),
  R3: stageReviewPrompt.optional(),
}).strict().refine((value) => Boolean(value.R2 || value.R3), {
  message: 'reviewPrompt에는 R2 또는 R3 중 하나가 필요합니다',
});

const episodes = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/episodes' }),
  schema: z.object({
    // --- 기본 정보 ---
    no: z.number(),                       // 회차 번호. 정렬과 이전/다음 연결에 씁니다.
    season: z.number(),                   // 시즌 번호. 표현 ID 앞자리와 일치해야 합니다.
    /**
     * 그 회차를 떠올리게 하는 장면. 화면에는 나오지 않습니다.
     * 복습 문항의 "시간 맥락 한 줄" 을 만들 때 씁니다.
     */
    memoryScene: z.string(),
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
    /**
     * 이번 편에서 딱 3개.
     * wordGroups 와는 별개의 목록입니다. 단어·문법이 섞여도 되고,
     * 기준은 "그 장면에서 실제로 입에서 나와야 하는 말" 입니다.
     * 여기 뽑았다고 해서 wordGroups 에서 빼지 않습니다.
     */
    keyPoints: z.array(
      z.object({
        id: z.string().regex(/^s\d{2}e\d{2}-[a-z]+$/, '표현 ID 형식이 맞지 않습니다'),
        jp,
        kr: z.string(),
        note: z.string().optional(),      // 표현 옆 한 줄 설명
        /**
         * 이 표현이 실제로 나온 대화 줄 번호 (scene 배열의 인덱스).
         * 「이번 편에서 딱 3개」 카드가 그 문장을 그대로 다시 보여주고,
         * 대화에서도 해당 부분을 표시합니다.
         */
        sceneIndex: z.number().int().nonnegative().optional(),
        /** 마땅한 항목이 없으면 생략합니다. 억지로 붙이지 않아요. */
        compareIndex: z.number().int().nonnegative().optional(),
        applyIndex: z.number().int().nonnegative().optional(),
        quizIndex: z.number().int().nonnegative().optional(),
        memoryCue: memoryCue.optional(),
        reviewPrompt: reviewPrompt.optional(),
      })
    ).default([]),

    /**
     * 이 회차 뉴스레터 최상단에 낼 복습 문항.
     * 사이트에서는 렌더링하지 않고 메일 작성에만 씁니다.
     * 화면에 안 나오므로 오타를 npm run check 가 잡아줍니다.
     */
    reviewTargets: z.array(
      z.object({
        id: z.string(),
        scene: z.string(),
        cloze: z.string(),
        answer: z.string(),
      })
    ).default([]),

    /** 정정 이력. /corrections 페이지가 모아 보여줍니다. */
    corrections: z.array(
      z.object({
        date: z.string(),
        text: z.string(),
        note: z.string().optional(), 
      })
    ).default([]),
    nextPreview: z.string().optional(),   // NEXT 카드 본문 (HTML 허용)
  }),
});

export const collections = { episodes };
