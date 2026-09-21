import { create } from 'zustand';
import {
  buy as buyWorkshopItem, cook as cookWorkshop, equip as equipWorkshopItem,
  equippedVerdictDamageBonus, sell as sellWorkshopDish, sellAll as sellAllWorkshopDishes,
  type IngredientSelection, type MetaState,
} from './domain/meta';
import { createSave, settleBattle, type SavedWorkshop } from './domain/save';
import { readWorkshopSave, updateWorkshopSave } from './persistence';
import { applyContinuousCut, createCombat, tapTarget, tickCombat, type CombatState } from './domain/combat';
import type { BossKind } from './domain/v2';

// Bound input history even though the renderer no longer draws a pointer line.
const MAX_STROKE_POINTS = 513;
function appendStrokePoint(points:Array<{x:number;y:number;time:number}>, point:{x:number;y:number;time:number}) {
  const next = [...points, point];
  if (next.length <= MAX_STROKE_POINTS) return next;
  // Preserve recent input without retaining an unbounded touch history.
  return next.filter((_, index) => index % 2 === 0).slice(-MAX_STROKE_POINTS);
}

export type Screen='restaurant'|'stages'|'battle'|'result'|'kitchen'|'inventory'|'cookbook'|'sales'|'shop';
export interface Notice { kind:'success'|'error'; message:string }
interface PendingBattle { id:string; bossKind:BossKind; won:boolean }
interface GameStore {
  screen:Screen; combat:CombatState; meta:MetaState; save:SavedWorkshop; tutorialSeen:boolean;
  notice:Notice|null; saving:boolean; saveIssue:string|null; battleId:string|null; pendingBattle:PendingBattle|null;
  go:(screen:Screen)=>void; start:(bossKind?:BossKind)=>void; advance:(delta:number)=>void;
  tap:(index:number)=>void; pause:(paused:boolean)=>void;
  beginStroke:(pointerId:number,point:{x:number;y:number;time:number})=>void; moveStroke:(pointerId:number,point:{x:number;y:number;time:number})=>void;
  cut:(pointerId:number,point:{x:number;y:number},insideMonster:boolean,angle?:number)=>void; endStroke:(pointerId:number)=>void; cancelStroke:()=>void; dismissTutorial:()=>void;
  cook:(selected:IngredientSelection[])=>Promise<boolean>; sellDish:(instanceId:string)=>Promise<boolean>; sellAllDishes:()=>Promise<boolean>;
  buyItem:(itemId:string)=>Promise<boolean>; equipItem:(itemId:string|null)=>Promise<boolean>; clearNotice:()=>void;
  retrySettlement:()=>Promise<boolean>; refreshSave:()=>void;
}

