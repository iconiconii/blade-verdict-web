import { createSave, decodeSave, encodeSave, type SavedWorkshop } from './domain/save';

export const STORAGE_KEY = 'blade-verdict-workshop-v2';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SaveMutator = (latest: SavedWorkshop) => SavedWorkshop;
export type SaveLock = <T>(operation: () => T | Promise<T>) => Promise<T>;

export interface SaveRepository {
  read(): SavedWorkshop;
  update(mutator: SaveMutator): Promise<SavedWorkshop>;
}

export type StorageMode = 'web-locks' | 'single-tab' | 'unavailable';

export const storageMode: StorageMode = typeof window === 'undefined'
  ? 'unavailable'
  : typeof window.navigator?.locks?.request === 'function'
    ? 'web-locks'
    : 'single-tab';

/**
 * A single persisted record is the commit boundary: inventory, coins,
 * discoveries and battle receipts are either written together or not at all.
 * The injected lock must serialize every writer that uses this storage key.
 */
export function createSaveRepository({ storage, withLock }: { storage: SaveStorage; withLock?: SaveLock }): SaveRepository {
  let pending: Promise<void> = Promise.resolve();

  const read = (): SavedWorkshop => {
    const raw = storage.getItem(STORAGE_KEY);
    // A Map-backed fake often returns undefined for a missing key; normalize
    // that test-only shape to the Web Storage null contract.
    return decodeSave(raw === undefined ? null : raw);
  };

  const commit = (mutator: SaveMutator): SavedWorkshop => {
    // Re-read after acquiring the lock. A state cached in React is never used
    // to decide whether there are enough ingredients/coins for this write.
    const latest = read();
    const baseRevision = latest.revision;
    if (baseRevision >= Number.MAX_SAFE_INTEGER) throw new Error('存档版本计数已达到上限，未执行本次操作。');

    // Validation is intentionally before setItem. A malformed save, failed
    // recipe or invalid mutation cannot replace the previous durable record.
    const candidate = decodeSave(encodeSave(mutator(latest)));
    const next: SavedWorkshop = {
      ...candidate,
      revision: Math.max(baseRevision + 1, candidate.revision),
    };
    const encoded = encodeSave(next);
    storage.setItem(STORAGE_KEY, encoded);
    // Returning is the acknowledgement. Storage exceptions propagate and no
    // UI may consider the mutation committed before this point.
    return next;
  };

  const update = (mutator: SaveMutator): Promise<SavedWorkshop> => {
    if (withLock) return Promise.resolve().then(() => withLock(() => commit(mutator)));
    // Unsupported browsers get serialized writes in this one repository only.
    // This queue is deliberately not described as cross-tab synchronization.
    const result = pending.then(() => commit(mutator));
    pending = result.then(() => undefined, () => undefined);
    return result;
  };

  return { read, update };
}

let browserRepository: SaveRepository | undefined;

function getBrowserRepository(): SaveRepository {
  if (typeof window === 'undefined') throw new Error('当前环境没有浏览器存储，操作未保存。');
  if (!browserRepository) {
    const locks = window.navigator?.locks;
    const withLock: SaveLock | undefined = typeof locks?.request === 'function'
      ? operation => locks.request(STORAGE_KEY, operation)
      : undefined;
    // Access itself can throw (e.g. storage is disabled); do not turn that into
    // an empty save or a false success.
    browserRepository = createSaveRepository({ storage: window.localStorage, withLock });
  }
  return browserRepository;
}

/** Node has no saved user state; this read-only default supports unit tests. */
export function readWorkshopSave(): SavedWorkshop {
  if (typeof window === 'undefined') return createSave();
  return getBrowserRepository().read();
}

export async function updateWorkshopSave(mutator: SaveMutator): Promise<SavedWorkshop> {
  return getBrowserRepository().update(mutator);
}
