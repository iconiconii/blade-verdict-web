import type { BossKind } from '../../domain/v2';

const spriteMonsters:readonly BossKind[]=['corn','carrot','cabbage','tomato','jelly'];

/** All current monsters have supplied frames; keep the legacy scene as a fallback. */
export function battleVisualMode(bossKind:BossKind):'sprite'|'three'{
  return spriteMonsters.includes(bossKind)?'sprite':'three';
}
