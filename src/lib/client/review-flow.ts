import {
  activeBatchProgress,
  createLearningClient,
  currentReviewItem,
  mutationErrorMessage,
  reviewableExpressions,
  stampSummary,
  todayKst,
  type BrowserExpression,
  type BrowserReviewPrompt,
} from './learning-client';
import {
  STORAGE_KEYS,
  type ExpressionId,
  type ExpressionStateV2,
  type LearningStateV2,
  type Rating,
} from '../learning';

export type ReviewScreenModel =
  | { kind: 'question'; expression: BrowserExpression; prompt: BrowserReviewPrompt; current: number; total: number }
  | { kind: 'empty'; completedToday: boolean };

export function buildReviewScreenModel(
  state: LearningStateV2,
  byId: Record<ExpressionId, BrowserExpression>,
): ReviewScreenModel {
  const expressionId = currentReviewItem(state);
  if (!expressionId) {
    return { kind: 'empty', completedToday: Boolean(state.reviewFlow?.baseCompletedAt) };
  }
  const expression = byId[expressionId];
  const stage = state.expressions[expressionId]?.reviewStage;
  const prompt = expression?.prompts?.[stage];
  if (!expression || !prompt) throw new Error(`${expressionId}: 현재 stage의 복습 문항이 없음`);
  if (prompt.stage !== stage) throw new Error(`${expressionId}: 현재 stage와 복습 문항 stage가 다름`);
  return { kind: 'question', expression, prompt, ...activeBatchProgress(state) };
}

export function reviewInstruction(prompt: BrowserReviewPrompt): string {
  if (prompt.stage === 'R1') return '일본어로 뭐라고 했더라?';
  if (prompt.stage === 'R2') return '응용 문장을 일본어로 떠올려 보세요.';
  return prompt.mode === 'choice'
    ? '맞는 표현을 골라 보세요.'
    : '빈칸에 들어갈 표현을 떠올려 보세요.';
}

export function makeReviewEventId(state: LearningStateV2, expressionId: ExpressionId): string {
  const batchId = state.reviewFlow?.activeBatchId ?? state.reviewFlow?.date ?? 'unbatched';
  return `ui:review:${batchId}:${expressionId}`;
}

export function makeReactivationEventId(expressionId: ExpressionId, graduatedAt: string): string {
  return `ui:reactivate:${expressionId}:${graduatedAt}`;
}

function koreanDate(date: string | null): string {
  if (!date) return '';
  const [, month, day] = date.split('-').map(Number);
  return `${month}월 ${day}일`;
}

export function reviewFeedback(rating: Rating, expression: ExpressionStateV2): string {
  if (expression.graduated) {
    return '세 번 연속 떠올렸어요. 이 표현은 이제 기본 다시 만나기에서 잠시 쉬어가요.';
  }
  const nextDate = koreanDate(expression.nextReviewDate);
  if (rating === 'remembered') {
    return `기억하고 있었네요. ${nextDate}에 다시 만나요.`;
  }
  if (rating === 'fuzzy') {
    return `한 번 더 만나기로 해요. ${nextDate}에 다시 만나요.`;
  }
  return `떠오르지 않아도 괜찮아요. ${nextDate}에 다시 만나요.`;
}

export function graduatedExpressionCount(state: LearningStateV2): number {
  return Object.values(state.expressions).filter((expression) => expression.graduated).length;
}

export function reviewMutationStatusMessage(status: 'duplicate' | 'no-change'): string {
  return status === 'duplicate'
    ? '이 선택은 이미 기록되어 있어요.'
    : '표현 상태가 이미 바뀌어 이번 선택은 반영하지 않았어요. 새로고침한 뒤 다시 확인해 주세요.';
}

