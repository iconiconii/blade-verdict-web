import type { CombatFeedback, CombatState } from '../../domain/combat';
import type { BossKind } from '../../domain/v2';
import type { VisualHold } from '../ImpactPresentation';
import { reactionDurationMs, type SpriteClip } from './SpriteFrames';

function movingTime(from:number,to:number,hold:VisualHold|null){
  const frozen=hold?Math.max(0,Math.min(to,hold.until)-Math.max(from,hold.from)):0;
  return Math.max(0,to-from-frozen);
}

const reactionPriority:Record<SpriteClip,number>={Idle:0,Miss:1,Good:2,Perfect:3};

/** Local presentation clock. Never changes combat time, circles or input. */
export class SpritePlayback {
  private battleId:string|null=null;
  private lastTime:number|null=null;
  private seen=0;
  private clip:SpriteClip='Idle';
  private age=0;
  private time=0;
  private revision=0;

  constructor(private bossKind:BossKind){}

  update(state:CombatState,feedback:CombatFeedback|null,hold:VisualHold|null,reducedMotion=false){
    if(this.battleId!==state.battleId||this.lastTime!==null&&state.time<this.lastTime){
      this.battleId=state.battleId;this.lastTime=null;this.seen=0;
      this.clip='Idle';this.age=0;this.time=0;this.revision++;
    }
    const first=this.lastTime===null;
    const delta=state.paused||first?0:movingTime(this.lastTime!,state.time,reducedMotion?null:hold);
    this.time+=delta;this.age+=delta;this.lastTime=state.time;
    if(feedback&&feedback.id>this.seen){
      this.seen=feedback.id;
      const result=feedback.contactResult??feedback.kind;
      const clip:SpriteClip=result==='Nice'?'Good':result==='Perfect'?'Perfect':result==='Miss'?'Miss':'Idle';
      const age=movingTime(feedback.time,state.time,reducedMotion?null:hold);
      if(clip!=='Idle'&&age<reactionDurationMs(this.bossKind,clip)){
        const duration=reactionDurationMs(this.bossKind,this.clip);
        if(this.clip==='Idle'||this.age>=duration){
          this.clip=clip;this.age=age;this.revision++;
        }else if(reactionPriority[clip]>reactionPriority[this.clip]){
          // Upgrade the acting at the same point in its recovery. A second
          // contact still gets its own hit stop/HUD/audio, but never rewinds
          // an unfinished body reaction or queues stale acting for later.
          this.age=this.age/duration*reactionDurationMs(this.bossKind,clip);
          this.clip=clip;this.revision++;
        }
      }
    }
    const verdict=state.phase==='verdictReady'||state.phase==='verdictSlash'||state.phase==='settle';
    if(this.clip!=='Idle'&&(this.age>=reactionDurationMs(this.bossKind,this.clip)||verdict||state.battle.bossHp<=0)){
      // Resume at a known neutral pose, independent of total battle time.
      this.clip='Idle';this.age=0;this.revision++;
    }
    return {clip:this.clip,age:reducedMotion?reactionDurationMs(this.bossKind,this.clip)*.58:this.age,
      time:this.time,revision:this.revision};
  }
}
