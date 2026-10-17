import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BattleScene } from './BattleScene';
import { SpriteBattleScene } from './SpriteBattleScene';
import { currentVerdictStage, durations, verdictDurationFor, verdictRemainingMs, type CombatFeedback } from './domain/combat';
import { consumableCount, SHOP_ITEMS } from './domain/meta';
import { bodyAnchorLabel, type VerdictPoint } from './domain/v2';
import { useGame } from './store';
import { swipeContact } from './domain/swipe';
import { GameButton, ItemIcon } from './ui';
import './ui/migration.css';
import { BattleHud } from './ui/hunt/BattleHud';
import { AudioManager } from './audio/AudioManager';
import { battleAudioAssets } from './audio/audioAssets';
import { SwingAudioTracker, VerdictEndAudioTracker } from './audio/BattleAudioFeedback';
import { createBattleAudio, duckMusic } from './audio/GameAudio';
import { FeedbackManager, type FeedbackSnapshot } from './feedback/FeedbackManager';
import { CircleFeedback } from './ui/hunt/CircleFeedback';
import { IngredientBursts } from './ui/hunt/IngredientBursts';
import { battleVisualMode } from './scene/sprites/battleVisualMode';

const parryLabels={early:'GOOD · 点击即可',nice:'GOOD · 点击即可',perfect:'PERFECT · 甜蜜点',late:'GOOD · 点击即可'} as const;

const emptyFeedback:FeedbackSnapshot={events:[],newEvents:[],actorFeedback:null,hurtFeedback:null,visualMeter:0,ready:false,readyPulse:0,readySince:null};
function vibrate(pattern:number|number[]){
  try{if('vibrate' in navigator)navigator.vibrate(pattern)}catch{/* Haptics are optional. */}
}

