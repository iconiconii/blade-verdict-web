import type { CombatState } from '../domain/combat';

type AudioState=Pick<CombatState,'battleId'|'battle'|'levelId'|'stageIndex'|'phase'|'paused'>;

/** Presentation-only observer: neither sound nor missing audio can alter combat. */
export class VerdictEndAudioTracker {
  private previous:AudioState|null=null;
  private lastVerdict=-1;

  update(state:AudioState):boolean {
    const previous=this.previous;
    this.previous=state;
    if(!previous||previous.battleId!==state.battleId){this.lastVerdict=-1;return false}
    const ended=state.levelId===null
      ?previous.phase==='verdictSlash'&&state.phase==='stagger'
      :state.stageIndex>previous.stageIndex;
    if(!ended||state.battle.verdictCount<=this.lastVerdict)return false;
    this.lastVerdict=state.battle.verdictCount;
    // Consume silent transitions, too: resuming must not replay a past ending.
    return !state.paused&&state.battle.playerHp>0;
  }
}

interface Gesture { pointerId:number; battleId:string; verdictCount:number; moved:boolean; touched:boolean }
/** Distinguish a real empty swing from jitter, a cancelled drag or an async hit. */
export class SwingAudioTracker {
  private gesture:Gesture|null=null;

  begin(pointerId:number,state:AudioState){
    this.gesture=state.phase==='verdictSlash'&&!state.paused
      ?{pointerId,battleId:state.battleId,verdictCount:state.battle.verdictCount,moved:false,touched:false}:null;
  }

  sample(pointerId:number,sample:{consumed:boolean;contact:unknown|null}){
    if(this.gesture?.pointerId!==pointerId)return;
    this.gesture.moved||=sample.consumed;
    this.gesture.touched||=sample.contact!==null;
  }

  finish(pointerId:number,state:AudioState,hidden=false):boolean {
    const gesture=this.gesture;
    if(!gesture||gesture.pointerId!==pointerId)return false;
    this.gesture=null;
    return !hidden&&!state.paused&&state.phase==='verdictSlash'
      &&gesture.battleId===state.battleId&&gesture.verdictCount===state.battle.verdictCount
      &&gesture.moved&&!gesture.touched;
  }

  cancel(){this.gesture=null}
}
