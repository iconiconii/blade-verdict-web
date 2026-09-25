import { describe, expect, it } from 'vitest';
import { CornGuardian } from './CornGuardian';
import { JellyGuardian } from './JellyGuardian';
import { makeBattleCamera, projectBodyAnchor } from './layout';
import { createCombat } from '../domain/combat';

describe('portrait garden composition', () => {
  for (const [width, height] of [[320, 568], [390, 693], [390, 844], [432, 768]]) {
    it(`keeps anatomical anchor centers clear of the HUD at ${width}x${height}`, () => {
      for (const kind of ['corn', 'jelly'] as const) {
        const monster = kind === 'corn' ? new CornGuardian() : new JellyGuardian();
        const state = createCombat(7319, kind);
        monster.update(state, true);
        monster.root.updateMatrixWorld(true);
        const camera = makeBattleCamera(width, height);
        for (const anchor of Object.values(monster.anchors)) {
          const center = projectBodyAnchor(anchor, camera, width, height);
          expect(center.x).toBeGreaterThan(width * .13);
          expect(center.x).toBeLessThan(width * .93);
          expect(center.y).toBeGreaterThan(height * .25);
          expect(center.y).toBeLessThan(height * .79);
        }
      }
    });
  }
});
