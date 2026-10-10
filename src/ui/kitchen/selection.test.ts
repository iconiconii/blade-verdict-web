import { describe, expect, it } from 'vitest';
import { RECIPES, createMetaState, previewCooking, type RecipeDefinition } from '../../domain/meta';
import { amountsForSlot, cookingClock, emptyKitchenSlots, ingredientQuantity, maximumQualityAmount, placeIngredient, recipeMissingIngredients, remainingForSelection, selectedIngredients, slotQuantity, slotsForIngredients } from './selection';

const meta = createMetaState({ inventory: [
  { ingredientId: 'ing_corn', quality: 'Top', count: 1 },
  { ingredientId: 'ing_corn', quality: 'Normal', count: 4 },
  { ingredientId: 'ing_jelly', quality: 'Normal', count: 2 },
] });
const pancake: RecipeDefinition = { id: 'recipe_corn_pancake', outputDishId: 'dish_corn_pancake', name: '玉米饼', requirements: { ing_corn: 3 }, multiplier: 1.3 };
const combo = RECIPES.find(item => item.id === 'recipe_corn_jelly')!;

describe('recipe-first kitchen selection', () => {
  it('starts with three empty slots and an empty quantity draft', () => {
    expect(emptyKitchenSlots()).toEqual([null, null, null]);
    expect(amountsForSlot(null)).toEqual({});
  });

  it('puts multiple qualities and quantities of one ingredient in one slot without changing stock', () => {
    const slots = placeIngredient(meta, emptyKitchenSlots(), 0, pancake, 'ing_corn', { Top: 1, Normal: 2 });
    expect(slotQuantity(slots[0])).toBe(3);
    expect(slots.slice(1)).toEqual([null, null]);
    expect(selectedIngredients(slots)).toEqual([
      { ingredientId: 'ing_corn', quality: 'Normal', count: 2 },
      { ingredientId: 'ing_corn', quality: 'Top', count: 1 },
    ]);
    expect(amountsForSlot(slots[0])).toEqual({ Top: 1, Normal: 2 });
    expect(meta.inventory[0].count).toBe(1);
    expect(remainingForSelection(meta, slots, 'ing_corn', 'Top')).toBe(0);
    expect(ingredientQuantity(slots, 'ing_corn')).toBe(3);
  });

  it('limits each quality by available stock and all other qualities by recipe demand', () => {
    const slots = emptyKitchenSlots();
    expect(maximumQualityAmount(meta, slots, pancake, 0, 'ing_corn', 'Top', {})).toBe(1);
    expect(maximumQualityAmount(meta, slots, pancake, 0, 'ing_corn', 'Normal', {})).toBe(3);
    expect(maximumQualityAmount(meta, slots, pancake, 0, 'ing_corn', 'Normal', { Top: 1 })).toBe(2);
    expect(maximumQualityAmount(meta, slots, pancake, 0, 'ing_corn', 'Top', { Normal: 3 })).toBe(0);
    expect(placeIngredient(meta, slots, 0, pancake, 'ing_corn', { Top: 2 })).toBe(slots);
    expect(placeIngredient(meta, slots, 0, pancake, 'ing_corn', { Top: 1, Normal: 3 })).toBe(slots);
  });

  it('does not allow duplicate ingredients in another slot or a non-recipe ingredient', () => {
    const slots = placeIngredient(meta, emptyKitchenSlots(), 0, pancake, 'ing_corn', { Top: 1 });
    expect(placeIngredient(meta, slots, 1, pancake, 'ing_corn', { Normal: 2 })).toBe(slots);
    expect(placeIngredient(meta, slots, 1, pancake, 'ing_jelly', { Normal: 1 })).toBe(slots);
  });

  it('can edit a slot using its existing inventory allowance and leaves the old draft intact', () => {
    const slots = placeIngredient(meta, emptyKitchenSlots(), 0, pancake, 'ing_corn', { Top: 1 });
    expect(remainingForSelection(meta, slots, 'ing_corn', 'Top', 0)).toBe(1);
    const edited = placeIngredient(meta, slots, 0, pancake, 'ing_corn', { Top: 1, Normal: 2 });
    expect(slotQuantity(edited[0])).toBe(3);
    expect(slotQuantity(slots[0])).toBe(1);
  });

  it('rejects zero, invalid counts, invalid slots and stale stock when confirming', () => {
    const slots = emptyKitchenSlots();
    for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(placeIngredient(meta, slots, 0, pancake, 'ing_corn', { Top: count })).toBe(slots);
    }
    expect(placeIngredient(meta, slots, 3, pancake, 'ing_corn', { Top: 1 })).toBe(slots);
    expect(placeIngredient(createMetaState(), slots, 0, pancake, 'ing_corn', { Top: 1 })).toBe(slots);
  });

  it('allows available recipes before discovery and names shortages across mixed qualities', () => {
    expect(meta.unlockedRecipeIds).toEqual([]);
    expect(recipeMissingIngredients(meta, pancake)).toEqual([]);
    const poor = createMetaState({ inventory: [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }] });
    expect(recipeMissingIngredients(poor, pancake)).toEqual([{ ingredientId: 'ing_corn', count: 2 }]);
    expect(recipeMissingIngredients(poor, combo)).toEqual([{ ingredientId: 'ing_jelly', count: 1 }]);
  });

  it('requires exact recipe ingredients and preserves existing quality and sale rules', () => {
    let slots = placeIngredient(meta, emptyKitchenSlots(), 0, combo, 'ing_corn', { Top: 1 });
    expect(previewCooking(meta, selectedIngredients(slots))).toMatchObject({ canCook: true, recipe: { id: 'recipe_toast' } });
    slots = placeIngredient(meta, slots, 1, combo, 'ing_jelly', { Normal: 1 });
    expect(previewCooking(meta, selectedIngredients(slots))).toMatchObject({ canCook: true, recipe: { id: combo.id }, quality: 'Normal', sellPrice: 173 });
    expect(previewCooking(createMetaState(), selectedIngredients(slots)).canCook).toBe(false);
  });

  it('groups the persisted task ingredients without losing quantities or changing its snapshot', () => {
    const taskItems = [
      { ingredientId: 'corn' as const, quality: 'Top' as const, count: 1 },
      { ingredientId: 'ing_corn' as const, quality: 'Normal' as const, count: 1 },
      { ingredientId: 'ing_corn' as const, quality: 'Normal' as const, count: 1 },
    ];
    const slots = slotsForIngredients(taskItems);
    expect(slotQuantity(slots[0])).toBe(3);
    expect(amountsForSlot(slots[0])).toEqual({ Top: 1, Normal: 2 });
    expect(taskItems[1].count).toBe(1);
    const flattened = selectedIngredients(slots);
    flattened[0].count = 9;
    expect(slotQuantity(slots[0])).toBe(3);
  });

  it('formats remaining wall time without negative seconds', () => {
    expect(cookingClock(30000)).toBe('00:30');
    expect(cookingClock(22500)).toBe('00:23');
    expect(cookingClock(1450)).toBe('00:02');
    expect(cookingClock(-100)).toBe('00:00');
    expect(cookingClock(61500)).toBe('01:02');
  });
});
