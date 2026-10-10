import { describe, expect, it } from 'vitest';
import { cook } from './meta';
import { canChallengeBoss, migrateDiscoveredProgress, monsterProgress, VEGETABLE_BOSS_ORDER } from './progression';
import { createSave, settleBattle } from './save';

describe('permanent vegetable challenge progression', () => {
  it('starts with only corn and legacy jelly available', () => {
    const save = createSave();
    expect(VEGETABLE_BOSS_ORDER.map(boss => monsterProgress(save, boss))).toEqual(['available', 'locked', 'locked', 'locked']);
    expect(canChallengeBoss(save, 'jelly')).toBe(true);
    expect(canChallengeBoss(save, 'carrot')).toBe(false);
  });

  it('clears one vegetable and unlocks its successor, with repeatable completed battles', () => {
    let save = createSave();
    for (let index = 0; index < VEGETABLE_BOSS_ORDER.length; index += 1) {
      const boss = VEGETABLE_BOSS_ORDER[index];
      expect(canChallengeBoss(save, boss)).toBe(true);
      save = settleBattle(save, `win-${boss}`, boss, true);
      expect(monsterProgress(save, boss)).toBe('cleared');
      expect(canChallengeBoss(save, boss)).toBe(true);
      if (index + 1 < VEGETABLE_BOSS_ORDER.length) expect(monsterProgress(save, VEGETABLE_BOSS_ORDER[index + 1])).toBe('available');
    }
    expect(save.clearedBossIds).toEqual(VEGETABLE_BOSS_ORDER);
  });

  it('never unlocks after a defeat or a repeated contradictory settlement', () => {
    const lost = settleBattle(createSave(), 'lost', 'corn', false);
    expect(monsterProgress(lost, 'carrot')).toBe('locked');
    expect(settleBattle(lost, 'lost', 'corn', true)).toEqual(lost);
    expect(lost.clearedBossIds).toEqual([]);
  });

  it('does not relock progress after every dropped ingredient has been consumed', () => {
    let save = settleBattle(createSave(), 'win', 'corn', true);
    save = { ...save, meta: cook(save.meta, [{ ingredientId: 'corn', quality: 'Top', count: 3 }], 'pancake').state };
    expect(save.meta.inventory).toEqual([]);
    expect(monsterProgress(save, 'corn')).toBe('cleared');
    expect(monsterProgress(save, 'carrot')).toBe('available');
  });

  it('migrates the highest legacy vegetable clear and keeps jelly independent', () => {
    expect(migrateDiscoveredProgress([])).toEqual([]);
    expect(migrateDiscoveredProgress(['ing_jelly'])).toEqual(['jelly']);
    expect(migrateDiscoveredProgress(['ing_carrot'])).toEqual(['corn', 'carrot']);
    expect(migrateDiscoveredProgress(['ing_tomato'])).toEqual(['corn', 'carrot', 'cabbage', 'tomato']);
  });
});
