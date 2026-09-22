import type { CombatState } from '../domain/combat';

/** Presentation-only gate. Never passed back into combat/input state. */
export class ImpactPresentation {
  private seen=0;
  private until=0;
  private nextPulse=0;
  private pulseAt=-Infinity;
  private amplitude=0;
  private held:CombatState|null=null;

  update(state:CombatState,reducedMotion=false){
    for(const event of state.effects){
      if(event.id<=this.seen)continue;
      this.seen=event.id;
      if(event.kind==='Miss'||state.time-event.time>100)continue;
      if(event.finisher||state.time>=this.nextPulse){
        this.nextPulse=state.time+140;
        this.pulseAt=state.time;
        this.amplitude=event.finisher?.035:event.kind==='Perfect'?.018:.008;
        this.until=state.time+(reducedMotion?0:event.hitStopMs??25);
        this.held=state;
      }
    }
    const age=state.time-this.pulseAt;
    const shake=reducedMotion||age>=100?0:Math.sin(age*.14)*this.amplitude*(1-age/100);
    // A death must supersede an earlier held living pose immediately.
    const mayHold=this.held&&state.time<this.until&&state.phase===this.held.phase
      &&(state.battle.bossHp>0)===(this.held.battle.bossHp>0);
    return {actor:mayHold?this.held!:state,shake};
  }
}
