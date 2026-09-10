import { describe, expect, it } from 'vitest';
import { createRegistryIndex, loadExpressionRegistry, normalizeExpression } from '../../src/lib/content/expression-registry';

describe('Expression Registry', () => {
  it('production YAML을 검증하고 active/retired index를 만든다', async () => {
    const registry = await loadExpressionRegistry(); const index = createRegistryIndex(registry);
    expect(Object.keys(index.active)).toHaveLength(18);
    expect(index.retired['s01e04-maniau'].replacementId).toBeNull();
    expect(index.active['s01e04-madaikeru']).toBeTruthy();
  });
  it('NFC/공백/ASCII 물결만 정규화하고 일본어 구두점은 보존한다', () => {
    expect(normalizeExpression(' ~ てもいい? ')).toBe('〜てもいい?');
    expect(normalizeExpression('何かいる?')).not.toBe(normalizeExpression('何かいる'));
  });
});
