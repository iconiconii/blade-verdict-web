import { describe, expect, it } from 'vitest';
import { SHOP_ITEMS, addInventory, buy, consumeConsumable, cook, createMetaState } from './meta';
import { beginCooking } from './cookingJobs';
import { SAVE_SCHEMA, createSave, decodeSave, encodeSave, settleBattle, type SavedWorkshop } from './save';

const cleaver = SHOP_ITEMS.find(item => item.id === 'weapon_corn_cleaver')!;

describe('workshop save boundary', () => {
  it('creates and round-trips an empty schema-2 save', () => {
    const initial = createSave();
    expect(initial).toMatchObject({ schema: SAVE_SCHEMA, revision: 0, tutorialSeen: false, settledBattleIds: [], discoveredIngredientIds: [] });
    expect(initial.meta.coins).toBe(0);
    expect(decodeSave(encodeSave(initial))).toEqual(initial);
    expect(decodeSave(null)).toEqual(initial);
  });

  it('rejects malformed JSON, incompatible versions, unknown fields, and missing fields', () => {
    expect(() => decodeSave('not-json')).toThrow(/存档不是合法 JSON/);
    expect(() => decodeSave('')).toThrow(/存档内容为空/);
    expect(() => decodeSave(JSON.stringify({ ...createSave(), schema: 3 }))).toThrow(/不支持的存档版本/);
    expect(() => decodeSave(JSON.stringify({ ...createSave(), extra: true }))).toThrow(/未知字段/);
    const missing = { ...createSave() } as Record<string, unknown>;
    delete missing.meta;
    expect(() => decodeSave(JSON.stringify(missing))).toThrow(/缺少字段 meta/);
  });

  it('strictly validates coins, inventory quality/count, dish price, and nested keys', () => {
    const source = JSON.parse(encodeSave(createSave())) as Record<string, any>;
    source.meta.coins = -1;
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/meta.coins/);
    source.meta.coins = 0;
    source.meta.inventory = [{ ingredientId: 'ing_corn', quality: 'Legendary', count: 1 }];
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/品质无效/);
    source.meta.inventory = [{ ingredientId: 'ing_corn', quality: 'Top', count: 0 }];
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/count/);
    source.meta.inventory = [];
    source.meta.pendingDishes = [{ instanceId: 'dish-1', dishId: 'dish_corn_toast', quality: 'Top', sellPrice: -2 }];
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/sellPrice/);
    source.meta.pendingDishes = [];
    source.meta.extra = true;
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/meta 包含未知字段/);
  });

  it('requires purchased ownership before accepting equipped equipment', () => {
    const source = JSON.parse(encodeSave(createSave())) as Record<string, any>;
    source.meta.equippedWeaponId = cleaver.id;
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/未购买/);
    const purchasedState = buy(createMetaState({ coins: cleaver.cost }), cleaver.id).state;
    const save: SavedWorkshop = { ...createSave(), meta: purchasedState };
    expect(decodeSave(encodeSave(save)).meta.equippedWeaponId).toBe(cleaver.id);
    source.meta = purchasedState;
    source.meta.purchasedShopItemIds = ['weapon_jelly_fork'];
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/预览商品/);
  });

  it('settles a victory once and grants the matching Top ×3 ingredient', () => {
    const first = settleBattle(createSave(), 'battle-corn-1', 'corn', true);
    expect(first.revision).toBe(1);
    expect(first.meta.inventory).toEqual([{ ingredientId: 'ing_corn', quality: 'Top', count: 3 }]);
    expect(first.discoveredIngredientIds).toEqual(['ing_corn']);
    expect(first.clearedBossIds).toEqual(['corn']);
    const retry = settleBattle(first, 'battle-corn-1', 'corn', true);
    expect(retry).toEqual(first);
    expect(retry.meta.inventory[0].count).toBe(3);
  });

  it('records defeats without loot, then allows a later distinct victory', () => {
    const defeat = settleBattle(createSave(), 'battle-jelly-1', 'jelly', false);
    expect(defeat.revision).toBe(1);
    expect(defeat.meta.inventory).toEqual([]);
    expect(defeat.settledBattleIds).toEqual(['battle-jelly-1']);
    expect(defeat.clearedBossIds).toEqual([]);
    const victory = settleBattle(defeat, 'battle-jelly-2', 'jelly', true);
    expect(victory.meta.inventory).toEqual([{ ingredientId: 'ing_jelly', quality: 'Top', count: 3 }]);
    expect(victory.discoveredIngredientIds).toEqual(['ing_jelly']);
  });

  it('does not mutate the source save and rejects invalid settlement input', () => {
    const save = createSave();
    const settled = settleBattle(save, 'corn-1', 'corn', true);
    expect(save.meta.inventory).toEqual([]);
    expect(save.settledBattleIds).toEqual([]);
    expect(() => settleBattle(save, '', 'corn', true)).toThrow(/battleId/);
    expect(() => settleBattle(save, 'corn-2', 'unknown' as never, true)).toThrow(/Boss/);
    expect(() => settleBattle(save, 'corn-3', 'corn', 'yes' as never)).toThrow(/布尔/);
    expect(settled.meta.inventory).not.toBe(save.meta.inventory);
  });

  it('rejects duplicate inventory and discovered ids instead of silently merging', () => {
    const source = JSON.parse(encodeSave(createSave())) as Record<string, any>;
    source.meta.inventory = [
      { ingredientId: 'ing_corn', quality: 'Top', count: 1 },
      { ingredientId: 'ing_corn', quality: 'Top', count: 2 },
    ];
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/重复库存/);
    source.meta.inventory = [];
    source.discoveredIngredientIds = ['ing_corn', 'ing_corn'];
    expect(() => decodeSave(JSON.stringify(source))).toThrow(/discoveredIngredientIds/);
  });

  it('migrates a real schema-1 shape without losing any existing economy fields', () => {
    let meta = buy(createMetaState({ coins: 800 }), 'weapon_corn_cleaver').state;
    meta = addInventory(meta, { ingredientId: 'corn', quality: 'High', count: 2 });
    meta = cook(meta, [{ ingredientId: 'corn', quality: 'High', count: 1 }], 'old-dish').state;
    const legacy = {
      schema: 1,
      revision: 17,
      meta,
      tutorialSeen: true,
      settledBattleIds: ['old-cabbage-win', 'old-jelly-win'],
      discoveredIngredientIds: ['ing_cabbage', 'ing_jelly'],
    };
    const migrated = decodeSave(JSON.stringify(legacy));
    expect(migrated).toEqual({ ...legacy, schema: 2, clearedBossIds: ['corn', 'carrot', 'cabbage', 'jelly'], cookingJob: null });
    expect(migrated.meta).toEqual(meta);
    expect(decodeSave(encodeSave(migrated))).toEqual(migrated);
  });

  it('rejects malformed legacy data rather than resetting it during migration', () => {
    const legacy: Record<string, unknown> = { ...createSave(), schema: 1 };
    delete legacy.clearedBossIds;
    delete legacy.cookingJob;
    legacy.discoveredIngredientIds = ['ing_not_real'];
    expect(() => decodeSave(JSON.stringify(legacy))).toThrow(/食材无效/);
    legacy.discoveredIngredientIds = [];
    legacy.meta = { ...createMetaState(), coins: -1 };
    expect(() => decodeSave(JSON.stringify(legacy))).toThrow(/meta.coins/);
    legacy.meta = createMetaState();
    legacy.unexpected = true;
    expect(() => decodeSave(JSON.stringify(legacy))).toThrow(/未知字段/);
  });

  it('round-trips consumable stock and rejects attempts to equip them as weapons or skins', () => {
    let meta = buy(createMetaState({ coins: 1000 }), 'upgrade_tomato_bomb').state;
    meta = buy(meta, 'upgrade_jelly_cooker').state;
    const save = { ...createSave(), meta };
    expect(decodeSave(encodeSave(save))).toEqual(save);
    expect(() => encodeSave({ ...save, meta: { ...meta, equippedWeaponId: 'upgrade_tomato_bomb' } })).toThrow(/类型不匹配/);
    expect(() => encodeSave({ ...save, meta: { ...meta, equippedSkinId: 'upgrade_jelly_cooker' } })).toThrow(/类型不匹配/);
  });

  it('migrates each old permanent purchase into one consumable and never grants it again after use', () => {
    const old = {
      ...createSave(),
      revision: 11,
      meta: { ...createMetaState({ coins: 333 }), purchasedShopItemIds: ['upgrade_tomato_bomb', 'upgrade_jelly_cooker'] },
    };
    const migrated = decodeSave(JSON.stringify(old));
    expect(migrated.revision).toBe(11);
    expect(migrated.meta.coins).toBe(333);
    expect(migrated.meta.purchasedShopItemIds).toEqual([]);
    expect(migrated.meta.ownedItems).toEqual([
      { itemId: 'upgrade_tomato_bomb', count: 1 },
      { itemId: 'upgrade_jelly_cooker', count: 1 },
    ]);
    expect(decodeSave(encodeSave(migrated))).toEqual(migrated);
    const consumed = { ...migrated, meta: consumeConsumable(consumeConsumable(migrated.meta, 'upgrade_tomato_bomb'), 'upgrade_jelly_cooker') };
    expect(decodeSave(encodeSave(consumed)).meta.ownedItems).toEqual([]);
    expect(() => encodeSave(old)).toThrow(/不能购买预览商品或消耗品/);
  });

  it('keeps existing consumable stock and an active pot intact when migrating old purchase markers', () => {
    const supplied = { ...createSave(), meta: buy(addInventory(createMetaState({ coins: 240 }), { ingredientId: 'corn', quality: 'Top', count: 1 }), 'upgrade_jelly_cooker').state };
    const active = beginCooking(supplied, 'recipe_toast', [{ ingredientId: 'corn', quality: 'Top', count: 1 }], 'legacy-active', 1000);
    const legacy = { ...active, meta: { ...active.meta, ownedItems: [{ itemId: 'upgrade_tomato_bomb', count: 2 }], purchasedShopItemIds: ['upgrade_tomato_bomb', 'upgrade_jelly_cooker'] } };
    const migrated = decodeSave(JSON.stringify(legacy));
    expect(migrated.meta.ownedItems).toEqual([
      { itemId: 'upgrade_tomato_bomb', count: 3 },
      { itemId: 'upgrade_jelly_cooker', count: 1 },
    ]);
    expect(migrated.cookingJob).toEqual(active.cookingJob);
    expect(migrated.cookingJob!.finishAt).toBe(23_500);
    expect(decodeSave(encodeSave(migrated))).toEqual(migrated);
  });

  it('also migrates legacy schema-1 upgrade ownership without accepting other item purchase markers', () => {
    const legacy = {
      schema: 1, revision: 2,
      meta: createMetaState({ purchasedShopItemIds: ['upgrade_tomato_bomb'] }),
      tutorialSeen: true, settledBattleIds: [], discoveredIngredientIds: [],
    };
    expect(decodeSave(JSON.stringify(legacy)).meta.ownedItems).toEqual([{ itemId: 'upgrade_tomato_bomb', count: 1 }]);
    legacy.meta.purchasedShopItemIds = ['item_lucky_spice'];
    expect(() => decodeSave(JSON.stringify(legacy))).toThrow(/预览商品或消耗品/);
  });

  it('strictly validates new progress and active cooking snapshots', () => {
    expect(() => encodeSave({ ...createSave(), clearedBossIds: ['corn', 'corn'] })).toThrow(/重复值/);
    expect(() => encodeSave({ ...createSave(), clearedBossIds: ['unknown' as never] })).toThrow(/Boss 类型无效/);
    const stocked = { ...createSave(), meta: addInventory(createMetaState(), { ingredientId: 'corn', quality: 'Top', count: 1 }) };
    const cooking = beginCooking(stocked, 'recipe_toast', [{ ingredientId: 'corn', quality: 'Top', count: 1 }], 'one', 1000);
    expect(decodeSave(encodeSave(cooking))).toEqual(cooking);
    const job = cooking.cookingJob!;
    expect(() => encodeSave({ ...cooking, cookingJob: { ...job, finishAt: 2000 } })).toThrow(/时长无效/);
    expect(() => encodeSave({ ...cooking, cookingJob: { ...job, startedAt: -1 } })).toThrow(/startedAt/);
    expect(() => encodeSave({ ...cooking, cookingJob: { ...job, dish: { ...job.dish, sellPrice: 121 } } })).toThrow(/快照/);
    expect(() => encodeSave({ ...cooking, cookingJob: { ...job, dish: { ...job.dish, dishId: 'dish_jelly_pudding' } } })).toThrow(/快照/);
    expect(() => encodeSave({ ...cooking, cookingJob: { ...job, ingredients: [{ ...job.ingredients[0], count: 2 }] } })).toThrow(/食材与配方/);
    expect(() => encodeSave({ ...cooking, meta: { ...cooking.meta, pendingDishes: [job.dish] } })).toThrow(/同时出现在菜架/);
  });
});

