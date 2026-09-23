import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame, type Screen } from './store';
import {
  INGREDIENTS,
  RECIPES,
  SHOP_ITEMS,
  dishPrice,
  dishQuality,
  type IngredientId,
  type IngredientSelection,
  type MetaState,
  type ShopItemDefinition,
} from './domain/meta';
import type { Quality } from './domain/v2';
import './workshop.css';

export type WorkshopScreen = Screen;
type GameState = ReturnType<typeof useGame.getState>;
const useWorkshopStore = useGame;
const getWorkshopState = useGame.getState;
const QUALITY_LABEL: Record<Quality, string> = {
  Broken: '破损',
  Normal: '普通',
  High: '优质',
  Top: '极品',
};
const QUALITY_SHORT: Record<Quality, string> = {
  Broken: '破',
  Normal: '普',
  High: '优',
  Top: '极',
};
const QUALITY_CLASS: Record<Quality, string> = {
  Broken: 'broken',
  Normal: 'normal',
  High: 'high',
  Top: 'top',
};
const INGREDIENT_ICON: Record<IngredientId, 'corn' | 'jelly'> = {
  ing_corn: 'corn',
  ing_jelly: 'jelly',
};
function iconForIngredient(id: string): 'corn' | 'jelly' {
  return id.includes('jelly') ? 'jelly' : 'corn';
}
const DISH_INFO: Record<string, { name: string; icon: 'toast' | 'pudding' | 'combo' }> = {
  dish_corn_toast: { name: '烤玉米片', icon: 'toast' },
  dish_jelly_pudding: { name: '果冻布丁', icon: 'pudding' },
  dish_corn_jelly: { name: '玉米果冻盅', icon: 'combo' },
};

function Icon({ name, size = 18 }: { name: 'arrow' | 'back' | 'pan' | 'bag' | 'book' | 'shop' | 'sword' | 'coin' | 'spark'; size?: number }) {
  const paths: Record<string, ReactNode> = {
    arrow: <path d="M4 12h14m-6-6 6 6-6 6" />,
    back: <path d="m14 5-7 7 7 7M8 12h12" />,
    pan: <path d="M5 10h10a3 3 0 0 1 0 6H7a4 4 0 0 1-4-4V8m13 5h4M8 6h.01M12 6h.01" />,
    bag: <path d="M6 8h12l1 11H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2" />,
    book: <path d="M5 4h10a3 3 0 0 1 3 3v12H8a3 3 0 0 0-3 0V4Zm0 0v15m3-11h6m-6 4h5" />,
    shop: <path d="M4 9h16l-1-5H5L4 9Zm1 0v10h14V9M9 19v-5h6v5M3 9h18" />,
    sword: <path d="m15 4 5 5M4 20l8.5-8.5m-3-3L14 4l3 3-4.5 4.5M8 13l3 3m-5 4h4" />,
    coin: <circle cx="12" cy="12" r="8" />,
    spark: <path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Zm6 14 .7 2.3L21 19l-2.3.7L18 22l-.7-2.3L15 19l2.3-.7L18 16Z" />,
  };
  return <svg className="ws-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Sprite({ name, label }: { name: 'corn' | 'jelly' | 'toast' | 'pudding' | 'combo' | 'locked'; label?: string }) {
  return <span className={`ws-sprite ws-sprite--${name}`} aria-label={label} role={label ? 'img' : undefined} />;
}

function qualityRank(value: Quality): number {
  return ['Broken', 'Normal', 'High', 'Top'].indexOf(value);
}

function formatPrice(value: number): string {
  return value.toLocaleString('zh-CN');
}

function availableCount(meta: MetaState, ingredientId: IngredientId, quality?: Quality): number {
  return meta.inventory
    .filter(stack => stack.ingredientId === ingredientId && (!quality || stack.quality === quality))
    .reduce((sum, stack) => sum + stack.count, 0);
}

function qualityBadge(quality: Quality, compact = false) {
  return <span className={`ws-quality ws-quality--${QUALITY_CLASS[quality]}`}>{compact ? QUALITY_SHORT[quality] : QUALITY_LABEL[quality]}</span>;
}

function ActionButton({ children, onClick, disabled, variant = 'primary', testId, ariaLabel, mutates = false }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'quiet' | 'danger'; testId?: string; ariaLabel?: string; mutates?: boolean }) {
  const operationsBlocked = useGame(state => state.saving || Boolean(state.saveIssue));
  return <button type="button" data-testid={testId} aria-label={ariaLabel} className={`ws-button ws-button--${variant}`} onClick={onClick} disabled={disabled || (mutates && operationsBlocked)}>{children}</button>;
}

