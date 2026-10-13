import { describe, expect, it, vi } from 'vitest';
import type { CombatFeedback } from '../domain/combat';
import { AudioManager } from './AudioManager';

class FakeParam {
  value=0;
  setValueAtTime=vi.fn((value:number)=>{this.value=value});
  exponentialRampToValueAtTime=vi.fn();
  linearRampToValueAtTime=vi.fn();
}
class FakeNode {
  connect=vi.fn((node:unknown)=>node);
  disconnect=vi.fn();
}
class FakeSource extends FakeNode {
  onended:(()=>void)|null=null;
  start=vi.fn();
  stop=vi.fn();
  finish(){this.onended?.()}
}
class FakeOscillator extends FakeSource {
  type:OscillatorType='sine';
  frequency=new FakeParam();
}
class FakeBufferSource extends FakeSource { buffer:AudioBuffer|null=null; playbackRate=new FakeParam(); }
class FakeGain extends FakeNode { gain=new FakeParam(); }
class FakeContext {
  state:AudioContextState='running';
  currentTime=12;
  destination=new FakeNode();
  oscillators:FakeOscillator[]=[];
  samples:FakeBufferSource[]=[];
  gains:FakeGain[]=[];
  createOscillator=vi.fn(()=>{const node=new FakeOscillator();this.oscillators.push(node);return node});
  createBufferSource=vi.fn(()=>{const node=new FakeBufferSource();this.samples.push(node);return node});
  createGain=vi.fn(()=>{const node=new FakeGain();this.gains.push(node);return node});
  resume=vi.fn(async()=>{this.state='running'});
  close=vi.fn(async()=>{this.state='closed'});
  decodeAudioData=vi.fn(async()=>({duration:.1} as AudioBuffer));
  asAudioContext(){return this as unknown as AudioContext}
}
const feedback=(id:number,kind:CombatFeedback['kind']='Nice',extra:Partial<CombatFeedback>={}):CombatFeedback=>({
  id,kind,amount:10,time:0,position:{x:.5,y:.5},energyGain:10,angle:0,...extra,
});
const response=(ok=true)=>({ok,arrayBuffer:async()=>new ArrayBuffer(8)});
const deferred=<T>()=>{
  let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});
  return {promise,resolve,reject};
};

