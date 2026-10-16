import type { BossKind } from '../../domain/v2';
import { assetUrl } from '../../ui/assets';

export type SpriteClip = 'Idle' | 'Good' | 'Perfect' | 'Miss';
export type SpriteBox = [number, number, number, number];
export interface SpriteFrame {
  /** Source frame identity and order. Missing source numbers are not long holds. */
  n:number;
  file:string;
  /** Visible bounds in the fixed cropped WebP's local pixel space. */
  bbox:SpriteBox;
  /** Tight image rectangle [x, y, width, height] inside the manifest crop. */
  rect?:SpriteBox;
}
export interface SpriteManifest {
  sourceSize:[number,number];
  /** Fixed rectangle in the original canvas. All WebPs use these dimensions. */
  crop:[number,number,number,number];
  clips:Record<SpriteClip,SpriteFrame[]>;
}

export const spriteClips:readonly SpriteClip[]=['Idle','Good','Perfect','Miss'];
export function reactionDurationMs(bossKind:Exclude<BossKind,'tomato'>,clip:SpriteClip){
  if(clip==='Idle')return 0;
  if(clip==='Good')return 450;
  if(bossKind==='jelly')return clip==='Perfect'?620:720;
  return clip==='Perfect'?550:500;
}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const box=(value:unknown):value is SpriteBox=>Array.isArray(value)&&value.length===4&&value.every(finite);

/** Reject malformed manifests before an asynchronous image request can strand the battle. */
export function parseSpriteManifest(value:unknown):SpriteManifest {
  if(!value||typeof value!=='object')throw Error('Sprite manifest is missing');
  const manifest=value as Partial<SpriteManifest>;
  if(!Array.isArray(manifest.sourceSize)||manifest.sourceSize.length!==2||!manifest.sourceSize.every(finite)
    ||manifest.sourceSize.some(number=>number<=0)||!box(manifest.crop)
    ||manifest.crop[2]<=0||manifest.crop[3]<=0||!manifest.clips)throw Error('Sprite manifest geometry is invalid');
  for(const clip of spriteClips){
    const frames=manifest.clips[clip];
    if(!Array.isArray(frames)||frames.length===0)throw Error(`Sprite ${clip} clip is empty`);
    let previous=-Infinity;
    for(const frame of frames){
      if(!frame||!Number.isInteger(frame.n)||frame.n<=previous||typeof frame.file!=='string'
        ||frame.file.length===0||frame.file.startsWith('/')||frame.file.includes('..')||!box(frame.bbox)
        ||frame.bbox[0]<0||frame.bbox[1]<0||frame.bbox[2]<=frame.bbox[0]||frame.bbox[3]<=frame.bbox[1]
        ||frame.bbox[2]>manifest.crop[2]||frame.bbox[3]>manifest.crop[3])throw Error(`Sprite ${clip} frame is invalid`);
      if(frame.rect&&(!box(frame.rect)||frame.rect[0]<0||frame.rect[1]<0||frame.rect[2]<=0||frame.rect[3]<=0
        ||frame.rect[0]+frame.rect[2]>manifest.crop[2]||frame.rect[1]+frame.rect[3]>manifest.crop[3]
        ||frame.rect[0]>frame.bbox[0]||frame.rect[1]>frame.bbox[1]
        ||frame.rect[0]+frame.rect[2]<frame.bbox[2]||frame.rect[1]+frame.rect[3]<frame.bbox[3]))
        throw Error(`Sprite ${clip} image rectangle is invalid`);
      previous=frame.n;
    }
  }
  return manifest as SpriteManifest;
}

type ClipTimeline={starts:number[];units:number};
const timelines=new WeakMap<SpriteManifest,Map<string,ClipTimeline>>();

function clipTimeline(manifest:SpriteManifest,clip:SpriteClip,bossKind:Exclude<BossKind,'tomato'>):ClipTimeline {
  let cached=timelines.get(manifest);
  if(!cached){cached=new Map();timelines.set(manifest,cached)}
  const key=`${bossKind}:${clip}`,existing=cached.get(key);
  if(existing)return existing;
  const frames=manifest.clips[clip],starts:number[]=[];
  const sparse=bossKind==='carrot'||bossKind==='cabbage';
  const maxGap=sparse?(clip==='Idle'?2:3):Infinity;
  let units=0;
  for(let index=0;index<frames.length;index++){
    starts.push(units);
    // Preserve nearby source spacing, but do not freeze on missing exports.
    units+=Math.min(frames[index+1]?.n-frames[index].n||1,maxGap);
  }
  const timeline={starts,units};cached.set(key,timeline);return timeline;
}