export function WorkshopNav({ active }: { active?: WorkshopScreen } = {}) {
  const state = useWorkshopStore(value => value);
  const requested = active ?? state.screen;
  const current = requested === 'kitchen' || requested === 'sales' ? 'restaurant' : requested;
  const go = (screen: WorkshopScreen) => state.go(screen);
  const items: Array<{ id: WorkshopScreen; label: string; icon: 'pan' | 'sword' | 'bag' | 'book' | 'shop'; testId: string }> = [
    { id: 'restaurant', label: '餐厅', icon: 'pan', testId: 'nav-restaurant' },
    { id: 'stages', label: '探险', icon: 'sword', testId: 'nav-stages' },
    { id: 'inventory', label: '仓库', icon: 'bag', testId: 'nav-inventory' },
    { id: 'cookbook', label: '图鉴', icon: 'book', testId: 'nav-cookbook' },
    { id: 'shop', label: '商店', icon: 'shop', testId: 'nav-shop' },
  ];
  return <nav className="ws-nav" aria-label="局外导航"><span className="ws-nav-caption">WORKSHOP</span>{items.map((item, index) => <button type="button" key={item.id} data-testid={item.testId} data-nav-index={index + 1} className={current === item.id ? 'is-active' : ''} aria-current={current === item.id ? 'page' : undefined} onClick={() => go(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span><small>0{index + 1}</small></button>)}</nav>;
}

function Notice({ notice, clearNotice, saving, saveIssue }: Pick<GameState, 'notice' | 'clearNotice' | 'saving' | 'saveIssue'>) {
  if (!notice && !saving && !saveIssue) return null;
  return <div className={`ws-notice ${notice?.kind === 'error' || saveIssue ? 'is-error' : 'is-success'}`} role="status">
    <span>{saving ? '正在保存…' : saveIssue ? saveIssue : notice?.message}</span>
    {!saving && <button type="button" aria-label="关闭提示" onClick={clearNotice}>×</button>}
  </div>;
}

function PageHeading({ eyebrow, title, subtitle, back, backLabel = '返回餐厅', onBack }: { eyebrow: string; title: string; subtitle?: string; back?: boolean; backLabel?: string; onBack?: () => void }) {
  return <header className="ws-heading">
    {back && <button type="button" className="ws-back" onClick={onBack} aria-label={backLabel}><Icon name="back" size={22} /></button>}
    <div className="ws-heading-copy"><p className="ws-eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle && <p className="ws-subtitle">{subtitle}</p>}</div><span className="ws-heading-mark" aria-hidden="true" />
  </header>;
}

function CoinPill({ coins }: { coins: number }) {
  return <div className="ws-coins" aria-label={`金币 ${coins}`}><Icon name="coin" size={17} /><strong>{formatPrice(coins)}</strong><span>金币</span></div>;
}

function IngredientCard({ ingredientId, stackCount, onClick }: { ingredientId: IngredientId; stackCount: number; onClick?: () => void }) {
  const info = INGREDIENTS.find(entry => entry.id === ingredientId)!;
  const content = <><Sprite name={INGREDIENT_ICON[ingredientId]} label={info.name} /><div><strong>{info.name}</strong><span>{stackCount} 份</span></div></>;
  return onClick ? <button type="button" className="ws-item-card ws-item-card--button" onClick={onClick}>{content}</button> : <div className="ws-item-card">{content}</div>;
}

function Restaurant({ meta, go }: { meta: MetaState; go: (screen: WorkshopScreen) => void }) {
  const ingredientCount = meta.inventory.reduce((sum, item) => sum + item.count, 0);
  return <section className="ws-screen ws-screen--restaurant" data-testid="workshop-restaurant">
    <div className="ws-topbar"><div className="ws-brand"><span className="ws-brand-mark">BV</span><span>BLADE <em>VERDICT</em></span></div><CoinPill coins={meta.coins} /></div>
    <div className="ws-restaurant-hero"><div className="ws-hero-seal" aria-hidden="true"><span>BV</span><i /></div><p className="ws-eyebrow">深渊餐厅 · 今夜营业</p><h1>把战利品，<br /><em>做成传说。</em></h1><p>精准招架，收集食材，以一桌热气腾腾的料理换取下一场冒险。</p><ActionButton testId="explore" onClick={() => go('stages')}>前往探险 <Icon name="arrow" size={19} /></ActionButton></div>
    <div className="ws-quick-grid"><button className="ws-quick-card" type="button" onClick={() => go('kitchen')}><span className="ws-quick-index">01</span><span className="ws-quick-icon"><Icon name="pan" size={24} /></span><span><b>厨房</b><small>{ingredientCount ? `${ingredientCount} 份食材可用` : '等待新鲜食材'}</small></span><Icon name="arrow" size={17} /></button><button className="ws-quick-card" type="button" onClick={() => go('sales')}><span className="ws-quick-index">02</span><span className="ws-quick-icon ws-quick-icon--gold"><Icon name="shop" size={24} /></span><span><b>菜架</b><small>{meta.pendingDishes.length ? `${meta.pendingDishes.length} 道料理待售` : '还没有待售料理'}</small></span><Icon name="arrow" size={17} /></button></div>
    <div className="ws-restaurant-footer"><span><Icon name="spark" size={15} /> 今日营业</span><span>第 1 章 · 荒芜农场</span></div><WorkshopNav active="restaurant" />
  </section>;
}

function ingredientQualityChoices(meta: MetaState, ingredientId: IngredientId): Quality[] {
  return meta.inventory.filter(stack => stack.ingredientId === ingredientId && stack.count > 0).map(stack => stack.quality).sort((a, b) => qualityRank(a) - qualityRank(b));
}

interface CookingPresentation {
  items: IngredientSelection[];
  dishId: string;
  name: string;
  quality: Quality;
  price: number;
}

function CookingPresentationModal({ presentation, onClose }: { presentation: CookingPresentation; onClose: () => void }) {
  const ingredientSummary = presentation.items.map(item => `${INGREDIENTS.find(entry => entry.id === item.ingredientId)?.name ?? item.ingredientId} ×${item.count}`).join('  ·  ');
  const ingredientParticles = presentation.items.flatMap(item => Array.from({ length: item.count }, () => item));
  return <div className="ws-cooking-modal" role="presentation">
    <div className="ws-cooking-modal__backdrop" onClick={onClose} />
    <section className="ws-cooking-modal__dialog" role="dialog" aria-modal="true" aria-live="polite" aria-label={`${presentation.name} 制作反馈`} data-testid="cooking-presentation" onClick={event => event.stopPropagation()}>
      <header className="ws-cooking-modal__header">
        <div><span className="ws-panel-kicker">CRAFTING MOMENT</span><strong>料理制作完成</strong></div>
        <button type="button" className="ws-cooking-modal__close" onClick={onClose} aria-label="关闭料理制作反馈">×</button>
      </header>
      <div className="ws-cooking-modal__stage">
        <div className="ws-cooking-modal__orbit ws-cooking-modal__orbit--outer" aria-hidden="true" />
        <div className="ws-cooking-modal__orbit ws-cooking-modal__orbit--inner" aria-hidden="true" />
        <div className="ws-cooking-modal__ingredients" aria-hidden="true">
          {ingredientParticles.map((item, index) => {
            const angle=(index/Math.max(1,ingredientParticles.length))*Math.PI*2-.7;
            const radius=84+(index%3)*22;
            const style={ '--cook-index': index, '--cook-count': ingredientParticles.length, '--cook-start-x': `${Math.cos(angle)*radius}px`, '--cook-start-y': `${Math.sin(angle)*radius*.62}px`, '--cook-delay': `${index*72}ms` } as React.CSSProperties;
            return <span key={`${item.ingredientId}-${index}`} style={style}><Sprite name={iconForIngredient(item.ingredientId)} /></span>;
          })}
        </div>
        <div className="ws-cooking-modal__pot" aria-hidden="true"><i /><Icon name="pan" size={76} /><b>入锅</b></div>
        <div className="ws-cooking-modal__steam" aria-hidden="true"><i /><i /><i /></div>
        <div className="ws-cooking-modal__result">
          <span className="ws-cooking-modal__result-glow" aria-hidden="true" />
          <Sprite name={DISH_INFO[presentation.dishId]?.icon ?? 'locked'} label={presentation.name} />
          <span className="ws-panel-kicker">READY TO SERVE</span>
          <strong>{presentation.name}</strong>
          <div>{qualityBadge(presentation.quality)} <span className="ws-cooking-modal__price">{formatPrice(presentation.price)} ◈</span></div>
        </div>
      </div>
      <div className="ws-cooking-modal__copy">
        <span className="ws-cooking-modal__phase ws-cooking-modal__phase--input">食材投入锅中 · 火候稳定</span>
        <span className="ws-cooking-modal__phase ws-cooking-modal__phase--done">料理已做好 · 已放入待售菜架</span>
        <small>{ingredientSummary}</small>
      </div>
      <button type="button" className="ws-button ws-button--quiet ws-cooking-modal__confirm" onClick={onClose}>继续</button>
    </section>
  </div>;
}

function Kitchen({ meta, go, cook }: { meta: MetaState; go: (screen: WorkshopScreen) => void; cook: (selected: IngredientSelection[]) => Promise<boolean> | boolean }) {
  const [recipeId, setRecipeId] = useState(RECIPES[0].id);
  const [qualities, setQualities] = useState<Record<IngredientId, Quality | undefined>>({ ing_corn: undefined, ing_jelly: undefined });
  const [cooking, setCooking] = useState(false);
  const [presentation,setPresentation]=useState<CookingPresentation|null>(null);
  const cookingLock=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{
    if(!presentation)return;
    const timer=window.setTimeout(()=>setPresentation(null),3600);
    return()=>window.clearTimeout(timer);
  },[presentation]);
  const recipe = RECIPES.find(item => item.id === recipeId) ?? RECIPES[0];
  const requirements = Object.entries(recipe.requirements) as [IngredientId, number][];
  const canCook = requirements.every(([ingredientId, count]) => {
    const quality = qualities[ingredientId];
    return Boolean(quality && availableCount(meta, ingredientId, quality) >= count);
  });
  const selected = requirements.reduce<IngredientSelection[]>((entries, [ingredientId, count]) => {
    const quality = qualities[ingredientId];
    if (quality && availableCount(meta, ingredientId, quality) >= count) entries.push({ ingredientId, quality, count });
    return entries;
  }, []);
  const price = selected.length === requirements.length ? dishPrice(selected, recipe) : null;
  const hasIngredients = requirements.every(([id, count]) => availableCount(meta, id) >= count);
  const runCook = () => {
    const state = getWorkshopState();
    if (!canCook || state.saving || state.saveIssue || cookingLock.current) return;
    cookingLock.current=true;
    const snapshot:CookingPresentation={items:selected.map(item=>({...item})),dishId:recipe.outputDishId,name:recipe.name,quality:dishQuality(selected),price:dishPrice(selected,recipe)};
    setCooking(true);
    void Promise.resolve().then(()=>cook(snapshot.items)).then(success=>{
      if(success&&alive.current)setPresentation(snapshot);
    }).catch(()=>undefined).finally(()=>{
      cookingLock.current=false;if(alive.current)setCooking(false);
    });
  };
  return <section className="ws-screen ws-screen--kitchen" data-testid="workshop-kitchen"><div className="ws-content">
    <PageHeading eyebrow="THE KITCHEN" title="厨房" subtitle="选择食材品质，烹调一份值得端上桌的料理。" back onBack={() => go('restaurant')} />
    <div className="ws-recipe-layout"><div className="ws-panel ws-recipes-panel"><div className="ws-panel-heading"><div><span className="ws-panel-kicker">RECIPE BOOK</span><h2>选择食谱</h2></div><span className="ws-count">{RECIPES.length} 道基础配方</span></div><div className="ws-recipe-list">{RECIPES.map(item => { const dish = DISH_INFO[item.outputDishId]; const unlocked = meta.unlockedRecipeIds.includes(item.id); return <button type="button" key={item.id} className={`ws-recipe-card ${recipe.id === item.id ? 'is-selected' : ''}`} onClick={() => { setRecipeId(item.id); setQualities({ ing_corn: undefined, ing_jelly: undefined }); }}><Sprite name={dish?.icon ?? 'locked'} /><span><b>{item.name}</b><small>{unlocked ? '已掌握 · ' : '待解锁 · '}{Object.keys(item.requirements).length} 种食材</small></span><Icon name="arrow" size={17} /></button>; })}</div></div>
      <div className={`ws-panel ws-cook-panel ${cooking ? 'is-cooking' : ''}`}><div className="ws-panel-heading"><div><span className="ws-panel-kicker">PREPARE</span><h2>{recipe.name}</h2></div><span className="ws-recipe-price">{price === null ? '—' : `预估售价 ${formatPrice(price)}`} <span>◈</span></span></div><div className="ws-recipe-requirements">{requirements.map(([ingredientId, count]) => { const choices = ingredientQualityChoices(meta, ingredientId); const selectedQuality = qualities[ingredientId]; const name = INGREDIENTS.find(item => item.id === ingredientId)?.name ?? ingredientId; return <div className="ws-requirement" key={ingredientId}><div className="ws-requirement-title"><Sprite name={INGREDIENT_ICON[ingredientId]} /><span><b>{name}</b><small>需要 ×{count}</small></span></div><div className="ws-quality-options">{choices.length ? choices.map(quality => <button type="button" key={quality} aria-label={`${name} ${QUALITY_LABEL[quality]}，库存 ${availableCount(meta, ingredientId, quality)} 份`} aria-pressed={selectedQuality === quality} className={`ws-quality-option ${selectedQuality === quality ? 'is-selected' : ''}`} onClick={() => setQualities(current => ({ ...current, [ingredientId]: quality }))}>{qualityBadge(quality, true)}<small>{availableCount(meta, ingredientId, quality)}份</small></button>) : <span className="ws-empty-inline">缺少食材</span>}</div></div>; })}</div><div className="ws-cook-summary"><div><span>成品品质</span><strong>{selected.length === requirements.length ? qualityBadge(dishQuality(selected)) : '待选择'}</strong></div><div><span>消耗食材</span><strong>{selected.length}/{requirements.length} 项</strong></div><ActionButton mutates testId="cook-submit" onClick={runCook} disabled={!canCook || cooking}><Icon name="pan" size={17} /> {cooking ? '入锅中…' : '开始烹调'}</ActionButton></div></div></div>
    <div className="ws-kitchen-next">{!hasIngredients && <div><span>缺少配方所需食材，下一场探险会有新收获。</span><ActionButton variant="quiet" testId="kitchen-explore" onClick={() => go('stages')}>去探险 <Icon name="arrow" size={16} /></ActionButton></div>}{meta.pendingDishes.length > 0 && <div><span>{meta.pendingDishes.length} 道料理已经做好，出售后可获得金币。</span><ActionButton testId="kitchen-sales" onClick={() => go('sales')}>查看菜架 <Icon name="arrow" size={16} /></ActionButton></div>}</div>
    <p className="ws-help"><span>TIP</span> 探险带回的食材按品质分组保存；料理品质取决于最低品质的那份食材。</p>
  </div>{presentation && <CookingPresentationModal presentation={presentation} onClose={() => setPresentation(null)} />}<WorkshopNav active="kitchen" /></section>;
}

function Inventory({ meta, go }: { meta: MetaState; go: (screen: WorkshopScreen) => void }) {
  const [tab, setTab] = useState<'ingredients' | 'equipment'>('ingredients');
  const grouped = INGREDIENTS.map(ingredient => ({ ingredient, stacks: meta.inventory.filter(stack => stack.ingredientId === ingredient.id).sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality)) })).filter(group => group.stacks.length);
  return <section className="ws-screen ws-screen--inventory" data-testid="workshop-inventory"><div className="ws-content"><PageHeading eyebrow="PANTRY & LOCKER" title="仓库" subtitle="战利品、装备与未来旅程的准备。" back onBack={() => go('restaurant')} /><div className="ws-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'ingredients'} className={tab === 'ingredients' ? 'is-active' : ''} onClick={() => setTab('ingredients')}><Icon name="bag" size={17} /> 食材 <span>{meta.inventory.reduce((sum, item) => sum + item.count, 0)}</span></button><button type="button" role="tab" aria-selected={tab === 'equipment'} className={tab === 'equipment' ? 'is-active' : ''} onClick={() => setTab('equipment')}><Icon name="sword" size={17} /> 装备 <span>{meta.purchasedShopItemIds.length}</span></button></div>{tab === 'ingredients' ? <div className="ws-inventory-groups">{grouped.length ? grouped.map(group => <article className="ws-inventory-group" key={group.ingredient.id}><div className="ws-group-title"><IngredientCard ingredientId={group.ingredient.id} stackCount={group.stacks.reduce((sum, stack) => sum + stack.count, 0)} /><span>{group.stacks.length} 种品质</span></div><div className="ws-stack-list">{group.stacks.map(stack => <div className="ws-stack-row" key={`${stack.ingredientId}-${stack.quality}`}><span className={`ws-quality-dot ws-quality-dot--${QUALITY_CLASS[stack.quality]}`} /><b>{QUALITY_LABEL[stack.quality]}</b><span className="ws-stack-bar"><i style={{ width: `${Math.min(100, stack.count * 14 + 10)}%` }} /></span><strong>× {stack.count}</strong></div>)}</div></article>) : <EmptyState icon="bag" title="仓库还是空的" text="前往探险，带回第一份食材吧。" action="去探险" onAction={() => go('stages')} />}</div> : <EquipmentPanel meta={meta} go={go} />}</div><WorkshopNav active="inventory" /></section>;
}

