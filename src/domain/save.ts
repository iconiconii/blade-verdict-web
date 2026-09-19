import type { BossKind, Quality } from './v2';
import {
  INGREDIENTS,
  RECIPES,
  SHOP_ITEMS,
  addInventory,
  createMetaState,
  type DishInstance,
  type IngredientId,
  type MetaState,
  type OwnedItemStack,
  type ShopItemDefinition,
} from './meta';

/** Increment this only when the persisted shape changes incompatibly. */
export const SAVE_SCHEMA = 1 as const;

export interface SavedWorkshop {
  schema: typeof SAVE_SCHEMA;
  revision: number;
  meta: MetaState;
  tutorialSeen: boolean;
  settledBattleIds: string[];
  discoveredIngredientIds: IngredientId[];
}

type RecordValue = Record<string, unknown>;
const QUALITY_VALUES: readonly Quality[] = ['Broken', 'Normal', 'High', 'Top'];
const INGREDIENT_SET = new Set(INGREDIENTS.map(item => item.id));
const RECIPE_SET = new Set(RECIPES.map(item => item.id));
const DISH_SET = new Set(RECIPES.map(item => item.outputDishId));
const SHOP_MAP = new Map(SHOP_ITEMS.map(item => [item.id, item]));

const fail = (message: string): never => { throw new Error(`存档无效：${message}`); };

