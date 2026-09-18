import { Battle } from './Battle';
import { useGame } from './store';
import type { Quality } from './domain/v2';

export function App(){const screen=useGame(s=>s.screen);return <main>{screen==='restaurant'?<Restaurant/>:screen==='stages'?<Stages/>:screen==='battle'?<Battle/>:<Result/>}</main>}

function Restaurant(){return <section className="page restaurant"><div className="shade"/><header><span className="brand">BLADE VERDICT</span><span>金币 0 ◈</span></header><div className="hero"><p className="eyebrow">深渊餐厅 · 今夜营业</p><h1>刀锋<br/><em>裁决</em></h1><p>狩猎怪物，精准招架，将战利品变成传说料理。</p><button data-testid="explore" onClick={()=>useGame.getState().go('stages')}>前往探险板 <b>›</b></button></div><nav><span>🍳 厨房</span><span className="active">⚔ 探险</span><span>▦ 仓库</span></nav></section>}

function Stages(){return <section className="page stages"><header><button className="back" aria-label="返回餐厅" onClick={()=>useGame.getState().go('restaurant')}>‹</button><div><small>EXPEDITION BOARD</small><h2>选择讨伐目标</h2></div></header><div className="stage-grid"><article className="stage-card selected"><div className="stage-image corn"><span className="danger">危险度 II</span></div><div><small>荒芜农场 · 第一章</small><h2>暴怒玉米怪</h2><p>观察怪物蓄力，等待时机环收缩。青色窗口招架，再以一笔刀痕完成裁决。</p><dl><div><dt>推荐</dt><dd>招架训练</dd></div><div><dt>战利品</dt><dd>🌽 玉米粒</dd></div></dl><button data-testid="start" onClick={()=>useGame.getState().start()}>开始讨伐</button></div></article><article className="stage-card locked"><div className="lock">🔒</div><h3>果冻实验室</h3><p>后续版本开放</p></article></div></section>}

const qualityLabels:Record<Quality,string>={Broken:'破损',Normal:'普通',High:'优质',Top:'极品'};
function Result(){
  const {battle,bestCombo}=useGame(s=>s.combat),win=battle.bossHp<=0;
  return <section className="page result"><div className="result-card"><small>{win?'HUNT COMPLETE':'EXPEDITION FAILED'}</small><h1>{win?'讨伐成功':'败北'}</h1><div className="seal">{win?'完':'败'}</div><p>{win?'刀锋之下，收获已定。':'调整呼吸，等待光环收拢。'}</p><p>最高连击 {bestCombo} · 裁决 {battle.verdictCount} 次</p>{win&&battle.loot.length>0?<div className="loot"><span>🌽</span><div><b>玉米粒 · {battle.loot.reduce((sum,item)=>sum+item.count,0)} 份</b>{battle.loot.map((item,i)=><small key={i}>{qualityLabels[item.quality]} × {item.count}</small>)}</div></div>:<p className="empty-loot">{win?'本次没有切割食材':'本次未带回食材'}</p>}<button data-testid="home" onClick={()=>useGame.getState().go('restaurant')}>返回餐厅</button></div></section>;
}
