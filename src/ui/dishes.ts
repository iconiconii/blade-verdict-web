import { RECIPES } from '../domain/meta';

export type DishIcon = 'toast' | 'pudding' | 'combo';

/** Names come from the recipe catalog; all screens share the approved dish art. */
export function dishPresentation(dishId: string): { name: string; icon: DishIcon } {
  const recipe = RECIPES.find(entry => entry.outputDishId === dishId);
  const icon: DishIcon = dishId.includes('pudding') || dishId.includes('salsa')
    ? 'pudding'
    : dishId.includes('toast') || dishId.includes('roast') || dishId.includes('pancake')
      ? 'toast' : 'combo';
  return { name: recipe?.name ?? '料理', icon };
}
