import type { CombatFeedback } from '../domain/combat';

export type AudioCue = CombatFeedback['kind']|'Ready'|'Finisher'|'Bomb'|'UI'|'Victory'|'Defeat'|'VerdictEnd'|'SwingMiss';
export interface AudioSampleConfig {
  url:string;
  volume?:number;
  playbackRate?:number;
  offset?:number;
  duration?:number;
  cooldownMs?:number;
  /** Concurrent cue events; a sample plus its synth layer counts as one event. */
  maxVoices?:number;
  priority?:number;
  layerSynth?:boolean;
}
export interface AudioManagerOptions {
  createContext?:()=>AudioContext|null;
  fetchAsset?:(url:string,options?:RequestInit)=>Promise<Pick<Response,'ok'|'arrayBuffer'>>;
  maxVoices?:number;
}
interface Voice { source:AudioScheduledSourceNode; gain:GainNode; cue:AudioCue; priority:number; eventId:number; released:boolean }
interface Tone { type:OscillatorType; frequency:number; endFrequency?:number; duration:number; volume:number; attack?:number }
interface SampleConfig extends Required<Omit<AudioSampleConfig,'duration'>> { duration?:number }
interface SampleRequest { controller:AbortController; generation:number; promise:Promise<void> }
type PlaybackResult='started'|'suppressed'|'failed';

const cuePriority:Record<AudioCue,number>={UI:0,Cut:1,Nice:2,SwingMiss:2,Perfect:3,Miss:3,Bomb:4,Verdict:4,Ready:5,VerdictEnd:6,Finisher:7,Victory:8,Defeat:8};

function bounded(value:number|undefined,fallback:number,min:number,max:number):number {
  return value!==undefined&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
}

function sampleConfig(cue:AudioCue,asset:string|AudioSampleConfig,maxVoices:number):SampleConfig {
  const config=typeof asset==='string'?{url:asset}:asset;
  return {url:config.url,volume:bounded(config.volume,.65,0,8),playbackRate:bounded(config.playbackRate,1,.25,4),
    offset:bounded(config.offset,0,0,3600),duration:config.duration===undefined?undefined:bounded(config.duration,600,.005,600),
    cooldownMs:bounded(config.cooldownMs,0,0,60_000),maxVoices:Math.floor(bounded(config.maxVoices,maxVoices,1,32)),
    priority:bounded(config.priority,cuePriority[cue],0,100),layerSynth:config.layerSynth===true};
}

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
    case 'Bomb':return {type:'sawtooth',frequency:180,endFrequency:45,duration:.18,volume:.095};
    case 'Verdict':return {type:'triangle',frequency:620,endFrequency:900,duration:.16,volume:.075};
    case 'UI':return {type:'sine',frequency:640,endFrequency:760,duration:.045,volume:.035};
    case 'Victory':return {type:'triangle',frequency:520,endFrequency:1040,duration:.45,volume:.075};
    case 'Defeat':return {type:'triangle',frequency:250,endFrequency:80,duration:.4,volume:.07};
    case 'VerdictEnd':return {type:'triangle',frequency:240,endFrequency:90,duration:.2,volume:.08};
    case 'SwingMiss':return {type:'sine',frequency:300,endFrequency:140,duration:.12,volume:.04};
    case 'Cut':{
      const speed=feedback?.speed??'normal';
      return {type:'sawtooth',frequency:speed==='ferocious'?330:speed==='fast'?270:210,
        duration:speed==='ferocious'?.1:speed==='fast'?.08:.07,volume:.075};
    }
  }
}

/** Scoped to its owner (battle or application). Audio failure never rejects an action. */
export class AudioManager {
  private context:AudioContext|null=null;
  private readonly voices=new Set<Voice>();
  private readonly seenFeedback=new Set<number>();
  private readonly configs=new Map<AudioCue,SampleConfig>();
  private readonly buffers=new Map<string,AudioBuffer>();
  private readonly requests=new Map<string,SampleRequest>();
  private readonly retryUrls=new Set<string>();
  private readonly lastPlayed=new Map<AudioCue,number>();
  private readonly children=new Set<AudioManager>();
  private readonly maxVoices:number;
  private parent:AudioManager|null=null;
  private ownsContext=true;
  private generation=0;
  private enabled=false;
  private disposed=false;
  private unlocking:Promise<void>|null=null;
  private eventId=0;

  constructor(private readonly options:AudioManagerOptions={}){
    const requested=options.maxVoices??8;
    this.maxVoices=Number.isFinite(requested)?Math.max(1,Math.min(32,Math.floor(requested))):8;
  }

