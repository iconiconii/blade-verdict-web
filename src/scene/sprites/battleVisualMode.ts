import type { BossKind } from '../../domain/v2';

/** Tomato remains on its existing 3D rig until its action frames are supplied. */
export function battleVisualMode(bossKind:BossKind):'sprite'|'three'{
  return bossKind==='tomato'?'three':'sprite';
}
