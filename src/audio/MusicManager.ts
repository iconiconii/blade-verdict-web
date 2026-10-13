export interface MusicConfig { url:string; volume:number; duckVolume:number }
export interface MusicManagerOptions {
  createAudio?:(url:string)=>HTMLAudioElement|null;
  createContext?:()=>AudioContext|null;
  now?:()=>number;
}

/** Stream the long music track independently of the short Web Audio voice pool. */
export class MusicManager {
  private audio:HTMLAudioElement|null=null;
  private context:AudioContext|null=null;
  private source:MediaElementAudioSourceNode|null=null;
  private gain:GainNode|null=null;
  private authorized=false;
  private suspended=false;
  private disposed=false;
  private blocked=false;
  private failedMedia=false;
  private generation=0;
  private pending:{generation:number}|null=null;
  private fadeTimer:ReturnType<typeof setTimeout>|null=null;
  private duckTimer:ReturnType<typeof setTimeout>|null=null;
  private duckUntil=0;
  private readonly volume:number;
  private readonly duckVolume:number;
  private currentVolume:number;

  constructor(private readonly config:MusicConfig,private readonly options:MusicManagerOptions={}){
    this.volume=Math.max(0,Math.min(1,config.volume));
    this.duckVolume=Math.max(0,Math.min(this.volume,config.duckVolume));
    this.currentVolume=this.volume;
  }

  /** Only a real pointer/keyboard/click handler should grant the first start. */
  gesture():void {
    if(this.disposed)return;
    this.authorized=true;
    this.blocked=false;
    this.start();
  }

  setSuspended(suspended:boolean):void {
    if(this.disposed||suspended===this.suspended)return;
    this.suspended=suspended;
    if(suspended){
      this.generation++;
      this.pending=null;
      this.stopTimers();
      this.duckUntil=0;
      this.pause();
      this.setVolume(this.volume);
    }else this.start();
  }

  /** Extend a quiet interval, rather than stacking gains or recovery timers. */
  duck(durationMs=1400):void {
    if(this.disposed||this.suspended||!this.audio)return;
    const duration=Number.isFinite(durationMs)?Math.max(80,Math.min(8000,durationMs)):1400;
    this.duckUntil=Math.max(this.duckUntil,this.now()+duration);
    this.fadeTo(this.duckVolume,80);
    if(this.duckTimer!==null)clearTimeout(this.duckTimer);
    this.duckTimer=setTimeout(()=>{
      this.duckTimer=null;
      if(this.disposed||this.suspended)return;
      this.duckUntil=0;
      this.fadeTo(this.volume,280);
    },Math.max(0,this.duckUntil-this.now()));
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    this.generation++;
    this.pending=null;
    this.stopTimers();
    const audio=this.audio;
    this.pause();
    this.audio=null;
    try{this.source?.disconnect();this.gain?.disconnect()}catch{/* Nodes may already be disconnected. */}
    const context=this.context;
    this.source=null;this.gain=null;this.context=null;
    try{if(context&&context.state!=='closed')void Promise.resolve(context.close()).catch(()=>{})}catch{/* Best effort. */}
    if(!audio)return;
    audio.removeEventListener('error',this.onError);
    // Release the resource without resetting it to an empty URL/current page.
    try{audio.removeAttribute('src');audio.load()}catch{/* Media cleanup is best effort. */}
  }

  private readonly onError=()=>{
    if(this.disposed)return;
    this.failedMedia=true;
    this.blocked=true;
    this.generation++;
    this.pending=null;
    this.pause();
    this.stopTimers();
  };

  private now():number { return (this.options.now??Date.now)(); }

  private start():void {
    if(this.disposed||this.suspended||!this.authorized||this.blocked||this.pending)return;
    try{
      if(!this.audio){
        this.audio=(this.options.createAudio??(url=>typeof Audio==='undefined'?null:new Audio(url)))(this.config.url);
        if(!this.audio){this.blocked=true;return;}
        this.audio.loop=true;
        this.audio.preload='metadata';
        this.connectOutput(this.audio);
        this.setVolume(this.volume);
        this.audio.addEventListener('error',this.onError);
      }
      const audio=this.audio;
      if(this.failedMedia){audio.load();this.failedMedia=false;}
      this.resumeContext();
      if(!audio.paused)return;
      const pending={generation:this.generation};
      this.pending=pending;
      // Call play synchronously while browser user activation is still present.
      void Promise.resolve(audio.play()).then(()=>{
        if(this.pending!==pending||pending.generation!==this.generation){
          if(this.disposed||this.suspended||this.blocked)try{audio.pause()}catch{/* A stale play must stay silent. */}
          return;
        }
        this.pending=null;
        if(this.disposed||this.suspended)this.pause();
      }).catch(()=>{
        if(this.pending!==pending||pending.generation!==this.generation)return;
        this.pending=null;
        this.blocked=true;
        this.pause();
        // Retry only on a later explicit gesture, never on render/pointermove.
      });
    }catch{
      this.pending=null;
      this.blocked=true;
      this.pause();
    }
  }

  private pause():void { try{this.audio?.pause()}catch{/* Unsupported media remains silent. */} }
  private setVolume(volume:number):void {
    this.currentVolume=volume;
    try{
      if(this.gain)this.gain.gain.value=volume;
      else if(this.audio)this.audio.volume=volume;
    }catch{/* Some mobile browsers own their media volume. */}
  }
  private fadeTo(target:number,duration:number):void {
    if(this.fadeTimer!==null)clearTimeout(this.fadeTimer);
    this.fadeTimer=null;
    const start=this.now(),initial=this.currentVolume;
    const frame=()=>{
      this.fadeTimer=null;
      if(this.disposed||this.suspended||!this.audio)return;
      const progress=Math.min(1,Math.max(0,(this.now()-start)/duration));
      this.setVolume(initial+(target-initial)*progress);
      if(progress<1)this.fadeTimer=setTimeout(frame,16);
    };
    frame();
  }
  private stopTimers():void {
    if(this.fadeTimer!==null)clearTimeout(this.fadeTimer);
    if(this.duckTimer!==null)clearTimeout(this.duckTimer);
    this.fadeTimer=null;this.duckTimer=null;
  }

  private connectOutput(audio:HTMLAudioElement):void {
    // iOS may ignore HTMLMediaElement.volume. A streaming gain node controls
    // music balance there without decoding the whole long track into memory.
    let context:AudioContext|null=null,source:MediaElementAudioSourceNode|null=null,gain:GainNode|null=null;
    try{
      const factory=this.options.createContext??(()=>{
        const browser=globalThis as typeof globalThis&{webkitAudioContext?:typeof AudioContext};
        const Context=browser.AudioContext??browser.webkitAudioContext;
        return Context?new Context():null;
      });
      context=factory();
      if(!context)return;
      gain=context.createGain();
      gain.gain.value=this.currentVolume;
      source=context.createMediaElementSource(audio);
      source.connect(gain);gain.connect(context.destination);
      this.context=context;this.source=source;this.gain=gain;
      try{audio.volume=1}catch{/* The gain node still controls platforms with fixed media volume. */}
    }catch{
      try{source?.disconnect();gain?.disconnect()}catch{/* Failed audio setup stays harmless. */}
      try{if(context&&context.state!=='closed')void Promise.resolve(context.close()).catch(()=>{})}catch{/* Best effort. */}
    }
  }

  private resumeContext():void {
    const context=this.context;
    if(!context||context.state==='running'||context.state==='closed')return;
    try{void Promise.resolve(context.resume()).catch(()=>{})}catch{/* Another explicit gesture can retry. */}
  }
}
