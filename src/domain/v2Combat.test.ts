import { describe, expect, it } from 'vitest';
import { applyContinuousCut, createCombat, currentVerdictStage, durations, prepareRound, stageHpBoundary, startVerdict, tapTarget, tempoFor, tickCombat, type CombatState } from './combat';
import { LEVEL_CONFIG, levelForBoss, levelTiming, verdictPlanFor } from './levelConfig';
import { bossMaxHp, resolveRingParry, ringPhaseAt, type BossKind } from './v2';

const vegetables=['corn','carrot','cabbage','tomato'] as const;
function active(kind:BossKind='carrot',count=2,stageIndex=0):CombatState {
  const initial=createCombat(7319,kind),stage=verdictPlanFor(kind)![stageIndex];
  const stageGroupsResolved=count===2?stage.singleGroups:0;
  const prepared=prepareRound({...initial,stageIndex,stageGroupsResolved,stageCirclesResolved:stageGroupsResolved,
    round:stageGroupsResolved,battle:{...initial.battle,verdictCount:stageIndex,meter:100*stageGroupsResolved/(stage.singleGroups+2*stage.doubleGroups)}});
  if(prepared.targets.length!==count)throw Error('This stage does not have the requested circle count');
  return tickCombat(prepared,prepared.tempo.telegraphMs);
}
const perfectTime=(s:CombatState)=>s.tempo.durationMs*(s.tempo.perfectWindowStart+s.tempo.perfectWindowEnd)/2;
function resolveAll(s:CombatState){
  let next=s;
  for(const target of s.targets)next=tapTarget(next,target.circleId);
  return next;
}
function verdict(kind:BossKind='corn',stageIndex=0){
  const s=createCombat(7319,kind),stage=verdictPlanFor(kind)![stageIndex];
  return startVerdict({...s,stageIndex,stageGroupsResolved:stage.singleGroups+stage.doubleGroups,
    stageCirclesResolved:stage.singleGroups+2*stage.doubleGroups,phase:'verdictReady',
    battle:{...s.battle,meter:100,verdictCount:stageIndex}});
}

describe('fixed vegetable level snapshots',()=>{
  it('maps vegetables to four levels and leaves jelly on its legacy profile',()=>{
    expect(levelForBoss).toEqual({corn:1,carrot:2,cabbage:3,tomato:4,jelly:null});
    expect(vegetables.map(kind=>createCombat(1,kind).levelId)).toEqual([1,2,3,4]);
    expect(createCombat(1,'jelly')).toMatchObject({levelId:null,enraged:false,enragedAt:null});
    expect(currentVerdictStage(createCombat(1,'jelly'))).toBeNull();
    expect(createCombat(7,'corn',0,'battle-one').battleId).toBe('battle-one');
    expect(createCombat(7,'corn').battleId).toBe('corn-7');
  });
  it.each(vegetables)('keeps %s lifetime, radii and interval independent of success and enrage',kind=>{
    const tempo=tempoFor(kind,0),levelId=levelForBoss[kind]!;
    expect(tempoFor(kind,999)).toEqual(tempo);
    expect(tempoFor(kind,999,true)).toMatchObject({durationMs:tempo.durationMs,attackIntervalMs:tempo.attackIntervalMs});
    expect(tempo.durationMs).toBe(1800/LEVEL_CONFIG[levelId].speedMultiplier);
    expect(tempo.attackIntervalMs).toBe(LEVEL_CONFIG[levelId].attackIntervalMs);
    expect(durations.impact+tempo.staggerMs+tempo.telegraphMs).toBe(tempo.attackIntervalMs);
    expect(tempo.staggerMs).toBeGreaterThanOrEqual(300);
  });
  it.each(vegetables)('uses identical %s Perfect boundaries for rendering and input',kind=>{
    const s=active(kind,1),start=s.tempo.durationMs*s.tempo.perfectWindowStart,end=s.tempo.durationMs*s.tempo.perfectWindowEnd;
    const timing=levelTiming(levelForBoss[kind]!);
    expect(s.attack.perfectWindowStart).toBe(timing.perfectWindowStart);
    expect(s.attack.perfectWindowEnd).toBe(timing.perfectWindowEnd);
    expect(resolveRingParry(start-.001,s.tempo.durationMs,s.attack)).toBe('Nice');
    expect(resolveRingParry(start,s.tempo.durationMs,s.attack)).toBe('Perfect');
    expect(resolveRingParry(end-.001,s.tempo.durationMs,s.attack)).toBe('Perfect');
    expect(resolveRingParry(end,s.tempo.durationMs,s.attack)).toBe('Nice');
    expect(ringPhaseAt(start,s.tempo.durationMs,s.attack)).toBe('perfect');
    expect(ringPhaseAt(end,s.tempo.durationMs,s.attack)).not.toBe('perfect');
  });
});