function loadSave():{save:SavedWorkshop;issue:string|null}{
  try{return {save:readWorkshopSave(),issue:null}}
  catch(error){return {save:createSave(),issue:error instanceof Error?error.message:'存档读取失败，已暂停写入'}}
}
function randomId(prefix:string){
  return `${prefix}-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
}
function friendlyError(error:unknown){
  const text=error instanceof Error?error.message:'操作失败，请重试。';
  if(text.includes('Insufficient inventory'))return '食材不足，请重新选择品质或前往探险。';
  if(text.includes('Not enough coins'))return '金币不足，先到菜架出售料理吧。';
  if(text.includes('already purchased'))return '这件装备已经购买，无需重复购买。';
  if(text.includes('preview'))return '该商品是预览内容，目前尚未开放购买。';
  if(text.includes('Unknown pending dish'))return '这道料理已出售，请查看最新菜架。';
  return text;
}

const loaded=loadSave();
export const useGame=create<GameStore>((set,get)=>{
  // Read, validate, mutate and persist inside one origin-wide Web Lock.
  // Only acknowledge success after durable setItem; a rejected write leaves UI
  // inventory/coins unchanged. Domain rules are rechecked against the latest save.
  const transact=async (mutate:(save:SavedWorkshop)=>SavedWorkshop,message:string):Promise<boolean>=>{
    if(get().saving)return false;
    set({saving:true,notice:null});
    let ruleFailure=false;
    try{
      const save=await updateWorkshopSave(latest=>{
        try{return mutate(latest)}catch(error){ruleFailure=true;throw error}
      });
      set({save,meta:save.meta,tutorialSeen:save.tutorialSeen,saving:false,saveIssue:null,notice:message?{kind:'success',message}:null});
      return true;
    }catch(error){
      const message=friendlyError(error);
      set({saving:false,notice:{kind:'error',message},...(!ruleFailure?{saveIssue:message}: {})});
      return false;
    }
  };
  const transactMeta=(mutate:(meta:MetaState)=>MetaState,message:string)=>{
    if(get().pendingBattle)return Promise.resolve(false);
    return transact(save=>({...save,meta:mutate(save.meta)}),message);
  };
  return {
    screen:'restaurant',combat:createCombat(),save:loaded.save,meta:loaded.save.meta,tutorialSeen:loaded.save.tutorialSeen,
    notice:null,saving:false,saveIssue:loaded.issue,battleId:null,pendingBattle:null,
    refreshSave:()=>{
      if(get().saving)return;
      const loaded=loadSave();
      if(loaded.issue){set({saveIssue:loaded.issue});return}
      set({save:loaded.save,meta:loaded.save.meta,tutorialSeen:loaded.save.tutorialSeen,saveIssue:null});
    },
    go:screen=>{
      if(get().pendingBattle){set({notice:{kind:'error',message:'请先重试保存本场战利品，避免遗失。'}});return}
      get().refreshSave();set({screen,notice:null});
    },
    start:(bossKind='corn')=>{
      if(get().saving||get().pendingBattle)return;
      get().refreshSave();if(get().saveIssue)return;
      const seed=crypto.getRandomValues(new Uint32Array(1))[0];
      set({screen:'battle',battleId:randomId('hunt'),combat:createCombat(seed,bossKind,equippedVerdictDamageBonus(get().meta)),notice:null});
    },
    advance:delta=>{
      const current=get();if(current.screen!=='battle')return;
      const combat=tickCombat(current.combat,delta);
      if(combat.phase==='settle'&&combat.elapsed>=1000){
        const pendingBattle={id:current.battleId??randomId('hunt'),bossKind:combat.bossKind,won:combat.battle.bossHp<=0};
        set({combat,screen:'result',pendingBattle});
        void get().retrySettlement();
      }else set({combat});
    },
    retrySettlement:async()=>{
      const pending=get().pendingBattle;if(!pending)return true;
      const success=await transact(save=>settleBattle(save,pending.id,pending.bossKind,pending.won),pending.won?'战利品已入库 · 最高品质 ×3':'本场战斗已结束，没有损失原有库存。');
      if(success)set(s=>({pendingBattle:null,combat:{...s.combat,battle:{...s.combat.battle,loot:pending.won?[{quality:'Top',count:3}]:[]}}}));
      return success;
    },
    tap:index=>set(s=>({combat:tapTarget(s.combat,index)})),
    pause:paused=>set(s=>({combat:{...s.combat,paused,pointerId:null,stroke:s.combat.phase==='verdictSlash'?null:s.combat.stroke}})),
    beginStroke:(pointerId,point)=>set(s=>({combat:s.combat.phase==='verdictSlash'&&!s.combat.paused&&s.combat.pointerId===null?{...s.combat,pointerId,stroke:{points:[point],hitWeakPointIds:[],score:0,valid:true}}:s.combat})),
    moveStroke:(pointerId,point)=>set(s=>({combat:s.combat.pointerId===pointerId&&s.combat.phase==='verdictSlash'&&!s.combat.paused&&s.combat.stroke?{...s.combat,stroke:{...s.combat.stroke,points:appendStrokePoint(s.combat.stroke.points,point)}}:s.combat})),
    cut:(pointerId,point,insideMonster,angle)=>set(s=>({combat:s.combat.pointerId===pointerId?applyContinuousCut(s.combat,point,insideMonster,angle):s.combat})),
    endStroke:pointerId=>set(s=>({combat:s.combat.pointerId===pointerId?{...s.combat,pointerId:null}:s.combat})),
    cancelStroke:()=>set(s=>({combat:{...s.combat,pointerId:null,stroke:null}})),
    dismissTutorial:()=>{void transact(save=>({...save,tutorialSeen:true}),'')},
    cook:selected=>{const id=randomId('dish');return transactMeta(meta=>cookWorkshop(meta,selected,id).state,'料理已完成，放入待售菜架。')},
    sellDish:instanceId=>transactMeta(meta=>sellWorkshopDish(meta,instanceId).state,'料理已出售，金币已到账。'),
    sellAllDishes:()=>transactMeta(meta=>{
      if(!meta.pendingDishes.length)throw new Error('菜架上还没有待售料理。');
      return sellAllWorkshopDishes(meta).state;
    },'全部料理已出售，金币已到账。'),
    buyItem:itemId=>transactMeta(meta=>buyWorkshopItem(meta,itemId).state,'装备已购买并自动装备。'),
    equipItem:itemId=>transactMeta(meta=>itemId===null?{...meta,equippedWeaponId:null}:equipWorkshopItem(meta,itemId),itemId?'已切换装备':'已切回基础厨刀'),
    clearNotice:()=>set({notice:null}),
  };
});
