import { describe, expect, it } from 'vitest';
import { applyContinuousCut, createCombat, currentVerdictStage, durations, prepareRound, startVerdict, tapTarget, tickCombat, verdictDurationFor, type CombatState } from './combat';
import { verdictPlanFor } from './levelConfig';
import { bossMaxHp, type BossKind } from './v2';

// Acceptance values are independent of the production configuration.
const cases=[
  {kind:'corn',duration:1500,stages:[[5,0]]},
  {kind:'carrot',duration:1200,stages:[[4,2],[3,3]]},
  {kind:'cabbage',duration:900,stages:[[2,4],[1,5],[0,6]]},
  {kind:'tomato',duration:700,stages:[[1,4],[0,5],[0,6],[0,7]]},
] as const;
const point={x:.5,y:.5};
const modes=['Good/full','Perfect/full','Good/empty','mixed/empty'] as const;
type Mode=typeof modes[number];
type Encounter=typeof cases[number];
function nextStageFirstGroup(s:CombatState){
  let next=s;
  if(next.phase==='intro')next=tickCombat(next,durations.intro);
  if(next.phase==='stagger')next=tickCombat(next,durations.stagger);
  expect(next.phase).toBe('telegraph');
  next=tickCombat(next,next.tempo.telegraphMs);
  expect(next.phase).toBe('targetActive');
  return next;
}
function finishCuts(s:CombatState){
  let next=s;
  for(let hit=0;hit<100&&next.phase==='verdictSlash';hit++){
    const previous=next;
    next=applyContinuousCut(next,point,true);
    expect(next.feedback?.amount).toBe(previous.battle.bossHp-next.battle.bossHp);
    expect(next.feedback!.amount).toBeGreaterThan(0);
  }
  expect(next.phase).toBe('stagger');
  return next;
}

