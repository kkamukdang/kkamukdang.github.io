import {
  LearningService,
  LocalStorageAdapter,
  getKstDate,
  type ExpressionId,
  type LearningStateV2,
  type ReviewStage,
  type SeasonId,
  type StorageLike,
} from '../learning';

export interface BrowserReviewPrompt {
  id: string;
  stage: ReviewStage;
  mode: 'scene' | 'cloze' | 'cued-recall' | 'choice';
  cue: string;
  answer: string;
  answerHtml: string;
  clozeHtml?: string;
  source: string;
  memoryScene?: string;
  memoryCue?: { asset: string; alt: string };
  scene?: { who: string; kr: string; jpHtml: string };
  explanation?: string;
}

export interface BrowserExpression {
  id: ExpressionId;
  jp: string;
  kr: string;
  emoji: string;
  no: number;
  season: number;
  slug: string;
  registry: { active: boolean } | null;
  prompts?: Record<ReviewStage, BrowserReviewPrompt> | null;
}

export interface LearningClient {
  service: LearningService;
  expressions: BrowserExpression[];
  byId: Record<ExpressionId, BrowserExpression>;
}

export function createLearningClient(
  storage: StorageLike,
  expressions: BrowserExpression[],
  now: () => Date = () => new Date(),
): LearningClient {
  const active = expressions.filter((item) => item.registry?.active);
  const episodeExpressions = Object.fromEntries(active.reduce((map, item) => {
    const episodeId = `s${String(item.season).padStart(2, '0')}e${String(item.no).padStart(2, '0')}`;
    const values = map.get(episodeId) ?? [];
    values.push(item.id);
    map.set(episodeId, values);
    return map;
  }, new Map<string, ExpressionId[]>()));
  const queueRegistry = Object.fromEntries(active.map((item) => [item.id, {
    active: true,
    episodeId: `s${String(item.season).padStart(2, '0')}e${String(item.no).padStart(2, '0')}`,
  }]));
  const adapter = new LocalStorageAdapter(storage, now);
  return {
    service: new LearningService(adapter, {
      activeExpressionIds: active.map((item) => item.id),
      queueRegistry,
      episodeExpressions,
    }),
    expressions: active,
    byId: Object.fromEntries(active.map((item) => [item.id, item])) as Record<ExpressionId, BrowserExpression>,
  };
}

export interface StampSummary {
  completedEpisodes: Set<number>;
  seasonCompleted: boolean;
}

export function reviewReadyEpisodeNumbers(
  expressions: BrowserExpression[],
  seasonId: SeasonId,
): Set<number> {
  const season = Number(seasonId.slice(1));
  const grouped = expressions.reduce((episodes, item) => {
    if (!item.registry?.active || item.season !== season) return episodes;
    const key = `${item.season}:${item.no}`;
    const values = episodes.get(key) ?? [];
    values.push(item);
    episodes.set(key, values);
    return episodes;
  }, new Map<string, BrowserExpression[]>());

  return new Set([...grouped.values()]
    .filter((items) => items.length === 3 && items.every((item) => (
      item.prompts?.R1 && item.prompts.R2 && item.prompts.R3
    )))
    .map((items) => items[0].no));
}

export function stampSummary(
  storage: StorageLike,
  state: LearningStateV2,
  seasonId: SeasonId,
  v2EpisodeNumbers: ReadonlySet<number>,
): StampSummary {
  const completedEpisodes = new Set(
    Object.entries(state.episodes)
      .filter(([episodeId, value]) => episodeId.startsWith(`${seasonId}e`) && value.completed)
      .map(([episodeId]) => Number(episodeId.slice(-2))),
  );
  let legacy: { episodes?: unknown; completed?: unknown } = {};
  try {
    const parsed = JSON.parse(storage.getItem(`kkmd:stamps:s${Number(seasonId.slice(1))}`) ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object') legacy = parsed as typeof legacy;
  } catch {
    legacy = {};
  }
  if (Array.isArray(legacy.episodes)) {
    legacy.episodes.forEach((value) => {
      const episodeNo = Number(value);
      if (Number.isInteger(episodeNo)
        && episodeNo >= 1
        && episodeNo <= 6
        && !v2EpisodeNumbers.has(episodeNo)) {
        completedEpisodes.add(episodeNo);
      }
    });
  }
  return {
    completedEpisodes,
    seasonCompleted: Boolean(state.seasons[seasonId]?.completed || legacy.completed),
  };
}

export function reviewableExpressions(expressions: BrowserExpression[]): BrowserExpression[] {
  return expressions.filter((item) => item.registry?.active
    && item.prompts?.R1
    && item.prompts.R2
    && item.prompts.R3);
}

export function currentReviewItem(state: LearningStateV2): ExpressionId | null {
  const flow = state.reviewFlow;
  const batch = flow?.batches.find((item) => item.id === flow.activeBatchId);
  return batch?.expressionIds.find((id) => !batch.answeredIds.includes(id)) ?? null;
}

export function activeBatchProgress(state: LearningStateV2): { current: number; total: number } {
  const flow = state.reviewFlow;
  const batch = flow?.batches.find((item) => item.id === flow.activeBatchId);
  const total = batch?.expressionIds.length ?? 0;
  return { current: total ? Math.min((batch?.answeredIds.length ?? 0) + 1, total) : 0, total };
}

export function makeEpisodeEventId(episodeId: string): string {
  return `ui:episode-complete:${episodeId}`;
}

export function makeUnsureEventId(expressionId: ExpressionId, today: string): string {
  return `ui:unsure:${expressionId}:${today}`;
}

export function todayKst(now = new Date()): `${number}-${number}-${number}` {
  return getKstDate(now);
}

export function mutationErrorMessage(code: string): string {
  if (code === 'conflict') return '다른 화면에서 기록이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.';
  if (code === 'storage-unavailable') return '이 브라우저에서는 기록을 저장할 수 없어요. 저장 허용 여부를 확인해 주세요.';
  if (code === 'write-failed') return '기록을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  if (code === 'invalid-state') return '저장된 기록을 안전하게 읽지 못했어요. 기존 기록은 덮어쓰지 않았습니다.';
  if (code === 'invalid-command') return '요청 정보가 올바르지 않아 기록을 바꾸지 않았어요. 새로고침한 뒤 다시 시도해 주세요.';
  return '요청을 반영하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.';
}
