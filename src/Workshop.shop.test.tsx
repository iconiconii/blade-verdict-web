import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMetaState } from './domain/meta';
import { EquipmentPanel, Shop } from './Workshop';

const actions = { go: () => {}, buyItem: () => true, equipItem: () => true };
const itemCard = (html: string, id: string) => html.split(`data-testid="shop-${id}"`)[1].split('data-testid="shop-')[0];

describe('one-use shop supplies', () => {
  it('keeps each approved icon and offers repeat purchases while showing stock', () => {
    const meta = createMetaState({ coins: 1000, ownedItems: [
      { itemId: 'upgrade_tomato_bomb', count: 2 },
      { itemId: 'upgrade_jelly_cooker', count: 3 },
    ] });
    const html = renderToStaticMarkup(<Shop meta={meta} {...actions} />);
    const bomb = itemCard(html, 'upgrade_tomato_bomb');
    const cooker = itemCard(html, 'upgrade_jelly_cooker');
    expect(bomb).toContain('icons/tomato.png');
    expect(cooker).toContain('icons/pot.png');
    expect(bomb).toContain('库存 2 · 使用后消耗1个');
    expect(cooker).toContain('库存 3 · 使用后消耗1个');
    expect(bomb).toContain('再买1个 · 150');
    expect(cooker).toContain('再买1个 · 240');
    expect(bomb).not.toMatch(/<button[^>]*disabled/);
    expect(cooker.split('<details')[0]).not.toMatch(/<button[^>]*disabled/);
    expect(html).not.toContain('永久');
  });

  it('disables unaffordable restocking even when the player already owns a supply', () => {
    const html = renderToStaticMarkup(<Shop meta={createMetaState({ coins: 120, ownedItems: [{ itemId: 'upgrade_tomato_bomb', count: 1 }] })} {...actions} />);
    const bomb = itemCard(html, 'upgrade_tomato_bomb');
    expect(bomb).toContain('还差 30 金币');
    expect(bomb).toContain('再买1个 · 150');
    expect(bomb).toMatch(/<button[^>]*disabled/);
  });

  it('lists remaining supplies in inventory and removes them after consumption', () => {
    const populated = renderToStaticMarkup(<EquipmentPanel meta={createMetaState({ ownedItems: [{ itemId: 'upgrade_tomato_bomb', count: 2 }] })} go={() => {}} />);
    expect(populated).toContain('西红柿炸弹');
    expect(populated).toContain('×2');
    const empty = renderToStaticMarkup(<EquipmentPanel meta={createMetaState()} go={() => {}} />);
    expect(empty).not.toContain('西红柿炸弹');
    expect(empty).toContain('还没有装备或道具');
  });
});
