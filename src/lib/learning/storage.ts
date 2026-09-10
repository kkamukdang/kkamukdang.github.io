import type {
  LearningStateV2, MigrationResult, StorageReadResult, StorageUpdateResult,
  StorageWriteResult, ValidationResult,
} from './types';

export interface UpdateVerification {
  eventId?: string;
  payloadHash?: string;
  verify?: (stored: LearningStateV2) => boolean;
}

export interface StorageAdapter {
  read(): StorageReadResult;
  write(next: LearningStateV2): StorageWriteResult;
  update(
    mutator: (current: LearningStateV2) => LearningStateV2,
    verification?: UpdateVerification,
  ): StorageUpdateResult;
  migrate(options?: { persist?: boolean }): MigrationResult;
  validate(raw: unknown): ValidationResult<LearningStateV2>;
  isAvailable(): boolean;
}

