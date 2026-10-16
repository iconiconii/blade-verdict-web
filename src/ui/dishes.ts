import { RECIPES } from '../domain/meta';
import { assetUrl } from './assets';

export const dishArtwork: Readonly<Record<string, string>> = {
  dish_corn_toast: 'corn-toast',
  dish_jelly_pudding: 'jelly-pudding',
  dish_corn_jelly: 'corn-jelly',
  dish_carrot_roast: 'carrot-roast',
  dish_cabbage_roll: 'cabbage-roll',
  // Keep the persisted ID while adopting the supplied dish's display name/art.
  dish_tomato_salsa: 'tomato-juice',
  dish_vegetable_soup: 'vegetable-soup',
  dish_jelly_salad: 'jelly-salad',
  dish_vegetable_stew: 'vegetable-stew',
  dish_corn_pancake: 'corn-pancake',
};

/** Names come from the recipe catalog; all screens share the approved dish art. */
export function dishPresentation(dishId: string): { name: string; image: string | null } {
  const recipe = RECIPES.find(entry => entry.outputDishId === dishId);
  const art = dishArtwork[dishId];
  return { name: recipe?.name ?? '料理', image: art ? assetUrl(`assets/art-1016/dishes/${art}.webp`) : null };
}
