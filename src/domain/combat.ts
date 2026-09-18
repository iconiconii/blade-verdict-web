import { aggregateParryResults, applyParry, cornAttack, deterministicTarget, jellyAttack, newBattle, resolveParry, type AttackConfig, type AttackPresentation, type BattlePhase, type BattleState, type BossKind, type ParryResult, type VerdictStroke, type VerdictWeakPoint } from './v2';

export interface CombatFeedback { id:number; kind:ParryResult|'Verdict'|'Cut'; amount:number; score?:number; position:{x:number;y:number}; time:number }
export interface CombatState {
  battle:BattleState; bossKind:BossKind; attack:AttackConfig; phase:BattlePhase; elapsed:number; time:number; round:number; seed:number;
  paused:boolean; targets:AttackPresentation[]; combo:number; bestCombo:number;
  feedback:CombatFeedback|null; stroke:VerdictStroke|null; pointerId:number|null; verdictDamageDealt:number; verdictCombo:number;
}
export const durations={intro:700,telegraph:400,impact:280,stagger:300,verdict:3000,settle:1000};
export const createCombat=(seed=7319,bossKind:BossKind='corn'):CombatState=>({battle:newBattle(),bossKind,attack:bossKind==='jelly'?jellyAttack:cornAttack,phase:'intro',elapsed:0,time:0,round:0,seed,paused:false,targets:[],combo:0,bestCombo:0,feedback:null,stroke:null,pointerId:null,verdictDamageDealt:0,verdictCombo:0});
const transition=(s:CombatState,phase:BattlePhase):CombatState=>({...s,phase,elapsed:0});
export function prepareRound(s:CombatState):CombatState {
  const count=s.bossKind==='jelly'?(s.round>=2&&(s.round+1)%2===1?2:1):(s.round>0&&s.round%3===2?2:1);
  return {...transition(s,'telegraph'),feedback:null,stroke:null,targets:Array.from({length:count},(_,i)=>({targetIndex:i,position:deterministicTarget(s.seed,s.round,i,count),startDelayMs:i*180,telegraphProgress:0,phase:'early',resolved:false}))};
}
function completeRound(s:CombatState,result:ParryResult,index:number):CombatState {
  const combo=result==='Miss'?0:s.combo+1;
  const battle=applyParry(s.battle,result,s.attack);
  if(battle.playerHp===0)battle.loot=[];
  return {...transition(s,'impact'),battle,combo,bestCombo:Math.max(s.bestCombo,combo),feedback:{id:s.round+1,kind:result,amount:result==='Miss'?s.attack.missDamage:result==='Nice'?s.attack.niceCounterDamage:s.attack.perfectCounterDamage,position:s.targets[index].position,time:s.time}};
}
export function tapTarget(s:CombatState,index:number):CombatState {
  if(s.paused||s.phase!=='targetActive')return s;
  const target=s.targets[index];
  if(!target||target.resolved||s.elapsed<target.startDelayMs)return s;
  const result=resolveParry(s.elapsed-target.startDelayMs,s.attack);
  const next={...s,targets:s.targets.map((t,i)=>i===index?{...t,resolved:true,result}:t)};
  if(result==='Miss')return completeRound(next,'Miss',index);
  if(next.targets.every(t=>t.resolved))return completeRound(next,aggregateParryResults(next.targets.map(t=>t.result!)),index);
  return next;
}
export function startVerdict(s:CombatState):CombatState {
  return s.phase==='verdictReady'&&!s.paused&&s.battle.meter===100?{...transition(s,'verdictSlash'),feedback:null,stroke:null,pointerId:null,verdictDamageDealt:0,verdictCombo:0}:s;
}
export function applyContinuousCut(s:CombatState,position:{x:number;y:number},insideMonster:boolean):CombatState {
  if(s.phase!=='verdictSlash'||s.paused||!insideMonster||s.verdictDamageDealt>=200)return s;
  const damage=Math.min(12,200-s.verdictDamageDealt,s.battle.bossHp);if(damage<=0)return s;
  const battle={...s.battle,bossHp:Math.max(0,s.battle.bossHp-damage)};
  const verdictCombo=s.verdictCombo+1,verdictDamageDealt=s.verdictDamageDealt+damage;
  const feedback:CombatFeedback={id:s.round+verdictCombo,kind:'Cut',amount:damage,position,time:s.time};
  const stroke=s.stroke?{...s.stroke,points:[...s.stroke.points],valid:true}:null;
  return battle.bossHp<=0||verdictDamageDealt>=200?{...transition({...s,battle,verdictCombo,verdictDamageDealt,feedback,stroke},'stagger'),pointerId:null}:{...s,battle,verdictCombo,verdictDamageDealt,feedback,stroke};
}
export function tickCombat(s:CombatState,delta:number):CombatState {
  if(s.paused||delta<=0)return s;
  const next={...s,elapsed:s.elapsed+delta,time:s.time+delta};
  switch(next.phase){
    case 'intro': return next.elapsed>=durations.intro?prepareRound(next):next;
    case 'telegraph':return next.elapsed>=durations.telegraph?transition(next,'targetActive'):next;
    case 'targetActive':{
      next.targets=next.targets.map(t=>{if(t.resolved)return t;const p=Math.max(0,Math.min(1,(next.elapsed-t.startDelayMs)/next.attack.telegraphMs));return{...t,telegraphProgress:p,phase:p<.35?'early':p<.7?'nice':p<=.9?'perfect':'late'}});
      const timedOut=next.targets.findIndex(t=>!t.resolved&&next.elapsed-t.startDelayMs>next.attack.telegraphMs);
      return timedOut>=0?completeRound(next,'Miss',timedOut):next;
    }
    case 'impact':return next.elapsed>=durations.impact?transition(next,'stagger'):next;
    case 'stagger':{
      const delay=next.feedback?.kind==='Verdict'?950:durations.stagger;
      if(next.elapsed<delay)return next;
      if(next.battle.bossHp<=0||next.battle.playerHp<=0)return transition(next,'settle');
      if(next.battle.meter>=100)return transition(next,'verdictReady');
      return prepareRound({...next,round:next.round+1});
    }
    case 'verdictSlash':return next.elapsed>=durations.verdict?transition(next,'stagger'):next;
    default:return next;
  }
}

