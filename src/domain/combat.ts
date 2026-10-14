import {
  applyParry, attackForBoss, bossMaxHp, newBattle, resolveRingParry,
  type AttackConfig, type AttackPresentation, type BattlePhase, type BattleState,
  type BodyAnchorId, type BossKind, type ParryResult, type VerdictStroke,
} from './v2';
import { BlockCircleManager } from './BlockCircleManager';
import { enrageConfig, levelForBoss, levelTiming, verdictPlanFor, vegetableCombatConfig, type LevelId } from './levelConfig';

export interface CombatFeedback {
  /** Actual extra damage from the once-per-verdict tomato bomb. */
  bombDamage?:number;
  weaponDamage?:number;
  circleId?:string;
  pendingRound?:boolean;
  /** Latest ring result for the actor; kind still settles the whole relay. */
  contactResult?:ParryResult;
  id:number; kind:ParryResult|'Verdict'|'Cut'; amount:number; score?:number;
  position:{x:number;y:number}; anchorId?:BodyAnchorId; time:number;
  energyGain:number; angle:number; path?:Array<{x:number;y:number;time:number}>; speed?:'normal'|'fast'|'ferocious'; hitStopMs?:number; finisher?:boolean;
}
export interface CombatTempo {
  durationMs:number; maxRadiusPx:number; telegraphMs:number; label:string;
  attackIntervalMs:number; staggerMs:number;
  perfectWindowStart:number; perfectWindowEnd:number;
}
export interface CombatState {
  battleId:string;
  levelId:LevelId|null; enraged:boolean; enragedAt:number|null;
  defeatReason:'hearts'|'verdict-timeout'|null;
  /** Completed verdict stages, then completed groups/circles in the current stage. */
  stageIndex:number; stageGroupsResolved:number; stageCirclesResolved:number;
  /** Absolute next-group activation deadline; cleared on verdict/death/new activation. */
  nextAttackAt:number|null;
  battle:BattleState; bossKind:BossKind; attack:AttackConfig; phase:BattlePhase;
  elapsed:number; time:number; round:number; seed:number; paused:boolean;
  targets:AttackPresentation[]; combo:number; bestCombo:number; successfulParries:number;
  tempo:CombatTempo; feedback:CombatFeedback|null; effects:CombatFeedback[]; feedbackSequence:number;
  hitStopRemainingMs:number; stroke:VerdictStroke|null; pointerId:number|null;
  verdictDamageDealt:number; verdictBombDamage:number; verdictCombo:number; verdictBonusDamage:number;
  tomatoBombOwned:boolean; tomatoBombTriggered:boolean;
  fever:boolean; feverStartedAt:number|null;
}

export const relayDelayMs = 420;
export const feverConfig={comboThreshold:5,durationMs:3000};
export const deathFallDurationMs=1250;
export const verdictDurationFor=(s:Pick<CombatState,'attack'>)=>s.attack.verdictDurationMs??durations.verdict;
export const verdictDamageCapFor=(s:Pick<CombatState,'attack'>)=>s.attack.verdictDamageCap??200;
export const verdictCutDamageFor=(s:Pick<CombatState,'attack'>)=>s.attack.verdictCutDamage??12;
export const verdictRemainingMs=(s:CombatState)=>Math.max(0,s.feverStartedAt===null
  ?verdictDurationFor(s)-s.elapsed:(s.attack.verdictDurationMs??feverConfig.durationMs)-(s.time-s.feverStartedAt));
export const durations = { intro:1000, ready:650, telegraph:400, impact:280, stagger:300, deathStagger:1200, verdictReady:650, verdict:3000, settle:1000 };

export function currentVerdictStage(s:Pick<CombatState,'bossKind'|'stageIndex'|'stageGroupsResolved'|'stageCirclesResolved'>){
  const plan=verdictPlanFor(s.bossKind),stage=plan?.[s.stageIndex];
  return stage&&plan?{...stage,number:s.stageIndex+1,total:plan.length,
    groupCount:stage.singleGroups+stage.doubleGroups,circleCount:stage.singleGroups+stage.doubleGroups*2,
    groupsResolved:s.stageGroupsResolved,circlesResolved:s.stageCirclesResolved}:null;
}
const stageComplete=(s:CombatState)=>{
  const stage=currentVerdictStage(s);
  return !!stage&&stage.groupsResolved===stage.groupCount&&stage.circlesResolved===stage.circleCount;
};
/** Stage health boundaries keep parry, equipment and bomb damage from skipping a verdict. */
export function stageHpBoundary(s:Pick<CombatState,'bossKind'|'stageIndex'>):number {
  const plan=verdictPlanFor(s.bossKind);
  return plan?Math.max(0,Math.round(bossMaxHp(s.bossKind)*(plan.length-s.stageIndex-1)/plan.length)):0;
}

