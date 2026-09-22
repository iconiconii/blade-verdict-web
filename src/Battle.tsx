import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BattleScene } from './BattleScene';
import { durations, verdictRemainingMs, type CombatFeedback } from './domain/combat';
import { bodyAnchorLabel, ingredientBurstFor, type VerdictPoint } from './domain/v2';
import { useGame } from './store';
import { swipeContact } from './domain/swipe';

const phaseLabels={intro:'目标锁定',telegraph:'蓄力预警',targetActive:'准备招架',impact:'反击命中',stagger:'短暂破防',verdictReady:'裁决就绪',verdictSlash:'连续裁决',settle:'战斗结束'};
const parryLabels={early:'GOOD · 点击即可',nice:'GOOD · 点击即可',perfect:'PERFECT · 甜蜜点',late:'GOOD · 点击即可'} as const;

let combatAudio:AudioContext|null=null;
function playCombatTone(feedback:CombatFeedback){
  if(typeof window==='undefined'||!window.AudioContext)return;
  try{
    const context=combatAudio??=new AudioContext();
    if(context.state==='suspended')void context.resume();
    const oscillator=context.createOscillator(),gain=context.createGain();
    const cut=feedback.kind==='Cut',perfect=feedback.kind==='Perfect',ferocious=feedback.speed==='ferocious';
    oscillator.type=perfect?'triangle':cut?'sawtooth':'sine';
    oscillator.frequency.value=feedback.finisher?110:perfect?720:cut?(ferocious?330:feedback.speed==='fast'?270:210):460;
    const duration=feedback.finisher?.14:perfect?.09:cut?.06:.07;
    gain.gain.setValueAtTime(.0001,context.currentTime);
    gain.gain.exponentialRampToValueAtTime(feedback.finisher?.12:.055,context.currentTime+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+duration);
    oscillator.connect(gain).connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+duration+.02);
  }catch{/* Audio is optional and may be blocked by the browser. */}
}

function IngredientBurst({feedback,bossKind,origin}:{feedback:CombatFeedback|null;bossKind:'corn'|'jelly';origin:{x:number;y:number}|null}){
  if(!feedback||feedback.energyGain<=0||(feedback.kind!=='Nice'&&feedback.kind!=='Perfect')||feedback.pendingRound)return null;
  const count=ingredientBurstFor(bossKind,feedback.kind);
  const source=origin??{x:0,y:0};
  return <div className={`ingredient-burst ingredient-burst--${bossKind} ingredient-burst--${feedback.kind.toLowerCase()}`} style={{left:source.x,top:source.y}} aria-hidden="true">
    {Array.from({length:count},(_,index)=><i key={`${feedback.id}-${index}`} style={{'--burst-index':index,'--burst-count':count} as React.CSSProperties}>{bossKind==='corn'?'🌽':'🫐'}</i>)}
  </div>;
}

