import { describe, expect, it, vi } from 'vitest';
import { AudioManager } from './AudioManager';
import { GameAudioController, connectGameAudio, createBattleAudio, isAudioUiTarget, type GameAudioSnapshot } from './GameAudio';

const snapshot=(values:Partial<GameAudioSnapshot>={}):GameAudioSnapshot=>({screen:'restaurant',battleId:null,paused:false,won:false,...values});
function setup(){
  const shortAudio={unlock:vi.fn(async()=>{}),playCue:vi.fn(),stopCue:vi.fn(),stopAll:vi.fn(),dispose:vi.fn()};
  const music={gesture:vi.fn(),setSuspended:vi.fn(),duck:vi.fn(),dispose:vi.fn()};
  const preload=vi.fn(async()=>{});
  const controller=new GameAudioController({shortAudio,music,preload});
  return {controller,shortAudio,music,preload};
}
function target({parry=false,disabled=false,ariaDisabled=false,inert=false,interactive=true}={}){
  const control={matches:()=>disabled,closest:()=>ariaDisabled||inert?{}:null};
  return {closest:(selector:string)=>selector.startsWith('.parry-target')?(parry?{}:null):interactive?control:null} as unknown as EventTarget;
}
class FakeDocument extends EventTarget {
  hidden=false;
  subscriptions=0;
  addEventListener(type:string,callback:EventListenerOrEventListenerObject|null,options?:AddEventListenerOptions|boolean){
    this.subscriptions++;super.addEventListener(type,callback,options);
  }
  removeEventListener(type:string,callback:EventListenerOrEventListenerObject|null,options?:EventListenerOptions|boolean){
    this.subscriptions--;super.removeEventListener(type,callback,options);
  }
  fire(type:string,element?:EventTarget){
    const event=new Event(type);
    if(element)Object.defineProperty(event,'target',{value:element});
    this.dispatchEvent(event);
  }
  asDocument(){return this as unknown as Document;}
}
class FakeSharedContext {
  state:AudioContextState='suspended';
  currentTime=0;
  destination={};
  oscillators:Array<{stop:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}>=[];
  createOscillator=vi.fn(()=>{
    const node={type:'sine',frequency:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},
      onended:null,start:vi.fn(),stop:vi.fn(),connect:vi.fn(),disconnect:vi.fn()};
    this.oscillators.push(node);return node;
  });
  createGain=vi.fn(()=>({gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()}));
  resume=vi.fn(async()=>{this.state='running';});
  close=vi.fn(async()=>{this.state='closed';});
  asContext(){return this as unknown as AudioContext;}
}