/** Vegetables use fixed level snapshots; only the legacy jelly accelerates with success. */
export function tempoFor(bossKind:BossKind,successfulParries:number,enraged=false):CombatTempo {
  const levelId=levelForBoss[bossKind];
  if(levelId!==null){
    const timing=levelTiming(levelId);
    const initial={corn:[90,400],carrot:[86,380],cabbage:[82,350],tomato:[78,320],jelly:[90,400]}[bossKind];
    const telegraphMs=Math.min(initial[1],timing.attackIntervalMs-durations.impact-durations.stagger);
    return {...timing,maxRadiusPx:initial[0],telegraphMs,
      staggerMs:timing.attackIntervalMs-durations.impact-telegraphMs,label:enraged&&levelId>=3?'狂暴':`Level ${levelId}`};
  }
  const values=successfulParries<5?[1800,90,400]:successfulParries<11?[1650,82,340]:[1500,76,280];
  return {durationMs:values[0],maxRadiusPx:values[1],telegraphMs:values[2],
    label:successfulParries<5?'热身':successfulParries<11?'熟练':'疾风',
    attackIntervalMs:durations.impact+durations.stagger+values[2],staggerMs:durations.stagger,
    perfectWindowStart:700/1800,perfectWindowEnd:1400/1800};
}

const attackAtTempo=(bossKind:BossKind,tempo:CombatTempo,stageIndex=0):AttackConfig=>{
  const attack={...attackForBoss(bossKind),perfectWindowStart:tempo.perfectWindowStart,perfectWindowEnd:tempo.perfectWindowEnd};
  const plan=verdictPlanFor(bossKind),stage=plan?.[stageIndex];
  if(!plan||!stage)return attack;
  const upper=Math.round(bossMaxHp(bossKind)*(plan.length-stageIndex)/plan.length);
  const segment=upper-stageHpBoundary({bossKind,stageIndex});
  const perfect=Math.floor(segment*vegetableCombatConfig.parryShare/(stage.singleGroups+stage.doubleGroups*2));
  return {...attack,missDamage:1,perfectCounterDamage:perfect,
    niceCounterDamage:Math.floor(perfect*vegetableCombatConfig.goodMultiplier),
    verdictCutDamage:Math.ceil(bossMaxHp(bossKind)/plan.length/vegetableCombatConfig.cutsPerSegment),
    verdictDamageCap:segment};
};
export const createCombat=(seed=7319,bossKind:BossKind='corn',verdictBonusDamage=0,battleId=`${bossKind}-${seed}`,tomatoBombOwned=false):CombatState=>({
  battleId,
  battle:{...newBattle(bossKind),playerHp:levelForBoss[bossKind]===null?100:vegetableCombatConfig.hearts},bossKind,attack:attackAtTempo(bossKind,tempoFor(bossKind,0)),
  levelId:levelForBoss[bossKind],enraged:false,enragedAt:null,nextAttackAt:null,
  defeatReason:null,
  stageIndex:0,stageGroupsResolved:0,stageCirclesResolved:0,
  phase:'intro',elapsed:0,time:0,round:0,seed,paused:false,targets:[],combo:0,bestCombo:0,
  successfulParries:0,tempo:tempoFor(bossKind,0),feedback:null,effects:[],feedbackSequence:0,
  hitStopRemainingMs:0,stroke:null,pointerId:null,verdictDamageDealt:0,verdictBombDamage:0,verdictCombo:0,
  verdictBonusDamage,tomatoBombOwned,tomatoBombTriggered:false,fever:false,feverStartedAt:null,
});
const transition=(s:CombatState,phase:BattlePhase,startedAt=s.time):CombatState=>({...s,phase,elapsed:Math.max(0,s.time-startedAt)});
function emit(s:CombatState,event:Omit<CombatFeedback,'id'|'time'>):CombatState {
  const feedback={...event,id:s.feedbackSequence+1,time:s.time};
  return {...s,feedback,feedbackSequence:feedback.id,effects:[...s.effects,feedback].slice(-24)};
}
export function prepareRound(s:CombatState,startedAt=s.time):CombatState {
  const tempo=tempoFor(s.bossKind,s.successfulParries,s.enraged);
  const stage=currentVerdictStage(s);
  // A completed budget cannot create an extra group, even if a caller retries preparation.
  if(s.levelId!==null&&(!stage||stage.groupsResolved>=stage.groupCount))return s;
  const double=s.levelId===null?tempo.durationMs<1800&&s.round%2===0:s.stageGroupsResolved>=stage!.singleGroups;
  const count=double?2:1;
  return {...transition(s,'telegraph',startedAt),tempo,attack:attackAtTempo(s.bossKind,tempo,s.stageIndex),
    feedback:null,stroke:null,fever:false,feverStartedAt:null,
    targets:BlockCircleManager.create({seed:s.seed,round:s.round,bossKind:s.bossKind,count,
      simultaneous:s.levelId!==null,durationMs:tempo.durationMs,maxRadiusPx:tempo.maxRadiusPx})};
}

