import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Result } from './App';
import { useGame } from './store';
import { createCombat } from './domain/combat';
import { nextBossAfter } from './domain/progression';

// SSR normally uses Zustand's original hydration snapshot. Read the explicitly
// arranged current store here, so each result fixture actually reaches the UI.
vi.mock('./store',async()=>{
  const actual=await vi.importActual<typeof import('./store')>('./store');
  const hook=(selector:(state:ReturnType<typeof actual.useGame.getState>)=>unknown)=>selector(actual.useGame.getState());
  return {...actual,useGame:Object.assign(hook,actual.useGame)};
});

describe('result routing',()=>{
  beforeEach(()=>useGame.setState({screen:'result',combat:createCombat(),saving:false,saveIssue:null,pendingBattle:null}));
  it('offers the exact next vegetable and returns to selection at the end',()=>{
    expect(['corn','carrot','cabbage','tomato','jelly'].map(boss=>nextBossAfter(boss as Parameters<typeof nextBossAfter>[0])))
      .toEqual(['carrot','cabbage','tomato',null,null]);
    for(const boss of ['corn','carrot','cabbage','tomato'] as const){
      const combat=createCombat(1,boss);combat.battle.bossHp=0;
      useGame.setState({combat});const html=renderToStaticMarkup(<Result/>);
      expect(html).toContain(boss==='tomato'?'本章通关 · 返回选关':'继续下一关');
      expect(html).not.toContain('重玩这关');expect(html).toContain('前往厨房');
      expect(html).not.toContain('返回餐厅');
    }
  });
  it('offers a replay and explains both loss conditions',()=>{
    for(const reason of ['hearts','verdict-timeout'] as const){
      const combat=createCombat();combat.defeatReason=reason;
      useGame.setState({combat});const html=renderToStaticMarkup(<Result/>);
      expect(html).toContain('重玩这关');expect(html).not.toContain('继续下一关');
      expect(html).toContain(reason==='hearts'?'三颗爱心已耗尽':'裁决时间耗尽');
    }
  });
  it('does not enable next/retry while settlement is pending or failed',()=>{
    for(const state of [{saving:true},{saveIssue:'存档失败'},{pendingBattle:{id:'pending',bossKind:'corn' as const,won:false}}]){
      useGame.setState({saving:false,saveIssue:null,pendingBattle:null,...state});
      expect(renderToStaticMarkup(<Result/>)).toMatch(/data-testid="retry-level"[^>]*disabled/);
    }
  });
});
