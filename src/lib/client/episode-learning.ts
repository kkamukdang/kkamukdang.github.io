import {
  createLearningClient,
  makeEpisodeEventId,
  makeUnsureEventId,
  mutationErrorMessage,
  stampSummary,
  todayKst,
  type BrowserExpression,
} from './learning-client';
import type { ExpressionId, LearningStateV2, SeasonId } from '../learning';

function announce(element: HTMLElement | null, message: string, error = false): void {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  element.setAttribute('role', error ? 'alert' : 'status');
}

function paintStampBoard(
  board: HTMLElement,
  state: LearningStateV2,
  seasonId: SeasonId,
): void {
  const summary = stampSummary(window.localStorage, state, seasonId);
  board.querySelectorAll<HTMLElement>('.stamp-cell[data-no]').forEach((cell) => {
    const episodeNo = Number(cell.dataset.no);
    cell.classList.toggle('on', summary.completedEpisodes.has(episodeNo));
  });
  const final = board.querySelector<HTMLElement>('.stamp-cell[data-final]');
  final?.classList.toggle('on', summary.seasonCompleted);

  const progress = board.querySelector<HTMLElement>('[data-progress]');
  if (progress) {
    const paintedEpisodes = board.querySelectorAll('.stamp-cell[data-no].on').length;
    const paintedFinal = board.querySelector('.stamp-cell[data-final].on') ? 1 : 0;
    progress.textContent = `${paintedEpisodes + paintedFinal} / 7`;
  }
}

export async function initEpisodeLearningPage(): Promise<void> {
  const root = document.querySelector<HTMLElement>('.wrap.reading[data-catalog-url]');
  const board = root?.querySelector<HTMLElement>('.stampboard');
  if (!root || !board) return;
  const isV2Episode = root.dataset.learningV2 === 'true';
  const status = board.querySelector<HTMLElement>('.stamp-said');
  let list: BrowserExpression[];
  try {
    const response = await fetch(root.dataset.catalogUrl!);
    if (!response.ok) throw new Error('catalog');
    list = await response.json() as BrowserExpression[];
  } catch {
    if (isV2Episode) announce(status, '학습 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.', true);
    return;
  }

  const client = createLearningClient(window.localStorage, list);
  const expressionIds = (board.dataset.exprs ?? '').split(',').filter(Boolean) as ExpressionId[];
  const episodeId = 's01e01';

  function paint(): void {
    const read = client.service.getSnapshot();
    if (!read.ok) {
      if (isV2Episode) {
        announce(status, mutationErrorMessage(read.code === 'unavailable' ? 'storage-unavailable' : 'invalid-state'), true);
      }
      return;
    }
    paintStampBoard(board!, read.value, 's01');
    if (!isV2Episode) return;

    expressionIds.forEach((id) => {
      const button = root!.querySelector<HTMLButtonElement>(`[data-unsure="${id}"]`);
      const value = read.value.expressions[id];
      const accelerated = read.value.history.some((event) => event.expressionId === id
        && (event.type === 'unsure_accelerated'
          || (event.type === 'expression_registered' && event.source === 'unsure')));
      if (button && value && accelerated) {
        button.dataset.done = '1';
        button.disabled = true;
        button.textContent = '내일 다시 만나요 🫡';
      }
    });
  }

  paint();
  if (!isV2Episode || board.dataset.mark !== '1') return;

  function complete(): void {
    const result = client.service.completeEpisode({
      eventId: makeEpisodeEventId(episodeId),
      now: new Date().toISOString(),
      episodeId,
      seasonId: 's01',
      expressionIds: expressionIds as [ExpressionId, ExpressionId, ExpressionId],
    });
    if (!result.ok) {
      announce(status, mutationErrorMessage(result.code), true);
      return;
    }
    paint();
    if (result.status === 'applied') {
      board?.querySelector('.stamp-cell[data-no="1"]')?.classList.add('just');
      announce(status, '#001 도장을 찍었어요 · 세 표현은 사흘 뒤 다시 만나요.');
    } else if (result.status === 'duplicate') {
      announce(status, '이 회차의 도장과 약속은 이미 기록되어 있어요.');
    } else {
      announce(status, '기존 학습 단계와 더 빠른 약속을 그대로 유지했어요.');
    }
  }

  const end = root.querySelector<HTMLElement>('#todayEnd');
  if (end) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          complete();
          observer.disconnect();
        }
      }, { rootMargin: '0px 0px -10% 0px' });
      observer.observe(end);
    } else {
      complete();
    }
  }

  root.querySelectorAll<HTMLButtonElement>('[data-unsure]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      button.disabled = true;
      const id = button.dataset.unsure as ExpressionId;
      const result = client.service.markUnsure({
        eventId: makeUnsureEventId(id, todayKst()),
        now: new Date().toISOString(),
        expressionId: id,
      });
      if (!result.ok) {
        button.disabled = false;
        announce(status, mutationErrorMessage(result.code), true);
        return;
      }
      paint();
      button.textContent = result.status === 'applied'
        ? '내일 다시 만나요 🫡'
        : '이미 가장 빠른 약속으로 잡혀 있어요';
      announce(status, result.status === 'applied'
        ? '이 표현은 내일 다시 만나요.'
        : '기존의 더 빠른 약속을 그대로 유지했어요.');
    });
  });
}
