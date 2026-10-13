import {
  QUALITY_ORDER,
  RECIPES,
  consumableCount,
  consumeConsumable,
  cookingDurationMs,
  createMetaState,
  dishPrice,
  dishQuality,
  ingredientIdForBoss,
  matchesRecipe,
  previewCooking,
  removeInventory,
  type DishInstance,
  type IngredientSelection,
} from './meta';
import type { SavedWorkshop } from './save';

/** Matches the ECMAScript Date range as well as safe-integer persistence. */
export const MAX_COOKING_TIME_MS = 8_640_000_000_000_000;

export interface CookingJob {
  id: string;
  recipeId: string;
  startedAt: number;
  finishAt: number;
  ingredients: IngredientSelection[];
  /** This is a reserved result, not a sellable dish until claimCooking succeeds. */
  dish: DishInstance;
}

function assertTime(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || now > MAX_COOKING_TIME_MS) throw new Error('烹饪时间必须是有效的毫秒时间戳');
}

function nextRevision(save: SavedWorkshop): number {
  if (!Number.isSafeInteger(save.revision) || save.revision < 0 || save.revision >= Number.MAX_SAFE_INTEGER) throw new Error('存档版本计数已达到上限');
  return save.revision + 1;
}

/** Pure transaction candidate: persist this whole save before acknowledging start. */
export function beginCooking(save: SavedWorkshop, recipeId: string, selected: readonly IngredientSelection[], jobId: string, now: number): SavedWorkshop {
  assertTime(now);
  if (save.cookingJob) throw new Error('锅中已有料理，请先领取');
  if (typeof jobId !== 'string' || !jobId.trim()) throw new Error('烹饪任务标识不能为空');
  const recipe = RECIPES.find(candidate => candidate.id === recipeId);
  if (!recipe) throw new Error('请选择有效菜谱');
  if (!matchesRecipe(selected, recipe)) throw new Error('食材数量与所选菜谱不匹配');
  const preview = previewCooking(save.meta, selected);
  if (!preview.canCook) throw new Error(preview.failureReason);
  const finishAt = now + cookingDurationMs(save.meta);
  assertTime(finishAt);
  const instanceId = `cooking:${jobId}`;
  if (save.meta.pendingDishes.some(dish => dish.instanceId === instanceId)) throw new Error('烹饪任务标识已使用');

  // Store one canonical entry per quality stack even if a UI split its selection.
  const ingredients: IngredientSelection[] = [];
  for (const selection of selected) {
    const ingredientId = ingredientIdForBoss(selection.ingredientId);
    const existing = ingredients.find(item => item.ingredientId === ingredientId && item.quality === selection.quality);
    if (existing) existing.count += selection.count;
    else ingredients.push({ ingredientId, quality: selection.quality, count: selection.count });
  }
  let meta = createMetaState(save.meta);
  for (const selection of ingredients) meta = removeInventory(meta, selection);
  if (consumableCount(meta, 'upgrade_jelly_cooker') > 0) meta = consumeConsumable(meta, 'upgrade_jelly_cooker');
  return {
    ...save,
    revision: nextRevision(save),
    meta,
    cookingJob: {
      id: jobId,
      recipeId: recipe.id,
      startedAt: now,
      finishAt,
      ingredients,
      dish: { instanceId, dishId: recipe.outputDishId, quality: dishQuality(ingredients), sellPrice: dishPrice(ingredients, recipe) },
    },
  };
}

/** Wall-clock completion survives unmount/background/reload without running timers. */
export function cookingRemainingMs(job: CookingJob | null, now: number): number {
  assertTime(now);
  return job ? Math.max(0, job.finishAt - now) : 0;
}

/** Only a successful atomic persistence update makes the result claimable/sellable. */
export function claimCooking(save: SavedWorkshop, jobId: string, now: number): SavedWorkshop {
  assertTime(now);
  if (typeof jobId !== 'string' || !jobId.trim()) throw new Error('烹饪任务标识不能为空');
  const job = save.cookingJob;
  if (!job) return save;
  if (job.id !== jobId) throw new Error('烹饪任务已变化，请刷新后重试');
  if (now < job.finishAt) throw new Error('料理尚未完成');
  if (save.meta.pendingDishes.some(dish => dish.instanceId === job.dish.instanceId)) throw new Error('料理已领取');

  const meta = createMetaState(save.meta);
  meta.pendingDishes.push({ ...job.dish });
  if (!meta.unlockedRecipeIds.includes(job.recipeId)) meta.unlockedRecipeIds.push(job.recipeId);
  const record = meta.dishRecords.find(item => item.dishId === job.dish.dishId);
  if (record) {
    if (record.cookCount >= Number.MAX_SAFE_INTEGER) throw new Error('料理次数已达到上限');
    record.cookCount += 1;
    if (QUALITY_ORDER.indexOf(job.dish.quality) > QUALITY_ORDER.indexOf(record.bestQuality)) record.bestQuality = job.dish.quality;
  } else meta.dishRecords.push({ dishId: job.dish.dishId, bestQuality: job.dish.quality, cookCount: 1 });
  return { ...save, revision: nextRevision(save), meta, cookingJob: null };
}
