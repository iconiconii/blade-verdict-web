import type { CombatFeedback, CombatState } from '../domain/combat';

export const feedbackLifetimeMs=650;
export const feedbackPriorityWindowMs=100;

export interface FeedbackSnapshot {
  events:CombatFeedback[];
  newEvents:CombatFeedback[];
  actorFeedback:CombatFeedback|null;
  hurtFeedback:CombatFeedback|null;
  visualMeter:number;
  ready:boolean;
  readyPulse:number;
  readySince:number|null;
}

/** The actor has one body, while every contact keeps its own HUD/audio event. */
export function feedbackPriority(event:CombatFeedback){
  if(event.finisher)return 5;
  const kind=event.contactResult??event.kind;
  return kind==='Cut'||kind==='Verdict'?4:kind==='Perfect'?3:kind==='Nice'?2:1;
}

/** Order-independent selection for contacts arriving within the same 100ms. */
export function selectActorFeedback(events:readonly CombatFeedback[],time:number,lifetimeMs=feedbackLifetimeMs):CombatFeedback|null{
  const active=events.filter(event=>event.time<=time&&time-event.time<lifetimeMs);
  if(!active.length)return null;
  const latestTime=Math.max(...active.map(event=>event.time));
  return active.filter(event=>latestTime-event.time<=feedbackPriorityWindowMs).reduce<CombatFeedback|null>((best,event)=>{
    if(!best)return event;
    const difference=feedbackPriority(event)-feedbackPriority(best);
    return difference>0||(difference===0&&(event.time>best.time||(event.time===best.time&&event.id>best.id)))?event:best;
  },null);
}

export function verdictIsReady(state:CombatState){
  return state.battle.meter>=100&&state.battle.bossHp>0&&state.battle.playerHp>0
    &&state.phase!=='verdictSlash'&&state.phase!=='settle';
}

/**
 * Battle-scoped presentation journal. All ages use the simulation clock, so a
 * paused battle freezes particles and energy flights without browser timers.
 */
export class FeedbackManager {
  private battleId:string|null=null;
  private seen=0;
  private lastTime=-Infinity;
  private events:CombatFeedback[]=[];
  private pendingEnergy:CombatFeedback[]=[];
  private previousMeter=0;
  private ready=false;
  private readyPulse=0;
  private readySince:number|null=null;

  update(state:CombatState):FeedbackSnapshot{
    if(state.battleId!==this.battleId||state.time<this.lastTime)this.reset();
    this.battleId=state.battleId;
    this.lastTime=state.time;
    const incoming=[...state.effects];
    if(state.feedback&&!incoming.some(event=>event.id===state.feedback!.id))incoming.push(state.feedback);
    incoming.sort((a,b)=>a.id-b.id);
    const fresh:CombatFeedback[]=[];
    for(const event of incoming){
      if(event.id<=this.seen)continue;
      this.seen=event.id;
      if(event.time>state.time||state.time-event.time>=feedbackLifetimeMs)continue;
      fresh.push(event);
    }
    this.events=[...this.events,...fresh].filter(event=>state.time-event.time<feedbackLifetimeMs);
    if(state.battle.meter<this.previousMeter||state.phase==='verdictSlash')this.pendingEnergy=[];
    if(state.phase!=='verdictSlash')this.pendingEnergy.push(...fresh.filter(event=>event.energyGain>0));
    this.pendingEnergy=this.pendingEnergy.filter(event=>state.time-event.time<550);
    const inFlight=this.pendingEnergy.reduce((sum,event)=>{
      const progress=Math.max(0,Math.min(1,(state.time-event.time-300)/250));
      const eased=progress*progress*(3-2*progress);
      return sum+event.energyGain*(1-eased);
    },0);
    const ready=verdictIsReady(state);
    if(ready&&!this.ready){
      this.readySince=state.time;
      // Consume a paused threshold without replaying its sound on resume.
      if(!state.paused)this.readyPulse++;
    }else if(!ready)this.readySince=null;
    this.ready=ready;
    this.previousMeter=state.battle.meter;
    const actorEvents=state.feedback?[...this.events,state.feedback]:this.events;
    const selected=selectActorFeedback(actorEvents,state.time,state.bossKind==='jelly'?720:feedbackLifetimeMs);
    // Death keeps its original start time after the short feedback journal ends.
    const actorFeedback=state.battle.bossHp<=0?state.feedback:selected;
    const hurtFeedback=this.events.filter(event=>event.kind==='Miss'&&!event.pendingRound).at(-1)??null;
    return {
      events:[...this.events],newEvents:state.paused?[]:fresh,actorFeedback,hurtFeedback,
      visualMeter:ready?100:Math.max(0,Math.min(100,state.battle.meter-inFlight)),
      ready,readyPulse:this.readyPulse,readySince:this.readySince,
    };
  }

  reset(){
    this.battleId=null;
    this.seen=0;this.lastTime=-Infinity;this.events=[];this.pendingEnergy=[];
    this.previousMeter=0;this.ready=false;this.readyPulse=0;this.readySince=null;
  }

  dispose(){this.reset()}
}