function EquipmentPanel({ meta, go }: { meta: MetaState; go: (screen: WorkshopScreen) => void }) {
  const owned = SHOP_ITEMS.filter(item => meta.purchasedShopItemIds.includes(item.id));
  return <div className="ws-equipment-layout"><div className="ws-equipped-card"><span className="ws-panel-kicker">CURRENT LOADOUT</span><h2>当前装备</h2><div className="ws-loadout-item"><span className="ws-loadout-icon"><Icon name="sword" size={27} /></span><div><b>{meta.equippedWeaponId ? (SHOP_ITEMS.find(item => item.id === meta.equippedWeaponId)?.name ?? '未知装备') : '基础厨刀'}</b><small>{meta.equippedWeaponId ? '裁决伤害加成已生效' : '没有额外加成'}</small></div></div><ActionButton mutates variant="quiet" disabled={!meta.equippedWeaponId} onClick={() => { void Promise.resolve(getWorkshopState().equipItem(null)).catch(() => undefined); }}>卸下装备</ActionButton></div><div className="ws-owned-card"><div className="ws-panel-heading"><div><span className="ws-panel-kicker">OWNED ITEMS</span><h2>已拥有</h2></div><ActionButton variant="quiet" onClick={() => go('shop')}>前往商店 <Icon name="arrow" size={16} /></ActionButton></div>{owned.length ? owned.map(item => <div className="ws-owned-row" key={item.id}><Icon name={item.category === 'weapon' ? 'sword' : 'spark'} size={20} /><span><b>{item.name}</b><small>{item.description}</small></span><span className="ws-owned-tag">已拥有</span></div>) : <EmptyState title="还没有装备" text="在商店购买第一把专属武器。" action="查看商店" onAction={() => go('shop')} />}</div></div>;
}

