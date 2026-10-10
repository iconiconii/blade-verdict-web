import { beforeEach, describe, expect, it } from 'vitest';
import { createCombat, tickCombat, type CombatState } from './domain/combat';
import { useGame } from './store';

function activeBattle(battleId:string):CombatState{
  let state=createCombat(19,'corn',0,battleId);
  for(let step=0;state.phase!=='targetActive'&&step<200;step++)state=tickCombat(state,50);
  return state;
}

describe('battle input lifecycle',()=>{
  beforeEach(()=>{
    useGame.setState({screen:'battle',battleId:'battle-a',combat:activeBattle('battle-a'),saving:false,saveIssue:null,pendingBattle:null});
  });

  it('accepts one matching circle only once',()=>{
    const circleId=useGame.getState().combat.targets[0].circleId;
    useGame.getState().tap({battleId:'battle-a',circleId});
    const after=useGame.getState().combat;
    expect(after.targets[0].resolved).toBe(true);
    useGame.getState().tap({battleId:'battle-a',circleId});
    expect(useGame.getState().combat).toBe(after);
  });

  it('rejects previous-battle input even when deterministic circle IDs coincide',()=>{
    const circleId=useGame.getState().combat.targets[0].circleId;
    const restarted=activeBattle('battle-b');
    useGame.setState({battleId:'battle-b',combat:restarted});
    useGame.getState().tap({battleId:'battle-a',circleId});
    expect(useGame.getState().combat).toBe(restarted);
  });

  it('rejects previous-round, paused and off-screen input',()=>{
    const state=useGame.getState().combat;
    useGame.getState().tap({battleId:'battle-a',circleId:'expired-round:0'});
    expect(useGame.getState().combat).toBe(state);
    useGame.getState().pause(true);
    const paused=useGame.getState().combat;
    useGame.getState().tap({battleId:'battle-a',circleId:state.targets[0].circleId});
    expect(useGame.getState().combat).toBe(paused);
    useGame.setState({screen:'stages',combat:state});
    useGame.getState().tap({battleId:'battle-a',circleId:state.targets[0].circleId});
    expect(useGame.getState().combat).toBe(state);
  });

  it('creates a unique shared battle identity on each restart',()=>{
    useGame.getState().start('corn');
    const first=useGame.getState();
    expect(first.combat.battleId).toBe(first.battleId);
    useGame.getState().start('corn');
    const second=useGame.getState();
    expect(second.battleId).not.toBe(first.battleId);
    expect(second.combat.battleId).toBe(second.battleId);
    expect(second.combat.enraged).toBe(false);
  });
});
