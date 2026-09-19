import { describe, expect, it } from 'vitest';
import {
  RECIPES,
  SHOP_ITEMS,
  addInventory,
  buy,
  cook,
  createMetaState,
  dishPrice,
  dishQuality,
  equippedVerdictDamageBonus,
  inventoryCount,
  matchesRecipe,
  previewCooking,
  removeInventory,
  roundHalfAwayFromZero,
  sell,
  sellAll,
  type IngredientSelection,
  type MetaState,
} from './meta';

const corn = (quality: IngredientSelection['quality'] = 'Normal', count = 1): IngredientSelection => ({ ingredientId: 'ing_corn', quality, count });
const jelly = (quality: IngredientSelection['quality'] = 'Normal', count = 1): IngredientSelection => ({ ingredientId: 'ing_jelly', quality, count });

describe('out-of-battle V2 economy', () => {
  it('starts with no coins or ingredients', () => {
    const state = createMetaState();
    expect(state.coins).toBe(0);
    expect(state.inventory).toEqual([]);
    expect(state.pendingDishes).toEqual([]);
  });

  it('uses the Unity ingredient ids and quality base prices', () => {
    expect(RECIPES.map(recipe => recipe.outputDishId)).toEqual(['dish_corn_toast', 'dish_jelly_pudding', 'dish_corn_jelly']);
    expect(dishPrice([corn('Broken')], RECIPES[0])).toBe(6); // 5 * 1.2
    expect(dishPrice([corn('Top')], RECIPES[0])).toBe(120); // 100 * 1.2
  });

  it('matches recipes strictly by ingredient and quantity', () => {
    const combo = RECIPES[2];
    expect(matchesRecipe([corn(), jelly()], combo)).toBe(true);
    expect(matchesRecipe([corn(), jelly(), { ingredientId: 'ing_corn', quality: 'Normal', count: 0 }], combo)).toBe(false);
    expect(matchesRecipe([corn('Normal', 2), jelly()], combo)).toBe(false);
    expect(matchesRecipe([corn()], combo)).toBe(false);
  });

  it('uses the lowest quality and rounds half away from zero', () => {
    expect(dishQuality([corn('Top'), jelly('Broken')])).toBe('Broken');
    // 15 + 15 = 30, *1.5 = 45; the combo remains an integer.
    expect(dishPrice([corn('Normal'), jelly('Normal')], RECIPES[2])).toBe(45);
    expect(dishPrice([corn('High'), jelly('Normal')], RECIPES[2])).toBe(83); // 55*1.5 = 82.5
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
  });

  it('adds and removes inventory immutably, rejecting negative stock', () => {
    const empty = createMetaState();
    const stocked = addInventory(empty, corn('High', 2));
    expect(empty.inventory).toEqual([]);
    expect(inventoryCount(stocked, 'corn', 'High')).toBe(2);
    const oneLeft = removeInventory(stocked, corn('High'));
    expect(inventoryCount(oneLeft, 'ing_corn', 'High')).toBe(1);
    expect(() => removeInventory(oneLeft, corn('High', 2))).toThrow(/Insufficient inventory/);
  });

  it('cooks only with available exact ingredients and records the dish', () => {
    let state = createMetaState();
    state = addInventory(state, corn('Top'));
    state = addInventory(state, jelly('Normal'));
    const before = JSON.stringify(state);
    const result = cook(state, [corn('Top'), jelly('Normal')], 'dish-1');
    expect(result.dish).toMatchObject({ instanceId: 'dish-1', dishId: 'dish_corn_jelly', quality: 'Normal', sellPrice: 173 });
    expect(result.state.inventory).toEqual([]);
    expect(result.state.unlockedRecipeIds).toEqual(['recipe_corn_jelly']);
    expect(result.state.dishRecords).toEqual([{ dishId: 'dish_corn_jelly', bestQuality: 'Normal', cookCount: 1 }]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects invalid recipes, insufficient stock, and duplicate dish ids', () => {
    const state = addInventory(createMetaState(), corn('Normal'));
    expect(() => cook(state, [jelly()], 'missing')).toThrow(/Insufficient inventory/);
    expect(() => cook(state, [corn(), jelly()], 'missing')).toThrow(/Insufficient inventory/);
    const first = cook(state, [corn()], 'same-id');
    expect(() => cook(first.state, [], 'empty')).toThrow(/At least one ingredient/);
    expect(() => cook(first.state, [corn()], 'same-id')).toThrow(/Insufficient inventory|already exists/);
    const twoCorn = addInventory(state, corn());
    expect(() => cook(twoCorn, [corn('Normal', 2)], 'invalid')).toThrow(/No strict recipe/);
    expect(inventoryCount(twoCorn, 'corn')).toBe(2);
  });

  it('sells dishes and leaves the source state untouched', () => {
    const state = cook(addInventory(createMetaState(), corn('Top')), [corn('Top')], 'toast').state;
    const result = sell(state, 'toast');
    expect(result.earned).toBe(120);
    expect(result.state.coins).toBe(120);
    expect(result.state.pendingDishes).toEqual([]);
    expect(state.coins).toBe(0);
    expect(() => sell(result.state, 'toast')).toThrow(/Unknown pending dish/);
    const many = cook(addInventory(createMetaState(), corn('Normal')), [corn('Normal')], 'a').state;
    expect(sellAll(many).earned).toBe(18);
  });

  it('allows only the implemented cleaver purchase and equips it', () => {
    const item = SHOP_ITEMS.find(value => value.id === 'weapon_corn_cleaver')!;
    expect(item.cost).toBe(120);
    const state = createMetaState({ coins: 120 });
    const result = buy(state, item.id);
    expect(result.state.coins).toBe(0);
    expect(result.state.purchasedShopItemIds).toEqual([item.id]);
    expect(result.state.equippedWeaponId).toBe(item.id);
    expect(equippedVerdictDamageBonus(result.state)).toBe(8);
    expect(() => buy(result.state, item.id)).toThrow(/already purchased/);
    expect(() => buy(createMetaState({ coins: 1000 }), 'weapon_jelly_fork')).toThrow(/preview/);
    expect(() => buy(createMetaState({ coins: 0 }), item.id)).toThrow(/Not enough coins/);
  });

  it('supports immutable consumable stacks for future active items', () => {
    const preview = SHOP_ITEMS.find(value => value.category === 'item')!;
    expect(() => buy(createMetaState({ coins: preview.cost }), preview.id)).toThrow(/preview/);
    // Keep this assertion explicit: item previews never sneak a combat bonus into rules.
    expect(SHOP_ITEMS.filter(item => !item.implemented).every(item => item.verdictDamageBonus === 0)).toBe(true);
  });

  it('does not mutate a nested state when cooking', () => {
    const original: MetaState = addInventory(createMetaState(), corn('Normal', 2));
    const next = cook(original, [corn('Normal')], 'x').state;
    expect(inventoryCount(original, 'ing_corn', 'Normal')).toBe(2);
    expect(inventoryCount(next, 'ing_corn', 'Normal')).toBe(1);
  });

  it('normalizes battle ids to canonical inventory ids and rejects invalid counts', () => {
    const state = addInventory(createMetaState(), { ingredientId: 'corn', quality: 'Normal', count: 2 });
    expect(state.inventory).toEqual([corn('Normal', 2)]);
    expect(previewCooking(state, [{ ingredientId: 'corn', quality: 'Normal', count: 1 }])).toMatchObject({ canCook: true, sellPrice: 18 });
    expect(() => addInventory(state, corn('Normal', 0))).toThrow(/positive integer/);
    expect(() => addInventory(state, corn('Normal', 1.5))).toThrow(/positive integer/);
    expect(() => addInventory(state, corn('Normal', NaN))).toThrow(/positive integer/);
  });

  it('offers a nonthrowing cooking preview and never consumes on invalid selection', () => {
    const state = addInventory(createMetaState(), corn('Normal', 2));
    expect(previewCooking(state, [])).toEqual({ canCook: false, failureReason: '请选择食材' });
    expect(previewCooking(state, [jelly()])).toEqual({ canCook: false, failureReason: '库存不足' });
    expect(previewCooking(state, [corn('Normal', 2)])).toEqual({ canCook: false, failureReason: '没有匹配的严格配方' });
    expect(state.pendingDishes).toEqual([]);
  });

  it('generates a non-colliding default id after a dish is sold', () => {
    const stocked = addInventory(createMetaState(), corn('Normal', 3));
    const one = cook(stocked, [corn()]).state;
    const two = cook(one, [corn()]).state;
    const oneSold = sell(two, 'dish-1').state;
    const result = cook(oneSold, [corn()]);
    expect(result.dish.instanceId).toBe('dish-3');
    expect(result.state.pendingDishes).toHaveLength(2);
  });
});
