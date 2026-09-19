import type { Quality } from './v2';

/**
 * The out-of-battle economy deliberately has its own ids.  The battle layer
 * can still use the shorter `corn`/`jelly` labels; `ingredientIdForBoss` is
 * the single conversion point when a drop is added to the pantry.
 */
export type IngredientId = 'ing_corn' | 'ing_jelly';
export type BossIngredientId = 'corn' | 'jelly';

export const QUALITY_ORDER: readonly Quality[] = ['Broken', 'Normal', 'High', 'Top'];
export const INGREDIENT_IDS: readonly IngredientId[] = ['ing_corn', 'ing_jelly'];

export interface IngredientDefinition {
  id: IngredientId;
  bossKind: BossIngredientId;
  name: string;
  basePrice: Readonly<Record<Quality, number>>;
}

export interface InventoryStack {
  ingredientId: IngredientId;
  quality: Quality;
  count: number;
}

export interface IngredientSelection {
  /** Accepts battle shorthand (`corn`/`jelly`) and canonical save ids. */
  ingredientId: IngredientId | BossIngredientId;
  quality: Quality;
  count: number;
}

export interface RecipeDefinition {
  id: string;
  outputDishId: string;
  name: string;
  requirements: Readonly<Partial<Record<IngredientId, number>>>;
  multiplier: number;
}

export type ShopCategory = 'weapon' | 'skin' | 'item';

export interface ShopItemDefinition {
  id: string;
  name: string;
  category: ShopCategory;
  cost: number;
  implemented: boolean;
  /** Applied only while the item is equipped.  Preview entries are always 0. */
  verdictDamageBonus: number;
  description: string;
}

export interface DishInstance {
  instanceId: string;
  dishId: string;
  quality: Quality;
  sellPrice: number;
}

export interface OwnedItemStack {
  itemId: string;
  count: number;
}

export interface DishRecord {
  dishId: string;
  bestQuality: Quality;
  cookCount: number;
}

/**
 * Serializable state for all systems outside a battle.  Every public helper
 * below returns a new value; callers can safely keep an old snapshot for an
 * undo button or a React transition.
 */
export interface MetaState {
  coins: number;
  inventory: InventoryStack[];
  pendingDishes: DishInstance[];
  ownedItems: OwnedItemStack[];
  purchasedShopItemIds: string[];
  unlockedRecipeIds: string[];
  dishRecords: DishRecord[];
  equippedWeaponId: string | null;
  equippedSkinId: string | null;
}

export interface CookResult {
  state: MetaState;
  dish: DishInstance;
  recipe: RecipeDefinition;
}

export interface SellResult {
  state: MetaState;
  earned: number;
  dish: DishInstance;
}

export interface BuyResult {
  state: MetaState;
  item: ShopItemDefinition;
}

export const BASE_PRICES: Readonly<Record<Quality, number>> = Object.freeze({
  Broken: 5,
  Normal: 15,
  High: 40,
  Top: 100,
});

const freezeRecord = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

export const INGREDIENTS: readonly IngredientDefinition[] = Object.freeze([
  { id: 'ing_corn', bossKind: 'corn', name: '玉米粒', basePrice: BASE_PRICES },
  { id: 'ing_jelly', bossKind: 'jelly', name: '果冻核', basePrice: BASE_PRICES },
]);

export const RECIPES: readonly RecipeDefinition[] = Object.freeze([
  {
    id: 'recipe_toast',
    outputDishId: 'dish_corn_toast',
    name: '烤玉米片',
    requirements: freezeRecord({ ing_corn: 1 }),
    multiplier: 1.2,
  },
  {
    id: 'recipe_pudding',
    outputDishId: 'dish_jelly_pudding',
    name: '果冻布丁',
    requirements: freezeRecord({ ing_jelly: 1 }),
    multiplier: 1.2,
  },
  {
    id: 'recipe_corn_jelly',
    outputDishId: 'dish_corn_jelly',
    name: '玉米果冻盅',
    requirements: freezeRecord({ ing_corn: 1, ing_jelly: 1 }),
    multiplier: 1.5,
  },
]);

