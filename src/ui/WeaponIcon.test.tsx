import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeaponIcon } from './WeaponIcon';

afterEach(() => vi.unstubAllEnvs());

describe('corn cleaver artwork', () => {
  it.each(['/', '/blade-verdict-web/'])('uses the supplied artwork under base %s', base => {
    vi.stubEnv('BASE_URL', base);
    const html = renderToStaticMarkup(<WeaponIcon weaponId="weapon_corn_cleaver" size={60} />);
    expect(html).toContain(`src="${base}assets/equipment/corn-cleaver.png"`);
    expect(html).toContain('width="60" height="60"');
    expect(html).toContain('alt=""');
    expect(html).toContain('draggable="false"');
    expect(html).not.toContain('<svg');
    const assets = import.meta.glob('/public/assets/equipment/*.png');
    expect(assets).toHaveProperty('/public/assets/equipment/corn-cleaver.png');
  });

  it.each([null, 'weapon_jelly_fork', 'unknown'])('retains the original symbol for %s', weaponId => {
    const html = renderToStaticMarkup(<WeaponIcon weaponId={weaponId} />);
    expect(html).toContain('<svg');
    expect(html).not.toContain('corn-cleaver.png');
  });
});
