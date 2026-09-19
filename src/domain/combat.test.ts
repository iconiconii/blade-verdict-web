import { describe, expect, it } from 'vitest';
import { aggregateParryResults, applyParry, deterministicBodyAnchor, deterministicTarget, jellyAttack, newBattle, resolveParry } from './v2';
import { applyContinuousCut, createCombat, doubleLateGrace, doubleTargetDelay, prepareRound, startVerdict, tapTarget, tickCombat } from './combat';

describe('battle presentation state machine',()=>{
  it('uses Jelly V2 timing and split cadence without changing verdict rules',()=>{
    expect(jellyAttack.telegraphMs).toBe(700);expect(jellyAttack.missDamage).toBe(8);expect(jellyAttack.perfectMeterGain).toBe(30);expect(jellyAttack.niceMeterGain).toBe(10);expect(resolveParry(560,jellyAttack)).toBe('Perfect');expect(applyParry(newBattle(),'Miss',jellyAttack).playerHp).toBe(92);
    let combat=createCombat(7319,'jelly');combat=tickCombat(combat,700);combat=tickCombat(combat,400);expect(combat.targets).toHaveLength(1);combat={...combat,round:2};combat=prepareRound(combat);expect(combat.targets).toHaveLength(2);expect(combat.targets[1].startDelayMs).toBe(doubleTargetDelay);expect(resolveParry(jellyAttack.telegraphMs+220,jellyAttack,doubleLateGrace)).toBe('Perfect');
  });
  it('uses deterministic target positions and a two-target cadence',()=>{
    expect(deterministicTarget(7319,0,0,1)).toEqual(deterministicTarget(7319,0,0,1));
    expect(deterministicBodyAnchor(7319,0,0,1,'corn')).toBe(deterministicBodyAnchor(7319,0,0,1,'corn'));
    expect(deterministicBodyAnchor(7319,0,0,2,'corn')).not.toBe(deterministicBodyAnchor(7319,0,1,2,'corn'));
    let combat=createCombat(7319);combat=tickCombat(combat,700);expect(combat.phase).toBe('telegraph');combat=tickCombat(combat,400);expect(combat.phase).toBe('targetActive');expect(combat.targets).toHaveLength(1);
    combat={...combat,round:2};combat=prepareRound(combat);expect(combat.targets).toHaveLength(2);expect(combat.targets[1].startDelayMs).toBe(doubleTargetDelay);
  });
  it('resolves one target only once and ignores late duplicate input',()=>{
    let combat=prepareRound(createCombat());combat=tickCombat(combat,400);expect(combat.phase).toBe('targetActive');combat={...combat,elapsed:720};
    combat=tapTarget(combat,0);expect(combat.phase).toBe('impact');expect(combat.battle.meter).toBe(30);expect(combat.battle.bossHp).toBe(788);const before=combat.battle;combat=tapTarget(combat,0);expect(combat.battle).toEqual(before);
  });
  it('lets a double round finish after an early miss before aggregating the result',()=>{
    let combat={...createCombat(),round:2};combat=prepareRound(combat);combat=tickCombat(combat,400);combat=tapTarget(combat,0);expect(combat.phase).toBe('targetActive');expect(combat.targets[0].resolved).toBe(true);expect(combat.targets[1].resolved).toBe(false);combat=tickCombat(combat,doubleTargetDelay);combat=tapTarget(combat,1);expect(combat.phase).toBe('impact');expect(combat.feedback?.kind).toBe('Miss');
  });
  it('a timeout cannot deal damage twice',()=>{
    let combat=prepareRound(createCombat());combat=tickCombat(combat,400);combat=tickCombat(combat,901);expect(combat.phase).toBe('impact');expect(combat.battle.playerHp).toBe(88);combat=tickCombat(combat,20);expect(combat.battle.playerHp).toBe(88);
  });
  it('aggregates double targets with any miss and all-perfect rules',()=>{
    expect(aggregateParryResults(['Perfect','Perfect'])).toBe('Perfect');expect(aggregateParryResults(['Perfect','Nice'])).toBe('Nice');expect(aggregateParryResults(['Perfect','Miss'])).toBe('Miss');
  });
  it('moves through impact, stagger, and verdict-ready without changing V2 damage',()=>{
    let combat=createCombat();combat=prepareRound(combat);combat=tickCombat(combat,400);combat={...combat,elapsed:720};combat=tapTarget(combat,0);combat=tickCombat(combat,300);expect(combat.phase).toBe('stagger');combat=tickCombat(combat,300);expect(combat.phase).toBe('telegraph');
    combat={...combat,battle:{...combat.battle,meter:100},phase:'stagger',elapsed:300};combat=tickCombat(combat,1);expect(combat.phase).toBe('verdictReady');
  });
});

describe('continuous subject cutting',()=>{
  const ready=()=>startVerdict({...createCombat(),battle:{...createCombat().battle,meter:100},phase:'verdictReady'});
  it('applies a fixed twelve damage per valid subject segment and ignores outside segments',()=>{
    let combat=ready();combat=applyContinuousCut(combat,{x:.5,y:.5},false);expect(combat.battle.bossHp).toBe(800);combat=applyContinuousCut(combat,{x:.5,y:.5},true);expect(combat.battle.bossHp).toBe(788);expect(combat.verdictCombo).toBe(1);expect(combat.verdictDamageDealt).toBe(12);
  });
  it('caps a verdict at two hundred damage and ends the phase',()=>{
    let combat=ready();for(let i=0;i<17;i++)combat=applyContinuousCut(combat,{x:.5,y:.5},true);expect(combat.verdictDamageDealt).toBe(200);expect(combat.verdictCombo).toBe(17);expect(combat.phase).toBe('stagger');expect(combat.battle.bossHp).toBe(600);
  });
  it('ends the four-point-five second window without applying a scored line hit',()=>{
    let combat=ready();expect(combat.battle.meter).toBe(0);combat=tickCombat(combat,4501);expect(combat.phase).toBe('stagger');expect(combat.battle.bossHp).toBe(800);expect(combat.verdictDamageDealt).toBe(0);combat=tickCombat(combat,300);expect(combat.phase).toBe('telegraph');expect(combat.battle.meter).toBe(0);
  });
});
