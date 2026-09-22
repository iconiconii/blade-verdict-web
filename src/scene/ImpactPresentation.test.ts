import { expect,it } from 'vitest';
import { createCombat,prepareRound,tapTarget,tickCombat } from '../domain/combat';
import { ImpactPresentation } from './ImpactPresentation';

it.each([[200,25],[800,45]])('holds only the actor for %i timing / %i ms', (timing,hold)=>{
  let s=prepareRound(createCombat());s=tickCombat(s,s.tempo.telegraphMs);
  s=tapTarget(tickCombat(s,timing),0);
  const presentation=new ImpactPresentation();
  expect(presentation.update(s).actor).toBe(s);
  const next=tickCombat(s,hold-1);
  expect(next.time).toBe(s.time+hold-1);
  expect(presentation.update(next).actor).toBe(s);
  const released=tickCombat(next,1);
  expect(presentation.update(released).actor).toBe(released);
});

it('does not extend a visual hold with rapid hits and suppresses reduced-motion shake',()=>{
  let s=prepareRound(createCombat());s=tickCombat(s,s.tempo.telegraphMs);s=tapTarget(s,0);
  const p=new ImpactPresentation();p.update(s);
  const next=tickCombat(s,30);
  const rapid={...next,effects:[...next.effects,{...s.feedback!,id:2,time:next.time}]};
  expect(p.update(rapid).actor).toBe(rapid);
  expect(p.update(rapid,true).shake).toBe(0);
});
