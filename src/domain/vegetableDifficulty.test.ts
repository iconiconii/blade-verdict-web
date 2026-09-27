import { describe, expect, it } from 'vitest';
import { createCombat, tempoFor } from './combat';
import { bossMaxHp, type BossKind } from './v2';

const vegetables:['corn','carrot','cabbage','tomato']=['corn','carrot','cabbage','tomato'];

describe('vegetable guardian difficulty ladder',()=>{
  it('tightens ring time, radius and telegraph in UI order',()=>{
    const warm=vegetables.map(kind=>tempoFor(kind,0));
    expect(warm.map(value=>value.durationMs)).toEqual([1800,1700,1600,1500]);
    expect(warm.map(value=>value.maxRadiusPx)).toEqual([90,86,82,78]);
    expect(warm.map(value=>value.telegraphMs)).toEqual([400,380,350,320]);
  });

  it('gives later vegetables tougher health without changing the save shape',()=>{
    const states=vegetables.map(kind=>createCombat(7319,kind as BossKind));
    expect(states.map(state=>state.battle.bossHp)).toEqual([800,860,920,1000]);
    expect(states.map(state=>state.attack.missDamage)).toEqual([12,14,16,18]);
    expect(states.map(state=>state.attack.verdictDamageCap)).toEqual([200,190,180,170]);
    expect(bossMaxHp('tomato')).toBe(1000);
  });
});
