export type Quality = 'Broken' | 'Normal' | 'High' | 'Top';
export type ParryResult = 'Perfect' | 'Nice' | 'Miss';
export type ParryPhase = 'EarlyMiss' | 'Nice' | 'Perfect' | 'LateMiss';
export interface AttackConfig { telegraphMs:number; missDamage:number; perfectCounterDamage:number; niceCounterDamage:number; perfectMeterGain:number; niceMeterGain:number }
export const cornAttack: AttackConfig = { telegraphMs:900, missDamage:12, perfectCounterDamage:12, niceCounterDamage:8, perfectMeterGain:30, niceMeterGain:18 };
export const parryPhase = (progress:number):ParryPhase => progress < .35 ? 'EarlyMiss' : progress < .7 ? 'Nice' : progress <= .9 ? 'Perfect' : 'LateMiss';
export const ringRatio = (p:number) => { p=Math.max(0,Math.min(1,p)); const lerp=(a:number,b:number,t:number)=>a+(b-a)*t; return p<.35?lerp(3,2.2,p/.35):p<.7?lerp(2.2,1.2,(p-.35)/.35):p<=.9?lerp(1.2,.8,(p-.7)/.2):lerp(.8,.25,(p-.9)/.1) };
export function resolveParry(elapsedMs:number, attack= cornAttack):ParryResult { if(elapsedMs>attack.telegraphMs) return 'Miss'; const phase=parryPhase(Math.max(0,elapsedMs/attack.telegraphMs)); return phase==='Perfect'?'Perfect':phase==='Nice'?'Nice':'Miss' }
export const scoreForHitCount=(valid:boolean,hits:number)=>!valid?0:[10,35,67,90,100][Math.max(0,Math.min(4,hits))];
export const damageForScore=(score:number)=>Math.round(160+Math.max(0,Math.min(100,score))*4.8);
export const qualityForScore=(score:number):Quality=>score>=95?'Top':score>=85?'High':score>=50?'Normal':'Broken';
export interface BattleState { playerHp:number; bossHp:number; meter:number; remainingParts:number; verdictCount:number; loot:{quality:Quality;count:number}[] }
export const newBattle=():BattleState=>({playerHp:100,bossHp:800,meter:0,remainingParts:3,verdictCount:0,loot:[]});
export function applyParry(state:BattleState,result:ParryResult,attack=cornAttack):BattleState { const s={...state}; if(result==='Miss') s.playerHp=Math.max(0,s.playerHp-attack.missDamage); else {s.bossHp=Math.max(0,s.bossHp-(result==='Perfect'?attack.perfectCounterDamage:attack.niceCounterDamage));s.meter=Math.min(100,s.meter+(result==='Perfect'?attack.perfectMeterGain:attack.niceMeterGain))} return s }
export function applyVerdict(state:BattleState,score:number):BattleState { if(state.meter<100) throw Error('Verdict requires a full meter'); const s={...state,loot:[...state.loot],meter:0,verdictCount:state.verdictCount+1}; const amount=Math.min(score>=95?2:score>=20?1:0,s.remainingParts); if(amount){s.loot.push({quality:qualityForScore(score),count:amount});s.remainingParts-=amount} s.bossHp=Math.max(0,s.bossHp-damageForScore(score)); if(!s.bossHp&&s.remainingParts){s.loot.push({quality:'Broken',count:s.remainingParts});s.remainingParts=0} return s }