describe('battle-scoped audio',()=>{
  it('plays one bomb cue per event and gives lethal feedback the finisher cue',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext()});
    await manager.unlock();
    const blast=feedback(1,'Cut',{bombDamage:10});
    manager.play(blast);manager.play(blast);
    manager.play(feedback(2,'Cut',{bombDamage:8,finisher:true}));
    expect(context.oscillators.map(node=>node.frequency.value)).toEqual([180,110]);
    expect(context.oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(45,12.18);
    manager.dispose();
  });

  it('synthesizes distinct judgments and preserves cut, finisher and ready cues',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext()});
    await manager.unlock();
    manager.play(feedback(1,'Perfect'));manager.play(feedback(2));manager.play(feedback(3,'Miss'));
    manager.play(feedback(4,'Cut',{speed:'ferocious'}));manager.play(feedback(5,'Cut',{finisher:true}));manager.playReady();
    expect(context.oscillators.map(node=>[node.type,node.frequency.value])).toEqual([
      ['triangle',720],['sine',460],['triangle',160],['sawtooth',330],['sawtooth',110],['triangle',640],
    ]);
    expect(context.oscillators[2].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(90,12.14);
    expect(context.oscillators[5].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1040,12.18);
    manager.dispose();
  });

  it('requests each event once even when events arrive out of order or are silent',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext()});
    manager.play(feedback(1));
    await manager.unlock();
    manager.play(feedback(1));manager.play(feedback(3));manager.play(feedback(2));manager.play(feedback(3));
    expect(context.oscillators).toHaveLength(2);
    manager.stopAll();manager.play(feedback(4));
    await manager.unlock();manager.play(feedback(4));manager.play(feedback(5));
    expect(context.oscillators).toHaveLength(3);
    manager.dispose();
  });

  it('caps overlapping voices and disconnects ended and evicted nodes',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext(),maxVoices:2});
    await manager.unlock();
    manager.play(feedback(1));manager.play(feedback(2));manager.play(feedback(3));
    expect(context.oscillators[0].stop).toHaveBeenCalledWith();
    expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0].disconnect).toHaveBeenCalledOnce();
    context.oscillators[1].finish();
    expect(context.oscillators[1].disconnect).toHaveBeenCalledOnce();
    manager.play(feedback(4));
    expect(context.oscillators[2].disconnect).not.toHaveBeenCalled();
    manager.stopAll();
    expect(context.oscillators.every(node=>node.disconnect.mock.calls.length===1)).toBe(true);
    manager.dispose();
  });

  it('stays safe when AudioContext is unavailable or construction is rejected',async()=>{
    for(const createContext of [()=>null,()=>{throw new Error('denied')}]){
      const manager=new AudioManager({createContext});
      await expect(manager.unlock()).resolves.toBeUndefined();
      await expect(manager.preload({Perfect:'/perfect.wav'})).resolves.toBeUndefined();
      expect(()=>{manager.play(feedback(1));manager.playReady();manager.stopAll();manager.dispose()}).not.toThrow();
    }
  });

  it('catches synchronous and asynchronous resume failures, then retries on a new gesture',async()=>{
    const context=new FakeContext();context.state='suspended';
    context.resume.mockRejectedValueOnce(new Error('gesture required')).mockImplementationOnce(()=>{throw new Error('denied')});
    const manager=new AudioManager({createContext:()=>context.asAudioContext()});
    await expect(manager.unlock()).resolves.toBeUndefined();manager.play(feedback(1));
    await expect(manager.unlock()).resolves.toBeUndefined();manager.play(feedback(2));
    expect(context.oscillators).toHaveLength(0);
    await manager.unlock();manager.play(feedback(3));
    expect(context.oscillators).toHaveLength(1);
    manager.dispose();
  });

  it('does not let a pending unlock re-enable or replay audio after pause or disposal',async()=>{
    const context=new FakeContext();context.state='suspended';
    const resume=deferred<void>();
    context.resume.mockImplementationOnce(()=>resume.promise.then(()=>{context.state='running'}));
    const manager=new AudioManager({createContext:()=>context.asAudioContext()});
    const unlocking=manager.unlock();expect(manager.unlock()).toBe(unlocking);
    expect(context.resume).toHaveBeenCalledOnce();
    manager.play(feedback(1));manager.stopAll();
    resume.resolve();await unlocking;manager.play(feedback(2));manager.playReady();
    expect(context.oscillators).toHaveLength(0);
    await manager.unlock();manager.play(feedback(1));manager.play(feedback(2));manager.play(feedback(3));
    expect(context.oscillators).toHaveLength(1);
    context.state='suspended';const afterDispose=deferred<void>();
    context.resume.mockImplementationOnce(()=>afterDispose.promise.then(()=>{context.state='running'}));
    const pending=manager.unlock();manager.dispose();afterDispose.resolve();await pending;
    manager.playReady();manager.play(feedback(4));
    expect(context.oscillators).toHaveLength(1);
  });

  it('keeps an old delayed resume isolated from a replacement battle',async()=>{
    const oldContext=new FakeContext();oldContext.state='suspended';
    const oldResume=deferred<void>();
    oldContext.resume.mockImplementationOnce(()=>oldResume.promise.then(()=>{oldContext.state='running'}));
    const oldBattle=new AudioManager({createContext:()=>oldContext.asAudioContext()});
    const pending=oldBattle.unlock();oldBattle.play(feedback(1,'Perfect'));
    oldBattle.stopAll();oldBattle.dispose();
    const newContext=new FakeContext(),newBattle=new AudioManager({createContext:()=>newContext.asAudioContext()});
    await newBattle.unlock();newBattle.play(feedback(1,'Perfect'));newBattle.play(feedback(2,'Nice'));
    oldResume.resolve();await pending;oldBattle.playReady();oldBattle.play(feedback(2));
    expect(oldContext.oscillators).toHaveLength(0);expect(oldContext.close).toHaveBeenCalledOnce();
    expect(newContext.oscillators).toHaveLength(2);
    expect(newContext.oscillators.every(node=>node.disconnect.mock.calls.length===0)).toBe(true);
    newBattle.dispose();
  });

  it('falls back to synthesis on HTTP, network and decode failures',async()=>{
    const context=new FakeContext();
    const fetchAsset=vi.fn().mockResolvedValueOnce(response(false)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response());
    context.decodeAudioData.mockRejectedValueOnce(new Error('bad format'));
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset});
    await manager.unlock();
    await expect(manager.preload({Perfect:'/missing',Nice:'/offline',Miss:'/invalid'})).resolves.toBeUndefined();
    manager.play(feedback(1,'Perfect'));manager.play(feedback(2));manager.play(feedback(3,'Miss'));
    expect(context.oscillators).toHaveLength(3);expect(context.samples).toHaveLength(0);
    manager.dispose();
  });

  it('plays registered samples and falls back when a sample cannot start',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response()});
    await manager.unlock();await manager.preload({Perfect:'/perfect.wav'});
    manager.play(feedback(1,'Perfect'));
    expect(context.samples).toHaveLength(1);expect(context.samples[0].start).toHaveBeenCalledWith(12,0,.1);
    context.samples[0].finish();expect(context.gains[0].disconnect).toHaveBeenCalledOnce();
    const broken=new FakeBufferSource();broken.start.mockImplementation(()=>{throw new Error('playback rejected')});
    context.createBufferSource.mockReturnValueOnce(broken);
    manager.play(feedback(2,'Perfect'));
    expect(broken.disconnect).toHaveBeenCalledOnce();expect(context.oscillators).toHaveLength(1);
    manager.dispose();
  });

  it('cancels pending fetches and ignores stale decoding after pause',async()=>{
    const context=new FakeContext(),download=deferred<ReturnType<typeof response>>(),decode=deferred<AudioBuffer>();
    const fetchAsset=vi.fn().mockReturnValueOnce(download.promise).mockResolvedValueOnce(response());
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset});
    await manager.unlock();
    const pendingFetch=manager.preload({Nice:'/nice.wav'});
    const signal=fetchAsset.mock.calls[0][1].signal as AbortSignal;
    manager.stopAll();expect(signal.aborted).toBe(true);download.resolve(response());await pendingFetch;
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    context.decodeAudioData.mockReturnValueOnce(decode.promise);
    const pendingDecode=manager.preload({Perfect:'/perfect.wav'});
    await vi.waitFor(()=>expect(context.decodeAudioData).toHaveBeenCalledOnce());
    manager.stopAll();decode.resolve({duration:.1} as AudioBuffer);await pendingDecode;
    await manager.unlock();manager.play(feedback(1,'Perfect'));manager.play(feedback(2));
    expect(context.samples).toHaveLength(0);expect(context.oscillators).toHaveLength(2);
    manager.dispose();
  });

  it('does not replace a newer sample with an older download',async()=>{
    const context=new FakeContext(),old=deferred<ReturnType<typeof response>>();
    const fetchAsset=vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response());
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset});
    await manager.unlock();const previous=manager.preload({Perfect:'/old.wav'});
    await manager.preload({Perfect:'/new.wav'});old.resolve(response());await previous;
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    manager.play(feedback(1,'Perfect'));expect(context.samples).toHaveLength(1);
    manager.dispose();
  });

  it('cleans partial nodes on synth errors and catches close rejection',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext()});
    await manager.unlock();context.createGain.mockImplementationOnce(()=>{throw new Error('allocation failed')});
    expect(()=>manager.play(feedback(1))).not.toThrow();
    expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    const broken=new FakeOscillator();broken.connect.mockImplementation(()=>{throw new Error('connect failed')});
    context.createOscillator.mockReturnValueOnce(broken);manager.play(feedback(2));
    expect(broken.disconnect).toHaveBeenCalledOnce();
    context.close.mockRejectedValueOnce(new Error('already closed'));
    expect(()=>manager.dispose()).not.toThrow();await Promise.resolve();
    expect(context.close).toHaveBeenCalledOnce();manager.dispose();expect(context.close).toHaveBeenCalledOnce();
  });

  it('releases every source, gain and context across twenty repeated battles',async()=>{
    for(let battle=0;battle<20;battle++){
      const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext()});
      await manager.unlock();
      manager.play(feedback(0,'Perfect'));manager.play(feedback(1,'Nice'));
      manager.stopAll();
      expect(context.oscillators.every(node=>node.disconnect.mock.calls.length===1)).toBe(true);
      await manager.unlock();
      for(let id=2;id<12;id++)manager.play(feedback(id));
      manager.stopAll();
      manager.dispose();manager.dispose();
      expect(context.close).toHaveBeenCalledOnce();
      expect(context.oscillators.every(node=>node.disconnect.mock.calls.length===1&&node.onended===null)).toBe(true);
      expect(context.gains.every(node=>node.disconnect.mock.calls.length===1)).toBe(true);
      await manager.unlock();manager.play(feedback(13));manager.playReady();
      expect(context.oscillators).toHaveLength(12);
    }
  });
});

