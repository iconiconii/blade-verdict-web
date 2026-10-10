import { describe, expect, it } from 'vitest';
import { beginCooking, claimCooking, cookingRemainingMs, MAX_COOKING_TIME_MS } from './cookingJobs';
import { addInventory, buy, type IngredientSelection } from './meta';
import { createSave, decodeSave, encodeSave, settleBattle } from './save';

const selected: IngredientSelection[] = [{ ingredientId: 'corn', quality: 'Top', count: 3 }];
const stock = () => {
  const save = createSave();
  return { ...save, meta: addInventory(save.meta, selected[0]) };
};

describe('persistent single-pot cooking jobs', () => {
  it('consumes exactly the selected recipe and reserves one result without granting it early', () => {
    const source = stock();
    const before = JSON.stringify(source);
    const next = beginCooking(source, 'recipe_corn_pancake', selected, 'first', 1000);
    expect(JSON.stringify(source)).toBe(before);
    expect(next.meta.inventory).toEqual([]);
    expect(next.meta.pendingDishes).toEqual([]);
    expect(next.meta.unlockedRecipeIds).toEqual([]);
    expect(next.meta.dishRecords).toEqual([]);
    expect(next.cookingJob).toEqual({
      id: 'first', recipeId: 'recipe_corn_pancake', startedAt: 1000, finishAt: 31_000,
      ingredients: [{ ingredientId: 'ing_corn', quality: 'Top', count: 3 }],
      dish: { instanceId: 'cooking:first', dishId: 'dish_corn_pancake', quality: 'Top', sellPrice: 390 },
    });
    expect(next.revision).toBe(source.revision + 1);
  });

  it('requires the chosen recipe and rejects quantities outside its exact requirements', () => {
    const save = stock();
    expect(() => beginCooking(save, 'recipe_toast', selected, 'wrong-recipe', 0)).toThrow(/不匹配/);
    expect(() => beginCooking(save, 'missing', selected, 'missing-recipe', 0)).toThrow(/有效菜谱/);
    expect(() => beginCooking(save, 'recipe_corn_pancake', [{ ...selected[0], count: 2 }], 'under', 0)).toThrow(/不匹配/);
    expect(() => beginCooking(save, 'recipe_corn_pancake', [{ ...selected[0], count: 4 }], 'over', 0)).toThrow(/不匹配/);
    expect(() => beginCooking(save, 'recipe_corn_pancake', [{ ...selected[0], quality: 'High' }], 'quality', 0)).toThrow(/库存不足/);
    expect(save.meta.inventory[0].count).toBe(3);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid ingredient quantity %s', count => {
    expect(() => beginCooking(stock(), 'recipe_corn_pancake', [{ ...selected[0], count }], 'invalid-count', 0)).toThrow(/不匹配/);
  });

  it('coalesces same-quality selections and supports mixed-quality snapshots', () => {
    const save = stock();
    const parts: IngredientSelection[] = [{ ingredientId: 'corn', quality: 'Top', count: 1 }, { ingredientId: 'ing_corn', quality: 'Top', count: 2 }];
    const normalized = beginCooking(save, 'recipe_corn_pancake', parts, 'split', 0);
    expect(normalized.cookingJob!.ingredients).toEqual([{ ingredientId: 'ing_corn', quality: 'Top', count: 3 }]);
    expect(decodeSave(encodeSave(normalized))).toEqual(normalized);
    const mixed = { ...save, meta: addInventory(save.meta, { ingredientId: 'corn', quality: 'Broken', count: 1 }) };
    const cooking = beginCooking(mixed, 'recipe_corn_pancake', [{ ingredientId: 'corn', quality: 'Top', count: 2 }, { ingredientId: 'corn', quality: 'Broken', count: 1 }], 'mixed', 0);
    expect(cooking.cookingJob!.dish).toMatchObject({ quality: 'Broken', sellPrice: 267 });
  });

  it('keeps a single pot occupied through completion until the dish is claimed', () => {
    const cooking = beginCooking(stock(), 'recipe_corn_pancake', selected, 'active', 0);
    expect(() => beginCooking(cooking, 'recipe_toast', selected, 'other', 31_000)).toThrow(/已有料理/);
    expect(() => claimCooking(cooking, 'active', 29_999)).toThrow(/尚未完成/);
    expect(claimCooking(cooking, 'active', 30_000).cookingJob).toBeNull();
  });

  it('recovers wall-clock remaining time after leaving, backgrounding or reloading', () => {
    const start = 1_700_000_000_000;
    const cooking = beginCooking(stock(), 'recipe_corn_pancake', selected, 'background', start);
    const restored = decodeSave(encodeSave(cooking));
    expect(cookingRemainingMs(restored.cookingJob, start + 12_345)).toBe(17_655);
    expect(cookingRemainingMs(restored.cookingJob, start + 86_400_000)).toBe(0);
    expect(claimCooking(restored, 'background', start + 86_400_000).meta.pendingDishes).toHaveLength(1);
    expect(cookingRemainingMs(null, start)).toBe(0);
  });

  it('claims once, records the recipe only then, and rejects an old id against a new pot', () => {
    const cooking = beginCooking(stock(), 'recipe_corn_pancake', selected, 'first', 0);
    expect(() => claimCooking(cooking, 'wrong', 30_000)).toThrow(/已变化/);
    const claimed = claimCooking(cooking, 'first', 30_000);
    expect(claimed.meta.pendingDishes).toHaveLength(1);
    expect(claimed.meta.unlockedRecipeIds).toEqual(['recipe_corn_pancake']);
    expect(claimed.meta.dishRecords).toEqual([{ dishId: 'dish_corn_pancake', bestQuality: 'Top', cookCount: 1 }]);
    expect(claimCooking(claimed, 'first', 30_001)).toBe(claimed);
    const restocked = { ...claimed, meta: addInventory(claimed.meta, selected[0]) };
    const second = beginCooking(restocked, 'recipe_corn_pancake', selected, 'second', 30_001);
    expect(() => claimCooking(second, 'first', 70_000)).toThrow(/已变化/);
    expect(second.meta.pendingDishes).toHaveLength(1);
    expect(claimCooking(second, 'second', 70_000).meta.dishRecords[0].cookCount).toBe(2);
  });

  it('snapshots the quick cooker discount only when a new pot starts', () => {
    const funded = { ...stock(), meta: { ...stock().meta, coins: 240 } };
    const slow = beginCooking(funded, 'recipe_corn_pancake', selected, 'slow', 0);
    const boughtMidPot = { ...slow, meta: buy(slow.meta, 'upgrade_jelly_cooker').state };
    expect(boughtMidPot.cookingJob!.finishAt).toBe(30_000);
    expect(decodeSave(encodeSave(boughtMidPot))).toEqual(boughtMidPot);
    const claimed = claimCooking(boughtMidPot, 'slow', 30_000);
    const restocked = { ...claimed, meta: addInventory(claimed.meta, selected[0]) };
    expect(beginCooking(restocked, 'recipe_corn_pancake', selected, 'fast', 40_000).cookingJob!.finishAt).toBe(62_500);
  });

  it('retains a cooking job during unrelated battle reward settlement', () => {
    const cooking = beginCooking(stock(), 'recipe_corn_pancake', selected, 'pot', 0);
    const rewarded = settleBattle(cooking, 'win', 'jelly', true);
    expect(rewarded.cookingJob).toEqual(cooking.cookingJob);
    expect(rewarded.meta.inventory).toEqual([{ ingredientId: 'ing_jelly', quality: 'Top', count: 3 }]);
    expect(claimCooking(rewarded, 'pot', 30_000).meta.pendingDishes).toHaveLength(1);
  });

  it.each([-1, 0.5, NaN, Infinity, MAX_COOKING_TIME_MS + 1, Number.MAX_SAFE_INTEGER])('rejects an invalid wall-clock timestamp %s', now => {
    expect(() => beginCooking(stock(), 'recipe_corn_pancake', selected, 'time', now)).toThrow(/时间戳/);
    expect(() => claimCooking(stock(), 'time', now)).toThrow(/时间戳/);
  });

  it('accepts the last valid date boundary but refuses a completion beyond it', () => {
    const atBoundary = beginCooking(stock(), 'recipe_corn_pancake', selected, 'last', MAX_COOKING_TIME_MS - 30_000);
    expect(atBoundary.cookingJob!.finishAt).toBe(MAX_COOKING_TIME_MS);
    expect(decodeSave(encodeSave(atBoundary))).toEqual(atBoundary);
    expect(claimCooking(atBoundary, 'last', MAX_COOKING_TIME_MS).meta.pendingDishes).toHaveLength(1);
    expect(() => beginCooking(stock(), 'recipe_corn_pancake', selected, 'overflow', MAX_COOKING_TIME_MS - 29_999)).toThrow(/时间戳/);
  });
});
