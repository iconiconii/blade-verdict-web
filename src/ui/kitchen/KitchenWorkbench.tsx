import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { INGREDIENTS, QUALITY_ORDER, RECIPES, consumableCount, cookingDurationMs, inventoryCount, previewCooking, type DishInstance, type IngredientId, type IngredientSelection, type MetaState, type RecipeDefinition } from '../../domain/meta';
import { cookingRemainingMs, type CookingJob } from '../../domain/cookingJobs';
import type { Quality } from '../../domain/v2';
import type { Screen } from '../../store';
import { GameButton, GameDialog, ItemIcon, type ItemIconName } from '../index';
import { worldNavigationItems } from '../WorldNavigation';
import { assetUrl } from '../assets';
import { dishPresentation } from '../dishes';
import { DishArt } from '../DishArt';
import { amountsForSlot, cookingClock, emptyKitchenSlots, ingredientQuantity, maximumQualityAmount, placeIngredient, recipeMissingIngredients, remainingForSelection, selectedIngredients, slotQuantity, slotsForIngredients, type KitchenSlots, type QualityAmounts } from './selection';
import './kitchen.css';

const qualityNames: Record<Quality, string> = { Broken: '破损', Normal: '普通', High: '优质', Top: '极品' };
const ingredientIcon = (id: string): ItemIconName => id === 'ing_corn' ? 'corn' : id === 'ing_carrot' ? 'carrot' : id === 'ing_cabbage' ? 'cabbage' : id === 'ing_tomato' ? 'tomato' : 'gem';
const ingredientName = (id: string) => INGREDIENTS.find(item => item.id === id)?.name ?? id;
const requirementsLabel = (recipe: RecipeDefinition) => Object.entries(recipe.requirements).map(([id, count]) => `${ingredientName(id)} ×${count}`).join(' + ');

interface IngredientPicker {
  slot: number;
  ingredient?: IngredientId;
  amounts: QualityAmounts;
}

/** The art is a backplate only; resources, recipe requirements and controls are live. */
function ReferenceArt({ crop, className = '' }: { crop: [number, number, number, number]; className?: string }) {
  const [x, y, width, height] = crop;
  return <span aria-hidden="true" className={`kitchen-source-art ${className}`} style={{
    backgroundSize: `${1080 / width * 100}% ${1920 / height * 100}%`,
    backgroundPosition: `${x / (1080 - width) * 100}% ${y / (1920 - height) * 100}%`,
  }} />;
}

export interface KitchenWorkbenchProps {
  meta: MetaState;
  cookingJob: CookingJob | null;
  go: (screen: Screen) => void;
  startCooking: (recipeId: string, items: IngredientSelection[]) => Promise<boolean>;
  claimCooking: (jobId: string) => Promise<boolean>;
  saving?: boolean;
  saveIssue?: string | null;
}

export function KitchenRecipeOptions({ meta, selectedId, onSelect }: { meta: MetaState; selectedId: string | null; onSelect: (recipe: RecipeDefinition) => void }) {
  return <div className="kitchen-recipe-options">{RECIPES.map(recipe => {
    const missing = recipeMissingIngredients(meta, recipe);
    return <button type="button" key={recipe.id} data-testid={`recipe-${recipe.id}`} className={`kitchen-recipe-option ${selectedId === recipe.id ? 'is-selected' : ''}`} disabled={missing.length > 0} aria-pressed={selectedId === recipe.id} onClick={() => onSelect(recipe)}>
      <DishArt dishId={recipe.outputDishId} />
      <span><b>{recipe.name}</b><span className="kitchen-recipe-requirements">{requirementsLabel(recipe)}</span><small className={missing.length ? 'is-missing' : 'is-available'}>{missing.length ? `缺少 ${missing.map(item => `${ingredientName(item.ingredientId)} ×${item.count}`).join('、')}` : selectedId === recipe.id ? '当前目标' : '食材充足 · 选择菜谱'}</small></span>
    </button>;
  })}</div>;
}

