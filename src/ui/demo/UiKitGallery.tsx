import { assetUrl } from '../assets';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameTheme, GamePanel, GameButton, GameTitle, GameBanner, ItemIcon, ItemCard, RarityBadge, ResourceChip, GameProgress, GameNav, GameDialog, GameEmptyState, GameSwitch, GameSlider, GameSegmented, IngredientSlot, GameToast, GameDivider, StatTile, itemIconNames, type ItemIconName, type NavigationItem, type Rarity } from '../index';

const names: Record<ItemIconName, string> = { corn: '玉米', carrot: '胡萝卜', cabbage: '卷心菜', tomato: '番茄', potato: '土豆', mushroom: '蘑菇', chili: '辣椒', pumpkin: '南瓜', broccoli: '西蓝花', eggplant: '茄子', coin: '金币', gem: '水晶', pot: '料理锅', chest: '宝箱', map: '探险地图', book: '怪物图鉴' };
const navigation: NavigationItem[] = [
  { id: 'kitchen', label: '厨房', icon: 'pot' }, { id: 'inventory', label: '仓库', icon: 'chest' },
  { id: 'adventure', label: '探险', icon: 'map' }, { id: 'book', label: '图鉴', icon: 'book' },
];
const sections = [['materials', '材质与面板'], ['buttons', '按钮与操作'], ['banners', '标题与横幅'], ['items', '道具与图标'], ['navigation', '导航与状态'], ['playground', '组合与弹窗']] as const;

function Section({ id, number, title, description, children }: { id: string; number: string; title: string; description: string; children: ReactNode }) {
  return <section className="kit-section" id={id}><div className="kit-section-heading"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div><a href={`#${id}`} aria-label={`定位到${title}`}>#{id}</a></div>{children}</section>;
}

function Example({ name, children, code }: { name: string; children: ReactNode; code?: string }) {
  return <div className="kit-example"><div className="kit-example-stage">{children}</div><div className="kit-example-caption"><code>{name}</code>{code && <details><summary>用法</summary><pre>{code}</pre></details>}</div></div>;
}

