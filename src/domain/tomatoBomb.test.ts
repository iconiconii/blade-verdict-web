import { describe, expect, it } from 'vitest';
import { applyContinuousCut, createCombat, startVerdict, tickCombat, verdictDurationFor } from './combat';
import { verdictPlanFor } from './levelConfig';
import type { BossKind } from './v2';

function ready(boss: BossKind = 'jelly', bonus = 0) {
  const state = createCombat(91, boss, bonus, 'bomb-test', true);
  const plan=verdictPlanFor(boss),stageIndex=plan?plan.length-1:0,stage=plan?.[stageIndex];
  return startVerdict({ ...state, stageIndex, stageGroupsResolved:stage?stage.singleGroups+stage.doubleGroups:0,
    stageCirclesResolved:stage?stage.singleGroups+stage.doubleGroups*2:0,
    phase: 'verdictReady', battle: { ...state.battle, meter: 100,verdictCount:stageIndex } });
}
const point = { x: .5, y: .5 };

describe('tomato bomb eligibility supplied by inventory consumption', () => {
  it('adds ten damage to only the first valid cut without energy or an extra combo', () => {
    let state = ready();
    state = applyContinuousCut(state, point, true);
    expect(state.battle.bossHp).toBe(778);
    expect(state.verdictDamageDealt).toBe(12);
    expect(state.verdictCombo).toBe(1);
    expect(state.battle.meter).toBe(0);
    expect(state.feedback).toMatchObject({ kind: 'Cut', amount: 22, bombDamage: 10, energyGain: 0 });
    state = applyContinuousCut(state, point, true);
    expect(state.battle.bossHp).toBe(766);
    expect(state.feedback?.bombDamage).toBeUndefined();
    expect(state.effects.filter(event => event.bombDamage !== undefined)).toHaveLength(1);
  });

  it('does not use the base damage cap and coexists with the cleaver', () => {
    let state = ready('jelly', 8);
    for (let index = 0; index < 50; index++) state = applyContinuousCut(state, point, true);
    expect(state.verdictDamageDealt).toBe(200);
    expect(state.battle.bossHp).toBe(582); // 200 base + 10 bomb + 8 cleaver.
    expect(state.phase).toBe('stagger');
  });

  it('includes the cap-completion cleaver damage in the last cut and its finisher', () => {
    const initial = ready('jelly', 8);
    let state = { ...initial, battle: { ...initial.battle, bossHp: 218 } };
    for (let index = 0; index < 17; index++) state = applyContinuousCut(state, point, true);
    expect(state.battle.bossHp).toBe(0);
    expect(state.verdictDamageDealt).toBe(200);
    expect(state.verdictCombo).toBe(17);
    expect(state.effects).toHaveLength(17);
    expect(state.effects.filter(event => event.bombDamage !== undefined)).toHaveLength(1);
    expect(state.effects.filter(event => event.finisher)).toHaveLength(1);
    expect(state.feedback).toMatchObject({ kind: 'Cut', amount: 16, finisher: true, hitStopMs: 80 });
    expect(state.phase).toBe('stagger');
    expect(applyContinuousCut(state, point, true)).toBe(state);
    expect(tickCombat(state, 100).battle.bossHp).toBe(0);
  });

  it('resolves bomb, cap and cleaver once before checking enrage or emitting feedback', () => {
    const initial = ready('tomato', 8);
    const state = { ...initial, verdictDamageDealt: 160, battle: { ...initial.battle, bossHp: 50 } };
    const hit = applyContinuousCut(state, point, true);
    expect(hit.battle.bossHp).toBe(0);
    expect(hit.enraged).toBe(false);
    expect(hit.enragedAt).toBeNull();
    expect(hit.feedback).toMatchObject({ amount: 50, bombDamage: 10, weaponDamage:8, finisher: true, hitStopMs: 80 });
    expect(hit.effects).toHaveLength(1);
    expect(hit.verdictDamageDealt).toBe(192);
    expect(hit.verdictCombo).toBe(1);
    expect(hit.battle.meter).toBe(0);
  });

  it('reports only actual remaining HP when the cleaver overkills a cap-completion hit', () => {
    const initial = ready('tomato', 8);
    const state = { ...initial, tomatoBombTriggered: true, verdictDamageDealt: 163, battle: { ...initial.battle, bossHp: 12 } };
    const hit = applyContinuousCut(state, point, true);
    expect(hit.feedback).toMatchObject({ amount: 12, finisher: true, hitStopMs: 80 });
    expect(hit.feedback?.bombDamage).toBeUndefined();
    expect(hit.battle.bossHp).toBe(0);
    expect(hit.verdictDamageDealt).toBe(175);
  });

  it('ignores misses, pauses, expired phases and dead combatants', () => {
    const state = ready();
    expect(applyContinuousCut(state, point, false)).toBe(state);
    const paused = { ...state, paused: true };
    expect(applyContinuousCut(paused, point, true)).toBe(paused);
    const dead = { ...state, battle: { ...state.battle, playerHp: 0 } };
    expect(applyContinuousCut(dead, point, true)).toBe(dead);
    const timeout = tickCombat(state, verdictDurationFor(state));
    expect(timeout.battle.bossHp).toBe(800);
    expect(timeout.tomatoBombTriggered).toBe(false);
    expect(applyContinuousCut(timeout, point, true)).toBe(timeout);
  });

  it('permits one new eligibility token at the next verdict, not per swipe', () => {
    const used = applyContinuousCut(ready(), point, true);
    const next = startVerdict({ ...used, phase: 'verdictReady', battle: { ...used.battle, meter: 100 } });
    expect(next.tomatoBombTriggered).toBe(false);
    expect(applyContinuousCut(next, point, true).feedback?.bombDamage).toBe(10);
  });

  it('finishes through the bomb without a later enrage or duplicate hit', () => {
    const base = ready('tomato');
    const state = { ...base, battle: { ...base.battle, bossHp: 40 } };
    const hit = applyContinuousCut(state, point, true);
    expect(hit.battle.bossHp).toBe(0);
    expect(hit.feedback).toMatchObject({ amount: 40, bombDamage: 8, finisher: true, hitStopMs: 80 });
    expect(hit.enraged).toBe(false);
    expect(applyContinuousCut(hit, point, true)).toBe(hit);
  });

  it('can cross the enrage threshold, and preserves damage without the upgrade', () => {
    const base = ready('tomato');
    const state = { ...base, battle: { ...base.battle, bossHp: 219 } };
    expect(applyContinuousCut(state, point, true).enraged).toBe(true);
    const unowned = { ...ready(), tomatoBombOwned: false };
    expect(applyContinuousCut(unowned, point, true).battle.bossHp).toBe(788);
  });
});