export function KitchenQuantityStepper({ label, count, maximum, onChange }: { label: string; count: number; maximum: number; onChange: (count: number) => void }) {
  return <div className="kitchen-quantity-stepper" aria-label={`${label}数量`}>
    <button type="button" aria-label={`减少${label}`} disabled={count <= 0} onClick={() => onChange(Math.max(0, count - 1))}>−</button>
    <output aria-label={`${label}已选数量`}>{count}</output>
    <button type="button" aria-label={`增加${label}`} disabled={count >= maximum} onClick={() => onChange(Math.min(maximum, count + 1))}>＋</button>
  </div>;
}

function IngredientEditor({ meta, slots, recipe, picker, onChange }: { meta: MetaState; slots: KitchenSlots; recipe: RecipeDefinition; picker: IngredientPicker; onChange: (next: IngredientPicker) => void }) {
  const availableIngredients = INGREDIENTS.filter(item => recipe.requirements[item.id] && inventoryCount(meta, item.id) > 0 && !slots.some((slot, index) => index !== picker.slot && slot?.ingredientId === item.id));
  if (!picker.ingredient) return <div className="kitchen-picker-ingredients">{availableIngredients.map(ingredient => <button type="button" key={ingredient.id} onClick={() => onChange({ ...picker, ingredient: ingredient.id, amounts: {} })}>
    <ItemIcon name={ingredientIcon(ingredient.id)} size={46} /><span><b>{ingredient.name}</b><small>本菜谱需要 ×{recipe.requirements[ingredient.id]}</small></span>
  </button>)}{availableIngredients.length === 0 && <p>所需食材已放入槽中，点击对应食材即可调整数量。</p>}</div>;
  const id = picker.ingredient;
  const total = Object.values(picker.amounts).reduce((sum, amount) => sum + amount, 0);
  return <div className="kitchen-ingredient-editor">
    <div className="kitchen-editor-heading"><ItemIcon name={ingredientIcon(id)} size={44} /><span><b>{ingredientName(id)}</b><small>本菜谱需要 ×{recipe.requirements[id]} · 已选 ×{total}</small></span></div>
    {[...QUALITY_ORDER].reverse().filter(quality => inventoryCount(meta, id, quality) > 0 || (picker.amounts[quality] ?? 0) > 0).map(quality => {
      const available = remainingForSelection(meta, slots, id, quality, picker.slot);
      const maximum = maximumQualityAmount(meta, slots, recipe, picker.slot, id, quality, picker.amounts);
      return <div className="kitchen-quality-row" key={quality}>
        <span><b>{qualityNames[quality]}</b><small>可用 {available}</small></span>
        <KitchenQuantityStepper label={`${ingredientName(id)}${qualityNames[quality]}`} count={picker.amounts[quality] ?? 0} maximum={maximum} onChange={count => onChange({ ...picker, amounts: { ...picker.amounts, [quality]: count } })} />
      </div>;
    })}
    <p className="kitchen-picker-note">可混合不同品质。确认仅配菜，开始烹饪才扣除食材。</p>
    <button className="kitchen-change-ingredient" type="button" onClick={() => onChange({ ...picker, ingredient: undefined, amounts: {} })}>选择其他食材</button>
  </div>;
}

