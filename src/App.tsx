import { useEffect } from 'react';
import { Battle } from './Battle';
import { useGame } from './store';
import type { Quality } from './domain/v2';
import { Workshop, WorkshopNav } from './Workshop';
import './workshop.css';
import './mobile.css';
import { GameTheme, GameButton, GamePanel, GameBanner, ItemIcon } from './ui';
import './ui/ui.css';
import { HuntScreens } from './ui/hunt/HuntScreens';
import './ui/game-frame.css';

export function App(){
  const screen=useGame(s=>s.screen);
  useEffect(()=>{const refresh=()=>useGame.getState().refreshSave();window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh)}},[]);
  return <main className="game-stage"><GameTheme className="game-frame">{screen==='stages'?<HuntScreens/>:screen==='battle'?<Battle/>:screen==='result'?<Result/>:<Workshop/>}</GameTheme></main>;
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
      <GamePanel material="wood" className="result-reward"><div className="result-reward-head"><span>REWARD / 01</span><b>{win?'已入库':'暂无掉落'}</b></div>{win&&battle.loot.length>0?<div className="loot"><ItemIcon name={jelly?'gem':'corn'} size={74} label={jelly?'果冻核':'玉米粒'}/><div><b>{jelly?'果冻核':'玉米粒'} <em>×{lootCount}</em></b><div className="loot-quality-list">{battle.loot.map((item,i)=><small key={i}><i className={`quality-mark quality-mark--${item.quality.toLowerCase()}`} />{qualityLabels[item.quality]} × {item.count}</small>)}</div></div></div>:<p className="empty-loot">{win?'食材正在结算':'本次未带回食材'}</p>}{saveIssue&&<p className="result-alert" role="alert">{saveIssue}</p>}{!saveIssue&&win&&<GameBanner title="奖励已入库">去厨房，把这一轮做成真正的收益。</GameBanner>}</GamePanel>
    </div>
    <div className="result-actions">{saveIssue?<GameButton variant="danger" onClick={()=>{void useGame.getState().retrySettlement()}}>重试保存</GameButton>:win&&<GameButton variant="gold" onClick={()=>useGame.getState().go('kitchen')}>前往厨房</GameButton>}<GameButton variant="wood" data-testid="home" onClick={()=>useGame.getState().go('restaurant')}>返回餐厅</GameButton></div>
    <WorkshopNav active="restaurant" />
  </section>;
}
