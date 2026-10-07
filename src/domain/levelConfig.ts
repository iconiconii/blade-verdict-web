import type { BossKind } from './v2';

export type LevelId = 1 | 2 | 3;
export interface LevelConfig {
  speedMultiplier:number;
  doubleCircleProbability:number;
  perfectWindowMultiplier:number;
  attackIntervalMs:number;
}

/** The only source of the vegetable demo's three difficulty profiles. */
export const LEVEL_CONFIG:Readonly<Record<LevelId,Readonly<LevelConfig>>> = {
  1:{speedMultiplier:1.25,doubleCircleProbability:.20,perfectWindowMultiplier:1.20,attackIntervalMs:1400},
  2:{speedMultiplier:1.50,doubleCircleProbability:.50,perfectWindowMultiplier:1.00,attackIntervalMs:1100},
  3:{speedMultiplier:1.75,doubleCircleProbability:.70,perfectWindowMultiplier:.80,attackIntervalMs:850},
};
export const levelForBoss:Readonly<Record<BossKind,LevelId|null>>={corn:1,carrot:2,cabbage:3,tomato:3,jelly:null};
export const vegetableRingBaselineMs=1800;
export const enrageConfig={healthThreshold:.20,speedMultiplier:1.10,intervalMultiplier:.90,doubleCircleProbability:.80} as const;

export function levelTiming(levelId:LevelId,enraged=false){
  const profile=LEVEL_CONFIG[levelId];
  const speed=profile.speedMultiplier*(enraged?enrageConfig.speedMultiplier:1);
  const halfWindow=350*profile.perfectWindowMultiplier;
  return {
    durationMs:vegetableRingBaselineMs/speed,
    perfectWindowStart:(1050-halfWindow)/vegetableRingBaselineMs,
    perfectWindowEnd:(1050+halfWindow)/vegetableRingBaselineMs,
    doubleCircleProbability:enraged?enrageConfig.doubleCircleProbability:profile.doubleCircleProbability,
    attackIntervalMs:profile.attackIntervalMs*(enraged?enrageConfig.intervalMultiplier:1),
  };
}

/** Stateless seeded draw: replays never depend on render cadence or Math.random. */
export function doubleCircleRoll(seed:number,round:number):number {
  let value=(seed+Math.imul(round,1013904223)+0x63d83595)>>>0;
  value=Math.imul(value^(value>>>16),0x85ebca6b);
  value=Math.imul(value^(value>>>13),0xc2b2ae35);
  return ((value^(value>>>16))>>>0)/4294967296;
}
