import { useState } from 'react';
import { useGame } from '../../store';
import { bossDisplayNames, type BossKind } from '../../domain/v2';
import { GameButton, GameDialog } from '../index';
import './hunt.css';
import { WorldNavigation } from '../WorldNavigation';
import { assetUrl } from '../assets';

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
  const [selection, setSelection] = useState<BossKind>('corn');
  const roster: readonly BossKind[] = data.boss === 'corn' ? vegetableMonsters : ['jelly'];
  const playable = roster.includes(selection);
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
          <HuntArt name={selection === 'corn' ? 'corn-portrait' : selection === 'jelly' ? 'jelly-portrait' : `card-${selection}`} className="hunt-monster-portrait" alt={name} />
          <Arrows onPrevious={() => browseMonster(-1)} onNext={() => browseMonster(1)} />
        </div>
        <div className="hunt-monster-status"><h2>{name}</h2>{playable ? <HuntArt name="unlocked" alt="已解锁" /> : <p className="hunt-coming-soon">即将开放 · 暂不可挑战</p>}</div>
        <p className="hunt-roster-hint">— 左右切换讨伐目标 —</p>
        <div className="hunt-roster" aria-label="选择讨伐怪物">{roster.map(id => <button type="button" key={id} aria-label={bossDisplayNames[id]} aria-pressed={selection === id} className={`hunt-roster-card ${selection === id ? 'is-selected' : ''}`} onClick={() => setSelection(id)}>
          {id === 'jelly' ? <><HuntArt name="jelly-portrait" /><strong>果冻怪</strong></> : <HuntArt name={`card-${id}`} />}
        </button>)}</div>
        <button type="button" className="hunt-primary hunt-primary--monster" aria-label={`开始讨伐${name}`} data-testid={selection === 'jelly' ? 'start-jelly' : 'start'} onClick={start}><HuntArt name="cta-start" /></button>
      </>}
    </div>
    <GameDialog open={settings} onClose={() => setSettings(false)} title="探险指南" actions={<><GameButton variant="wood" onClick={() => useGame.getState().go('restaurant')}>返回餐厅</GameButton><GameButton onClick={() => setSettings(false)}>继续探险</GameButton></>}>
      <p>先选择章节，再选择本章的讨伐目标。蔬菜园的四只怪物按顺序逐渐提高招架、裁决与时间压力。</p>
      <p>点击怪物身上的光环完成招架，储蓄条满后自动进入裁决。按住并连续划过怪物，收集料理食材。</p>
    </GameDialog>
  </section>;
}
