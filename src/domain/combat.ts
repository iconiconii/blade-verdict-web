import {
  applyParry, cornAttack, deterministicBodyAnchor, deterministicTarget, jellyAttack,
  newBattle, resolveRingParry, ringPhaseAt,
  type AttackConfig, type AttackPresentation, type BattlePhase, type BattleState,
  type BodyAnchorId, type BossKind, type ParryResult, type VerdictStroke,
} from './v2';

export interface CombatFeedback {
  pendingRound?:boolean;
  id:number; kind:ParryResult|'Verdict'|'Cut'; amount:number; score?:number;
  position:{x:number;y:number}; anchorId?:BodyAnchorId; time:number;
  energyGain:number; angle:number; path?:Array<{x:number;y:number;time:number}>; speed?:'normal'|'fast'|'ferocious'; hitStopMs?:number; finisher?:boolean;
}
export interface CombatTempo { durationMs:number; maxRadiusPx:number; telegraphMs:number; label:string }
export interface CombatState {
  battle:BattleState; bossKind:BossKind; attack:AttackConfig; phase:BattlePhase;
  elapsed:number; time:number; round:number; seed:number; paused:boolean;
  targets:AttackPresentation[]; combo:number; bestCombo:number; successfulParries:number;
  tempo:CombatTempo; feedback:CombatFeedback|null; effects:CombatFeedback[]; feedbackSequence:number;
  hitStopRemainingMs:number; stroke:VerdictStroke|null; pointerId:number|null;
  verdictDamageDealt:number; verdictCombo:number; verdictBonusDamage:number;
  fever:boolean; feverStartedAt:number|null;
}

export const relayDelayMs = 420;
export const feverConfig={comboThreshold:5,durationMs:3000};
export const deathFallDurationMs=1250;
export const verdictRemainingMs=(s:CombatState)=>Math.max(0,s.feverStartedAt===null
  ?durations.verdict-s.elapsed:feverConfig.durationMs-(s.time-s.feverStartedAt));
export const durations = { intro:1000, ready:650, telegraph:400, impact:280, stagger:300, deathStagger:1200, verdictReady:650, verdict:3000, settle:1000 };

/** Difficulty follows successful play, never time spent failing. */
export function tempoFor(bossKind:BossKind,successfulParries:number):CombatTempo {
  const warmup=bossKind==='jelly'?5:6, final=bossKind==='jelly'?11:14;
  if(successfulParries<warmup)return {durationMs:1800,maxRadiusPx:90,telegraphMs:400,label:'热身'};
  if(successfulParries<final)return {durationMs:1650,maxRadiusPx:82,telegraphMs:340,label:'熟练'};
  return {durationMs:1500,maxRadiusPx:76,telegraphMs:280,label:'疾风'};
}

export const createCombat=(seed=7319,bossKind:BossKind='corn',verdictBonusDamage=0):CombatState=>({
  battle:newBattle(),bossKind,attack:bossKind==='jelly'?jellyAttack:cornAttack,
  phase:'intro',elapsed:0,time:0,round:0,seed,paused:false,targets:[],combo:0,bestCombo:0,
  successfulParries:0,tempo:tempoFor(bossKind,0),feedback:null,effects:[],feedbackSequence:0,
  hitStopRemainingMs:0,stroke:null,pointerId:null,verdictDamageDealt:0,verdictCombo:0,
  verdictBonusDamage,fever:false,feverStartedAt:null,
});
const transition=(s:CombatState,phase:BattlePhase):CombatState=>({...s,phase,elapsed:0});
function emit(s:CombatState,event:Omit<CombatFeedback,'id'|'time'>):CombatState {
  const feedback={...event,id:s.feedbackSequence+1,time:s.time};
  return {...s,feedback,feedbackSequence:feedback.id,effects:[...s.effects,feedback].slice(-24)};
}
export function prepareRound(s:CombatState):CombatState {
  const tempo=tempoFor(s.bossKind,s.successfulParries);
  const double=tempo.durationMs<1800&&(s.bossKind==='jelly'?s.round%2===0:s.round%3===2);
  const count=double?2:1;
  return {...transition(s,'telegraph'),tempo,feedback:null,stroke:null,fever:false,targets:Array.from({length:count},(_,i)=>({
    targetIndex:i,anchorId:deterministicBodyAnchor(s.seed,s.round,i,count,s.bossKind),
    position:deterministicTarget(s.seed,s.round,i,count,s.bossKind),
    // The second ring has no running clock until the first has resolved.
    startDelayMs:i===0?0:Infinity,ringElapsedMs:0,ringDurationMs:tempo.durationMs,
    maxRadiusPx:tempo.maxRadiusPx,telegraphProgress:0,phase:'early',resolved:false,
  }))};
}

