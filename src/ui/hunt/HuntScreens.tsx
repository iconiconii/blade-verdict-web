import { useState } from 'react';
import { useGame } from '../../store';
import { bossDisplayNames, type BossKind } from '../../domain/v2';
import { GameButton, GameDialog } from '../index';
import './hunt.css';
import { WorldNavigation } from '../WorldNavigation';
import { assetUrl } from '../assets';
import { monsterProgress } from '../../domain/progression';
import { MonsterProgressBadge, monsterProgressLabel } from './MonsterProgress';

const asset = (name: string) => assetUrl(`assets/ui-kit/hunt/${name}.webp`);
const chapters = [
  { name: '蔬菜园', number: '第一章', boss: 'corn' as BossKind },
  { name: '果冻秘境', number: '第二章', boss: 'jelly' as BossKind },
];
const vegetableMonsters: readonly BossKind[] = ['corn', 'carrot', 'cabbage', 'tomato'];

export function HuntArt({ name, className, alt = '' }: { name: string; className?: string; alt?: string }) {
  return <img className={className} src={asset(name)} alt={alt} draggable={false} />;
}

function Wallet() {
  const coins = useGame(s => s.meta.coins);
  return <div className="hunt-wallet" aria-label={`金币 ${coins}`}>
    <HuntArt name="coin" /><strong>{coins.toLocaleString('zh-CN')}</strong>
    <button type="button" aria-label="前往菜架赚取金币" onClick={() => useGame.getState().go('sales')}><HuntArt name="plus" /></button>
  </div>;
}

function Arrows({ onPrevious, onNext }: { onPrevious: () => void; onNext: () => void }) {
  return <><button type="button" className="hunt-arrow hunt-arrow--previous" aria-label="上一项" onClick={onPrevious}><HuntArt name="arrow" /></button>
    <button type="button" className="hunt-arrow hunt-arrow--next" aria-label="下一项" onClick={onNext}><HuntArt name="arrow" /></button></>;
}