/** The P0 catalog.  Unimplemented entries are previews and cannot be bought. */
export const SHOP_ITEMS: readonly ShopItemDefinition[] = Object.freeze([
  {
    id: 'weapon_corn_cleaver',
    name: '玉米斩骨刀',
    category: 'weapon',
    cost: 120,
    implemented: true,
    verdictDamageBonus: 8,
    description: '每次裁决结算后追加 8 点伤害',
  },
  {
    id: 'weapon_jelly_fork',
    name: '凝胶餐叉',
    category: 'weapon',
    cost: 160,
    implemented: false,
    verdictDamageBonus: 0,
    description: 'P1 预览：尚未生效',
  },
  {
    id: 'skin_head_chef',
    name: '深渊主厨',
    category: 'skin',
    cost: 180,
    implemented: false,
    verdictDamageBonus: 0,
    description: 'P1 预览：尚未生效',
  },
  {
    id: 'skin_corn_guard',
    name: '玉米守卫',
    category: 'skin',
    cost: 220,
    implemented: false,
    verdictDamageBonus: 0,
    description: 'P1 预览：尚未生效',
  },
  {
    id: 'item_lucky_spice',
    name: '幸运香辛料',
    category: 'item',
    cost: 35,
    implemented: false,
    verdictDamageBonus: 0,
    description: 'P1 预览：尚未生效',
  },
  {
    id: 'item_field_ration',
    name: '探险口粮',
    category: 'item',
    cost: 45,
    implemented: false,
    verdictDamageBonus: 0,
    description: 'P1 预览：尚未生效',
  },
]);

// Friendly aliases for callers that use the terms from the Unity inspector.
export const ingredients = INGREDIENTS;
export const basePrices = BASE_PRICES;

const cloneStack = (stack: InventoryStack): InventoryStack => ({ ...stack });
const cloneDish = (dish: DishInstance): DishInstance => ({ ...dish });
const cloneState = (state: MetaState): MetaState => ({
  coins: state.coins,
  inventory: state.inventory.map(cloneStack),
  pendingDishes: state.pendingDishes.map(cloneDish),
  ownedItems: state.ownedItems.map(item => ({ ...item })),
  purchasedShopItemIds: [...state.purchasedShopItemIds],
  unlockedRecipeIds: [...state.unlockedRecipeIds],
  dishRecords: state.dishRecords.map(record => ({ ...record })),
  equippedWeaponId: state.equippedWeaponId,
  equippedSkinId: state.equippedSkinId,
});

/** Initial state intentionally contains no coins or ingredients. */
export const createMetaState = (overrides: Partial<MetaState> = {}): MetaState => ({
  coins: overrides.coins ?? 0,
  inventory: (overrides.inventory ?? []).map(cloneStack),
  pendingDishes: (overrides.pendingDishes ?? []).map(cloneDish),
  ownedItems: (overrides.ownedItems ?? []).map(item => ({ ...item })),
  purchasedShopItemIds: [...(overrides.purchasedShopItemIds ?? [])],
  unlockedRecipeIds: [...(overrides.unlockedRecipeIds ?? [])],
  dishRecords: (overrides.dishRecords ?? []).map(record => ({ ...record })),
  equippedWeaponId: overrides.equippedWeaponId ?? null,
  equippedSkinId: overrides.equippedSkinId ?? null,
});

/** Return a defensive inventory snapshot. */
export const inventory = (state: MetaState): InventoryStack[] => state.inventory.map(cloneStack);

/** Return catalog copies, so a UI cannot mutate the rule constants. */
export const recipes = (): RecipeDefinition[] => RECIPES.map(recipe => ({ ...recipe, requirements: { ...recipe.requirements } }));
export const shop = (): ShopItemDefinition[] => SHOP_ITEMS.map(item => ({ ...item }));