function checkEnrage(s:CombatState):CombatState {
  if(s.levelId===null||s.levelId<3||s.enraged||s.battle.bossHp<=0||s.battle.bossHp>=bossMaxHp(s.bossKind)*enrageConfig.healthThreshold)return s;
  return {...s,enraged:true,enragedAt:s.time};
}

function resolveLegacyContact(s:CombatState,index:number,result:ParryResult):CombatState {
  const target=s.targets[index];
  const targets=BlockCircleManager.resolve(s.targets,index,result);
  if(targets.length>1&&!targets.every(t=>t.resolved)){
    return emit({...s,targets:targets.map((t,i)=>i===index+1?{...t,startDelayMs:s.elapsed+relayDelayMs}:t),
      hitStopRemainingMs:0},
      {kind:result,circleId:target.circleId,amount:0,energyGain:0,pendingRound:true,position:target.position,
        contactResult:result,
        anchorId:target.anchorId,angle:index%2?-.65:.65,hitStopMs:result==='Miss'?0:result==='Perfect'?45:25});
  }
  const aggregate=targets.length>1?(targets.some(t=>t.result==='Miss')?'Miss':targets.every(t=>t.result==='Perfect')?'Perfect':'Nice'):result;
  const battle=applyParry(s.battle,aggregate,s.attack);
  const combo=aggregate==='Miss'?0:s.combo+1;
  const next=emit({...s,battle,targets,combo,bestCombo:Math.max(s.bestCombo,combo),
    successfulParries:s.successfulParries+(aggregate==='Miss'?0:1),hitStopRemainingMs:0,
  },{kind:aggregate,circleId:target.circleId,amount:aggregate==='Miss'?s.attack.missDamage:aggregate==='Nice'?s.attack.niceCounterDamage:s.attack.perfectCounterDamage,
    contactResult:result,
    energyGain:battle.meter-s.battle.meter,position:target.position,anchorId:target.anchorId,angle:index%2?-.65:.65,
    finisher:battle.bossHp===0,hitStopMs:battle.bossHp===0?80:aggregate==='Miss'?0:aggregate==='Perfect'?45:25});
  // Damage and energy settle once after the relay, separately from tap feedback.
  if(battle.bossHp<=0||battle.playerHp<=0||battle.meter>=100||targets.every(t=>t.resolved))return transition(next,'impact');
  return {...next,targets:targets.map((t,i)=>i===index+1?{...t,startDelayMs:s.elapsed+relayDelayMs}:t)};
}
function resolveContact(s:CombatState,index:number,result:ParryResult):CombatState {
  if(s.levelId===null)return resolveLegacyContact(s,index,result);
  const stage=currentVerdictStage(s);
  if(!stage||stageComplete(s))return s;
  const target=s.targets[index];
  const targets=BlockCircleManager.resolve(s.targets,index,result);
  const applied=applyParry(s.battle,result,s.attack);
  const stageCirclesResolved=s.stageCirclesResolved+1;
  const groupComplete=targets.every(t=>t.resolved);
  const stageGroupsResolved=s.stageGroupsResolved+(groupComplete?1:0);
  // All resolved circles advance the fixed encounter budget. Miss still damages the player.
  const battle={...applied,
    bossHp:Math.min(s.battle.bossHp,Math.max(Math.max(1,stageHpBoundary(s)),applied.bossHp)),
    meter:stageCirclesResolved===stage.circleCount?100:100*stageCirclesResolved/stage.circleCount};
  const combo=result==='Miss'?0:s.combo+1;
  const next=checkEnrage(emit({...s,battle,targets,stageCirclesResolved,stageGroupsResolved,combo,bestCombo:Math.max(s.bestCombo,combo),
    successfulParries:s.successfulParries+(result==='Miss'?0:1),hitStopRemainingMs:0,
  },{kind:result,circleId:target.circleId,
    amount:result==='Miss'?s.battle.playerHp-battle.playerHp:s.battle.bossHp-battle.bossHp,
    energyGain:battle.meter-s.battle.meter,position:target.position,anchorId:target.anchorId,angle:index%2?-.65:.65,
    finisher:battle.bossHp===0,hitStopMs:battle.bossHp===0?80:result==='Miss'?0:result==='Perfect'?80:25}));
  if(battle.bossHp<=0||battle.playerHp<=0)return {...transition(next,'impact'),nextAttackAt:null,defeatReason:battle.playerHp<=0?'hearts':null};
  if(!groupComplete)return next;
  const nextTempo=tempoFor(s.bossKind,next.successfulParries,next.enraged);
  return {...transition(next,'impact'),nextAttackAt:stageComplete(next)?null:s.time+nextTempo.attackIntervalMs};
}
export function tapTarget(s:CombatState,circleId:string):CombatState {
  if(s.paused||s.phase!=='targetActive'||s.battle.bossHp<=0||s.battle.playerHp<=0)return s;
  const index=BlockCircleManager.interactiveIndex(s.targets,circleId,s.elapsed);
  if(index<0)return s;
  const target=s.targets[index];
  return resolveContact(s,index,resolveRingParry(s.elapsed-target.startDelayMs,target.ringDurationMs,s.attack));
}
export function startVerdict(s:CombatState):CombatState {
  if(s.phase!=='verdictReady'||s.paused||s.battle.meter!==100||s.battle.bossHp<=0||s.battle.playerHp<=0)return s;
  if(s.levelId!==null&&(!stageComplete(s)||s.battle.verdictCount!==s.stageIndex))return s;
  const battle={...s.battle,meter:0,verdictCount:s.battle.verdictCount+1};
  return {...transition({...s,battle},'verdictSlash'),feedback:null,targets:[],stroke:null,pointerId:null,nextAttackAt:null,
    verdictDamageDealt:0,verdictBombDamage:0,verdictCombo:0,tomatoBombTriggered:false,fever:false,feverStartedAt:null};
}
function finishVerdict(s:CombatState):CombatState {
  if(s.phase!=='verdictSlash')return s;
  if(s.levelId!==null&&s.battle.bossHp>stageHpBoundary(s))return s;
  // Only real damage completes a vegetable stage. Jelly retains its old bonus.
  const battle={...s.battle,bossHp:s.levelId===null?Math.max(0,s.battle.bossHp-s.verdictBonusDamage)
    :s.battle.bossHp};
  const progression=s.levelId===null?{}:{stageIndex:s.stageIndex+1,stageGroupsResolved:0,stageCirclesResolved:0};
  return {...transition(checkEnrage({...s,battle,...progression}),'stagger'),pointerId:null,stroke:null,nextAttackAt:null};
}
function expireVerdict(s:CombatState):CombatState {
  if(s.levelId===null)return finishVerdict(s);
  // No phantom hit, reward, stage increment or consumable charge on timeout.
  return {...transition(s,'settle'),defeatReason:'verdict-timeout',pointerId:null,stroke:null,nextAttackAt:null,feedback:null};
}
export function applyContinuousCut(s:CombatState,position:{x:number;y:number},insideMonster:boolean,angle=.65,path?:Array<{x:number;y:number;time:number}>,speed:'normal'|'fast'|'ferocious'='normal'):CombatState {
  const damageCap=verdictDamageCapFor(s);
  if(s.phase!=='verdictSlash'||s.paused||!insideMonster||s.battle.playerHp<=0||s.battle.bossHp<=0||s.verdictDamageDealt>=damageCap)return s;
  const boundary=s.levelId===null?0:stageHpBoundary(s);
  const damage=Math.min(verdictCutDamageFor(s),damageCap-s.verdictDamageDealt,Math.max(0,s.battle.bossHp-boundary));
  if(damage<=0)return s;
  const triggersBomb=s.tomatoBombOwned&&!s.tomatoBombTriggered;
  const bombDamage=triggersBomb?Math.min(10,Math.max(0,s.battle.bossHp-boundary-damage)):0;
  const weaponDamage=s.levelId!==null&&s.verdictCombo===0?Math.min(s.verdictBonusDamage,Math.max(0,s.battle.bossHp-boundary-damage-bombDamage)):0;
  const battle={...s.battle,bossHp:Math.max(0,s.battle.bossHp-damage-bombDamage-weaponDamage)};
  const verdictCombo=s.verdictCombo+1,verdictDamageDealt=s.verdictDamageDealt+damage;
  const fever=s.fever||verdictCombo>=feverConfig.comboThreshold;
  const feverStartedAt=s.feverStartedAt??(fever?s.time:null);
  const verdictBombDamage=s.verdictBombDamage+bombDamage;
  const next={...s,battle,verdictCombo,verdictDamageDealt,verdictBombDamage,fever,feverStartedAt,tomatoBombTriggered:s.tomatoBombTriggered||triggersBomb};
  // Vegetable bonuses are actual first-hit damage; no end-of-stage top-up.
  // Legacy jelly still applies its bonus after reaching the base damage cap.
  const capReached=s.levelId===null&&verdictDamageDealt>=damageCap;
  const resolved=battle.bossHp<=boundary||capReached?finishVerdict(next):checkEnrage(next);
  const finalHit=resolved.battle.bossHp<=0;
  return emit(resolved,
    {kind:'Cut',amount:s.battle.bossHp-resolved.battle.bossHp,bombDamage:triggersBomb?bombDamage:undefined,weaponDamage:weaponDamage||undefined,energyGain:0,position,angle,path,speed,finisher:finalHit,
      hitStopMs:finalHit?80:25});
}
export function tickCombat(s:CombatState,delta:number):CombatState {
  if(s.paused||delta<=0||!Number.isFinite(delta))return s;
  // Visual hit-stop belongs to the renderer; simulation and input never wait for it.
  const next={...s,elapsed:s.elapsed+delta,time:s.time+delta,effects:s.effects.filter(e=>s.time+delta-e.time<850)};
  if(next.levelId!==null)return tickVegetableCombat(next);
  switch(next.phase){
    case 'intro':return next.elapsed>=durations.intro?prepareRound(next):next;
    case 'telegraph':return next.elapsed>=next.tempo.telegraphMs?transition(next,'targetActive'):next;
    case 'targetActive':{
      next.targets=BlockCircleManager.update(next.targets,next.elapsed,next.attack);
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
    case 'verdictSlash':return verdictRemainingMs(next)<=0?expireVerdict(next):next;
    default:return next;
  }
}

/** Walk presentation deadlines, but never replay an unseen attack after a slow frame. */
function tickVegetableCombat(initial:CombatState):CombatState {
  let next=initial;
  for(let transitions=0;transitions<5;transitions++){
    const phaseStartedAt=next.time-next.elapsed;
    switch(next.phase){
      case 'intro':return next.elapsed>=durations.intro?prepareRound(next):next;
      case 'telegraph':
        // A newly visible group always gets a full input window, even after background suspension.
        return next.elapsed>=next.tempo.telegraphMs?{...transition(next,'targetActive'),nextAttackAt:null}:next;
      case 'targetActive':{
        next={...next,targets:BlockCircleManager.update(next.targets,next.elapsed,next.attack)};
        const expired=BlockCircleManager.expiredIds(next.targets,next.elapsed);
        for(const circleId of expired){
          if(next.phase!=='targetActive'||next.battle.playerHp<=0||next.battle.bossHp<=0)break;
          const index=next.targets.findIndex(target=>target.circleId===circleId);
          next=resolveContact(next,index,'Miss');
        }
        return next;
      }
      case 'impact':
        if(next.elapsed<durations.impact)return next;
        next=transition(next,'stagger',phaseStartedAt+durations.impact);
        break;
      case 'stagger':{
        const ended=next.battle.bossHp<=0||next.battle.playerHp<=0;
        const hold=next.battle.bossHp<=0?durations.deathStagger:durations.stagger;
        if(ended)return next.elapsed>=hold?{...transition(next,'settle'),nextAttackAt:null}:next;
        if(stageComplete(next)){
          if(next.elapsed<hold)return next;
          next={...transition(next,'verdictReady',phaseStartedAt+hold),nextAttackAt:null};
          break;
        }
        const tempo=tempoFor(next.bossKind,next.successfulParries,next.enraged);
        const telegraphAt=next.nextAttackAt===null?phaseStartedAt+hold:next.nextAttackAt-tempo.telegraphMs;
        if(next.time<telegraphAt)return next;
        next=prepareRound({...next,round:next.round+1},telegraphAt);
        break;
      }
      case 'verdictReady':return next;
      case 'verdictSlash':return verdictRemainingMs(next)<=0?expireVerdict(next):next;
      default:return next;
    }
  }
  return next;
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
