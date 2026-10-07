import type { CombatFeedback } from '../domain/combat';

export type AudioCue = CombatFeedback['kind']|'Ready'|'Finisher';
export interface AudioManagerOptions {
  createContext?:()=>AudioContext|null;
  fetchAsset?:(url:string,options?:RequestInit)=>Promise<Pick<Response,'ok'|'arrayBuffer'>>;
  maxVoices?:number;
}
interface Voice { source:AudioScheduledSourceNode; gain:GainNode; released:boolean }
interface Tone { type:OscillatorType; frequency:number; endFrequency?:number; duration:number; volume:number; attack?:number }

function createBrowserContext():AudioContext|null {
  const browser=globalThis as typeof globalThis & {webkitAudioContext?:typeof AudioContext};
  const Context=browser.AudioContext??browser.webkitAudioContext;
  return Context?new Context():null;
}

function toneFor(cue:AudioCue,feedback?:CombatFeedback):Tone {
  switch(cue){
    case 'Perfect':return {type:'triangle',frequency:720,endFrequency:880,duration:.09,volume:.055};
    case 'Nice':return {type:'sine',frequency:460,duration:.07,volume:.055};
    case 'Miss':return {type:'triangle',frequency:160,endFrequency:90,duration:.14,volume:.055};
    case 'Ready':return {type:'triangle',frequency:640,endFrequency:1040,duration:.18,volume:.075,attack:.012};
    case 'Finisher':return {type:'sawtooth',frequency:110,endFrequency:55,duration:.16,volume:.14};
    case 'Verdict':return {type:'triangle',frequency:620,endFrequency:900,duration:.16,volume:.075};
    case 'Cut':{
      const speed=feedback?.speed??'normal';
      return {type:'sawtooth',frequency:speed==='ferocious'?330:speed==='fast'?270:210,
        duration:speed==='ferocious'?.1:speed==='fast'?.08:.07,volume:.075};
    }
  }
}

/** One instance per battle. Audio failure must never reject a combat action. */
export class AudioManager {
  private context:AudioContext|null=null;
  private readonly voices=new Set<Voice>();
  private readonly seenFeedback=new Set<number>();
  private readonly buffers=new Map<AudioCue,AudioBuffer>();
  private readonly requests=new Map<AudioCue,AbortController>();
  private readonly maxVoices:number;
  private generation=0;
  private enabled=false;
  private disposed=false;
  private unlocking:Promise<void>|null=null;

  constructor(private readonly options:AudioManagerOptions={}){
    const requested=options.maxVoices??8;
    this.maxVoices=Number.isFinite(requested)?Math.max(1,Math.min(32,Math.floor(requested))):8;
  }

  /** Call directly from a user gesture. Never queues sounds while resuming. */
  unlock():Promise<void> {
    if(this.disposed)return Promise.resolve();
    const context=this.getContext();
    if(!context||context.state==='closed')return Promise.resolve();
    if(this.unlocking)return this.unlocking;
    if(context.state==='running'){
      this.enabled=true;
      return Promise.resolve();
    }
    this.enabled=false;
    const generation=this.generation;
    try{
      this.unlocking=Promise.resolve(context.resume()).then(()=>{
        if(!this.disposed&&generation===this.generation&&context.state==='running')this.enabled=true;
      }).catch(()=>{/* A blocked browser stays silent until the next gesture. */}).finally(()=>{
        if(generation===this.generation)this.unlocking=null;
      });
      return this.unlocking;
    }catch{
      return Promise.resolve();
    }
  }

  play(feedback:CombatFeedback):void {
    if(this.disposed||this.seenFeedback.has(feedback.id))return;
    // Also consume silent events: unlocking later must not replay old feedback.
    this.seenFeedback.add(feedback.id);
    this.playCue(feedback.finisher?'Finisher':feedback.kind,feedback);
  }

  playReady():void { this.playCue('Ready'); }

