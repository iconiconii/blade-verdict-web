import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createMetaState } from '../../domain/meta';
import type { CookingJob } from '../../domain/cookingJobs';
import { KitchenQuantityStepper, KitchenRecipeOptions, KitchenWorkbench } from './KitchenWorkbench';

const actions = { go: () => {}, startCooking: async () => true, claimCooking: async () => true };
const job = (finishAt: number): CookingJob => ({
  id: 'cooking-ui-test', recipeId: 'recipe_toast', startedAt: finishAt - 30000, finishAt,
  ingredients: [{ ingredientId: 'ing_corn', quality: 'Top', count: 1 }],
  dish: { instanceId: 'dish-ui-test', dishId: 'dish_corn_toast', quality: 'Top', sellPrice: 120 },
});

describe('recipe-first kitchen UI', () => {
  it('keeps the reference art and shows only owned ingredients including jelly', () => {
    const html = renderToStaticMarkup(<KitchenWorkbench meta={createMetaState({ coins: 73, inventory: [
      { ingredientId: 'ing_corn', quality: 'High', count: 4 },
      { ingredientId: 'ing_jelly', quality: 'Normal', count: 2 },
    ] })} cookingJob={null} {...actions} />);
    expect(html).toContain('金币 73');
    expect(html).toContain('玉米粒，库存 4');
    expect(html).toContain('果冻核，库存 2');
    expect(html).toContain('00:30');
    expect(html).toContain('kitchen-backplate.png');
    expect(html.match(/data-testid="kitchen-slot-/g)).toHaveLength(3);
    expect(html.match(/data-testid="pantry-/g)).toHaveLength(2);
    expect(html).not.toContain('data-testid="pantry-carrot"');
    expect(html).not.toContain('data-testid="pantry-potato"');
    expect(html).not.toContain('未开放');
    expect(html).toContain('aria-current="page" data-testid="nav-kitchen"');
    expect(html).toMatch(/data-testid="cook-submit"[^>]*disabled/);
    expect(html).toMatch(/data-testid="ingredient-confirm"[^>]*disabled/);
  });

  it('shows a useful expedition entry when the pantry is empty', () => {
    const html = renderToStaticMarkup(<KitchenWorkbench meta={createMetaState()} cookingJob={null} {...actions} />);
    expect(html).toContain('背包里还没有食材');
    expect(html).toContain('去探险');
    expect(html).not.toContain('data-testid="pantry-');
  });

  it('previews the next one-use cooker and explains that starting consumes one', () => {
    const meta = createMetaState({ ownedItems: [{ itemId: 'upgrade_jelly_cooker', count: 2 }] });
    const html = renderToStaticMarkup(<KitchenWorkbench meta={meta} cookingJob={null} {...actions} />);
    expect(html).toContain('00:23');
    expect(html).toContain('快煮器 ×2 · 本锅自动消耗1个');
    expect(html).not.toContain('厨房设置');
    expect(html).toContain('打开菜架');
    expect(html).not.toContain('种食材');
    expect(html).not.toContain('永久');
  });

  it('permits undiscovered recipes when stock suffices and disables those missing stock', () => {
    const html = renderToStaticMarkup(<KitchenRecipeOptions meta={createMetaState({ inventory: [{ ingredientId: 'ing_corn', quality: 'Normal', count: 1 }] })} selectedId={null} onSelect={() => {}} />);
    expect(html).toMatch(/data-testid="recipe-recipe_toast"[^>]*aria-pressed="false"/);
    expect(html).not.toMatch(/data-testid="recipe-recipe_toast"[^>]*disabled/);
    expect(html).toMatch(/data-testid="recipe-recipe_pudding"[^>]*disabled/);
    expect(html).toContain('缺少 果冻核 ×1');
  });

  it('renders disabled decrement at zero and disabled increment at the allowed limit', () => {
    const empty = renderToStaticMarkup(<KitchenQuantityStepper label="玉米粒极品" count={0} maximum={2} onChange={() => {}} />);
    expect(empty).toMatch(/aria-label="减少玉米粒极品"[^>]*disabled/);
    expect(empty).not.toMatch(/aria-label="增加玉米粒极品"[^>]*disabled/);
    const full = renderToStaticMarkup(<KitchenQuantityStepper label="玉米粒极品" count={2} maximum={2} onChange={() => {}} />);
    expect(full).toMatch(/aria-label="增加玉米粒极品"[^>]*disabled/);
  });

  it('locks task ingredients and repeat start, but keeps navigation and sales available while cooking', () => {
    const html = renderToStaticMarkup(<KitchenWorkbench meta={createMetaState({ pendingDishes: [{ instanceId: 'old-dish', dishId: 'dish_corn_toast', quality: 'Top', sellPrice: 120 }] })} cookingJob={job(Date.now() + 12000)} {...actions} />);
    expect(html).toContain('烹饪中…');
    expect(html).toContain('离开厨房也会继续烹饪');
    expect(html).toMatch(/data-testid="cook-submit"[^>]*disabled/);
    expect(html).toMatch(/data-testid="kitchen-slot-0"[^>]*disabled/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*data-testid="nav-/);
    expect(html).not.toMatch(/data-testid="nav-[^"]+"[^>]*disabled/);
    expect(html).not.toMatch(/data-testid="kitchen-sales"[^>]*disabled/);
    expect(html).toContain('玉米粒 1/1');
  });

  it('offers explicit claiming after the persisted finish time without creating a dish modal', () => {
    const html = renderToStaticMarkup(<KitchenWorkbench meta={createMetaState()} cookingJob={job(Date.now() - 1)} {...actions} />);
    expect(html).toContain('领取料理');
    expect(html).toContain('00:00');
    expect(html).not.toMatch(/data-testid="cook-submit"[^>]*disabled/);
    expect(html).not.toContain('data-testid="cooking-presentation"');
  });

  it('disables a finished task claim while saving or the save is unavailable', () => {
    for (const props of [{ saving: true }, { saveIssue: '只读' }]) {
      const html = renderToStaticMarkup(<KitchenWorkbench meta={createMetaState()} cookingJob={job(Date.now() - 1)} {...actions} {...props} />);
      expect(html).toMatch(/data-testid="cook-submit"[^>]*disabled/);
    }
  });
});
