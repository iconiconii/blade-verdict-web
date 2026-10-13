import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSave, decodeSave, encodeSave } from './domain/save';
import { claimCooking } from './domain/cookingJobs';
import { consumableCount, sell } from './domain/meta';
import { useGame } from './store';

const disk = vi.hoisted(() => ({ value: null as string | null, fail: false }));
vi.mock('./persistence', async () => {
  const real = await vi.importActual<typeof import('./persistence')>('./persistence');
  const repository = real.createSaveRepository({ storage: {
    getItem: () => disk.value,
    setItem: (_key, value) => { if (disk.fail) throw new Error('storage full'); disk.value = value; },
  } });
  return { ...real, readWorkshopSave: repository.read, updateWorkshopSave: repository.update };
});

describe('workshop store wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const save = createSave();
    save.meta.coins = 1000;
    save.meta.inventory = [{ ingredientId: 'ing_corn', quality: 'Top', count: 6 }];
    disk.value = encodeSave(save); disk.fail = false;
    useGame.setState({ save, meta: save.meta, saving: false, saveIssue: null, screen: 'kitchen', pendingBattle: null, battleId: null });
  });
  afterEach(() => vi.useRealTimers());

  it('guards a locked monster even when the UI is bypassed', () => {
    useGame.getState().start('tomato');
    expect(useGame.getState().screen).toBe('kitchen');
    expect(useGame.getState().notice?.message).toContain('先通关');
    useGame.getState().start('corn');
    expect(useGame.getState().screen).toBe('battle');
  });

  it('keeps cooking across navigation and claims exactly one dish', async () => {
    expect(await useGame.getState().startCooking('recipe_corn_pancake', [{ ingredientId: 'ing_corn', quality: 'Top', count: 3 }])).toBe(true);
    const job = useGame.getState().save.cookingJob!;
    expect(useGame.getState().meta.pendingDishes).toHaveLength(0);
    useGame.getState().go('stages');
    expect(useGame.getState().save.cookingJob?.id).toBe(job.id);
    expect(await useGame.getState().claimCooking(job.id)).toBe(false);
    vi.setSystemTime(job.finishAt);
    useGame.getState().go('kitchen');
    expect(await useGame.getState().claimCooking(job.id)).toBe(true);
    expect(await useGame.getState().claimCooking(job.id)).toBe(false);
    expect(useGame.getState().notice).toMatchObject({kind:'error',message:expect.stringContaining('已领取')});
    expect(decodeSave(disk.value).meta.pendingDishes).toHaveLength(1);
    expect(useGame.getState().meta.pendingDishes[0].sellPrice).toBe(390);
  });

  it('refreshes instead of acknowledging a dish already claimed and sold in another tab', async () => {
    await useGame.getState().startCooking('recipe_toast', [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }]);
    const job = useGame.getState().save.cookingJob!;
    vi.setSystemTime(job.finishAt);
    const claimed = claimCooking(decodeSave(disk.value), job.id, job.finishAt);
    disk.value = encodeSave({ ...claimed, meta: sell(claimed.meta, job.dish.instanceId).state });
    expect(useGame.getState().save.cookingJob?.id).toBe(job.id);
    expect(await useGame.getState().claimCooking(job.id)).toBe(false);
    expect(useGame.getState().save.cookingJob).toBeNull();
    expect(useGame.getState().meta.pendingDishes).toHaveLength(0);
    expect(useGame.getState().meta.coins).toBe(1000 + job.dish.sellPrice);
    expect(useGame.getState().saveIssue).toBeNull();
  });

  it('does not start or consume when persistence fails', async () => {
    const before = disk.value; disk.fail = true;
    expect(await useGame.getState().startCooking('recipe_toast', [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }])).toBe(false);
    expect(disk.value).toBe(before);
    expect(useGame.getState().save.cookingJob).toBeNull();
    expect(useGame.getState().meta.inventory[0].count).toBe(6);
  });

  it('offers a held bomb in battle and consumes a cooker for only the next cooking job', async () => {
    expect(await useGame.getState().buyItem('upgrade_tomato_bomb')).toBe(true);
    expect(await useGame.getState().buyItem('upgrade_jelly_cooker')).toBe(true);
    expect(useGame.getState().meta.equippedWeaponId).toBeNull();
    useGame.getState().start('corn');
    expect(useGame.getState().combat.tomatoBombOwned).toBe(true);
    useGame.getState().go('kitchen');
    await useGame.getState().startCooking('recipe_toast', [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }]);
    const job = useGame.getState().save.cookingJob!;
    expect(job.finishAt - job.startedAt).toBe(22500);
    expect(consumableCount(useGame.getState().meta,'upgrade_jelly_cooker')).toBe(0);
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_jelly_cooker')).toBe(0);
    vi.setSystemTime(job.finishAt);
    await useGame.getState().claimCooking(job.id);
    await useGame.getState().startCooking('recipe_toast', [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }]);
    const nextJob = useGame.getState().save.cookingJob!;
    expect(nextJob.finishAt-nextJob.startedAt).toBe(30000);
  });
});
