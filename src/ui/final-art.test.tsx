import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RECIPES, createMetaState } from '../domain/meta';
import { Cookbook, Sales } from '../Workshop';
import { DishArt } from './DishArt';
import { dishArtwork, dishPresentation } from './dishes';
import { HuntArt, MonsterPortrait } from './hunt/HuntScreens';
import { huntArtUrl, monsterPortraitUrl } from './hunt/art';
import { KitchenRecipeOptions } from './kitchen/KitchenWorkbench';
import { WorldNavigation, worldNavigationItems } from './WorldNavigation';
import { ItemIcon } from './index';

const files = import.meta.glob('/public/assets/art-1016/**/*.webp');
const dishImages = (html: string) => [...html.matchAll(/<img[^>]*src="([^"]+\/dishes\/[^" ]+)"/g)].map(match => match[1]);
afterEach(() => vi.unstubAllEnvs());

describe('final supplied artwork', () => {
  it('assigns all ten recipes distinct, existing dish images with no name inference', () => {
    expect(Object.keys(dishArtwork).sort()).toEqual(RECIPES.map(recipe => recipe.outputDishId).sort());
    const paths = RECIPES.map(recipe => dishPresentation(recipe.outputDishId).image);
    expect(new Set(paths).size).toBe(10);
    for (const path of paths) expect(files).toHaveProperty(`/public${path}`);
    expect(dishPresentation('unknown').image).toBe(null);
  });

  it('retains the saved tomato IDs, recipe requirements and price multiplier', () => {
    expect(RECIPES.find(recipe => recipe.id === 'recipe_tomato_salsa')).toEqual({
      id: 'recipe_tomato_salsa', outputDishId: 'dish_tomato_salsa', name: '西红柿汁',
      requirements: { ing_tomato: 1 }, multiplier: 1.2,
    });
    expect(dishPresentation('dish_tomato_salsa')).toMatchObject({ name: '西红柿汁', image: '/assets/art-1016/dishes/tomato-juice.webp' });
  });

  it('uses identical art in recipe selection, the collection, sales and the claim image', () => {
    const meta = createMetaState({
      unlockedRecipeIds: RECIPES.map(recipe => recipe.id),
      pendingDishes: RECIPES.map((recipe, index) => ({ instanceId: `art-${index}`, dishId: recipe.outputDishId, quality: 'Normal', sellPrice: 30 })),
    });
    const expected = RECIPES.map(recipe => dishPresentation(recipe.outputDishId).image);
    const pages = [
      <KitchenRecipeOptions meta={meta} selectedId={null} onSelect={() => {}} />,
      <Cookbook meta={meta} go={() => {}} />,
      <Sales meta={meta} go={() => {}} sellDish={async () => true} sellAllDishes={async () => true} />,
      <>{RECIPES.map(recipe => <DishArt key={recipe.id} dishId={recipe.outputDishId} />)}</>,
    ];
    for (const page of pages) expect(dishImages(renderToStaticMarkup(page))).toEqual(expected);
    const locked = renderToStaticMarkup(<Cookbook meta={createMetaState()} go={() => {}} />);
    expect(dishImages(locked)).toHaveLength(0);
    expect(locked.match(/aria-label="未解锁"/g)).toHaveLength(10);
  });

  it.each(['/', '/blade-verdict-web/'])('resolves all new art under base %s', base => {
    vi.stubEnv('BASE_URL', base);
    const monsters = ['corn', 'carrot', 'cabbage', 'tomato', 'jelly'] as const;
    for (const boss of monsters) {
      for (const thumbnail of [false, true]) {
        const path = monsterPortraitUrl(boss, thumbnail);
        expect(path).toBe(`${base}assets/art-1016/monsters/${boss}${thumbnail ? '-thumb' : ''}.webp`);
        expect(files).toHaveProperty(`/public/${path.slice(base.length)}`);
        const html = renderToStaticMarkup(<MonsterPortrait boss={boss} thumbnail={thumbnail} />);
        expect(html).toContain(`src="${path}"`);
        expect(html).not.toMatch(/preview-|monster-progress|<h2|clip-path/);
      }
    }
    for (const recipe of RECIPES) expect(dishPresentation(recipe.outputDishId).image).toContain(`${base}assets/art-1016/dishes/`);
    for (const name of ['jelly-title', 'jelly-island', 'coin', 'plus', 'settings', 'arrow', 'dot', 'dot-active', 'cta-hunt']) {
      const path = huntArtUrl(name);
      expect(path).toBe(`${base}assets/art-1016/hunt/${name}.webp`);
      expect(files).toHaveProperty(`/public/${path.slice(base.length)}`);
      expect(renderToStaticMarkup(<HuntArt name={name} />)).toContain(path);
    }
    expect(huntArtUrl('chapter-island')).toBe(`${base}assets/ui-kit/hunt/chapter-island.webp`);
    expect(renderToStaticMarkup(<ItemIcon name="coin" />)).toContain(`${base}assets/art-1016/hunt/coin.webp`);
  });

  it('keeps navigation selection live instead of baking Explore into every page', () => {
    for (const item of worldNavigationItems) {
      const html = renderToStaticMarkup(<WorldNavigation active={item.id} />);
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html).toContain(`aria-current="page" data-testid="nav-${item.id}"`);
      for (const target of worldNavigationItems) {
        expect(html).toContain(`/assets/art-1016/hunt/nav-${target.id}.webp`);
        expect(files).toHaveProperty(`/public/assets/art-1016/hunt/nav-${target.id}.webp`);
      }
    }
  });
});
