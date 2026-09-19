import { describe, expect, it } from 'vitest';
import { addInventory, cook, sell } from './domain/meta';
import { createSave, decodeSave, encodeSave, settleBattle, type SavedWorkshop } from './domain/save';
import { STORAGE_KEY, createSaveRepository, readWorkshopSave, storageMode, updateWorkshopSave, type SaveLock, type SaveStorage } from './persistence';

function memoryStorage(initial?: SavedWorkshop) {
  const records = new Map<string, string>();
  if (initial) records.set(STORAGE_KEY, encodeSave(initial));
  let writes = 0;
  const storage: SaveStorage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); writes += 1; },
  };
  return { records, storage, writes: () => writes };
}

function sharedLock() {
  let queue: Promise<void> = Promise.resolve();
  let active = 0;
  let calls = 0;
  const withLock: SaveLock = operation => {
    calls += 1;
    const result = queue.then(async () => {
      active += 1;
      try { return await operation(); }
      finally { active -= 1; }
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  return { withLock, active: () => active, calls: () => calls };
}

describe('workshop persistence write boundary', () => {
  it('reads an absent save but never pretends a Node write succeeded', async () => {
    expect(readWorkshopSave()).toEqual(createSave());
    expect(storageMode).toBe('unavailable');
    await expect(updateWorkshopSave(save => save)).rejects.toThrow(/没有浏览器存储/);
  });

  it('serializes concurrent cooks from two clients and reads under the shared lock', async () => {
    const initial = createSave();
    initial.meta = addInventory(addInventory(initial.meta, { ingredientId: 'ing_corn', quality: 'Top', count: 1 }), { ingredientId: 'ing_jelly', quality: 'High', count: 1 });
    const memory = memoryStorage(initial);
    const mutex = sharedLock();
    let readsWhileLocked = 0;
    const storage: SaveStorage = {
      getItem: key => { if (mutex.active() === 1) readsWhileLocked += 1; return memory.storage.getItem(key); },
      setItem: (key, value) => { expect(mutex.active()).toBe(1); memory.storage.setItem(key, value); },
    };
    const first = createSaveRepository({ storage, withLock: mutex.withLock });
    const second = createSaveRepository({ storage, withLock: mutex.withLock });
    await Promise.all([
      first.update(save => ({ ...save, meta: cook(save.meta, [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }], 'corn-dish').state })),
      second.update(save => ({ ...save, meta: cook(save.meta, [{ ingredientId: 'ing_jelly', quality: 'High', count: 1 }], 'jelly-dish').state })),
    ]);
    const durable = decodeSave(memory.records.get(STORAGE_KEY)!);
    expect(durable.revision).toBe(2);
    expect(durable.meta.inventory).toEqual([]);
    expect(durable.meta.pendingDishes.map(dish => dish.instanceId)).toEqual(['corn-dish', 'jelly-dish']);
    expect(mutex.calls()).toBe(2);
    expect(readsWhileLocked).toBe(2);
    expect(memory.writes()).toBe(2);
  });

  it('makes duplicate settlement retries give one reward, including separate clients', async () => {
    const memory = memoryStorage();
    const mutex = sharedLock();
    const first = createSaveRepository({ storage: memory.storage, withLock: mutex.withLock });
    const second = createSaveRepository({ storage: memory.storage, withLock: mutex.withLock });
    await Promise.all([
      first.update(save => settleBattle(save, 'shared-battle', 'corn', true)),
      second.update(save => settleBattle(save, 'shared-battle', 'corn', true)),
    ]);
    const durable = first.read();
    expect(durable.meta.inventory).toEqual([{ ingredientId: 'ing_corn', quality: 'Top', count: 3 }]);
    expect(durable.settledBattleIds).toEqual(['shared-battle']);
    expect(durable.revision).toBe(2);
  });

  it('acknowledges only after setItem succeeds, preserving the previous save on quota failure', async () => {
    const initial = createSave();
    const memory = memoryStorage(initial);
    const before = memory.records.get(STORAGE_KEY);
    const failure = new Error('QuotaExceededError');
    const repo = createSaveRepository({ storage: { ...memory.storage, setItem: () => { throw failure; } } });
    await expect(repo.update(save => settleBattle(save, 'corn-1', 'corn', true))).rejects.toBe(failure);
    expect(memory.records.get(STORAGE_KEY)).toBe(before);
    expect(memory.writes()).toBe(0);
  });

  it('does not call the mutator or overwrite a corrupt/noncompatible save', async () => {
    const memory = memoryStorage();
    memory.records.set(STORAGE_KEY, '{broken');
    const repo = createSaveRepository({ storage: memory.storage });
    let called = false;
    await expect(repo.update(save => { called = true; return save; })).rejects.toThrow(/存档不是合法 JSON/);
    expect(called).toBe(false);
    expect(memory.records.get(STORAGE_KEY)).toBe('{broken');
    memory.records.set(STORAGE_KEY, JSON.stringify({ ...createSave(), schema: 999 }));
    await expect(repo.update(save => save)).rejects.toThrow(/不支持的存档版本/);
    expect(memory.writes()).toBe(0);
  });

  it('rejects invalid mutations before any write and continues the single-tab queue after rejection', async () => {
    const memory = memoryStorage();
    const repo = createSaveRepository({ storage: memory.storage });
    const invalid = repo.update(save => ({ ...save, meta: { ...save.meta, coins: -1 } }));
    const valid = repo.update(save => settleBattle(save, 'later-valid-battle', 'jelly', true));
    await expect(invalid).rejects.toThrow(/meta.coins/);
    expect((await valid).meta.inventory[0].ingredientId).toBe('ing_jelly');
    expect(memory.writes()).toBe(1);
  });

  it('prevents two concurrent sales from spending the same dish twice', async () => {
    const initial = createSave();
    initial.meta = cook(addInventory(initial.meta, { ingredientId: 'ing_corn', quality: 'Top', count: 1 }), [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }], 'dish-once').state;
    const memory = memoryStorage(initial);
    const repo = createSaveRepository({ storage: memory.storage });
    const results = await Promise.allSettled([
      repo.update(save => ({ ...save, meta: sell(save.meta, 'dish-once').state })),
      repo.update(save => ({ ...save, meta: sell(save.meta, 'dish-once').state })),
    ]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(repo.read().meta.coins).toBe(120);
    expect(memory.writes()).toBe(1);
  });

  it('increments from the durable revision and refuses revision overflow', async () => {
    const memory = memoryStorage({ ...createSave(), revision: 10 });
    const repo = createSaveRepository({ storage: memory.storage });
    expect((await repo.update(save => ({ ...save, revision: 2 }))).revision).toBe(11);
    expect((await repo.update(save => ({ ...save, revision: 20 }))).revision).toBe(20);
    memory.records.set(STORAGE_KEY, encodeSave({ ...createSave(), revision: Number.MAX_SAFE_INTEGER }));
    await expect(repo.update(save => save)).rejects.toThrow(/达到上限/);
    expect(memory.writes()).toBe(2);
  });
});
