import type { EpisodeData, KeyPoint, MemoryCue, StageReviewPrompt } from '../content/episode-types';
import type { RegistryExpression } from '../content/expression-registry';
import type { ExpressionStateV2, ReviewStage } from './types';

export interface ReviewPrompt {
  id: string; stage: ReviewStage; mode: 'scene' | 'cued-recall' | 'choice';
  cue: string; answer: string; answerHighlight?: string; explanation?: string; source: 'scene' | 'apply' | 'reviewPrompt.R2' | 'reviewPrompt.R3' | 'quiz' | 'compare';
  scene?: EpisodeData['scene'][number]; memoryScene?: string; memoryCue?: MemoryCue; cueBoost: boolean;
}

function explicit(stage: 'R2' | 'R3', prompt: StageReviewPrompt, keyPoint: KeyPoint, cueBoost: boolean): ReviewPrompt {
  return { id: `${keyPoint.id}:${stage}:explicit`, stage, mode: prompt.mode ?? 'cued-recall', cue: prompt.cue, answer: prompt.answer, answerHighlight: prompt.answerHighlight, explanation: prompt.explanation, source: `reviewPrompt.${stage}`, cueBoost };
}

export function resolveReviewPrompt(args: { episode: EpisodeData; keyPoint: KeyPoint; registry: RegistryExpression; state: ExpressionStateV2 }): ReviewPrompt {
  const { episode, keyPoint, state } = args;
  if (state.reviewStage === 'R1') {
    const scene = episode.scene[keyPoint.sceneIndex];
    if (!scene) throw new Error(`${keyPoint.id}: R1 sceneIndex를 해석할 수 없음`);
    return { id: `${keyPoint.id}:R1:scene:${keyPoint.sceneIndex}`, stage: 'R1', mode: 'scene', cue: scene.kr, answer: keyPoint.jp, source: 'scene', scene, memoryScene: episode.memoryScene, memoryCue: keyPoint.memoryCue, cueBoost: true };
  }
  if (state.reviewStage === 'R2') {
    if (keyPoint.applyIndex !== undefined) {
      const apply = episode.apply[keyPoint.applyIndex];
      if (!apply) throw new Error(`${keyPoint.id}: R2 applyIndex를 해석할 수 없음`);
      return { id: `${keyPoint.id}:R2:apply:${keyPoint.applyIndex}`, stage: 'R2', mode: 'cued-recall', cue: apply.kr, answer: apply.jp, source: 'apply', cueBoost: state.cueBoost === 1 };
    }
    if (keyPoint.reviewPrompt?.R2) return explicit('R2', keyPoint.reviewPrompt.R2, keyPoint, state.cueBoost === 1);
    throw new Error(`${keyPoint.id}: R2 prompt가 없음`);
  }
  if (keyPoint.reviewPrompt?.R3) return explicit('R3', keyPoint.reviewPrompt.R3, keyPoint, state.cueBoost === 1);
  if (keyPoint.quizIndex !== undefined) {
    const quiz = episode.quiz[keyPoint.quizIndex];
    const answer = quiz?.options.find((option) => option.correct)?.jp;
    if (!quiz || !answer) throw new Error(`${keyPoint.id}: R3 quizIndex를 해석할 수 없음`);
    return { id: `${keyPoint.id}:R3:quiz:${keyPoint.quizIndex}`, stage: 'R3', mode: 'choice', cue: quiz.q, answer, source: 'quiz', cueBoost: state.cueBoost === 1 };
  }
  if (keyPoint.compareIndex !== undefined) {
    const compare = episode.compare[keyPoint.compareIndex];
    if (!compare) throw new Error(`${keyPoint.id}: R3 compareIndex를 해석할 수 없음`);
    return { id: `${keyPoint.id}:R3:compare:${keyPoint.compareIndex}`, stage: 'R3', mode: 'choice', cue: compare.title, answer: compare.good.jp, explanation: compare.tip, source: 'compare', cueBoost: state.cueBoost === 1 };
  }
  throw new Error(`${keyPoint.id}: R3 prompt가 없음`);
}

export function validateEpisodeReviewContent(episode: EpisodeData): string[] {
  const issues: string[] = [];
  if (episode.keyPoints.length !== 3) issues.push('keyPoints는 정확히 3개여야 함');
  for (const keyPoint of episode.keyPoints) {
    if (!episode.scene[keyPoint.sceneIndex]) issues.push(`${keyPoint.id}: sceneIndex 범위 오류`);
    if (keyPoint.applyIndex !== undefined && !episode.apply[keyPoint.applyIndex]) issues.push(`${keyPoint.id}: applyIndex 범위 오류`);
    if (keyPoint.compareIndex !== undefined && !episode.compare[keyPoint.compareIndex]) issues.push(`${keyPoint.id}: compareIndex 범위 오류`);
    if (keyPoint.quizIndex !== undefined && !episode.quiz[keyPoint.quizIndex]) issues.push(`${keyPoint.id}: quizIndex 범위 오류`);
    if (keyPoint.reviewPrompt && 'R1' in keyPoint.reviewPrompt) issues.push(`${keyPoint.id}: reviewPrompt.R1은 허용하지 않음`);
    for (const stage of ['R2', 'R3'] as const) {
      const prompt = keyPoint.reviewPrompt?.[stage];
      if (prompt?.answerHighlight && !prompt.answer.includes(prompt.answerHighlight)) {
        issues.push(`${keyPoint.id}: reviewPrompt.${stage}.answerHighlight가 answer에 없음`);
      }
    }
    if (keyPoint.reviewPrompt?.R3 && !keyPoint.reviewPrompt.R3.answerHighlight) {
      issues.push(`${keyPoint.id}: reviewPrompt.R3.answerHighlight 필수`);
    }
    if (keyPoint.applyIndex === undefined && !keyPoint.reviewPrompt?.R2) issues.push(`${keyPoint.id}: R2 resolver 없음`);
    if (!keyPoint.reviewPrompt?.R3 && keyPoint.quizIndex === undefined && keyPoint.compareIndex === undefined) issues.push(`${keyPoint.id}: R3 resolver 없음`);
  }
  return issues;
}
