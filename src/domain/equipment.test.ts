import { describe, expect, it } from 'vitest';
import { createCombat, startVerdict, tickCombat, applyContinuousCut, durations } from './combat';
import { buy, createMetaState, equippedVerdictDamageBonus } from './meta';

describe('workshop equipment in hosted combat',()=>{
  const begin=(bonus=0)=>{
    const state=createCombat(7319,'jelly',bonus);
    return startVerdict({...state,phase:'verdictReady',battle:{...state.battle,meter:100}});
  };
  it('snapshots the equipped bonus into a new battle',()=>{
    const meta=buy(createMetaState({coins:120}),'weapon_corn_cleaver').state;
    expect(createCombat(1,'corn',equippedVerdictDamageBonus(meta)).verdictBonusDamage).toBe(8);
  });
  it('counts a verdict once and clears its energy',()=>{
    const state=begin();expect(state.battle.verdictCount).toBe(1);expect(state.battle.meter).toBe(0);
    expect(startVerdict(state)).toBe(state);
  });
  it('applies the cleaver bonus once on timeout and leaves bare hands unchanged',()=>{
    let state=tickCombat(begin(8),durations.verdict);
    expect(state.battle.bossHp).toBe(792);expect(state.phase).toBe('stagger');
    state=tickCombat(state,100);expect(state.battle.bossHp).toBe(792);
    expect(tickCombat(begin(),durations.verdict).battle.bossHp).toBe(800);
  });
  it('does not multiply the bonus by swipe count',()=>{
    let state=begin(8);state=applyContinuousCut(state,{x:.5,y:.5},true);
    expect(state.battle.bossHp).toBe(788);
    for(let i=0;i<16;i++)state=applyContinuousCut(state,{x:.5,y:.5},true);
    expect(state.battle.bossHp).toBe(592);expect(state.verdictDamageDealt).toBe(200);
    expect(applyContinuousCut(state,{x:.5,y:.5},true)).toBe(state);
  });
});
