import { describe, expect, it } from 'vitest';
import { createCombat, tempoFor } from './combat';
import { bossMaxHp, type BossKind } from './v2';

const vegetables:['corn','carrot','cabbage','tomato']=['corn','carrot','cabbage','tomato'];

describe('vegetable guardian difficulty ladder',()=>{
  it('uses the three configured levels and preserves each initial radius',()=>{
    const warm=vegetables.map(kind=>tempoFor(kind,0));
    expect(warm.map(value=>value.durationMs)).toEqual([1440,1200,1800/1.75,1800/1.75]);
    expect(warm.map(value=>value.maxRadiusPx)).toEqual([90,86,82,78]);
    expect(warm.map(value=>value.telegraphMs)).toEqual([400,380,270,270]);
    expect(warm.map(value=>value.attackIntervalMs)).toEqual([1400,1100,850,850]);
    expect(vegetables.map(kind=>tempoFor(kind,99))).toEqual(warm);
  });

  it('gives later vegetables tougher health without changing the save shape',()=>{
    const states=vegetables.map(kind=>createCombat(7319,kind as BossKind));
    expect(states.map(state=>state.battle.bossHp)).toEqual([800,860,920,1000]);
    expect(states.map(state=>state.attack.missDamage)).toEqual([12,14,16,18]);
    expect(states.map(state=>state.attack.verdictDamageCap)).toEqual([200,190,180,170]);
    expect(bossMaxHp('tomato')).toBe(1000);
  });
});
