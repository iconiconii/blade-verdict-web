import { describe, expect, it } from 'vitest';
import { applyContinuousCut, createCombat, durations, prepareRound, startVerdict, tapTarget, tempoFor, tickCombat, type CombatState } from './combat';
import { doubleCircleRoll, LEVEL_CONFIG, levelForBoss, levelTiming } from './levelConfig';
import { bossMaxHp, resolveRingParry, ringPhaseAt, type BossKind } from './v2';

const vegetables=['corn','carrot','cabbage','tomato'] as const;
function active(kind:BossKind='corn',count=2):CombatState {
  const initial=createCombat(7319,kind);
  let prepared=prepareRound(initial);
  for(let round=0;prepared.targets.length!==count&&round<100;round++)prepared=prepareRound({...initial,round});
  if(prepared.targets.length!==count)throw Error('Test seed did not produce the requested circle count');
  return tickCombat(prepared,prepared.tempo.telegraphMs);
}
function perfectTime(s:CombatState){
  return s.tempo.durationMs*(s.tempo.perfectWindowStart+s.tempo.perfectWindowEnd)/2;
}
function resolveAll(s:CombatState){
  let next=s;
  for(const target of s.targets)next=tapTarget(next,target.circleId);
  return next;
}
function verdict(kind:BossKind='corn',bonus=0){
  const s=createCombat(7319,kind,bonus);
  return startVerdict({...s,phase:'verdictReady',battle:{...s.battle,meter:100}});
}

