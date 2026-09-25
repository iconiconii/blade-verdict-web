import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameButton, GameDialog, GameNav, GamePanel, GameProgress, GameSegmented, GameSlider, GameSwitch, GameTitle, GameToast, ItemCard, ItemIcon, itemIconNames, progressPercent } from './index';

describe('game UI component contracts', () => {
  it.each([[65, 100, 65], [3200, 5000, 64], [-5, 100, 0], [140, 100, 100], [1, 0, 0], [1, -1, 0], [NaN, 100, 0], [1, Infinity, 0]])('clamps progress %s / %s to %s', (value, max, expected) => {
    expect(progressPercent(value, max)).toBe(expected);
  });

  it('defaults buttons to non-submitting and disables busy actions', () => {
    const html = renderToStaticMarkup(<GameButton busy>制作</GameButton>);
    expect(html).toContain('type="button"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('处理中…');
  });

  it('forwards native button attributes and selected visual variant', () => {
    const html = renderToStaticMarkup(<GameButton type="submit" variant="blue" aria-label="开始烹饪" data-testid="cook" className="custom">制作</GameButton>);
    expect(html).toContain('type="submit"');
    expect(html).toContain('gui-button--blue custom');
    expect(html).toContain('aria-label="开始烹饪"');
    expect(html).toContain('data-testid="cook"');
  });

  it('labels informational icons and hides decorative ones from screen readers', () => {
    expect(renderToStaticMarkup(<ItemIcon name="corn" label="玉米" />)).toContain('alt="玉米"');
    const decorative = renderToStaticMarkup(<ItemIcon name="corn" />);
    expect(decorative).toContain('alt=""');
    expect(decorative).toContain('/assets/ui-kit/icons/corn.png');
    expect(new Set(itemIconNames).size).toBe(16);
  });

  it('only renders item cards as buttons when they have an action', () => {
    expect(renderToStaticMarkup(<ItemCard name="玉米" icon="corn" count={12} />)).not.toContain('<button');
    const interactive = renderToStaticMarkup(<ItemCard name="玉米" icon="corn" count={-2} selected disabled onClick={() => {}} />);
    expect(interactive).toContain('aria-pressed="true"');
    expect(interactive).toContain('disabled=""');
    expect(interactive).toContain('× 0');
  });

  it('exposes the active page and respects locked navigation items', () => {
    const html = renderToStaticMarkup(<GameNav active="kitchen" onChange={() => {}} items={[{ id: 'kitchen', label: '厨房', icon: 'pot' }, { id: 'book', label: '图鉴', icon: 'book', disabled: true }]} />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="游戏导航"');
  });

  it('renders safe progress ARIA bounds and style from the same clamped value', () => {
    const html = renderToStaticMarkup(<GameProgress value={150} label="能量" />);
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('width:100%');
    expect(html).toContain('aria-label="能量"');
  });

  it('uses native accessible settings controls', () => {
    const toggle = renderToStaticMarkup(<GameSwitch label="震动" checked={false} onChange={() => {}} />);
    expect(toggle).toContain('role="switch"');
    expect(toggle).toContain('aria-checked="false"');
    const slider = renderToStaticMarkup(<GameSlider label="音乐" value={150} onChange={() => {}} />);
    expect(slider).toContain('type="range"');
    expect(slider).toContain('value="100"');
    expect(slider).toContain('<label for=');
    const segmented = renderToStaticMarkup(<GameSegmented label="画质" value="high" onChange={() => {}} options={[{ value: 'low', label: '低' }, { value: 'high', label: '高' }]} />);
    expect(segmented.match(/type="radio"/g)).toHaveLength(2);
    expect(segmented.match(/checked=""/g)).toHaveLength(1);
  });

  it('keeps closed dialogs out of the normal layout and labels them', () => {
    const html = renderToStaticMarkup(<GameDialog open={false} title="设置" onClose={() => {}}>内容</GameDialog>);
    expect(html).toContain('<dialog');
    expect(html).not.toContain(' open=');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('aria-label="关闭弹窗"');
  });

  it('supports correct heading hierarchy, materials and polite feedback', () => {
    expect(renderToStaticMarkup(<GameTitle level={1}>怪兽厨房</GameTitle>)).toContain('<h1>');
    expect(renderToStaticMarkup(<GamePanel material="wood" id="test">木板</GamePanel>)).toContain('gui-material--wood');
    expect(renderToStaticMarkup(<GameToast>已收集</GameToast>)).toContain('aria-live="polite"');
  });
});
