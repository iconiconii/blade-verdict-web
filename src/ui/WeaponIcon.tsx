import { assetUrl } from './assets';

/** Equipment artwork is presentation only; saved IDs and bonuses stay unchanged. */
export function WeaponIcon({ weaponId, size = 32 }: { weaponId?: string | null; size?: number }) {
  if (weaponId === 'weapon_corn_cleaver') {
    return <img className="gui-item-icon" src={assetUrl('assets/equipment/corn-cleaver.png')} alt="" width={size} height={size} draggable={false} />;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l8.5-8.5m-3-3L14 4l3 3-4.5 4.5M8 13l3 3m-5 4h4" /></svg>;
}
