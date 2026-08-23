# 까먹당 — 뉴스레터 아카이브

메일리로 발행한 회차를 쌓아두는 정적 사이트입니다. 서버 없이 GitHub Pages 에서 돌아가고,
검색·목록·단어장·한자 쓰기 연습이 모두 정적 파일로 만들어집니다. 비용은 0원입니다.

---

## 손으로 HTML 을 복사하던 방식에서 달라진 점

| | 예전 | 지금 |
|---|---|---|
| 스타일 수정 | 회차 파일을 전부 열어서 고침 | `src/styles/` 한 곳만 고치면 전부 반영 |
| 후리가나 | `<ruby>` 태그 + `data-jp` 를 따로 입력 | `今夜[こんや]` 한 번만 쓰면 둘 다 자동 생성 |
| 이전/다음 편 | 매번 손으로 링크 연결 | 회차 번호 순서로 자동 연결 |
| 검색 | 없음 | Pagefind 정적 검색 (후리가나는 색인에서 제외) |
| 한자 획순 | 회차마다 파일에 통째로 포함 (36KB) | 필요한 글자만 받아옴 (페이지 4KB) |
| 단어장 | 만들 수 없음 | 전체 회차 단어를 자동으로 모아줌 |

회차 본문 파일 크기: **42KB → 24KB** (공통 CSS·JS 가 빠져 캐시되기 때문)

---

## 처음 한 번만 하는 설정

### 1. 저장소 만들고 올리기

```bash
git init
git add .
git commit -m "까먹당 아카이브 시작"
git branch -M main
git remote add origin https://github.com/아이디/저장소이름.git
git push -u origin main
```

### 2. 주소 맞추기

`astro.config.mjs` 의 `site` 를 본인 주소로 바꿉니다.

- `아이디.github.io` 저장소를 쓴다면 → `site` 만 바꾸고 `base` 는 그대로 둡니다
- 다른 이름의 저장소를 쓴다면 → `base: '/저장소이름'` 주석을 풀어줍니다

### 3. 배포 켜기

저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 바꿉니다.
이후 `main` 에 푸시할 때마다 자동으로 빌드·배포됩니다.

---

## 새 회차 올리는 흐름

```bash
# 1. 템플릿 복사 (파일 이름이 곧 주소가 됩니다)
cp src/data/episodes/_template.yaml.txt src/data/episodes/002-takeout-mistake.yaml

# 2. 내용을 채웁니다. 한자에는 今夜[こんや] 처럼 읽는 법을 붙여주세요.

# 3. 점검 — 중복·누락·발음 위험을 알려줍니다
npm run check

# 4. 새 한자가 있으면 획순 데이터를 받아둡니다 (3번이 알려줍니다)
node scripts/add-kanji.mjs 変 更 傘

# 5. 눈으로 확인
npm run dev        # http://localhost:4321

# 6. 올리면 끝
git add . && git commit -m "002 포장 실수" && git push
```

`draft: true` 인 회차는 목록·검색·배포 모두에서 빠집니다. 초안을 미리 올려둬도 안전해요.

---

## 명령어

```bash
npm install     # 최초 1회
npm run dev     # 개발 서버 (검색은 동작하지 않는 게 정상입니다)
npm run check   # 원고 점검 — 중복·누락·발음 위험 찾기
npm run build   # 점검 + 빌드 + 검색 색인 생성 → dist/
npm run preview # 빌드 결과 확인. 검색까지 여기서 테스트하세요
```

### npm run check — 원고 점검

새 회차를 쓰고 나서 한 번 돌려보세요. 네 가지를 봐줍니다.

| | 무엇을 | 어떻게 나오나 |
|---|---|---|
| 중복 | 이전 회차에 이미 나온 단어·문법·문장 | `중복 단어 我慢 ← #001 에서 이미 다뤘어요` |
| 획순 누락 | `kanjiPractice` 에 썼는데 데이터가 없는 한자 | `획순 없음 傘 → node scripts/add-kanji.mjs 傘` |
| 발음 위험 | 음성이 틀리게 읽기 쉬운 한자 | `발음 확인 中[ちゅう] → 中[[ちゅう]] 로 바꾸세요` |
| 형식 | 회차 번호 중복, 퀴즈 정답 개수, 빈 섹션 | `퀴즈 정답 Q1 의 정답이 2개입니다` |

