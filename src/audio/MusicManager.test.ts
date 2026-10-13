import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicManager } from './MusicManager';

class FakeAudio extends EventTarget {
  paused=true;
  currentTime=0;
  volume=1;
  loop=false;
  preload='';
  play=vi.fn(async()=>{this.paused=false});
  pause=vi.fn(()=>{this.paused=true});
  load=vi.fn();
  removeAttribute=vi.fn();
  asAudio(){return this as unknown as HTMLAudioElement;}
}
class FakeMusicContext {
  state:AudioContextState='suspended';
  destination={};
  gain={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};
  source={connect:vi.fn(),disconnect:vi.fn()};
  createGain=vi.fn(()=>this.gain);
  createMediaElementSource=vi.fn(()=>this.source);
  resume=vi.fn(async()=>{this.state='running';});
  close=vi.fn(async()=>{this.state='closed';});
  asContext(){return this as unknown as AudioContext;}
}
const config={url:'/assets/audio/bgm.mp3',volume:.16,duckVolume:.055};
const deferred=()=>{
  let resolve!:()=>void,reject!:(error:Error)=>void;
  const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
afterEach(()=>{vi.useRealTimers();});

describe('independent background music',()=>{
  it('does not create or start media until a gesture, and preserves position across pauses/routes',async()=>{
    const audio=new FakeAudio(),createAudio=vi.fn(()=>audio.asAudio());
    const music=new MusicManager(config,{createAudio});
    music.setSuspended(false);
    expect(createAudio).not.toHaveBeenCalled();
    music.gesture();await flush();
    expect(createAudio).toHaveBeenCalledOnce();
    expect(audio.loop).toBe(true);expect(audio.preload).toBe('metadata');expect(audio.volume).toBe(.16);
    audio.currentTime=37.2;
    for(let i=0;i<20;i++){music.gesture();music.setSuspended(false);}
    expect(audio.play).toHaveBeenCalledOnce();
    music.setSuspended(true);expect(audio.paused).toBe(true);
    music.setSuspended(false);await flush();
    expect(audio.play).toHaveBeenCalledTimes(2);expect(audio.currentTime).toBe(37.2);
    expect(audio.load).not.toHaveBeenCalled();
    music.dispose();
  });

  it('never starts from a resume with no prior gesture',()=>{
    const createAudio=vi.fn();
    const music=new MusicManager(config,{createAudio});
    music.setSuspended(true);music.setSuspended(false);
    expect(createAudio).not.toHaveBeenCalled();music.dispose();
  });

  it('handles rejected and synchronous play failures, and retries only on a later gesture',async()=>{
    const audio=new FakeAudio();
    audio.play.mockRejectedValueOnce(new Error('autoplay denied')).mockImplementationOnce(()=>{throw new Error('blocked');});
    const music=new MusicManager(config,{createAudio:()=>audio.asAudio()});
    music.gesture();await flush();
    for(let i=0;i<5;i++){music.setSuspended(true);music.setSuspended(false);}
    expect(audio.play).toHaveBeenCalledOnce();
    expect(()=>music.gesture()).not.toThrow();await flush();
    expect(audio.play).toHaveBeenCalledTimes(2);
    music.gesture();await flush();
    expect(audio.play).toHaveBeenCalledTimes(3);expect(audio.paused).toBe(false);music.dispose();
  });

  it('contains construction and load errors without affecting gameplay',()=>{
    for(const createAudio of [()=>null,()=>{throw new Error('not supported');}]){
      const music=new MusicManager(config,{createAudio});
      expect(()=>{music.gesture();music.duck();music.setSuspended(true);music.dispose();}).not.toThrow();
    }
    const audio=new FakeAudio();audio.load.mockImplementation(()=>{throw new Error('media unavailable');});
    const music=new MusicManager(config,{createAudio:()=>audio.asAudio()});
    music.gesture();audio.dispatchEvent(new Event('error'));
    expect(()=>{music.gesture();music.dispose();}).not.toThrow();
  });

  it('recovers a media error only on a new gesture and removes the error listener on disposal',async()=>{
    const audio=new FakeAudio();
    const remove=vi.spyOn(audio,'removeEventListener');
    const music=new MusicManager(config,{createAudio:()=>audio.asAudio()});
    music.gesture();await flush();
    audio.dispatchEvent(new Event('error'));expect(audio.paused).toBe(true);
    music.setSuspended(true);music.setSuspended(false);
    expect(audio.play).toHaveBeenCalledOnce();
    music.gesture();await flush();
    expect(audio.load).toHaveBeenCalledOnce();expect(audio.play).toHaveBeenCalledTimes(2);
    music.dispose();
    expect(remove).toHaveBeenCalledWith('error',expect.any(Function));
    expect(audio.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('keeps delayed play silent after pause/disposal and does not cancel a newer resume',async()=>{
    const audio=new FakeAudio(),old=deferred();
    audio.play.mockImplementationOnce(()=>old.promise.then(()=>{audio.paused=false;}));
    const music=new MusicManager(config,{createAudio:()=>audio.asAudio()});
    music.gesture();music.setSuspended(true);old.resolve();await flush();await flush();
    expect(audio.paused).toBe(true);
    const delayed=deferred();audio.play.mockImplementationOnce(()=>delayed.promise.then(()=>{audio.paused=false;}));
    music.setSuspended(false);music.setSuspended(true);music.setSuspended(false);await flush();
    expect(audio.paused).toBe(false);
    delayed.resolve();await flush();await flush();expect(audio.paused).toBe(false);
    music.dispose();
    const replacement=new FakeAudio(),after=deferred();
    replacement.play.mockImplementation(()=>after.promise.then(()=>{replacement.paused=false;}));
    const disposed=new MusicManager(config,{createAudio:()=>replacement.asAudio()});
    disposed.gesture();disposed.dispose();after.resolve();await flush();await flush();
    expect(replacement.paused).toBe(true);
  });

  it('does not let delayed playback restart after a media error',async()=>{
    const audio=new FakeAudio(),pending=deferred();
    audio.play.mockImplementationOnce(()=>pending.promise.then(()=>{audio.paused=false;}));
    const music=new MusicManager(config,{createAudio:()=>audio.asAudio()});
    music.gesture();audio.dispatchEvent(new Event('error'));pending.resolve();await flush();await flush();
    expect(audio.paused).toBe(true);music.dispose();
  });

  it('smoothly ducks, extends overlaps, recovers and removes all timers while paused',async()=>{
    vi.useFakeTimers();
    const audio=new FakeAudio(),music=new MusicManager(config,{createAudio:()=>audio.asAudio()});
    music.gesture();await flush();
    music.duck(500);await vi.advanceTimersByTimeAsync(96);
    expect(audio.volume).toBeCloseTo(.055);
    await vi.advanceTimersByTimeAsync(304);music.duck(500);
    await vi.advanceTimersByTimeAsync(300);expect(audio.volume).toBeCloseTo(.055);
    await vi.advanceTimersByTimeAsync(500);expect(audio.volume).toBeCloseTo(.16);
    music.duck(3000);music.setSuspended(true);
    expect(audio.volume).toBe(.16);expect(vi.getTimerCount()).toBe(0);
    music.dispose();
  });

  it('uses a streaming gain node for mobile volume/duck and never decodes the music track',async()=>{
    vi.useFakeTimers();
    const audio=new FakeAudio(),context=new FakeMusicContext();
    const music=new MusicManager(config,{createAudio:()=>audio.asAudio(),createContext:()=>context.asContext()});
    music.gesture();await flush();
    expect(context.createMediaElementSource).toHaveBeenCalledWith(audio);
    expect(context.source.connect).toHaveBeenCalledWith(context.gain);
    expect(context.gain.connect).toHaveBeenCalledWith(context.destination);
    expect(context.resume).toHaveBeenCalledOnce();expect(context.gain.gain.value).toBe(.16);
    expect(audio.volume).toBe(1);
    music.duck(1000);await vi.advanceTimersByTimeAsync(96);
    expect(context.gain.gain.value).toBeCloseTo(.055);expect(audio.volume).toBe(1);
    music.dispose();expect(context.close).toHaveBeenCalledOnce();
    expect(context.source.disconnect).toHaveBeenCalledOnce();expect(context.gain.disconnect).toHaveBeenCalledOnce();
  });

  it('catches denied Web Audio resume and retries it on a gesture while media is playing',async()=>{
    const audio=new FakeAudio(),context=new FakeMusicContext();
    context.resume.mockRejectedValueOnce(new Error('denied'));
    const music=new MusicManager(config,{createAudio:()=>audio.asAudio(),createContext:()=>context.asContext()});
    music.gesture();await flush();music.gesture();await flush();
    expect(context.resume).toHaveBeenCalledTimes(2);expect(audio.play).toHaveBeenCalledOnce();music.dispose();
  });

  it('falls back to media volume when the optional Web Audio output cannot be created',async()=>{
    for(const createContext of [()=>null,()=>{throw new Error('unsupported');}]){
      const audio=new FakeAudio(),music=new MusicManager(config,{createAudio:()=>audio.asAudio(),createContext});
      music.gesture();await flush();expect(audio.volume).toBe(.16);expect(audio.paused).toBe(false);music.dispose();
    }
  });

  it('releases nodes, media and duck timers through twenty complete lifecycle cycles',async()=>{
    vi.useFakeTimers();
    for(let i=0;i<20;i++){
      const audio=new FakeAudio(),context=new FakeMusicContext();
      const music=new MusicManager(config,{createAudio:()=>audio.asAudio(),createContext:()=>context.asContext()});
      music.gesture();await flush();music.duck();music.dispose();music.dispose();music.gesture();
      expect(context.close).toHaveBeenCalledOnce();expect(audio.play).toHaveBeenCalledOnce();
      expect(audio.paused).toBe(true);expect(vi.getTimerCount()).toBe(0);
    }
  });
});