function Cookbook({ meta, go }: { meta: MetaState; go: (screen: WorkshopScreen) => void }) {
  return <section className="ws-screen ws-screen--cookbook" data-testid="workshop-cookbook"><div className="ws-content"><PageHeading eyebrow="THE ARCHIVE" title="料理图鉴" subtitle="每一道料理，都记录着你走过的战斗。" back onBack={() => go('restaurant')} /><div className="ws-cookbook-grid">{RECIPES.map(recipe => { const dish = DISH_INFO[recipe.outputDishId]; const unlocked = meta.unlockedRecipeIds.includes(recipe.id); const record = meta.dishRecords.find(item => item.dishId === recipe.outputDishId); return <article className={`ws-dish-card ${unlocked ? 'is-unlocked' : 'is-locked'}`} key={recipe.id}><div className="ws-dish-art"><Sprite name={unlocked ? (dish?.icon ?? 'toast') : 'locked'} />{!unlocked && <span className="ws-lock-label">未解锁</span>}</div><div className="ws-dish-info"><div><span className="ws-panel-kicker">{unlocked ? 'DISCOVERED' : 'UNKNOWN RECIPE'}</span><h2>{unlocked ? recipe.name : '???'}</h2></div>{unlocked ? <><p>{Object.entries(recipe.requirements).map(([id, count]) => `${INGREDIENTS.find(item => item.id === id)?.name ?? id} ×${count}`).join(' · ')}</p><div className="ws-dish-stats"><span>最佳 {record ? qualityBadge(record.bestQuality) : '—'}</span><span>制作 {record?.cookCount ?? 0} 次</span></div></> : <p className="ws-muted">制作一次后解锁详细记录</p>}</div></article>; })}</div><div className="ws-collection-note"><Icon name="book" size={19} /><span>已掌握 <b>{meta.unlockedRecipeIds.length}</b> / {RECIPES.length} 道配方</span><ActionButton variant="quiet" onClick={() => go('kitchen')}>去厨房制作 <Icon name="arrow" size={16} /></ActionButton></div></div><WorkshopNav active="cookbook" /></section>;
}

