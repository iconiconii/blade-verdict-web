import { useEffect } from 'react';
import { Battle } from './Battle';
import { useGame } from './store';
import type { Quality } from './domain/v2';
import { Workshop } from './Workshop';
import './workshop.css';

export function App(){
  const screen=useGame(s=>s.screen);
  useEffect(()=>{const refresh=()=>useGame.getState().refreshSave();window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh)}},[]);
  return <main>{screen==='stages'?<Stages/>:screen==='battle'?<Battle/>:screen==='result'?<Result/>:<Workshop/>}</main>;
}

function Stages(){return <section className="page stages"><header><button className="back" aria-label="返回餐厅" onClick={()=>useGame.getState().go('restaurant')}>‹</button><div><small>EXPEDITION BOARD</small><h2>选择讨伐目标</h2></div></header><div className="stage-grid"><article className="stage-card selected"><div className="stage-image corn"><span className="danger">危险度 II</span></div><div><small>荒芜农场 · 第一章</small><h2>暴怒玉米怪</h2><p>观察怪物蓄力，等待时机环收缩。青色窗口招架，再以一笔刀痕完成裁决。</p><dl><div><dt>推荐</dt><dd>招架训练</dd></div><div><dt>战利品</dt><dd>🌽 玉米粒</dd></div></dl><button data-testid="start" onClick={()=>useGame.getState().start('corn')}>开始讨伐</button></div></article><article className="stage-card jelly-stage"><div className="stage-image jelly"><span className="danger danger--purple">危险度 III</span></div><div><small>果冻实验室 · 第二章</small><h2>酸蚀果冻怪</h2><p>攻击更快，黏液弹会在命中前分裂。保持节奏，连续处理延迟出现的第二个目标。</p><dl><div><dt>机制</dt><dd>分裂攻击</dd></div><div><dt>战利品</dt><dd>🫐 果冻核</dd></div></dl><button data-testid="start-jelly" onClick={()=>useGame.getState().start('jelly')}>开始讨伐</button></div></article></div></section>}

const qualityLabels:Record<Quality,string>={Broken:'破损',Normal:'普通',High:'优质',Top:'极品'};
function Result(){
  const {battle,bestCombo}=useGame(s=>s.combat),win=battle.bossHp<=0;
  const jelly=useGame(s=>s.combat.bossKind==='jelly'),saveIssue=useGame(s=>s.saveIssue);
  return <section className="page result"><div className="result-card"><small>{win?'HUNT COMPLETE':'EXPEDITION FAILED'}</small><h1>{win?'讨伐成功':'败北'}</h1><div className="seal">{win?'完':'败'}</div><p>{win?'刀锋之下，收获已定。':'调整呼吸，等待光环收拢。'}</p><p>最高连击 {bestCombo} · 裁决 {battle.verdictCount} 次</p>{win&&battle.loot.length>0?<div className="loot"><span>{jelly?'🫐':'🌽'}</span><div><b>{jelly?'果冻核':'玉米粒'} · {battle.loot.reduce((sum,item)=>sum+item.count,0)} 份</b>{battle.loot.map((item,i)=><small key={i}>{qualityLabels[item.quality]} × {item.count}</small>)}</div></div>:<p className="empty-loot">{win?'食材正在结算':'本次未带回食材'}</p>}{saveIssue?<><p role="alert">{saveIssue}</p><button onClick={()=>{void useGame.getState().retrySettlement()}}>重试保存</button></>:win&&<p className="empty-loot">战利品已入库 · 前往厨房制作料理</p>}{win&&<button onClick={()=>useGame.getState().go('kitchen')}>前往厨房</button>}<button data-testid="home" onClick={()=>useGame.getState().go('restaurant')}>返回餐厅</button></div></section>;
}