/** Local view state only: browsing a chapter never starts a fight or writes a save. */
export function HuntScreens() {
  const [view, setView] = useState<'chapters' | 'monsters'>('chapters');
  const [chapter, setChapter] = useState(0);
  const [settings, setSettings] = useState(false);
  const data = chapters[chapter];
  const save = useGame(state => state.save);
  const [selection, setSelection] = useState<BossKind>('corn');
  const roster: readonly BossKind[] = data.boss === 'corn' ? vegetableMonsters : ['jelly'];
  const progress = monsterProgress(save, selection);
  const playable = roster.includes(selection) && progress !== 'locked';
  const name = bossDisplayNames[selection];
  const browseChapter = (offset: number) => setChapter(index => (index + offset + chapters.length) % chapters.length);
  const browseMonster = (offset: number) => setSelection(id => roster[(roster.indexOf(id) + offset + roster.length) % roster.length]);
  const openMonsters = () => { setSelection(data.boss); setView('monsters'); };
  const start = () => { if (playable) useGame.getState().start(selection); };

  return <section className={`hunt-shell hunt-shell--${view}`}>
    <div className={`hunt-screen hunt-screen--${data.boss}`} data-testid={view === 'chapters' ? 'chapter-select' : 'monster-select'}>
      {view === 'chapters' ? <>
        <div className="hunt-toolbar"><Wallet /><button className="hunt-settings" type="button" aria-label="探险帮助与返回" onClick={() => setSettings(true)}><HuntArt name="settings" /></button></div>
        <div className="hunt-chapter-title"><p>— {data.number} —</p>
          {chapter === 0 ? <h1><HuntArt name="chapter-title" alt="蔬菜园" /></h1> : <h1 className="hunt-text-title">果冻秘境</h1>}
        </div>
        <div className="hunt-map-display"><HuntArt name={chapter === 0 ? 'chapter-island' : 'jelly-portrait'} className="hunt-map-island" alt={chapter === 0 ? '玉米、胡萝卜、白菜和西红柿组成的蔬菜园' : '果冻秘境'} /><Arrows onPrevious={() => browseChapter(-1)} onNext={() => browseChapter(1)} /></div>
        <div className="hunt-chapter-dots" aria-label="选择章节">{Array.from({ length: 5 }, (_, i) => <button type="button" key={i} disabled={i >= chapters.length} aria-label={chapters[i]?.name ?? `第 ${i + 1} 章尚未开放`} aria-current={i === chapter ? 'step' : undefined} onClick={() => setChapter(i)}><HuntArt name={i === chapter ? 'dot-active' : 'dot'} /></button>)}</div>
        <button type="button" className="hunt-primary hunt-primary--chapter" data-testid="choose-monsters" aria-label="讨伐：选择怪物" onClick={openMonsters}><HuntArt name="cta-hunt" /></button>
        <WorldNavigation active="stages" />
      </> : <>
        <div className="hunt-toolbar hunt-toolbar--monsters"><HuntArt name="chef-avatar" className="hunt-avatar" /><Wallet /></div>
        <button type="button" className="hunt-back" aria-label="返回章节选择" onClick={() => setView('chapters')}><HuntArt name="back" /></button>
        <div className="hunt-monster-title"><h1><HuntArt name="select-title" alt="怪兽选择" /></h1><p>— {data.number} · {data.name} —</p></div>
        <div className={`hunt-monster-display ${selection !== 'corn' && selection !== 'jelly' ? 'is-preview' : ''}`}>
          {selection === 'corn' || selection === 'jelly'
            ? <HuntArt name={selection === 'corn' ? 'corn-portrait' : 'jelly-portrait'} className="hunt-monster-portrait" alt={name} />
            : <div className="hunt-preview-card"><HuntArt name={`card-${selection}`} alt={name} /><MonsterProgressBadge progress={progress} /></div>}
          <Arrows onPrevious={() => browseMonster(-1)} onNext={() => browseMonster(1)} />
        </div>
        <div className="hunt-monster-status"><h2>{name}</h2><p className={`hunt-progress-label hunt-progress-label--${progress}`}><MonsterProgressBadge progress={progress} />{monsterProgressLabel[progress]}</p>{!playable && <small>通关前一只怪物后解锁</small>}</div>
        <p className="hunt-roster-hint">— 左右切换讨伐目标 —</p>
        <div className="hunt-roster" aria-label="选择讨伐怪物">{roster.map(id => <button type="button" key={id} aria-label={`${bossDisplayNames[id]} · ${monsterProgressLabel[monsterProgress(save, id)]}`} aria-pressed={selection === id} className={`hunt-roster-card ${selection === id ? 'is-selected' : ''}`} onClick={() => setSelection(id)}>
          {id === 'jelly' ? <><HuntArt name="jelly-portrait" /><strong>果冻怪</strong></> : <HuntArt name={`card-${id}`} />}
          <MonsterProgressBadge progress={monsterProgress(save, id)} />
        </button>)}</div>
        <button type="button" className="hunt-primary hunt-primary--monster" disabled={!playable} aria-label={`开始讨伐${name}`} data-testid={selection === 'jelly' ? 'start-jelly' : 'start'} onClick={start}><HuntArt name="cta-start" /></button>
      </>}
    </div>
    <GameDialog open={settings} onClose={() => setSettings(false)} title="探险指南" actions={<><GameButton variant="wood" onClick={() => useGame.getState().go('restaurant')}>返回选关</GameButton><GameButton onClick={() => setSettings(false)}>继续探险</GameButton></>}>
      <p>通关玉米、胡萝卜、白菜后，依次解锁下一只蔬菜怪物。开锁表示可以挑战，勾表示已通关。果冻秘境保持开放。</p>
      <p>蔬菜关卡逐关加快。每场三颗爱心，漏点一个圈扣一颗；白菜和西红柿低血量时会狂暴。</p>
      <p>MISS 不蓄能。蔬菜关卡会补出漏掉的圈，已成功的圈不重复结算。蓄满后点击左下角释放裁决，果冻秘境同样需要点击。限时内连续划过怪物，空划不造成伤害。</p>
    </GameDialog>
  </section>;
}
