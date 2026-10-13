import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCombat, tapTarget, tickCombat, type CombatState } from './domain/combat';
import { consumableCount } from './domain/meta';
import { createSave, decodeSave, encodeSave } from './domain/save';
import { useGame } from './store';

const disk=vi.hoisted(()=>({value:null as string|null,fail:false}));
vi.mock('./persistence',async()=>{
  const real=await vi.importActual<typeof import('./persistence')>('./persistence');
  const repository=real.createSaveRepository({storage:{
    getItem:()=>disk.value,
    setItem:(_key,value)=>{if(disk.fail)throw new Error('storage full');disk.value=value},
  }});
  return {...real,readWorkshopSave:repository.read,updateWorkshopSave:repository.update};
});

function nextVerdict(initial:CombatState):CombatState {
  let state=initial;
  for(let step=0;step<3000;step++){
    if(state.phase==='verdictSlash')return state;
    if(state.phase==='targetActive'){
      for(const circle of state.targets)state=tapTarget(state,circle.circleId);
    }else state=tickCombat(state,50);
  }
  throw new Error('Could not reach the next verdict');
}
let battleNumber=0;
function enterVerdict(){
  const combat=nextVerdict(createCombat(31,'carrot',0,`consumable-battle-${++battleNumber}`));
  useGame.setState({screen:'battle',battleId:combat.battleId,combat});
  useGame.getState().beginStroke(7,{x:.5,y:.5,time:0});
}
function cut(inside=true){useGame.getState().cut(7,{x:.5,y:.5},inside)}
async function saved(){
  await vi.waitFor(()=>expect(useGame.getState().saving).toBe(false));
  // Release the store's pending-input guard after the save acknowledgement.
  await Promise.resolve();
}

describe('one-use battle items through the persisted store',()=>{
  beforeEach(()=>{
    const save=createSave();save.meta.coins=1000;save.clearedBossIds=['corn'];
    disk.value=encodeSave(save);disk.fail=false;
    useGame.setState({save,meta:save.meta,saving:false,saveIssue:null,notice:null,
      pendingBattle:null,screen:'shop',battleId:null,combat:createCombat()});
  });

  it('spends once for rapid cuts, once again in the next verdict, and stays consumed after refresh',async()=>{
    await useGame.getState().buyItem('upgrade_tomato_bomb');
    await useGame.getState().buyItem('upgrade_tomato_bomb');
    enterVerdict();
    const hp=useGame.getState().combat.battle.bossHp;
    cut();cut();cut();
    await saved();
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(1);
    expect(useGame.getState().combat.feedback?.bombDamage).toBe(10);
    expect(hp-useGame.getState().combat.battle.bossHp).toBe(21);
    cut();
    expect(useGame.getState().combat.feedback?.bombDamage).toBeUndefined();
    expect(consumableCount(useGame.getState().meta,'upgrade_tomato_bomb')).toBe(1);
    const next=nextVerdict(tickCombat(useGame.getState().combat,10_000));
    expect(next.battle.verdictCount).toBe(2);
    useGame.setState({combat:next});
    useGame.getState().beginStroke(7,{x:.5,y:.5,time:next.time});
    cut();await saved();
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(0);
    expect(useGame.getState().combat.feedback?.bombDamage).toBe(10);
    useGame.getState().go('stages');useGame.getState().start('carrot');
    expect(useGame.getState().combat.tomatoBombOwned).toBe(false);
    useGame.getState().refreshSave();
    expect(consumableCount(useGame.getState().meta,'upgrade_tomato_bomb')).toBe(0);
  });

  it('does not consume for empty swings or a hit cancelled by pause before the write',async()=>{
    await useGame.getState().buyItem('upgrade_tomato_bomb');enterVerdict();
    cut(false);
    expect(useGame.getState().saving).toBe(false);
    const hp=useGame.getState().combat.battle.bossHp;
    cut();useGame.getState().pause(true);await saved();
    expect(useGame.getState().combat.battle.bossHp).toBe(hp);
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(1);
    useGame.getState().pause(false);
    useGame.getState().beginStroke(7,{x:.5,y:.5,time:0});
    cut();await saved();
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(0);
  });

  it('cancels on exit and never applies old input to a replacement battle',async()=>{
    await useGame.getState().buyItem('upgrade_tomato_bomb');enterVerdict();
    cut();useGame.getState().go('stages');
    const replacement=createCombat(73,'corn',0,'replacement');
    useGame.setState({screen:'battle',battleId:'replacement',combat:replacement});
    await saved();
    expect(useGame.getState().combat).toBe(replacement);
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(1);
  });

  it.each(['pointercancel','pause-resume'])('does not replay a pending hit after %s',async reason=>{
    await useGame.getState().buyItem('upgrade_tomato_bomb');enterVerdict();
    const hp=useGame.getState().combat.battle.bossHp;
    cut();
    if(reason==='pointercancel')useGame.getState().cancelStroke();
    else {useGame.getState().pause(true);useGame.getState().pause(false)}
    await saved();
    expect(useGame.getState().combat.battle.bossHp).toBe(hp);
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(1);
  });

  it('keeps a valid cut when its finger lifts normally before the write completes',async()=>{
    await useGame.getState().buyItem('upgrade_tomato_bomb');enterVerdict();
    cut();useGame.getState().endStroke(7);await saved();
    expect(useGame.getState().combat.pointerId).toBeNull();
    expect(useGame.getState().combat.feedback?.bombDamage).toBe(10);
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(0);
  });

  it('preserves inventory and applies only ordinary damage when persistence fails',async()=>{
    await useGame.getState().buyItem('upgrade_tomato_bomb');enterVerdict();
    const hp=useGame.getState().combat.battle.bossHp;
    disk.fail=true;cut();await saved();
    expect(hp-useGame.getState().combat.battle.bossHp).toBe(11);
    expect(useGame.getState().combat.feedback?.bombDamage).toBeUndefined();
    expect(consumableCount(decodeSave(disk.value).meta,'upgrade_tomato_bomb')).toBe(1);
    cut();
    expect(useGame.getState().saving).toBe(false);
    expect(useGame.getState().combat.feedback?.bombDamage).toBeUndefined();
  });

  it('checks current durable inventory instead of granting a stale cached bomb',async()=>{
    await useGame.getState().buyItem('upgrade_tomato_bomb');enterVerdict();
    const otherTab=decodeSave(disk.value);otherTab.meta.ownedItems=[];
    disk.value=encodeSave(otherTab);
    const hp=useGame.getState().combat.battle.bossHp;
    cut();await saved();
    expect(hp-useGame.getState().combat.battle.bossHp).toBe(11);
    expect(useGame.getState().combat.feedback?.bombDamage).toBeUndefined();
    expect(consumableCount(useGame.getState().meta,'upgrade_tomato_bomb')).toBe(0);
  });
});
