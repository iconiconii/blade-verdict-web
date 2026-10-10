import { expect, it } from 'vitest';
import { canShowCookingIndicator } from './CookingIndicator';

it('does not cover kitchen actions, monster cards, battle controls or results', () => {
  for (const screen of ['kitchen', 'stages', 'battle', 'result'] as const) expect(canShowCookingIndicator(screen)).toBe(false);
  for (const screen of ['restaurant', 'inventory', 'cookbook', 'sales', 'shop'] as const) expect(canShowCookingIndicator(screen)).toBe(true);
});
