import { z } from 'astro/zod';

/** Display assets only; unknown speakers retain their real name and a text fallback. */
export function speakerAvatar(who: string): string | undefined {
  return ({ '나': '/ui/avatar-crow.webp', '친구': '/ui/avatar-friend.webp' } as Record<string, string>)[who];
}

export const sceneLineSchema = z.union([
  z.object({ who: z.string(), side: z.enum(['a', 'b']).default('a'), jp: z.string(), kr: z.string(), kind: z.never().optional() }),
  z.object({ kind: z.literal('narration'), text: z.string().trim().min(1) }).strict(),
]);
export type SceneLine = z.output<typeof sceneLineSchema>;
export type NarrationLine = Extract<SceneLine, { kind: 'narration' }>;
export type SpeechLine = Exclude<SceneLine, NarrationLine>;
interface SpeakerLine { who: string; side: 'a' | 'b' }
export function isNarration(line: SpeakerLine | NarrationLine): line is NarrationLine {
  return 'kind' in line && line.kind === 'narration';
}
/** UI keeps narration in order; learning retains the existing speech-only sceneIndex. */
export function splitSceneLines(lines: readonly SceneLine[]): { scene: SpeechLine[]; sceneLines: SceneLine[] } {
  return { scene: lines.filter((line): line is SpeechLine => !isNarration(line)), sceneLines: [...lines] };
}
/** 실제 화자와 방향이 같은 바로 앞 문장만 연속 발화로 묶습니다. */
export function isSameSpeakerContinuation(lines: readonly (SpeakerLine | NarrationLine)[], index: number): boolean {
  const previous = lines[index - 1];
  const current = lines[index];
  return !!previous && !!current && !isNarration(previous) && !isNarration(current) && previous.who === current.who && previous.side === current.side;
}
