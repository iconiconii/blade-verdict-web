import { create } from 'zustand';
import { createCombat, finishStroke, startVerdict, tapTarget, tickCombat, type CombatState } from './domain/combat';
import type { VerdictStroke } from './domain/v2';

type Screen='restaurant'|'stages'|'battle'|'result';
interface GameStore {
  screen:Screen; combat:CombatState; tutorialSeen:boolean;
  go:(screen:Screen)=>void; start:()=>void; advance:(delta:number)=>void;
  tap:(index:number)=>void; pause:(paused:boolean)=>void; beginVerdict:()=>void;
  beginStroke:(pointerId:number)=>void; updateStroke:(pointerId:number,stroke:VerdictStroke)=>void;
  endStroke:(pointerId:number,stroke:VerdictStroke)=>void; cancelStroke:()=>void; dismissTutorial:()=>void;
}
export const useGame=create<GameStore>((set,get)=>({
  screen:'restaurant',combat:createCombat(),tutorialSeen:false,
  go:screen=>set({screen}),
  start:()=>set({screen:'battle',combat:createCombat()}),
  advance:delta=>{if(get().screen!=='battle')return;const combat=tickCombat(get().combat,delta);set({combat,screen:combat.phase==='settle'&&combat.elapsed>=1000?'result':'battle'})},
  tap:index=>set(s=>({combat:tapTarget(s.combat,index)})),
  pause:paused=>set(s=>({combat:{...s.combat,paused,pointerId:null,stroke:s.combat.phase==='verdictSlash'?null:s.combat.stroke}})),
  beginVerdict:()=>set(s=>({combat:startVerdict(s.combat)})),
  beginStroke:pointerId=>set(s=>({combat:s.combat.phase==='verdictSlash'&&!s.combat.paused&&s.combat.pointerId===null?{...s.combat,pointerId,stroke:null}:s.combat})),
  updateStroke:(pointerId,stroke)=>set(s=>({combat:s.combat.pointerId===pointerId&&s.combat.phase==='verdictSlash'&&!s.combat.paused?{...s.combat,stroke}:s.combat})),
  endStroke:(pointerId,stroke)=>set(s=>({combat:s.combat.pointerId===pointerId?finishStroke(s.combat,stroke):s.combat})),
  cancelStroke:()=>set(s=>({combat:{...s.combat,pointerId:null,stroke:null}})),
  dismissTutorial:()=>set({tutorialSeen:true}),
}));