  /** Independent playback lifetime on the application context already unlocked by a gesture. */
  fork():AudioManager {
    const child=new AudioManager({...this.options,createContext:()=>this.disposed?null:this.getContext()});
    child.ownsContext=false;
    if(this.disposed){child.dispose();return child}
    child.parent=this;
    child.context=this.context;
    child.enabled=this.enabled&&this.context?.state==='running';
    this.children.add(child);
    return child;
  }

  /** Call directly from a user gesture. Never queues sounds while resuming. */
  unlock():Promise<void> {
    if(this.disposed)return Promise.resolve();
    const context=this.getContext();
    if(!context||context.state==='closed')return Promise.resolve();
    if(this.unlocking)return this.unlocking;
    if(context.state==='running'){
      this.enabled=true;
      this.retryInterruptedLoads(context);
      return Promise.resolve();
    }
    this.enabled=false;
    const generation=this.generation;
    try{
      this.unlocking=Promise.resolve(context.resume()).then(()=>{
        if(!this.disposed&&generation===this.generation&&context.state==='running'){
          this.enabled=true;
          this.retryInterruptedLoads(context);
        }
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
    this.playCue(feedback.finisher?'Finisher':feedback.bombDamage!==undefined?'Bomb':feedback.kind,feedback);
  }

  playReady():void { this.playCue('Ready'); }

  /** Registers samples without queuing playback. Unavailable samples retain synthesis. */
  async preload(assets:Partial<Record<AudioCue,string|AudioSampleConfig>>):Promise<void> {
    if(this.disposed)return;
    const urls=new Set<string>();
    for(const [cue,asset] of Object.entries(assets) as Array<[AudioCue,string|AudioSampleConfig]>){
      const config=sampleConfig(cue,asset,this.maxVoices);
      this.configs.set(cue,config);
      urls.add(config.url);
      if(!this.buffers.has(config.url))this.retryUrls.add(config.url);
    }
    for(const [url,request] of this.requests){
      if(this.usesUrl(url))continue;
      request.controller.abort();
      this.requests.delete(url);
      this.retryUrls.delete(url);
    }
    for(const url of this.retryUrls)if(!this.usesUrl(url))this.retryUrls.delete(url);
    const context=this.getContext();
    if(!context)return;
    await Promise.all([...urls].map(url=>this.loadSample(context,url)));
  }

  /** Public for application UI/results; callers own one-shot event identity. */
  playCue(cue:AudioCue,feedback?:CombatFeedback):void {
    const context=this.context;
    if(this.disposed||!this.enabled||!context||context.state!=='running')return;
    const config=this.configs.get(cue)??sampleConfig(cue,'',this.maxVoices);
    const last=this.lastPlayed.get(cue);
    if(last!==undefined&&(context.currentTime-last)*1000<config.cooldownMs)return;
    const eventId=++this.eventId;
    const buffer=this.buffers.get(config.url);
    let result:PlaybackResult='failed';
    if(buffer)result=this.playSample(context,buffer,cue,config,eventId);
    if(result==='suppressed')return;
    if(result==='started'){
      this.lastPlayed.set(cue,context.currentTime);
      if(config.layerSynth)this.playSynth(context,cue,config,eventId,feedback);
      return;
    }
    if(this.playSynth(context,cue,config,eventId,feedback)==='started')this.lastPlayed.set(cue,context.currentTime);
  }

  private loadSample(context:AudioContext,url:string):Promise<void> {
    if(this.disposed||this.buffers.has(url)||!this.usesUrl(url))return Promise.resolve();
    const pending=this.requests.get(url);
    if(pending)return pending.promise;
    const request:SampleRequest={controller:new AbortController(),generation:this.generation,promise:Promise.resolve()};
    this.requests.set(url,request);
    request.promise=(async()=>{
      try{
        const fetchAsset=this.options.fetchAsset??((path:string,options?:RequestInit)=>globalThis.fetch(path,options));
        const response=await fetchAsset(url,{signal:request.controller.signal});
        if(!response.ok)throw new Error('Audio asset unavailable');
        const data=await response.arrayBuffer();
        if(!this.isCurrentRequest(url,request))return;
        const buffer=await context.decodeAudioData(data);
        if(this.isCurrentRequest(url,request))this.buffers.set(url,buffer);
      }catch{/* Fetch, decode and cancellation failures all retain synth playback. */}
      finally{
        if(this.requests.get(url)===request){
          this.requests.delete(url);
          // A failed URL retries only on an explicit preload, not on every tap.
          this.retryUrls.delete(url);
        }
      }
    })();
    return request.promise;
  }

  private retryInterruptedLoads(context:AudioContext):void {
    for(const url of this.retryUrls)void this.loadSample(context,url);
  }

  /** End a result/UI cue without muting unrelated feedback or requiring another gesture. */
  stopCue(cue:AudioCue):void {
    for(const voice of this.voices)if(voice.cue===cue)this.releaseVoice(voice,true);
    this.lastPlayed.delete(cue);
  }

  /** Pause/background boundary; the next user gesture must enable sound again. */
  stopAll():void {
    this.enabled=false;
    this.generation++;
    this.unlocking=null;
    for(const [url,request] of this.requests){request.controller.abort();this.retryUrls.add(url)}
    this.requests.clear();
    this.lastPlayed.clear();
    for(const voice of this.voices)this.releaseVoice(voice,true);
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    for(const child of this.children)child.dispose();
    this.children.clear();
    this.parent?.children.delete(this);
    this.parent=null;
    this.stopAll();
    this.seenFeedback.clear();
    this.buffers.clear();
    this.configs.clear();
    this.retryUrls.clear();
    const context=this.context;
    this.context=null;
    try{if(this.ownsContext&&context&&context.state!=='closed')void Promise.resolve(context.close()).catch(()=>{})}catch{/* Closing is best effort. */}
  }

  private getContext():AudioContext|null {
    if(this.context)return this.context;
    try{this.context=(this.options.createContext??createBrowserContext)()}catch{/* Unsupported or denied audio. */}
    return this.context;
  }

  private usesUrl(url:string):boolean { return [...this.configs.values()].some(config=>config.url===url); }

  private isCurrentRequest(url:string,request:SampleRequest):boolean {
    return !this.disposed&&request.generation===this.generation&&!request.controller.signal.aborted&&this.requests.get(url)===request&&this.usesUrl(url);
  }

  private playSynth(context:AudioContext,cue:AudioCue,config:SampleConfig,eventId:number,feedback?:CombatFeedback):PlaybackResult {
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
      return this.startVoice(context,source,gain,cue,config,eventId,()=>source!.start(now),now+tone.duration+.02);
    }catch{this.disconnect(source,gain,true);return 'failed'}
  }

  private playSample(context:AudioContext,buffer:AudioBuffer,cue:AudioCue,config:SampleConfig,eventId:number):PlaybackResult {
    let source:AudioBufferSourceNode|undefined,gain:GainNode|undefined;
    try{
      source=context.createBufferSource();gain=context.createGain();
      if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw new Error('Invalid sample duration');
      source.buffer=buffer;
      source.playbackRate.setValueAtTime(config.playbackRate,context.currentTime);
      const offset=Math.min(config.offset,Math.max(0,buffer.duration-.005));
      const duration=Math.min(config.duration??buffer.duration,buffer.duration-offset);
      const wallDuration=duration/config.playbackRate,now=context.currentTime;
      const attack=Math.min(.004,wallDuration/4),release=Math.min(.006,wallDuration/4);
      gain.gain.setValueAtTime(0,now);
      gain.gain.linearRampToValueAtTime(config.volume,now+attack);
      gain.gain.setValueAtTime(config.volume,now+wallDuration-release);
      gain.gain.linearRampToValueAtTime(0,now+wallDuration);
      return this.startVoice(context,source,gain,cue,config,eventId,()=>source!.start(now,offset,duration),now+wallDuration+.005);
    }catch{
      this.disconnect(source,gain,true);
      return 'failed';
    }
  }

  private startVoice(context:AudioContext,source:AudioScheduledSourceNode,gain:GainNode,cue:AudioCue,config:SampleConfig,eventId:number,start:()=>void,stopAt?:number):PlaybackResult {
    const cueEvents=[...new Set([...this.voices].filter(voice=>voice.cue===cue).map(voice=>voice.eventId))];
    while(!cueEvents.includes(eventId)&&cueEvents.length>=config.maxVoices){
      const oldest=cueEvents.shift();
      for(const voice of this.voices)if(voice.cue===cue&&voice.eventId===oldest)this.releaseVoice(voice,true);
    }
    while(this.voices.size>=this.maxVoices){
      const oldestLowest=[...this.voices].filter(voice=>voice.eventId!==eventId&&voice.priority<=config.priority)
        .sort((a,b)=>a.priority-b.priority||a.eventId-b.eventId)[0];
      if(!oldestLowest){this.disconnect(source,gain,true);return 'suppressed'}
      // Keep a layered sample/synth event together when evicting it.
      for(const voice of this.voices)if(voice.eventId===oldestLowest.eventId)this.releaseVoice(voice,true);
    }
    const voice:Voice={source,gain,cue,priority:config.priority,eventId,released:false};
    this.voices.add(voice);
    source.onended=()=>this.releaseVoice(voice,false);
    try{
      source.connect(gain);gain.connect(context.destination);
      start();
      if(stopAt!==undefined)source.stop(stopAt);
      return 'started';
    }catch{
      this.releaseVoice(voice,true);
      return 'failed';
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
