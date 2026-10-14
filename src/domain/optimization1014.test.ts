import { describe, expect, it } from 'vitest';
import { applyContinuousCut, createCombat, currentVerdictStage, prepareRound, relayDelayMs, startVerdict, tapTarget, tickCombat, type CombatState } from './combat';

function until(s:CombatState,phase:CombatState['phase']){
  for(let i=0;i<3000&&s.phase!==phase&&s.phase!=='settle';i++)s=tickCombat(s,20);
  expect(s.phase).toBe(phase);return s;
}

describe('October 14 combat requirements',()=>{
  it.each(['corn','carrot','cabbage','tomato','jelly'] as const)('%s loses one heart, no energy or boss HP on Miss',boss=>{
    let s=until(createCombat(13,boss),'targetActive');const hp=s.battle.bossHp;
    s=tickCombat(s,s.tempo.durationMs);
    expect(s.battle).toMatchObject({playerHp:2,bossHp:hp,meter:0});
    expect(s.feedback).toMatchObject({kind:'Miss',amount:1,energyGain:0});
  });

  it.each(['corn','carrot','cabbage','tomato'] as const)('%s completes every verdict after one missed circle without losing successful hits',boss=>{
    let s=createCombat(31,boss);const total=currentVerdictStage(s)!.total;
    for(let stage=0;stage<total;stage++){
      // One Miss per battle, on the last circle of its first group.
      let missed=false;
      for(let frame=0;frame<10000&&s.phase!=='verdictReady';frame++){
        if(s.phase!=='targetActive'){s=tickCombat(s,20);expect(s.phase).not.toBe('settle');continue;}
        const ids=s.targets.map(t=>t.circleId);
        for(let i=0;i<ids.length;i++){
          if(stage===0&&!missed&&i===ids.length-1){
            const meter=s.battle.meter;s=tickCombat(s,s.tempo.durationMs);missed=true;
            expect(s.battle.meter).toBe(meter);
            s=until(s,'targetActive');
            expect(s.targets).toHaveLength(1);
            expect(s.targets[0].circleId).not.toBe(ids[i]);
            expect(tapTarget(s,ids[i])).toBe(s);
            break;
          }
          s=tapTarget(s,ids[i]);
        }
      }
      expect(s.phase).toBe('verdictReady');
      expect(s.battle.playerHp).toBe(2);
      expect(s.stageGroupsResolved).toBe(currentVerdictStage(s)!.groupCount);
      expect(s.stageCirclesResolved).toBe(currentVerdictStage(s)!.circleCount);
      expect(tickCombat(s,60000).phase).toBe('verdictReady');
      s=startVerdict(s);
      for(let i=0;i<10&&s.phase==='verdictSlash';i++){s=applyContinuousCut(s,{x:.5,y:.5},true);s=tickCombat(s,100);}
      expect(s.stageIndex).toBe(stage+1);expect(s.battle.verdictCount).toBe(stage+1);
    }
    expect(s.battle.bossHp).toBe(0);
  });

  it.each([1, 2])('retries exactly %i missed circles from a vegetable double group',misses=>{
    let s=until(createCombat(31,'tomato'),'targetActive');
    s=tapTarget(s,s.targets[0].circleId);
    s=until(s,'targetActive');
    expect(s.targets).toHaveLength(2);
    if(misses===1)s=tapTarget(s,s.targets[0].circleId);
    const meter=s.battle.meter,hp=s.battle.bossHp,groups=s.stageGroupsResolved;
    s=tickCombat(s,s.tempo.durationMs);
    expect(s.battle).toMatchObject({meter,bossHp:hp,playerHp:3-misses});
    expect(s.stageGroupsResolved).toBe(groups);
    s=until(s,'targetActive');
    expect(s.retryingGroup).toBe(true);
    expect(s.targets).toHaveLength(misses);
    for(const target of s.targets)s=tapTarget(s,target.circleId);
    expect(s.stageGroupsResolved).toBe(groups+1);
    expect(s.stageCirclesResolved).toBe(3);
  });

  it('jelly loses hearts immediately for each relay Miss without an aggregate charge',()=>{
    let s=prepareRound({...createCombat(11,'jelly'),successfulParries:6,round:2});
    s=until(s,'targetActive');expect(s.targets).toHaveLength(2);
    s=tickCombat(s,s.tempo.durationMs);
    expect(s.battle.playerHp).toBe(2);expect(s.feedback?.pendingRound).not.toBe(true);
    s=tickCombat(s,relayDelayMs+s.tempo.durationMs);
    expect(s.battle.playerHp).toBe(1);expect(s.battle.meter).toBe(0);
    s=until(s,'targetActive');s=tickCombat(s,s.tempo.durationMs);
    expect(s.battle.playerHp).toBe(0);expect(s.defeatReason).toBe('hearts');
    expect(until(s,'settle').battle.playerHp).toBe(0);
  });

  it('jelly waits for manual verdict release and guards paused/repeated input',()=>{
    let s=createCombat(19,'jelly');
    for(let i=0;i<3000&&s.phase!=='verdictReady';i++){
      if(s.phase==='targetActive'){
        const target=s.targets.find(t=>!t.resolved&&s.elapsed>=t.startDelayMs);
        s=target?tapTarget(s,target.circleId):tickCombat(s,20);
      }else s=tickCombat(s,20);
    }
    expect(s.phase).toBe('verdictReady');
    const waiting=tickCombat(s,60000);expect(waiting.phase).toBe('verdictReady');
    const paused={...waiting,paused:true};expect(startVerdict(paused)).toBe(paused);
    const released=startVerdict(waiting);expect(released.phase).toBe('verdictSlash');
    expect(released.battle).toMatchObject({meter:0,verdictCount:1});
    expect(startVerdict(released)).toBe(released);
  });
});