describe('simultaneous independent circles',()=>{
  it('starts both circles together with stable, distinct round identities',()=>{
    const s=active();
    expect(s.targets.map(target=>target.startDelayMs)).toEqual([0,0]);
    expect(s.targets.map(target=>target.ringElapsedMs)).toEqual([0,0]);
    expect(new Set(s.targets.map(target=>target.circleId)).size).toBe(2);
    expect(s.targets[0].anchorId).not.toBe(s.targets[1].anchorId);
    expect(prepareRound(s).targets.map(target=>target.circleId)).toEqual(s.targets.map(target=>target.circleId));
    expect(prepareRound({...s,round:s.round+1}).targets[0].circleId).not.toBe(s.targets[0].circleId);
  });
  it.each([{order:[0,1]},{order:[1,0]}])('accepts either click order $order and settles each immediately',({order})=>{
    let s=tickCombat(active(),perfectTime(active()));
    s=tapTarget(s,s.targets[order[0]].circleId);
    expect(s.phase).toBe('targetActive');
    expect(s.battle).toMatchObject({bossHp:847,meter:62.5,playerHp:100});
    expect(s.combo).toBe(1);
    expect(s.feedback).toMatchObject({kind:'Perfect',amount:13,energyGain:12.5,hitStopMs:80});
    expect(s.feedback?.pendingRound).toBeUndefined();
    expect(s.feedback?.contactResult).toBeUndefined();
    s=tapTarget(s,s.targets[order[1]].circleId);
    expect(s.phase).toBe('impact');
    expect(s.battle).toMatchObject({bossHp:834,meter:75,playerHp:100});
    expect(s.combo).toBe(2);expect(s.successfulParries).toBe(2);
    expect(s.effects.map(event=>event.circleId)).toEqual(order.map(index=>s.targets[index].circleId));
    expect(s.effects.map(event=>event.id)).toEqual([1,2]);
  });
  it('keeps Perfect damage when the other circle misses and advances both resolved circles',()=>{
    let s=active();s=tickCombat(s,perfectTime(s));s=tapTarget(s,s.targets[0].circleId);
    s=tickCombat(s,s.tempo.durationMs-s.elapsed);
    expect(s.battle).toMatchObject({bossHp:847,playerHp:86,meter:75});
    expect(s.combo).toBe(0);expect(s.bestCombo).toBe(1);
    expect(s.feedback).toMatchObject({kind:'Miss',amount:14,energyGain:12.5,hitStopMs:0});
  });
  it('settles both expirations in target order in one update and never repeats damage',()=>{
    const s=active(),next=tickCombat(s,s.tempo.durationMs);
    expect(next.battle.playerHp).toBe(72);expect(next.battle.meter).toBe(75);
    expect(next.targets.every(target=>target.result==='Miss')).toBe(true);
    expect(next.effects.map(event=>event.circleId)).toEqual(s.targets.map(target=>target.circleId));
    expect(next.effects.map(event=>event.time)).toEqual([next.time,next.time]);
    expect(tickCombat(next,1).battle.playerHp).toBe(72);
    expect(tapTarget(next,s.targets[0].circleId)).toBe(next);
  });
  it('does not repeat hits or accept stale circles or paused input',()=>{
    const s=active(),id=s.targets[0].circleId,hit=tapTarget(s,id);
    expect(tapTarget(hit,id)).toBe(hit);expect(tapTarget(s,'missing-circle')).toBe(s);
    const another=prepareRound({...s,round:s.round+1}),next=tickCombat(another,another.tempo.telegraphMs);
    expect(tapTarget(next,id)).toBe(next);
    const paused={...s,paused:true};
    expect(tapTarget(paused,id)).toBe(paused);expect(tickCombat(paused,10000)).toBe(paused);
    expect(tickCombat({...paused,paused:false},100).targets.map(target=>target.ringElapsedMs)).toEqual([100,100]);
  });
  it('treats a tap at the exact deadline as one Miss',()=>{
    const s=active('corn',1),atDeadline={...s,time:s.time+s.tempo.durationMs,elapsed:s.tempo.durationMs};
    const result=tapTarget(atDeadline,s.targets[0].circleId);
    expect(result.feedback?.kind).toBe('Miss');expect(result.battle.playerHp).toBe(88);
    expect(tapTarget(result,s.targets[0].circleId)).toBe(result);
  });
  it('waits for the last circle of the final group before filling energy and starting one verdict',()=>{
    let s=active();s=resolveAll(s);s=tickCombat(s,s.tempo.attackIntervalMs);
    expect(currentVerdictStage(s)?.groupsResolved).toBe(5);
    s=tapTarget(s,s.targets[0].circleId);
    expect(s.battle.meter).toBe(87.5);expect(s.phase).toBe('targetActive');
    expect(startVerdict(s)).toBe(s);
    s=tapTarget(s,s.targets[1].circleId);
    expect(s.battle.meter).toBe(100);expect(s.feedback?.energyGain).toBe(12.5);
    s=tickCombat(s,durations.impact+durations.stagger);
    expect(s.phase).toBe('verdictReady');
    s=tickCombat(s,durations.verdictReady);
    expect(s.phase).toBe('verdictSlash');expect(s.battle.verdictCount).toBe(1);
    expect(s.battle.meter).toBe(0);expect(startVerdict(s)).toBe(s);
  });
  it('keeps the other ring and combat clock running during Perfect visual stop',()=>{
    let s=active();s=tickCombat(s,perfectTime(s));s=tapTarget(s,s.targets[0].circleId);
    const next=tickCombat(s,40);
    expect(s.feedback?.hitStopMs).toBe(80);expect(next.time-s.time).toBe(40);
    expect(next.targets[1].ringElapsedMs-s.targets[1].ringElapsedMs).toBe(40);
    expect(tapTarget(next,next.targets[1].circleId).feedback?.kind).toBe('Perfect');
  });
  it('never lets a parry skip a health segment or execute the final kill',()=>{
    let s=active();const boundary=stageHpBoundary(s);
    s=tapTarget({...s,battle:{...s.battle,bossHp:boundary+3}},s.targets[0].circleId);
    expect(s.battle.bossHp).toBe(boundary);expect(s.feedback?.amount).toBe(3);
    s=tapTarget(s,s.targets[1].circleId);
    expect(s.feedback?.amount).toBe(0);expect(s.feedback?.finisher).toBe(false);
    const final=active('corn',1),hit=tapTarget({...final,battle:{...final.battle,bossHp:4}},final.targets[0].circleId);
    expect(hit.battle.bossHp).toBe(1);expect(hit.feedback?.amount).toBe(3);
  });
  it('stops pending expiry damage when the player dies even when the stage could fill energy',()=>{
    let s=active();s=resolveAll(s);s=tickCombat(s,s.tempo.attackIntervalMs);
    s=tapTarget(s,s.targets[0].circleId);s={...s,battle:{...s.battle,playerHp:14}};
    s=tickCombat(s,s.tempo.durationMs);
    expect(s.battle.playerHp).toBe(0);expect(s.battle.meter).toBe(100);
    s=tickCombat(s,durations.impact+durations.stagger);
    expect(s.phase).toBe('settle');expect(s.battle.verdictCount).toBe(0);
    let first=active();first={...first,battle:{...first.battle,playerHp:14}};
    first=tickCombat(first,first.tempo.durationMs);
    expect(first.effects).toHaveLength(1);expect(first.targets[1].resolved).toBe(false);
  });
});

