import { expect,it } from 'vitest';
import { createCombat,prepareRound,tapTarget,tickCombat, type CombatFeedback, type CombatState } from '../domain/combat';
import { ImpactPresentation } from './ImpactPresentation';

it.each([[200,25],[800,80]])('holds only the actor for %i timing / %i ms', (timing,hold)=>{
  let s=prepareRound(createCombat());s=tickCombat(s,s.tempo.telegraphMs);
  s=tapTarget(tickCombat(s,timing),s.targets[0].circleId);
  const presentation=new ImpactPresentation();
  expect(presentation.update(s).actor).toBe(s);
  const next=tickCombat(s,hold-1);
  expect(next.time).toBe(s.time+hold-1);
  expect(presentation.update(next).actor).toBe(s);
  const released=tickCombat(next,1);
  expect(presentation.update(released).actor).toBe(released);
});

it('does not extend a visual hold with rapid hits and suppresses reduced-motion shake',()=>{
  let s=prepareRound(createCombat());s=tickCombat(s,s.tempo.telegraphMs);s=tapTarget(s,s.targets[0].circleId);
  const p=new ImpactPresentation();p.update(s);
  const next=tickCombat(s,30);
  const feedback={...s.feedback!,id:2,time:next.time};
  const rapid={...next,feedback,effects:[...next.effects,feedback]};
  expect(p.update(rapid).actor).toBe(rapid);
  expect(p.update(rapid,true).shake).toBe(0);
});

const contact=(id:number,kind:CombatFeedback['kind'],time=0):CombatFeedback=>({
  id,kind,time,amount:10,position:{x:.5,y:.5},energyGain:0,angle:0,hitStopMs:kind==='Perfect'?80:kind==='Miss'?0:25,
});
const withEvents=(events:CombatFeedback[],time=0):CombatState=>({
  ...createCombat(),phase:'targetActive',time,effects:events,feedback:events.at(-1)??null,
});

it('upgrades a simultaneous GOOD stop to PERFECT regardless of event order',()=>{
  for(const events of [[contact(1,'Nice'),contact(2,'Perfect')],[contact(1,'Perfect'),contact(2,'Nice')]]){
    const presentation=new ImpactPresentation(),initial=withEvents(events);
    expect(presentation.update(initial).actor.feedback?.kind).toBe('Perfect');
    const held=presentation.update(withEvents(events,79));
    expect(held.actor.time).toBe(0);
    expect(held.actor.feedback?.kind).toBe('Perfect');
    expect(presentation.update(withEvents(events,80)).actor.time).toBe(80);
  }
});

it('never adds overlapping stop durations and lets the other circle clock progress',()=>{
  const good=contact(1,'Nice'),perfect=contact(2,'Perfect',10),presentation=new ImpactPresentation();
  presentation.update(withEvents([good]));
  presentation.update(withEvents([good,perfect],10));
  expect(presentation.update(withEvents([good,perfect],79)).actor.time).toBe(10);
  expect(presentation.update(withEvents([good,perfect],80)).actor.time).toBe(80);
  const combat=withEvents([good,perfect],10),next=tickCombat(combat,60);
  expect(next.time).toBe(70);
});

it('uses the final blow immediately instead of keeping a living frozen actor',()=>{
  const presentation=new ImpactPresentation(),perfect=contact(1,'Perfect');
  presentation.update(withEvents([perfect]));
  const finish={...contact(2,'Cut',10),finisher:true,hitStopMs:80};
  const finalState=withEvents([perfect,finish],10);
  finalState.battle={...finalState.battle,bossHp:0};
  expect(presentation.update(finalState).actor.battle.bossHp).toBe(0);
  expect(presentation.update(finalState).actor.feedback?.finisher).toBe(true);
});