빨간색은 고쳐야 하는 것, 노란색·하늘색은 확인만 해보라는 알림이에요.
복습용으로 일부러 같은 단어를 다시 다루는 거라면 노란색은 그냥 넘어가면 됩니다.

특정 회차만 보려면 번호를 붙이세요.

```bash
npm run check 002
```

`npm run build` 는 점검을 먼저 돌리므로, 빨간 항목이 있으면 배포 전에 걸러집니다.
`draft: true` 인 회차도 중복 비교 대상에 포함돼요 — 초안끼리 겹치는 것도 잡아줍니다.

> 검색 색인은 빌드할 때 만들어집니다. `npm run dev` 에서 검색이 안 되면 정상이고,
> `npm run build && npm run preview` 로 확인하면 됩니다.

---

## 폴더 구조

```
src/
  data/episodes/          ← 회차 하나 = YAML 하나. 평소엔 여기만 만집니다
    _template.yaml.txt      새 회차 템플릿
    001-late-night-food.yaml
  content.config.ts       회차 데이터에 어떤 항목이 들어가는지 정의
  lib/
    furigana.ts           今夜[こんや] → ruby / 음성용 텍스트 변환
    site.ts               사이트 이름·구독 주소 등
  components/             SCENE, WORD, CHECK, APPLY, QUIZ 블록
  layouts/Base.astro      폰트·테마·음성 재생 (모든 페이지 공용)
  styles/
    tokens.css            색 · 폰트 변수 — 디자인 변경은 여기부터
    nav.css               상단 내비 · 알약 버튼 (모든 페이지 공용)
    episode.css           회차 본문
    list.css              목록 · 검색 · 단어장
    cards.css             단어 플래시카드
    write.css             한자 쓰기
  pages/
    [...page].astro       회차 목록 (12편씩 페이징) + 검색 + 태그 필터
    words.astro           전체 단어장 (타일 그리드)
    cards.astro           단어 플래시카드 (넘기며 외우기)
    ep/[slug].astro       회차 본문
    ep/[slug]/write.astro 한자 쓰기 연습

public/
  kanji/                  획순 데이터 (글자 하나당 파일 하나)
  audio/                  음성 파일 (지금은 비어 있어도 됩니다)
  write-engine.js         한자 쓰기 엔진
  known.js                외운 단어 기록 (브라우저에만 저장)
```

---

## 음성에 대해

지금은 브라우저 내장 음성으로 읽어줍니다. 무료지만 기기마다 음질이 다르고,
iOS Safari 는 일본어 음성이 없는 경우가 있어요.

나중에 mp3 를 직접 넣고 싶으면 `public/audio/` 에 두고 YAML 에서 가리키면 됩니다.
**서버 비용은 들지 않습니다** — GitHub Pages 가 정적 파일을 무료로 서빙하고,
100회차를 채워도 용량 한도의 몇 % 수준이에요. 자세한 계산은 `public/audio/README.md` 에 적어뒀습니다.

파일이 없으면 자동으로 브라우저 음성으로 넘어가므로, 일부만 녹음해도 페이지가 깨지지 않습니다.

---

## 자주 바꾸는 설정

`src/lib/site.ts` 한 파일에 모여 있습니다.

| 값 | 하는 일 |
|---|---|
| `subscribeUrl` | 메일리 구독 페이지 주소 |
| `subscribeOnEpisodes` | 회차 본문 아래에도 구독 카드를 넣을지 (`false` 면 목록에만) |
| `since` | 저작권 표기 시작 연도 |
| `email` | 오류 제보용 주소 |

---

## 외운 단어 기록

카드에서 "외웠어요" 를 누르면 그 단어를 브라우저에 기록해 둡니다.
단어장의 **외움 / 안 외움** 탭과 카드의 **안 외운 것만** 필터가 이 기록을 함께 씁니다.

- 저장 위치는 방문자의 브라우저뿐입니다. 서버로 아무것도 보내지 않아요
- 기기를 바꾸거나 브라우저 기록을 지우면 초기화됩니다
- 단어장의 "기록 지우기" 로 직접 초기화할 수도 있어요
- 저장을 막아둔 브라우저(시크릿 모드 등)에서도 페이지는 정상 동작합니다

---

## 출처와 저작권

회차의 글·예문·해설은 까먹당이 만든 것으로, 푸터에 저작권을 표기합니다.
한자 획순 데이터는 [KanjiVG](https://kanjivg.tagaini.net/) (CC BY-SA 3.0) 를 씁니다.
