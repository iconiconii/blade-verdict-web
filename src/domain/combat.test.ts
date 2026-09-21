import { describe, expect, it } from 'vitest';
import { deterministicBodyAnchor, deterministicTarget, type BossKind } from './v2';
import { applyContinuousCut, createCombat, durations, prepareRound, relayDelayMs,
  startVerdict, tapTarget, tempoFor, tickCombat, type CombatState } from './combat';

function active(kind:BossKind='corn',relay=false){
  const prepared=prepareRound({...createCombat(7319,kind),round:relay?5:0,successfulParries:relay?6:0});
  return tickCombat(prepared,prepared.tempo.telegraphMs);
}
const verdict=()=>startVerdict({...createCombat(),phase:'verdictReady',battle:{...createCombat().battle,meter:100}});

describe('accessible web combat',()=>{
  it('locks input during READY/GO and telegraph',()=>{
    let s=createCombat();
    expect(tapTarget(s,0)).toBe(s);
    s=tickCombat(s,durations.intro);
    expect(s.phase).toBe('telegraph');
    expect(tapTarget(s,0)).toBe(s);
    s=tickCombat(s,s.tempo.telegraphMs);
    expect(s.phase).toBe('targetActive');
    expect(s.targets[0].ringDurationMs).toBe(1800);
  });
  it.each([0,200,699,1400,1799])('accepts a Good click at %i ms',time=>{
    const s=tapTarget(tickCombat(active(),time),0);
    expect(s.feedback?.kind).toBe('Nice');
    expect(s.battle).toMatchObject({playerHp:100,bossHp:792,meter:18});
  });
  it.each([700,1000,1399])('accepts a Perfect click at %i ms',time=>{
    const s=tapTarget(tickCombat(active(),time),0);
    expect(s.feedback?.kind).toBe('Perfect');
    expect(s.battle).toMatchObject({playerHp:100,bossHp:788,meter:30});
  });
  it('resolves each target once, including the exact timeout boundary',()=>{
    const timeout=tickCombat(active(),1800);
    expect(timeout.battle.playerHp).toBe(88);
    expect(timeout.targets[0]).toMatchObject({resolved:true,result:'Miss'});
    expect(tapTarget(timeout,0)).toBe(timeout);
    expect(tickCombat(timeout,20).battle.playerHp).toBe(88);
    const hit=tapTarget(active(),0);
    expect(tapTarget(hit,0)).toBe(hit);
    expect(tapTarget(active(),9).battle.playerHp).toBe(100);
  });
  it('preserves stored energy on Miss and uses monster-specific gains',()=>{
    const s=active('jelly');
    expect(tapTarget(s,0).battle.meter).toBe(22);
    expect(tapTarget(tickCombat(s,800),0).battle.meter).toBe(34);
    const missed=tickCombat({...s,battle:{...s.battle,meter:52}},1800);
    expect(missed.battle).toMatchObject({playerHp:92,meter:52});
  });
  it('uses deterministic, distinct body anchors',()=>{
    expect(deterministicTarget(7319,0,0,1)).toEqual(deterministicTarget(7319,0,0,1));
    for(const kind of ['corn','jelly'] as const){
      expect(deterministicBodyAnchor(7319,5,0,2,kind)).not.toBe(deterministicBodyAnchor(7319,5,1,2,kind));
    }
  });
  it('does not show or start the second ring until the first resolves',()=>{
    let s=active('corn',true);
    expect(s.targets).toHaveLength(2);
    expect(s.targets[1].startDelayMs).toBe(Infinity);
    expect(tapTarget(s,1)).toBe(s);
    s=tapTarget(tickCombat(s,200),0);
    expect(s.phase).toBe('targetActive');
    expect(s.battle.meter).toBe(0);
    expect(s.feedback).toBeNull();
    expect(s.targets[1].startDelayMs).toBe(200+relayDelayMs);
    s=tickCombat(s,relayDelayMs-1);
    expect(tapTarget(s,1)).toBe(s);
    s=tapTarget(tickCombat(s,1),1);
    expect(s.phase).toBe('impact');
    expect(s.battle).toMatchObject({bossHp:792,meter:18});
    expect(s.combo).toBe(1);
  });
  it('aggregates a relay miss once after the second ring expires',()=>{
    let s=tapTarget(active('corn',true),0);
    s=tickCombat(s,relayDelayMs+s.targets[1].ringDurationMs);
    expect(s.battle).toMatchObject({playerHp:88,bossHp:800,meter:0});
    expect(s.feedback?.kind).toBe('Miss');
  });
  it('gives the second ring a full window even after the first times out',()=>{
    let s=active('corn',true);
    s=tickCombat(s,s.targets[0].ringDurationMs);
    expect(s.battle.playerHp).toBe(100);
    expect(s.targets[1].startDelayMs).toBe(s.elapsed+relayDelayMs);
    s=tapTarget(tickCombat(s,relayDelayMs),1);
    expect(s.battle).toMatchObject({playerHp:88,meter:0});
  });
  it('stops queued rings on full energy and automatically enters verdict once',()=>{
    let s=active('corn');
    s=tapTarget({...s,battle:{...s.battle,meter:90}},0);
    expect(s.phase).toBe('impact');
    expect(s.battle.meter).toBe(100);
    s=tickCombat(s,durations.impact);s=tickCombat(s,durations.stagger);
    expect(s.phase).toBe('verdictReady');
    expect(s.battle.meter).toBe(100);
    expect(tickCombat({...s,paused:true},2000).phase).toBe('verdictReady');
    s=tickCombat(s,durations.verdictReady);
    expect(s.phase).toBe('verdictSlash');
    expect(s.battle).toMatchObject({meter:0,verdictCount:1});
    expect(startVerdict(s)).toBe(s);
  });
  it('freezes clocks during Perfect hit-stop and pause',()=>{
    const s=tapTarget(tickCombat(active(),800),0);
    const stopped=tickCombat(s,99);
    expect(stopped.time).toBe(s.time);
    expect(stopped.elapsed).toBe(s.elapsed);
    expect(tickCombat(stopped,2).elapsed).toBe(1);
    const paused={...s,paused:true};
    expect(tickCombat(paused,10000)).toBe(paused);
    expect(tapTarget(paused,0)).toBe(paused);
  });
  it('increases three difficulty axes only after successful play',()=>{
    for(const kind of ['corn','jelly'] as const){
      const warm=tempoFor(kind,0),mid=tempoFor(kind,6),fast=tempoFor(kind,20);
      expect(warm).toMatchObject({durationMs:1800,maxRadiusPx:90,telegraphMs:400});
      expect(mid.durationMs).toBeLessThan(warm.durationMs);
      expect(fast.durationMs).toBe(1500);
      expect(fast.maxRadiusPx).toBe(76);
      expect(fast.telegraphMs).toBeLessThan(mid.telegraphMs);
      const failed=prepareRound({...createCombat(1,kind),round:30});
      expect(failed.targets).toHaveLength(1);
      expect(failed.tempo).toEqual(warm);
    }
  });
  it('prioritizes victory over full-meter transition',()=>{
    let s=active();s=tapTarget({...s,battle:{...s.battle,bossHp:8,meter:90}},0);
    s=tickCombat(s,durations.impact);s=tickCombat(s,durations.stagger);
    expect(s.phase).toBe('settle');
    expect(s.battle.verdictCount).toBe(0);
  });
});