export function Battle(){
  const host=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const scene=useRef<BattleScene|SpriteBattleScene|null>(null),clock=useRef(0),points=useRef<VerdictPoint[]>([]),lastAccepted=useRef<VerdictPoint|null>(null);
  const capturedPointer=useRef<number|null>(null);
  const targetButtons=useRef(new Map<number,HTMLButtonElement>());
  const [size,setSize]=useState({width:1,height:1});
  const [ready,setReady]=useState(false),readyRef=useRef(false);
  const [failed,setFailed]=useState(false),failedRef=useRef(false);
  const feedbackManager=useRef<FeedbackManager|null>(null),audio=useRef<AudioManager|null>(null),lastReadyPulse=useRef(0);
  const swingAudio=useRef(new SwingAudioTracker());
  const [presentation,setPresentation]=useState<FeedbackSnapshot>(emptyFeedback);
  const combat=useGame(s=>s.combat),tutorialSeen=useGame(s=>s.tutorialSeen);
  const bombCount=useGame(s=>consumableCount(s.meta,'upgrade_tomato_bomb'));
  const weaponName=useGame(s=>SHOP_ITEMS.find(item=>item.id===s.meta.equippedWeaponId)?.name??'基础厨刀');
  const weaponId=useGame(s=>s.meta.equippedWeaponId);
  const {battle,bossKind,phase,targets,feedback,paused}=combat;
  const verdictStage=currentVerdictStage(combat);
  const showReadyCallout=presentation.ready&&presentation.readySince!==null&&combat.time-presentation.readySince<1200;
  const resolvedTargets=targets.filter(target=>target.resolved).length;
  const nextTarget=targets.find(target=>!target.resolved);
  const feedbackOrigin=(event:CombatFeedback)=>event.anchorId?scene.current?.getBodyAnchorLayout(event.anchorId)??null:{x:event.position.x*size.width,y:event.position.y*size.height};
  const unlockAudio=()=>{void audio.current?.unlock()};
  const clearStrokeInput=(pointerId=capturedPointer.current)=>{
    if(pointerId===null||capturedPointer.current!==pointerId)return;
    capturedPointer.current=null;points.current=[];lastAccepted.current=null;
    swingAudio.current.cancel();
    const element=stage.current;
    if(element?.hasPointerCapture(pointerId))element.releasePointerCapture(pointerId);
  };
  const stopFeedback=()=>{audio.current?.stopAll();clearStrokeInput();swingAudio.current.cancel();vibrate(0)};
  const pauseBattle=()=>{stopFeedback();useGame.getState().pause(true)};
  const positionTarget=(index:number,button:HTMLButtonElement)=>{
    const layout=scene.current?.getTargetLayout(index);
    const visible=layout?.visible&&layout.circleId===button.dataset.circleId;
    button.style.visibility=visible?'visible':'hidden';
    if(!layout)return;
    button.style.left=`${layout.x}px`;button.style.top=`${layout.y}px`;
    button.style.width=button.style.height=`${layout.diameter}px`;
  };

  // A single simulation clock drives both render and input. Hidden tabs stop;
  // resume resets the wall clock so no elapsed background time causes damage.
  const advanceNow=()=>{
    const now=performance.now(),delta=clock.current?Math.min(50,now-clock.current):0;clock.current=now;
    if(readyRef.current&&!failedRef.current&&useGame.getState().tutorialSeen&&!document.hidden)useGame.getState().advance(delta);
  };
  useEffect(()=>{
    let alive=true,frame=0;
    feedbackManager.current=new FeedbackManager();audio.current=createBattleAudio();lastReadyPulse.current=0;
    void audio.current.preload(battleAudioAssets);
    const verdictAudio=new VerdictEndAudioTracker();
    verdictAudio.update(useGame.getState().combat);
    const unsubscribeAudio=useGame.subscribe(state=>{
      if(verdictAudio.update(state.combat)&&!document.hidden&&readyRef.current&&!failedRef.current){
        audio.current?.playCue('VerdictEnd');duckMusic(1500);
      }
    });
    const error=()=>{if(alive){failedRef.current=true;setFailed(true)}};
    const sceneReady=()=>{if(alive){readyRef.current=true;setReady(true);clock.current=performance.now()}};
    const setupScene=async()=>{
      if(battleVisualMode(bossKind)==='three'){
        // Retain the legacy renderer for unsupported future content. Supplied
        // sprite monsters never download the 3D rig.
        const {BattleScene}=await import('./BattleScene');
        if(alive)scene.current=new BattleScene(host.current!,error,sceneReady,bossKind);
      }else scene.current=new SpriteBattleScene(host.current!,error,sceneReady,bossKind);
    };
    void setupScene().catch(error);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const loop=()=>{
      if(!alive)return;
      frame=requestAnimationFrame(loop);
      try{
        advanceNow();
        if(!failedRef.current){
          scene.current?.render(useGame.getState().combat,reduced.matches);
          targetButtons.current.forEach((button,index)=>positionTarget(index,button));
        }
      }catch(cause){console.error('Battle frame failed',cause);error()}
    };
    const resize=()=>{const rect=stage.current!.getBoundingClientRect();setSize({width:rect.width,height:rect.height});scene.current?.resize();clearStrokeInput();swingAudio.current.cancel();useGame.getState().cancelStroke()};
    const observer=new ResizeObserver(resize);observer.observe(stage.current!);resize();
    const visibility=()=>{clock.current=performance.now();if(document.hidden)pauseBattle()};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(useGame.getState().combat.paused){unlockAudio();clock.current=performance.now();useGame.getState().pause(false)}else pauseBattle()}};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('keydown',key);frame=requestAnimationFrame(loop);
    return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();unsubscribeAudio();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',key);stopFeedback();audio.current?.dispose();audio.current=null;feedbackManager.current?.dispose();feedbackManager.current=null;scene.current?.dispose();scene.current=null;readyRef.current=false};
  },[]);

  useEffect(()=>{
    const next=feedbackManager.current?.update(combat);if(!next)return;
    setPresentation(next);
    const canPlay=!combat.paused&&!document.hidden&&readyRef.current&&!failedRef.current;
    // Consume every event even while silent. Resuming never replays old audio.
    if(canPlay){
      next.newEvents.forEach(event=>audio.current?.play(event));
      if(next.newEvents.some(event=>event.finisher))duckMusic(1100);
      if(next.newEvents.length){
        vibrate(next.newEvents.some(event=>event.bombDamage!==undefined)?[24]:next.newEvents.some(event=>event.kind==='Miss')?[18,28,18]:next.newEvents.some(event=>event.kind==='Perfect')?[18]:[8]);
      }
      if(next.ready&&next.readyPulse!==lastReadyPulse.current){audio.current?.playReady();duckMusic(750);vibrate([18,24,42])}
    }
    lastReadyPulse.current=next.readyPulse;
  },[combat]);
  // The final cut can end the verdict before pointerup arrives. DOM capture
  // belongs to this gesture, independently of the already-reset combat pointer.
  useEffect(()=>{if(phase!=='verdictSlash'||paused)clearStrokeInput()},[phase,paused]);
  useEffect(()=>{if(paused)stopFeedback()},[paused]);
  const tapAt=(clientX:number,clientY:number)=>{
    const rect=stage.current?.getBoundingClientRect();if(!rect)return;
    const target=scene.current?.getTargetAt(clientX-rect.left,clientY-rect.top,useGame.getState().combat);
    if(target)useGame.getState().tap({battleId:combat.battleId,circleId:target.circleId});
  };
  const point=(event:ReactPointerEvent<HTMLDivElement>):VerdictPoint=>{const rect=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height,time:performance.now()}};
  const begin=(event:ReactPointerEvent<HTMLDivElement>)=>{
    advanceNow();if(event.button!==0||useGame.getState().combat.paused)return;
    if(useGame.getState().combat.phase==='targetActive'){tapAt(event.clientX,event.clientY);return}
    if(useGame.getState().combat.phase!=='verdictSlash'||useGame.getState().combat.pointerId!==null)return;
    const first=point(event);event.currentTarget.setPointerCapture(event.pointerId);capturedPointer.current=event.pointerId;points.current=[first];lastAccepted.current=first;useGame.getState().beginStroke(event.pointerId,first);
    swingAudio.current.begin(event.pointerId,useGame.getState().combat);
  };
  const move=(event:ReactPointerEvent<HTMLDivElement>)=>{
    advanceNow();
    if(useGame.getState().combat.pointerId!==event.pointerId)return;
    const p=point(event),last=points.current.at(-1)!;
    if(Math.hypot((p.x-last.x)*size.width,(p.y-last.y)*size.height)<2)return;
    points.current.push(p);if(points.current.length>512)points.current=points.current.filter((_,i)=>i%2===0);useGame.getState().moveStroke(event.pointerId,p);
    const previous=lastAccepted.current;
    if(previous){
      const sample=swipeContact(previous,p,size.width,size.height,q=>scene.current?.isPointInsideMonster(q)??false);
      swingAudio.current.sample(event.pointerId,sample);
      if(sample.contact)useGame.getState().cut(event.pointerId,sample.contact,true,sample.angle);
      if(sample.consumed)lastAccepted.current=p;
    }
  };
  const end=(event:ReactPointerEvent<HTMLDivElement>)=>{
    advanceNow();
    if(useGame.getState().combat.pointerId===event.pointerId){
      move(event);useGame.getState().endStroke(event.pointerId);
      if(swingAudio.current.finish(event.pointerId,useGame.getState().combat,document.hidden))audio.current?.playCue('SwingMiss');
    }
    clearStrokeInput(event.pointerId);
  };
  const cancelPointer=(pointerId:number)=>{
    if(useGame.getState().combat.pointerId===pointerId)useGame.getState().cancelStroke();
    clearStrokeInput(pointerId);
  };
  const inVerdict=phase==='verdictReady'||phase==='verdictSlash';
  const phaseHint=verdictStage
    ? `裁决 ${verdictStage.number}/${verdictStage.total} · ${inVerdict?(phase==='verdictReady'?'点击左下角释放裁决':'连续划过怪物'):`招架组 ${verdictStage.groupsResolved}/${verdictStage.groupCount}${combat.retryingGroup?' · 补漏':''}${targets.length===2&&phase==='targetActive'?` · 双圈 ${resolvedTargets}/2`:''}`}`
    : inVerdict?(phase==='verdictReady'?'点击左下角释放裁决':'连续划过怪物'):bossKind==='jelly'&&targets.length===2?`依次招架 ${resolvedTargets}/${targets.length}`:'';
  const showFeedback=Boolean(feedback&&combat.time-feedback.time<650);
  return <section className={`battle battle--storybook battle--${phase} ${feedback?.finisher&&showFeedback?'battle--finisher':''}`} data-testid="battle" data-battle-phase={phase} data-paused={paused} data-visual-mode={battleVisualMode(bossKind)}>
    <div className="battle-stage" ref={stage} onPointerDownCapture={unlockAudio} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={event=>cancelPointer(event.pointerId)} onLostPointerCapture={event=>cancelPointer(event.pointerId)}>
      <div ref={host} className="canvas" aria-hidden="true"/>
      <div className="battle-vignette"/>
      {showReadyCallout&&<div key={presentation.readyPulse} className="verdict-ready-callout" role="status" aria-live="polite"><strong>裁决就绪</strong><span>点击左下角释放</span></div>}
      {presentation.hurtFeedback&&<div key={presentation.hurtFeedback.id} className="player-hurt-flash" aria-hidden="true"/>}
      {feedback?.finisher&&showFeedback&&<div className="finisher-impact" aria-hidden="true"><i className="finisher-impact__ring"/><i className="finisher-impact__slash finisher-impact__slash--one"/><i className="finisher-impact__slash finisher-impact__slash--two"/><strong>FINISH</strong><span>FINAL CUT · 击杀确认</span></div>}
      <IngredientBursts events={presentation.events} bossKind={bossKind} time={combat.time} origin={feedbackOrigin}/>
      {presentation.events.filter(event=>event.bombDamage!==undefined).map(event=><div key={`bomb-${event.id}`} data-testid="bomb-feedback" className="bomb-feedback" style={{left:`${event.position.x*100}%`,top:`${event.position.y*100}%`}}>
        <div className="ingredient-burst bomb-fragments" aria-hidden="true">{Array.from({length:7},(_,index)=><i key={index} style={{'--burst-index':index,'--burst-count':7,'--burst-row':index%3} as React.CSSProperties}><ItemIcon name="tomato" size={20}/></i>)}</div>
        <strong>爆炸 −{event.bombDamage}</strong>
      </div>)}
      {(phase==='targetActive'||phase==='telegraph')&&targets.map(target=>{
        const active=phase==='targetActive'&&combat.elapsed>=target.startDelayMs&&combat.elapsed-target.startDelayMs<target.ringDurationMs&&!target.resolved&&!paused;
        const waiting=phase==='telegraph'||combat.elapsed<target.startDelayMs;
        const timingLabel=target.resolved?(target.result==='Perfect'?'Perfect':target.result==='Nice'?'Good':'Miss'):waiting?'即将亮起':parryLabels[target.phase];
        return <button key={target.circleId} className="parry-target"
          ref={button=>{if(button){targetButtons.current.set(target.targetIndex,button);positionTarget(target.targetIndex,button)}else targetButtons.current.delete(target.targetIndex)}}
          data-testid={`target-${target.targetIndex}`} data-circle-id={target.circleId} data-anchor={target.anchorId} data-round={combat.round} data-phase={target.phase} data-resolved={target.resolved} disabled={!active}
          aria-label={`招架环 ${target.targetIndex+1}/${targets.length} · ${bodyAnchorLabel(target.anchorId)} · ${timingLabel}`}
          title={timingLabel}
          onPointerDown={e=>{e.stopPropagation();e.preventDefault();if(e.button!==0)return;advanceNow();tapAt(e.clientX,e.clientY)}}
          onClick={e=>{if(e.detail===0){unlockAudio();advanceNow();useGame.getState().tap({battleId:combat.battleId,circleId:target.circleId})}}}>
          <span className="target-caption"><b>{target.resolved?'✓':target.targetIndex+1}</b>{bodyAnchorLabel(target.anchorId)} · {timingLabel}</span>
        </button>
      })}
    </div>
    <BattleHud combat={combat} visualMeter={presentation.visualMeter} readyPulse={presentation.readyPulse} bombCount={bombCount} weaponId={weaponId} weaponName={weaponName} onPause={pauseBattle} onRelease={()=>{unlockAudio();advanceNow();useGame.getState().releaseVerdict(combat.battleId)}}/>
    {phaseHint&&<div className="phase-ribbon"><span className="phase-dot"/>{phaseHint}{bossKind==='jelly'&&phase==='targetActive'&&resolvedTargets>0&&nextTarget&&targets.length>1&&<span className="phase-next">下一处：{bodyAnchorLabel(nextTarget.anchorId)}</span>}</div>}
    <CircleFeedback events={presentation.events}/>
    {phase==='intro'&&ready&&tutorialSeen&&<div className="ready-go" data-testid="ready-go" aria-live="polite"><small>{combat.elapsed<durations.ready?'BLADE VERDICT':'FIRST STRIKE'}</small><strong>{combat.elapsed<durations.ready?'READY':'GO'}</strong><span>{combat.elapsed<durations.ready?'锁定目标':'点击身体光环'}</span></div>}
    {showFeedback&&feedback&&(feedback.kind==='Cut'||feedback.kind==='Verdict')&&<div className={`hit-feedback hit-feedback--${feedback.kind} ${feedback.finisher?'hit-feedback--finisher':''}`} key={feedback.id} role="status" aria-live="polite"><strong>{feedback.finisher?'FINISH':feedback.kind==='Cut'?'CUT':feedback.score===100?'PERFECT VERDICT':'VERDICT'}</strong><span>{feedback.kind==='Cut'?(feedback.finisher?'击杀确认 · 怪物崩解':`主体切割 · Combo ×${combat.verdictCombo}`):`${feedback.score} 分 · 切割完成`} <b>−{feedback.amount}</b></span></div>}
    {inVerdict&&<div className={`verdict-heading ${combat.fever?'verdict-heading--fever':''}`}><small>{combat.fever?'FEVER':'BREAK'}</small><h2>{phase==='verdictReady'?'裁决就绪':'切！'}</h2>{phase==='verdictSlash'&&<div className="verdict-clock"><i style={{width:`${verdictRemainingMs(combat)/verdictDurationFor(combat)*100}%`}}/><span>{(verdictRemainingMs(combat)/1000).toFixed(1)}s · Combo ×{combat.verdictCombo}</span></div>}</div>}

    {(!ready||!tutorialSeen||paused||failed)&&<div className="battle-modal-backdrop"><div className="battle-modal" role="dialog" aria-modal="true" aria-labelledby="battle-dialog-title"><small>BLADE VERDICT</small><h2 id="battle-dialog-title">{failed?'场景加载失败':!ready?'正在进入农场…':paused?'战斗已暂停':'先认识你的节拍'}</h2>{failed?<p>怪物动作资源或场景暂不可用。你的本场战斗已经停止计时。</p>:!ready?<p>准备怪物、场景和刀光</p>:paused?<p>生命与攻击时间已冻结，准备好再继续。</p>:<><p>本场光环寿命约 {(combat.tempo.durationMs/1000).toFixed(2)} 秒。<br/>找青色甜蜜点打出 Perfect，其余时间也会得到 Good。<br/>{bossKind==='jelly'?'双圈请依次点击。':bossKind==='corn'?'本关只有单圈。':'双圈同时出现，可按任意顺序分别点击。'}<br/>{verdictStage?`本关共 ${verdictStage.total} 次裁决。漏点一圈失去一颗爱心、不蓄能，并补出漏圈；三次漏点失败。蓄满后点击左下角释放裁决；限时内完成切割，否则挑战失败。`:'每漏一个圈扣一颗爱心，三次漏点失败。MISS 不蓄能。蓄满后点击左下角释放裁决。'}</p></>}{ready&&!failed&&<GameButton autoFocus variant="gold" onClick={()=>{unlockAudio();clock.current=performance.now();if(paused)useGame.getState().pause(false);else useGame.getState().dismissTutorial()}}>{paused?'继续战斗':'开始战斗'}</GameButton>}{(paused||failed)&&<GameButton variant="wood" onClick={()=>useGame.getState().go('stages')}>退出讨伐</GameButton>}</div></div>}
  </section>;
}
