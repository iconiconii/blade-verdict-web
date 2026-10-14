import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCombat } from '../../domain/combat';
import { BattleHud } from './BattleHud';
import { HuntScreens } from './HuntScreens';

const assetFiles = import.meta.glob('/public/assets/**/*.{png,webp}');

describe('reference hunt UI', () => {
  it('shows individual hearts and enables release only for an unpaused ready phase',()=>{
    const state=createCombat(1,'corn');state.battle.playerHp=2;state.battle.meter=100;
    const render=()=>renderToStaticMarkup(<BattleHud combat={state} visualMeter={100} onPause={()=>{}} onRelease={()=>{}}/>);
    expect(render()).toContain('剩余生命 2/3');expect(render().match(/class="is-full"/g)).toHaveLength(2);
    expect(render()).toMatch(/data-testid="release-verdict"[^>]*disabled/);
    state.phase='verdictReady';expect(render()).not.toMatch(/data-testid="release-verdict"[^>]*disabled/);
    state.paused=true;expect(render()).toMatch(/data-testid="release-verdict"[^>]*disabled/);
    state.paused=false;state.battle.playerHp=0;expect(render()).toMatch(/data-testid="release-verdict"[^>]*disabled/);
  });
  it('starts in chapter browsing, not directly in a fight', () => {
    const html = renderToStaticMarkup(<HuntScreens />);
    expect(html).toContain('data-testid="chapter-select"');
    expect(html).toContain('data-testid="choose-monsters"');
    expect(html).not.toContain('data-testid="battle"');
    expect(html.match(/ disabled=""/g)).toHaveLength(3);
    for (const screen of ['kitchen', 'inventory', 'stages', 'cookbook', 'shop']) expect(html).toContain(`nav-${screen}`);
  });

  it('renders live combat values rather than the mockup numbers', () => {
    const state = createCombat(1, 'jelly');
    state.time = 28500;
    state.battle.bossHp = 320;
    state.battle.playerHp = 2;
    state.battle.meter = 65;
    state.combo = 4;
    const html = renderToStaticMarkup(<BattleHud combat={state} visualMeter={60} onPause={() => {}} />);
    expect(html).not.toContain('battle-time');
    expect(html).not.toContain('hunt-battle-timer');
    expect(html).not.toContain('timer.webp');
    expect(html).toContain('aria-label="暂停战斗"');
    expect(html).toContain('果冻怪');
    expect(html).toContain('320 / 800');
    expect(html).not.toContain('76/100');
    expect(html).toContain('width:40%');
    expect(html).toContain('height:60%');
    expect(html).toContain('aria-valuenow="65"');
    expect(html.match(/<button/g)).toHaveLength(2); // Pause and manual verdict.
    expect(html).toContain('剩余生命 2/3');
    expect(html).not.toContain('5000');
  });

  it('marks a full verdict meter as ready and clears it once released', () => {
    const state = createCombat(1, 'corn');
    state.phase = 'verdictReady';
    state.battle.meter = 100;
    const ready = renderToStaticMarkup(<BattleHud combat={state} visualMeter={100} readyPulse={1} onPause={() => {}} />);
    expect(ready).toContain('data-ready="true"');
    expect(ready).toContain('hunt-charge is-verdict is-ready');
    expect(ready).toContain('释放');
    expect(ready).toContain('点击释放裁决');
    state.phase = 'verdictSlash';
    state.battle.meter = 0;
    const released = renderToStaticMarkup(<BattleHud combat={state} visualMeter={0} readyPulse={1} onPause={() => {}} />);
    expect(released).toContain('data-ready="false"');
    expect(released).not.toContain('is-ready');
  });

  it('shows ready and enrage presentation but suppresses ready after player defeat',()=>{
    const state=createCombat(1,'cabbage');
    state.phase='targetActive';state.battle.meter=100;state.enraged=true;
    const html=renderToStaticMarkup(<BattleHud combat={state} visualMeter={100} readyPulse={1} onPause={()=>{}}/>);
    expect(html).toContain('data-ready="true"');
    expect(html).toContain('点击释放裁决');
    expect(html.match(/data-testid="enrage-state"/g)).toHaveLength(1);
    state.battle.playerHp=0;
    expect(renderToStaticMarkup(<BattleHud combat={state} visualMeter={100} onPause={()=>{}}/>)).toContain('data-ready="false"');
  });

  it('keeps ordinary battle assets local and complete', () => {
    const html = renderToStaticMarkup(<BattleHud combat={createCombat()} visualMeter={0} onPause={() => {}} />) + renderToStaticMarkup(<HuntScreens />);
    const sources = [...html.matchAll(/src="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
    expect(sources.length).toBeGreaterThan(15);
    for (const source of sources) expect(`/public${source}` in assetFiles, source).toBe(true);
    for (const name of ['corn-portrait', 'jelly-portrait', 'card-corn', 'card-carrot', 'card-cabbage', 'card-tomato', 'cta-start', 'battle-garden']) {
      expect(`/public/assets/ui-kit/hunt/${name}.webp` in assetFiles, name).toBe(true);
    }
  });

  it('shows one-use bomb stock and the count left after an automatic trigger',()=>{
    const state=createCombat(1,'corn',0,'bomb-hud',true);
    const html=renderToStaticMarkup(<BattleHud combat={state} visualMeter={0} bombCount={2} onPause={()=>{}}/>);
    expect(html).toContain('首刀自动 · ×2');
    expect(html).toContain('裁决首刀自动消耗1个');
    expect(html).toContain('data-triggered="false"');
    expect(html.match(/<button/g)).toHaveLength(2);
    state.tomatoBombTriggered=true;
    const triggered=renderToStaticMarkup(<BattleHud combat={state} visualMeter={0} bombCount={1} onPause={()=>{}}/>);
    expect(triggered).toContain('本次已消耗1个');
    expect(triggered).toContain('已用 · 余1');
    expect(triggered).toContain('data-triggered="true"');
  });

  it('shows jelly hearts, empty equipment and manual release wording',()=>{
    const state=createCombat(1,'jelly');
    const html=renderToStaticMarkup(<BattleHud combat={state} visualMeter={0} bombCount={0} onPause={()=>{}}/>);
    expect(html).toContain('未携带');
    expect(html).toContain('装备1');expect(html).toContain('装备2');
    expect(html).toContain('基础厨刀');expect(html).toContain('剩余生命 3/3');
    expect(html).not.toContain('商店解锁');
    expect(html).not.toContain('icons/tomato.png');
    expect(html).toContain('蓄满后点击释放');expect(html).not.toContain('自动裁决');
    state.battle.meter=100;
    expect(renderToStaticMarkup(<BattleHud combat={state} visualMeter={100} onPause={()=>{}}/>)).toContain('点击释放裁决');
  });
  it('shows the equipped weapon alongside the carried bomb',()=>{
    const html=renderToStaticMarkup(<BattleHud combat={createCombat()} visualMeter={0} weaponName="玉米斩骨刀" bombCount={2} onPause={()=>{}}/>);
    expect(html).toContain('装备1：玉米斩骨刀');expect(html).toContain('首刀自动 · ×2');
    expect(html).not.toContain('未开放');expect(html).not.toContain('果冻快煮器');
  });
});
