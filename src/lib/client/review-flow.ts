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
import { STORAGE_KEYS, type ExpressionId, type LearningStateV2 } from '../learning';

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
  const gradeNotice = element<HTMLElement>('qGradeNotice');
  let client: ReturnType<typeof createLearningClient> | null = null;

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
    element<HTMLElement>('cGraduated').textContent = String(
      Object.values(state.expressions).filter((expression) => expression.graduated).length,
    );
    const reviewLink = element<HTMLAnchorElement>('reviewLink');
    reviewLink.hidden = summary.completedEpisodes.size < 6;
  }

  function render(state: LearningStateV2): void {
    paintSummary(state);
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
    element<HTMLElement>('qStage').textContent = {
      R1: '첫 번째 다시 만나기',
      R2: '두 번째 다시 만나기',
      R3: '세 번째 다시 만나기',
    }[prompt.stage];
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
    gradeNotice.hidden = true;
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
    gradeNotice.hidden = false;
    answer.focus();
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
