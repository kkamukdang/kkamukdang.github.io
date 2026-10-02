/** Display assets only; unknown speakers retain their real name and a text fallback. */
export function speakerAvatar(who: string): string | undefined {
  return ({ '나': '/ui/avatar-crow.webp', '친구': '/ui/avatar-friend.webp' } as Record<string, string>)[who];
}

interface SpeakerLine { who: string; side: 'a' | 'b' }
/** 실제 화자와 방향이 같은 바로 앞 문장만 연속 발화로 묶습니다. */
export function isSameSpeakerContinuation(lines: readonly SpeakerLine[], index: number): boolean {
  const previous = lines[index - 1];
  const current = lines[index];
  return !!previous && !!current && previous.who === current.who && previous.side === current.side;
}
