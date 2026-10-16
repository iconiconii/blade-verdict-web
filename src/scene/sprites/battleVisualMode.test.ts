import { expect,it } from 'vitest';
import { battleVisualMode } from './battleVisualMode';

it('uses supplied action frames for four monsters and retains tomato on Three',()=>{
  for(const boss of ['corn','jelly','carrot','cabbage'] as const)expect(battleVisualMode(boss)).toBe('sprite');
  expect(battleVisualMode('tomato')).toBe('three');
});