function Sales({ meta, go, sellDish, sellAllDishes }: { meta: MetaState; go: (screen: WorkshopScreen) => void; sellDish: (id: string) => Promise<boolean> | boolean; sellAllDishes: () => Promise<boolean> | boolean }) {
  const runSellAll = () => { void Promise.resolve(sellAllDishes()).catch(() => undefined); };
  return <section className="ws-screen ws-screen--sales" data-testid="workshop-sales"><div className="ws-content"><PageHeading eyebrow="THE COUNTER" title="菜架" subtitle="料理完成了。现在，把它们交给愿意付出金币的客人。" back onBack={() => go('restaurant')} />{meta.pendingDishes.length ? <><div className="ws-sales-toolbar"><div><span className="ws-panel-kicker">READY TO SERVE</span><strong>{meta.pendingDishes.length} 道料理</strong></div><ActionButton mutates variant="primary" testId="sell-all" onClick={runSellAll}><Icon name="coin" size={17} /> 全部出售 · {formatPrice(meta.pendingDishes.reduce((sum, dish) => sum + dish.sellPrice, 0))}</ActionButton></div><div className="ws-sales-grid">{meta.pendingDishes.map(dish => { const info = DISH_INFO[dish.dishId]; return <article className="ws-sale-card" key={dish.instanceId}><div className="ws-sale-art"><Sprite name={info?.icon ?? 'toast'} /></div><div className="ws-sale-copy"><span className="ws-panel-kicker">FRESHLY COOKED</span><h2>{info?.name ?? dish.dishId}</h2><div>{qualityBadge(dish.quality)} <span className="ws-price">{formatPrice(dish.sellPrice)} ◈</span></div></div><ActionButton mutates variant="quiet" testId={`sell-${dish.instanceId}`} onClick={() => { void Promise.resolve(sellDish(dish.instanceId)).catch(() => undefined); }}>出售</ActionButton></article>; })}</div></> : <EmptyState icon="shop" title="菜架还空着" text="用探险带回的食材烹调料理，完成后会在这里等待出售。" action="去厨房" onAction={() => go('kitchen')} />}</div><WorkshopNav active="sales" /></section>;
}