export function ingredientIdForBoss(value: IngredientId | BossIngredientId): IngredientId {
  if (value === 'corn' || value === 'ing_corn') return 'ing_corn';
  if (value === 'jelly' || value === 'ing_jelly') return 'ing_jelly';
  throw new Error(`Unknown ingredient: ${String(value)}`);
}

function assertQuality(value: Quality): void {
  if (!QUALITY_ORDER.includes(value)) throw new Error(`Unknown quality: ${String(value)}`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}

function findIngredient(id: IngredientId): IngredientDefinition {
  const ingredient = INGREDIENTS.find(entry => entry.id === id);
  if (!ingredient) throw new Error(`Unknown ingredient: ${id}`);
  return ingredient;
}

function findShopItem(id: string): ShopItemDefinition {
  const item = SHOP_ITEMS.find(entry => entry.id === id);
  if (!item) throw new Error(`Unknown shop item: ${id}`);
  return item;
}

function qualityRank(quality: Quality): number {
  assertQuality(quality);
  return QUALITY_ORDER.indexOf(quality);
}

/** Lowest quality among the selected ingredients. */
export function dishQuality(selected: readonly IngredientSelection[]): Quality {
  if (selected.length === 0) throw new Error('At least one ingredient is required');
  selected.forEach(item => {
    ingredientIdForBoss(item.ingredientId);
    assertQuality(item.quality);
    assertPositiveInteger(item.count, 'Ingredient count');
  });
  return selected.reduce((lowest, item) => qualityRank(item.quality) < qualityRank(lowest) ? item.quality : lowest, 'Top' as Quality);
}

/**
 * Strictly compare the total quantities by ingredient id, including selections
 * split across qualities. Extra ingredients and under/over-counts do not match.
 */
export function matchesRecipe(selected: readonly IngredientSelection[], recipe: RecipeDefinition): boolean {
  const actual = new Map<IngredientId, number>();
  for (const item of selected) {
    // Matching is a TryMatch-style predicate: malformed selections simply do
    // not match.  The mutating operations (add/remove/cook) still throw a
    // descriptive error when they receive the same malformed input.
    try {
      const id = ingredientIdForBoss(item.ingredientId);
      assertPositiveInteger(item.count, 'Ingredient count');
      assertQuality(item.quality);
      actual.set(id, (actual.get(id) ?? 0) + item.count);
    } catch {
      return false;
    }
  }
  const requiredEntries = Object.entries(recipe.requirements) as [IngredientId, number][];
  if (actual.size !== requiredEntries.length) return false;
  return requiredEntries.every(([id, count]) => actual.get(id) === count);
}

/** Alias matching the older cooking domain helper. */
export const matches = matchesRecipe;

/** Round to nearest integer, with exact halves away from zero. */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Price must be finite');
  const absolute = Math.abs(value);
  const rounded = Math.floor(absolute + 0.5);
  return value < 0 ? -rounded : rounded;
}

export function dishPrice(selected: readonly IngredientSelection[], recipe: RecipeDefinition): number {
  if (!matchesRecipe(selected, recipe)) throw new Error('Selected ingredients do not match recipe');
  const raw = selected.reduce((total, item) => total + findIngredient(ingredientIdForBoss(item.ingredientId)).basePrice[item.quality] * item.count, 0) * recipe.multiplier;
  return roundHalfAwayFromZero(raw);
}

export const sellPrice = dishPrice;

function getCount(stacks: readonly InventoryStack[], ingredientId: IngredientId, quality: Quality): number {
  return stacks.find(stack => stack.ingredientId === ingredientId && stack.quality === quality)?.count ?? 0;
}

export function inventoryCount(state: MetaState, ingredientId: IngredientId | BossIngredientId, quality?: Quality): number {
  const id = ingredientIdForBoss(ingredientId);
  if (quality !== undefined) {
    assertQuality(quality);
    return getCount(state.inventory, id, quality);
  }
  return state.inventory.filter(stack => stack.ingredientId === id).reduce((sum, stack) => sum + stack.count, 0);
}

