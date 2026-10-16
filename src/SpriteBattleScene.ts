import type { CombatFeedback, CombatState } from './domain/combat';
import { ringRadiusAt, type BodyAnchorId, type BossKind } from './domain/v2';
import { FeedbackManager } from './feedback/FeedbackManager';
import { ImpactPresentation } from './scene/ImpactPresentation';
import type { ParryTargetLayout } from './scene/layout';
import { verdictMotion } from './scene/verdictMotion';
import { SpriteFrameBank, frameAt, reactionDurationMs, spriteClips, type SpriteBox, type SpriteClip } from './scene/sprites/SpriteFrames';
import { neutralTransform, spriteAnchor, spriteContainsPoint, spriteGeometry, spritePoseBounds, transformPoint,
  type ActorTransform, type SpriteGeometry } from './scene/sprites/SpriteGeometry';

export type { ParryTargetLayout } from './scene/layout';

type Point={x:number;y:number};
const palette:Record<Exclude<BossKind,'tomato'>,{warm:string;accent:string;fragment:string}>={
  corn:{warm:'#ffd46b',accent:'#72ffe1',fragment:'#e9a932'},
  carrot:{warm:'#ffae68',accent:'#72ffe1',fragment:'#ed812d'},
  cabbage:{warm:'#c9e99a',accent:'#72ffe1',fragment:'#a7cf66'},
  jelly:{warm:'#d5afff',accent:'#9bfff3',fragment:'#aa83e4'},
};
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=(value:number)=>{const t=clamp(value);return t*t*(3-2*t)};

/** Canvas 2D actor/effects pass over the existing painted garden background. */
export class SpriteBattleScene {
  private canvas=document.createElement('canvas');
  private ctx:CanvasRenderingContext2D;
  private frameBank:SpriteFrameBank;
  private bossKind:Exclude<BossKind,'tomato'>;
  private feedbackManager=new FeedbackManager();
  private impactPresentation=new ImpactPresentation();
  private width=1;
  private height=1;
  private geometry:SpriteGeometry|null=null;
  private targetLayouts:ParryTargetLayout[]=[];
  private actorTransform:ActorTransform=neutralTransform;
  private poseBounds:SpriteBox|null=null;
  private lastImage:HTMLImageElement|null=null;
  private disposed=false;

  constructor(private host:HTMLElement,private onFailure:()=>void,onReady:()=>void,bossKind:BossKind='corn'){
    if(bossKind==='tomato')throw Error('Tomato still uses its existing battle scene');
    this.bossKind=bossKind;
    const ctx=this.canvas.getContext('2d',{alpha:true});
    if(!ctx)throw Error('Canvas 2D is unavailable');
    this.ctx=ctx;
    this.canvas.dataset.scene='sprite-2d';
    this.canvas.setAttribute('aria-hidden','true');
    this.host.appendChild(this.canvas);
    this.frameBank=new SpriteFrameBank(bossKind);
    this.resize();
    void this.frameBank.ready().then(()=>{
      if(this.disposed)return;
      this.geometry=spriteGeometry(this.frameBank.manifest!,this.width,this.height);
      onReady();
    }).catch(()=>{if(!this.disposed)this.onFailure()});
  }

  resize(){
    const {width,height}=this.host.getBoundingClientRect();
    if(width<=0||height<=0)return;
    this.width=width;this.height=height;
    const dpr=Math.min(globalThis.devicePixelRatio||1,2);
    this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
    this.canvas.style.width=`${width}px`;this.canvas.style.height=`${height}px`;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    if(this.frameBank?.manifest)this.geometry=spriteGeometry(this.frameBank.manifest,width,height);
  }

  getTargetLayout(index:number){return this.targetLayouts[index]}

  /** Choose the nearest live circle, including after another finger just resolved its partner. */
  getTargetAt(x:number,y:number,currentState?:CombatState){
    if(currentState&&(currentState.paused||currentState.phase!=='targetActive'))return null;
    let nearest:ParryTargetLayout|null=null,distance=Infinity;
    for(const layout of this.targetLayouts){
      if(!layout.visible)continue;
      if(currentState&&!currentState.targets.some(target=>target.circleId===layout.circleId&&!target.resolved
        &&currentState.elapsed>=target.startDelayMs&&currentState.elapsed-target.startDelayMs<target.ringDurationMs))continue;
      const next=Math.hypot(x-layout.x,y-layout.y);
      if(next<=layout.diameter/2&&next<distance){nearest=layout;distance=next}
    }
    return nearest;
  }

  getBodyAnchorLayout(anchorId:BodyAnchorId):Point|null{
    if(!this.geometry)return null;
    return transformPoint(spriteAnchor(this.geometry,this.bossKind,anchorId,this.poseBounds??this.geometry.sourceBody),
      this.geometry.bodyCenter,this.actorTransform);
  }

