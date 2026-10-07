import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CombatFeedback } from '../../domain/combat';
import { CircleFeedback } from './CircleFeedback';

const event=(id:number,kind:CombatFeedback['kind'],amount:number):CombatFeedback=>({id,kind,amount,time:0,position:{x:.5,y:.5},anchorId:'belly',energyGain:kind==='Miss'?0:20,circleId:`round-1:${id}`,angle:.65});

describe('per-circle feedback HUD',()=>{
  it.each([['Nice','Perfect'],['Perfect','Miss']] as const)('keeps both %s + %s outcomes visible', (first,second)=>{
    const html=renderToStaticMarkup(<CircleFeedback events={[event(1,first,18),event(2,second,12)]}/>);
    expect(html.match(/data-testid="circle-feedback"/g)).toHaveLength(2);
    expect(html).toContain(first==='Nice'?'GOOD':first.toUpperCase());
    expect(html).toContain(second.toUpperCase());
    expect(html).toContain('−18');expect(html).toContain('−12');
    if(second==='Miss')expect(html).toContain('玩家受伤');
    expect(html).toContain('怪物受伤');
  });

  it('does not claim damage for a jelly relay preview or duplicate cut feedback',()=>{
    const html=renderToStaticMarkup(<CircleFeedback events={[{...event(1,'Perfect',0),pendingRound:true},event(2,'Cut',20)]}/>);
    expect(html.match(/data-testid="circle-feedback"/g)).toHaveLength(1);
    expect(html).toContain('已判定');expect(html).not.toContain('−0');expect(html).not.toContain('CUT');
  });
});
