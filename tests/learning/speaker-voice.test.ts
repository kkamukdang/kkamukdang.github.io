import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Exercise the actual shared handler, including its unchanged audio-first branch.
const base = readFileSync(new URL('../../src/layouts/Base.astro', import.meta.url), 'utf8');
const start = base.indexOf('    (function () {', base.indexOf('/* ---------- 발음 재생'));
const handler = base.slice(start, base.indexOf('/* ---------- 퀴즈', start));
type Voice = { name: string; voiceURI: string; lang: string };
interface TestButton {
  dataset: Record<string, string>; getAttribute: (name: string) => string | null; hasAttribute: (name: string) => boolean;
  classList: { add: (name: string) => void; remove: (name: string) => void; contains: (name: string) => boolean };
}
const voice = (name: string, lang = 'ja-JP'): Voice => ({ name, voiceURI: `voice:${name}`, lang });
function harness(initial: Voice[]) {
  let voices = initial;
  const utterances: { text: string; voice?: Voice; lang?: string; rate?: number; onend?: () => void; onerror?: () => void }[] = [];
  const audios: { file: string; onerror?: () => void; onended?: () => void; pause: () => void; play: () => Promise<void> }[] = [];
  const buttons: TestButton[] = [];
  let click: (event: unknown) => void = () => { throw new Error('handler not installed'); };
  const synth = { getVoices: () => voices, cancel: () => {}, speak: (utterance: typeof utterances[number]) => utterances.push(utterance), onvoiceschanged: () => {} };
  function button(speaker?: string, audio?: string): TestButton {
    const attrs: Record<string, string> = { 'data-jp': '日本語' };
    if (speaker !== undefined) attrs['data-speaker'] = speaker;
    if (audio) attrs['data-audio'] = audio;
    const classes = new Set<string>();
    const btn = { dataset: {} as Record<string, string>, getAttribute: (name: string) => attrs[name] ?? null,
      hasAttribute: (name: string) => name in attrs,
      classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name) },
    };
    buttons.push(btn); return btn;
  }
  runInNewContext(handler, { window: { speechSynthesis: synth }, document: {
    addEventListener: (name: string, callback: typeof click) => { if (name === 'click') click = callback; },
    querySelectorAll: () => buttons.filter(btn => btn.classList.contains('playing')),
    getElementById: () => ({ style: {} }),
  }, SpeechSynthesisUtterance: class { constructor(public text: string) {} },
  Audio: class { onerror?: () => void; onended?: () => void;
    constructor(public file: string) { audios.push(this); } pause() {} play() { return Promise.resolve(); }
  } });
  return { utterances, audios, synth, button, setVoices: (next: Voice[]) => { voices = next; synth.onvoiceschanged(); },
    click: (btn: ReturnType<typeof button>) => click({ target: { closest: () => btn } }),
  };
}

