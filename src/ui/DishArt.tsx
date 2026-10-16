import { dishPresentation } from './dishes';
import './dish-art.css';

/** One source for recipe selection, claiming, collection and sales. */
export function DishArt({ dishId, locked = false }: { dishId: string; locked?: boolean }) {
  const dish = dishPresentation(dishId);
  if (locked || !dish.image) return <span className="ws-sprite ws-sprite--locked dish-art" role="img" aria-label="未解锁" />;
  return <img className="dish-art" src={dish.image} alt={dish.name} width={64} height={64} draggable={false} />;
}
