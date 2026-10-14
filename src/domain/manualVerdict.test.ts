import { describe, expect, it } from 'vitest';
import { applyContinuousCut, createCombat, stageHpBoundary, startVerdict, tapTarget, tickCombat, verdictDurationFor, type CombatState } from './combat';

const levels=[
  {boss:'corn',stages:1,damage:[[38,64]],cut:100},
  {boss:'carrot',stages:2,damage:[[12,21],[11,19]],cut:54},
  {boss:'cabbage',stages:3,damage:[[7,12],[6,11],[6,10]],cut:39},
  {boss:'tomato',stages:4,damage:[[6,11],[6,10],[4,8],[4,7]],cut:32},
] as const;
const point={x:.5,y:.5};

// Real phase/input API only: no manufactured circle counters or filled meters.
function playToReady(initial:CombatState,perfect=false){
  let s=initial;
  for(let step=0;step<2000&&s.phase!=='verdictReady';step++){
    if(s.phase==='targetActive'){
      if(perfect)s=tickCombat(s,s.tempo.durationMs*(s.tempo.perfectWindowStart+s.tempo.perfectWindowEnd)/2);
      for(const target of s.targets)s=tapTarget(s,target.circleId);
    }else s=tickCombat(s,20);
  }
  expect(s.phase).toBe('verdictReady');
  return s;
}
function cutToEnd(initial:CombatState){
  let s=startVerdict(initial);
  for(let i=0;i<10&&s.phase==='verdictSlash';i++){
    const before=s;
    s=applyContinuousCut(s,point,true);
    expect(s.feedback?.amount).toBe(Math.min(before.attack.verdictCutDamage!,before.battle.bossHp-stageHpBoundary(before)));
    // Every hit gets real clock time; the recipe must be feasible within its window.
    s=tickCombat(s,200);
  }
  expect(s.phase).toBe('stagger');
  return s;
}

describe.each(levels)('$boss manual verdict and hearts',level=>{
  it('loses on the third missed circle without monster damage or a free verdict',()=>{
    let s=createCombat(13,level.boss);
    const hp=s.battle.bossHp;
    for(let i=0;i<10000&&s.phase!=='settle';i++)s=tickCombat(s,16);
    expect(s.phase).toBe('settle');expect(s.defeatReason).toBe('hearts');
    expect(s.battle).toMatchObject({playerHp:0,bossHp:hp,verdictCount:0});
    expect(s.stageCirclesResolved).toBe(3);
    expect(tickCombat(s,60000).battle).toEqual(s.battle);
    expect(startVerdict(s)).toBe(s);
  });

  it('verifies the damage budget and fixed cuts at every stage for Good and Perfect',()=>{
    const cutCounts:number[][]=[];
    for(const perfect of [false,true]){
      let s=createCombat(31,level.boss);const counts:number[]=[];
      for(let stage=0;stage<level.stages;stage++){
        s=playToReady(s,perfect);
        expect(s.attack.niceCounterDamage).toBe(level.damage[stage][0]);
        expect(s.attack.perfectCounterDamage).toBe(level.damage[stage][1]);
        expect(s.attack.verdictCutDamage).toBe(level.cut);
        const waited=tickCombat(s,60000);
        expect(waited.battle).toEqual(s.battle);expect(waited.stageIndex).toBe(stage);
        expect(waited.phase).toBe('verdictReady');
        s=cutToEnd(waited);counts.push(s.verdictCombo);
        expect(s.battle.verdictCount).toBe(stage+1);
        expect(s.battle.playerHp).toBe(3);
      }
      expect(s.battle.bossHp).toBe(0);cutCounts.push(counts);
    }
    for(let i=0;i<level.stages;i++)expect(cutCounts[1][i]).toBeLessThan(cutCounts[0][i]);
  });

  for(let targetStage=0;targetStage<level.stages;targetStage++){
    it(`fails verdict ${targetStage+1} on empty or insufficient cuts without topping up damage`,()=>{
      let s=createCombat(51,level.boss,8,'timeout',true);
      for(let stage=0;stage<=targetStage;stage++){
        s=playToReady(s);
        if(stage<targetStage){
          s=startVerdict(s);
          for(let i=0;i<10&&s.phase==='verdictSlash';i++)s=applyContinuousCut(s,point,true);
        }
      }
      for(const partial of [false,true]){
        let begun=startVerdict(s);
        if(partial)begun=applyContinuousCut(begun,point,true);
        const paused={...begun,paused:true};expect(tickCombat(paused,60000)).toBe(paused);
        const ended=tickCombat(begun,verdictDurationFor(begun));
        expect(ended.phase).toBe('settle');expect(ended.defeatReason).toBe('verdict-timeout');
        expect(ended.battle).toEqual(begun.battle);expect(ended.stageIndex).toBe(targetStage);
        expect(ended.tomatoBombTriggered).toBe(partial);
        expect(ended.feedback).toBeNull();
        expect(applyContinuousCut(ended,point,true)).toBe(ended);
        expect(startVerdict(ended)).toBe(ended);
      }
    });
  }
});
