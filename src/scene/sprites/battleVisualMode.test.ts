import { expect,it } from 'vitest';
import { battleVisualMode } from './battleVisualMode';

it('uses supplied action frames for all five monsters including tomato',()=>{
  for(const boss of ['corn','jelly','carrot','cabbage','tomato'] as const)expect(battleVisualMode(boss)).toBe('sprite');
});
