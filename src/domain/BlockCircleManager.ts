import { deterministicBodyAnchor, deterministicTarget, ringPhaseAt, type AttackConfig, type AttackPresentation, type BossKind, type ParryResult } from './v2';

interface CircleGroupConfig {
  seed:number;
  round:number;
  bossKind:BossKind;
  count:number;
  simultaneous:boolean;
  durationMs:number;
  maxRadiusPx:number;
}

/** Pure ring operations. The combat clock is the only clock; no ring owns a timer. */
export const BlockCircleManager={
  create(config:CircleGroupConfig):AttackPresentation[]{
    const {seed,round,bossKind,count,simultaneous,durationMs,maxRadiusPx}=config;
    return Array.from({length:count},(_,index)=>({
      circleId:`${seed}:${round}:${index}`,targetIndex:index,
      anchorId:deterministicBodyAnchor(seed,round,index,count,bossKind),
      position:deterministicTarget(seed,round,index,count,bossKind),
      startDelayMs:simultaneous||index===0?0:Infinity,
      ringElapsedMs:0,ringDurationMs:durationMs,maxRadiusPx,
      telegraphProgress:0,phase:'early',resolved:false,
    }));
  },
  update(targets:AttackPresentation[],elapsed:number,attack:AttackConfig):AttackPresentation[]{
    return targets.map(target=>{
      if(target.resolved)return target;
      const age=Math.max(0,elapsed-target.startDelayMs);
      return {...target,ringElapsedMs:age,telegraphProgress:Math.min(1,age/target.ringDurationMs),phase:ringPhaseAt(age,target.ringDurationMs,attack)};
    });
  },
  interactiveIndex(targets:AttackPresentation[],circleId:string,elapsed:number):number {
    return targets.findIndex(target=>target.circleId===circleId&&!target.resolved&&elapsed>=target.startDelayMs);
  },
  expiredIds(targets:AttackPresentation[],elapsed:number):string[]{
    return targets.filter(target=>!target.resolved&&elapsed-target.startDelayMs>=target.ringDurationMs)
      .sort((a,b)=>a.targetIndex-b.targetIndex).map(target=>target.circleId);
  },
  resolve(targets:AttackPresentation[],index:number,result:ParryResult):AttackPresentation[]{
    return targets.map((target,i)=>i===index?{...target,resolved:true,result}:target);
  },
};