// Same line/slope/L patterns as V2GameConfig, mapped onto the boss portrait.
export function weakPointsFor(verdictCount:number,width:number,height:number,bossKind:BossKind='corn'):VerdictWeakPoint[]{
  const patterns=bossKind==='jelly'?[[[.24,.68],[.74,.68],[.26,.36],[.76,.36]],[[.22,.66],[.45,.48],[.63,.68],[.78,.38]],[[.28,.62],[.68,.66],[.66,.36],[.4,.4]]]:[[[.22,.55],[.4,.55],[.58,.55],[.76,.55]],[[.22,.68],[.4,.59],[.58,.5],[.76,.41]],[[.3,.7],[.3,.52],[.3,.34],[.68,.34]]];
  const size=Math.min(width*.94,height*.76,650),radius=Math.max(22,Math.min(30,width*.065))/height;
  return patterns[verdictCount%3].map(([x,y],i)=>({id:`weak-${i}`,x:.27+x*.46,y:.28+(1-y)*.42,radius}));
}

export const targetDiameter=(width:number,height:number)=>Math.max(44,Math.min(64,Math.min(width,height)*.14));
export function targetCenter(position:{x:number;y:number},width:number,height:number){
  const inset=targetDiameter(width,height)*.8+12;
  return {x:Math.max(inset,Math.min(width-inset,position.x*width)),y:Math.max(130+inset,Math.min(height-125-inset,position.y*height))};
}
