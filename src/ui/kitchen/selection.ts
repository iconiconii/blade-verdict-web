import { inventoryCount, type IngredientId, type IngredientSelection, type MetaState } from '../../domain/meta';
import type { Quality } from '../../domain/v2';

export type KitchenSlots = Array<IngredientSelection | null>;
export const emptyKitchenSlots = (): KitchenSlots => [null, null, null];
export const selectedIngredients = (slots: KitchenSlots): IngredientSelection[] => slots.filter((item): item is IngredientSelection => item !== null);

/** Selection reserves nothing in the save. Only the existing cook transaction consumes stock. */
export function remainingForSelection(meta: MetaState, slots: KitchenSlots, id: IngredientId, quality: Quality, replacing = -1) {
  const reserved = slots.reduce((sum, item, index) => sum + (index !== replacing && item?.ingredientId === id && item.quality === quality ? item.count : 0), 0);
  return Math.max(0, inventoryCount(meta, id, quality) - reserved);
}

export function placeIngredient(meta: MetaState, slots: KitchenSlots, slot: number, id: IngredientId, quality: Quality): KitchenSlots {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 3 || remainingForSelection(meta, slots, id, quality, slot) < 1) return slots;
  return slots.map((item, index) => index === slot ? { ingredientId: id, quality, count: 1 } : item);
}

// Matches the reference clock. The countdown is presentation only: the existing
// transaction commits once at start, so leaving cannot lose a paid-for dish.
export const cookingPresentationMs = 30000;
export const cookingClock = (remainingMs: number) => `00:${String(Math.ceil(Math.max(0, remainingMs) / 1000)).padStart(2, '0')}`;
