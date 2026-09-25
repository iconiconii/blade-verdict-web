import { useEffect, useId, useRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import './ui.css';
import { assetUrl } from './assets';

export type Material = 'parchment' | 'wood';
export type ButtonVariant = 'gold' | 'blue' | 'green' | 'wood' | 'danger';
export type Rarity = 'common' | 'fine' | 'rare' | 'legendary';
export const itemIconNames = ['corn', 'carrot', 'cabbage', 'tomato', 'potato', 'mushroom', 'chili', 'pumpkin', 'broccoli', 'eggplant', 'coin', 'gem', 'pot', 'chest', 'map', 'book'] as const;
export type ItemIconName = typeof itemIconNames[number];
const rarityNames: Record<Rarity, string> = { common: '普通', fine: '优质', rare: '稀有', legendary: '极品' };
const cx = (...names: Array<string | undefined | false>) => names.filter(Boolean).join(' ');

export function GamePanel({ material = 'parchment', className, children, ...props }: HTMLAttributes<HTMLDivElement> & { material?: Material }) {
  return <div {...props} className={cx('gui-panel', `gui-material--${material}`, className)}>{children}</div>;
}

export function GameButton({ variant = 'gold', busy = false, disabled, className, children, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={cx('gui-button', `gui-button--${variant}`, className)}><span>{busy ? '处理中…' : children}</span></button>;
}

export function GameTitle({ children, eyebrow, subtitle, level = 2 }: { children: ReactNode; eyebrow?: string; subtitle?: string; level?: 1 | 2 | 3 }) {
  const Heading = `h${level}` as const;
  return <div className="gui-title">{eyebrow && <span className="gui-eyebrow">{eyebrow}</span>}<Heading>{children}</Heading>{subtitle && <p>{subtitle}</p>}</div>;
}

export function GameBanner({ title, children, tone = 'reward' }: { title: string; children?: ReactNode; tone?: 'reward' | 'warning' | 'quest' }) {
  return <div className={`gui-banner gui-banner--${tone}`}><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function ItemIcon({ name, label, size = 64 }: { name: ItemIconName; label?: string; size?: number }) {
  return <img className="gui-item-icon" src={assetUrl(`assets/ui-kit/icons/${name}.png`)} alt={label ?? ''} width={size} height={size} draggable={false} />;
}

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return <span className={`gui-badge gui-rarity--${rarity}`}>{rarityNames[rarity]}</span>;
}

export function ItemCard({ name, icon, count, rarity = 'common', selected = false, disabled = false, onClick }: { name: string; icon: ItemIconName; count: number; rarity?: Rarity; selected?: boolean; disabled?: boolean; onClick?: () => void }) {
  const content = <><ItemIcon name={icon} size={86} /><strong>{name}</strong><RarityBadge rarity={rarity} /><span className="gui-item-count">× {Math.max(0, Math.floor(count)).toLocaleString('zh-CN')}</span></>;
  const className = cx('gui-item-card', `gui-rarity--${rarity}`, selected && 'is-selected');
  return onClick ? <button type="button" className={className} disabled={disabled} onClick={onClick} aria-pressed={selected}>{content}</button> : <div className={className}>{content}</div>;
}

export function ResourceChip({ label, value, icon = 'coin' }: { label: string; value: number; icon?: ItemIconName }) {
  return <span className="gui-resource"><ItemIcon name={icon} size={42} /><strong>{value.toLocaleString('zh-CN')}</strong><span>{label}</span></span>;
}

export function progressPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, value / max * 100));
}

export function GameProgress({ value, max = 100, label, tone = 'gold' }: { value: number; max?: number; label: string; tone?: 'green' | 'gold' | 'danger' }) {
  const percent = progressPercent(value, max);
  return <div className={`gui-progress gui-progress--${tone}`}><div className="gui-progress-label"><span>{label}</span><span>{Math.round(percent)}%</span></div><div className="gui-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div></div>;
}

export interface NavigationItem { id: string; label: string; icon: ItemIconName; disabled?: boolean; testId?: string }
export function GameNav({ items, active, onChange, label = '游戏导航', className }: { items: NavigationItem[]; active: string; onChange: (id: string) => void; label?: string; className?: string }) {
  return <nav className={cx('gui-nav', className)} aria-label={label}>{items.map(item => <button type="button" key={item.id} data-testid={item.testId} disabled={item.disabled} aria-current={active === item.id ? 'page' : undefined} onClick={() => onChange(item.id)}><ItemIcon name={item.icon} size={52} /><span>{item.label}</span></button>)}</nav>;
}

/** Native dialog owns focus trapping, inert siblings, Escape and focus restoration. */
export function GameDialog({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog className="gui-dialog gui-panel gui-material--parchment" ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="gui-dialog-heading"><h2 id={titleId}>{title}</h2><GameButton variant="green" className="gui-close" aria-label="关闭弹窗" onClick={onClose}>关闭</GameButton></div>
    <div className="gui-dialog-body">{children}</div>{actions && <div className="gui-dialog-actions">{actions}</div>}
  </dialog>;
}

export function GameEmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="gui-empty"><ItemIcon name="chest" size={96} /><strong>{title}</strong><p>{children}</p>{action}</div>;
}

export function GameSwitch({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="gui-setting-row"><span>{label}</span><button className="gui-switch" type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>{checked ? '开启' : '关闭'}</button></div>;
}

export function GameSlider({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const id = useId();
  const percent = progressPercent(value, 100);
  return <div className="gui-slider"><label htmlFor={id}>{label}</label><input id={id} type="range" min={0} max={100} value={percent} onChange={event => onChange(Number(event.target.value))} disabled={disabled} /><output htmlFor={id}>{Math.round(percent)}%</output></div>;
}

export function GameSegmented({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string; disabled?: boolean }>; onChange: (value: string) => void }) {
  const name = useId();
  return <fieldset className="gui-segmented"><legend>{label}</legend><div>{options.map(option => <label key={option.value}><input type="radio" name={name} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</div></fieldset>;
}

export function IngredientSlot({ icon, label, onClick, disabled = false }: { icon?: ItemIconName; label: string; onClick: () => void; disabled?: boolean }) {
  return <button className="gui-slot" type="button" aria-label={label} onClick={onClick} disabled={disabled}>{icon ? <ItemIcon name={icon} size={62} /> : <span className="gui-slot-empty">添加</span>}<span>{label}</span></button>;
}

export function GameToast({ children, tone = 'success' }: { children: ReactNode; tone?: 'success' | 'error' }) {
  return <div className={`gui-toast gui-toast--${tone}`} role="status" aria-live="polite"><ItemIcon name={tone === 'success' ? 'coin' : 'chest'} size={32} /><span>{children}</span></div>;
}

export function GameDivider({ children }: { children: ReactNode }) {
  return <div className="gui-divider"><span>{children}</span></div>;
}

export function StatTile({ label, value, icon }: { label: string; value: string; icon: ItemIconName }) {
  return <div className="gui-stat"><ItemIcon name={icon} size={44} /><div><span>{label}</span><strong>{value}</strong></div></div>;
}

export function GameTheme({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={cx('game-ui', className)} style={style}>{children}</div>;
}
