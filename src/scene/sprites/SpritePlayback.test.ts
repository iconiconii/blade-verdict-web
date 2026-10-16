import { expect,it } from 'vitest';
import { createCombat, type CombatFeedback } from '../../domain/combat';
import { FeedbackManager } from '../../feedback/FeedbackManager';
import { ImpactPresentation } from '../ImpactPresentation';
import { SpritePlayback } from './SpritePlayback';

const hit=(id:number,kind:'Nice'|'Perfect'|'Miss',time=1000):CombatFeedback=>({
  id,kind,time,amount:1,energyGain:0,angle:0,position:{x:.5,y:.5},
  hitStopMs:kind==='Perfect'?80:kind==='Nice'?25:0,
});

function player(boss:'carrot'|'jelly'='carrot'){
  const base=createCombat(17,boss),journal=new FeedbackManager(),impact=new ImpactPresentation(),playback=new SpritePlayback(boss);
  return (time:number,events:CombatFeedback[]=[],extra:Partial<typeof base>={},reduced=false)=>{
    const state={...base,time,feedback:events.at(-1)??null,effects:events,...extra};
    const snapshot=journal.update(state),presentation=impact.update(state,reduced,snapshot.actorFeedback);
    return playback.update(state,snapshot.actorFeedback,presentation.hold,reduced);
  };
}

it.each([[120,1000/120],[60,1000/60]] as const)('subtracts the complete 80ms stop at %i Hz without catch-up',(_hz,step)=>{
  const update=player(),event=hit(1,'Perfect');
  update(1000,[event]);
  for(let time=1000+step;time<1150;time+=step){
    const pose=update(time,[event]);
    expect(pose.age).toBeCloseTo(Math.max(0,time-1080),6);
  }
  expect(update(1600,[event]).clip).toBe('Perfect');
  expect(update(1630,[event])).toMatchObject({clip:'Idle',age:0});
});

it('accounts for a hold even if no browser frames run until it ends',()=>{
  const update=player(),event=hit(1,'Perfect');
  update(1000,[event]);
  expect(update(1100,[event]).age).toBe(20);
});

it.each([false,true])('keeps simultaneous priority independent of order (%s)',reverse=>{
  const update=player(),events=reverse?[hit(1,'Perfect'),hit(2,'Nice')]:[hit(1,'Nice'),hit(2,'Perfect')];
  expect(update(1000,events).clip).toBe('Perfect');
  expect(update(1080,events).age).toBe(0);
  expect(update(1100,events).age).toBe(20);
});

it('upgrades a nearby Good to Perfect without accumulating both holds',()=>{
  const update=player(),good=hit(1,'Nice'),perfect=hit(2,'Perfect',1010);
  update(1000,[good]);
  expect(update(1010,[good,perfect])).toMatchObject({clip:'Perfect',age:0});
  expect(update(1080,[good,perfect]).age).toBe(0);
  expect(update(1090,[good,perfect]).age).toBe(10);
});

it('does not advance either the clip or its transition while paused',()=>{
  const update=player(),event=hit(1,'Perfect');
  update(1000,[event]);
  const pose=update(1120,[event]);
  expect(update(1120,[event],{paused:true})).toEqual(pose);
  expect(update(1120,[event],{paused:true})).toEqual(pose);
  expect(update(1130,[event]).age).toBe(pose.age+10);
});

it('finishes jelly reactions even when the short feedback journal expires',()=>{
  const update=player('jelly'),event=hit(1,'Perfect');
  update(1000,[event]);
  expect(update(1690,[])).toMatchObject({clip:'Perfect',age:610});
  expect(update(1700,[])).toMatchObject({clip:'Idle',age:0});
});

it('does not revive an old reaction after returning to Idle',()=>{
  const update=player(),event=hit(1,'Miss');
  update(1234,[event]);
  expect(update(1734,[event]).clip).toBe('Idle');
  expect(update(1750,[event])).toMatchObject({clip:'Idle',age:16});
});

it('lets verdict and death interrupt recovery immediately',()=>{
  const update=player(),event=hit(1,'Perfect');
  update(1000,[event]);
  expect(update(1010,[event],{phase:'verdictSlash'}).clip).toBe('Idle');
  const dying=player();dying(1000,[event]);
  expect(dying(1010,[event],{battle:{...createCombat().battle,bossHp:0}}).clip).toBe('Idle');
});

it('uses fixed poses without stop or blending for reduced motion',()=>{
  const update=player(),event=hit(1,'Perfect');
  const pose=update(1000,[event],{},true);
  expect(update(1050,[event],{},true).age).toBe(pose.age);
  expect(update(1550,[event],{},true)).toMatchObject({clip:'Idle',age:0});
});

it('resets consumed events and playback on restart',()=>{
  const update=player(),event=hit(1,'Perfect');
  update(1000,[event]);update(1400,[event]);
  expect(update(0,[])).toMatchObject({clip:'Idle',age:0,time:0});
  expect(update(10,[hit(1,'Perfect',10)])).toMatchObject({clip:'Perfect',age:0});
});
