import type { CombatState } from '../../domain/combat';
import { newBattle } from '../../domain/v2';
import { ItemIcon } from '../index';
import { HuntArt } from './HuntScreens';
import './battle-hud.css';

const maximum = newBattle();
export function battleClock(timeMs: number) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(timeMs) ? timeMs : 0) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Read-only HUD. The battle simulation remains the only source of time/resources. */
export function BattleHud({ combat, visualMeter, onPause }: { combat: CombatState; visualMeter: number; onPause: () => void }) {
  const { battle, bossKind, combo, phase } = combat;
  const verdict = phase === 'verdictReady' || phase === 'verdictSlash';
  return <>
    <header className="hunt-battle-toolbar">
      <div className="hunt-battle-timer" aria-label={`战斗用时 ${battleClock(combat.time)}`}><HuntArt name="timer" /><time data-testid="battle-time">{battleClock(combat.time)}</time></div>
      <button type="button" className="hunt-battle-pause" aria-label="暂停战斗" onClick={onPause}><HuntArt name="pause" /></button>
    </header>
    <div className="hunt-boss-hud">
      <h2><HuntArt name="boss-mark" /><span>{bossKind === 'corn' ? '玉米怪' : '果冻怪'}</span></h2>
      <div className="hunt-health" role="progressbar" aria-label="Boss 生命值" aria-valuemin={0} aria-valuemax={maximum.bossHp} aria-valuenow={battle.bossHp}>
        <div className="hunt-health-well"><i style={{ width: `${Math.max(0, Math.min(100, battle.bossHp / maximum.bossHp * 100))}%` }} /></div>
        <HuntArt name="hp-frame" />
      </div>
      <strong data-testid="boss-hp">{battle.bossHp} / {maximum.bossHp}</strong>
    </div>
    <aside className={`hunt-charge ${verdict ? 'is-verdict' : ''}`} data-testid="resource-meter" role="progressbar" aria-label={`${bossKind === 'corn' ? '玉米' : '果冻'}裁决储蓄`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={battle.meter}>
      <div className="hunt-charge-shaft"><div className="hunt-charge-well"><i style={{ height: `${Math.max(0, Math.min(100, visualMeter))}%` }} /></div><HuntArt name="meter-shaft" /></div>
      <div className="hunt-charge-medallion"><HuntArt name="cut-medallion" /><span>{verdict ? '裁决中' : `${Math.round(visualMeter)}%`}</span></div>
      <span className="hunt-charge-caption">{verdict ? '连续切割' : '蓄满自动裁决'}</span>
    </aside>
    <div className="hunt-player-status" aria-label="厨师状态"><div><ItemIcon name={bossKind === 'corn' ? 'corn' : 'gem'} size={25} /><span>生命 <b data-testid="player-hp">{battle.playerHp}/{maximum.playerHp}</b></span><span>连击 <b>{combo}</b></span></div>
      <div className="hunt-player-health" role="progressbar" aria-label="玩家生命值" aria-valuemin={0} aria-valuemax={maximum.playerHp} aria-valuenow={battle.playerHp}><i style={{ width: `${battle.playerHp / maximum.playerHp * 100}%` }} /></div>
    </div>
    <div className="hunt-item-slots" aria-label="战斗道具尚未开放">{[1, 2].map(id => <div key={id} aria-label={`道具栏 ${id} 尚未开放`} className="hunt-item-slot"><HuntArt name="item-socket" /><small>未开放</small></div>)}</div>
  </>;
}