function Shop({ meta, go, buyItem, equipItem }: { meta: MetaState; go: (screen: WorkshopScreen) => void; buyItem: (id: string) => Promise<boolean> | boolean; equipItem: (id: string | null) => Promise<boolean> | boolean }) {
  const run = (task: () => Promise<boolean> | boolean) => { const state = getWorkshopState(); if (state.saving || state.saveIssue) return; void Promise.resolve(task()).catch(() => undefined); };
  const featured = SHOP_ITEMS.find(item => item.implemented) ?? SHOP_ITEMS[0];
  const previews = SHOP_ITEMS.filter(item => !item.implemented);
  const featuredOwned = meta.purchasedShopItemIds.includes(featured.id);
  const featuredEquipped = meta.equippedWeaponId === featured.id;
  const canBuyFeatured = meta.coins >= featured.cost && !featuredOwned;
  return <section className="ws-screen ws-screen--shop" data-testid="workshop-shop"><div className="ws-content"><PageHeading eyebrow="THE PROVISIONER" title="商店" subtitle="把战斗赚来的金币，换成更锋利的下一步。" back onBack={() => go('restaurant')} />
    <div className="ws-shop-balance"><div><span className="ws-panel-kicker">WALLET</span><strong>本次远征预算</strong></div><CoinPill coins={meta.coins} /><small>装备购买后可在战斗中使用；未开放物品不会影响当前规则。</small></div>
    <div className="ws-shop-showcase"><div className="ws-showcase-copy"><span className="ws-panel-kicker">RECOMMENDED LOADOUT</span><h2>一把更懂裁决的刀。</h2><p>把赚来的金币投入下一次关键切割。斩骨刀会在每次裁决结算时追加伤害。</p><div className="ws-showcase-points"><span><b>+{featured.verdictDamageBonus}</b>裁决伤害</span><span><b>{formatPrice(featured.cost)}</b>金币入手</span></div></div><ShopCard coins={meta.coins} featured item={featured} owned={featuredOwned} equipped={featuredEquipped} disabled={featuredOwned ? featuredEquipped : !canBuyFeatured} onAction={() => run(() => featuredOwned ? equipItem(featured.id) : buyItem(featured.id))} actionLabel={featuredEquipped ? '已装备' : featuredOwned ? '装备' : `购买 · ${featured.cost}`} /></div>
    <div className="ws-loadout-strip"><div className="ws-loadout-icon"><Icon name="sword" size={23} /></div><div><span className="ws-panel-kicker">BASE LOADOUT</span><strong>基础厨刀</strong><small>可靠的起点 · 不提供额外裁决加成</small></div><ActionButton mutates variant="quiet" disabled={!meta.equippedWeaponId} onClick={() => run(() => equipItem(null))}>{meta.equippedWeaponId ? '切回基础厨刀' : '当前已装备'}</ActionButton></div>
    <details className="ws-preview-shelf"><summary><span><b>未开放物品</b><small>{previews.length} 项未来目录 · 仅供预览</small></span><i>展开目录</i></summary><div className="ws-shop-grid">{previews.map(item => { const owned = meta.purchasedShopItemIds.includes(item.id); const equipped = item.category === 'weapon' && meta.equippedWeaponId === item.id; return <ShopCard key={item.id} coins={meta.coins} item={item} owned={owned} equipped={equipped} disabled onAction={() => undefined} actionLabel="即将开放" />; })}</div></details>
    </div><WorkshopNav active="shop" /></section>;
}

