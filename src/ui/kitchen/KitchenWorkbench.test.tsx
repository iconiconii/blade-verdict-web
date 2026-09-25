import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createMetaState } from '../../domain/meta';
import { KitchenWorkbench } from './KitchenWorkbench';

describe('reference kitchen UI', () => {
  it('renders the workbench and live resources, not the old recipe list', () => {
    const html = renderToStaticMarkup(<KitchenWorkbench meta={createMetaState({ coins: 73, inventory: [{ ingredientId: 'ing_corn', quality: 'High', count: 4 }] })} go={() => {}} cook={() => true} />);
    expect(html).toContain('金币 73');
    expect(html).toContain('玉米粒，库存 4');
    expect(html).toContain('00:30');
    expect(html).toContain('kitchen-backplate.png');
    expect(html).not.toContain('ws-recipe-layout');
    expect(html.match(/data-testid="kitchen-slot-/g)).toHaveLength(3);
    expect(html.match(/data-testid="pantry-/g)).toHaveLength(10);
    expect(html).toContain('胡萝卜，尚未开放');
    expect(html).toContain('aria-current="page" data-testid="nav-kitchen"');
  });
  it('disables submit while saving or the save is unavailable', () => {
    for (const props of [{ saving: true }, { saveIssue: '只读' }]) {
      const html = renderToStaticMarkup(<KitchenWorkbench meta={createMetaState()} go={() => {}} cook={() => true} {...props} />);
      expect(html).toMatch(/data-testid="cook-submit"[^>]*disabled/);
    }
  });
});
