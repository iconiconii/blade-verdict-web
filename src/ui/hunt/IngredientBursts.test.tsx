import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyContinuousCut, createCombat, currentVerdictStage, startVerdict, tickCombat, type CombatFeedback } from '../../domain/combat';
import type { BossKind } from '../../domain/v2';
import { FeedbackManager } from '../../feedback/FeedbackManager';
import { IngredientBursts, selectVerdictBursts, verdictFoodLimits } from './IngredientBursts';

const assetFiles=import.meta.glob('/public/assets/ui-kit/icons/*.png');
const render=(events:CombatFeedback[],time=0,bossKind:BossKind='corn')=>renderToStaticMarkup(
  <IngredientBursts events={events} bossKind={bossKind} time={time} origin={()=>({x:150,y:250})}/>);
const cutEvent=()=>applyContinuousCut(verdict('corn'),{x:.5,y:.5},true).feedback!;

it.each([
  {kind:'Nice',energyGain:1,finisher:false,size:34,count:3},
  {kind:'Perfect',energyGain:1,finisher:false,size:34,count:8},
  {kind:'Cut',energyGain:0,finisher:false,size:40,count:3},
  {kind:'Cut',energyGain:0,finisher:true,size:48,count:8},
] as const)('enlarges $kind food to $size px while retaining $count particles',({kind,energyGain,finisher,size,count})=>{
  const html=render([{...cutEvent(),kind,energyGain,finisher}]);
  const images=html.match(/<img [^>]+>/g)??[];
  expect(images).toHaveLength(count);
  for(const image of images)expect(image).toContain(`width="${size}" height="${size}"`);
});

function verdict(boss:BossKind){
  const base=createCombat(7319,boss),stage=currentVerdictStage(base);
  return startVerdict({...base,phase:'verdictReady',stageGroupsResolved:stage?.groupCount??0,
    stageCirclesResolved:stage?.circleCount??0,
    battle:{...base.battle,meter:100}});
}

it.each(['corn','carrot','cabbage','tomato','jelly'] as const)('renders food after a real %s Cut with zero energy income',boss=>{
  const before=verdict(boss);
  expect(before.phase).toBe('verdictSlash');
  const hit=applyContinuousCut(before,{x:.5,y:.5},true);
  expect(hit.feedback).toMatchObject({kind:'Cut',energyGain:0});
  const events=new FeedbackManager().update(hit).events;
  const html=renderToStaticMarkup(<IngredientBursts events={events} bossKind={boss} time={hit.time} origin={()=>({x:150,y:250})}/>);
  expect(html.match(/<img /g)??[]).toHaveLength(3);
  const icon=boss==='jelly'?'gem':boss;
  expect(html).toContain(`/assets/ui-kit/icons/${icon}.png`);
  expect(`/public/assets/ui-kit/icons/${icon}.png` in assetFiles).toBe(true);
  expect(hit.battle.loot).toEqual(before.battle.loot);
});

it('keeps the final Cut after leaving verdict and delays its larger burst by the 80ms hold',()=>{
  const before=verdict('corn');
  const hit=applyContinuousCut({...before,battle:{...before.battle,bossHp:1}},{x:.5,y:.5},true);
  expect(hit.phase).not.toBe('verdictSlash');
  expect(hit.feedback).toMatchObject({kind:'Cut',finisher:true});
  const manager=new FeedbackManager(),events=manager.update(hit).events;
  expect(render(events).match(/<img /g)).toHaveLength(8);
  expect(render(events)).toContain('animation-delay:80ms');
  expect(render(events,100)).toContain('animation-delay:-20ms');
  expect(selectVerdictBursts(events,599)).toHaveLength(1);
  expect(selectVerdictBursts(events,600)).toHaveLength(0);
});

it('bounds rapid repeated contacts, deduplicates IDs and keeps the finisher',()=>{
  const base=cutEvent();
  const events=Array.from({length:200},(_,index)=>({...base,id:index+1,time:index}));
  const final={...base,id:201,time:200,finisher:true};
  const incoming=[...events,final,...events,final],snapshot=JSON.stringify(incoming);
  const bursts=selectVerdictBursts(incoming,240);
  expect(bursts).toHaveLength(verdictFoodLimits.bursts);
  expect(new Set(bursts.map(burst=>burst.event.id)).size).toBe(bursts.length);
  expect(bursts[0]).toMatchObject({event:{id:201},count:8});
  expect(bursts.reduce((sum,burst)=>sum+burst.count,0)).toBe(23);
  expect((render(incoming,240).match(/<img /g)??[]).length).toBeLessThanOrEqual(verdictFoodLimits.particles);
  expect(JSON.stringify(incoming)).toBe(snapshot);
  expect(selectVerdictBursts([...incoming].reverse(),240)).toEqual(bursts);
});

it('ignores invalid, future and expired cuts without changing ordinary parry bursts',()=>{
  const base=cutEvent();
  const ignored:CombatFeedback[]=[{...base,amount:0},{...base,id:2,time:10},
    {...base,id:3,time:-520},{...base,id:4,pendingRound:true},{...base,id:5,kind:'Miss'}];
  expect(selectVerdictBursts(ignored,0)).toEqual([]);
  expect(selectVerdictBursts([base],519)).toHaveLength(1);
  expect(selectVerdictBursts([base],520)).toHaveLength(0);
  expect((render([{...base,kind:'Nice',energyGain:1}]).match(/<img /g)??[])).toHaveLength(3);
  expect((render([{...base,kind:'Perfect',energyGain:1}]).match(/<img /g)??[])).toHaveLength(8);
  expect(render([{...base,kind:'Miss',energyGain:0}])).toBe('');
  expect(applyContinuousCut(verdict('corn'),{x:.1,y:.1},false).feedback).toBeNull();
});

it('uses combat time through pause/resume and clears old battle events on restart',()=>{
  const manager=new FeedbackManager();
  const hit=applyContinuousCut(verdict('corn'),{x:.5,y:.5},true);
  const progressing=tickCombat(hit,120),paused={...progressing,paused:true};
  const before=render(manager.update(paused).events,paused.time);
  const waited=tickCombat(paused,2000);
  expect(render(manager.update(waited).events,waited.time)).toBe(before);
  expect(before).toContain('animation-delay:-120ms');
  const resumed=tickCombat({...waited,paused:false},400);
  expect(render(manager.update(resumed).events,resumed.time)).toBe('');
  expect(manager.update(createCombat(2,'corn')).events).toEqual([]);
});