export function UiKitGallery() {
  const [active, setActive] = useState('kitchen');
  const [volume, setVolume] = useState(70);
  const [sound, setSound] = useState(85);
  const [vibration, setVibration] = useState(true);
  const [quality, setQuality] = useState('high');
  const [selected, setSelected] = useState<ItemIconName>('corn');
  const [filter, setFilter] = useState('');
  const [meter, setMeter] = useState(65);
  const [dialog, setDialog] = useState<'settings' | 'reward' | 'pause' | 'failure' | null>(null);
  const [toast, setToast] = useState('');
  const [slots, setSlots] = useState<Array<ItemIconName | undefined>>(['corn', 'carrot', undefined]);
  const [cooking, setCooking] = useState(false);
  const [cooked, setCooked] = useState(false);
  const [compact, setCompact] = useState(true);
  const cookingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filtered = itemIconNames.filter(name => `${name} ${names[name]}`.toLowerCase().includes(filter.toLowerCase()));

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => () => clearTimeout(cookingTimer.current), []);
  function cook() {
    if (cooking || slots.some(icon => !icon)) return;
    setCooking(true);
    setCooked(false);
    cookingTimer.current = setTimeout(() => { setCooking(false); setCooked(true); setToast('料理完成！这是独立演示，不改变游戏背包。'); }, 1200);
  }

  return <GameTheme className="kit-shell">
    <a className="kit-skip" href="#materials">跳到组件</a>
    <header className="kit-header"><a href="#top" className="kit-brand"><ItemIcon name="pot" size={45} /><span>怪兽厨房<small>GAME UI WORKSHOP</small></span></a><span className="kit-version">组件库 / 01</span><a className="kit-header-link" href="#playground">试玩组件</a></header>
    <div className="kit-layout">
      <aside className="kit-sidebar"><p>组件目录</p><nav aria-label="组件目录">{sections.map(([id, title], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{title}</a>)}</nav><div className="kit-sidebar-note"><strong>一套材质，多种玩法。</strong><p>木质边框 · 叶片装饰<br />羊皮纸 · 糖果色按钮</p><span>React + CSS + PNG</span></div></aside>
      <main className="kit-main" id="top">
        <div className="kit-intro"><div><span className="kit-kicker">MONSTER KITCHEN / DESIGN SYSTEM</span><h1>把冒险，装进界面。</h1><p>从一块木牌到一整个厨房。<br />一套有温度、有分量、可以直接使用的游戏 UI。</p><div className="kit-intro-meta"><span>20 个基础组件</span><span>16 枚独立图标</span><span>手机优先</span></div></div><GamePanel material="wood" className="kit-hero-panel"><GameBanner tone="quest" title="今日的好收成" /><div className="kit-hero-icons"><ItemIcon name="corn" size={82} /><ItemIcon name="carrot" size={82} /><ItemIcon name="tomato" size={82} /></div><GameButton onClick={() => setDialog('reward')}>打开收获礼盒</GameButton></GamePanel></div>

        <Section id="materials" number="01" title="材质与面板" description="木框承载世界观，羊皮纸承载信息。九宫格伸缩，保留边角厚度。">
          <div className="kit-grid kit-grid--two">
            <Example name="GamePanel / parchment" code={'<GamePanel material="parchment">\n  <GameTitle level={3}>冒险委托</GameTitle>\n  {children}\n</GamePanel>'}><GamePanel><GameTitle level={3} eyebrow="QUEST BOARD" subtitle="在蔬菜园收集新鲜食材，带回厨房。">冒险委托</GameTitle><div className="kit-stats"><StatTile icon="coin" label="委托奖励" value="120 金币" /><StatTile icon="corn" label="收集目标" value="3 / 5" /></div></GamePanel></Example>
            <Example name="GamePanel / wood" code={'<GamePanel material="wood">\n  <GameTitle level={3}>旅行者的行囊</GameTitle>\n</GamePanel>'}><GamePanel material="wood"><GameTitle level={3} eyebrow="TRAVELER'S PACK" subtitle="厚木板与柔和高光，适合背包与奖励。">旅行者的行囊</GameTitle><div className="kit-inline kit-inline--center"><ResourceChip label="金币" value={1280} /><ResourceChip label="水晶" value={36} icon="gem" /></div></GamePanel></Example>
          </div>
          <div className="kit-token-row">{[['木纹棕', '#673516'], ['羊皮纸', '#fff0c3'], ['主按钮金', '#ffcd35'], ['叶片绿', '#67c718'], ['信息蓝', '#1ca8df'], ['警示红', '#e44929']].map(([label, color]) => <div key={label}><span style={{ backgroundColor: color }} /><strong>{label}</strong><code>{color}</code></div>)}</div>
        </Section>

        <Section id="buttons" number="02" title="按钮与操作" description="金色推进、蓝色制作、绿色确认。悬停、按下、禁用和处理中状态齐全。">
          <Example name="GameButton" code={'<GameButton variant="blue" onClick={onCook}>开始烹饪</GameButton>\n<GameButton busy={saving} disabled={!canSave}>保存</GameButton>'}><div className="kit-button-grid">{([['gold', '开始讨伐'], ['blue', '开始烹饪'], ['green', '确认选择'], ['wood', '返回营地'], ['danger', '放弃挑战']] as const).map(([variant, label]) => <div key={variant}><GameButton variant={variant} onClick={() => setToast(`已触发「${label}」演示操作`)}>{label}</GameButton><span>{variant}</span></div>)}<div><GameButton disabled>尚未解锁</GameButton><span>disabled</span></div><div><GameButton busy>保存</GameButton><span>loading</span></div></div></Example>
        </Section>

        <Section id="banners" number="03" title="标题与横幅" description="叶片木牌、胜利金带与暗木告示。文字独立渲染，不锁死语言和数值。">
          <div className="kit-grid kit-grid--three"><Example name="GameBanner / quest"><GameBanner tone="quest" title="蔬菜园" >第一章 · 新的旅程</GameBanner></Example><Example name="GameBanner / reward"><GameBanner title="大获全胜">新的食材已加入行囊</GameBanner></Example><Example name="GameBanner / warning"><GameBanner tone="warning" title="再试一次">休息一下，重新出发</GameBanner></Example></div>
          <Example name="GameTitle · GameDivider" code={'<GameTitle level={2} eyebrow="CHAPTER 01" subtitle="探索、收集、烹饪">蔬菜园</GameTitle>'}><GameTitle eyebrow="CHAPTER 01" subtitle="探索、收集、烹饪">蔬菜园</GameTitle><GameDivider>第一章 · 全新旅程</GameDivider></Example>
        </Section>

        <Section id="items" number="04" title="道具与图标" description="16 枚透明 PNG，统一视觉尺寸。点选查看、搜索名称，下载后即可使用。">
          <div className="kit-search-row"><label>查找图标<input type="search" placeholder="玉米 / corn" value={filter} onChange={event => setFilter(event.target.value)} /></label><span>{filtered.length} / 16</span></div>
          <div className="kit-item-library"><div className="kit-icon-grid">{filtered.map(name => <button key={name} type="button" aria-pressed={selected === name} onClick={() => setSelected(name)}><ItemIcon name={name} size={68} /><span>{names[name]}</span><code>{name}</code></button>)}{!filtered.length && <p>没有匹配的图标，请换个名称。</p>}</div><div className="kit-icon-inspector"><ItemIcon name={selected} label={names[selected]} size={144} /><strong>{names[selected]}</strong><code>{selected}.png</code><p>192 × 192 · 透明 PNG</p><a href={assetUrl(`assets/ui-kit/icons/${selected}.png`)} download>下载此图标</a><pre>{`<ItemIcon\n  name="${selected}"\n  size={64}\n  label="${names[selected]}"\n/>`}</pre></div></div>
          <Example name="ItemCard · RarityBadge" code={'<ItemCard name="玉米" icon="corn" count={12}\n  rarity="fine" selected={selected}\n  onClick={onSelect} />'}><div className="kit-cards">{(['common', 'fine', 'rare', 'legendary'] as Rarity[]).map((rarity, index) => <ItemCard key={rarity} name={names[itemIconNames[index]]} icon={itemIconNames[index]} rarity={rarity} count={[12, 8, 10, 6][index]} selected={selected === itemIconNames[index]} onClick={() => setSelected(itemIconNames[index])} />)}</div><div className="kit-inline kit-rarity-row">{(['common', 'fine', 'rare', 'legendary'] as Rarity[]).map(rarity => <RarityBadge key={rarity} rarity={rarity} />)}</div></Example>
        </Section>

        <Section id="navigation" number="05" title="导航与状态" description="导航选中态、资源计数、平滑进度，以及成功、空白和失败反馈。">
          <Example name="GameNav" code={'<GameNav items={items} active={screen} onChange={setScreen} />'}><GameNav items={navigation} active={active} onChange={setActive} /><p className="kit-demo-note" aria-live="polite">当前栏目：{navigation.find(item => item.id === active)?.label}</p></Example>
          <div className="kit-grid kit-grid--two"><Example name="GameProgress · ResourceChip"><GamePanel><div className="kit-inline"><ResourceChip label="金币" value={1280} /><ResourceChip label="水晶" value={36} icon="gem" /></div><div className="kit-meter-stack"><GameProgress label="怪物生命" value={64} tone="danger" /><GameProgress label="裁决能量" value={meter} /><GameProgress label="收集进度" value={35} tone="green" /></div><GameButton variant="green" onClick={() => setMeter(value => value >= 100 ? 0 : Math.min(100, value + 15))}>增加能量</GameButton></GamePanel></Example><Example name="GameEmptyState · GameToast"><GamePanel><GameEmptyState title="行囊还是空的" action={<GameButton onClick={() => { setActive('adventure'); setToast('已切换至探险栏目'); }}>去探险</GameButton>}>去蔬菜园找一点新鲜食材吧。</GameEmptyState></GamePanel></Example></div>
          <div className="kit-grid kit-grid--two"><GameToast>已收集玉米 × 3</GameToast><GameToast tone="error">食材不足，去探险补充吧</GameToast></div>
        </Section>

        <Section id="playground" number="06" title="组合与弹窗" description="把组件拼成真实场景。演示数据独立运行，不读取或修改游戏存档。">
          <div className="kit-preview-toolbar"><span>厨房组件组合</span><div><button type="button" aria-pressed={compact} onClick={() => setCompact(true)}>手机宽度</button><button type="button" aria-pressed={!compact} onClick={() => setCompact(false)}>自适应</button></div></div>
          <div className={`kit-playground ${compact ? 'is-compact' : ''}`}><GamePanel><GameTitle level={3} subtitle="点击食材槽装入食材，再开始烹饪。">今天，煮点什么？</GameTitle><div className="kit-pot"><ItemIcon name="pot" size={110} /></div><div className="kit-slots">{slots.map((icon, index) => <IngredientSlot key={index} icon={icon} label={icon ? names[icon] : '放入番茄'} disabled={cooking} onClick={() => { setCooked(false); setSlots(current => current.map((value, i) => i === index ? (value ? undefined : (['corn', 'carrot', 'tomato'] as const)[i]) : value)); }} />)}</div><GameButton className="kit-cook-button" variant="blue" busy={cooking} disabled={slots.some(icon => !icon)} onClick={cook}>开始烹饪</GameButton>{cooked && <GameBanner title="料理完成">暖心蔬菜汤 · 品质优质</GameBanner>}<GameDivider>界面状态预览</GameDivider><div className="kit-dialog-triggers"><GameButton variant="wood" onClick={() => setDialog('settings')}>设置</GameButton><GameButton variant="wood" onClick={() => setDialog('pause')}>暂停</GameButton><GameButton onClick={() => setDialog('reward')}>胜利</GameButton><GameButton variant="danger" onClick={() => setDialog('failure')}>失败</GameButton></div></GamePanel><GameNav items={navigation} active={active} onChange={setActive} /></div>
          <Example name="GameDialog · GameSlider · GameSwitch · GameSegmented" code={'<GameDialog open={open} onClose={() => setOpen(false)} title="设置">\n  <GameSlider label="音乐" value={music} onChange={setMusic} />\n  <GameSwitch label="震动" checked={enabled} onChange={setEnabled} />\n</GameDialog>'}><p className="kit-demo-note">弹窗支持 Escape 关闭、焦点锁定及关闭后焦点恢复。滑杆支持方向键，分段选择支持原生单选键盘操作。</p></Example>
        </Section>

        <footer className="kit-footer"><strong>怪兽厨房 · UI 工坊</strong><p>素材与交互分层，组件与游戏规则解耦。</p><a href={assetUrl('assets/ui-kit/items-atlas-packed.png')} download>下载图标图集</a><a href={assetUrl('assets/ui-kit/controls-atlas.png')} download>下载控件底板</a><a href="#top">回到顶部</a></footer>
      </main>
    </div>
    {toast && <div className="kit-live-toast"><GameToast>{toast}</GameToast></div>}
    <GameDialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog === 'settings' ? '设置' : dialog === 'pause' ? '休息一下' : dialog === 'failure' ? '挑战结束' : '收获时刻'} actions={<GameButton onClick={() => setDialog(null)}>{dialog === 'settings' ? '返回工坊' : dialog === 'pause' ? '继续冒险' : dialog === 'failure' ? '再来一次' : '收下奖励'}</GameButton>}>
      {dialog === 'settings' ? <><GameSlider label="音乐" value={volume} onChange={setVolume} /><GameSlider label="音效" value={sound} onChange={setSound} /><GameSwitch label="震动" checked={vibration} onChange={setVibration} /><GameSegmented label="画质" value={quality} onChange={setQuality} options={[{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]} /><GameDivider>演示设置 · 不影响真实游戏</GameDivider></> : dialog === 'pause' ? <><GameBanner tone="quest" title="冒险暂停" /><p>一口热汤的时间，休息好再出发。</p></> : dialog === 'failure' ? <><GameBanner tone="warning" title="再试一次" /><p>每一次挑战，都会离胜利更近。</p></> : <><GameBanner title="大获全胜" /><div className="kit-reward"><ItemIcon name="corn" size={112} /><strong>玉米 × 3</strong><span>奖励组件演示</span></div></>}
    </GameDialog>
  </GameTheme>;
}