export function reactivationStatusMessage(status: 'duplicate' | 'no-change'): string {
  return status === 'duplicate'
    ? '이 표현은 이미 다시 만나기로 돌아왔어요.'
    : '현재는 다시 만나기로 돌릴 수 있는 졸업 상태가 아니에요.';
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} 요소가 없음`);
  return found as T;
}

export async function initReviewFlowPage(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-review-v2="true"]');
  if (!root) return;
  const page = root;

  const lead = element<HTMLElement>('againLead');
  const card = element<HTMLElement>('card');
  const rest = element<HTMLElement>('rest');
  const restText = element<HTMLElement>('restText');
  const restMore = element<HTMLButtonElement>('restMore');
  const reveal = element<HTMLButtonElement>('qReveal');
  const answer = element<HTMLElement>('qAnswer');
  const grade = element<HTMLElement>('qGrade');
  const feedback = element<HTMLElement>('qFeedback');
  const next = element<HTMLButtonElement>('qNext');
  const summary = element<HTMLElement>('learningSummary');
  const reactivation = element<HTMLElement>('reactivation');
  const reactivationList = element<HTMLElement>('reactivationList');
  let client: ReturnType<typeof createLearningClient> | null = null;
  let latestState: LearningStateV2 | null = null;
  let ratingLocked = false;

  function announce(message: string, error = false): void {
    const live = element<HTMLElement>('qLive');
    live.textContent = message;
    live.setAttribute('role', error ? 'alert' : 'status');
  }

  function paintSummary(state: LearningStateV2): void {
    const summary = stampSummary(window.localStorage, state, 's01');
    page.querySelectorAll<HTMLElement>('.stamp-cell[data-no]').forEach((cell) => {
      cell.classList.toggle('on', summary.completedEpisodes.has(Number(cell.dataset.no)));
    });
    page.querySelector<HTMLElement>('.stamp-cell[data-final]')?.classList.toggle('on', summary.seasonCompleted);
    const progress = page.querySelector<HTMLElement>('.stampboard [data-progress]');
    if (progress) progress.textContent = `${summary.completedEpisodes.size + (summary.seasonCompleted ? 1 : 0)} / 7`;

    const reviewCount = state.history.filter((event) => event.type === 'review_answered').length;
    element<HTMLElement>('cReunions').textContent = String(reviewCount);
    element<HTMLElement>('cGraduated').textContent = String(graduatedExpressionCount(state));
    const reviewLink = element<HTMLAnchorElement>('reviewLink');
    reviewLink.hidden = summary.completedEpisodes.size < 6;
  }

  function paintReactivation(state: LearningStateV2): void {
    if (!client) return;
    const graduated = client.expressions.filter((item) => item.no === 1 && state.expressions[item.id]?.graduated);
    reactivation.hidden = graduated.length === 0;
    reactivationList.replaceChildren(...graduated.map((expression) => {
      const row = document.createElement('div');
      row.className = 'reactivation-item';
      const label = document.createElement('div');
      label.className = 'reactivation-expression';
      const jp = document.createElement('span');
      jp.className = 'jp';
      jp.lang = 'ja';
      jp.innerHTML = expression.jp;
      const kr = document.createElement('span');
      kr.className = 'reactivation-kr';
      kr.textContent = expression.kr;
      label.append(jp, kr);
      const button = document.createElement('button');
      button.className = 'reactivation-button';
      button.type = 'button';
      button.dataset.expressionId = expression.id;
      button.textContent = '다시 만나기';
      row.append(label, button);
      return row;
    }));
  }

  function render(state: LearningStateV2): void {
    latestState = state;
    paintSummary(state);
    paintReactivation(state);
    let model: ReviewScreenModel;
    try {
      model = buildReviewScreenModel(state, client?.byId ?? {});
    } catch (error) {
      card.hidden = true;
      rest.hidden = false;
      restText.textContent = '복습 문항을 안전하게 불러오지 못했어요.';
      restMore.hidden = true;
      announce(error instanceof Error ? error.message : '복습 문항 오류', true);
      return;
    }

    if (model.kind === 'empty') {
      card.hidden = true;
      rest.hidden = false;
      restMore.hidden = !model.completedToday;
      lead.textContent = '';
      restText.textContent = model.completedToday
        ? '오늘 만날 표현을 다 봤어요.'
        : '오늘은 까먹은 게 없네요.';
      return;
    }

    const { expression, prompt } = model;
    card.hidden = false;
    card.dataset.reviewStage = prompt.stage;
    card.dataset.promptSource = prompt.source;
    rest.hidden = true;
    lead.textContent = '떠오르지 않아도 괜찮아요. 기억은 이렇게 다시 만들어지는 거니까요.';
    element<HTMLElement>('qEmoji').textContent = expression.emoji || '📮';
    element<HTMLElement>('qStage').textContent = '다시 만난 표현';
    element<HTMLElement>('qProgress').textContent = `${model.current} / ${model.total}`;
    element<HTMLElement>('qAsk').textContent = prompt.stage === 'R1'
      ? '이럴 때 뭐라고 했더라?'
      : prompt.cue;
    const cloze = element<HTMLElement>('qCloze');
    cloze.innerHTML = prompt.clozeHtml ?? '';
    cloze.hidden = prompt.stage !== 'R3' || !prompt.clozeHtml;
    const promptText = element<HTMLElement>('qPrompt');
    promptText.textContent = reviewInstruction(prompt);
    promptText.hidden = prompt.stage === 'R1';

    const memory = element<HTMLElement>('qMemory');
    const memoryImage = element<HTMLImageElement>('qMemoryImage');
    const memoryText = element<HTMLElement>('qMemoryText');
    const showMemory = prompt.stage === 'R1' && Boolean(prompt.memoryScene || prompt.memoryCue);
    memory.hidden = !showMemory;
    memoryText.textContent = prompt.memoryScene ?? '';
    memoryText.hidden = !prompt.memoryScene;
    if (showMemory && prompt.memoryCue) {
      memoryImage.src = prompt.memoryCue.asset;
      memoryImage.alt = prompt.memoryCue.alt;
      memoryImage.hidden = false;
      memoryImage.onerror = () => {
        memoryImage.hidden = true;
        memory.hidden = !prompt.memoryScene;
      };
    } else {
      memoryImage.hidden = true;
      memoryImage.removeAttribute('src');
      memoryImage.alt = '';
    }

    const scene = element<HTMLElement>('qScene');
    scene.hidden = prompt.stage !== 'R1' || !prompt.scene;
    element<HTMLElement>('qSceneWho').textContent = prompt.scene?.who ?? '';
    element<HTMLElement>('qSceneKr').textContent = prompt.scene?.kr ?? '';

    reveal.hidden = false;
    answer.hidden = true;
    grade.hidden = true;
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.className = 'q-feedback';
    next.hidden = true;
    ratingLocked = false;
    grade.querySelectorAll<HTMLButtonElement>('button[data-rating]').forEach((button) => { button.disabled = false; });
    element<HTMLElement>('qAnsJp').innerHTML = prompt.answerHtml;
    element<HTMLElement>('qAnsExpr').innerHTML = expression.jp;
    element<HTMLElement>('qAnsKr').textContent = expression.kr;
    const sceneAnswer = element<HTMLElement>('qSceneAnswer');
    sceneAnswer.innerHTML = prompt.scene?.jpHtml ?? '';
    sceneAnswer.hidden = !prompt.scene;
    const explanation = element<HTMLElement>('qExplanation');
    explanation.textContent = prompt.explanation ?? '';
    explanation.hidden = !prompt.explanation;
  }

  async function load(): Promise<void> {
    let expressions: BrowserExpression[];
    try {
      const response = await fetch(page.dataset.catalogUrl!);
      if (!response.ok) throw new Error('catalog');
      expressions = await response.json() as BrowserExpression[];
    } catch {
      lead.textContent = '학습 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      announce('표현 목록 요청 실패', true);
      return;
    }
    client = createLearningClient(window.localStorage, reviewableExpressions(expressions));
    const flow = client.service.getOrCreateReviewFlow(todayKst(), new Date().toISOString());
    if (!flow.ok) {
      lead.textContent = mutationErrorMessage(flow.code);
      announce(lead.textContent, true);
      return;
    }
    render(flow.state);
  }

  reveal.addEventListener('click', () => {
    reveal.hidden = true;
    answer.hidden = false;
    grade.hidden = false;
    answer.focus();
  });

  grade.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-rating]');
    if (!button || !client || !latestState || ratingLocked) return;
    const expressionId = currentReviewItem(latestState);
    const rating = button.dataset.rating as Rating | undefined;
    const promptId = expressionId ? client.byId[expressionId]?.prompts?.[latestState.expressions[expressionId]?.reviewStage]?.id : undefined;
    if (!expressionId || !rating) return;

    ratingLocked = true;
    grade.querySelectorAll<HTMLButtonElement>('button[data-rating]').forEach((item) => { item.disabled = true; });
    const result = client.service.rateReview({
      eventId: makeReviewEventId(latestState, expressionId),
      now: new Date().toISOString(),
      expressionId,
      rating,
      source: 'again',
      ...(promptId ? { promptId } : {}),
    });
    if (!result.ok) {
      ratingLocked = false;
      grade.querySelectorAll<HTMLButtonElement>('button[data-rating]').forEach((item) => { item.disabled = false; });
      announce(mutationErrorMessage(result.code), true);
      return;
    }

    if (result.status === 'no-change') {
      ratingLocked = false;
      grade.querySelectorAll<HTMLButtonElement>('button[data-rating]').forEach((item) => { item.disabled = false; });
      announce(reviewMutationStatusMessage(result.status), true);
      return;
    }

    latestState = result.state;
    paintSummary(result.state);
    paintReactivation(result.state);
    grade.hidden = true;
    feedback.textContent = result.status === 'duplicate'
      ? reviewMutationStatusMessage(result.status)
      : reviewFeedback(rating, result.state.expressions[expressionId]);
    feedback.classList.add(rating === 'remembered' ? 'ok' : rating === 'fuzzy' ? 'vague' : 'lost');
    feedback.hidden = false;
    next.hidden = false;
    next.focus();
    announce(feedback.textContent);
  });

  next.addEventListener('click', () => {
    if (!latestState) return;
    render(latestState);
    if (!card.hidden) element<HTMLElement>('qAsk').focus();
    else restText.focus();
  });

  reactivationList.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-expression-id]');
    if (!button || !client) return;
    const expressionId = button.dataset.expressionId as ExpressionId | undefined;
    if (!expressionId || client.byId[expressionId]?.no !== 1) return;
    const graduatedAt = latestState?.expressions[expressionId]?.graduatedAt;
    if (!graduatedAt) {
      announce('현재 졸업 상태를 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.', true);
      return;
    }
    button.disabled = true;
    const now = new Date().toISOString();
    const result = client.service.reactivate({
      eventId: makeReactivationEventId(expressionId, graduatedAt),
      now,
      expressionId,
    });
    if (!result.ok) {
      button.disabled = false;
      announce(mutationErrorMessage(result.code), true);
      return;
    }
    latestState = result.state;
    paintSummary(result.state);
    paintReactivation(result.state);
    summary.focus();
    announce(result.status === 'applied'
      ? '졸업한 표현을 다시 만나기로 돌려놓았어요.'
      : reactivationStatusMessage(result.status));
  });

  restMore.addEventListener('click', () => {
    if (!client) return;
    const result = client.service.createExtraBatch(todayKst(), new Date().toISOString());
    if (!result.ok) {
      announce(mutationErrorMessage(result.code), true);
      return;
    }
    if (result.status === 'no-change') {
      render(result.state);
      restMore.hidden = true;
      announce('오늘 더 만날 표현은 없어요.');
      return;
    }
    render(result.state);
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEYS.state || !client) return;
    const read = client.service.getSnapshot();
    if (read.ok) render(read.value);
  });

  await load();
}
