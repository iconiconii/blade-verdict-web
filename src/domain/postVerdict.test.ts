import { expect, it } from 'vitest';
import { createCombat, durations, startVerdict, tapTarget, tickCombat } from './combat';

it('acknowledges the first relay tap after verdict without settling the round twice',()=>{
  let s=createCombat(7319,'corn');
  s=startVerdict({...s,round:4,successfulParries:6,phase:'verdictReady',battle:{...s.battle,meter:100}});
  s=tickCombat(s,durations.verdict);
  s=tickCombat(s,durations.stagger);
  s=tickCombat(s,s.tempo.telegraphMs);
  expect(s.targets).toHaveLength(2);
  const before=s.battle;
  s=tapTarget(s,0);
  expect(s.targets[0].resolved).toBe(true);
  expect(s.feedback?.kind).toBe('Nice');
  expect(s.effects.at(-1)?.anchorId).toBe(s.targets[0].anchorId);
  expect(s.battle).toEqual(before);
  expect(tapTarget(s,0)).toBe(s);
});
