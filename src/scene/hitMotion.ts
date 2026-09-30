import * as THREE from 'three';
import type { CombatFeedback, CombatState } from '../domain/combat';

/** Shared recoil timing; GOOD layers its reference startle pose on top. */
export const goodParryDurationMs = 250;
export const perfectParryDurationMs = 350;
export const hitExpressionDurations = { Nice:goodParryDurationMs, Perfect:620, Miss:720 } as const;

export type HitExpressionKind = 'Idle'|'Good'|'Perfect'|'Miss';
export interface HitExpression {
  kind:HitExpressionKind;
  weight:number;
}

/**
 * One-shot face reaction for the three ring outcomes.  The impact arrives
 * quickly, holds long enough to read, then returns to the idle face without
 * affecting the combat simulation.
 */
export function hitExpressionFor(kind:CombatFeedback['kind']|undefined,age:number):HitExpression{
  if((kind!=='Nice'&&kind!=='Perfect'&&kind!=='Miss')||!Number.isFinite(age)||age<0)return {kind:'Idle',weight:0};
  const duration=hitExpressionDurations[kind];
  if(age>=duration)return {kind:'Idle',weight:0};
  const t=age/duration;
  // The expression is already legible on the first impact frame, including hit-stop.
  const weight=t<.1?.65+.35*THREE.MathUtils.smoothstep(t/.1,0,1):t<.65?1:1-THREE.MathUtils.smoothstep((t-.65)/.35,0,1);
  return {kind:kind==='Nice'?'Good':kind,weight};
}

export function guardianHitExpression(state:CombatState):HitExpression{
  if(state.battle.bossHp<=0||state.phase==='settle'||state.phase==='verdictReady'||state.phase==='verdictSlash')return {kind:'Idle',weight:0};
  const feedback=state.feedback;
  return hitExpressionFor(feedback?.contactResult??feedback?.kind,state.time-(feedback?.time??-Infinity));
}

/** The GOOD reference pose: startle, briefly balance on one foot, then land. */
export function goodStaggerWeight(state:CombatState,reducedMotion=false){
  if(reducedMotion||guardianHitExpression(state).kind!=='Good')return 0;
  const age=state.time-state.feedback!.time;
  if(age<70)return .22+.78*THREE.MathUtils.smoothstep(age/70,0,1);
  if(age<145)return 1;
  return 1-THREE.MathUtils.smoothstep((age-145)/(goodParryDurationMs-145),0,1);
}

/**
 * A short, bottom-pivoted hit impulse.  The small negative middle keyframe is
 * the visual rebound: the feet stay planted while the body leans back, gives a
 * tiny counter-sway, then settles exactly on the rest pose.
 */
export function parryImpulse(age:number,duration:number){
  if(age<0||age>=duration)return 0;
  const t=age/duration;
  if(t<.34)return THREE.MathUtils.smoothstep(t/.34,0,1);
  if(t<.68)return 1-.13*THREE.MathUtils.smoothstep((t-.34)/.34,0,1);
  if(t<.84)return THREE.MathUtils.lerp(.87,-.09,THREE.MathUtils.smoothstep((t-.68)/.16,0,1));
  return -.09*(1-THREE.MathUtils.smoothstep((t-.84)/.16,0,1));
}

/** Compression follows the same hit, with a lighter release stretch. */
export function parrySquash(age:number,duration:number){
  if(age<0||age>=duration)return 0;
  const t=age/duration;
  const impulse=parryImpulse(age,duration);
  const rebound=t>.52?THREE.MathUtils.smoothstep((t-.52)/.48,0,1):0;
  return impulse*.82-rebound*.1;
}

export function parryDuration(kind:'Nice'|'Perfect'){
  return kind==='Perfect'?perfectParryDurationMs:goodParryDurationMs;
}
