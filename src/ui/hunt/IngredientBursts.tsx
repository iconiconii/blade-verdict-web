import type { CSSProperties } from 'react';
import type { CombatFeedback } from '../../domain/combat';
import { bossIngredientIcon, type BossKind } from '../../domain/v2';
import { ItemIcon } from '../index';

interface Props {
  events: CombatFeedback[];
  bossKind: BossKind;
  time: number;
  origin: (event: CombatFeedback) => {x:number;y:number} | null;
}

export const verdictFoodLimits = { perCut:6, finisher:12, bursts:5, particles:30, flightMs:520, finisherHoldMs:80 } as const;
const foodIconSize = { cut:80, finisher:96 } as const;

/** Visual budget only. Never ties Cut particles to energy gain or inventory rewards. */
export function selectVerdictBursts(events:readonly CombatFeedback[],time:number){
  const seen=new Set<number>();
  let remaining:number=verdictFoodLimits.particles;
  const selected:Array<{event:CombatFeedback;count:number;age:number}>=[];
  // Retain the finishing blow, then the newest contacts during rapid slashing.
  const ordered=events.filter(event=>event.kind==='Cut'&&event.amount>0&&!event.pendingRound)
    .sort((a,b)=>Number(!!b.finisher)-Number(!!a.finisher)||b.time-a.time||b.id-a.id);
  for(const event of ordered){
    const age=time-event.time,hold=event.finisher?verdictFoodLimits.finisherHoldMs:0;
    if(seen.has(event.id)||age<0||age>=hold+verdictFoodLimits.flightMs)continue;
    seen.add(event.id);
    const count=event.finisher?verdictFoodLimits.finisher:verdictFoodLimits.perCut;
    if(selected.length>=verdictFoodLimits.bursts||count>remaining)continue;
    selected.push({event,count,age});remaining-=count;
  }
  return selected;
}

export function IngredientBursts({events,bossKind,time,origin}:Props){
  const cuts=selectVerdictBursts(events,time);
  // Ingredient flight is verdict-only; parries retain their other feedback.
  return <>{cuts.map(({event,count,age})=>{
    const source=origin(event)??{x:0,y:0};
    const hold=event.finisher?verdictFoodLimits.finisherHoldMs:0;
    return <div key={`cut-${event.id}`} className={`ingredient-burst verdict-ingredient-burst${event.finisher?' is-finisher':''}`}
      data-testid="verdict-ingredient-burst" data-event-id={event.id} data-finisher={!!event.finisher}
      style={{left:source.x,top:source.y}} aria-hidden="true">
      {Array.from({length:count},(_,index)=>{
        // Bound the fan independently of particle count for narrow screens.
        const fan=(index/(count-1)-.5)*(event.finisher?240:200);
        const drift=Math.cos(event.angle)*18,arc=-46-(index%3)*30;
        // Scrub paused CSS keyframes with combat age: no per-particle timers,
        // no restart on another hit, and no motion while the battle is paused.
        return <i key={index} style={{animationDelay:`${hold-age}ms`,animationDuration:`${verdictFoodLimits.flightMs}ms`,
          '--throw-x':`${fan+drift}px`,'--throw-y':`${arc}px`,'--land-y':`${72+(index%3)*28}px`,
          '--spin':`${(index%2?-1:1)*(90+index*22)}deg`} as CSSProperties}>
          <ItemIcon name={bossIngredientIcon(bossKind)} size={event.finisher?foodIconSize.finisher:foodIconSize.cut}/>
        </i>;
      })}
    </div>;
  })}</>;
}
