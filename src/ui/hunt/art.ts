import type { BossKind } from '../../domain/v2';
import { assetUrl } from '../assets';

const refreshed = new Set(['coin', 'plus', 'settings', 'arrow', 'dot', 'dot-active', 'cta-hunt', 'jelly-title', 'jelly-island']);

export function huntArtUrl(name: string) {
  return assetUrl(`assets/${refreshed.has(name) ? 'art-1016/hunt' : 'ui-kit/hunt'}/${name}.webp`);
}

export function monsterPortraitUrl(boss: BossKind, thumbnail = false) {
  return assetUrl(`assets/art-1016/monsters/${boss}${thumbnail ? '-thumb' : ''}.webp`);
}
