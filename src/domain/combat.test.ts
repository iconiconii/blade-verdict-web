import { describe, expect, it } from 'vitest';
import { aggregateParryResults, deterministicTarget, resolveParry, verdictStroke } from './v2';
import { createCombat, finishStroke, prepareRound, tapTarget, tickCombat } from './combat';

describe('battle presentation state machine',()=>{
  it('uses deterministic target positions and a two-target cadence',()=>{
    expect(deterministicTarget(7319,0,0,1)).toEqual(deterministicTarget(7319,0,0,1));
    let combat=createCombat(7319);combat=tickCombat(combat,700);expect(combat.phase).toBe('telegraph');combat=tickCombat(combat,400);expect(combat.phase).toBe('targetActive');expect(combat.targets).toHaveLength(1);
    combat={...combat,round:2};combat=prepareRound(combat);expect(combat.targets).toHaveLength(2);expect(combat.targets[1].startDelayMs).toBe(180);
  });
  it('resolves one target only once and ignores late duplicate input',()=>{
    let combat=prepareRound(createCombat());combat=tickCombat(combat,400);expect(combat.phase).toBe('targetActive');combat={...combat,elapsed:720};
    combat=tapTarget(combat,0);expect(combat.phase).toBe('impact');expect(combat.battle.meter).toBe(30);expect(combat.battle.bossHp).toBe(788);const before=combat.battle;combat=tapTarget(combat,0);expect(combat.battle).toEqual(before);
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

describe('verdict stroke scoring',()=>{
  const weak=[{id:'a',x:.2,y:.5,radius:.06},{id:'b',x:.4,y:.5,radius:.06},{id:'c',x:.6,y:.5,radius:.06},{id:'d',x:.8,y:.5,radius:.06}];
  it('scores 0 to 4 unique weak points using the existing V2 mapping',()=>{
    expect(verdictStroke([{x:.5,y:.5,time:0},{x:.51,y:.5,time:1}],weak).score).toBe(0);
    expect(verdictStroke([{x:.05,y:.15,time:0},{x:.05,y:.85,time:1}],weak).score).toBe(10);
    expect(verdictStroke([{x:.1,y:.5,time:0},{x:.2,y:.5,time:1}],weak).score).toBe(35);
    expect(verdictStroke([{x:.1,y:.5,time:0},{x:.4,y:.5,time:1}],weak).score).toBe(67);
    expect(verdictStroke([{x:.1,y:.5,time:0},{x:.8,y:.5,time:1}],weak).score).toBe(100);
  });
  it('deduplicates a repeated weak point and rejects a short invalid stroke',()=>{
    const repeated=verdictStroke([{x:.1,y:.5,time:0},{x:.2,y:.5,time:1},{x:.2,y:.5,time:2}],weak);expect(repeated.hitWeakPointIds).toEqual(['a']);expect(repeated.score).toBe(35);
    const invalid=verdictStroke([{x:.2,y:.5,time:0}],weak);expect(invalid.valid).toBe(false);expect(invalid.score).toBe(0);
  });
  it('detects weak points between sparse pointer samples',()=>{
    const stroke=verdictStroke([{x:.1,y:.5,time:0},{x:.9,y:.5,time:1}],weak);expect(stroke.hitWeakPointIds).toEqual(['a','b','c','d']);expect(stroke.score).toBe(100);
  });
});
