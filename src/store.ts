import { create } from 'zustand';
import { applyParry, applyVerdict, newBattle, type BattleState, type ParryResult } from './domain/v2';
type Screen='restaurant'|'stages'|'battle'|'result';
interface GameStore {screen:Screen;battle:BattleState;lastResult:string;go:(s:Screen)=>void;start:()=>void;parry:(r:ParryResult)=>void;verdict:(score:number)=>void;finish:()=>void}
export const useGame=create<GameStore>((set)=>({screen:'restaurant',battle:newBattle(),lastResult:'',go:screen=>set({screen}),start:()=>set({screen:'battle',battle:newBattle(),lastResult:''}),parry:r=>set(x=>({battle:applyParry(x.battle,r),lastResult:r==='Miss'?'失误 · 生命 -12':`${r} · 反击`})),verdict:score=>set(x=>({battle:applyVerdict(x.battle,score),lastResult:`裁决 ${score} 分`})),finish:()=>set({screen:'result'})}));
