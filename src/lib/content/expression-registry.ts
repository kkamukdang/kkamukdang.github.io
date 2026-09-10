import type { EpisodeId, ExpressionId } from '../learning/types';
import { EXPRESSION_ID_RE } from '../learning/validation';

export type ExpressionType = 'pattern' | 'phrase' | 'grammar' | 'chunk';
export type Difficulty = 'beginner' | 'lower-intermediate';
export type ExpressionStatus = 'published' | 'approved-pending-yaml' | 'approved-pending-display-update';
export type ExpressionRole = 'keyPoint' | 'newsletterReview' | 'intentionalReappearance' | 'compare' | 'apply';

export interface RegistryExpression {
  id: ExpressionId; canonical: string; display: string; aliases: string[];
  type: ExpressionType; sense: string; function: string[]; contexts: string[];
  difficulty: Difficulty; episodes: Array<{ id: EpisodeId; role: ExpressionRole }>;
  source: string; status: ExpressionStatus;
}
export interface RetiredRegistryExpression {
  id: ExpressionId; canonical: string; display: string; aliases: string[];
  status: 'retired-before-learning-v2'; replacementId: ExpressionId | null;
  migration: 'preserve-history-do-not-transfer'; note?: string;
}
export interface ExpressionRegistryData {
  schemaVersion: 1; seasonId: string; expressions: RegistryExpression[];
  retiredExpressions: RetiredRegistryExpression[];
}
export interface RegistryIndex {
  active: Record<ExpressionId, RegistryExpression>;
  retired: Record<ExpressionId, RetiredRegistryExpression>;
}

export function normalizeExpression(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, '').replace(/~/g, '〜');
}

export function validateExpressionRegistry(raw: unknown): { ok: true; value: ExpressionRegistryData } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, issues: ['Registry root가 object가 아님'] };
  const data = raw as Partial<ExpressionRegistryData>;
  if (data.schemaVersion !== 1) issues.push('Registry schemaVersion은 1이어야 함');
  if (!Array.isArray(data.expressions) || !Array.isArray(data.retiredExpressions)) issues.push('expressions/retiredExpressions 배열이 필요함');
  const activeIds = new Set<string>(); const retiredIds = new Set<string>(); const canonicals = new Map<string, string>();
  for (const expression of data.expressions ?? []) {
    if (!EXPRESSION_ID_RE.test(expression.id)) issues.push(`${expression.id}: ID 형식 오류`);
    if (activeIds.has(expression.id)) issues.push(`${expression.id}: active ID 중복`); activeIds.add(expression.id);
    if (!['beginner', 'lower-intermediate'].includes(expression.difficulty)) issues.push(`${expression.id}: difficulty 오류`);
    if (!['published', 'approved-pending-yaml', 'approved-pending-display-update'].includes(expression.status)) issues.push(`${expression.id}: status 오류`);
    const canonical = normalizeExpression(expression.canonical);
    if (canonicals.has(canonical)) issues.push(`${expression.id}: canonical이 ${canonicals.get(canonical)}와 중복`); canonicals.set(canonical, expression.id);
    const aliases = new Set<string>();
    for (const alias of expression.aliases ?? []) {
      const normalized = normalizeExpression(alias);
      if (normalized === canonical) issues.push(`${expression.id}: canonical과 같은 alias`);
      if (aliases.has(normalized)) issues.push(`${expression.id}: alias 중복`); aliases.add(normalized);
    }
  }
  for (const expression of data.retiredExpressions ?? []) { retiredIds.add(expression.id); if (activeIds.has(expression.id)) issues.push(`${expression.id}: active/retired 충돌`); }
  return issues.length ? { ok: false, issues } : { ok: true, value: data as ExpressionRegistryData };
}

export function createRegistryIndex(data: ExpressionRegistryData): RegistryIndex {
  return {
    active: Object.fromEntries(data.expressions.map((entry) => [entry.id, entry])) as RegistryIndex['active'],
    retired: Object.fromEntries(data.retiredExpressions.map((entry) => [entry.id, entry])) as RegistryIndex['retired'],
  };
}

export async function loadExpressionRegistry(): Promise<ExpressionRegistryData> {
  const yaml = await import('js-yaml');
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const raw = yaml.load(await readFile(resolve('src/data/expressions/season-01.yaml'), 'utf8'));
  const result = validateExpressionRegistry(raw);
  if (!result.ok) throw new Error(`Expression Registry validation 실패:\n${result.issues.join('\n')}`);
  return result.value;
}