describe('V2 level snapshots',()=>{
  it('maps vegetables to the three levels and leaves jelly on its legacy profile',()=>{
    expect(levelForBoss).toEqual({corn:1,carrot:2,cabbage:3,tomato:3,jelly:null});
    expect(vegetables.map(kind=>createCombat(1,kind).levelId)).toEqual([1,2,3,3]);
    expect(createCombat(1,'jelly')).toMatchObject({levelId:null,enraged:false,enragedAt:null});
    expect(createCombat(7,'corn',0,'battle-one').battleId).toBe('battle-one');
    expect(createCombat(7,'corn').battleId).toBe('corn-7');
  });
  it.each(vegetables)('keeps %s lifetime, radii and interval independent of successful play',kind=>{
    expect(tempoFor(kind,999)).toEqual(tempoFor(kind,0));
    const tempo=tempoFor(kind,0),levelId=levelForBoss[kind]!;
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
  it('samples configured probabilities reproducibly instead of using a round pattern',()=>{
    const rolls=Array.from({length:20000},(_,round)=>doubleCircleRoll(7319,round));
    expect(rolls.slice(0,20)).toEqual(Array.from({length:20},(_,round)=>doubleCircleRoll(7319,round)));
    expect(rolls.slice(0,20)).not.toEqual(Array.from({length:20},(_,round)=>doubleCircleRoll(7320,round)));
    for(const probability of [.2,.5,.7,.8])expect(rolls.filter(roll=>roll<probability).length/rolls.length).toBeCloseTo(probability,1);
    for(const kind of vegetables){
      const initial=createCombat(7319,kind);
      for(let round=0;round<50;round++){
        const s=prepareRound({...initial,round});
        expect(s.targets.length).toBe(rolls[round]<s.tempo.doubleCircleProbability?2:1);
      }
    }
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
    let s=active();
    s=tickCombat(s,perfectTime(s));
    s=tapTarget(s,s.targets[order[0]].circleId);
    expect(s.phase).toBe('targetActive');
    expect(s.battle).toMatchObject({bossHp:788,meter:30,playerHp:100});
    expect(s.combo).toBe(1);
    expect(s.feedback).toMatchObject({kind:'Perfect',amount:12,energyGain:30,hitStopMs:80});
    expect(s.feedback?.pendingRound).toBeUndefined();
    expect(s.feedback?.contactResult).toBeUndefined();
    s=tapTarget(s,s.targets[order[1]].circleId);
    expect(s.phase).toBe('impact');
    expect(s.battle).toMatchObject({bossHp:776,meter:60,playerHp:100});
    expect(s.combo).toBe(2);
    expect(s.successfulParries).toBe(2);
    expect(s.effects.map(event=>event.circleId)).toEqual(order.map(index=>s.targets[index].circleId));
    expect(s.effects.map(event=>event.id)).toEqual([1,2]);
  });
  it('keeps Perfect damage and energy when the other circle times out',()=>{
    let s=active();s=tickCombat(s,perfectTime(s));
    s=tapTarget(s,s.targets[0].circleId);
    s=tickCombat(s,s.tempo.durationMs-s.elapsed);
    expect(s.battle).toMatchObject({bossHp:788,playerHp:88,meter:30});
    expect(s.combo).toBe(0);expect(s.bestCombo).toBe(1);
    expect(s.feedback).toMatchObject({kind:'Miss',amount:12,energyGain:0,hitStopMs:0});
  });
  it('settles both expirations in target order in one update and never repeats damage',()=>{
    const s=active(),next=tickCombat(s,s.tempo.durationMs);
    expect(next.battle.playerHp).toBe(76);
    expect(next.targets.every(target=>target.result==='Miss')).toBe(true);
    expect(next.effects.map(event=>event.circleId)).toEqual(s.targets.map(target=>target.circleId));
    expect(next.effects.map(event=>event.time)).toEqual([next.time,next.time]);
    expect(tickCombat(next,1).battle.playerHp).toBe(76);
    expect(tapTarget(next,s.targets[0].circleId)).toBe(next);
  });
  it('does not repeat a hit, accept stale circles or accept input while paused',()=>{
    const s=active(),id=s.targets[0].circleId;
    const hit=tapTarget(s,id);
    expect(tapTarget(hit,id)).toBe(hit);
    expect(tapTarget(s,'missing-circle')).toBe(s);
    const another=prepareRound({...s,round:s.round+1}),next=tickCombat(another,another.tempo.telegraphMs);
    expect(tapTarget(next,id)).toBe(next);
    const paused={...s,paused:true};
    expect(tapTarget(paused,id)).toBe(paused);
    expect(tickCombat(paused,10000)).toBe(paused);
    const resumed=tickCombat({...paused,paused:false},100);
    expect(resumed.targets.map(target=>target.ringElapsedMs)).toEqual([100,100]);
  });
  it('treats a tap at the exact deadline as one Miss rather than a successful late tap',()=>{
    const s=active('corn',1),atDeadline={...s,time:s.time+s.tempo.durationMs,elapsed:s.tempo.durationMs};
    const result=tapTarget(atDeadline,s.targets[0].circleId);
    expect(result.feedback?.kind).toBe('Miss');
    expect(result.battle.playerHp).toBe(88);
    expect(tapTarget(result,s.targets[0].circleId)).toBe(result);
  });
  it('keeps the second circle interactive at full energy and enters verdict only once after both',()=>{
    let s=active();s={...s,battle:{...s.battle,meter:90}};
    s=tapTarget(s,s.targets[0].circleId);
    expect(s.battle.meter).toBe(100);expect(s.phase).toBe('targetActive');
    expect(s.feedback?.energyGain).toBe(10);
    expect(startVerdict(s)).toBe(s);
    s=tapTarget(s,s.targets[1].circleId);
    expect(s.feedback?.energyGain).toBe(0);expect(s.combo).toBe(2);
    s=tickCombat(s,durations.impact+durations.stagger);
    expect(s.phase).toBe('verdictReady');
    s=tickCombat(s,durations.verdictReady);
    expect(s.phase).toBe('verdictSlash');expect(s.battle.verdictCount).toBe(1);
    expect(s.battle.meter).toBe(0);expect(startVerdict(s)).toBe(s);
  });
  it('keeps the remaining ring and combat clock running during Perfect visual stop',()=>{
    let s=active();s=tickCombat(s,perfectTime(s));s=tapTarget(s,s.targets[0].circleId);
    const next=tickCombat(s,40);
    expect(s.feedback?.hitStopMs).toBe(80);
    expect(next.time-s.time).toBe(40);expect(next.targets[1].ringElapsedMs-s.targets[1].ringElapsedMs).toBe(40);
    expect(tapTarget(next,next.targets[1].circleId).feedback?.kind).toBe('Perfect');
  });
  it('ends on the first lethal parry without a future Miss or full-energy verdict',()=>{
    let s=active();s=tapTarget({...s,battle:{...s.battle,bossHp:8,meter:90}},s.targets[0].circleId);
    expect(s.phase).toBe('impact');expect(s.battle.meter).toBe(100);
    expect(s.targets[1].resolved).toBe(false);expect(s.feedback?.finisher).toBe(true);
    s=tickCombat(s,durations.impact+durations.deathStagger);
    expect(s.phase).toBe('settle');expect(s.battle.playerHp).toBe(100);expect(s.battle.verdictCount).toBe(0);
  });
  it('stops pending expiry damage when the player dies and ignores a full meter',()=>{
    let s=active();s={...s,battle:{...s.battle,playerHp:12,meter:100}};
    s=tickCombat(s,s.tempo.durationMs);
    expect(s.battle.playerHp).toBe(0);expect(s.effects).toHaveLength(1);
    expect(s.targets[1].resolved).toBe(false);
    s=tickCombat(s,durations.impact+durations.stagger);
    expect(s.phase).toBe('settle');expect(s.battle.verdictCount).toBe(0);
  });
  it('prioritizes death when the first circle fills energy but the second circle kills the player',()=>{
    let s=active();s={...s,battle:{...s.battle,playerHp:12,meter:90}};
    s=tapTarget(s,s.targets[0].circleId);
    expect(s.battle.meter).toBe(100);expect(s.phase).toBe('targetActive');
    s=tickCombat(s,s.tempo.durationMs);
    s=tickCombat(s,durations.impact+durations.stagger);
    expect(s.phase).toBe('settle');expect(s.battle.verdictCount).toBe(0);
  });
});

describe('absolute group timing',()=>{
  it.each(vegetables)('makes the next %s group visible exactly one configured interval after last result',kind=>{
    let s=resolveAll(active(kind));const settledAt=s.time,oldRound=s.round,interval=s.tempo.attackIntervalMs;
    expect(s.nextAttackAt).toBe(settledAt+interval);
    s=tickCombat(s,interval-1);
    expect(s.phase).toBe('telegraph');
    s=tickCombat(s,1);
    expect(s.phase).toBe('targetActive');expect(s.time-settledAt).toBe(interval);
    expect(s.round).toBe(oldRound+1);expect(s.targets.every(target=>target.ringElapsedMs===0)).toBe(true);
  });
  it('does not add frame overshoot once for every intermediate presentation stage',()=>{
    let s=resolveAll(active('carrot'));const settledAt=s.time;
    s=tickCombat(s,350);expect(s.phase).toBe('stagger');expect(s.elapsed).toBe(70);
    s=tickCombat(s,400);expect(s.phase).toBe('telegraph');expect(s.elapsed).toBe(30);
    s=tickCombat(s,350);expect(s.phase).toBe('targetActive');expect(s.time-settledAt).toBe(1100);
  });
  it('creates just one fresh wave after a delayed frame instead of replaying unseen expired waves',()=>{
    const s=resolveAll(active()),round=s.round,next=tickCombat(s,60000);
    expect(next.phase).toBe('targetActive');expect(next.round).toBe(round+1);
    expect(next.battle.playerHp).toBe(100);
    expect(next.targets.every(target=>!target.resolved&&target.ringElapsedMs===0)).toBe(true);
  });
});

describe('Level 3 enrage',()=>{
  it.each(['cabbage','tomato'] as const)('triggers %s strictly below 20 percent once without changing in-flight circles',kind=>{
    let s=active(kind),threshold=bossMaxHp(kind)*.2;
    s={...s,battle:{...s.battle,bossHp:threshold+s.attack.niceCounterDamage}};
    const first=tapTarget(s,s.targets[0].circleId);
    expect(first.battle.bossHp).toBe(threshold);expect(first.enraged).toBe(false);
    const next=tapTarget(first,first.targets[1].circleId);
    expect(next.enraged).toBe(true);expect(next.enragedAt).toBe(next.time);
    expect(next.tempo).toBe(s.tempo);expect(next.attack).toBe(s.attack);
    expect(next.targets.map(target=>target.ringDurationMs)).toEqual(s.targets.map(target=>target.ringDurationMs));
    expect(next.nextAttackAt).toBe(next.time+850*.9);
    const enraged=tickCombat(next,850*.9);
    expect(enraged.phase).toBe('targetActive');expect(enraged.tempo.durationMs).toBe(1800/(1.75*1.1));
    expect(enraged.tempo).toMatchObject({doubleCircleProbability:.8,attackIntervalMs:765,telegraphMs:185,staggerMs:300});
    const again=tapTarget(enraged,enraged.targets[0].circleId);
    expect(again.enragedAt).toBe(next.enragedAt);expect(again.tempo).toBe(enraged.tempo);
    expect(createCombat(7319,kind).enraged).toBe(false);
  });
  it('preserves the other circle lifetime when the first hit crosses the threshold',()=>{
    let s=active('cabbage');s={...s,battle:{...s.battle,bossHp:185}};
    s=tapTarget(s,s.targets[0].circleId);
    expect(s.enraged).toBe(true);expect(s.phase).toBe('targetActive');
    const next=tickCombat(s,s.tempo.durationMs-1);
    expect(next.targets[1].resolved).toBe(false);
    expect(next.targets[1].ringDurationMs).toBe(1800/1.75);
  });
  it('does not enrage Level 1/2 or an enemy killed by the triggering damage',()=>{
    for(const kind of vegetables){
      let s=active(kind);s={...s,battle:{...s.battle,bossHp:1}};
      expect(tapTarget(s,s.targets[0].circleId).enraged).toBe(false);
    }
    for(const kind of ['corn','carrot'] as const){
      let s=active(kind);s={...s,battle:{...s.battle,bossHp:100}};
      expect(tapTarget(s,s.targets[0].circleId).enraged).toBe(false);
    }
  });
  it('also detects verdict cuts and weapon timeout bonuses, independently of Fever',()=>{
    let s=verdict('cabbage');s={...s,battle:{...s.battle,bossHp:185}};
    s=applyContinuousCut(s,{x:.5,y:.5},true);
    expect(s.enraged).toBe(true);expect(s.fever).toBe(false);
    const triggeredAt=s.enragedAt;
    for(let i=0;i<4;i++)s=applyContinuousCut(s,{x:.5,y:.5},true);
    expect(s.fever).toBe(true);expect(s.enragedAt).toBe(triggeredAt);
    s=tickCombat(s,3000);s=tickCombat(s,300);
    expect(s.enraged).toBe(true);expect(s.fever).toBe(false);
    let bonus=verdict('tomato',8);bonus={...bonus,battle:{...bonus.battle,bossHp:204}};
    const finished=tickCombat(bonus,2500);
    expect(finished.battle.bossHp).toBe(196);expect(finished.enraged).toBe(true);
    let killed=verdict('tomato',8);killed={...killed,battle:{...killed.battle,bossHp:8}};
    expect(tickCombat(killed,2500).enraged).toBe(false);
  });
  it('does not trigger enrage if the cap-reaching cut plus its bonus is lethal',()=>{
    let s=verdict('tomato',200);
    s={...s,battle:{...s.battle,bossHp:205},verdictDamageDealt:160};
    s=applyContinuousCut(s,{x:.5,y:.5},true);
    expect(s.battle.bossHp).toBe(0);expect(s.phase).toBe('stagger');
    expect(s.enraged).toBe(false);expect(s.enragedAt).toBeNull();
  });
});

describe('full deterministic battle completion',()=>{
  it.each(vegetables)('allows a Good-only player to finish %s while preserving existing single-hit values',kind=>{
    let s=createCombat(7,kind);
    for(let step=0;step<2500&&s.phase!=='settle';step++){
      if(s.phase==='targetActive')s=tapTarget(s,s.targets.find(target=>!target.resolved)!.circleId);
      else if(s.phase==='verdictSlash')s=applyContinuousCut(s,{x:.5,y:.5},true);
      else s=tickCombat(s,1500);
    }
    expect(s.phase).toBe('settle');expect(s.battle.bossHp).toBe(0);expect(s.battle.playerHp).toBe(100);
  });
});
