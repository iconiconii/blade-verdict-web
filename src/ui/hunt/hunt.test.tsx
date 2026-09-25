import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCombat } from '../../domain/combat';
import { BattleHud, battleClock } from './BattleHud';
import { HuntScreens } from './HuntScreens';

const assetFiles = import.meta.glob('/public/assets/**/*.{png,webp}');

describe('reference hunt UI', () => {
  it.each([[0, '00:00'], [28000, '00:28'], [61000, '01:01'], [-1, '00:00'], [Infinity, '00:00']])('formats the simulation clock %s', (ms, expected) => {
    expect(battleClock(ms as number)).toBe(expected);
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
    state.battle.playerHp = 76;
    state.battle.meter = 65;
    state.combo = 4;
    const html = renderToStaticMarkup(<BattleHud combat={state} visualMeter={60} onPause={() => {}} />);
    expect(html).toContain('00:28');
    expect(html).toContain('果冻怪');
    expect(html).toContain('320 / 800');
    expect(html).toContain('76/100');
    expect(html).toContain('width:40%');
    expect(html).toContain('height:60%');
    expect(html).toContain('aria-valuenow="65"');
    expect(html.match(/<button/g)).toHaveLength(1); // Pause only; meter is automatic.
    expect(html).not.toContain('5000');
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
});
