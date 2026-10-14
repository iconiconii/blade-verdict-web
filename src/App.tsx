import { useEffect } from 'react';
import { Battle } from './Battle';
import { useGame } from './store';
import type { Quality } from './domain/v2';
import { bossDisplayNames, bossIngredientIcon, type BossKind } from './domain/v2';
import { Workshop, WorkshopNav } from './Workshop';
import './workshop.css';
import './mobile.css';
import { GameTheme, GameButton, GamePanel, GameBanner, ItemIcon } from './ui';
import './ui/ui.css';
import { HuntScreens } from './ui/hunt/HuntScreens';
import './ui/game-frame.css';
import { CookingIndicator } from './ui/CookingIndicator';
import { useGameAudio } from './audio/GameAudio';
import { nextBossAfter } from './domain/progression';

export function App(){
  useGameAudio();
  const screen=useGame(s=>s.screen);
  const battleId=useGame(s=>s.battleId);
  useEffect(()=>{const refresh=()=>useGame.getState().refreshSave();window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh)}},[]);
  return <main className="game-stage"><GameTheme className="game-frame">{screen==='stages'?<HuntScreens/>:screen==='battle'?<Battle key={battleId}/>:screen==='result'?<Result/>:<Workshop/>}<CookingIndicator/></GameTheme></main>;
}

const qualityLabels:Record<Quality,string>={Broken:'破损',Normal:'普通',High:'优质',Top:'极品'};
export function Result(){
  const {battle,bestCombo}=useGame(s=>s.combat),win=battle.bossHp<=0;
  const bossKind=useGame(s=>s.combat.bossKind),jelly=bossKind==='jelly',saveIssue=useGame(s=>s.saveIssue);
  const blocked=useGame(s=>s.saving||!!s.pendingBattle||!!s.saveIssue);
  const defeatReason=useGame(s=>s.combat.defeatReason);
  const nextBoss=nextBossAfter(bossKind);
  const lootIcon=bossIngredientIcon(bossKind);
  const bossName=bossDisplayNames[bossKind as BossKind];
  const lootCount=battle.loot.reduce((sum,item)=>sum+item.count,0);
  return <section className={`page result result--${win?'win':'loss'}`}>
    <div className="result-backdrop" aria-hidden="true" />
    <header className="result-top"><button className="back result-back" aria-label="返回选关" onClick={()=>useGame.getState().go('restaurant')}>‹</button><div><small>RUN REPORT / {win?'CLEARED':'RECALIBRATE'}</small><p>刀锋裁决 · 第 01 章</p></div><span className="result-stamp">{win?'夜行记录':'训练记录'}</span></header>
    <div className="result-layout">
      <div className="result-hero"><p className="result-kicker">{win?'HUNT COMPLETE':'EXPEDITION FAILED'}</p><h1>{win?'讨伐成功':'败北'}</h1><p className="result-lede">{win?'你的刀锋把危险，切成了今晚的食材。':'不是每一次出刀都要带回战利品，下一次会更早听见蓄力声。'}</p><div className="result-rule"><i /><span>{win?'MISSION CLEARED':'RUN ENDED'}</span><i /></div><div className="result-stats"><div><strong>{String(bestCombo).padStart(2,'0')}</strong><span>最高连击</span></div><div><strong>{battle.verdictCount}</strong><span>裁决次数</span></div><div><strong>{battle.bossHp <= 0 ? '100' : '—'}</strong><span>完成度</span></div></div></div>
      <GamePanel material="wood" className="result-reward"><div className="result-reward-head"><span>REWARD / 01</span><b>{win?'已入库':'暂无掉落'}</b></div>{win&&battle.loot.length>0?<div className="loot"><ItemIcon name={lootIcon} size={74} label={jelly?'果冻核':bossName.replace('怪','')}/><div><b>{jelly?'果冻核':bossName.replace('怪','')} <em>×{lootCount}</em></b><div className="loot-quality-list">{battle.loot.map((item,i)=><small key={i}><i className={`quality-mark quality-mark--${item.quality.toLowerCase()}`} />{qualityLabels[item.quality]} × {item.count}</small>)}</div></div></div>:<p className="empty-loot">{win?'食材正在结算':'本次未带回食材'}</p>}{saveIssue&&<p className="result-alert" role="alert">{saveIssue}</p>}{!saveIssue&&win&&<GameBanner title="奖励已入库">去厨房，把这一轮做成真正的收益。</GameBanner>}</GamePanel>
    </div>
    {!win&&<p className="result-failure-reason" role="status">{defeatReason==='verdict-timeout'?'裁决时间耗尽，未完成本段切割。试试更多 Perfect，让裁决更轻松。':defeatReason==='hearts'?'三颗爱心已耗尽。每漏掉一个圈，会失去一颗爱心。':'调整节奏，再挑战一次。'}</p>}
    <div className="result-actions">
      <GameButton variant="gold" data-testid={win?'next-level':'retry-level'} disabled={blocked} onClick={()=>{if(win){if(nextBoss)useGame.getState().start(nextBoss);else useGame.getState().go('stages')}else useGame.getState().start(bossKind)}}>{win?nextBoss?'继续下一关':'本章通关 · 返回选关':'重玩这关'}</GameButton>
      {saveIssue?<GameButton variant="danger" onClick={()=>{void useGame.getState().retrySettlement()}}>重试保存</GameButton>:win&&<GameButton variant="wood" disabled={blocked} onClick={()=>useGame.getState().go('kitchen')}>前往厨房</GameButton>}
      <GameButton variant="wood" data-testid="home" disabled={blocked} onClick={()=>useGame.getState().go('stages')}>返回选关</GameButton>
    </div>
    <WorkshopNav active="restaurant" />
  </section>;
}
