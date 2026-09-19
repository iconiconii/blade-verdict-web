import { describe, expect, it } from 'vitest';
import { SHOP_ITEMS, buy, createMetaState } from './meta';
import { SAVE_SCHEMA, createSave, decodeSave, encodeSave, settleBattle, type SavedWorkshop } from './save';

const cleaver = SHOP_ITEMS.find(item => item.id === 'weapon_corn_cleaver')!;

describe('workshop save boundary', () => {
  it('creates and round-trips an empty schema-1 save', () => {
    const initial = createSave();
    expect(initial).toMatchObject({ schema: SAVE_SCHEMA, revision: 0, tutorialSeen: false, settledBattleIds: [], discoveredIngredientIds: [] });
    expect(initial.meta.coins).toBe(0);
    expect(decodeSave(encodeSave(initial))).toEqual(initial);
    expect(decodeSave(null)).toEqual(initial);
  });

  it('rejects malformed JSON, incompatible versions, unknown fields, and missing fields', () => {
    expect(() => decodeSave('not-json')).toThrow(/存档不是合法 JSON/);
    expect(() => decodeSave('')).toThrow(/存档内容为空/);
    expect(() => decodeSave(JSON.stringify({ ...createSave(), schema: 2 }))).toThrow(/不支持的存档版本/);
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
    const retry = settleBattle(first, 'battle-corn-1', 'corn', true);
    expect(retry).toEqual(first);
    expect(retry.meta.inventory[0].count).toBe(3);
  });

  it('records defeats without loot, then allows a later distinct victory', () => {
    const defeat = settleBattle(createSave(), 'battle-jelly-1', 'jelly', false);
    expect(defeat.revision).toBe(1);
    expect(defeat.meta.inventory).toEqual([]);
    expect(defeat.settledBattleIds).toEqual(['battle-jelly-1']);
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
});

