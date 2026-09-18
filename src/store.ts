import { create } from 'zustand';
import { applyContinuousCut, createCombat, startVerdict, tapTarget, tickCombat, type CombatState } from './domain/combat';
import type { BossKind } from './domain/v2';

type Screen='restaurant'|'stages'|'battle'|'result';
interface GameStore {
  screen:Screen; combat:CombatState; tutorialSeen:boolean;
  go:(screen:Screen)=>void; start:(bossKind?:BossKind)=>void; advance:(delta:number)=>void;
  tap:(index:number)=>void; pause:(paused:boolean)=>void; beginVerdict:()=>void;
  beginStroke:(pointerId:number,point:{x:number;y:number;time:number})=>void; moveStroke:(pointerId:number,point:{x:number;y:number;time:number})=>void;
  cut:(pointerId:number,point:{x:number;y:number},insideMonster:boolean)=>void; endStroke:(pointerId:number)=>void; cancelStroke:()=>void; dismissTutorial:()=>void;
}
export const useGame=create<GameStore>((set,get)=>({
  screen:'restaurant',combat:createCombat(),tutorialSeen:false,
  go:screen=>set({screen}),
  start:(bossKind='corn')=>set({screen:'battle',combat:createCombat(7319,bossKind)}),
  advance:delta=>{if(get().screen!=='battle')return;const combat=tickCombat(get().combat,delta);set({combat,screen:combat.phase==='settle'&&combat.elapsed>=1000?'result':'battle'})},
  tap:index=>set(s=>({combat:tapTarget(s.combat,index)})),
  pause:paused=>set(s=>({combat:{...s.combat,paused,pointerId:null,stroke:s.combat.phase==='verdictSlash'?null:s.combat.stroke}})),
  beginVerdict:()=>set(s=>({combat:startVerdict(s.combat)})),
  beginStroke:(pointerId,point)=>set(s=>({combat:s.combat.phase==='verdictSlash'&&!s.combat.paused&&s.combat.pointerId===null?{...s.combat,pointerId,stroke:{points:[point],hitWeakPointIds:[],score:0,valid:true}}:s.combat})),
  moveStroke:(pointerId,point)=>set(s=>({combat:s.combat.pointerId===pointerId&&s.combat.phase==='verdictSlash'&&!s.combat.paused&&s.combat.stroke?{...s.combat,stroke:{...s.combat.stroke,points:[...s.combat.stroke.points,point]}}:s.combat})),
  cut:(pointerId,point,insideMonster)=>set(s=>({combat:s.combat.pointerId===pointerId?applyContinuousCut(s.combat,point,insideMonster):s.combat})),
  endStroke:pointerId=>set(s=>({combat:s.combat.pointerId===pointerId?{...s.combat,pointerId:null}:s.combat})),
  cancelStroke:()=>set(s=>({combat:{...s.combat,pointerId:null,stroke:null}})),
  dismissTutorial:()=>set({tutorialSeen:true}),
}));
