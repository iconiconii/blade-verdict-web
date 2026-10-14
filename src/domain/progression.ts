import type { IngredientId } from './meta';
import type { SavedWorkshop } from './save';
import type { BossKind } from './v2';

export const VEGETABLE_BOSS_ORDER: readonly BossKind[] = ['corn', 'carrot', 'cabbage', 'tomato'];
export function nextBossAfter(boss:BossKind):BossKind|null {
  const index=VEGETABLE_BOSS_ORDER.indexOf(boss);
  return index<0?null:VEGETABLE_BOSS_ORDER[index+1]??null;
}
export type MonsterProgress = 'locked' | 'available' | 'cleared';

/** Unlocks depend on permanent clear records, never on remaining ingredients. */
export function monsterProgress(save: Pick<SavedWorkshop, 'clearedBossIds'>, boss: BossKind): MonsterProgress {
  if (save.clearedBossIds.includes(boss)) return 'cleared';
  if (boss === 'jelly') return 'available';
  const index = VEGETABLE_BOSS_ORDER.indexOf(boss);
  if (index < 0) return 'locked';
  return index === 0 || save.clearedBossIds.includes(VEGETABLE_BOSS_ORDER[index - 1]) ? 'available' : 'locked';
}

export function canChallengeBoss(save: Pick<SavedWorkshop, 'clearedBossIds'>, boss: BossKind): boolean {
  return monsterProgress(save, boss) !== 'locked';
}

/** Legacy releases allowed any boss. Preserve access through their highest clear. */
export function migrateDiscoveredProgress(discovered: readonly IngredientId[]): BossKind[] {
  let highest = -1;
  for (let index = 0; index < VEGETABLE_BOSS_ORDER.length; index += 1) {
    if (discovered.includes(`ing_${VEGETABLE_BOSS_ORDER[index]}` as IngredientId)) highest = index;
  }
  const cleared = VEGETABLE_BOSS_ORDER.slice(0, highest + 1);
  if (discovered.includes('ing_jelly')) cleared.push('jelly');
  return cleared;
}
