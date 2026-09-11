import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createLearningClient,
  mutationErrorMessage,
  type BrowserExpression,
  type BrowserReviewPrompt,
} from '../../src/lib/client/learning-client';
import { reactivationStatusMessage, reviewMutationStatusMessage } from '../../src/lib/client/review-flow';
import { LocalStorageAdapter, STORAGE_KEYS } from '../../src/lib/learning/local-storage';
import { LearningService } from '../../src/lib/learning/service';
import { createEmptyState } from '../../src/lib/learning/state';
import type { ExpressionId, ReviewStage } from '../../src/lib/learning/types';
import { MemoryStorage } from '../helpers';

const NOW = '2026-09-11T03:00:00.000Z';
const ID = 's01e01-temoii' as ExpressionId;

class StateWriteFailingStorage extends MemoryStorage {
  failStateWrites = false;
  override setItem(key: string, value: string): void {
    if (this.failStateWrites && key === STORAGE_KEYS.state) throw new Error('state write blocked');
    super.setItem(key, value);
  }
}

function prompt(stage: ReviewStage): BrowserReviewPrompt {
  return {
    id: `${ID}:${stage}`,
    stage,
    mode: stage === 'R1' ? 'scene' : 'cued-recall',
    cue: `${stage} cue`,
    answer: `${stage} answer`,
    answerHtml: `${stage} answer`,
    source: stage === 'R1' ? 'scene' : stage === 'R2' ? 'apply' : 'reviewPrompt.R3',
  };
}

function expression(): BrowserExpression {
  return {
    id: ID,
    jp: '〜でもいい?',
    kr: '〜해도 돼?',
    emoji: '🌙',
    no: 1,
    season: 1,
    slug: '001-late-night-food',
    registry: { active: true },
    prompts: { R1: prompt('R1'), R2: prompt('R2'), R3: prompt('R3') },
  };
}

describe('Work 2-4 저장·migration·모바일·접근성 강건성', () => {
  it('저장 실패와 command/state/conflict 오류를 사용자에게 서로 다른 실패 문구로 알린다', () => {
    expect(mutationErrorMessage('storage-unavailable')).toContain('저장할 수 없어요');
    expect(mutationErrorMessage('write-failed')).toContain('저장하지 못했어요');
    expect(mutationErrorMessage('invalid-command')).toContain('기록을 바꾸지 않았어요');
    expect(mutationErrorMessage('invalid-state')).toContain('기존 기록은 덮어쓰지 않았습니다');
    expect(mutationErrorMessage('conflict')).toContain('다른 화면에서 기록이 바뀌었어요');
  });

  it('실제 state write 실패를 성공으로 반환하지 않는다', () => {
    const storage = new StateWriteFailingStorage();
    const state = createEmptyState(NOW);
    state.expressions[ID] = {
      registeredAt: NOW,
      registeredSource: 'episode',
      reviewStage: 'R1',
      rememberStreak: 0,
      lastRating: null,
      cueBoost: 0,
      graduated: false,
      nextReviewDate: '2026-09-11',
    };
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
    storage.failStateWrites = true;
    const result = createLearningClient(storage, [expression()], () => new Date(NOW)).service.rateReview({
      eventId: 'work2-4-write-failure', now: NOW, expressionId: ID, rating: 'remembered', source: 'again',
    });
    expect(result).toEqual({ ok: false, code: 'write-failed' });
    const stored = JSON.parse(storage.getItem(STORAGE_KEYS.state)!);
    expect(stored.expressions[ID]).toMatchObject({ reviewStage: 'R1', rememberStreak: 0 });
    expect(stored.receipts).toEqual({});
  });

  it('duplicate/no-change를 신규 applied 성공 문구와 구분한다', () => {
    expect(reviewMutationStatusMessage('duplicate')).toBe('이 선택은 이미 기록되어 있어요.');
    expect(reviewMutationStatusMessage('no-change')).toContain('이번 선택은 반영하지 않았어요');
    expect(reactivationStatusMessage('duplicate')).toBe('이 표현은 이미 다시 만나기로 돌아왔어요.');
    expect(reactivationStatusMessage('no-change')).toContain('졸업 상태가 아니에요');
  });

  it('기존 v2가 있으면 뒤늦게 발견한 v1 snapshot으로 현재 상태를 덮어쓰지 않는다', () => {
    const storage = new MemoryStorage();
    const current = createEmptyState(NOW);
    current.expressions[ID] = {
      registeredAt: NOW,
      registeredSource: 'episode',
      reviewStage: 'R3',
      rememberStreak: 2,
      lastRating: 'remembered',
      cueBoost: 0,
      graduated: false,
      nextReviewDate: '2026-09-25',
    };
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(current));
    storage.setItem(`kkmd:expr:${ID}`, JSON.stringify({
      state: 'lost', streak: 0, nextDue: '2026-09-12', lastSeen: '2026-09-10', graduated: false,
    }));
    const before = storage.getItem(STORAGE_KEYS.state);
    const result = new LocalStorageAdapter(storage, () => new Date(NOW)).migrate();
    expect(result.ok && result.migrated).toBe(false);
    expect(storage.getItem(STORAGE_KEYS.state)).toBe(before);
    expect(storage.getItem(`kkmd:expr:${ID}`)).not.toBeNull();
  });

  it('newsletter preview 경로는 migration 결과를 미리 보되 write를 0회 유지한다', () => {
    const storage = new MemoryStorage();
    storage.setItem(`kkmd:expr:${ID}`, JSON.stringify({
      state: 'ok', streak: 1, nextDue: '2026-09-20', lastSeen: '2026-09-10', graduated: false,
    }));
    const writesBefore = storage.writeCount;
    const lengthBefore = storage.length;
    const service = new LearningService(new LocalStorageAdapter(storage, () => new Date(NOW)), {
      activeExpressionIds: [ID],
      queueRegistry: { [ID]: { active: true, episodeId: 's01e01' } },
    });
    const result = service.previewMigration();
    expect(result.ok && result.persisted).toBe(false);
    expect(storage.writeCount).toBe(writesBefore);
    expect(storage.length).toBe(lengthBefore);
    expect(storage.getItem(STORAGE_KEYS.state)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.backup)).toBeNull();
    expect(storage.getItem(STORAGE_KEYS.migration)).toBeNull();
  });

  it('360px 줄바꿈과 keyboard/focus/aria-live 계약을 화면 코드에 유지한다', async () => {
    const page = await readFile('src/pages/again.astro', 'utf8');
    const controller = await readFile('src/lib/client/review-flow.ts', 'utf8');
    const css = await readFile('src/styles/again.css', 'utf8');

    expect(page).toContain('id="qLive" class="sr-only" aria-live="polite"');
    expect(page).toContain('id="qFeedback" aria-live="polite"');
    expect(page).toContain('id="qAsk" tabindex="-1"');
    expect(page).toContain('id="restText" tabindex="-1"');
    expect(page).toContain('id="learningSummary" aria-label="학습 기록" tabindex="-1"');
    expect(page).toContain('다시 만나기를 누르면 잠시 쉬기를 마치고, 이틀 뒤 다시 만나요.');
    expect(controller).toContain('next.focus()');
    expect(controller).toContain("element<HTMLElement>('qAsk').focus()");
    expect(controller).toContain('summary.focus()');
    expect(controller).toContain("result.status === 'duplicate'");
    expect(controller).toContain("result.status === 'no-change'");
    expect(css).toContain('overflow-wrap:anywhere');
    expect(css).toContain('min-width:0; flex:1 1 0');
  });
});