describe('Episode speaker voice and audio-first contracts', () => {
  it('assigns distinct Japanese voices by who, stable across list order and repeated clicks', () => {
    const a = voice('A'); const b = voice('B'); const h = harness([b, voice('English', 'en-US'), a]);
    const me = h.button('나'); const friend = h.button('친구');
    h.click(me); h.click(friend); h.setVoices([a, b]); h.click(me); h.click(friend);
    expect(h.utterances.map(item => item.voice?.name)).toEqual(['A', 'B', 'A', 'B']);
    expect(me.dataset.ttsVoice).toBe('A'); expect(friend.dataset.ttsVoice).toBe('B');
    expect(friend.dataset.playbackSource).toBe('browser-tts');
    expect(friend.dataset.ttsVoiceLang).toBe('ja-JP');
    expect(h.utterances.every(item => item.lang === 'ja-JP' && item.rate === .85)).toBe(true);
  });
  it('shares a single Japanese voice and ignores duplicate entries', () => {
    const a = voice('Only', 'ja'); const h = harness([a, { ...a }]);
    h.click(h.button('나')); h.click(h.button('친구'));
    expect(h.utterances.map(item => item.voice?.name)).toEqual(['Only', 'Only']);
  });
  it('keeps lang ja-JP with no explicit voice when Japanese voices are unavailable', () => {
    const h = harness([voice('English', 'en-US')]);
    h.click(h.button('나')); h.click(h.button('친구')); h.click(h.button());
    expect(h.utterances.every(item => item.voice === undefined && item.lang === 'ja-JP')).toBe(true);
  });
  it('unknown and absent speakers retain the existing default Japanese voice', () => {
    const h = harness([voice('B'), voice('A')]);
    h.click(h.button('가게 직원')); h.click(h.button());
    expect(h.utterances.map(item => item.voice?.name)).toEqual(['B', 'B']);
  });
  it('refreshes voices that arrive after page initialization', () => {
    const h = harness([]); h.setVoices([voice('A'), voice('B')]); h.click(h.button('친구'));
    expect(h.utterances[0].voice?.name).toBe('B');
  });
  it('plays data-audio first and preserves playing/end behavior without speaking TTS', () => {
    const h = harness([voice('A'), voice('B')]); const btn = h.button('친구', '/voice/pre-recorded.mp3');
    h.click(btn);
    expect(h.audios.map(item => item.file)).toEqual(['/voice/pre-recorded.mp3']);
    expect(h.utterances).toHaveLength(0); expect(btn.dataset.playbackSource).toBe('audio');
    expect(btn.classList.contains('playing')).toBe(true);
    h.audios[0].onended?.(); expect(btn.classList.contains('playing')).toBe(false);
  });
  it('failed audio retains TTS fallback with the same speaker mapping and clears playing on completion', () => {
    const h = harness([voice('A'), voice('B')]); const btn = h.button('친구', '/voice/missing.mp3');
    h.click(btn); h.audios[0].onerror?.();
    expect(h.utterances[0].voice?.name).toBe('B'); expect(btn.dataset.playbackSource).toBe('browser-tts');
    h.utterances[0].onend?.(); expect(btn.classList.contains('playing')).toBe(false);
  });
});


const nanami = 'Microsoft 七海 Online (Natural) - Japanese (Japan)';
const keita = 'Microsoft 圭太 Online (Natural) - Japanese (Japan)';
describe('Explicit preferred Japanese Natural voices', () => {
  it('prefers the requested voices over the existing sorted assignment', () => {
    const h = harness([voice('A'), voice('B'), voice(keita), voice(nanami)]);
    h.click(h.button('나')); h.click(h.button('친구'));
    expect(h.utterances.map(item => item.voice?.name)).toEqual([keita, nanami]);
  });
  it('uses an available preference independently; an absent preference retains the original fallback', () => {
    const h = harness([voice('A'), voice('B'), voice(keita)]);
    h.click(h.button('나')); h.click(h.button('친구'));
    expect(h.utterances.map(item => item.voice?.name)).toEqual([keita, 'B']);
  });
  it('refreshes preferred selection after voiceschanged, and falls back again if they disappear', () => {
    const h = harness([voice('A'), voice('B')]); const me = h.button('나'); const friend = h.button('친구');
    h.click(me); h.click(friend);
    h.setVoices([voice(keita), voice('A'), voice(nanami)]); h.click(me); h.click(friend);
    h.setVoices([voice('A'), voice('B')]); h.click(me); h.click(friend);
    expect(h.utterances.map(item => item.voice?.name)).toEqual(['A', 'B', keita, nanami, 'A', 'B']);
    expect(me.dataset.ttsVoice).toBe('A'); expect(friend.dataset.ttsVoice).toBe('B');
  });
  it('single Google Japanese voice is shared without introducing another production name mapping', () => {
    const h = harness([voice('Google 日本語')]);
    h.click(h.button('나')); h.click(h.button('친구')); h.click(h.button());
    expect(h.utterances.map(item => item.voice?.name)).toEqual(['Google 日本語', 'Google 日本語', 'Google 日本語']);
  });
  it('does not apply preferences to unknown or absent speakers, or to a non-Japanese voice', () => {
    const h = harness([voice('A'), voice(nanami, 'en-US'), voice(keita)]);
    h.click(h.button('나')); h.click(h.button()); h.click(h.button('직원'));
    expect(h.utterances.map(item => item.voice?.name)).toEqual([keita, 'A', 'A']);
  });
  it('keeps pre-recorded audio ahead of preferred voices and uses the preference only on audio failure', () => {
    const h = harness([voice(nanami), voice(keita)]); const btn = h.button('친구', '/voice/existing.mp3');
    h.click(btn); expect(h.utterances).toHaveLength(0);
    expect(h.audios[0].file).toBe('/voice/existing.mp3');
    h.audios[0].onerror?.(); expect(h.utterances[0].voice?.name).toBe(nanami);
  });
});