/** Drives only production clock, circle input and cut APIs through every configured stage. */
function playEncounter(encounter:Encounter,mode:Mode,seed=7319,bonus=0,bomb=false){
  let s=createCombat(seed,encounter.kind,bonus,undefined,bomb),misses=0;
  const seenCircles=new Set<string>(),observed:number[][]=[],endHp:number[]=[];
  for(let stageIndex=0;stageIndex<encounter.stages.length;stageIndex++){
    s=nextStageFirstGroup(s);
    const [single,double]=encounter.stages[stageIndex],groups=single+double,circles=single+2*double;
    const seenGroups:number[]=[];
    let resolvedCircles=0;
    for(let group=0;group<groups;group++){
      expect(s.phase).toBe('targetActive');expect(s.stageIndex).toBe(stageIndex);
      expect(s.battle.verdictCount).toBe(stageIndex);
      expect(s.targets).toHaveLength(group<single?1:2);
      expect(s.tempo.attackIntervalMs).toBe(encounter.duration);
      expect(s.targets.map(target=>target.ringDurationMs)).toEqual(s.targets.map(()=>encounter.duration));
      expect(s.targets.every(target=>target.startDelayMs===0)).toBe(true);
      seenGroups.push(s.targets.length);
      if(mode==='Perfect/full'||mode==='mixed/empty'){
        s=tickCombat(s,s.tempo.durationMs*(s.tempo.perfectWindowStart+s.tempo.perfectWindowEnd)/2);
      }
      if(group===0){
        const paused={...s,paused:true};
        expect(tickCombat(paused,60000)).toBe(paused);
        expect(tapTarget(paused,paused.targets[0].circleId)).toBe(paused);
      }
      const targets=group%2?[...s.targets].reverse():s.targets;
      const missedId=mode==='mixed/empty'&&group===0?targets[0].circleId:null;
      for(const target of targets){
        expect(seenCircles.has(target.circleId)).toBe(false);seenCircles.add(target.circleId);
        if(target.circleId===missedId)continue;
        const before=s;s=tapTarget(s,target.circleId);resolvedCircles++;
        expect(s.feedback?.kind).toBe(mode==='Good/full'||mode==='Good/empty'?'Nice':'Perfect');
        expect(s.feedback?.amount).toBe(before.battle.bossHp-s.battle.bossHp);
        expect(tapTarget(s,target.circleId)).toBe(s);
        if(resolvedCircles<circles)expect(s.battle.meter).toBeLessThan(100);
        expect(startVerdict(s)).toBe(s);
      }
      if(missedId){
        s=tickCombat(s,s.tempo.durationMs-s.elapsed);resolvedCircles++;misses++;
        expect(s.feedback?.kind).toBe('Miss');
        expect(tapTarget(s,missedId)).toBe(s);
      }
      expect(s.phase).toBe('impact');
      expect(s.stageGroupsResolved).toBe(group+1);expect(s.stageCirclesResolved).toBe(resolvedCircles);
      expect(s.battle.meter).toBeCloseTo(100*resolvedCircles/circles,10);
      expect(s.battle.bossHp).toBeGreaterThan(0);
      if(group<groups-1){
        const settledAt=s.time,previousIds=s.targets.map(target=>target.circleId);
        expect(s.nextAttackAt).toBe(settledAt+encounter.duration);
        s=tickCombat(s,encounter.duration-1);expect(s.phase).toBe('telegraph');
        s=tickCombat(s,1);expect(s.phase).toBe('targetActive');
        expect(s.time-settledAt).toBeCloseTo(encounter.duration,8);
        for(const staleId of previousIds)expect(tapTarget(s,staleId)).toBe(s);
      }
    }
    observed.push([seenGroups.filter(count=>count===1).length,seenGroups.filter(count=>count===2).length]);
    expect(resolvedCircles).toBe(circles);expect(s.battle.meter).toBe(100);
    expect(prepareRound(s)).toBe(s);
    s=tickCombat(s,durations.impact+durations.stagger);expect(s.phase).toBe('verdictReady');
    s=tickCombat(s,durations.verdictReady);expect(s.phase).toBe('verdictSlash');
    expect(s.battle.verdictCount).toBe(stageIndex+1);expect(s.battle.meter).toBe(0);
    expect(startVerdict(s)).toBe(s);expect(s.verdictBombDamage).toBe(0);
    const before=s;
    if(mode.endsWith('/empty')){
      s=tickCombat(s,verdictDurationFor(s));
      expect(s.feedback?.amount).toBe(before.battle.bossHp-s.battle.bossHp);
      expect(s.tomatoBombTriggered).toBe(false);
    }else s=finishCuts(s);
    const boundary=Math.round(bossMaxHp(encounter.kind)*(encounter.stages.length-stageIndex-1)/encounter.stages.length);
    expect(s.battle.bossHp).toBe(boundary);endHp.push(s.battle.bossHp);
    expect(s.stageIndex).toBe(stageIndex+1);
    expect(s.stageGroupsResolved).toBe(0);expect(s.stageCirclesResolved).toBe(0);
    expect(s.feedback?.finisher).toBe(stageIndex===encounter.stages.length-1);
    expect(applyContinuousCut(s,point,true)).toBe(s);
  }
  s=tickCombat(s,durations.deathStagger);
  expect(s.phase).toBe('settle');expect(s.battle.bossHp).toBe(0);
  expect(s.battle.verdictCount).toBe(encounter.stages.length);
  expect(s.battle.playerHp).toBe(100-misses*s.attack.missDamage);
  expect(observed).toEqual(encounter.stages);
  expect(currentVerdictStage(s)).toBeNull();expect(prepareRound(s)).toBe(s);
  expect(tickCombat(s,60000).battle).toEqual(s.battle);
  return {s,observed,endHp};
}

