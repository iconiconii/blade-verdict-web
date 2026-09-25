import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { INGREDIENTS, RECIPES, inventoryCount, previewCooking, type IngredientId, type IngredientSelection, type MetaState } from '../../domain/meta';
import type { Quality } from '../../domain/v2';
import type { Screen } from '../../store';
import { GameButton, GameDialog, ItemIcon, type ItemIconName } from '../index';
import { worldNavigationItems } from '../WorldNavigation';
import { cookingClock, cookingPresentationMs, emptyKitchenSlots, placeIngredient, remainingForSelection, selectedIngredients } from './selection';
import './kitchen.css';
import { assetUrl } from '../assets';

const qualityNames: Record<Quality, string> = { Broken: '破损', Normal: '普通', High: '优质', Top: '极品' };
const ingredientIcon = (id: string): ItemIconName => id === 'ing_corn' ? 'corn' : 'gem';
const ingredientName = (id: string) => INGREDIENTS.find(item => item.id === id)?.name ?? id;
const dishIcons: Record<string, string> = { dish_corn_toast: 'toast', dish_jelly_pudding: 'pudding', dish_corn_jelly: 'combo' };
// Visual catalog only. Preview vegetables never become fake stock or recipes.
const pantry: Array<{ icon: ItemIconName; name: string; id?: IngredientId }> = [
  { icon: 'corn', name: '玉米粒', id: 'ing_corn' }, { icon: 'carrot', name: '胡萝卜' },
  { icon: 'cabbage', name: '白菜' }, { icon: 'tomato', name: '西红柿' }, { icon: 'potato', name: '土豆' },
  { icon: 'mushroom', name: '蘑菇' }, { icon: 'chili', name: '辣椒' }, { icon: 'pumpkin', name: '南瓜' },
  { icon: 'broccoli', name: '西兰花' }, { icon: 'eggplant', name: '茄子' },
  { icon: 'gem', name: '果冻核', id: 'ing_jelly' },
];

/** Measured source-art regions, not a flattened mock: each has a real control
 * above it, and inventory, currency, recipe and timer are React state. */
function ReferenceArt({ crop, className = '' }: { crop: [number, number, number, number]; className?: string }) {
  const [x, y, width, height] = crop;
  return <span aria-hidden="true" className={`kitchen-source-art ${className}`} style={{
    backgroundSize: `${1080 / width * 100}% ${1920 / height * 100}%`,
    backgroundPosition: `${x / (1080 - width) * 100}% ${y / (1920 - height) * 100}%`,
  }} />;
}

export interface KitchenWorkbenchProps {
  meta: MetaState;
  go: (screen: Screen) => void;
  cook: (items: IngredientSelection[]) => Promise<boolean> | boolean;
  saving?: boolean;
  saveIssue?: string | null;
}

