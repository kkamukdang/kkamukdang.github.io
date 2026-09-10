import type { ExpressionId, ReviewStage } from '../learning/types';

export interface MemoryCue { asset: string; alt: string }
export interface StageReviewPrompt { cue: string; answer: string; explanation?: string; mode?: 'cued-recall' | 'choice' }
export interface KeyPoint {
  id: ExpressionId;
  jp: string;
  kr: string;
  note?: string;
  sceneIndex: number;
  compareIndex?: number;
  applyIndex?: number;
  quizIndex?: number;
  memoryCue?: MemoryCue;
  reviewPrompt?: Partial<Record<Exclude<ReviewStage, 'R1'>, StageReviewPrompt>>;
}
export interface EpisodeData {
  no: number;
  season: number;
  memoryScene: string;
  scene: Array<{ who: string; side?: 'a' | 'b'; jp: string; kr: string }>;
  apply: Array<{ situation: string; jp: string; kr: string }>;
  compare: Array<{ title: string; bad: { jp: string }; good: { jp: string }; tip: string }>;
  quiz: Array<{ q: string; options: Array<{ label: string; jp: string; correct?: boolean }> }>;
  keyPoints: KeyPoint[];
}

