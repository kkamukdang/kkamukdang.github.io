import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = process.cwd();
const EPISODE_DIR = path.join(ROOT, 'src/data/episodes');
const REGISTRY_FILE = path.join(ROOT, 'src/data/expressions/season-01.yaml');
const EXPECTED_FILE = path.join(ROOT, 'scripts/fixtures/season1-expected-gaps.json');

function gap(code, expressionId, episodeId, detail) {
  return { code, expressionId, episodeId, detail };
}

function sortGaps(gaps) {
  return gaps.sort((a, b) =>
    [a.code, a.episodeId, a.expressionId, a.detail]
      .join('|')
      .localeCompare([b.code, b.episodeId, b.expressionId, b.detail].join('|'))
  );
}

function sameGaps(actual, expected) {
  return JSON.stringify(sortGaps(actual)) === JSON.stringify(sortGaps(expected));
}

function bare(text = '') {
  return String(text).replace(
    /([\u4E00-\u9FFF\u3005\u30F6\u30F5]+)(?:\[\[([^\]]+)\]\]|\[([^\]]+)\])/g,
    (_match, kanji) => kanji
  );
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function loadYaml(file) {
  return yaml.load(await readFile(file, 'utf8'));
}

async function collectEpisodes() {
  const files = (await readdir(EPISODE_DIR)).filter((file) => file.endsWith('.yaml')).sort();
  return Promise.all(files.map(async (file) => {
    const data = await loadYaml(path.join(EPISODE_DIR, file));
    return { file, episodeId: `s${String(data.season).padStart(2, '0')}e${String(data.no).padStart(2, '0')}`, data };
  }));
}

