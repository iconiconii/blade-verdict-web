import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { assetUrl } from './assets';
import { ItemIcon } from './index';
import { HuntScreens } from './hunt/HuntScreens';
import { KitchenWorkbench } from './kitchen/KitchenWorkbench';
import { createMetaState } from '../domain/meta';

afterEach(() => vi.unstubAllEnvs());

it.each(['/', '/blade-verdict-web/'])('resolves public assets under %s', base => {
  vi.stubEnv('BASE_URL', base);
  expect(assetUrl('/assets/ui-kit/icons/corn.png')).toBe(`${base}assets/ui-kit/icons/corn.png`);
  const html = renderToStaticMarkup(<><ItemIcon name="corn" /><HuntScreens /><KitchenWorkbench meta={createMetaState()} go={() => {}} cook={() => false} /></>);
  const sources = [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]);
  expect(sources.length).toBeGreaterThan(15);
  for (const source of sources) expect(source.startsWith(`${base}assets/`), source).toBe(true);
});

it('includes the kitchen runtime atlas in public assets', () => {
  const files = import.meta.glob('/public/assets/ui-kit/kitchen/*.png');
  expect(files).toHaveProperty('/public/assets/ui-kit/kitchen/reference-ui.png');
});