/** Add a battle drop; duplicate stacks are coalesced immutably. */
export function addInventory(state: MetaState, entry: IngredientSelection): MetaState {
  const id = ingredientIdForBoss(entry.ingredientId);
  assertQuality(entry.quality);
  assertPositiveInteger(entry.count, 'Ingredient count');
  findIngredient(id);
  const next = cloneState(state);
  const existing = next.inventory.find(stack => stack.ingredientId === id && stack.quality === entry.quality);
  if (existing) {
    assertPositiveInteger(existing.count + entry.count, 'Total ingredient count');
    existing.count += entry.count;
  }
  else next.inventory.push({ ingredientId: id, quality: entry.quality, count: entry.count });
  return next;
}

/** Remove an exact quality stack, throwing instead of creating negative stock. */
export function removeInventory(state: MetaState, entry: IngredientSelection): MetaState {
  const id = ingredientIdForBoss(entry.ingredientId);
  assertQuality(entry.quality);
  assertPositiveInteger(entry.count, 'Ingredient count');
  const next = cloneState(state);
  const index = next.inventory.findIndex(stack => stack.ingredientId === id && stack.quality === entry.quality);
  if (index < 0 || next.inventory[index].count < entry.count) throw new Error('Insufficient inventory');
  next.inventory[index].count -= entry.count;
  if (next.inventory[index].count === 0) next.inventory.splice(index, 1);
  return next;
}

function selectedAvailable(state: MetaState, selected: readonly IngredientSelection[]): void {
  const requested = new Map<string, number>();
  for (const item of selected) {
    const id = ingredientIdForBoss(item.ingredientId);
    assertQuality(item.quality);
    assertPositiveInteger(item.count, 'Ingredient count');
    const key = `${id}|${item.quality}`;
    requested.set(key, (requested.get(key) ?? 0) + item.count);
  }
  for (const [key, count] of requested) {
    const [id, quality] = key.split('|') as [IngredientId, Quality];
    if (getCount(state.inventory, id, quality) < count) throw new Error('Insufficient inventory');
  }
}

function recipeForSelection(selected: readonly IngredientSelection[]): RecipeDefinition {
  const recipe = RECIPES.find(candidate => matchesRecipe(selected, candidate));
  if (!recipe) throw new Error('No strict recipe matches selected ingredients');
  return recipe;
}

export type CookingPreview =
  | { canCook: true; recipe: RecipeDefinition; quality: Quality; sellPrice: number; failureReason: '' }
  | { canCook: false; failureReason: string };