describe('absolute group timing',()=>{
  it.each(vegetables)('shows the next %s group one configured interval after the last result',kind=>{
    let s=resolveAll(active(kind,1));const settledAt=s.time,oldRound=s.round,interval=s.tempo.attackIntervalMs;
    expect(s.nextAttackAt).toBe(settledAt+interval);
    s=tickCombat(s,interval-1);expect(s.phase).toBe('telegraph');
    s=tickCombat(s,1);
    expect(s.phase).toBe('targetActive');expect(s.time-settledAt).toBe(interval);
    expect(s.round).toBe(oldRound+1);expect(s.targets.every(target=>target.ringElapsedMs===0)).toBe(true);
  });
  it('does not add frame overshoot to each intermediate presentation stage',()=>{
    let s=resolveAll(active('carrot'));const settledAt=s.time;
    s=tickCombat(s,350);expect(s.phase).toBe('stagger');expect(s.elapsed).toBe(70);
    s=tickCombat(s,500);expect(s.phase).toBe('telegraph');expect(s.elapsed).toBe(30);
    s=tickCombat(s,350);expect(s.phase).toBe('targetActive');expect(s.time-settledAt).toBe(1200);
  });
  it('creates one fresh group after a slow frame instead of replaying expired groups',()=>{
    const s=resolveAll(active()),round=s.round,next=tickCombat(s,60000);
    expect(next.phase).toBe('targetActive');expect(next.round).toBe(round+1);
    expect(next.battle.playerHp).toBe(100);expect(next.targets.every(target=>!target.resolved&&target.ringElapsedMs===0)).toBe(true);
  });
});

