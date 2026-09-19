import { useEffect } from 'react';
import { Battle } from './Battle';
import { useGame } from './store';
import type { Quality } from './domain/v2';
import { Workshop, WorkshopNav } from './Workshop';
import './workshop.css';

export function App(){
  const screen=useGame(s=>s.screen);
  useEffect(()=>{const refresh=()=>useGame.getState().refreshSave();window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh)}},[]);
  return <main>{screen==='stages'?<Stages/>:screen==='battle'?<Battle/>:screen==='result'?<Result/>:<Workshop/>}</main>;
}

function Stages(){
  const meta=useGame(s=>s.meta),inventoryCount=meta.inventory.reduce((sum,item)=>sum+item.count,0);
  return <section className="page stages expedition-page">
    <div className="expedition-noise" aria-hidden="true" />
    <header className="expedition-header">
      <button className="back expedition-back" aria-label="返回餐厅" onClick={()=>useGame.getState().go('restaurant')}>‹</button>
      <div className="expedition-title"><small>EXPEDITION / 01</small><h1>选择讨伐目标</h1><p>把每一次招架，变成下一道料理的火候。</p></div>
      <div className="expedition-brief"><span>本章收集</span><strong>{inventoryCount.toString().padStart(2,'0')}</strong><small>份食材</small></div>
    </header>
    <div className="chapter-line"><span>CHAPTER 01</span><i /><span>荒芜农场 · 夜行记录</span></div>
    <div className="stage-grid">
      <article className="stage-card stage-card--corn selected">
        <div className="stage-image corn"><span className="stage-index">01</span><span className="danger">危险度 II</span><span className="stage-image-caption">WIND / HARVEST FIELD</span></div>
        <div className="stage-card-body"><div className="stage-card-kicker"><span>荒芜农场 · 第一章</span><b>推荐训练场</b></div><h2>暴怒玉米怪</h2><p>它的攻击会在身体上亮起。等环收紧，在青色窗口完成一次精准招架，再用刀痕切开破绽。</p><div className="stage-tags"><span>🌽 玉米核</span><span>身体锚点</span><span>连续裁决</span></div><div className="stage-card-footer"><dl><div><dt>攻击节拍</dt><dd>稳定</dd></div><div><dt>预计收获</dt><dd>极品 ×3</dd></div></dl><button data-testid="start" onClick={()=>useGame.getState().start('corn')}>开始讨伐 <span>↗</span></button></div></div>
      </article>
      <article className="stage-card stage-card--jelly jelly-stage">
        <div className="stage-image jelly"><span className="stage-index">02</span><span className="danger danger--purple">危险度 III</span><span className="stage-image-caption">LAB / REACTION POOL</span></div>
        <div className="stage-card-body"><div className="stage-card-kicker"><span>果冻实验室 · 第二章</span><b className="stage-status--violet">变异机制</b></div><h2>酸蚀果冻怪</h2><p>黏液弹会在命中前分裂，第二处身体环稍后出现。保持呼吸，把连续完美留给最后一击。</p><div className="stage-tags"><span>🫐 果冻核</span><span>分裂攻击</span><span>延迟目标</span></div><div className="stage-card-footer"><dl><div><dt>攻击节拍</dt><dd>快速</dd></div><div><dt>预计收获</dt><dd>极品 ×3</dd></div></dl><button data-testid="start-jelly" onClick={()=>useGame.getState().start('jelly')}>开始讨伐 <span>↗</span></button></div></div>
      </article>
    </div>
    <div className="expedition-tip"><span>FIELD NOTE / 01</span><p>双目标回合会先亮起第一处身体环；完成后，第二处才会进入有效窗口。</p></div>
    <WorkshopNav active="stages" />
  </section>;
}

const qualityLabels:Record<Quality,string>={Broken:'破损',Normal:'普通',High:'优质',Top:'极品'};
function Result(){
  const {battle,bestCombo}=useGame(s=>s.combat),win=battle.bossHp<=0;
  const jelly=useGame(s=>s.combat.bossKind==='jelly'),saveIssue=useGame(s=>s.saveIssue);
  const lootCount=battle.loot.reduce((sum,item)=>sum+item.count,0);
  return <section className={`page result result--${win?'win':'loss'}`}>
    <div className="result-backdrop" aria-hidden="true" />
    <header className="result-top"><button className="back result-back" aria-label="返回餐厅" onClick={()=>useGame.getState().go('restaurant')}>‹</button><div><small>RUN REPORT / {win?'CLEARED':'RECALIBRATE'}</small><p>刀锋裁决 · 第 01 章</p></div><span className="result-stamp">{win?'夜行记录':'训练记录'}</span></header>
    <div className="result-layout">
      <div className="result-hero"><p className="result-kicker">{win?'HUNT COMPLETE':'EXPEDITION FAILED'}</p><h1>{win?'讨伐成功':'败北'}</h1><p className="result-lede">{win?'你的刀锋把危险，切成了今晚的食材。':'不是每一次出刀都要带回战利品，下一次会更早听见蓄力声。'}</p><div className="result-rule"><i /><span>{win?'MISSION CLEARED':'RUN ENDED'}</span><i /></div><div className="result-stats"><div><strong>{String(bestCombo).padStart(2,'0')}</strong><span>最高连击</span></div><div><strong>{battle.verdictCount}</strong><span>裁决次数</span></div><div><strong>{battle.bossHp <= 0 ? '100' : '—'}</strong><span>完成度</span></div></div></div>
      <aside className="result-reward"><div className="result-reward-head"><span>REWARD / 01</span><b>{win?'已入库':'暂无掉落'}</b></div>{win&&battle.loot.length>0?<div className="loot"><span className="loot-icon">{jelly?'🫐':'🌽'}</span><div><b>{jelly?'果冻核':'玉米粒'} <em>×{lootCount}</em></b><div className="loot-quality-list">{battle.loot.map((item,i)=><small key={i}><i className={`quality-mark quality-mark--${item.quality.toLowerCase()}`} />{qualityLabels[item.quality]} × {item.count}</small>)}</div></div></div>:<p className="empty-loot">{win?'食材正在结算':'本次未带回食材'}</p>}{saveIssue&&<p className="result-alert" role="alert">{saveIssue}</p>}{!saveIssue&&win&&<p className="result-note">战利品已入库。去厨房，把这一轮做成真正的收益。</p>}</aside>
    </div>
    <div className="result-actions">{saveIssue?<button className="result-button result-button--primary" onClick={()=>{void useGame.getState().retrySettlement()}}>重试保存 <span>↗</span></button>:win&&<button className="result-button result-button--primary" onClick={()=>useGame.getState().go('kitchen')}>前往厨房 <span>↗</span></button>}<button className="result-button result-button--quiet" data-testid="home" onClick={()=>useGame.getState().go('restaurant')}>返回餐厅</button></div>
    <WorkshopNav active="restaurant" />
  </section>;
}
