import { describe, expect, it } from 'vitest';
import {
  RECIPES,
  SHOP_ITEMS,
  addInventory,
  buy,
  consumableCount,
  consumeConsumable,
  cook,
  cookingDurationMs,
  createMetaState,
  dishPrice,
  dishQuality,
  equippedVerdictDamageBonus,
  equip,
  hasTomatoBomb,
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
    expect(RECIPES.slice(0, 6).map(recipe => recipe.outputDishId)).toEqual(['dish_corn_toast', 'dish_jelly_pudding', 'dish_corn_jelly', 'dish_carrot_roast', 'dish_cabbage_roll', 'dish_tomato_salsa']);
    expect(RECIPES).toHaveLength(10);
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
    const preview = SHOP_ITEMS.find(value => value.category === 'item' && !value.implemented)!;
    expect(() => buy(createMetaState({ coins: preview.cost }), preview.id)).toThrow(/preview/);
    // Keep this assertion explicit: item previews never sneak a combat bonus into rules.
    expect(SHOP_ITEMS.filter(item => !item.implemented).every(item => item.verdictDamageBonus === 0)).toBe(true);
  });

  it('buys consumables repeatedly without replacing either equipment slot', () => {
    const armed = buy(createMetaState({ coins: 1000 }), 'weapon_corn_cleaver').state;
    expect(hasTomatoBomb(armed)).toBe(false);
    expect(cookingDurationMs(armed)).toBe(30_000);
    const bomb = buy(armed, 'upgrade_tomato_bomb').state;
    const complete = buy(bomb, 'upgrade_jelly_cooker').state;
    expect(complete.coins).toBe(490);
    expect(complete.equippedWeaponId).toBe('weapon_corn_cleaver');
    expect(complete.equippedSkinId).toBeNull();
    expect(complete.ownedItems).toEqual([
      { itemId: 'upgrade_tomato_bomb', count: 1 },
      { itemId: 'upgrade_jelly_cooker', count: 1 },
    ]);
    expect(equippedVerdictDamageBonus(complete)).toBe(8);
    expect(hasTomatoBomb(complete)).toBe(true);
    expect(cookingDurationMs(complete)).toBe(22_500);
    expect(armed.purchasedShopItemIds).toEqual(['weapon_corn_cleaver']);
    expect(complete.purchasedShopItemIds).toEqual(['weapon_corn_cleaver']);
    const restocked = buy(buy(complete, 'upgrade_jelly_cooker').state, 'upgrade_tomato_bomb').state;
    expect(restocked.coins).toBe(100);
    expect(consumableCount(restocked, 'upgrade_tomato_bomb')).toBe(2);
    expect(consumableCount(restocked, 'upgrade_jelly_cooker')).toBe(2);
    expect(consumableCount(complete, 'upgrade_tomato_bomb')).toBe(1);
    expect(() => equip(complete, 'upgrade_tomato_bomb')).toThrow(/Only weapons and skins/);
    expect(() => equip(complete, 'upgrade_jelly_cooker')).toThrow(/Only weapons and skins/);
  });

  it('consumes one item at a time and removes exhausted effects without granting permanent ownership', () => {
    let stocked = buy(createMetaState({ coins: 700 }), 'upgrade_tomato_bomb').state;
    stocked = buy(buy(stocked, 'upgrade_tomato_bomb').state, 'upgrade_jelly_cooker').state;
    const before = JSON.stringify(stocked);
    const firstBomb = consumeConsumable(stocked, 'upgrade_tomato_bomb');
    expect(consumableCount(firstBomb, 'upgrade_tomato_bomb')).toBe(1);
    expect(hasTomatoBomb(firstBomb)).toBe(true);
    const noBomb = consumeConsumable(firstBomb, 'upgrade_tomato_bomb');
    expect(hasTomatoBomb(noBomb)).toBe(false);
    expect(noBomb.ownedItems).toEqual([{ itemId: 'upgrade_jelly_cooker', count: 1 }]);
    const exhausted = consumeConsumable(noBomb, 'upgrade_jelly_cooker');
    expect(cookingDurationMs(exhausted)).toBe(30_000);
    expect(exhausted.ownedItems).toEqual([]);
    expect(exhausted.purchasedShopItemIds).toEqual([]);
    expect(() => consumeConsumable(exhausted, 'upgrade_tomato_bomb')).toThrow(/Insufficient item/);
    expect(() => consumeConsumable(exhausted, 'weapon_corn_cleaver')).toThrow(/not an available consumable/);
    expect(JSON.stringify(stocked)).toBe(before);
  });

  it('rejects consumable count overflow without taking coins from the original snapshot', () => {
    const full = createMetaState({ coins: 150, ownedItems: [{ itemId: 'upgrade_tomato_bomb', count: Number.MAX_SAFE_INTEGER }] });
    expect(() => buy(full, 'upgrade_tomato_bomb')).toThrow(/positive integer/);
    expect(full.coins).toBe(150);
  });

  it.each([
    ['recipe_vegetable_soup', ['corn', 'carrot', 'tomato'], 540],
    ['recipe_jelly_salad', ['corn', 'carrot', 'jelly'], 540],
    ['recipe_vegetable_stew', ['cabbage', 'tomato'], 300],
    ['recipe_corn_pancake', ['corn', 'corn', 'corn'], 390],
  ] as const)('prices %s using each selected quality, with exactly one output', (recipeId, ingredients, price) => {
    const recipe = RECIPES.find(value => value.id === recipeId)!;
    const selected = ingredients.map(ingredientId => ({ ingredientId, quality: 'Top' as const, count: 1 }));
    let state = createMetaState();
    for (const entry of selected) state = addInventory(state, entry);
    expect(dishPrice(selected, recipe)).toBe(price);
    expect(cook(state, selected, recipeId).state.pendingDishes).toHaveLength(1);
  });

  it('keeps mixed-quality pancake quantities exact, preserving lowest quality and rounding', () => {
    const pancake = RECIPES.find(recipe => recipe.id === 'recipe_corn_pancake')!;
    const selected = [corn('Top', 2), corn('Broken')];
    expect(matchesRecipe(selected, pancake)).toBe(true);
    expect(matchesRecipe([corn('Top', 2)], pancake)).toBe(false);
    expect(matchesRecipe([corn('Top', 4)], pancake)).toBe(false);
    expect(dishQuality(selected)).toBe('Broken');
    expect(dishPrice(selected, pancake)).toBe(267); // 205 * 1.3 = 266.5
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