describe('late-level enrage keeps the fixed encounter table',()=>{
  it.each(['cabbage','tomato'] as const)('triggers %s strictly below 20 percent once without changing circles or timing',kind=>{
    const last=verdictPlanFor(kind)!.length-1;
    let s=active(kind,2,last),threshold=bossMaxHp(kind)*.2;
    s={...s,battle:{...s.battle,bossHp:threshold+s.attack.niceCounterDamage}};
    const first=tapTarget(s,s.targets[0].circleId);
    expect(first.battle.bossHp).toBe(threshold);expect(first.enraged).toBe(false);
    const next=tapTarget(first,first.targets[1].circleId);
    expect(next.enraged).toBe(true);expect(next.enragedAt).toBe(next.time);
    expect(next.tempo).toBe(s.tempo);expect(next.attack).toBe(s.attack);
    expect(next.targets.map(target=>target.ringDurationMs)).toEqual(s.targets.map(target=>target.ringDurationMs));
    expect(next.nextAttackAt).toBe(next.time+s.tempo.attackIntervalMs);
    const enraged=tickCombat(next,s.tempo.attackIntervalMs);
    expect(enraged.phase).toBe('targetActive');expect(enraged.targets).toHaveLength(2);
    expect(enraged.tempo).toMatchObject({durationMs:s.tempo.durationMs,attackIntervalMs:s.tempo.attackIntervalMs,label:'狂暴'});
    expect(tapTarget(enraged,enraged.targets[0].circleId).enragedAt).toBe(next.enragedAt);
    expect(createCombat(7319,kind).enraged).toBe(false);
  });
  it('detects verdict cuts independently of Fever and does not enrage a lethal finish',()=>{
    let s=verdict('cabbage',2);s={...s,battle:{...s.battle,bossHp:185}};
    s=applyContinuousCut(s,{x:.5,y:.5},true);
    expect(s.enraged).toBe(true);expect(s.fever).toBe(false);
    const triggeredAt=s.enragedAt;
    for(let i=0;i<4;i++)s=applyContinuousCut(s,{x:.5,y:.5},true);
    expect(s.fever).toBe(true);expect(s.enragedAt).toBe(triggeredAt);
    let killed=verdict('tomato',3);killed={...killed,battle:{...killed.battle,bossHp:10}};
    killed=applyContinuousCut(killed,{x:.5,y:.5},true);
    expect(killed.battle.bossHp).toBe(0);expect(killed.enraged).toBe(false);
  });
});
