import { describe, expect, it } from 'vitest';
import { applyContinuousCut, createCombat, durations, prepareRound, startVerdict, tapTarget, tickCombat, verdictDurationFor, type CombatState } from '../domain/combat';
import { swipeContact } from '../domain/swipe';
import { SwingAudioTracker, VerdictEndAudioTracker } from './BattleAudioFeedback';

function firstVerdict(kind:'corn'|'carrot'|'cabbage'|'tomato'|'jelly'='corn'){
  let s=prepareRound(createCombat(7319,kind));
  for(let i=0;i<100&&s.phase!=='verdictSlash';i++){
    if(s.phase==='telegraph')s=tickCombat(s,s.tempo.telegraphMs);
    else if(s.phase==='targetActive'){
      if(kind==='jelly')s=tickCombat(s,800);
      for(const target of s.targets)if(!target.resolved)s=tapTarget(s,target.circleId);
    }else if(s.phase==='verdictReady')s=startVerdict(s);
    else s=tickCombat(s,100);
  }
  expect(s.phase).toBe('verdictSlash');
  return s;
}

describe('audio-only verdict endings',()=>{
  it.each(['corn','carrot','cabbage','tomato','jelly'] as const)('observes %s empty timeout once without changing rules',kind=>{
    const observer=new VerdictEndAudioTracker(),s=firstVerdict(kind);
    const before=structuredClone(s);
    expect(observer.update(s)).toBe(false);
    const ended=tickCombat(s,verdictDurationFor(s));
    expect(observer.update(ended)).toBe(true);
    expect(observer.update(ended)).toBe(false);
    expect(observer.update(tickCombat(ended,durations.deathStagger))).toBe(false);
    expect(s).toEqual(before);
  });

  it('recognizes a cut that ends a stage, with a new battle resetting the key',()=>{
    const observer=new VerdictEndAudioTracker();
    for(const battleId of ['a','b']){
      let s={...firstVerdict(),battleId};
      observer.update(s);
      let sounds=0;
      for(let cut=0;cut<100&&s.phase==='verdictSlash';cut++){
        s=applyContinuousCut(s,{x:.5,y:.5},true);
        if(observer.update(s))sounds++;
      }
      expect(sounds).toBe(1);
      expect(s.battle.bossHp).toBe(0);
    }
  });

  it('does not replay a paused ending or mistake an ordinary stagger for a verdict',()=>{
    const observer=new VerdictEndAudioTracker(),s=firstVerdict('carrot');
    observer.update(s);
    const ended={...tickCombat(s,verdictDurationFor(s)),paused:true};
    expect(observer.update(ended)).toBe(false);
    expect(observer.update({...ended,paused:false})).toBe(false);
    const parry=prepareRound(createCombat());
    expect(observer.update({...parry,phase:'stagger'})).toBe(false);
  });
});

describe('audio-only empty swing detection',()=>{
  const inside=(p:{x:number;y:number})=>p.x>.4&&p.x<.6&&p.y>.3&&p.y<.7;
  const sample=(from:{x:number;y:number},to:{x:number;y:number})=>swipeContact(from,to,390,844,inside);
  const verdict=():CombatState=>({...createCombat(),phase:'verdictSlash'});

  it('plays only once for a complete empty swing, not clicks or finger jitter',()=>{
    const observer=new SwingAudioTracker(),s=verdict();
    observer.begin(1,s);
    expect(observer.finish(1,s)).toBe(false);
    observer.begin(2,s);
    observer.sample(2,sample({x:.1,y:.1},{x:.11,y:.11}));
    expect(observer.finish(2,s)).toBe(false);
    observer.begin(3,s);
    observer.sample(3,sample({x:.1,y:.1},{x:.9,y:.1}));
    expect(observer.finish(3,s)).toBe(true);
    expect(observer.finish(3,s)).toBe(false);
  });

  it('counts body contact before an asynchronous bomb hit produces a feedback event',()=>{
    const observer=new SwingAudioTracker(),s=verdict();
    observer.begin(1,s);
    observer.sample(1,sample({x:.1,y:.1},{x:.9,y:.1}));
    observer.sample(1,sample({x:.1,y:.5},{x:.9,y:.5}));
    expect(s.feedback).toBeNull();
    expect(observer.finish(1,s)).toBe(false);
  });

  it('ignores cancellation, hidden/pause, ended verdict and stale battle inputs',()=>{
    const s=verdict(),miss=sample({x:.1,y:.1},{x:.9,y:.1});
    for(const after of [{...s,paused:true},{...s,phase:'stagger' as const},{...s,battleId:'next'},
      {...s,battle:{...s.battle,verdictCount:s.battle.verdictCount+1}}]){
      const observer=new SwingAudioTracker();observer.begin(1,s);observer.sample(1,miss);
      expect(observer.finish(1,after)).toBe(false);
    }
    const observer=new SwingAudioTracker();observer.begin(1,s);observer.sample(1,miss);
    expect(observer.finish(1,s,true)).toBe(false);
    observer.begin(1,s);observer.sample(1,miss);observer.cancel();
    expect(observer.finish(1,s)).toBe(false);
  });

  it('does not let another pointer end or contaminate the active gesture',()=>{
    const observer=new SwingAudioTracker(),s=verdict();
    observer.begin(1,s);observer.sample(2,sample({x:.1,y:.5},{x:.9,y:.5}));
    observer.sample(1,sample({x:.1,y:.1},{x:.9,y:.1}));
    expect(observer.finish(2,s)).toBe(false);
    expect(observer.finish(1,s)).toBe(true);
  });
});