/** Bounded source spacing keeps sparse exports moving at a stable cadence. */
export function frameAt(manifest:SpriteManifest,clip:SpriteClip,elapsedMs:number,bossKind:Exclude<BossKind,'tomato'>='corn'):SpriteFrame {
  const frames=manifest.clips[clip],timeline=clipTimeline(manifest,clip,bossKind);
  const duration=clip==='Idle'?timeline.units*1000/24:reactionDurationMs(bossKind,clip);
  const age=clip==='Idle'?((Math.max(0,elapsedMs)%duration)+duration)%duration:
    Math.max(0,Math.min(elapsedMs,duration-0.001));
  const position=timeline.units*age/duration;
  let low=0,high=frames.length-1;
  while(low<high){
    const middle=Math.ceil((low+high)/2);
    if(timeline.starts[middle]<=position)low=middle;else high=middle-1;
  }
  return frames[low];
}

/** Only the current monster is fetched. Tight frames fit a bounded decoded cache. */
export class SpriteFrameBank {
  readonly manifestUrl:string;
  manifest:SpriteManifest|null=null;
  private controller=new AbortController();
  private disposed=false;
  private loaded=new Map<string,HTMLImageElement>();
  private frameByImage=new WeakMap<HTMLImageElement,SpriteFrame>();
  private pending=new Map<string,{image:HTMLImageElement,promise:Promise<HTMLImageElement>,reject:(error:Error)=>void}>();
  private failed=new Set<string>();
  private queuedCurrent:SpriteFrame|null=null;
  private decodedBytes=0;
  private readonly maxDecodedBytes=96*1024*1024;
  private readonly maxPending=10;
  private readonly maxPrefetchPending=7;

  constructor(private bossKind:Exclude<BossKind,'tomato'>){
    this.manifestUrl=assetUrl(`assets/monster-sprites/${bossKind}/manifest.json`);
  }

  async ready(){
    const response=await fetch(this.manifestUrl,{signal:this.controller.signal});
    if(!response.ok)throw Error(`Sprite manifest failed: ${response.status}`);
    const manifest=parseSpriteManifest(await response.json());
    if(this.disposed)throw Error('Sprite bank was disposed');
    this.manifest=manifest;
    // The first visible frame must exist before the battle clock starts.
    await this.load(manifest.clips.Idle[0]);
    if(this.disposed)throw Error('Sprite bank was disposed');
    const frames=spriteClips.flatMap(clip=>manifest.clips[clip]);
    const totalBytes=frames.reduce((sum,frame)=>sum+(frame.rect??manifest.crop)[2]*(frame.rect??manifest.crop)[3]*4,0);
    if(frames.every(frame=>frame.rect)&&totalBytes<=this.maxDecodedBytes){
      // Decode the compact active-monster set before its first input window.
      // Four workers bound concurrent decoding and leave no cold hit animation.
      let next=1;
      await Promise.all(Array.from({length:4},async()=>{
        while(!this.disposed&&next<frames.length){
          const frame=frames[next++];
          await this.load(frame).catch(()=>{});
        }
      }));
      if(this.disposed)throw Error('Sprite bank was disposed');
      return;
    }
    // Oversized or older full-canvas sets keep streaming within the byte budget.
    for(const clip of spriteClips)this.request(manifest.clips[clip][0]);
    this.prefetch('Idle',manifest.clips.Idle[0],6);
  }