describe('configured audio samples',()=>{
  it('applies sample gain, speed, trims and short edge fades without changing synth gain',async()=>{
    const context=new FakeContext();context.decodeAudioData.mockResolvedValue({duration:2} as AudioBuffer);
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response()});
    await manager.preload({Perfect:{url:'/hit.mp3',volume:3.3,playbackRate:1.25,offset:.18,duration:1,layerSynth:true}});
    await manager.unlock();manager.play(feedback(1,'Perfect'));
    expect(context.samples).toHaveLength(1);
    expect(context.samples[0].playbackRate.setValueAtTime).toHaveBeenCalledWith(1.25,12);
    expect(context.samples[0].start).toHaveBeenCalledWith(12,.18,1);
    expect(context.samples[0].stop).toHaveBeenCalledWith(12.805000000000001);
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0,12);
    expect(context.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(3.3,12.004);
    expect(context.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0,12.8);
    expect(context.oscillators).toHaveLength(1);
    expect(context.gains[1].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(.055,12.008);
    manager.dispose();
  });

  it('bounds unsafe configuration and never trims beyond the decoded sample',async()=>{
    const context=new FakeContext();context.decodeAudioData.mockResolvedValue({duration:2} as AudioBuffer);
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response()});
    await manager.preload({UI:{url:'/ui.mp3',volume:900,playbackRate:100,offset:-1,duration:900}});
    await manager.unlock();manager.playCue('UI');
    expect(context.samples[0].playbackRate.setValueAtTime).toHaveBeenCalledWith(4,12);
    expect(context.samples[0].start).toHaveBeenCalledWith(12,0,2);
    expect(context.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(8,12.004);
    await manager.preload({UI:{url:'/ui.mp3',volume:Number.NaN,playbackRate:-2,offset:90}});
    manager.playCue('UI');
    expect(context.samples[1].playbackRate.setValueAtTime).toHaveBeenCalledWith(.25,12);
    expect(context.samples[1].start.mock.calls[0][1]).toBe(1.995);
    expect(context.samples[1].start.mock.calls[0][2]).toBeCloseTo(.005);
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(.65,12.004);
    manager.dispose();
  });

  it('shares one download and decoded buffer while retaining independent cue volumes',async()=>{
    const context=new FakeContext(),fetchAsset=vi.fn(async()=>response());
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset});
    await Promise.all([
      manager.preload({Nice:{url:'/hit.mp3',volume:2.7},Perfect:{url:'/hit.mp3',volume:3.3,layerSynth:true}}),
      manager.preload({Cut:{url:'/hit.mp3',volume:2.3}}),
    ]);
    expect(fetchAsset).toHaveBeenCalledOnce();expect(context.decodeAudioData).toHaveBeenCalledOnce();
    await manager.unlock();manager.play(feedback(1));manager.play(feedback(2,'Perfect'));manager.play(feedback(3,'Cut'));
    expect(context.samples).toHaveLength(3);expect(context.oscillators).toHaveLength(1);
    expect(context.samples[0].buffer).toBe(context.samples[1].buffer);
    expect(context.gains.map(gain=>gain.gain.linearRampToValueAtTime.mock.calls[0]?.[0])).toEqual([2.7,3.3,undefined,2.3]);
    await manager.preload({Nice:{url:'/hit.mp3',volume:2.7}});
    expect(fetchAsset).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('uses exactly one synth fallback for a failed layered sample and retains missing cue synthesis',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response()});
    await manager.preload({Perfect:{url:'/hit.mp3',volume:3,layerSynth:true}});await manager.unlock();
    const broken=new FakeBufferSource();broken.start.mockImplementation(()=>{throw new Error('sample failed')});
    context.createBufferSource.mockReturnValueOnce(broken);
    manager.play(feedback(1,'Perfect'));manager.play(feedback(1,'Perfect'));
    expect(context.oscillators).toHaveLength(1);expect(broken.disconnect).toHaveBeenCalledOnce();
    manager.playReady();manager.playCue('Bomb');manager.playCue('UI');manager.playCue('Victory');
    manager.playCue('Defeat');manager.playCue('VerdictEnd');manager.playCue('SwingMiss');
    expect(context.oscillators.map(node=>node.frequency.value)).toEqual([720,640,180,640,520,250,240,300]);
    manager.dispose();
  });

  it('throttles rapid cuts without suppressing independent same-frame parry judgments',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response()});
    await manager.preload({Cut:{url:'/hit.mp3',cooldownMs:55},Nice:'/hit.mp3',Perfect:'/hit.mp3'});
    await manager.unlock();manager.play(feedback(1,'Cut'));context.currentTime=12.02;manager.play(feedback(2,'Cut'));
    manager.play(feedback(3));manager.play(feedback(4));manager.play(feedback(5,'Perfect'));manager.play(feedback(6,'Perfect'));
    expect(context.samples).toHaveLength(5);
    context.currentTime=12.056;manager.play(feedback(7,'Cut'));expect(context.samples).toHaveLength(6);
    manager.stopAll();await manager.unlock();manager.play(feedback(7,'Cut'));
    expect(context.samples).toHaveLength(6);manager.play(feedback(8,'Cut'));expect(context.samples).toHaveLength(7);
    manager.dispose();
  });

  it('limits per-cue overlap by event and keeps layered sample/synth voices together',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response(),maxVoices:8});
    await manager.preload({Perfect:{url:'/hit.mp3',maxVoices:1,layerSynth:true}});await manager.unlock();
    manager.play(feedback(1,'Perfect'));manager.playReady();manager.play(feedback(2,'Perfect'));
    expect(context.samples[0].disconnect).toHaveBeenCalledOnce();
    expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(context.oscillators[1].disconnect).not.toHaveBeenCalled();
    expect(context.samples[1].start).toHaveBeenCalledOnce();expect(context.oscillators[2].start).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('protects Ready and ending cues from low-priority samples without substituting extra synths',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response(),maxVoices:2});
    await manager.preload({Cut:'/hit.mp3',UI:'/ui.mp3',VerdictEnd:'/end.mp3',Victory:'/win.mp3'});await manager.unlock();
    manager.playReady();manager.playCue('VerdictEnd');manager.play(feedback(1,'Cut'));manager.playCue('UI');
    expect(context.oscillators).toHaveLength(1);
    expect(context.samples[1].start).not.toHaveBeenCalled();expect(context.samples[2].start).not.toHaveBeenCalled();
    expect(context.oscillators[0].disconnect).not.toHaveBeenCalled();expect(context.samples[0].disconnect).not.toHaveBeenCalled();
    manager.playCue('Victory');expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(context.samples[0].disconnect).not.toHaveBeenCalled();expect(context.samples[3].start).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('does not evict a sample to add its synth layer when the global voice limit is one',async()=>{
    const context=new FakeContext(),manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response(),maxVoices:1});
    await manager.preload({Perfect:{url:'/hit.mp3',layerSynth:true}});await manager.unlock();manager.play(feedback(1,'Perfect'));
    expect(context.samples[0].start).toHaveBeenCalledOnce();expect(context.samples[0].disconnect).not.toHaveBeenCalled();
    expect(context.oscillators[0].start).not.toHaveBeenCalled();expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('retries an interrupted load on the next unlock without replaying silent events',async()=>{
    const context=new FakeContext(),download=deferred<ReturnType<typeof response>>();
    const fetchAsset=vi.fn().mockReturnValueOnce(download.promise).mockResolvedValue(response());
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset});
    const pending=manager.preload({Nice:'/hit.mp3',Perfect:{url:'/hit.mp3',layerSynth:true}});
    manager.play(feedback(1));manager.stopAll();await manager.unlock();
    await vi.waitFor(()=>expect(context.decodeAudioData).toHaveBeenCalledOnce());
    expect(context.samples).toHaveLength(0);expect(context.oscillators).toHaveLength(0);
    download.resolve(response());await pending;
    expect(fetchAsset).toHaveBeenCalledTimes(2);expect(context.decodeAudioData).toHaveBeenCalledOnce();
    manager.play(feedback(1));expect(context.samples).toHaveLength(0);
    manager.play(feedback(2));expect(context.samples).toHaveLength(1);
    manager.dispose();
  });

  it('retains sample configuration until a later gesture can create an audio context',async()=>{
    const context=new FakeContext(),createContext=vi.fn().mockReturnValueOnce(null).mockReturnValue(context.asAudioContext());
    const fetchAsset=vi.fn(async()=>response()),manager=new AudioManager({createContext,fetchAsset});
    await manager.preload({UI:'/ui.mp3'});expect(fetchAsset).not.toHaveBeenCalled();
    await manager.unlock();await vi.waitFor(()=>expect(context.decodeAudioData).toHaveBeenCalledOnce());
    manager.playCue('UI');expect(context.samples).toHaveLength(1);
    manager.dispose();
  });

  it('does not retry a failed URL on every gesture and never resumes loads after disposal',async()=>{
    const context=new FakeContext(),download=deferred<ReturnType<typeof response>>();
    const fetchAsset=vi.fn().mockResolvedValueOnce(response(false)).mockReturnValueOnce(download.promise);
    const manager=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset});
    await manager.preload({UI:'/missing.mp3'});await manager.unlock();await manager.unlock();
    expect(fetchAsset).toHaveBeenCalledOnce();manager.playCue('UI');expect(context.oscillators).toHaveLength(1);
    const retry=manager.preload({UI:'/missing.mp3'});manager.stopAll();manager.dispose();
    await manager.unlock();download.resolve(response());await retry;
    expect(fetchAsset).toHaveBeenCalledTimes(2);expect(context.decodeAudioData).not.toHaveBeenCalled();
    manager.playCue('UI');expect(context.samples).toHaveLength(0);expect(context.oscillators).toHaveLength(1);
  });
});

