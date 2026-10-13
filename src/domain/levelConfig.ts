import type { BossKind } from './v2';

export type LevelId = 1 | 2 | 3 | 4;
export interface VerdictStageConfig {
  singleGroups:number;
  doubleGroups:number;
}
export interface LevelConfig {
  speedMultiplier:number;
  perfectWindowMultiplier:number;
  attackIntervalMs:number;
  verdictStages:readonly Readonly<VerdictStageConfig>[];
}

/** Explicit encounter budgets: singles precede doubles within each verdict stage. */
export const LEVEL_CONFIG:Readonly<Record<LevelId,Readonly<LevelConfig>>> = {
  1:{speedMultiplier:1.2,perfectWindowMultiplier:1.20,attackIntervalMs:1500,
    verdictStages:[{singleGroups:5,doubleGroups:0}]},
  2:{speedMultiplier:1.5,perfectWindowMultiplier:1.00,attackIntervalMs:1200,
    verdictStages:[{singleGroups:4,doubleGroups:2},{singleGroups:3,doubleGroups:3}]},
  3:{speedMultiplier:2,perfectWindowMultiplier:.80,attackIntervalMs:900,
    verdictStages:[{singleGroups:2,doubleGroups:4},{singleGroups:1,doubleGroups:5},{singleGroups:0,doubleGroups:6}]},
  4:{speedMultiplier:18/7,perfectWindowMultiplier:.80,attackIntervalMs:700,
    verdictStages:[{singleGroups:1,doubleGroups:4},{singleGroups:0,doubleGroups:5},{singleGroups:0,doubleGroups:6},{singleGroups:0,doubleGroups:7}]},
};
export const levelForBoss:Readonly<Record<BossKind,LevelId|null>>={corn:1,carrot:2,cabbage:3,tomato:4,jelly:null};
export const vegetableRingBaselineMs=1800;
export const enrageConfig={healthThreshold:.20} as const;

export function verdictPlanFor(bossKind:BossKind):readonly Readonly<VerdictStageConfig>[]|null {
  const levelId=levelForBoss[bossKind];
  return levelId===null?null:LEVEL_CONFIG[levelId].verdictStages;
}

export function levelTiming(levelId:LevelId){
  const profile=LEVEL_CONFIG[levelId];
  const halfWindow=350*profile.perfectWindowMultiplier;
  return {
    durationMs:vegetableRingBaselineMs/profile.speedMultiplier,
    perfectWindowStart:(1050-halfWindow)/vegetableRingBaselineMs,
    perfectWindowEnd:(1050+halfWindow)/vegetableRingBaselineMs,
    attackIntervalMs:profile.attackIntervalMs,
  };
}