  isPointInsideMonster(point:Point){
    const geometry=this.geometry;if(!geometry)return false;
    return spriteContainsPoint(geometry,this.actorTransform,point,this.width,this.height);
  }

  private reaction(state:CombatState,reducedMotion:boolean):{clip:SpriteClip;age:number}{
    const event=state.feedback,result=event?.contactResult??event?.kind;
    const clip:SpriteClip=result==='Nice'?'Good':result==='Perfect'?'Perfect':result==='Miss'?'Miss':'Idle';
    const age=event?Math.max(0,state.time-event.time):Infinity;
    const duration=reactionDurationMs(this.bossKind,clip);
    if(clip==='Idle'||age>=duration)return {clip:'Idle',age:reducedMotion?0:state.time};
    return {clip,age:reducedMotion?duration*.58:age};
  }

  private effectHeavyFrame(clip:SpriteClip,frame:{n:number}){
    // This supplied frame is a full-canvas flash, not a body pose. Other large
    // frames include essential acting, so they must remain fully visible.
    return this.bossKind==='corn'&&clip==='Perfect'&&frame.n===27;
  }

  private transformation(state:CombatState,reducedMotion:boolean,shake:number):ActorTransform{
    const motion=verdictMotion(state,reducedMotion);
    return {
      x:motion.x*(reducedMotion?4:23)+shake*this.width*.55,
      y:motion.y*(reducedMotion?2:11)+motion.compression*4,
      rotation:motion.x*(reducedMotion?.04:.31),
      scaleX:1+motion.compression*(reducedMotion?.015:.075),
      scaleY:1-motion.compression*(reducedMotion?.015:.095),
    };
  }

  private drawActorImage(image:HTMLImageElement,opacity=1){
    const geometry=this.geometry!,manifest=this.frameBank.manifest!,ctx=this.ctx;
    const [cropX,cropY,cropWidth,cropHeight]=manifest.crop;
    const [frameX,frameY,frameWidth,frameHeight]=this.frameBank.frameForImage(image)?.rect??[0,0,cropWidth,cropHeight];
    const pivot=geometry.bodyCenter,transform=this.actorTransform;
    ctx.save();ctx.globalAlpha=opacity;
    ctx.translate(pivot.x+transform.x,pivot.y+transform.y);
    ctx.rotate(transform.rotation);ctx.scale(transform.scaleX,transform.scaleY);
    ctx.translate(-pivot.x,-pivot.y);
    // Tight images retain their original-canvas offsets, so trimming transparent
    // pixels never re-centers an arm, leaf, weapon or reaction pose.
    ctx.drawImage(image,geometry.origin.x+(cropX+frameX)*geometry.scale,geometry.origin.y+(cropY+frameY)*geometry.scale,
      frameWidth*geometry.scale,frameHeight*geometry.scale);
    ctx.restore();
  }