function ShopCard({ item, owned, equipped, disabled, onAction, actionLabel, featured = false, coins }: { item: ShopItemDefinition; owned: boolean; equipped: boolean; disabled?: boolean; onAction: () => void; actionLabel: string; featured?: boolean; coins: number }) {
  const shortfall = Math.max(0, item.cost - coins);
  return <article className={`ws-shop-card ${item.implemented ? '' : 'is-preview'} ${equipped ? 'is-equipped' : ''} ${featured ? 'is-featured' : ''}`}><div className={`ws-shop-art ws-shop-art--${item.category}`}><Icon name={item.category === 'weapon' ? 'sword' : item.category === 'skin' ? 'spark' : 'bag'} size={featured ? 38 : 29} />{!item.implemented && <span>PREVIEW</span>}</div><div className="ws-shop-copy"><span className="ws-panel-kicker">{item.category === 'weapon' ? 'WEAPON' : item.category === 'skin' ? 'OUTFIT' : 'SUPPLY'}</span><h2>{item.name}</h2><p>{item.description}</p>{item.verdictDamageBonus > 0 && <strong className="ws-bonus">+{item.verdictDamageBonus} 裁决伤害</strong>}{item.implemented && !owned && shortfall > 0 && <small className="ws-affordability">还差 {formatPrice(shortfall)} 金币</small>}{item.implemented && owned && <small className="ws-affordability ws-affordability--ready">已解锁 · 可随时切换</small>}</div><div className="ws-shop-action"><strong className="ws-shop-price">{item.cost ? `${formatPrice(item.cost)} ◈` : '免费'}</strong><ActionButton mutates variant={item.implemented ? 'primary' : 'quiet'} disabled={disabled || equipped} onClick={onAction}>{equipped ? <><span className="ws-check">✓</span> 已装备</> : owned ? '装备' : actionLabel}</ActionButton></div></article>;
}