describe('every level and every verdict executes the exact encounter table',()=>{
  for(const encounter of cases){
    it.each(modes)(encounter.kind+' follows every stage using %s',mode=>{
      playEncounter(encounter,mode);
    });
    it(encounter.kind+' retains all budgets with the cleaver and bomb equipped',()=>{
      playEncounter(encounter,'Perfect/full',17,8,true);
      playEncounter(encounter,'Good/empty',18,8,true);
    });
  }
  it('never generates a corn double across seeds, success qualities or empty verdicts',()=>{
    for(const seed of [0,1,2,7,91,7319,0xffffffff]){
      expect(playEncounter(cases[0],seed%2?'Perfect/full':'Good/empty',seed).observed).toEqual([[5,0]]);
    }
  });
  it('reproduces anchor positions without changing any stage budget across seeds',()=>{
    const make=(seed:number)=>{
      const prepared=prepareRound(createCombat(seed,'tomato'));
      return prepared.targets.map(target=>({anchor:target.anchorId,position:target.position}));
    };
    expect(make(91)).toEqual(make(91));expect(make(91)).not.toEqual(make(92));
    expect(playEncounter(cases[3],'Good/full',92).observed).toEqual(cases[3].stages);
  });
  it('does not allow a full meter alone to bypass unplayed groups',()=>{
    const state=createCombat(1,'corn');
    const forged={...state,phase:'verdictReady' as const,battle:{...state.battle,meter:100}};
    expect(startVerdict(forged)).toBe(forged);
    expect(tickCombat(forged,durations.verdictReady).battle.verdictCount).toBe(0);
  });
  it('keeps early misses in the budget but fails immediately when player HP is exhausted',()=>{
    let s=nextStageFirstGroup(createCombat(1,'carrot'));
    s={...s,battle:{...s.battle,playerHp:14}};
    s=tickCombat(s,s.tempo.durationMs);
    expect(s.stageCirclesResolved).toBe(1);expect(s.battle.meter).toBe(12.5);
    expect(s.battle.playerHp).toBe(0);
    s=tickCombat(s,durations.impact+durations.stagger);
    expect(s.phase).toBe('settle');expect(s.battle.verdictCount).toBe(0);
  });
  it('resets stage progress, enrage and consumed feedback on a new battle',()=>{
    const previous=playEncounter(cases[3],'Perfect/full').s;
    const fresh=createCombat(previous.seed,previous.bossKind,0,'new-battle');
    expect(fresh).toMatchObject({stageIndex:0,stageGroupsResolved:0,stageCirclesResolved:0,enraged:false,feedback:null,effects:[]});
    expect(fresh.battle).toMatchObject({meter:0,verdictCount:0,playerHp:100,bossHp:1000});
  });
});

describe('equipment shortens cuts without skipping verdict stages',()=>{
  function firstVerdict(kind:BossKind,bonus=0,bomb=false){
    const initial=createCombat(31,kind,bonus,undefined,bomb),plan=verdictPlanFor(kind)![0];
    return startVerdict({...initial,phase:'verdictReady',
      stageGroupsResolved:plan.singleGroups+plan.doubleGroups,stageCirclesResolved:plan.singleGroups+2*plan.doubleGroups,
      battle:{...initial.battle,meter:100}});
  }
  it('makes the corn cleaver and bomb reduce cutting work while preserving one final resolution',()=>{
    const basic=finishCuts(firstVerdict('corn'));
    const cleaver=finishCuts(firstVerdict('corn',8));
    const bomb=finishCuts(firstVerdict('corn',0,true));
    expect(basic.verdictCombo).toBe(17);
    expect(cleaver.verdictCombo).toBe(16);expect(cleaver.verdictDamageDealt).toBe(192);
    expect(bomb.verdictCombo).toBe(16);expect(bomb.verdictBombDamage).toBe(10);
    for(const result of [basic,cleaver,bomb]){
      expect(result.battle.verdictCount).toBe(1);expect(result.battle.bossHp).toBe(0);
      expect(result.effects.filter(event=>event.finisher)).toHaveLength(1);
    }
  });
  it('requires a real cut even with an oversized bonus and cannot skip the next stage',()=>{
    const s=firstVerdict('tomato',10000);
    expect(s.phase).toBe('verdictSlash');expect(s.battle.bossHp).toBe(1000);
    expect(applyContinuousCut(s,point,false)).toBe(s);
    const hit=applyContinuousCut(s,point,true);
    expect(hit.stageIndex).toBe(1);expect(hit.battle.verdictCount).toBe(1);
    expect(hit.battle.bossHp).toBe(750);expect(hit.verdictCombo).toBe(1);
    expect(hit.feedback?.finisher).toBe(false);
  });
});
