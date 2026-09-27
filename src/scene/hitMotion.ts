import * as THREE from 'three';

/** The two parry tiers share the same lean/rebound shape, but not its scale. */
export const goodParryDurationMs = 250;
export const perfectParryDurationMs = 350;

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
