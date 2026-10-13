import type { CombatState } from '../../domain/combat';
import { bossKindLabel, newBattle } from '../../domain/v2';
import { HuntArt } from './HuntScreens';
import './battle-hud.css';
import { ItemIcon } from '../index';

/** Read-only HUD. The battle simulation remains the only source of time/resources. */
export function BattleHud({ combat, visualMeter, readyPulse = 0, bombCount = 0, onPause }: { combat: CombatState; visualMeter: number; readyPulse?: number; bombCount?: number; onPause: () => void }) {
  const { battle, bossKind, phase } = combat;
  const maximum = newBattle(bossKind);
  const verdict = phase === 'verdictReady' || phase === 'verdictSlash';
  const ready=battle.meter>=100&&phase!=='verdictSlash'&&phase!=='settle'&&battle.bossHp>0&&battle.playerHp>0;
  return <>
    <header className="hunt-battle-toolbar">
      <button type="button" className="hunt-battle-pause" aria-label="暂停战斗" onClick={onPause}><HuntArt name="pause" /></button>
    </header>
    <div className="hunt-boss-hud">
      <h2><HuntArt name="boss-mark" /><span>{bossKindLabel(bossKind)}{combat.enraged&&<em className="hunt-enrage" data-testid="enrage-state">狂暴</em>}</span></h2>
      <div className="hunt-health" role="progressbar" aria-label="Boss 生命值" aria-valuemin={0} aria-valuemax={maximum.bossHp} aria-valuenow={battle.bossHp}>
        <div className="hunt-health-well"><i style={{ width: `${Math.max(0, Math.min(100, battle.bossHp / maximum.bossHp * 100))}%` }} /></div>
        <HuntArt name="hp-frame" />
      </div>
      <strong data-testid="boss-hp">{battle.bossHp} / {maximum.bossHp}</strong>
    </div>
    <aside className={`hunt-charge ${verdict ? 'is-verdict' : ''} ${ready ? 'is-ready' : ''}`} data-testid="resource-meter" data-ready={ready} role="progressbar" aria-label={`${bossKindLabel(bossKind).replace('怪','')}裁决储蓄`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={battle.meter}>
      <div className="hunt-charge-shaft"><div className="hunt-charge-well"><i style={{ height: `${Math.max(0, Math.min(100, visualMeter))}%` }} /></div><HuntArt name="meter-shaft" /></div>
      <div className="hunt-charge-medallion"><HuntArt name="cut-medallion" /><span>{ready ? '就绪' : verdict ? '裁决中' : `${Math.round(visualMeter)}%`}</span></div>
      {ready&&readyPulse>0&&<i key={readyPulse} className="hunt-charge-ready-burst" aria-hidden="true" />}
      <span className="hunt-charge-caption">{verdict && !ready ? '连续切割' : bossKind === 'jelly' ? ready ? '本组结束自动裁决' : '蓄满自动裁决' : ready ? '即将自动裁决' : '本轮完成自动裁决'}</span>
    </aside>
    <div className="hunt-item-slots" aria-label="战斗辅具">
      <div className={`hunt-item-slot ${bombCount > 0 || combat.tomatoBombTriggered ? 'has-bomb' : ''}`} data-testid="bomb-status" data-triggered={combat.tomatoBombTriggered} aria-label={`西红柿炸弹：库存 ${bombCount}，${combat.tomatoBombTriggered ? '本次已消耗1个' : bombCount > 0 ? '裁决首刀自动消耗1个' : '前往商店购买或补充'}`}>
        <HuntArt name="item-socket" />{(bombCount > 0 || combat.tomatoBombTriggered) && <ItemIcon name="tomato" size={42} />}
        <small>{combat.tomatoBombTriggered ? `已用 · 余${bombCount}` : bombCount > 0 ? `首刀自动 · ×${bombCount}` : '商店补充'}</small>
      </div><div className="hunt-item-slot" aria-label="道具栏 2 尚未开放"><HuntArt name="item-socket" /><small>未开放</small></div>
    </div>
  </>;
}
