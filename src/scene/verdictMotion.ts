import { durations, type CombatState } from '../domain/combat';

const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t)};
const lifetime=650;

/** An analytic damped impulse: no render-rate integration or restarting on a new cut. */
function impulse(age:number){
  if(age<0||age>=lifetime)return 0;
  return Math.sin((age+24)/70)*Math.exp(-age/170)*(1-smooth(age/lifetime));
}

export function verdictMotion(state:CombatState,reducedMotion=false){
  const alive=state.battle.bossHp>0&&state.battle.playerHp>0;
  // Verdict entry clears targets, including when no cuts were made before timeout.
  const recovering=state.phase==='stagger'&&state.targets.length===0&&state.battle.verdictCount>0;
  const weight=!alive?0:state.phase==='verdictReady'?smooth(state.elapsed/240)
    :state.phase==='verdictSlash'?1:recovering?1-smooth(state.elapsed/durations.stagger):0;
  let x=0,y=0,followX=0,followY=0,compression=0,energy=0,flash=0;
  const seen=new Set<number>();
  if(weight)for(const event of state.effects){
    const age=state.time-event.time;
    if(event.kind!=='Cut'||age<0||age>=lifetime||seen.has(event.id))continue;
    seen.add(event.id);
    const dx=Math.cos(event.angle),dy=Math.sin(event.angle);
    const force=impulse(age),follow=impulse(age-45);
    const envelope=Math.exp(-age/190)*(1-smooth(age/lifetime));
    x+=dx*force;y+=dy*force;followX+=dx*follow;followY+=dy*follow;
    compression+=Math.cos(age/85)*envelope;
    energy+=envelope;
    flash=Math.max(flash,Math.max(0,1-age/90)*.3);
  }
  const movement=weight*(reducedMotion?.18:1);
  return {
    weight,
    x:Math.tanh(x)*movement,y:Math.tanh(y)*movement,
    followX:Math.tanh(followX)*movement,followY:Math.tanh(followY)*movement,
    compression:Math.tanh(compression)*movement,
    energy:Math.tanh(energy)*movement,
    breath:reducedMotion?0:Math.sin(state.time/1000*5)*weight,
    pain:weight*(.65+.35*Math.tanh(energy)),
    flash:flash*weight*(reducedMotion?.15:1),
  };
}