function resolveContact(s:CombatState,index:number,result:ParryResult):CombatState {
  const target=s.targets[index];
  const targets=s.targets.map((t,i)=>i===index?{...t,resolved:true,result}:t);
  if(targets.length>1&&!targets.every(t=>t.resolved)){
    return emit({...s,targets:targets.map((t,i)=>i===index+1?{...t,startDelayMs:s.elapsed+relayDelayMs}:t),
      hitStopRemainingMs:0},
      {kind:result,amount:0,energyGain:0,pendingRound:true,position:target.position,
        anchorId:target.anchorId,angle:index%2?-.65:.65,hitStopMs:result==='Miss'?0:result==='Perfect'?45:25});
  }
  const aggregate=targets.length>1?(targets.some(t=>t.result==='Miss')?'Miss':targets.every(t=>t.result==='Perfect')?'Perfect':'Nice'):result;
  const battle=applyParry(s.battle,aggregate,s.attack);
  const combo=aggregate==='Miss'?0:s.combo+1;
  const next=emit({...s,battle,targets,combo,bestCombo:Math.max(s.bestCombo,combo),
    successfulParries:s.successfulParries+(aggregate==='Miss'?0:1),hitStopRemainingMs:0,
  },{kind:aggregate,amount:aggregate==='Miss'?s.attack.missDamage:aggregate==='Nice'?s.attack.niceCounterDamage:s.attack.perfectCounterDamage,
    energyGain:battle.meter-s.battle.meter,position:target.position,anchorId:target.anchorId,angle:index%2?-.65:.65,
    finisher:battle.bossHp===0,hitStopMs:battle.bossHp===0?80:aggregate==='Miss'?0:aggregate==='Perfect'?45:25});
  // Damage and energy settle once after the relay, separately from tap feedback.
  if(battle.bossHp<=0||battle.playerHp<=0||battle.meter>=100||targets.every(t=>t.resolved))return transition(next,'impact');
  return {...next,targets:targets.map((t,i)=>i===index+1?{...t,startDelayMs:s.elapsed+relayDelayMs}:t)};
}
export function tapTarget(s:CombatState,index:number):CombatState {
  if(s.paused||s.phase!=='targetActive')return s;
  const target=s.targets[index];
  if(!target||target.resolved||s.elapsed<target.startDelayMs)return s;
  return resolveContact(s,index,resolveRingParry(s.elapsed-target.startDelayMs,target.ringDurationMs));
}
export function startVerdict(s:CombatState):CombatState {
  if(s.phase!=='verdictReady'||s.paused||s.battle.meter!==100||s.battle.bossHp<=0||s.battle.playerHp<=0)return s;
  const battle={...s.battle,meter:0,verdictCount:s.battle.verdictCount+1};
  return {...transition({...s,battle},'verdictSlash'),feedback:null,targets:[],stroke:null,pointerId:null,
    verdictDamageDealt:0,verdictCombo:0,fever:false,feverStartedAt:null};
}
function finishVerdict(s:CombatState):CombatState {
  // Apply the equipped weapon once, including on a no-input timeout.
  const battle={...s.battle,bossHp:Math.max(0,s.battle.bossHp-s.verdictBonusDamage)};
  return {...transition({...s,battle},'stagger'),pointerId:null,stroke:null};
}
export function applyContinuousCut(s:CombatState,position:{x:number;y:number},insideMonster:boolean,angle=.65,path?:Array<{x:number;y:number;time:number}>,speed:'normal'|'fast'|'ferocious'='normal'):CombatState {
  if(s.phase!=='verdictSlash'||s.paused||!insideMonster||s.verdictDamageDealt>=200)return s;
  const damage=Math.min(12,200-s.verdictDamageDealt,s.battle.bossHp);
  if(damage<=0)return s;
  const battle={...s.battle,bossHp:Math.max(0,s.battle.bossHp-damage)};
  const verdictCombo=s.verdictCombo+1,verdictDamageDealt=s.verdictDamageDealt+damage;
  const finalHit=battle.bossHp<=0;
  const fever=s.fever||verdictCombo>=feverConfig.comboThreshold;
  const feverStartedAt=s.feverStartedAt??(fever?s.time:null);
  const next=emit({...s,battle,verdictCombo,verdictDamageDealt,fever,feverStartedAt},
    {kind:'Cut',amount:damage,energyGain:0,position,angle,path,speed,finisher:finalHit,
      hitStopMs:finalHit?80:25});
  return battle.bossHp<=0||verdictDamageDealt>=200?finishVerdict(next):next;
}
export function tickCombat(s:CombatState,delta:number):CombatState {
  if(s.paused||delta<=0||!Number.isFinite(delta))return s;
  // Visual hit-stop belongs to the renderer; simulation and input never wait for it.
  const next={...s,elapsed:s.elapsed+delta,time:s.time+delta,effects:s.effects.filter(e=>s.time+delta-e.time<850)};
  switch(next.phase){
    case 'intro':return next.elapsed>=durations.intro?prepareRound(next):next;
    case 'telegraph':return next.elapsed>=next.tempo.telegraphMs?transition(next,'targetActive'):next;
    case 'targetActive':{
      next.targets=next.targets.map(t=>{
        if(t.resolved)return t;
        const age=Math.max(0,next.elapsed-t.startDelayMs);
        return {...t,ringElapsedMs:age,telegraphProgress:Math.min(1,age/t.ringDurationMs),phase:ringPhaseAt(age,t.ringDurationMs)};
      });
      const expired=next.targets.findIndex(t=>!t.resolved&&next.elapsed-t.startDelayMs>=t.ringDurationMs);
      return expired>=0?resolveContact(next,expired,'Miss'):next;
    }
    case 'impact':return next.elapsed>=durations.impact?transition(next,'stagger'):next;
    case 'stagger':{
      const staggerDuration=next.battle.bossHp<=0?durations.deathStagger:durations.stagger;
      if(next.elapsed<staggerDuration)return next;
      if(next.battle.bossHp<=0||next.battle.playerHp<=0)return transition(next,'settle');
      if(next.battle.meter>=100)return transition(next,'verdictReady');
      return prepareRound({...next,round:next.round+1});
    }
    case 'verdictReady':return next.elapsed>=durations.verdictReady?startVerdict(next):next;
    case 'verdictSlash':return verdictRemainingMs(next)<=0?finishVerdict(next):next;
    default:return next;
  }
}

export function weakPointsFor(verdictCount:number,width:number,height:number,bossKind:BossKind='corn'){
  const patterns=bossKind==='jelly'?[[[.24,.68],[.74,.68],[.26,.36],[.76,.36]],[[.22,.66],[.45,.48],[.63,.68],[.78,.38]],[[.28,.62],[.68,.66],[.66,.36],[.4,.4]]]:[[[.22,.55],[.4,.55],[.58,.55],[.76,.55]],[[.22,.68],[.4,.59],[.58,.5],[.76,.41]],[[.3,.7],[.3,.52],[.3,.34],[.68,.34]]];
  const radius=Math.max(22,Math.min(30,width*.065))/height;
  return patterns[verdictCount%3].map(([x,y],i)=>({id:`weak-${i}`,x:.27+x*.46,y:.28+(1-y)*.42,radius}));
}
export const targetDiameter=(width:number,height:number)=>Math.max(44,Math.min(64,Math.min(width,height)*.14));
export function targetCenter(position:{x:number;y:number},width:number,height:number){
  const inset=targetDiameter(width,height)*.8+12;
  return {x:Math.max(inset,Math.min(width-inset,position.x*width)),y:Math.max(130+inset,Math.min(height-125-inset,position.y*height))};
}
