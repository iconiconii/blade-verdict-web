import { describe, expect, it } from 'vitest';
import { cook, createMetaState, previewCooking } from '../../domain/meta';
import { cookingClock, cookingPresentationMs, emptyKitchenSlots, placeIngredient, remainingForSelection, selectedIngredients } from './selection';

const meta = createMetaState({ inventory: [
  { ingredientId: 'ing_corn', quality: 'Top', count: 1 },
  { ingredientId: 'ing_jelly', quality: 'Normal', count: 2 },
] });

describe('kitchen workbench selection', () => {
  it('starts with three empty slots, not sample ingredients', () => expect(emptyKitchenSlots()).toEqual([null, null, null]));
  it('selects without changing actual stock and prevents over-allocation', () => {
    const slots = placeIngredient(meta, emptyKitchenSlots(), 0, 'ing_corn', 'Top');
    expect(meta.inventory[0].count).toBe(1);
    expect(remainingForSelection(meta, slots, 'ing_corn', 'Top')).toBe(0);
    expect(placeIngredient(meta, slots, 1, 'ing_corn', 'Top')).toBe(slots);
    expect(placeIngredient(meta, slots, 0, 'ing_corn', 'Top')).toEqual(slots);
  });
  it('preserves V2 recipe, quality, price and consumption rules', () => {
    let slots = placeIngredient(meta, emptyKitchenSlots(), 0, 'ing_corn', 'Top');
    slots = placeIngredient(meta, slots, 1, 'ing_jelly', 'Normal');
    const ingredients = selectedIngredients(slots);
    expect(previewCooking(meta, ingredients)).toMatchObject({ canCook: true, quality: 'Normal', sellPrice: 173 });
    const result = cook(meta, ingredients, 'workbench-test');
    expect(result.state.inventory).toEqual([{ ingredientId: 'ing_jelly', quality: 'Normal', count: 1 }]);
    expect(result.state.pendingDishes).toHaveLength(1);
  });
  it('does not cook an extra third ingredient or stale inventory', () => {
    let slots = placeIngredient(meta, emptyKitchenSlots(), 0, 'ing_corn', 'Top');
    slots = placeIngredient(meta, slots, 1, 'ing_jelly', 'Normal');
    slots = placeIngredient(meta, slots, 2, 'ing_jelly', 'Normal');
    expect(previewCooking(meta, selectedIngredients(slots)).canCook).toBe(false);
    expect(previewCooking(createMetaState(), selectedIngredients(slots)).canCook).toBe(false);
    expect(placeIngredient(meta, slots, 3, 'ing_jelly', 'Normal')).toBe(slots);
  });
  it('formats a real presentation countdown without negative seconds', () => {
    expect(cookingClock(cookingPresentationMs)).toBe('00:30');
    expect(cookingClock(3000)).toBe('00:03');
    expect(cookingClock(1450)).toBe('00:02');
    expect(cookingClock(-100)).toBe('00:00');
  });
});