async function collectGaps() {
  const [registry, episodes] = await Promise.all([loadYaml(REGISTRY_FILE), collectEpisodes()]);
  const active = new Map(registry.expressions.map((entry) => [entry.id, entry]));
  const retired = new Map(registry.retiredExpressions.map((entry) => [entry.id, entry]));
  const keyPoints = new Map();
  const gaps = [];

  for (const episode of episodes) {
    for (const keyPoint of episode.data.keyPoints ?? []) {
      keyPoints.set(keyPoint.id, { episode, keyPoint });
      if (retired.has(keyPoint.id)) {
        gaps.push(gap(
          'registry.retired-used-as-keypoint',
          keyPoint.id,
          episode.episodeId,
          'retired 표현이 현재 Episode keyPoint에 남아 있음'
        ));
      } else if (!active.has(keyPoint.id)) {
        gaps.push(gap(
          'registry.unknown-keypoint',
          keyPoint.id,
          episode.episodeId,
          'Episode keyPoint가 active/retired Registry 어디에도 없음'
        ));
      }
    }
  }

  for (const expression of active.values()) {
    const episodeId = expression.episodes.find((entry) => entry.role === 'keyPoint')?.id ?? 'unknown';
    const found = keyPoints.get(expression.id);

    if (expression.status !== 'published') {
      gaps.push(gap(
        'registry.pending-status',
        expression.id,
        episodeId,
        `Registry status가 ${expression.status}`
      ));
    }

    if (!found) {
      gaps.push(gap(
        'registry.active-missing-from-episode',
        expression.id,
        episodeId,
        'active Registry 표현이 Episode keyPoint에 없음'
      ));
      continue;
    }

    const { episode, keyPoint } = found;
    if (!keyPoint.memoryCue) {
      gaps.push(gap(
        'content.memory-cue-missing',
        expression.id,
        episodeId,
        'memoryCue asset/alt가 없음'
      ));
    } else {
      const assetFile = path.join(ROOT, 'public', keyPoint.memoryCue.asset.replace(/^\//, ''));
      if (!(await fileExists(assetFile))) {
        gaps.push(gap(
          'content.memory-cue-asset-missing',
          expression.id,
          episodeId,
          `memoryCue asset 파일이 없음: ${keyPoint.memoryCue.asset}`
        ));
      }
    }

    const hasR2 = keyPoint.reviewPrompt?.R2 || (
      Number.isInteger(keyPoint.applyIndex) && episode.data.apply?.[keyPoint.applyIndex]
    );
    if (!hasR2) {
      gaps.push(gap(
        'content.r2-resolver-missing',
        expression.id,
        episodeId,
        'applyIndex 또는 reviewPrompt.R2가 없음'
      ));
    }

    const hasR3 = keyPoint.reviewPrompt?.R3 || (
      Number.isInteger(keyPoint.quizIndex) && episode.data.quiz?.[keyPoint.quizIndex]
    ) || (
      Number.isInteger(keyPoint.compareIndex) && episode.data.compare?.[keyPoint.compareIndex]
    );
    if (!hasR3) {
      gaps.push(gap(
        'content.r3-resolver-missing',
        expression.id,
        episodeId,
        'reviewPrompt.R3, quizIndex, compareIndex가 모두 없음'
      ));
    }
  }

  const episode3 = episodes.find((entry) => entry.episodeId === 's01e03')?.data;
  const baiiyoTarget = episode3?.reviewTargets?.find((entry) => entry.id === 's01e01-baiiyo');
  if (baiiyoTarget?.cloze !== '明日からまた______。' || baiiyoTarget?.answer !== '始めればいいよ') {
    gaps.push(gap(
      'contract.s01e03-baiiyo-review-target',
      's01e01-baiiyo',
      's01e03',
      '확정 cloze/answer와 다름'
    ));
  }

  const episode5 = episodes.find((entry) => entry.episodeId === 's01e05')?.data;
  const hasEpisode5Apply = episode5?.apply?.some((entry) =>
    bare(entry.jp) === 'まだ食べてるのに、下げられちゃった。'
  );
  if (!hasEpisode5Apply) {
    gaps.push(gap(
      'contract.s01e05-confirmed-apply',
      's01e05-noni',
      's01e05',
      '확정 응용문 まだ食べてるのに、下げられちゃった。가 없음'
    ));
  }

  const episode6 = episodes.find((entry) => entry.episodeId === 's01e06')?.data;
  const ashitakara = episode6?.keyPoints?.find((entry) => entry.id === 's01e06-ashitakara');
  if (bare(ashitakara?.jp) !== 'また明日から' || ashitakara?.kr !== '또 내일부터') {
    gaps.push(gap(
      'contract.s01e06-ashitakara-display',
      's01e06-ashitakara',
      's01e06',
      '확정 표시값 また明日から / 또 내일부터와 다름'
    ));
  }

  return {
    summary: {
      episodes: episodes.length,
      registryActive: active.size,
      registryRetired: retired.size,
      episodeKeyPoints: keyPoints.size,
    },
    gaps: sortGaps(gaps),
  };
}

async function main() {
  const json = process.argv.includes('--json');
  const actual = await collectGaps();
  const expected = JSON.parse(await readFile(EXPECTED_FILE, 'utf8'));
  const matched = sameGaps(actual.gaps, expected.gaps);
  const result = {
    ok: matched,
    matchedExpectedGaps: matched,
    summary: { ...actual.summary, expectedGaps: expected.gaps.length, actualGaps: actual.gaps.length },
    gaps: actual.gaps,
  };

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log('Season 1 콘텐츠 준비도 진단');
    console.log(`- Episode: ${actual.summary.episodes}`);
    console.log(`- Registry: active ${actual.summary.registryActive} / retired ${actual.summary.registryRetired}`);
    console.log(`- Episode keyPoint identity: ${actual.summary.episodeKeyPoints}`);
    console.log(`- Expected gap: ${expected.gaps.length} / Actual gap: ${actual.gaps.length}`);
    for (const item of actual.gaps) {
      console.log(`  [${item.code}] ${item.episodeId} ${item.expressionId} — ${item.detail}`);
    }
    console.log(matched
      ? 'PASS — 현재 gap이 expected-gap fixture와 일치합니다.'
      : 'FAIL — 현재 gap이 expected-gap fixture와 다릅니다. 예상하지 못한 변경을 확인하세요.');
  }

  if (!matched) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Season 1 audit 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
