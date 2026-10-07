import { describe, expect, it } from 'vitest';
import { createCombat, type CombatFeedback, type CombatState } from '../domain/combat';
import { FeedbackManager, selectActorFeedback } from './FeedbackManager';

const event=(id:number,kind:CombatFeedback['kind'],time=0,energyGain=0):CombatFeedback=>({
  id,kind,time,energyGain,amount:10,position:{x:.5,y:.5},angle:0,
});
const state=(events:CombatFeedback[],time=0,meter=0):CombatState=>{
  const initial=createCombat();
  return {...initial,phase:'targetActive',time,effects:events,feedback:events.at(-1)??null,battle:{...initial.battle,meter}};
};

describe('battle feedback journal',()=>{
  it('consumes every new event exactly once even in a reversed batched update',()=>{
    const manager=new FeedbackManager(),first=event(1,'Nice'),second=event(2,'Perfect');
    const snapshot=manager.update(state([second,first,second]));
    expect(snapshot.newEvents.map(item=>item.id)).toEqual([1,2]);
    expect(snapshot.events).toHaveLength(2);
    expect(manager.update(state([first,second],16)).newEvents).toEqual([]);
    expect(manager.update(state([second],650)).events).toEqual([]);
  });

  it.each([
    [event(1,'Miss'),event(2,'Perfect')],
    [event(1,'Perfect'),event(2,'Miss')],
  ])('keeps player hurt separate from the stronger actor reaction',(...events)=>{
    const result=new FeedbackManager().update(state(events));
    expect(result.actorFeedback?.kind).toBe('Perfect');
    expect(result.hurtFeedback?.kind).toBe('Miss');
    expect(result.newEvents).toHaveLength(2);
  });

  it('selects the same strongest actor pose regardless of same-frame event order',()=>{
    const contacts=[event(1,'Perfect'),event(2,'Nice'),event(3,'Miss')];
    expect(selectActorFeedback(contacts,50)?.kind).toBe('Perfect');
    expect(selectActorFeedback([...contacts].reverse(),50)?.kind).toBe('Perfect');
    expect(selectActorFeedback([...contacts,{...event(4,'Cut'),finisher:true}],50)?.finisher).toBe(true);
    expect(selectActorFeedback([event(1,'Perfect'),event(2,'Miss',100)],100)?.kind).toBe('Perfect');
    expect(selectActorFeedback([event(1,'Perfect'),event(2,'Miss',101)],101)?.kind).toBe('Miss');
  });

  it('adds both energy flights and advances them only with combat time',()=>{
    const manager=new FeedbackManager(),contacts=[event(1,'Nice',0,14),event(2,'Perfect',0,21)];
    expect(manager.update(state(contacts,0,35)).visualMeter).toBe(0);
    expect(manager.update(state(contacts,300,35)).visualMeter).toBe(0);
    expect(manager.update(state(contacts,425,35)).visualMeter).toBe(17.5);
    expect(manager.update({...state(contacts,425,35),paused:true}).visualMeter).toBe(17.5);
    expect(manager.update(state(contacts,550,35)).visualMeter).toBe(35);
  });

  it('shows full energy immediately and emits one Ready pulse until release',()=>{
    const manager=new FeedbackManager();
    manager.update(state([],0,72));
    const contacts=[event(1,'Nice',10,14),event(2,'Nice',10,14)];
    const full=manager.update(state(contacts,10,100));
    expect(full).toMatchObject({ready:true,readyPulse:1,readySince:10,visualMeter:100});
    expect(manager.update(state(contacts,100,100)).readyPulse).toBe(1);
    expect(manager.update({...state(contacts,200,0),phase:'verdictSlash'})).toMatchObject({ready:false,readySince:null,visualMeter:0});
    expect(manager.update(state([event(3,'Perfect',250,100)],250,100)).readyPulse).toBe(2);
  });

  it('never announces Ready for a dead combatant or settlement',()=>{
    const full=state([],0,100);
    for(const current of [
      {...full,battle:{...full.battle,bossHp:0}},
      {...full,battle:{...full.battle,playerHp:0}},
      {...full,phase:'settle' as const},
    ])expect(new FeedbackManager().update(current)).toMatchObject({ready:false,readyPulse:0,readySince:null});
  });

  it('consumes paused events and thresholds without replaying them on resume',()=>{
    const manager=new FeedbackManager(),current=state([event(1,'Perfect',20,100)],20,100);
    expect(manager.update({...current,paused:true})).toMatchObject({newEvents:[],readyPulse:0});
    expect(manager.update(current)).toMatchObject({newEvents:[],readyPulse:0,ready:true});
  });

  it('keeps a finisher start time after its short-lived HUD event expires',()=>{
    const finish={...event(1,'Cut'),finisher:true},current=state([finish]);
    const manager=new FeedbackManager();
    manager.update({...current,battle:{...current.battle,bossHp:0}});
    const after=manager.update({...current,time:1400,effects:[],battle:{...current.battle,bossHp:0}});
    expect(after.events).toEqual([]);
    expect(after.actorFeedback).toBe(finish);
  });

  it('does not truncate legacy jelly taunts when the HUD journal expires',()=>{
    const manager=new FeedbackManager(),miss=event(1,'Miss'),current={...createCombat(7319,'jelly'),feedback:miss,effects:[miss]};
    manager.update(current);
    const after=manager.update({...current,time:700,effects:[]});
    expect(after.events).toEqual([]);
    expect(after.actorFeedback).toBe(miss);
    expect(manager.update({...current,time:720,effects:[]}).actorFeedback).toBeNull();
  });

  it('clears consumption, energy flights and Ready state on reset or dispose',()=>{
    const manager=new FeedbackManager(),current=state([event(1,'Perfect',0,100)],0,100);
    manager.update(current);manager.reset();
    expect(manager.update(state([],0,0))).toMatchObject({events:[],ready:false,readyPulse:0,visualMeter:0});
    expect(manager.update(current).newEvents).toHaveLength(1);
    manager.dispose();
    expect(manager.update(current).newEvents).toHaveLength(1);
  });

  it('does not carry same-time, same-ID feedback into a different battle',()=>{
    const manager=new FeedbackManager(),current=state([event(1,'Perfect',0,100)],0,100);
    manager.update(current);
    const next={...state([event(1,'Nice',0,14)],0,14),battleId:'next-battle'};
    expect(manager.update(next)).toMatchObject({ready:false,readyPulse:0,visualMeter:0});
    expect(manager.update(next).newEvents).toEqual([]);
  });
});
