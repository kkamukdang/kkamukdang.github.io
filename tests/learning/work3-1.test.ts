import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Work 3-1 Season 1 expected-gap 진단', () => {
  it('현재 콘텐츠 gap이 별도 fixture와 일치하며 일반 테스트를 실패시키지 않는다', () => {
    const output = execFileSync(process.execPath, ['scripts/audit-season1.mjs', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const result = JSON.parse(output);

    expect(result).toMatchObject({
      ok: true,
      matchedExpectedGaps: true,
      summary: {
        episodes: 6,
        registryActive: 18,
        registryRetired: 2,
        episodeKeyPoints: 18,
      },
    });
    expect(result.summary.actualGaps).toBeGreaterThan(0);
    expect(result.summary.actualGaps).toBe(result.summary.expectedGaps);
  });
});