export function Battle(){
  const host=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const scene=useRef<BattleScene|null>(null),clock=useRef(0),points=useRef<VerdictPoint[]>([]),lastAccepted=useRef<VerdictPoint|null>(null);
  const targetButtons=useRef(new Map<number,HTMLButtonElement>());
  const [size,setSize]=useState({width:1,height:1});
  const [ready,setReady]=useState(false),readyRef=useRef(false);
  const [failed,setFailed]=useState(false),failedRef=useRef(false);
  const [visualMeter,setVisualMeter]=useState(0),meterTimers=useRef<number[]>([]);
  const combat=useGame(s=>s.combat),tutorialSeen=useGame(s=>s.tutorialSeen);
  const {battle,bossKind,phase,targets,feedback,combo,paused}=combat;
  const resolvedTargets=targets.filter(target=>target.resolved).length;
  const nextTarget=targets.find(target=>!target.resolved);
  const ingredientOrigin=feedback?.anchorId?scene.current?.getBodyAnchorLayout(feedback.anchorId)??null:feedback?{x:feedback.position.x*size.width,y:feedback.position.y*size.height}:null;
  const phaseTitle=feedback?.kind==='Miss'?'受到攻击':feedback?.kind==='Nice'?'Good 反击':feedback?.kind==='Perfect'?'Perfect 反击':phaseLabels[phase];
  const positionTarget=(index:number,button:HTMLButtonElement)=>{
    const layout=scene.current?.getTargetLayout(index);
    const visible=layout?.visible&&layout.round===Number(button.dataset.round);
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
    const error=()=>{if(alive){failedRef.current=true;setFailed(true)}};
    try{scene.current=new BattleScene(host.current!,error,()=>{if(alive){readyRef.current=true;setReady(true);clock.current=performance.now()}},bossKind)}catch{error()}
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const loop=()=>{if(!alive)return;advanceNow();if(!failedRef.current){scene.current?.render(useGame.getState().combat,reduced.matches);targetButtons.current.forEach((button,index)=>positionTarget(index,button))}frame=requestAnimationFrame(loop)};
    const resize=()=>{const rect=stage.current!.getBoundingClientRect();setSize({width:rect.width,height:rect.height});scene.current?.resize();useGame.getState().cancelStroke()};
    const observer=new ResizeObserver(resize);observer.observe(stage.current!);resize();
    const visibility=()=>{clock.current=performance.now();if(document.hidden)useGame.getState().pause(true)};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')useGame.getState().pause(!useGame.getState().combat.paused)};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('keydown',key);frame=requestAnimationFrame(loop);
    return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',key);scene.current?.dispose();scene.current=null;readyRef.current=false};
  },[]);

  useEffect(()=>{if(!feedback||!('vibrate' in navigator))return;const pattern=feedback.kind==='Perfect'?[18]:feedback.kind==='Miss'?[18,28,18]:feedback.kind==='Cut'?(feedback.speed==='ferocious'?[12,18]:[8]):[8];navigator.vibrate(pattern)},[feedback?.id]);
  useEffect(()=>{if(feedback)playCombatTone(feedback)},[feedback?.id]);
  useEffect(()=>{
    meterTimers.current.forEach(window.clearTimeout);meterTimers.current=[];
    if(!feedback||feedback.pendingRound||feedback.energyGain<=0||(feedback.kind!=='Nice'&&feedback.kind!=='Perfect')){
      setVisualMeter(battle.meter);return;
    }
    const start=Math.max(0,battle.meter-feedback.energyGain),target=battle.meter,count=ingredientBurstFor(bossKind,feedback.kind);
    setVisualMeter(start);
    for(let index=0;index<count;index++){
      meterTimers.current.push(window.setTimeout(()=>setVisualMeter(start+(target-start)*(index+1)/count),300+index*42));
    }
    return()=>{meterTimers.current.forEach(window.clearTimeout);meterTimers.current=[]};
  },[feedback?.id,battle.meter,bossKind]);
  const point=(event:ReactPointerEvent<HTMLDivElement>):VerdictPoint=>{const rect=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height,time:performance.now()}};
  const begin=(event:ReactPointerEvent<HTMLDivElement>)=>{
    advanceNow();if(event.button!==0||useGame.getState().combat.phase!=='verdictSlash'||useGame.getState().combat.paused||useGame.getState().combat.pointerId!==null)return;
    const first=point(event);event.currentTarget.setPointerCapture(event.pointerId);points.current=[first];lastAccepted.current=first;useGame.getState().beginStroke(event.pointerId,first);
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
      if(sample.contact)useGame.getState().cut(event.pointerId,sample.contact,true,sample.angle);
      if(sample.consumed)lastAccepted.current=p;
    }
  };
  const end=(event:ReactPointerEvent<HTMLDivElement>)=>{
    advanceNow();if(useGame.getState().combat.pointerId!==event.pointerId)return;
    move(event);useGame.getState().endStroke(event.pointerId);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const inVerdict=phase==='verdictReady'||phase==='verdictSlash';
  const showFeedback=Boolean(feedback&&combat.time-feedback.time<650);
  return <section className={`battle battle--${phase} ${feedback?.kind==='Miss'&&showFeedback?'battle--hurt':''} ${feedback?.finisher&&showFeedback?'battle--finisher':''}`} data-testid="battle" data-battle-phase={phase} data-paused={paused}>
    <div className="battle-stage" ref={stage} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>useGame.getState().cancelStroke()} onLostPointerCapture={()=>{if(useGame.getState().combat.pointerId!==null)useGame.getState().cancelStroke()}}>
      <div ref={host} className="canvas" aria-hidden="true"/>
      <div className="battle-vignette"/>
      {feedback?.finisher&&showFeedback&&<div className="finisher-impact" aria-hidden="true"><i className="finisher-impact__ring"/><i className="finisher-impact__slash finisher-impact__slash--one"/><i className="finisher-impact__slash finisher-impact__slash--two"/><strong>FINISH</strong><span>FINAL CUT · 击杀确认</span></div>}
      <IngredientBurst feedback={feedback} bossKind={bossKind} origin={ingredientOrigin}/>
      {(phase==='targetActive'||phase==='telegraph')&&targets.map(target=>{
        const active=phase==='targetActive'&&combat.elapsed>=target.startDelayMs&&combat.elapsed-target.startDelayMs<target.ringDurationMs&&!target.resolved&&!paused;
        const waiting=phase==='telegraph'||combat.elapsed<target.startDelayMs;
        const timingLabel=target.resolved?(target.result==='Perfect'?'Perfect':target.result==='Nice'?'Good':'Miss'):waiting?'即将亮起':parryLabels[target.phase];
        return <button key={`${combat.round}-${target.targetIndex}`} className="parry-target"
          ref={button=>{if(button){targetButtons.current.set(target.targetIndex,button);positionTarget(target.targetIndex,button)}else targetButtons.current.delete(target.targetIndex)}}
          data-testid={`target-${target.targetIndex}`} data-anchor={target.anchorId} data-round={combat.round} data-phase={target.phase} data-resolved={target.resolved} disabled={!active}
          aria-label={`招架环 ${target.targetIndex+1}/${targets.length} · ${bodyAnchorLabel(target.anchorId)} · ${timingLabel}`}
          title={timingLabel}
          onPointerDown={e=>{e.stopPropagation();e.preventDefault();if(e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect();if(Math.hypot(e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2)>rect.width/2)return;advanceNow();useGame.getState().tap(target.targetIndex)}}
          onClick={e=>{if(e.detail===0){advanceNow();useGame.getState().tap(target.targetIndex)}}}>
          <span className="target-caption"><b>{target.resolved?'✓':target.targetIndex+1}</b>{bodyAnchorLabel(target.anchorId)} · {timingLabel}</span>
        </button>
      })}
    </div>
    <header className="battle-top">
      <button className="battle-icon" aria-label="返回与暂停" onClick={()=>useGame.getState().pause(true)}>‹</button>
      <div className="boss-hud"><div className="boss-heading"><span>{bossKind==='jelly'?'NO. 02 / JELLY LAB':'NO. 01 / CORN GUARDIAN'}</span><span>{bossKind==='jelly'?'危险度 III':'危险度 II'}</span></div><h2>{bossKind==='jelly'?'酸蚀果冻怪':'暴怒玉米守卫'} <small>{phaseTitle}</small></h2><div className="battle-health boss-health" role="progressbar" aria-label="Boss 生命值" aria-valuemin={0} aria-valuemax={800} aria-valuenow={battle.bossHp}><i style={{width:`${Math.max(0,Math.min(100,battle.bossHp/8))}%`}}/></div><div className="boss-meta"><span>{bossKind==='jelly'?'果冻实验室 · 反应池':'荒芜农场 · 月下讨伐'}</span><span data-testid="boss-hp">{battle.bossHp} <em>/ 800</em></span></div></div>
      <button className="battle-icon" aria-label="暂停战斗" onClick={()=>useGame.getState().pause(true)}>Ⅱ</button>
    </header>
    <div className="phase-ribbon"><span className="phase-dot"/>{inVerdict?'BREAK · 破防时刻':targets.length===2?`DOUBLE · 身体光环 ${resolvedTargets}/${targets.length}`:'PARRY · 观察身体光环 · 等待 · 反击'}{phase==='targetActive'&&resolvedTargets>0&&nextTarget&&!nextTarget.resolved&&targets.length>1&&<span className="phase-next">下一处：{bodyAnchorLabel(nextTarget.anchorId)}</span>}</div>
    {phase==='intro'&&ready&&tutorialSeen&&<div className="ready-go" data-testid="ready-go" aria-live="polite"><small>{combat.elapsed<durations.ready?'BLADE VERDICT':'FIRST STRIKE'}</small><strong>{combat.elapsed<durations.ready?'READY':'GO'}</strong><span>{combat.elapsed<durations.ready?'锁定目标':'点击身体光环'}</span></div>}
    {showFeedback&&feedback&&<div className={`hit-feedback hit-feedback--${feedback.kind} ${feedback.finisher?'hit-feedback--finisher':''}`} key={`${feedback.id}-${feedback.kind}`} role="status" aria-live={feedback.kind==='Miss'?'assertive':'polite'}><strong>{feedback.finisher?'FINISH':feedback.kind==='Cut'?'CUT':feedback.kind==='Verdict'?(feedback.score===100?'PERFECT VERDICT':'VERDICT'):feedback.kind==='Nice'?'GOOD':feedback.kind.toUpperCase()}</strong><span>{feedback.pendingRound?'已判定 · 继续下一环':feedback.kind==='Miss'?'受到攻击':feedback.kind==='Cut'?(feedback.finisher?'击杀确认 · 怪物崩解':`主体切割 · Combo ×${combat.verdictCombo}`):feedback.kind==='Verdict'?`${feedback.score} 分 · 切割完成`:'招架反击'} {!feedback.pendingRound&&<b>−{feedback.amount}</b>}</span></div>}
    {inVerdict&&<div className={`verdict-heading ${combat.fever?'verdict-heading--fever':''}`}><small>{combat.fever?'FEVER':'BREAK'}</small><h2>{phase==='verdictReady'?'破防！':'切！'}</h2>{phase==='verdictSlash'&&<div className="verdict-clock"><i style={{width:`${verdictRemainingMs(combat)/durations.verdict*100}%`}}/><span>{(verdictRemainingMs(combat)/1000).toFixed(1)}s · Combo ×{combat.verdictCombo}</span></div>}</div>}
    <footer className="battle-bottom">
      <div className="player-hud"><div className="player-avatar" aria-hidden="true">刃</div><div><div className="player-heading"><strong>守夜厨师</strong><span data-testid="player-hp">{battle.playerHp}/100</span></div><div className="battle-health player-health" role="progressbar" aria-label="玩家生命值" aria-valuemin={0} aria-valuemax={100} aria-valuenow={battle.playerHp}><i style={{width:`${Math.max(0,Math.min(100,battle.playerHp))}%`}}/></div><div className="combo"><b>{String(combo).padStart(2,'0')}</b> 连续招架</div></div></div>
    <div className="combat-instruction">{phase==='intro'?'':phase==='verdictSlash'?'切！':phase==='verdictReady'?'裁决就绪':!tutorialSeen?(phase==='telegraph'?'留意怪物身上随机亮起的光环':targets.length===2?'依次点击两处身体光环 · 第二处稍后出现':targets.some(t=>t.phase==='perfect')?'现在 · 点击身体光环':'点击即可，找准青色 PERFECT'):(phase==='telegraph'?'蓄力中':targets.length===2?`接力 ${resolvedTargets + 1}/${targets.length}`:targets.some(t=>t.phase==='perfect')?'PERFECT':'点击')}</div>
    </footer>
    <aside className={`resource-meter resource-meter--${bossKind}`} data-testid="resource-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={battle.meter} aria-label={`${bossKind==='jelly'?'果冻':'玉米'}裁决储蓄 ${battle.meter}%`}>
      <div className="resource-meter__cap"><span>{bossKind==='jelly'?'JELLY':'CORN'}</span><b>{battle.meter}%</b></div>
      <div className="resource-meter__track"><i style={{height:`${Math.max(0,Math.min(100,visualMeter))}%`}}/><span className="resource-meter__glow"/></div>
      <strong className="resource-meter__icon" aria-hidden="true"><i className={`ingredient-mark ingredient-mark--${bossKind}`}/></strong>
      <span className="resource-meter__name">{bossKind==='jelly'?'果冻':'玉米'}</span>
      <small>{battle.meter>=100?'FULL':'CHARGE'}</small>
    </aside>
    {(!ready||!tutorialSeen||paused||failed)&&<div className="battle-modal-backdrop"><div className="battle-modal" role="dialog" aria-modal="true" aria-labelledby="battle-dialog-title"><small>BLADE VERDICT</small><h2 id="battle-dialog-title">{failed?'场景加载失败':!ready?'正在进入农场…':paused?'战斗已暂停':'先认识你的节拍'}</h2>{failed?<p>资源或 WebGL 暂不可用。你的本场战斗已经停止计时。</p>:!ready?<p>准备怪物、场景和刀光</p>:paused?<p>生命与攻击时间已冻结，准备好再继续。</p>:<><p>光环出现后的 1.8 秒内都可以点击。<br/>找青色甜蜜点打出 Perfect，其余时间也会得到 Good。<br/>储蓄条满后会自动进入连续裁决。</p></>}{ready&&!failed&&<button autoFocus className="gold-button" onClick={()=>{clock.current=performance.now();if(paused)useGame.getState().pause(false);else useGame.getState().dismissTutorial()}}>{paused?'继续战斗':'开始战斗'}</button>}{(paused||failed)&&<button className="quiet-button" onClick={()=>useGame.getState().go('stages')}>退出讨伐</button>}</div></div>}
  </section>;
}