export function KitchenWorkbench({ meta, cookingJob, go, startCooking, claimCooking, saving = false, saveIssue }: KitchenWorkbenchProps) {
  const [slots, setSlots] = useState(emptyKitchenSlots);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [picker, setPicker] = useState<IngredientPicker | null>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [hint, setHint] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<DishInstance | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const request = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current += 1; }; }, []);
  const busy = submitting || cookingJob !== null;
  const cookerCount = consumableCount(meta, 'upgrade_jelly_cooker');
  const remaining = cookingJob ? cookingRemainingMs(cookingJob, now) : cookingDurationMs(meta);
  const ready = cookingJob !== null && remaining === 0;
  const recipe = RECIPES.find(item => item.id === (cookingJob?.recipeId ?? recipeId)) ?? null;
  const displayedSlots = cookingJob ? slotsForIngredients(cookingJob.ingredients) : slots;
  const preview = previewCooking(meta, selectedIngredients(slots));
  const canStart = !busy && !saving && !saveIssue && recipe !== null && preview.canCook && preview.recipe.id === recipe.id;
  const pantry = INGREDIENTS.filter(item => inventoryCount(meta, item.id) > 0);
  const confirmedSlots = picker?.ingredient && recipe ? placeIngredient(meta, slots, picker.slot, recipe, picker.ingredient, picker.amounts) : slots;
  const canConfirm = !!picker && confirmedSlots !== slots && !busy;

  useEffect(() => {
    if (!cookingJob) return;
    // A task can also arrive from another tab. Do not leave an editable picker
    // open after the authoritative save has assigned this kitchen a job.
    setPicker(null); setRecipesOpen(false); setSlots(emptyKitchenSlots()); setRecipeId(null);
  }, [cookingJob?.id]);

  useEffect(() => {
    if (!cookingJob) return;
    // The persisted finish time is authoritative. The interval only refreshes text.
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 250);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [cookingJob?.id, cookingJob?.finishAt]);

  const chooseRecipe = (next: RecipeDefinition) => {
    if (busy || recipeMissingIngredients(meta, next).length) return;
    setRecipeId(next.id); setSlots(emptyKitchenSlots()); setRecipesOpen(false); setPicker(null);
    setHint(`已选择${next.name}，按配方放入食材。`);
  };
  const openIngredient = (id?: IngredientId, requestedSlot?: number) => {
    if (busy) return;
    if (!recipe) { setRecipesOpen(true); setHint('先选择菜谱，再按需要添加食材。'); return; }
    if (id && !recipe.requirements[id]) { setHint(`${recipe.name}不需要${ingredientName(id)}，可点菜谱牌更换目标。`); return; }
    const existingIndex = id ? slots.findIndex(item => item?.ingredientId === id) : -1;
    const index = existingIndex >= 0 ? existingIndex : requestedSlot ?? slots.findIndex(item => item === null);
    if (index < 0) { setHint('三个食材槽已满，点击已放入的食材调整。'); return; }
    const current = slots[index];
    setPicker({ slot: index, ingredient: id ?? current?.ingredientId, amounts: amountsForSlot(current) }); setHint('');
  };
  const confirmIngredient = () => {
    if (!canConfirm) return;
    setSlots(confirmedSlots); setPicker(null); setHint('');
  };
  const start = async () => {
    if (lock.current || !canStart || !recipe) return;
    lock.current = true; setSubmitting(true); setHint('');
    const version = ++request.current;
    try {
      const success = await startCooking(recipe.id, selectedIngredients(slots));
      if (!alive.current || version !== request.current) return;
      if (success) { setSlots(emptyKitchenSlots()); setRecipeId(null); setNow(Date.now()); }
      else setHint('未能开始烹饪，配料已保留，请检查库存和存档后重试。');
    } catch { if (alive.current && version === request.current) setHint('烹饪未成功，请稍后重试。'); }
    finally { if (alive.current && version === request.current) { setSubmitting(false); lock.current = false; } }
  };
  const claim = async () => {
    if (lock.current || !cookingJob || !ready || saving || saveIssue) return;
    const completedJob = cookingJob;
    lock.current = true; setSubmitting(true); setHint('');
    const version = ++request.current;
    try {
      const success = await claimCooking(completedJob.id);
      if (!alive.current || version !== request.current) return;
      if (success) { setResult({ ...completedJob.dish }); setSlots(emptyKitchenSlots()); setRecipeId(null); }
      else setHint('领取未完成，请检查存档状态后重试。');
    } catch { if (alive.current && version === request.current) setHint('领取未成功，请稍后重试。'); }
    finally { if (alive.current && version === request.current) { setSubmitting(false); lock.current = false; } }
  };

  return <section className="kitchen-workbench" data-testid="workshop-kitchen" aria-label="厨房烹饪工作台">
    <div className={`kitchen-scene ${cookingJob && !ready ? 'is-cooking' : ''} ${ready ? 'is-ready' : ''}`}>
      <img className="kitchen-backplate" src={assetUrl('assets/ui-kit/kitchen/kitchen-backplate.png')} alt="" draggable={false} />
      <div className="kitchen-wallet" aria-label={`金币 ${meta.coins}`}><strong>{meta.coins.toLocaleString('zh-CN')}</strong></div>
      <button type="button" className="kitchen-wallet-add kitchen-hotspot" aria-label="前往菜架赚取金币" onClick={() => go('sales')} />
      <button type="button" className="kitchen-settings kitchen-hotspot kitchen-shelf-entry" aria-label="打开菜架" data-testid="kitchen-shelf-entry" onClick={() => go('sales')}>
        <svg viewBox="0 0 48 40" aria-hidden="true"><path d="M6 8v27M42 8v27M5 19h38M5 34h38M10 15h10m8 0h10M13 29h22" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M10 15a5 5 0 0 1 10 0m8 0a5 5 0 0 1 10 0M14 29a10 10 0 0 1 20 0" fill="currentColor"/></svg><span>菜架</span>
      </button>
      <h1 className="kitchen-sr-only">厨房</h1>
      <div className="kitchen-time" aria-label={`烹饪时间 ${cookingClock(remaining)}`}><time>{cookingClock(remaining)}</time></div>
      <button type="button" className={`kitchen-recipe-target kitchen-hotspot ${recipe ? 'has-recipe' : ''}`} aria-label={recipe ? `菜谱目标：${recipe.name}，${requirementsLabel(recipe)}` : '菜谱目标：选择菜谱'} onClick={() => setRecipesOpen(true)} disabled={busy}>
        {recipe ? <><b>{recipe.name}</b>{Object.entries(recipe.requirements).map(([id, amount]) => <small key={id} className={ingredientQuantity(displayedSlots, id as IngredientId) >= amount ? 'is-complete' : ''}>{ingredientName(id)} {ingredientQuantity(displayedSlots, id as IngredientId)}/{amount}</small>)}</> : <><ReferenceArt crop={[867, 610, 165, 113]} /><b>选择菜谱</b></>}
      </button>
      <button type="button" className="kitchen-start kitchen-hotspot" data-testid="cook-submit" onClick={() => { void (ready ? claim() : start()); }} disabled={ready ? submitting || saving || !!saveIssue : !canStart} aria-busy={submitting}>
        {submitting ? '正在保存' : ready ? '领取料理' : cookingJob ? '烹饪中…' : '开始烹饪'}
      </button>
      {cookingJob && <div className="kitchen-task-status" role="status">{ready ? '料理已完成，点击领取' : '离开厨房也会继续烹饪'}</div>}
      {!cookingJob && cookerCount > 0 && <div className="kitchen-task-status" data-testid="cooker-stock">快煮器 ×{cookerCount} · 本锅自动消耗1个</div>}
      <div className="kitchen-slots" aria-label="待烹饪食材">
        {displayedSlots.map((item, index) => <button type="button" key={index} className={`kitchen-slot kitchen-hotspot ${item ? 'is-filled' : ''}`} data-testid={`kitchen-slot-${index}`} disabled={busy}
          aria-label={item ? `食材槽 ${index + 1}：${ingredientName(item.ingredientId)} ×${slotQuantity(item)}，${item.items.map(stack => `${qualityNames[stack.quality]} ×${stack.count}`).join('、')}，点击调整或移除` : `食材槽 ${index + 1}：放食材`} onClick={() => openIngredient(undefined, index)}>
          {item ? <><ItemIcon name={ingredientIcon(item.ingredientId)} /><b>{ingredientName(item.ingredientId)}</b><small>{item.items.length > 1 ? '混合品质' : qualityNames[item.items[0].quality]} ×{slotQuantity(item)}</small></> : <ReferenceArt crop={[173, 950, 193, 166]} />}
        </button>)}
      </div>
      <div className="kitchen-pantry" aria-label="现有食材">
        {pantry.map(item => <button className="kitchen-pantry-item kitchen-hotspot" type="button" key={item.id} disabled={busy}
          data-testid={`pantry-${ingredientIcon(item.id)}`} aria-label={`${item.name}，库存 ${inventoryCount(meta, item.id)}，选择品质和数量`} onClick={() => openIngredient(item.id)}>
          <ItemIcon name={ingredientIcon(item.id)} /><span className="kitchen-stock">{inventoryCount(meta, item.id)}</span>
        </button>)}
        {pantry.length === 0 && <div className="kitchen-empty-pantry"><p>{cookingJob ? '食材已入锅，去收集下一份吧' : '背包里还没有食材'}</p><GameButton variant="wood" onClick={() => go('stages')}>去探险</GameButton></div>}
      </div>
      {meta.pendingDishes.length > 0 && <button type="button" className="kitchen-sales-link kitchen-hotspot" onClick={() => go('sales')} data-testid="kitchen-sales">菜架 · {meta.pendingDishes.length} 道</button>}
      {(hint || saveIssue) && <div className="kitchen-hint" role="status" onClick={() => setHint('')}>{saveIssue || hint}</div>}
      {cookingJob && !ready && <div className="kitchen-pot-animation" key={cookingJob.id} aria-label="食材正在烹饪">{cookingJob.ingredients.map((item, index) => <span key={index} style={{ '--flight': index } as CSSProperties}><ItemIcon name={ingredientIcon(item.ingredientId)} /></span>)}</div>}
      <nav className="kitchen-navigation" aria-label="游戏导航">
        {worldNavigationItems.map(item => <button type="button" className="kitchen-hotspot" key={item.id} aria-label={item.label} aria-current={item.id === 'kitchen' ? 'page' : undefined} data-testid={`nav-${item.id}`} onClick={() => go(item.id)} />)}
      </nav>
    </div>

    <GameDialog open={picker !== null} onClose={() => setPicker(null)} title="放入食材" actions={<div className="kitchen-picker-actions">
      <GameButton data-testid="ingredient-confirm" onClick={confirmIngredient} disabled={!canConfirm}>确定</GameButton>
      {picker && slots[picker.slot] && <GameButton variant="wood" disabled={busy} onClick={() => { setSlots(current => current.map((item, index) => index === picker.slot ? null : item)); setPicker(null); }}>移除食材</GameButton>}
      <GameButton variant="wood" onClick={() => { setPicker(null); go('stages'); }}>去探险</GameButton>
    </div>}>
      {picker && recipe && <IngredientEditor meta={meta} slots={slots} recipe={recipe} picker={picker} onChange={setPicker} />}
    </GameDialog>
    <GameDialog open={recipesOpen} onClose={() => setRecipesOpen(false)} title="菜谱目标">
      <p>先选择菜谱，再按数量配菜。食材充足即可选择，每锅制作一道料理。</p>
      <KitchenRecipeOptions meta={meta} selectedId={recipe?.id ?? null} onSelect={chooseRecipe} />
    </GameDialog>
    <GameDialog open={result !== null} onClose={() => setResult(null)} title="料理已领取！" actions={<><GameButton variant="wood" onClick={() => setResult(null)}>继续烹饪</GameButton><GameButton onClick={() => { setResult(null); go('sales'); }}>前往菜架</GameButton></>}>
      {result && <div className="kitchen-dish-result" data-testid="cooking-presentation"><DishArt dishId={result.dishId} /><h2>{dishPresentation(result.dishId).name}</h2><p>{qualityNames[result.quality]} · 售价 {result.sellPrice} 金币</p><p>料理已放入菜架</p></div>}
    </GameDialog>
  </section>;
}