export function KitchenWorkbench({ meta, go, cook, saving = false, saveIssue }: KitchenWorkbenchProps) {
  const [slots, setSlots] = useState(emptyKitchenSlots);
  const [picker, setPicker] = useState<{ slot: number; ingredient?: IngredientId } | null>(null);
  const [settings, setSettings] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [hint, setHint] = useState('');
  const [remaining, setRemaining] = useState(cookingPresentationMs);
  const [job, setJob] = useState<{ phase: 'cooking' | 'done'; name: string; dishId: string; quality: Quality; price: number; items: IngredientSelection[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const request = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current += 1; }; }, []);
  const busy = submitting || job !== null;
  const preview = previewCooking(meta, selectedIngredients(slots));
  const items = pantry.slice(page * 10, page * 10 + 10);

  useEffect(() => {
    if (job?.phase !== 'cooking') return;
    const until = performance.now() + cookingPresentationMs;
    const timer = window.setInterval(() => {
      const left = Math.max(0, until - performance.now());
      setRemaining(left);
      if (left === 0) { window.clearInterval(timer); setJob(current => current ? { ...current, phase: 'done' } : null); }
    }, 60);
    return () => window.clearInterval(timer);
  }, [job?.phase]);

  const openIngredient = (id?: IngredientId) => {
    if (busy) return;
    const index = slots.findIndex(item => item === null);
    if (index < 0) { setHint('食材槽已满，点击上方食材可替换或移除。'); return; }
    setPicker({ slot: index, ingredient: id }); setHint('');
  };
  const add = (id: IngredientId, quality: Quality) => {
    if (!picker || busy) return;
    setSlots(current => placeIngredient(meta, current, picker.slot, id, quality));
    setPicker(null); setHint('');
  };
  const startCooking = async () => {
    if (lock.current || busy || saving || saveIssue) return;
    const selected = selectedIngredients(slots);
    const check = previewCooking(meta, selected);
    if (!check.canCook) { setHint(check.failureReason === '请选择食材' ? '先点击下方食材，放入锅中吧。' : check.failureReason); if (!selected.length) openIngredient(); return; }
    lock.current = true; setSubmitting(true); setHint('');
    const version = ++request.current;
    try {
      // The transaction remains the only writer; animations cannot issue cook
      // or modify inventory. It rechecks the latest save under the Web Lock.
      const success = await cook(selected.map(item => ({ ...item })));
      if (!alive.current || version !== request.current) return;
      if (success) {
        setJob({ phase: 'cooking', name: check.recipe.name, dishId: check.recipe.outputDishId, quality: check.quality, price: check.sellPrice, items: selected });
        setRemaining(cookingPresentationMs); setSlots(emptyKitchenSlots());
      } else setHint('未完成保存，食材选择已保留，请重试。');
    } catch { if (alive.current && version === request.current) setHint('烹饪未成功，请稍后重试。'); }
    finally { if (alive.current && version === request.current) { setSubmitting(false); lock.current = false; } }
  };
  const closeResult = () => { setJob(null); setRemaining(cookingPresentationMs); };
  const resetSelections = () => { setSlots(emptyKitchenSlots()); setRecipesOpen(false); setHint('点击库存食材选择品质；玉米 + 果冻可以制作组合料理。'); };

  return <section className="kitchen-workbench" data-testid="workshop-kitchen" aria-label="厨房烹饪工作台">
    <div className={`kitchen-scene ${job?.phase === 'cooking' ? 'is-cooking' : ''}`}>
      <img className="kitchen-backplate" src={assetUrl('assets/ui-kit/kitchen/kitchen-backplate.png')} alt="" draggable={false} />
      <div className="kitchen-wallet" aria-label={`金币 ${meta.coins}`}><strong>{meta.coins.toLocaleString('zh-CN')}</strong></div>
      <button className="kitchen-wallet-add kitchen-hotspot" aria-label="前往菜架赚取金币" onClick={() => go('sales')} disabled={busy} />
      <button className="kitchen-settings kitchen-hotspot" aria-label="厨房设置" onClick={() => setSettings(true)} disabled={busy} />
      <h1 className="kitchen-sr-only">厨房</h1>
      <div className="kitchen-time" aria-label={`烹饪时间 ${cookingClock(remaining)}`}><time>{cookingClock(remaining)}</time></div>
      <button className="kitchen-recipe-target kitchen-hotspot" aria-label={preview.canCook ? `菜谱目标：${preview.recipe.name}，查看配方` : '菜谱目标：查看配方'} onClick={() => setRecipesOpen(true)} disabled={busy}>
        {preview.canCook ? <><span className={`ws-sprite ws-sprite--${dishIcons[preview.recipe.outputDishId]}`} /><b>{preview.recipe.name}</b><small>{qualityNames[preview.quality]} · {preview.sellPrice} 金币</small></> : <ReferenceArt crop={[867, 610, 165, 113]} />}
      </button>
      <button className="kitchen-start kitchen-hotspot" data-testid="cook-submit" onClick={() => { void startCooking(); }} disabled={busy || saving || !!saveIssue} aria-busy={busy}>
        {submitting ? '正在保存' : job?.phase === 'cooking' ? '烹饪中…' : job ? '料理出锅' : '开始烹饪'}
      </button>
      <div className="kitchen-slots" aria-label="待烹饪食材">
        {slots.map((item, index) => <button key={index} className={`kitchen-slot kitchen-hotspot ${item ? 'is-filled' : ''}`} data-testid={`kitchen-slot-${index}`} disabled={busy}
          aria-label={item ? `食材槽 ${index + 1}：${ingredientName(item.ingredientId)} ${qualityNames[item.quality]}，点击替换或移除` : `食材槽 ${index + 1}：放食材`} onClick={() => { setPicker({ slot: index }); setHint(''); }}>
          {item ? <><ItemIcon name={ingredientIcon(item.ingredientId)} /><b>{ingredientName(item.ingredientId)}</b><small>{qualityNames[item.quality]} ×1</small></> : <ReferenceArt crop={[173, 950, 193, 166]} />}
        </button>)}
      </div>
      <div className="kitchen-pantry" aria-label="现有食材">
        {items.map(item => <button className="kitchen-pantry-item kitchen-hotspot" type="button" key={item.icon} disabled={busy}
          data-testid={`pantry-${item.icon}`} aria-label={`${item.name}，${item.id ? `库存 ${inventoryCount(meta, item.id)}，选择品质` : '尚未开放'}`}
          onClick={() => item.id ? openIngredient(item.id) : setHint(`${item.name}尚未开放，当前可烹饪玉米粒和果冻核。`)}>
          <ItemIcon name={item.icon} /><span className="kitchen-stock">{item.id ? inventoryCount(meta, item.id) : '未开放'}</span>
        </button>)}
      </div>
      <button className="kitchen-pantry-page kitchen-hotspot" onClick={() => { setPage(current => 1 - current); setHint(''); }} disabled={busy} aria-label={page ? '返回蔬菜食材' : '查看果冻食材'}>{page ? '蔬菜食材' : '果冻食材'}</button>
      {meta.pendingDishes.length > 0 && <button className="kitchen-sales-link kitchen-hotspot" disabled={busy} onClick={() => go('sales')} data-testid="kitchen-sales">菜架 · {meta.pendingDishes.length} 道</button>}
      {(hint || saveIssue) && <div className="kitchen-hint" role="status" onClick={() => setHint('')}>{saveIssue || hint}</div>}
      {job?.phase === 'cooking' && <div className="kitchen-pot-animation" aria-label="食材正在入锅">{job.items.map((item, index) => <span key={index} style={{ '--flight': index } as CSSProperties}><ItemIcon name={ingredientIcon(item.ingredientId)} /></span>)}</div>}
      <nav className="kitchen-navigation" aria-label="游戏导航">
        {worldNavigationItems.map(item => <button className="kitchen-hotspot" key={item.id} disabled={busy} aria-label={item.label} aria-current={item.id === 'kitchen' ? 'page' : undefined} data-testid={`nav-${item.id}`} onClick={() => go(item.id)} />)}
      </nav>
    </div>

    <GameDialog open={picker !== null} onClose={() => setPicker(null)} title="放入食材" actions={<>
      {picker && slots[picker.slot] && <GameButton variant="wood" onClick={() => { setSlots(current => current.map((item, index) => index === picker.slot ? null : item)); setPicker(null); }}>移除食材</GameButton>}
      <GameButton variant="wood" onClick={() => { setPicker(null); go('stages'); }}>去探险</GameButton>
    </>}>
      <p>选好品质后放入一份。实际消耗只在开始烹饪时发生。</p>
      {INGREDIENTS.filter(item => !picker?.ingredient || item.id === picker.ingredient).map(ingredient => <div className="kitchen-ingredient-choices" key={ingredient.id}>
        <div><ItemIcon name={ingredientIcon(ingredient.id)} size={44} /><b>{ingredient.name}</b></div>
        {meta.inventory.filter(stack => stack.ingredientId === ingredient.id && stack.count > 0).map(stack => <GameButton key={stack.quality} disabled={remainingForSelection(meta, slots, ingredient.id, stack.quality, picker?.slot) < 1} onClick={() => add(ingredient.id, stack.quality)}>
          {qualityNames[stack.quality]} · 可用 {remainingForSelection(meta, slots, ingredient.id, stack.quality, picker?.slot)}
        </GameButton>)}
        {inventoryCount(meta, ingredient.id) === 0 && <p>库存为 0，先去探险收集吧。</p>}
      </div>)}
    </GameDialog>
    <GameDialog open={recipesOpen} onClose={() => setRecipesOpen(false)} title="菜谱目标" actions={<GameButton onClick={resetSelections}>重新配菜</GameButton>}>
      <p>食材放入后自动匹配菜谱。不需要填满三个槽。</p>
      {RECIPES.map(recipe => <div key={recipe.id} className="kitchen-recipe-option"><span className={`ws-sprite ws-sprite--${dishIcons[recipe.outputDishId]}`} /><div><b>{recipe.name}</b><p>{Object.entries(recipe.requirements).map(([id, count]) => `${ingredientName(id)} ×${count}`).join(' + ')}</p></div></div>)}
    </GameDialog>
    <GameDialog open={settings} onClose={() => setSettings(false)} title="厨房" actions={<><GameButton variant="wood" onClick={() => go('restaurant')}>返回餐厅</GameButton><GameButton onClick={() => go('sales')}>查看菜架</GameButton></>}>
      <p>点击库存食材选择品质，放入食材槽。点菜谱牌查看配方；点击已放入的食材可移除。</p><p>烹饪演出持续 30 秒。料理价格和消耗沿用现有规则，保存成功后才开始演出；关闭页面也不会丢失已保存的料理。</p>
    </GameDialog>
    <GameDialog open={job?.phase === 'done'} onClose={closeResult} title="料理出锅！" actions={<><GameButton variant="wood" onClick={closeResult}>继续烹饪</GameButton><GameButton onClick={() => { closeResult(); go('sales'); }}>前往菜架</GameButton></>}>
      {job && <div className="kitchen-dish-result" data-testid="cooking-presentation"><span className={`ws-sprite ws-sprite--${dishIcons[job.dishId]}`} /><h2>{job.name}</h2><p>{qualityNames[job.quality]} · 售价 {job.price} 金币</p><p>料理已放入菜架</p></div>}
    </GameDialog>
  </section>;
}
