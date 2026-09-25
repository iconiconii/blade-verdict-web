import { useGame, type Screen } from '../store';
import { assetUrl } from './assets';

export const worldNavigationItems = [
  { id: 'kitchen', label: '厨房' },
  { id: 'inventory', label: '仓库' },
  { id: 'stages', label: '探险' },
  { id: 'cookbook', label: '图鉴' },
  { id: 'shop', label: '商店' },
] as const;

/** One navigation order and one set of art across every world screen. */
export function WorldNavigation({ active }: { active: Screen }) {
  const selected = ['restaurant', 'sales', 'result'].includes(active) ? 'kitchen' : active;
  return <nav className="world-navigation" aria-label="游戏导航">
    {worldNavigationItems.map(item => <button type="button" key={item.id}
      aria-label={item.label} aria-current={selected === item.id ? 'page' : undefined}
      data-testid={`nav-${item.id}`} onClick={() => useGame.getState().go(item.id)}>
      <img src={assetUrl(`assets/ui-kit/hunt/nav-${item.id}.webp`)} alt="" draggable={false} />
    </button>)}
  </nav>;
}
