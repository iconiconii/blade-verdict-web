import { expect, it } from 'vitest';
import { ingredientBurstFor } from './v2';

it.each(['corn','jelly'] as const)('uses 0/3/8 particles for %s Miss/Good/Perfect',kind=>{
  expect(ingredientBurstFor(kind,'Miss')).toBe(0);
  expect(ingredientBurstFor(kind,'Nice')).toBe(3);
  expect(ingredientBurstFor(kind,'Perfect')).toBe(8);
});