  private drawGround(state:CombatState,reducedMotion:boolean){
    const geometry=this.geometry!,ctx=this.ctx,foot=geometry.foot;
    ctx.save();
    const glow=state.phase==='verdictReady'||state.phase==='verdictSlash';
    const telegraph=state.phase==='telegraph';
    ctx.fillStyle=glow?'#76ffe543':telegraph?'#ffd76a35':'#07150c55';
    ctx.beginPath();ctx.ellipse(foot.x,foot.y+10,geometry.bodyRadius.x*1.08,Math.max(12,geometry.bodyRadius.y*.17),0,0,Math.PI*2);ctx.fill();
    if(glow||telegraph){
      const pulse=reducedMotion?0:Math.sin(state.time/180)*3;
      ctx.strokeStyle=glow?'#7bffe88a':'#f5c76a66';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(foot.x,foot.y+10,geometry.bodyRadius.x*1.12+pulse,
        Math.max(13,geometry.bodyRadius.y*.18)+pulse*.15,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }

  private drawFinisherHalves(image:HTMLImageElement,event:CombatFeedback,age:number,reducedMotion:boolean){
    const ctx=this.ctx,geometry=this.geometry!,center=this.effectOrigin(event);
    const progress=clamp((age-80)/650),spread=(reducedMotion?15:18+geometry.bodyRadius.x*.8)*smooth(progress);
    const angle=event.angle??-.35,perpendicular={x:-Math.sin(angle),y:Math.cos(angle)};
    for(const side of [-1,1]){
      ctx.save();
      // Clip around the blade line in stage space; each source half keeps the
      // same pose and only travels after the 80ms visual hold.
      ctx.translate(center.x,center.y);ctx.rotate(angle);
      ctx.beginPath();ctx.rect(-this.width*2,side<0?-this.height*2:0,this.width*4,this.height*2);ctx.clip();
      ctx.rotate(-angle);ctx.translate(-center.x,-center.y);
      ctx.translate(perpendicular.x*side*spread,
        perpendicular.y*side*spread-Math.sin(progress*Math.PI)*22+progress*progress*52);
      ctx.translate(center.x,center.y);ctx.rotate(side*progress*.27);ctx.translate(-center.x,-center.y);
      this.drawActorImage(image,1-smooth((age-440)/440));
      ctx.restore();
    }
  }

  private drawRing(center:Point,radius:number,phase:string,reducedMotion:boolean,time:number){
    const ctx=this.ctx;
    const color=phase==='perfect'?'#76ffe3':phase==='nice'?'#ffd66d':phase==='late'?'#ff9459':'#ffbf5b';
    // The ring approaches zero before expiry. Its pulse must shrink with it,
    // because Canvas rejects negative radii and would abort the frame loop.
    const pulse=reducedMotion?0:Math.sin(time/85)*Math.min(radius,1.5);
    ctx.save();ctx.translate(center.x,center.y);
    ctx.fillStyle=phase==='perfect'?'#76ffe319':'#ffd66d10';
    ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=phase==='perfect'?20:12;ctx.shadowColor=color;
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.globalAlpha=.92;
    ctx.beginPath();ctx.arc(0,0,Math.max(0,radius+pulse),0,Math.PI*2);ctx.stroke();
    ctx.lineWidth=1;ctx.globalAlpha=.6;
    ctx.beginPath();ctx.arc(0,0,radius*.83,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=color;ctx.globalAlpha=.95;
    ctx.translate(0,-radius);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);
    ctx.restore();
  }

  private updateTargets(state:CombatState,reducedMotion:boolean){
    this.targetLayouts=[];
    for(let i=0;i<state.targets.length;i++){
      const target=state.targets[i],center=this.getBodyAnchorLayout(target.anchorId);
      if(!center)continue;
      const active=state.phase==='targetActive'&&!target.resolved
        &&state.elapsed>=target.startDelayMs&&state.elapsed-target.startDelayMs<target.ringDurationMs;
      const radius=ringRadiusAt(Math.max(0,state.elapsed-target.startDelayMs),target.ringDurationMs,target.maxRadiusPx);
      this.targetLayouts[i]={index:i,circleId:target.circleId,round:state.round,
        ...center,diameter:Math.max(44,radius*2),visible:active&&!state.paused};
      if(active&&!state.paused)this.drawRing(center,radius,target.phase,reducedMotion,state.time);
    }
  }

  private effectOrigin(event:CombatFeedback):Point{
    return event.anchorId?this.getBodyAnchorLayout(event.anchorId)??{x:event.position.x*this.width,y:event.position.y*this.height}
      :{x:event.position.x*this.width,y:event.position.y*this.height};
  }

  private drawGoodComic(event:CombatFeedback,age:number,reducedMotion:boolean){
    if(reducedMotion||age<0||age>=250)return;
    const ctx=this.ctx,paletteColor=palette[this.bossKind].warm,center=this.effectOrigin(event),fade=1-age/250;
    ctx.save();ctx.globalAlpha=fade*.68;ctx.strokeStyle=paletteColor;ctx.lineWidth=2;
    for(let i=0;i<9;i++){
      const angle=(i*2.39996+event.id*.7),distance=35+age*.24;
      const x=Math.cos(angle),y=Math.sin(angle);
      ctx.beginPath();ctx.moveTo(center.x+x*distance,center.y+y*distance);
      ctx.lineTo(center.x+x*(distance+16),center.y+y*(distance+16));ctx.stroke();
    }
    ctx.restore();
  }

  private drawBlade(event:CombatFeedback,age:number,reducedMotion:boolean){
    if(age<0||age>=720)return;
    const ctx=this.ctx,cut=event.kind==='Cut',finisher=!!event.finisher;
    const origin=this.effectOrigin(event),path=event.path;
    const first=path&&path.length>1?{x:path[0].x*this.width,y:path[0].y*this.height}:null;
    const last=path&&path.length>1?{x:path[path.length-1].x*this.width,y:path[path.length-1].y*this.height}:null;
    const length=finisher?Math.min(this.width*.8,320):cut?Math.min(this.width*.62,235):110;
    const x1=first?.x??origin.x-Math.cos(event.angle)*length*.5;
    const y1=first?.y??origin.y-Math.sin(event.angle)*length*.5;
    const x2=last?.x??origin.x+Math.cos(event.angle)*length*.5;
    const y2=last?.y??origin.y+Math.sin(event.angle)*length*.5;
    const trailDuration=finisher?340:cut?280:200;
    if(age<trailDuration){
      const alpha=(1-age/trailDuration)*(reducedMotion?.55:1);
      ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';
      ctx.shadowBlur=finisher?24:cut?17:10;ctx.shadowColor=finisher?'#fff5ad':cut?'#a8fff2':'#ffd789';
      ctx.strokeStyle=finisher?'#fff8d6':cut?'#d7fff4':'#ffe0a0';ctx.lineWidth=finisher?9:cut?6:4;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo((x1+x2)/2,(y1+y2)/2-15,x2,y2);ctx.stroke();
      ctx.strokeStyle='#fff';ctx.lineWidth=finisher?3:2;ctx.stroke();ctx.restore();
    }
    const release=finisher?80:0;
    if(age<release)return;
    const progress=clamp((age-release)/640),count=finisher?20:cut?12:6;
    ctx.save();ctx.fillStyle=palette[this.bossKind].fragment;ctx.globalAlpha=(1-progress)*(reducedMotion?.42:.9);
    for(let i=0;i<count;i++){
      const angle=i*2.39996+event.id*.35,r=(10+progress*(finisher?155:cut?100:62))*(.68+(i%3)*.17);
      const x=origin.x+Math.cos(angle)*r,y=origin.y+Math.sin(angle)*r+progress*progress*75;
      const size=(finisher?6:cut?4:3)*(1-progress*.65)*(1+(i%3)*.25);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle+progress*3);ctx.fillRect(-size/2,-size/2,size,size);ctx.restore();
    }
    ctx.restore();
  }

  private drawEffects(state:CombatState,reducedMotion:boolean){
    for(const event of state.effects){
      const age=state.time-event.time;
      if(age<0||age>=800||event.kind==='Miss')continue;
      if((event.contactResult??event.kind)==='Nice')this.drawGoodComic(event,age,reducedMotion);
      this.drawBlade(event,age,reducedMotion);
    }
  }

  render(state:CombatState,reducedMotion=false){
    if(this.disposed||!this.frameBank.manifest||!this.geometry)return;
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.width,this.height);
    const snapshot=this.feedbackManager.update(state);
    const presentation=this.impactPresentation.update(state,reducedMotion,snapshot.actorFeedback);
    this.actorTransform=this.transformation(presentation.actor,reducedMotion,presentation.shake);
    const {clip,age}=this.reaction(presentation.actor,reducedMotion);
    const frame=frameAt(this.frameBank.manifest,clip,age,this.bossKind);
    const exactImage=this.frameBank.request(frame);
    const effectHeavy=this.effectHeavyFrame(clip,frame);
    const image=effectHeavy?(this.lastImage??exactImage):(exactImage??this.frameBank.nearestLoaded(clip,frame)??this.lastImage);
    const displayedFrame=this.frameBank.frameForImage(image);
    const displayedClip=displayedFrame&&spriteClips.find(name=>this.frameBank.manifest!.clips[name].includes(displayedFrame));
    this.poseBounds=displayedFrame&&displayedClip
      ?spritePoseBounds(this.frameBank.manifest,displayedClip,displayedFrame):this.geometry.sourceBody;
    this.frameBank.prefetch(clip,frame,6);
    if(exactImage&&!effectHeavy)this.lastImage=exactImage;
    this.drawGround(state,reducedMotion);
    let finisher:CombatFeedback|undefined;
    for(let i=state.effects.length-1;i>=0;i--){
      const event=state.effects[i];
      if(event.finisher&&state.time-event.time>=0&&state.time-event.time<800){finisher=event;break}
    }
    if(image){
      if(finisher&&state.time-finisher.time>=80)
        this.drawFinisherHalves(image,finisher,state.time-finisher.time,reducedMotion);
      else if(state.battle.bossHp>0||finisher){
        this.drawActorImage(image);
      }else{
        const deathAge=state.feedback?Math.max(0,state.time-state.feedback.time):0;
        this.drawActorImage(image,1-smooth((deathAge-150)/700));
      }
    }
    // A handful of supplied Perfect frames are full-canvas starbursts. Keep
    // the previous body pose legible, and treat the artwork as a brief accent.
    if(effectHeavy&&exactImage&&clip!=='Idle'&&!reducedMotion)this.drawActorImage(exactImage,.18);
    this.drawEffects(state,reducedMotion);
    this.updateTargets(state,reducedMotion);
  }

  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.frameBank.dispose();this.feedbackManager.dispose();
    this.canvas.remove();this.lastImage=null;this.geometry=null;this.targetLayouts=[];
    this.poseBounds=null;
  }
}
