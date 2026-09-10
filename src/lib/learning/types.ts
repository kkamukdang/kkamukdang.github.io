export type SchemaVersion = 2;
export type SeasonId = `s${number}`;
export type EpisodeId = `s${number}e${number}`;
export type ExpressionId = `${EpisodeId}-${string}`;
export type DateOnly = `${number}-${number}-${number}`;
export type Instant = string;

export type ReviewStage = 'R1' | 'R2' | 'R3';
export type Rating = 'remembered' | 'fuzzy' | 'unfamiliar';
export type ReviewSource = 'again' | 'newsletter' | 'season-review';
export type RegistrationSource =
  | 'episode'
  | 'unsure'
  | 'newsletter'
  | 'season-review'
  | 'reactivation';
export type ReceiptType =
  | 'episode_completed'
  | 'newsletter_rating'
  | 'season_completed'
  | 'expression_reactivated'
  | 'review_answered'
  | 'unsure_accelerated'
  | 'season_review_answered';

export interface ExpressionStateV2 {
  registeredAt: Instant;
  registeredSource: RegistrationSource;
  reviewStage: ReviewStage;
  rememberStreak: 0 | 1 | 2 | 3;
  lastRating: Rating | null;
  cueBoost: 0 | 1;
  graduated: boolean;
  graduatedAt?: Instant;
  nextReviewDate: DateOnly | null;
  lastReviewedAt?: Instant;
  lastSource?: ReviewSource;
  lastPromptId?: string;
}

export interface EpisodeStateV2 {
  completed: true;
  completedAt: Instant;
}

export interface SeasonReviewProgress {
  visitedAt?: Instant;
  responses: Record<ExpressionId, {
    rating: Rating;
    answeredAt: Instant;
    eventId: string;
  }>;
}

export interface SeasonStateV2 {
  review: SeasonReviewProgress;
  completed: boolean;
  completedAt?: Instant;
  stampCode?: string;
}

export interface ReviewBatch {
  id: string;
  kind: 'daily' | 'extra';
  expressionIds: ExpressionId[];
  answeredIds: ExpressionId[];
  createdAt: Instant;
}

export interface ReviewFlowState {
  date: DateOnly;
  batches: ReviewBatch[];
  activeBatchId?: string;
  baseCompletedAt?: Instant;
}

export interface EventReceipt {
  type: ReceiptType;
  payloadHash: string;
  processedAt: Instant;
}

export type LearningEventType =
  | 'expression_registered'
  | 'unsure_accelerated'
  | 'review_answered'
  | 'expression_graduated'
  | 'expression_reactivated'
  | 'episode_completed'
  | 'season_review_answered'
  | 'season_completed';

export interface LearningEvent {
  eventId: string;
  type: LearningEventType;
  at: Instant;
  expressionId?: ExpressionId;
  episodeId?: EpisodeId;
  seasonId?: SeasonId;
  source?: RegistrationSource | ReviewSource;
  rating?: Rating;
  before?: Partial<ExpressionStateV2>;
  after?: Partial<ExpressionStateV2>;
  note?: string;
}

export interface LearningStateV2 {
  schemaVersion: SchemaVersion;
  revision: number;
  createdAt: Instant;
  updatedAt: Instant;
  timezone: 'Asia/Seoul';
  clock: { lastObservedAt: Instant; lastObservedDate: DateOnly };
  expressions: Record<ExpressionId, ExpressionStateV2>;
  episodes: Record<EpisodeId, EpisodeStateV2>;
  seasons: Record<SeasonId, SeasonStateV2>;
  reviewFlow?: ReviewFlowState;
  receipts: Record<string, EventReceipt>;
  history: LearningEvent[];
  migration?: {
    from: 1;
    migratedAt: Instant;
    sourceFingerprint: string;
    legacyCounters?: { reunions?: number; graduated?: number };
  };
}

export interface CommandBase { eventId: string; now: Instant }
export interface CompleteEpisodeCommand extends CommandBase {
  episodeId: EpisodeId;
  seasonId: SeasonId;
  expressionIds: [ExpressionId, ExpressionId, ExpressionId];
}
export interface MarkUnsureCommand extends CommandBase { expressionId: ExpressionId }
export interface RateReviewCommand extends CommandBase {
  expressionId: ExpressionId;
  rating: Rating;
  source: ReviewSource;
  promptId?: string;
  registerIfMissing?: boolean;
}
export interface ReactivateCommand extends CommandBase { expressionId: ExpressionId }
export interface SeasonReviewCommand extends CommandBase {
  seasonId: SeasonId;
  expressionId: ExpressionId;
  rating: Rating;
  promptId?: string;
}
export interface CompleteSeasonCommand extends CommandBase {
  seasonId: SeasonId;
  requiredEpisodeIds: EpisodeId[];
  stampCode: string;
}

export type LearningCommand =
  | CompleteEpisodeCommand
  | MarkUnsureCommand
  | RateReviewCommand
  | ReactivateCommand
  | SeasonReviewCommand
  | CompleteSeasonCommand;

export type MutationErrorCode =
  | 'storage-unavailable'
  | 'write-failed'
  | 'invalid-command'
  | 'invalid-state'
  | 'conflict';

export type MutationResult =
  | { ok: true; status: 'applied' | 'duplicate' | 'no-change'; state: LearningStateV2 }
  | { ok: false; code: MutationErrorCode };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

export type StorageReadResult =
  | { ok: true; value: LearningStateV2; source: 'v2' | 'migrated' | 'empty' }
  | { ok: false; code: 'unavailable' | 'corrupt' | 'migration-failed'; recoverable: boolean };

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; code: 'unavailable' | 'write-failed' | 'invalid-state' };

export type StorageUpdateResult =
  | { ok: true; value: LearningStateV2 }
  | { ok: false; code: 'unavailable' | 'write-failed' | 'invalid-state' | 'conflict' };

export type MigrationResult =
  | { ok: true; value: LearningStateV2; migrated: boolean; persisted: boolean }
  | { ok: false; code: 'unavailable' | 'invalid-v1' | 'invalid-v2' | 'write-failed'; issues?: string[] };

export interface TransitionResult {
  status: 'applied' | 'no-change';
  state: LearningStateV2;
}