  /** Optional future sample hook. Missing/invalid samples use the synth below. */
  async preload(assets:Partial<Record<AudioCue,string>>):Promise<void> {
    if(this.disposed)return;
    const context=this.getContext();
    if(!context)return;
    const generation=this.generation;
    await Promise.all((Object.entries(assets) as Array<[AudioCue,string]>).map(async([cue,url])=>{
      this.requests.get(cue)?.abort();
      this.buffers.delete(cue);
      const controller=new AbortController();
      this.requests.set(cue,controller);
      try{
        const fetchAsset=this.options.fetchAsset??((path:string,options?:RequestInit)=>globalThis.fetch(path,options));
        const response=await fetchAsset(url,{signal:controller.signal});
        if(!response.ok)throw new Error('Audio asset unavailable');
        const data=await response.arrayBuffer();
        if(!this.isCurrentRequest(cue,controller,generation))return;
        const buffer=await context.decodeAudioData(data);
        if(this.isCurrentRequest(cue,controller,generation))this.buffers.set(cue,buffer);
      }catch{/* Fetch, decode and cancellation failures all retain synth playback. */}
      finally{
        if(this.requests.get(cue)===controller)this.requests.delete(cue);
      }
    }));
  }

  /** Pause/background boundary; the next user gesture must enable sound again. */
  stopAll():void {
    this.enabled=false;
    this.generation++;
    this.unlocking=null;
    for(const request of this.requests.values())request.abort();
    this.requests.clear();
    for(const voice of this.voices)this.releaseVoice(voice,true);
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    this.stopAll();
    this.seenFeedback.clear();
    this.buffers.clear();
    const context=this.context;
    this.context=null;
    try{if(context&&context.state!=='closed')void Promise.resolve(context.close()).catch(()=>{})}catch{/* Closing is best effort. */}
  }

  private getContext():AudioContext|null {
    if(this.context)return this.context;
    try{this.context=(this.options.createContext??createBrowserContext)()}catch{/* Unsupported or denied audio. */}
    return this.context;
  }

  private isCurrentRequest(cue:AudioCue,controller:AbortController,generation:number):boolean {
    return !this.disposed&&generation===this.generation&&!controller.signal.aborted&&this.requests.get(cue)===controller;
  }

  private playCue(cue:AudioCue,feedback?:CombatFeedback):void {
    const context=this.context;
    if(this.disposed||!this.enabled||!context||context.state!=='running')return;
    const buffer=this.buffers.get(cue);
    if(buffer&&this.playSample(context,buffer))return;
    const tone=toneFor(cue,feedback);
    let source:OscillatorNode|undefined,gain:GainNode|undefined;
    try{
      source=context.createOscillator();gain=context.createGain();
      const now=context.currentTime;
      source.type=tone.type;
      source.frequency.setValueAtTime(tone.frequency,now);
      if(tone.endFrequency)source.frequency.exponentialRampToValueAtTime(tone.endFrequency,now+tone.duration);
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(tone.volume,now+(tone.attack??.008));
      gain.gain.exponentialRampToValueAtTime(.0001,now+tone.duration);
      this.startVoice(context,source,gain,now+tone.duration+.02);
    }catch{this.disconnect(source,gain,true)}
  }

  private playSample(context:AudioContext,buffer:AudioBuffer):boolean {
    let source:AudioBufferSourceNode|undefined,gain:GainNode|undefined;
    try{
      source=context.createBufferSource();gain=context.createGain();
      source.buffer=buffer;gain.gain.value=.65;
      return this.startVoice(context,source,gain);
    }catch{
      this.disconnect(source,gain,true);
      return false;
    }
  }

  private startVoice(context:AudioContext,source:AudioScheduledSourceNode,gain:GainNode,stopAt?:number):boolean {
    while(this.voices.size>=this.maxVoices)this.releaseVoice(this.voices.values().next().value!,true);
    const voice:Voice={source,gain,released:false};
    this.voices.add(voice);
    source.onended=()=>this.releaseVoice(voice,false);
    try{
      source.connect(gain);gain.connect(context.destination);
      source.start(context.currentTime);
      if(stopAt!==undefined)source.stop(stopAt);
      return true;
    }catch{
      this.releaseVoice(voice,true);
      return false;
    }
  }

  private releaseVoice(voice:Voice,stop:boolean):void {
    if(voice.released)return;
    voice.released=true;
    this.voices.delete(voice);
    this.disconnect(voice.source,voice.gain,stop);
  }

  private disconnect(source:AudioScheduledSourceNode|undefined,gain:GainNode|undefined,stop:boolean):void {
    if(source){
      source.onended=null;
      if(stop)try{source.stop()}catch{/* It may have already ended or never started. */}
      try{source.disconnect()}catch{/* Nodes may already be disconnected. */}
    }
    try{gain?.disconnect()}catch{/* Nodes may already be disconnected. */}
  }
}