describe('application context and playback scopes',()=>{
  it('shares a gesture-unlocked context while keeping feedback IDs independent',async()=>{
    const context=new FakeContext();context.state='suspended';
    const createContext=vi.fn(()=>context.asAudioContext()),app=new AudioManager({createContext});
    await app.unlock();app.play(feedback(1));
    const battle=app.fork();battle.play(feedback(1,'Perfect'));
    expect(createContext).toHaveBeenCalledOnce();expect(context.resume).toHaveBeenCalledOnce();
    expect(context.oscillators.map(source=>source.frequency.value)).toEqual([460,720]);
    await battle.unlock();battle.play(feedback(2));
    expect(context.resume).toHaveBeenCalledOnce();expect(context.oscillators).toHaveLength(3);
    battle.dispose();expect(context.close).not.toHaveBeenCalled();
    app.playCue('UI');expect(context.oscillators.at(-1)?.start).toHaveBeenCalledOnce();
    app.dispose();expect(context.close).toHaveBeenCalledOnce();
  });

  it('allows a fork created before the first gesture to reuse the parent context afterwards',async()=>{
    const context=new FakeContext();context.state='suspended';
    const createContext=vi.fn(()=>context.asAudioContext()),fetchAsset=vi.fn(async()=>response());
    const app=new AudioManager({createContext,fetchAsset}),battle=app.fork();
    await battle.preload({Nice:'/hit.mp3'});battle.play(feedback(1));
    expect(createContext).toHaveBeenCalledOnce();expect(context.samples).toHaveLength(0);
    await app.unlock();await battle.unlock();battle.play(feedback(1));battle.play(feedback(2));
    expect(context.samples).toHaveLength(1);expect(context.resume).toHaveBeenCalledOnce();
    app.dispose();expect(context.close).toHaveBeenCalledOnce();
  });

  it('isolates parent and child stopAll, cooldowns, configuration and voice budgets',async()=>{
    const context=new FakeContext(),app=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response(),maxVoices:1});
    await app.unlock();const battle=app.fork();
    await app.preload({UI:{url:'/ui.mp3',volume:.1,cooldownMs:100}});
    await battle.preload({Nice:{url:'/hit.mp3',volume:2.7}});
    app.playCue('UI');battle.play(feedback(1));
    expect(context.samples[0].disconnect).not.toHaveBeenCalled();expect(context.samples[1].disconnect).not.toHaveBeenCalled();
    battle.stopAll();expect(context.samples[1].disconnect).toHaveBeenCalledOnce();
    expect(context.samples[0].disconnect).not.toHaveBeenCalled();
    context.currentTime+=.11;app.playCue('UI');expect(context.samples).toHaveLength(3);
    await battle.unlock();battle.play(feedback(2));app.stopAll();
    expect(context.samples[2].disconnect).toHaveBeenCalledOnce();expect(context.samples[3].disconnect).not.toHaveBeenCalled();
    battle.play(feedback(3));expect(context.samples).toHaveLength(5);
    expect(context.samples[4].start).toHaveBeenCalledOnce();
    app.dispose();expect(context.close).toHaveBeenCalledOnce();
  });

  it('stops only the requested cue and leaves the manager enabled',async()=>{
    const context=new FakeContext(),app=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:async()=>response()});
    await app.preload({Victory:{url:'/win.mp3',cooldownMs:500},UI:'/ui.mp3'});await app.unlock();
    app.playCue('Victory');app.playCue('UI');app.playReady();app.stopCue('Victory');
    expect(context.samples[0].disconnect).toHaveBeenCalledOnce();expect(context.samples[1].disconnect).not.toHaveBeenCalled();
    expect(context.oscillators[0].disconnect).not.toHaveBeenCalled();
    app.playCue('Victory');expect(context.samples[2].start).toHaveBeenCalledOnce();
    app.stopCue('Victory');app.stopCue('Victory');expect(context.samples[2].disconnect).toHaveBeenCalledOnce();
    app.playCue('UI');expect(context.samples[3].start).toHaveBeenCalledOnce();
    app.dispose();
  });

  it('safely disposes live forks and ignores their delayed loads when the application closes first',async()=>{
    const context=new FakeContext(),download=deferred<ReturnType<typeof response>>();
    const app=new AudioManager({createContext:()=>context.asAudioContext(),fetchAsset:()=>download.promise});
    await app.unlock();const battle=app.fork(),nested=battle.fork();
    battle.playReady();nested.play(feedback(1));
    const pending=battle.preload({Nice:'/hit.mp3'});
    app.dispose();expect(context.close).toHaveBeenCalledOnce();
    expect(context.oscillators.every(source=>source.disconnect.mock.calls.length===1)).toBe(true);
    download.resolve(response());await pending;await battle.unlock();await nested.unlock();
    battle.play(feedback(2));nested.playReady();expect(context.oscillators).toHaveLength(2);
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    const after=app.fork();await after.unlock();after.playReady();after.dispose();battle.dispose();nested.dispose();
    expect(context.oscillators).toHaveLength(2);expect(context.close).toHaveBeenCalledOnce();
  });
});