function objectAt(value: unknown, path: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${path} 必须是对象`);
  return value as RecordValue;
}

function exactKeys(value: RecordValue, keys: readonly string[], path: string): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${path} 包含未知字段 ${key}`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${path} 缺少字段 ${key}`);
}

function safeInt(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail(`${path} 必须是安全整数且不小于 ${minimum}`);
  return value as number;
}

function text(value: unknown, path: string, nonEmpty = true): string {
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) fail(`${path} 必须是${nonEmpty ? '非空' : ''}字符串`);
  return value as string;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} 必须是布尔值`);
  return value as boolean;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} 必须是数组`);
  return value as unknown[];
}

function quality(value: unknown, path: string): Quality {
  if (typeof value !== 'string' || !QUALITY_VALUES.includes(value as Quality)) fail(`${path} 品质无效`);
  return value as Quality;
}

function ingredient(value: unknown, path: string): IngredientId {
  const id = text(value, path);
  if (!INGREDIENT_SET.has(id as IngredientId)) fail(`${path} 食材无效`);
  return id as IngredientId;
}

function shopItem(value: unknown, path: string): ShopItemDefinition {
  const id = text(value, path);
  const item = SHOP_MAP.get(id);
  if (!item) fail(`${path} 商品无效`);
  return item as ShopItemDefinition;
}

function uniqueStrings(value: unknown, path: string): string[] {
  const values = arrayAt(value, path).map((entry, index) => text(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) fail(`${path} 不能包含重复值`);
  return values;
}

function validateInventory(value: unknown): MetaState['inventory'] {
  const values = arrayAt(value, 'meta.inventory');
  const seen = new Set<string>();
  return values.map((entry, index) => {
    const item = objectAt(entry, `meta.inventory[${index}]`);
    exactKeys(item, ['ingredientId', 'quality', 'count'], `meta.inventory[${index}]`);
    const ingredientId = ingredient(item.ingredientId, `meta.inventory[${index}].ingredientId`);
    const itemQuality = quality(item.quality, `meta.inventory[${index}].quality`);
    const count = safeInt(item.count, `meta.inventory[${index}].count`, 1);
    const key = `${ingredientId}|${itemQuality}`;
    if (seen.has(key)) fail(`meta.inventory[${index}] 存在重复库存堆叠`);
    seen.add(key);
    return { ingredientId, quality: itemQuality, count };
  });
}

function validateDishes(value: unknown): DishInstance[] {
  const values = arrayAt(value, 'meta.pendingDishes');
  const seen = new Set<string>();
  return values.map((entry, index) => {
    const item = objectAt(entry, `meta.pendingDishes[${index}]`);
    exactKeys(item, ['instanceId', 'dishId', 'quality', 'sellPrice'], `meta.pendingDishes[${index}]`);
    const instanceId = text(item.instanceId, `meta.pendingDishes[${index}].instanceId`);
    if (seen.has(instanceId)) fail(`meta.pendingDishes[${index}] 存在重复料理实例`);
    seen.add(instanceId);
    const dishId = text(item.dishId, `meta.pendingDishes[${index}].dishId`);
    if (!DISH_SET.has(dishId)) fail(`meta.pendingDishes[${index}].dishId 料理无效`);
    return {
      instanceId,
      dishId,
      quality: quality(item.quality, `meta.pendingDishes[${index}].quality`),
      sellPrice: safeInt(item.sellPrice, `meta.pendingDishes[${index}].sellPrice`),
    };
  });
}

function validateOwnedItems(value: unknown): OwnedItemStack[] {
  const values = arrayAt(value, 'meta.ownedItems');
  const seen = new Set<string>();
  return values.map((entry, index) => {
    const item = objectAt(entry, `meta.ownedItems[${index}]`);
    exactKeys(item, ['itemId', 'count'], `meta.ownedItems[${index}]`);
    const itemId = text(item.itemId, `meta.ownedItems[${index}].itemId`);
    const definition = SHOP_MAP.get(itemId);
    if (!definition || definition.category !== 'item' || !definition.implemented) fail(`meta.ownedItems[${index}].itemId 不是可持有商品`);
    if (seen.has(itemId)) fail(`meta.ownedItems[${index}] 存在重复商品堆叠`);
    seen.add(itemId);
    return { itemId, count: safeInt(item.count, `meta.ownedItems[${index}].count`, 1) };
  });
}

function validateDishRecords(value: unknown): MetaState['dishRecords'] {
  const values = arrayAt(value, 'meta.dishRecords');
  const seen = new Set<string>();
  return values.map((entry, index) => {
    const item = objectAt(entry, `meta.dishRecords[${index}]`);
    exactKeys(item, ['dishId', 'bestQuality', 'cookCount'], `meta.dishRecords[${index}]`);
    const dishId = text(item.dishId, `meta.dishRecords[${index}].dishId`);
    if (!DISH_SET.has(dishId)) fail(`meta.dishRecords[${index}].dishId 料理无效`);
    if (seen.has(dishId)) fail(`meta.dishRecords[${index}] 存在重复料理记录`);
    seen.add(dishId);
    return {
      dishId,
      bestQuality: quality(item.bestQuality, `meta.dishRecords[${index}].bestQuality`),
      cookCount: safeInt(item.cookCount, `meta.dishRecords[${index}].cookCount`, 1),
    };
  });
}

function validateMeta(value: unknown): MetaState {
  const raw = objectAt(value, 'meta');
  exactKeys(raw, [
    'coins',
    'inventory',
    'pendingDishes',
    'ownedItems',
    'purchasedShopItemIds',
    'unlockedRecipeIds',
    'dishRecords',
    'equippedWeaponId',
    'equippedSkinId',
  ], 'meta');
  const purchased = uniqueStrings(raw.purchasedShopItemIds, 'meta.purchasedShopItemIds');
  const purchasedDefinitions = purchased.map((id, index) => {
    const definition = shopItem(id, `meta.purchasedShopItemIds[${index}]`);
    if (definition.category === 'item' || !definition.implemented) fail(`meta.purchasedShopItemIds[${index}] 不能购买预览商品或消耗品`);
    return definition;
  });
  const unlocked = uniqueStrings(raw.unlockedRecipeIds, 'meta.unlockedRecipeIds');
  for (const id of unlocked) if (!RECIPE_SET.has(id)) fail(`meta.unlockedRecipeIds 包含未知配方 ${id}`);
  const equippedWeaponId = raw.equippedWeaponId === null ? null : text(raw.equippedWeaponId, 'meta.equippedWeaponId');
  const equippedSkinId = raw.equippedSkinId === null ? null : text(raw.equippedSkinId, 'meta.equippedSkinId');
  if (equippedWeaponId !== null) {
    const definition = shopItem(equippedWeaponId, 'meta.equippedWeaponId');
    if (definition.category !== 'weapon' || !purchased.includes(equippedWeaponId)) fail('meta.equippedWeaponId 未购买或类型不匹配');
  }
  if (equippedSkinId !== null) {
    const definition = shopItem(equippedSkinId, 'meta.equippedSkinId');
    if (definition.category !== 'skin' || !purchased.includes(equippedSkinId)) fail('meta.equippedSkinId 未购买或类型不匹配');
  }
  // Keep the lookup above as an explicit validation step. It also makes the
  // ownership rule visible at the boundary instead of relying on UI state.
  void purchasedDefinitions;
  return {
    coins: safeInt(raw.coins, 'meta.coins'),
    inventory: validateInventory(raw.inventory),
    pendingDishes: validateDishes(raw.pendingDishes),
    ownedItems: validateOwnedItems(raw.ownedItems),
    purchasedShopItemIds: purchased,
    unlockedRecipeIds: unlocked,
    dishRecords: validateDishRecords(raw.dishRecords),
    equippedWeaponId,
    equippedSkinId,
  };
}

function cloneMeta(meta: MetaState): MetaState {
  return {
    coins: meta.coins,
    inventory: meta.inventory.map(item => ({ ...item })),
    pendingDishes: meta.pendingDishes.map(item => ({ ...item })),
    ownedItems: meta.ownedItems.map(item => ({ ...item })),
    purchasedShopItemIds: [...meta.purchasedShopItemIds],
    unlockedRecipeIds: [...meta.unlockedRecipeIds],
    dishRecords: meta.dishRecords.map(item => ({ ...item })),
    equippedWeaponId: meta.equippedWeaponId,
    equippedSkinId: meta.equippedSkinId,
  };
}

function cloneSave(save: SavedWorkshop): SavedWorkshop {
  return {
    schema: SAVE_SCHEMA,
    revision: save.revision,
    meta: cloneMeta(save.meta),
    tutorialSeen: save.tutorialSeen,
    settledBattleIds: [...save.settledBattleIds],
    discoveredIngredientIds: [...save.discoveredIngredientIds],
  };
}

function assertSave(save: SavedWorkshop): void {
  const raw = objectAt(save as unknown, 'save');
  exactKeys(raw, ['schema', 'revision', 'meta', 'tutorialSeen', 'settledBattleIds', 'discoveredIngredientIds'], 'save');
  if (raw.schema !== SAVE_SCHEMA) fail(`不支持的存档版本 ${String(raw.schema)}`);
  safeInt(raw.revision, 'revision');
  validateMeta(raw.meta);
  bool(raw.tutorialSeen, 'tutorialSeen');
  const settled = uniqueStrings(raw.settledBattleIds, 'settledBattleIds');
  void settled;
  const discovered = arrayAt(raw.discoveredIngredientIds, 'discoveredIngredientIds');
  const discoveredIds = discovered.map((id, index) => ingredient(id, `discoveredIngredientIds[${index}]`));
  if (new Set(discoveredIds).size !== discoveredIds.length) fail('discoveredIngredientIds 不能包含重复值');
}

/** A first-run save is absent (`null`); malformed non-null data is never reset. */
export function createSave(): SavedWorkshop {
  return {
    schema: SAVE_SCHEMA,
    revision: 0,
    meta: createMetaState(),
    tutorialSeen: false,
    settledBattleIds: [],
    discoveredIngredientIds: [],
  };
}

export function decodeSave(raw: string | null): SavedWorkshop {
  if (raw === null) return createSave();
  if (typeof raw !== 'string') fail('存档内容必须是字符串');
  if (raw.trim() === '') fail('存档内容为空');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    fail('存档不是合法 JSON');
  }
  const object = objectAt(parsed, 'save');
  exactKeys(object, ['schema', 'revision', 'meta', 'tutorialSeen', 'settledBattleIds', 'discoveredIngredientIds'], 'save');
  if (object.schema !== SAVE_SCHEMA) fail(`不支持的存档版本 ${String(object.schema)}`);
  const meta = validateMeta(object.meta);
  const settledBattleIds = uniqueStrings(object.settledBattleIds, 'settledBattleIds');
  const discovered = arrayAt(object.discoveredIngredientIds, 'discoveredIngredientIds');
  const discoveredIngredientIds = discovered.map((id, index) => ingredient(id, `discoveredIngredientIds[${index}]`));
  if (new Set(discoveredIngredientIds).size !== discoveredIngredientIds.length) fail('discoveredIngredientIds 不能包含重复值');
  return {
    schema: SAVE_SCHEMA,
    revision: safeInt(object.revision, 'revision'),
    meta,
    tutorialSeen: bool(object.tutorialSeen, 'tutorialSeen'),
    settledBattleIds,
    discoveredIngredientIds,
  };
}

export function encodeSave(save: SavedWorkshop): string {
  assertSave(save);
  return JSON.stringify(cloneSave(save));
}

/**
 * Settle a battle exactly once by its stable battle id. Failed battles are
 * still recorded (so a retry cannot turn one run into multiple rewards), but
 * only a won battle grants the Unity hosted Top ×3 drop.
 */
export function settleBattle(save: SavedWorkshop, battleId: string, bossKind: BossKind, won: boolean): SavedWorkshop {
  assertSave(save);
  const id = text(battleId, 'battleId');
  if (!id.trim()) fail('battleId 必须是非空字符串');
  if (bossKind !== 'corn' && bossKind !== 'jelly') fail(`未知 Boss 类型 ${String(bossKind)}`);
  if (typeof won !== 'boolean') fail('won 必须是布尔值');
  const next = cloneSave(save);
  if (next.settledBattleIds.includes(id)) return next;
  if (next.revision === Number.MAX_SAFE_INTEGER) fail('revision 已达到上限');
  next.settledBattleIds.push(id);
  if (won) {
    const ingredientId: IngredientId = bossKind === 'corn' ? 'ing_corn' : 'ing_jelly';
    const updatedMeta = addInventory(next.meta, { ingredientId, quality: 'Top', count: 3 });
    next.meta = updatedMeta;
    if (!next.discoveredIngredientIds.includes(ingredientId)) next.discoveredIngredientIds.push(ingredientId);
  }
  next.revision += 1;
  return next;
}