describe('continuous body cutting',()=>{
  it('ignores outside segments and paused input',()=>{
    const s=verdict();
    expect(applyContinuousCut(s,{x:.5,y:.5},false)).toBe(s);
    const paused={...s,paused:true};
    expect(applyContinuousCut(paused,{x:.5,y:.5},true)).toBe(paused);
    expect(applyContinuousCut(s,{x:.5,y:.5},true).battle.bossHp).toBe(788);
  });
  it('caps damage at 200, clears the pointer and ignores post-verdict cuts',()=>{
    let s=verdict();
    for(let i=0;i<17;i++)s=applyContinuousCut(s,{x:.5,y:.5},true);
    expect(s.verdictDamageDealt).toBe(200);
    expect(s.battle.bossHp).toBe(600);
    expect(s.phase).toBe('stagger');
    expect(s.pointerId).toBeNull();
    expect(applyContinuousCut(s,{x:.5,y:.5},true)).toBe(s);
  });
  it('returns to parry after an empty three-second verdict',()=>{
    let s=tickCombat(verdict(),durations.verdict);
    expect(s.phase).toBe('stagger');
    expect(s.battle.bossHp).toBe(800);
    s=tickCombat(s,durations.stagger);
    expect(s.phase).toBe('telegraph');
    expect(s.battle.meter).toBe(0);
  });
  it.each(['corn','jelly'] as const)('allows a Good-only player to complete %s without damage',kind=>{
    let s:CombatState=createCombat(7,kind);
    for(let i=0;i<600&&s.phase!=='settle';i++){
      if(s.phase==='targetActive'){
        const target=s.targets.find(t=>!t.resolved)!;
        s=tickCombat(s,Math.max(1,target.startDelayMs-s.elapsed));
        s=tapTarget(s,target.targetIndex);
      }else if(s.phase==='verdictSlash'){
        s=applyContinuousCut(s,{x:.5,y:.5},true);
      }else s=tickCombat(s,1500);
    }
    expect(s.phase).toBe('settle');
    expect(s.battle.bossHp).toBe(0);
    expect(s.battle.playerHp).toBe(100);
    expect(s.battle.verdictCount).toBeLessThanOrEqual(4);
  });
});