/** The non-throwing counterpart to cook(), suitable for the recipe preview UI. */
export function previewCooking(state: MetaState, selected: readonly IngredientSelection[]): CookingPreview {
  if (!selected.length) return { canCook: false, failureReason: '请选择食材' };
  try {
    selectedAvailable(state, selected);
    const recipe = recipeForSelection(selected);
    return { canCook: true, recipe: { ...recipe, requirements: { ...recipe.requirements } }, quality: dishQuality(selected), sellPrice: dishPrice(selected, recipe), failureReason: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { canCook: false, failureReason: message === 'Insufficient inventory' ? '库存不足' : message === 'No strict recipe matches selected ingredients' ? '没有匹配的严格配方' : '食材或数量无效' };
  }
}

/** Consume ingredients and place one immutable dish in the pending-sales list. */
export function cook(state: MetaState, selected: readonly IngredientSelection[], instanceId?: string): CookResult {
  if (instanceId === undefined) {
    let sequence = state.pendingDishes.length + 1;
    while (state.pendingDishes.some(dish => dish.instanceId === `dish-${sequence}`)) sequence += 1;
    instanceId = `dish-${sequence}`;
  }
  if (!instanceId.trim()) throw new Error('Dish instance id is required');
  if (state.pendingDishes.some(dish => dish.instanceId === instanceId)) throw new Error('Dish instance id already exists');
  if (selected.length === 0) throw new Error('At least one ingredient is required');
  selectedAvailable(state, selected);
  const recipe = recipeForSelection(selected);
  let next = cloneState(state);
  for (const item of selected) next = removeInventory(next, item);
  const dish: DishInstance = { instanceId, dishId: recipe.outputDishId, quality: dishQuality(selected), sellPrice: dishPrice(selected, recipe) };
  next.pendingDishes.push(dish);
  if (!next.unlockedRecipeIds.includes(recipe.id)) next.unlockedRecipeIds.push(recipe.id);
  const record = next.dishRecords.find(value => value.dishId === dish.dishId);
  if (record) {
    record.cookCount += 1;
    if (qualityRank(dish.quality) > qualityRank(record.bestQuality)) record.bestQuality = dish.quality;
  } else next.dishRecords.push({ dishId: dish.dishId, bestQuality: dish.quality, cookCount: 1 });
  return { state: next, dish: cloneDish(dish), recipe: { ...recipe, requirements: { ...recipe.requirements } } };
}

/** Sell one pending dish. */
export function sell(state: MetaState, instance: string | Pick<DishInstance, 'instanceId'>): SellResult {
  const instanceId = typeof instance === 'string' ? instance : instance.instanceId;
  const index = state.pendingDishes.findIndex(dish => dish.instanceId === instanceId);
  if (index < 0) throw new Error(`Unknown pending dish: ${instanceId}`);
  const next = cloneState(state);
  const [dish] = next.pendingDishes.splice(index, 1);
  next.coins += dish.sellPrice;
  return { state: next, earned: dish.sellPrice, dish: cloneDish(dish) };
}

/** Sell every pending dish in one pure operation. */
export function sellAll(state: MetaState): { state: MetaState; earned: number } {
  const next = cloneState(state);
  const earned = next.pendingDishes.reduce((total, dish) => total + dish.sellPrice, 0);
  next.pendingDishes = [];
  next.coins += earned;
  return { state: next, earned };
}

/** Buy and auto-equip the implemented P0 cleaver.  Consumables are not yet active. */
export function buy(state: MetaState, itemId: string): BuyResult {
  const item = findShopItem(itemId);
  if (!item.implemented) throw new Error('Shop item is a preview and cannot be purchased');
  if (item.category !== 'item' && state.purchasedShopItemIds.includes(item.id)) throw new Error('Shop item already purchased');
  if (state.coins < item.cost) throw new Error('Not enough coins');
  const next = cloneState(state);
  next.coins -= item.cost;
  if (item.category === 'item') {
    const owned = next.ownedItems.find(value => value.itemId === item.id);
    if (owned) owned.count += 1;
    else next.ownedItems.push({ itemId: item.id, count: 1 });
  } else {
    next.purchasedShopItemIds.push(item.id);
    if (item.category === 'weapon') next.equippedWeaponId = item.id;
    if (item.category === 'skin') next.equippedSkinId = item.id;
  }
  return { state: next, item: { ...item } };
}

export const purchase = buy;
export const cookDish = cook;
export const sellDish = sell;

/** Equip a previously purchased weapon/skin without mutating the snapshot. */
export function equip(state: MetaState, itemId: string): MetaState {
  const item = findShopItem(itemId);
  if (item.category === 'item') throw new Error('Consumable items cannot be equipped');
  if (!state.purchasedShopItemIds.includes(item.id)) throw new Error('Shop item is not owned');
  const next = cloneState(state);
  if (item.category === 'weapon') next.equippedWeaponId = item.id;
  else next.equippedSkinId = item.id;
  return next;
}

export const equippedVerdictDamageBonus = (state: MetaState): number => {
  if (!state.equippedWeaponId) return 0;
  return findShopItem(state.equippedWeaponId).verdictDamageBonus;
};
