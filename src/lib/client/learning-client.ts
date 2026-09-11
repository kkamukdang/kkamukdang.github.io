import {
  LearningService,
  LocalStorageAdapter,
  getKstDate,
  type ExpressionId,
  type StorageLike,
} from '../learning';

export interface BrowserExpression {
  id: ExpressionId;
  no: number;
  season: number;
  registry: { active: boolean } | null;
}

export interface LearningClient {
  service: LearningService;
  expressions: BrowserExpression[];
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
  };
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
  return '요청을 반영하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.';
}
