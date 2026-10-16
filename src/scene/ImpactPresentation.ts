import type { CombatFeedback, CombatState } from '../domain/combat';
import { feedbackPriority, selectActorFeedback } from '../feedback/FeedbackManager';

export interface VisualHold {from:number;until:number}

/** Presentation-only gate. Never passed back into combat/input state. */
export class ImpactPresentation {
  private seen=0;
  private until=0;
  private nextPulse=0;
  private pulseAt=-Infinity;
  private amplitude=0;
  private holdMs=0;
  private priority=0;
  private held:CombatState|null=null;

  update(state:CombatState,reducedMotion=false,actorFeedback:CombatFeedback|null=selectActorFeedback(state.effects.length?state.effects:state.feedback?[state.feedback]:[],state.time)){
    const actor=actorFeedback===state.feedback?state:{...state,feedback:actorFeedback};
    for(const event of [...state.effects].sort((a,b)=>a.time-b.time||a.id-b.id)){
      if(event.id<=this.seen)continue;
      this.seen=event.id;
      if(event.kind==='Miss'||state.time-event.time>100)continue;
      const amplitude=event.finisher?.05:event.kind==='Cut'?event.speed==='ferocious'?.022:.014:event.kind==='Perfect'?.018:.008;
      const holdMs=event.hitStopMs??25,priority=feedbackPriority(event);
      if(event.finisher||event.time>=this.nextPulse){
        this.nextPulse=event.time+(event.kind==='Cut'?65:140);
        this.pulseAt=event.time;
        this.amplitude=amplitude;this.holdMs=holdMs;this.priority=priority;
        this.held=actor;
      }else{
        // A stronger overlapping hit can upgrade the current pulse, but its
        // duration remains anchored to the first hit rather than adding time.
        this.amplitude=Math.max(this.amplitude,amplitude);
        this.holdMs=Math.max(this.holdMs,holdMs);
        if(priority>this.priority){this.priority=priority;this.held=actor}
      }
      this.until=this.pulseAt+(reducedMotion?0:this.holdMs);
    }
    const age=state.time-this.pulseAt;
    const shake=reducedMotion||age>=100?0:Math.sin(age*.14)*this.amplitude*(1-age/100);
    // A death must supersede an earlier held living pose immediately.
    const canHold=!reducedMotion&&this.held
      &&(state.phase===this.held.phase||(!['verdictReady','verdictSlash','settle'].includes(state.phase)&&!['verdictReady','verdictSlash','settle'].includes(this.held.phase)))
      &&(state.battle.bossHp>0)===(this.held.battle.bossHp>0);
    // Keep the interval available on the release frame too. Sprite playback
    // subtracts its overlap instead of jumping forward by the frozen time.
    const hold:VisualHold|null=canHold?{from:this.pulseAt,until:this.until}:null;
    return {actor:canHold&&state.time<this.until?this.held!:actor,shake,hold};
  }
}