describe('application-wide audio connection',()=>{
  it('preloads without autoplay and unlocks only after gesture',()=>{
    const {controller,shortAudio,music,preload}=setup();
    controller.update(snapshot());controller.prepare();controller.prepare();
    expect(preload).toHaveBeenCalledOnce();expect(shortAudio.unlock).not.toHaveBeenCalled();expect(music.gesture).not.toHaveBeenCalled();
    controller.gesture();controller.uiClick();
    expect(shortAudio.playCue).toHaveBeenCalledExactlyOnceWith('UI');
    expect(music.gesture).toHaveBeenCalledTimes(2);expect(preload).toHaveBeenCalledOnce();controller.dispose();
  });

  it('keeps music running across routes and plays each battle result once despite retries/navigation',()=>{
    const {controller,music,shortAudio}=setup();controller.gesture();
    for(const screen of ['stages','battle','kitchen','shop','inventory'])controller.update(snapshot({screen,battleId:'a'}));
    expect(music.setSuspended).not.toHaveBeenCalled();
    const won=snapshot({screen:'result',battleId:'a',won:true});
    controller.update(won);controller.update(won);controller.update(snapshot());controller.update(won);
    controller.update(snapshot({screen:'result',battleId:'b',won:false}));
    expect(shortAudio.playCue.mock.calls).toEqual([['Victory'],['Defeat']]);
    expect(music.duck.mock.calls).toEqual([[3700],[3000]]);controller.dispose();
  });

  it('consumes a result while silent/hidden without replay on unlock or refocus',()=>{
    const {controller,shortAudio}=setup();
    const result=snapshot({screen:'result',battleId:'silent',won:true});
    controller.update(result);controller.gesture();controller.update(result);
    controller.update({...result,battleId:'hidden'},true);controller.update({...result,battleId:'hidden'});
    expect(shortAudio.playCue).not.toHaveBeenCalled();controller.dispose();
  });

  it('stops only old result cues on navigation or a different result without interrupting music/UI',()=>{
    const {controller,shortAudio,music}=setup();controller.gesture();
    const result=snapshot({screen:'result',battleId:'won',won:true});
    controller.update(result);controller.update(result);
    expect(shortAudio.stopCue).not.toHaveBeenCalled();
    controller.uiClick();controller.update(snapshot({screen:'stages',battleId:'won'}));
    expect(shortAudio.stopCue.mock.calls).toEqual([['Victory'],['Defeat']]);
    expect(shortAudio.stopAll).not.toHaveBeenCalled();expect(music.setSuspended).not.toHaveBeenCalled();
    controller.update(result);controller.update(snapshot({screen:'result',battleId:'lost'}));
    expect(shortAudio.playCue.mock.calls).toEqual([['Victory'],['UI'],['Defeat']]);
    expect(shortAudio.stopCue).toHaveBeenCalledTimes(4);controller.dispose();
  });

  it('shares the menu-unlocked context with a new battle so the first automatic Miss is audible',async()=>{
    const context=new FakeSharedContext(),createContext=vi.fn(()=>context.asContext());
    const shortAudio=new AudioManager({createContext});
    const music=setup().music;
    const controller=new GameAudioController({shortAudio,music,createBattleAudio:()=>shortAudio.fork()});
    controller.gesture();await Promise.resolve();await Promise.resolve();
    controller.update(snapshot({screen:'battle',battleId:'first'}));
    const first=controller.createBattleAudio();first.playCue('Miss');
    expect(context.oscillators).toHaveLength(1);expect(context.resume).toHaveBeenCalledOnce();expect(createContext).toHaveBeenCalledOnce();
    first.dispose();expect(context.close).not.toHaveBeenCalled();
    controller.update(snapshot({screen:'result',battleId:'first',won:true}));
    expect(context.oscillators).toHaveLength(2);
    controller.update(snapshot({screen:'battle',battleId:'second'}));
    expect(context.oscillators[1].disconnect).toHaveBeenCalledOnce();
    const second=controller.createBattleAudio();second.playCue('Miss');
    expect(context.oscillators).toHaveLength(3);expect(createContext).toHaveBeenCalledOnce();
    second.dispose();controller.dispose();expect(context.close).toHaveBeenCalledOnce();
  });

  it('provides an independent safe manager without an application controller',()=>{
    const audio=createBattleAudio();expect(audio).toBeInstanceOf(AudioManager);
    expect(()=>{audio.playCue('Miss');audio.dispose();}).not.toThrow();
  });

  it('stops shorts/music on pause and background, but does not resume while battle is still paused',()=>{
    const {controller,shortAudio,music,preload}=setup();
    const paused=snapshot({screen:'battle',battleId:'a',paused:true});
    controller.gesture();controller.update(paused);
    controller.uiClick();controller.gesture();
    expect(shortAudio.playCue).not.toHaveBeenCalled();expect(music.gesture).toHaveBeenCalledOnce();
    controller.update(paused,true);controller.update(paused,false);
    expect(music.setSuspended.mock.calls).toEqual([[true]]);
    controller.update({...paused,paused:false});
    expect(music.setSuspended.mock.calls).toEqual([[true],[false]]);expect(preload).toHaveBeenCalledTimes(2);
    controller.update({...paused,paused:false},true);expect(shortAudio.stopAll).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('remembers a first gesture on a paused overlay, but only starts when that pause ends',()=>{
    const {controller,music,shortAudio}=setup();
    const paused=snapshot({screen:'battle',battleId:'a',paused:true});
    controller.update(paused);controller.gesture();controller.gesture();
    expect(music.gesture).not.toHaveBeenCalled();expect(shortAudio.unlock).not.toHaveBeenCalled();
    controller.update({...paused,paused:false});
    expect(music.gesture).toHaveBeenCalledOnce();expect(shortAudio.unlock).toHaveBeenCalledOnce();controller.dispose();
  });

  it('catches global unlock/load failures without queuing cues for later replay',async()=>{
    const {controller,shortAudio,preload}=setup();
    shortAudio.unlock.mockRejectedValue(new Error('blocked'));preload.mockRejectedValue(new Error('offline'));
    expect(()=>{controller.prepare();controller.gesture();controller.uiClick();}).not.toThrow();
    await Promise.resolve();await Promise.resolve();
    expect(shortAudio.playCue).toHaveBeenCalledExactlyOnceWith('UI');controller.dispose();
  });

  it('recognizes enabled UI controls and excludes parry/disabled/inert/background targets',()=>{
    expect(isAudioUiTarget(target())).toBe(true);
    for(const element of [null,new EventTarget(),target({parry:true}),target({disabled:true}),target({ariaDisabled:true}),target({inert:true}),target({interactive:false})]){
      expect(isAudioUiTarget(element)).toBe(false);
    }
  });

  it('uses one click event for one UI sound and never treats target or pointer movement as a UI click',()=>{
    const {controller,shortAudio,music}=setup(),doc=new FakeDocument();
    const cleanup=connectGameAudio(controller,{document:doc.asDocument(),snapshot:()=>snapshot(),subscribe:()=>()=>{}});
    doc.fire('pointerdown',target());doc.fire('click',target());
    expect(shortAudio.playCue).toHaveBeenCalledExactlyOnceWith('UI');
    doc.fire('click',target({parry:true}));doc.fire('pointermove');doc.fire('pointermove');
    expect(shortAudio.playCue).toHaveBeenCalledOnce();expect(music.gesture).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('releases listeners/store subscriptions/audio on twenty mount/unmount cycles',()=>{
    const doc=new FakeDocument();let observers=0;
    for(let i=0;i<20;i++){
      const {controller,shortAudio,music}=setup();
      const gesture=vi.spyOn(controller,'gesture');
      const cleanup=connectGameAudio(controller,{document:doc.asDocument(),snapshot:()=>snapshot(),subscribe:()=>{observers++;return()=>{observers--;};}});
      expect(doc.subscriptions).toBe(4);expect(observers).toBe(1);
      doc.fire('pointerdown');cleanup();cleanup();
      expect(doc.subscriptions).toBe(0);expect(observers).toBe(0);
      expect(shortAudio.dispose).toHaveBeenCalledOnce();expect(music.dispose).toHaveBeenCalledOnce();
      doc.fire('pointerdown');doc.fire('click',target());controller.update(snapshot({screen:'result',battleId:String(i),won:true}));controller.duck();
      expect(gesture).toHaveBeenCalledOnce();
      expect(shortAudio.playCue).not.toHaveBeenCalled();expect(music.duck).not.toHaveBeenCalled();
    }
  });
});