  /** Never synthesize a source path from a frame number: clips have sparse IDs. */
  private key(frame:SpriteFrame){return frame.file}
  private url(frame:SpriteFrame){return assetUrl(`assets/monster-sprites/${this.bossKind}/${frame.file}`)}
  private imageBytes(image:HTMLImageElement){
    const frame=this.frameByImage.get(image),rect=frame?.rect??this.manifest?.crop;
    return rect?rect[2]*rect[3]*4:0;
  }
  private touch(key:string,image:HTMLImageElement){
    if(!this.loaded.has(key))this.decodedBytes+=this.imageBytes(image);
    this.loaded.delete(key);this.loaded.set(key,image);
  }
  private trim(){
    while(this.decodedBytes>this.maxDecodedBytes&&this.loaded.size>1){
      const key=this.loaded.keys().next().value as string;
      // Keep the startup pose available when a reaction frame is still loading.
      if(key===this.manifest?.clips.Idle[0].file){this.touch(key,this.loaded.get(key)!);continue}
      this.decodedBytes-=this.imageBytes(this.loaded.get(key)!);this.loaded.delete(key);
    }
  }
  private load(frame:SpriteFrame):Promise<HTMLImageElement>{
    const key=this.key(frame),existing=this.loaded.get(key);
    if(existing){this.touch(key,existing);return Promise.resolve(existing)}
    if(this.failed.has(key)||this.disposed)return Promise.reject(Error(`Sprite frame unavailable: ${key}`));
    const active=this.pending.get(key);
    if(active)return active.promise;
    const image=new Image();
    this.frameByImage.set(image,frame);
    image.decoding='async';
    let rejectRequest!:(error:Error)=>void;
    const promise=new Promise<HTMLImageElement>((resolve,reject)=>{
      rejectRequest=reject;
      const complete=()=>{
        this.pending.delete(key);
        image.onload=null;image.onerror=null;
        if(this.disposed){reject(Error('Sprite bank was disposed'));return}
        this.touch(key,image);this.trim();resolve(image);
        this.startQueuedCurrent();
      };
      const fail=()=>{
        this.pending.delete(key);
        image.onload=null;image.onerror=null;
        if(this.disposed){reject(Error('Sprite bank was disposed'));return}
        this.failed.add(key);reject(Error(`Sprite frame failed: ${key}`));
        this.startQueuedCurrent();
      };
      image.onload=()=>{
        image.onload=null;image.onerror=null;
        try{
          if(typeof image.decode==='function')void image.decode().then(complete,fail);
          else complete();
        }catch{fail()}
      };
      image.onerror=fail;
    });
    this.pending.set(key,{image,promise,reject:rejectRequest});
    image.src=this.url(frame);
    return promise;
  }
  private startQueuedCurrent(){
    const frame=this.queuedCurrent;
    if(this.disposed||!frame||this.pending.size>=this.maxPending)return;
    this.queuedCurrent=null;
    void this.load(frame).catch(()=>{});
  }
  /** Current battle frame is prioritized over speculative prefetch work. */
  request(frame:SpriteFrame){
    this.queuedCurrent=null;
    const key=this.key(frame),image=this.loaded.get(key);
    if(image){this.touch(key,image);return image}
    if(!this.pending.has(key)&&!this.failed.has(key)){
      if(this.pending.size<this.maxPending)void this.load(frame).catch(()=>{});
      else this.queuedCurrent=frame;
    }
    return null;
  }
  prefetch(clip:SpriteClip,current:SpriteFrame,count=5){
    const frames=this.manifest?.clips[clip];if(!frames)return;
    const index=frames.indexOf(current);
    if(index<0)return;
    for(let i=1;i<=count&&this.pending.size<this.maxPrefetchPending;i++){
      const next=index+i;
      if(clip!=='Idle'&&next>=frames.length)break;
      const frame=frames[next%frames.length],key=this.key(frame);
      if(!this.loaded.has(key)&&!this.pending.has(key)&&!this.failed.has(key))void this.load(frame).catch(()=>{});
    }
  }
  nearestLoaded(clip:SpriteClip,current:SpriteFrame){
    const frames=this.manifest?.clips[clip];if(!frames)return null;
    const index=frames.indexOf(current);
    if(index<0)return null;
    for(let offset=1;offset<frames.length;offset++){
      const previous=index-offset>=0?this.loaded.get(frames[index-offset].file):null;
      if(previous)return previous;
      const next=index+offset<frames.length?this.loaded.get(frames[index+offset].file):null;
      if(next)return next;
    }
    return null;
  }
  /** Resolve the pose actually drawn when the requested frame is still loading. */
  frameForImage(image:HTMLImageElement|null){return image?this.frameByImage.get(image)??null:null}
  dispose(){
    this.disposed=true;this.controller.abort();this.queuedCurrent=null;
    for(const entry of this.pending.values()){
      entry.image.onload=null;entry.image.onerror=null;
      // Replacing src cancels in-flight decoding without requesting the document URL.
      entry.image.src='data:,';
      entry.reject(Error('Sprite bank was disposed'));
    }
    this.loaded.clear();this.decodedBytes=0;this.pending.clear();this.failed.clear();this.manifest=null;
  }
}
