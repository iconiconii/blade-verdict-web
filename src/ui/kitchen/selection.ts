import { QUALITY_ORDER, ingredientIdForBoss, inventoryCount, type IngredientId, type IngredientSelection, type MetaState, type RecipeDefinition } from '../../domain/meta';
import type { Quality } from '../../domain/v2';

/** A slot is one ingredient, not one unit or one quality. */
export interface KitchenSlot {
  ingredientId: IngredientId;
  items: IngredientSelection[];
}
export type KitchenSlots = Array<KitchenSlot | null>;
export type QualityAmounts = Partial<Record<Quality, number>>;
export const emptyKitchenSlots = (): KitchenSlots => [null, null, null];
export const selectedIngredients = (slots: KitchenSlots): IngredientSelection[] => slots.flatMap(item => item?.items.map(stack => ({ ...stack })) ?? []);
export const slotQuantity = (slot: KitchenSlot | null) => slot?.items.reduce((sum, item) => sum + item.count, 0) ?? 0;
export const ingredientQuantity = (slots: KitchenSlots, id: IngredientId, excluding = -1) => slots.reduce((sum, slot, index) => sum + (index !== excluding && slot?.ingredientId === id ? slotQuantity(slot) : 0), 0);

export function slotsForIngredients(items: readonly IngredientSelection[]): KitchenSlots {
  const slots = emptyKitchenSlots();
  for (const item of items) {
    const id = ingredientIdForBoss(item.ingredientId);
    let index = slots.findIndex(slot => slot?.ingredientId === id);
    if (index < 0) index = slots.findIndex(slot => slot === null);
    if (index < 0) continue;
    if (!slots[index]) slots[index] = { ingredientId: id, items: [] };
    const current = slots[index]!;
    const existing = current.items.find(stack => stack.quality === item.quality);
    if (existing) existing.count += item.count;
    else current.items.push({ ...item, ingredientId: id });
  }
  return slots;
}

export function amountsForSlot(slot: KitchenSlot | null): QualityAmounts {
  return Object.fromEntries((slot?.items ?? []).map(item => [item.quality, item.count]));
}

/** Draft selections never reserve or consume persisted inventory. */
export function remainingForSelection(meta: MetaState, slots: KitchenSlots, id: IngredientId, quality: Quality, replacing = -1) {
  const selected = selectedIngredients(slots.filter((_, index) => index !== replacing));
  const reserved = selected.reduce((sum, item) => sum + (item.ingredientId === id && item.quality === quality ? item.count : 0), 0);
  return Math.max(0, inventoryCount(meta, id, quality) - reserved);
}

export function recipeMissingIngredients(meta: MetaState, recipe: RecipeDefinition): Array<{ ingredientId: IngredientId; count: number }> {
  return Object.entries(recipe.requirements).flatMap(([id, required]) => {
    const ingredientId = id as IngredientId;
    const count = Math.max(0, required - inventoryCount(meta, ingredientId));
    return count > 0 ? [{ ingredientId, count }] : [];
  });
}

/** A quality stepper cannot exceed either stock or this recipe's unmet amount. */
export function maximumQualityAmount(meta: MetaState, slots: KitchenSlots, recipe: RecipeDefinition, slot: number, id: IngredientId, quality: Quality, amounts: QualityAmounts) {
  const otherQualities = QUALITY_ORDER.reduce((sum, candidate) => sum + (candidate !== quality ? amounts[candidate] ?? 0 : 0), 0);
  const demand = (recipe.requirements[id] ?? 0) - ingredientQuantity(slots, id, slot) - otherQualities;
  return Math.max(0, Math.min(remainingForSelection(meta, slots, id, quality, slot), demand));
}

/** Return the unchanged draft on invalid/stale confirmation. */
export function placeIngredient(meta: MetaState, slots: KitchenSlots, slot: number, recipe: RecipeDefinition, id: IngredientId, amounts: QualityAmounts): KitchenSlots {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 3 || !recipe.requirements[id]) return slots;
  if (slots.some((item, index) => index !== slot && item?.ingredientId === id)) return slots;
  if (Object.keys(amounts).some(quality => !QUALITY_ORDER.includes(quality as Quality))) return slots;
  const items: IngredientSelection[] = [];
  for (const quality of QUALITY_ORDER) {
    const count = amounts[quality] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count > maximumQualityAmount(meta, slots, recipe, slot, id, quality, amounts)) return slots;
    if (count > 0) items.push({ ingredientId: id, quality, count });
  }
  if (items.length === 0) return slots;
  return slots.map((item, index) => index === slot ? { ingredientId: id, items } : item);
}

export function cookingClock(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
