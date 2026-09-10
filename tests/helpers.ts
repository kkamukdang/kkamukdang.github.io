import type { StorageLike } from '../src/lib/learning/local-storage';

export class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  failWrites = false;
  writeCount = 0;
  corruptAfterWrite: ((key: string, value: string) => string) | null = null;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('blocked');
    this.writeCount++;
    this.data.set(key, this.corruptAfterWrite ? this.corruptAfterWrite(key, value) : value);
  }
  removeItem(key: string) { this.data.delete(key); }
}
