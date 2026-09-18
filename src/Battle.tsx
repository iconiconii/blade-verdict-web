import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BattleScene } from './BattleScene';
import { targetCenter, targetDiameter } from './domain/combat';
import { projectedWeakPoints } from './scene/layout';
import { verdictStroke, type VerdictPoint } from './domain/v2';
import { useGame } from './store';

const phaseLabels={intro:'目标锁定',telegraph:'蓄力预警',targetActive:'准备招架',impact:'反击命中',stagger:'短暂破防',verdictReady:'裁决就绪',verdictSlash:'一笔裁决',settle:'战斗结束'};

export function Battle(){
  const host=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const scene=useRef<BattleScene|null>(null),clock=useRef(0),points=useRef<VerdictPoint[]>([]);
  const [size,setSize]=useState({width:1,height:1});
  const [ready,setReady]=useState(false),readyRef=useRef(false);
  const [failed,setFailed]=useState(false),failedRef=useRef(false);
  const combat=useGame(s=>s.combat),tutorialSeen=useGame(s=>s.tutorialSeen);
  const {battle,bossKind,phase,targets,feedback,combo,paused}=combat;

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
    const loop=()=>{if(!alive)return;advanceNow();if(!failedRef.current)scene.current?.render(useGame.getState().combat,reduced.matches);frame=requestAnimationFrame(loop)};
    const resize=()=>{const rect=stage.current!.getBoundingClientRect();setSize({width:rect.width,height:rect.height});scene.current?.resize();useGame.getState().cancelStroke()};
    const observer=new ResizeObserver(resize);observer.observe(stage.current!);resize();
    const visibility=()=>{clock.current=performance.now();if(document.hidden)useGame.getState().pause(true)};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')useGame.getState().pause(!useGame.getState().combat.paused)};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('keydown',key);frame=requestAnimationFrame(loop);
    return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',key);scene.current?.dispose();scene.current=null;readyRef.current=false};
  },[]);

  const weakPoints=projectedWeakPoints(battle.verdictCount,size.width,size.height,bossKind);
  useEffect(()=>{if(!feedback||!('vibrate' in navigator))return;const pattern=feedback.kind==='Perfect'?[18]:feedback.kind==='Miss'?[18,28,18]:[8];navigator.vibrate(pattern)},[feedback?.id]);
  const point=(event:ReactPointerEvent<HTMLDivElement>):VerdictPoint=>{const rect=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height,time:performance.now()}};
  const begin=(event:ReactPointerEvent<HTMLDivElement>)=>{
    advanceNow();if(event.button!==0||useGame.getState().combat.phase!=='verdictSlash'||useGame.getState().combat.paused||useGame.getState().combat.pointerId!==null)return;
    event.currentTarget.setPointerCapture(event.pointerId);points.current=[point(event)];useGame.getState().beginStroke(event.pointerId);
  };
  const move=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(useGame.getState().combat.pointerId!==event.pointerId)return;
    const p=point(event),last=points.current.at(-1)!;
    if(Math.hypot((p.x-last.x)*size.width,(p.y-last.y)*size.height)<2)return;
    points.current.push(p);if(points.current.length>512)points.current=points.current.filter((_,i)=>i%2===0);
    useGame.getState().updateStroke(event.pointerId,verdictStroke([...points.current],weakPoints,size.width/size.height));
  };
  const end=(event:ReactPointerEvent<HTMLDivElement>)=>{
    advanceNow();if(useGame.getState().combat.pointerId!==event.pointerId)return;
    points.current.push(point(event));useGame.getState().endStroke(event.pointerId,verdictStroke(points.current,weakPoints,size.width/size.height));
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const inVerdict=phase==='verdictReady'||phase==='verdictSlash';
  const showFeedback=feedback&&(phase==='impact'||phase==='stagger');
  return <section className={`battle battle--${phase} ${feedback?.kind==='Miss'&&showFeedback?'battle--hurt':''}`} data-testid="battle" data-battle-phase={phase}>
    <div className="battle-stage" ref={stage} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>useGame.getState().cancelStroke()} onLostPointerCapture={()=>{if(useGame.getState().combat.pointerId!==null)useGame.getState().cancelStroke()}}>
      <div ref={host} className="canvas" aria-hidden="true"/>
      <div className="battle-vignette"/>
      {(phase==='targetActive'||phase==='telegraph')&&targets.map(target=>{
        const center=targetCenter(target.position,size.width,size.height),diameter=targetDiameter(size.width,size.height);
        const active=phase==='targetActive'&&combat.elapsed>=target.startDelayMs&&!target.resolved&&!paused;
        return <button key={`${combat.round}-${target.targetIndex}`} className="parry-target" aria-label={`招架核心 ${target.targetIndex+1}`} data-testid={`target-${target.targetIndex}`} data-phase={target.phase} data-resolved={target.resolved} disabled={!active} style={{left:center.x,top:center.y,width:diameter,height:diameter}} onPointerDown={e=>{e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();if(Math.hypot(e.clientX-rect.left-diameter/2,e.clientY-rect.top-diameter/2)>diameter/2)return;advanceNow();useGame.getState().tap(target.targetIndex)}} onClick={()=>useGame.getState().tap(target.targetIndex)}><span className="target-caption">{target.resolved?'✓':target.phase==='perfect'?'完美窗口':phase==='telegraph'?'即将落点':target.phase==='late'?'太晚了':'等待收环'}</span></button>
      })}
      {inVerdict&&weakPoints.map((weak,i)=><span key={weak.id} className="weakpoint-label" data-testid={`weak-${i}`} data-x={weak.x} data-y={weak.y} style={{left:`${weak.x*100}%`,top:`${weak.y*100}%`}}>{i+1}</span>)}
    </div>
    <header className="battle-top">
      <button className="battle-icon" aria-label="返回与暂停" onClick={()=>useGame.getState().pause(true)}>‹</button>
      <div className="boss-hud"><div className="boss-heading"><span>{bossKind==='jelly'?'NO. 02 / JELLY LAB':'NO. 01 / CORN GUARDIAN'}</span><span>{bossKind==='jelly'?'危险度 III':'危险度 II'}</span></div><h2>{bossKind==='jelly'?'酸蚀果冻怪':'暴怒玉米守卫'} <small>{phaseLabels[phase]}</small></h2><div className="battle-health boss-health"><i style={{width:`${battle.bossHp/8}%`}}/></div><div className="boss-meta"><span>{bossKind==='jelly'?'果冻实验室 · 反应池':'荒芜农场 · 月下讨伐'}</span><span data-testid="boss-hp">{battle.bossHp} <em>/ 800</em></span></div></div>
      <button className="battle-icon" aria-label="暂停战斗" onClick={()=>useGame.getState().pause(true)}>Ⅱ</button>
    </header>
    <div className="phase-ribbon"><span className="phase-dot"/>{inVerdict?'BREAK · 破防时刻':targets.length===2?(bossKind==='jelly'?'SPLIT · 分裂弹':'DOUBLE · 双重攻势'):(bossKind==='jelly'?'JELLY · 观察黏液弹':'PARRY · 观察 · 等待 · 反击')}</div>
    {phase==='intro'&&ready&&tutorialSeen&&<div className="battle-announcement"><small>HUNT BEGINS</small><h2>保持冷静，等待刀锋。</h2></div>}
    {showFeedback&&<div className={`hit-feedback hit-feedback--${feedback.kind}`} key={`${feedback.id}-${feedback.kind}`} role="status"><strong>{feedback.kind==='Verdict'?feedback.score===100?'PERFECT VERDICT':'VERDICT':feedback.kind.toUpperCase()}</strong><span>{feedback.kind==='Miss'?'受到攻击':feedback.kind==='Verdict'?`${feedback.score} 分 · 切割完成`:'招架反击'} <b>−{feedback.amount}</b></span></div>}
    {inVerdict&&<div className="verdict-heading"><small>THE BLADE IS YOUR VERDICT</small><h2>{phase==='verdictReady'?'破绽已现。落刀吧。':'一笔连过所有弱点'}</h2><p>{phase==='verdictReady'?'进入裁决后有 3 秒绘制刀痕':'按住并拖动，松手落刃 · 每个弱点只计一次'}</p>{phase==='verdictSlash'&&<div className="verdict-clock"><i style={{width:`${Math.max(0,100-combat.elapsed/30)}%`}}/><span>{Math.max(0,3-combat.elapsed/1000).toFixed(1)}s · {combat.stroke?.hitWeakPointIds.length??0}/4</span></div>}</div>}
    <footer className="battle-bottom">
      <div className="player-hud"><div className="player-avatar">刃</div><div><div className="player-heading"><strong>守夜厨师</strong><span data-testid="player-hp">{battle.playerHp}/100</span></div><div className="battle-health player-health"><i style={{width:`${battle.playerHp}%`}}/></div><div className="combo"><b>{String(combo).padStart(2,'0')}</b> 连续招架</div></div></div>
      <div className="combat-instruction">{phase==='verdictSlash'?'沿发光路径划过弱点':phase==='verdictReady'?'点击裁决徽章开始':phase==='telegraph'?(bossKind==='jelly'?'黏液弹正在分裂':'怪物正在蓄力'):targets.some(t=>t.phase==='perfect')?'现在 · 击中核心':bossKind==='jelly'?'紫色 NICE · 青色 PERFECT':'金色 NICE · 青色 PERFECT'}</div>
      <button className={`verdict-badge ${phase==='verdictReady'?'is-ready':''}`} style={{'--meter':`${battle.meter}%`} as React.CSSProperties} disabled={phase!=='verdictReady'||paused} onClick={()=>{advanceNow();useGame.getState().beginVerdict()}} aria-label="执行裁决" data-testid="verdict-start"><span className="verdict-mark">斩</span><strong>{phase==='verdictReady'?'执行裁决':`${battle.meter}%`}</strong><small>VERDICT</small></button>
    </footer>
    {(!ready||!tutorialSeen||paused||failed)&&<div className="battle-modal-backdrop"><div className="battle-modal" role="dialog" aria-modal="true" aria-labelledby="battle-dialog-title"><small>BLADE VERDICT</small><h2 id="battle-dialog-title">{failed?'场景加载失败':!ready?'正在进入农场…':paused?'战斗已暂停':'掌握招架的节拍'}</h2>{failed?<p>资源或 WebGL 暂不可用。你的本场战斗已经停止计时。</p>:!ready?<p>准备怪物、场景和刀光</p>:paused?<p>生命与攻击时间已冻结，准备好再继续。</p>:<><p>观察怪物蓄力，等待光环收缩。<br/>{bossKind==='jelly'?'紫色时点击核心：Nice':'金色时点击核心：Nice'}<br/>青色时点击核心：Perfect</p><p>能量蓄满后，拖出一笔刀痕裁决怪物。</p></>}{ready&&!failed&&<button autoFocus className="gold-button" onClick={()=>{clock.current=performance.now();if(paused)useGame.getState().pause(false);else useGame.getState().dismissTutorial()}}>{paused?'继续战斗':'开始战斗'}</button>}{(paused||failed)&&<button className="quiet-button" onClick={()=>useGame.getState().go('stages')}>退出讨伐</button>}</div></div>}
  </section>;
}
