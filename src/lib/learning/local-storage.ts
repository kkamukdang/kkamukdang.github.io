import { fingerprintLegacySnapshot, migrateLegacySnapshot, isLegacyKey, type LegacySnapshot } from './migration-v1';
import { createEmptyState } from './state';
import type { StorageAdapter, UpdateVerification } from './storage';
import type { LearningStateV2, MigrationResult, StorageReadResult, StorageUpdateResult, StorageWriteResult, ValidationResult } from './types';
import { validateLearningState } from './validation';

export const STORAGE_KEYS = {
  state: 'kkmd:learning:v2', backup: 'kkmd:learning:v1-backup', migration: 'kkmd:learning:migration', corrupt: 'kkmd:learning:corrupt:last',
} as const;

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface MigrationMarker {
  status: 'completed';
  sourceFingerprint: string;
  migratedAt: string;
}

type SnapshotResult = { ok: true; value: LegacySnapshot } | { ok: false };
type MarkerResult = { ok: true; value: MigrationMarker | null } | { ok: false };

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: StorageLike, private readonly now: () => Date = () => new Date()) {}

  isAvailable(): boolean {
    const key = `kkmd:learning:probe:${Math.random().toString(36).slice(2)}`;
    try { this.storage.setItem(key, '1'); const ok = this.storage.getItem(key) === '1'; this.storage.removeItem(key); return ok; }
    catch { return false; }
  }

  validate(raw: unknown): ValidationResult<LearningStateV2> { return validateLearningState(raw); }

  private readStoredV2(recordCorrupt = true): StorageReadResult | null {
    let raw: string | null;
    try { raw = this.storage.getItem(STORAGE_KEYS.state); }
    catch { return { ok: false, code: 'unavailable', recoverable: false }; }
    if (raw === null) return null;
    try {
      const validation = this.validate(JSON.parse(raw));
      if (validation.ok) return { ok: true, value: validation.value, source: 'v2' };
      if (recordCorrupt) this.saveCorrupt(raw, 'schema-validation');
      return { ok: false, code: 'corrupt', recoverable: true };
    } catch {
      if (recordCorrupt) this.saveCorrupt(raw, 'json-parse');
      return { ok: false, code: 'corrupt', recoverable: true };
    }
  }

  read(): StorageReadResult {
    if (!this.isAvailable()) return { ok: false, code: 'unavailable', recoverable: false };
    const stored = this.readStoredV2();
    if (stored) return stored;
    const snapshot = this.snapshotV1();
    if (!snapshot.ok) return { ok: false, code: 'migration-failed', recoverable: true };
    if (Object.keys(snapshot.value).length) {
      const result = this.migrate({ persist: true });
      return result.ok ? { ok: true, value: result.value, source: 'migrated' } : { ok: false, code: 'migration-failed', recoverable: true };
    }
    return { ok: true, value: createEmptyState(this.now().toISOString()), source: 'empty' };
  }

  write(next: LearningStateV2): StorageWriteResult {
    const validation = this.validate(next);
    if (!validation.ok) return { ok: false, code: 'invalid-state' };
    if (!this.isAvailable()) return { ok: false, code: 'unavailable' };
    try { this.storage.setItem(STORAGE_KEYS.state, JSON.stringify(next)); return { ok: true }; }
    catch { return { ok: false, code: 'write-failed' }; }
  }

  update(mutator: (current: LearningStateV2) => LearningStateV2, verification: UpdateVerification = {}): StorageUpdateResult {
    for (let attempt = 0; attempt < 2; attempt++) {
      const read = this.read();
      if (!read.ok) return { ok: false, code: read.code === 'unavailable' ? 'unavailable' : 'invalid-state' };
      const candidate = mutator(read.value);
      const next = candidate === read.value ? candidate : { ...candidate, revision: read.value.revision + 1 };
      const validation = this.validate(next);
      if (!validation.ok) return { ok: false, code: 'invalid-state' };
      if (candidate !== read.value) {
        try { this.storage.setItem(STORAGE_KEYS.state, JSON.stringify(next)); }
        catch { return { ok: false, code: 'write-failed' }; }
      }
      const stored = this.readStoredV2();
      if (stored?.ok
        && stored.value.revision === next.revision
        && (!verification.eventId || stored.value.receipts[verification.eventId]?.payloadHash === verification.payloadHash)
        && (!verification.verify || verification.verify(stored.value))) return { ok: true, value: stored.value };
    }
    return { ok: false, code: 'conflict' };
  }

  migrate(options: { persist?: boolean } = {}): MigrationResult {
    if (options.persist !== false && !this.isAvailable()) return { ok: false, code: 'unavailable' };
    const existing = this.readStoredV2(options.persist !== false);
    if (existing?.ok) return { ok: true, value: existing.value, migrated: false, persisted: true };
    if (existing && !existing.ok) return { ok: false, code: existing.code === 'unavailable' ? 'unavailable' : 'invalid-v2' };
    const snapshot = this.snapshotV1();
    if (!snapshot.ok) return { ok: false, code: 'unavailable', issues: ['v1 snapshot을 읽을 수 없음'] };
    if (!Object.keys(snapshot.value).length) return { ok: true, value: createEmptyState(this.now().toISOString()), migrated: false, persisted: false };
    const fingerprint = fingerprintLegacySnapshot(snapshot.value);
    const marker = this.readMigrationMarker();
    if (!marker.ok) return { ok: false, code: 'invalid-v2', issues: ['migration marker를 읽을 수 없음'] };
    if (marker.value?.status === 'completed' && marker.value.sourceFingerprint === fingerprint) {
      return { ok: false, code: 'invalid-v2', issues: ['동일 v1 snapshot의 완료 marker가 있으나 v2 상태가 없음'] };
    }
    const converted = migrateLegacySnapshot(snapshot.value, this.now().toISOString());
    if (!converted.ok) return { ok: false, code: 'invalid-v1', issues: converted.issues };
    const validation = this.validate(converted.value);
    if (!validation.ok) return { ok: false, code: 'invalid-v2', issues: validation.issues };
    if (options.persist === false) return { ok: true, value: converted.value, migrated: true, persisted: false };
    try {
      this.storage.setItem(STORAGE_KEYS.backup, JSON.stringify(snapshot.value));
      this.storage.setItem(STORAGE_KEYS.state, JSON.stringify(converted.value));
      const verified = this.readStoredV2();
      if (!verified?.ok || verified.value.migration?.sourceFingerprint !== converted.fingerprint
        || Object.keys(verified.value.expressions).length !== Object.keys(converted.value.expressions).length
        || Object.keys(verified.value.episodes).length !== Object.keys(converted.value.episodes).length) {
        const raw = this.storage.getItem(STORAGE_KEYS.state) ?? '';
        this.saveCorrupt(raw, 'migration-verification');
        this.storage.removeItem(STORAGE_KEYS.state);
        return { ok: false, code: 'write-failed' };
      }
      this.storage.setItem(STORAGE_KEYS.migration, JSON.stringify({ status: 'completed', sourceFingerprint: converted.fingerprint, migratedAt: converted.value.migration!.migratedAt }));
      return { ok: true, value: converted.value, migrated: true, persisted: true };
    } catch { return { ok: false, code: 'write-failed' }; }
  }

  private snapshotV1(): SnapshotResult {
    const snapshot: LegacySnapshot = {};
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key && isLegacyKey(key)) { const value = this.storage.getItem(key); if (value !== null) snapshot[key] = value; }
      }
    } catch { return { ok: false }; }
    return { ok: true, value: snapshot };
  }

  private readMigrationMarker(): MarkerResult {
    try {
      const raw = this.storage.getItem(STORAGE_KEYS.migration);
      if (raw === null) return { ok: true, value: null };
      const value = JSON.parse(raw) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
      const marker = value as Record<string, unknown>;
      if (marker.status !== 'completed' || typeof marker.sourceFingerprint !== 'string' || typeof marker.migratedAt !== 'string') return { ok: false };
      return { ok: true, value: marker as unknown as MigrationMarker };
    } catch { return { ok: false }; }
  }

  private saveCorrupt(raw: string, reasonCode: string): void {
    try { this.storage.setItem(STORAGE_KEYS.corrupt, JSON.stringify({ detectedAt: this.now().toISOString(), reasonCode, raw })); }
    catch { /* 읽기 전용 fallback */ }
  }
}