function EmptyState({ icon, title, text, action, onAction }: { icon?: 'bag' | 'shop' | 'book'; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="ws-empty"><div className="ws-empty-icon">{icon === 'bag' ? <Icon name="bag" size={28} /> : icon === 'book' ? <Icon name="book" size={28} /> : <Icon name="shop" size={28} />}</div><h2>{title}</h2><p>{text}</p>{action && onAction && <ActionButton variant="quiet" onClick={onAction}>{action} <Icon name="arrow" size={16} /></ActionButton>}</div>;
}

export function Workshop() {
  const meta = useWorkshopStore(state => state.meta);
  const screen = useWorkshopStore(state => state.screen);
  const notice = useWorkshopStore(state => state.notice);
  const saving = useWorkshopStore(state => state.saving);
  const saveIssue = useWorkshopStore(state => state.saveIssue);
  const go = useWorkshopStore(state => state.go);
  const cook = useWorkshopStore(state => state.cook);
  const sellDish = useWorkshopStore(state => state.sellDish);
  const sellAllDishes = useWorkshopStore(state => state.sellAllDishes);
  const buyItem = useWorkshopStore(state => state.buyItem);
  const equipItem = useWorkshopStore(state => state.equipItem);
  const clearNotice = useWorkshopStore(state => state.clearNotice);
  const content = useMemo(() => {
    switch (screen) {
      case 'kitchen': return <Kitchen meta={meta} go={go} cook={cook} />;
      case 'inventory': return <Inventory meta={meta} go={go} />;
      case 'cookbook': return <Cookbook meta={meta} go={go} />;
      case 'sales': return <Sales meta={meta} go={go} sellDish={sellDish} sellAllDishes={sellAllDishes} />;
      case 'shop': return <Shop meta={meta} go={go} buyItem={buyItem} equipItem={equipItem} />;
      case 'restaurant':
      default: return <Restaurant meta={meta} go={go} />;
    }
  }, [screen, meta, go, cook, sellDish, sellAllDishes, buyItem, equipItem]);
  return <div className="ws-root"><Notice notice={notice} clearNotice={clearNotice} saving={saving} saveIssue={saveIssue} />{content}</div>;
}
