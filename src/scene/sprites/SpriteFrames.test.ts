import { afterEach,describe,expect,it,vi } from 'vitest';
import { decodedFrameBytes,frameAt,parseSpriteManifest,reactionDurationMs,sampleFrames,SpriteFrameBank,type SpriteClip,type SpriteManifest } from './SpriteFrames';
import { spriteAnchor,spriteContainsPoint,spriteGeometry,spritePoseBounds,transformPoint,neutralTransform } from './SpriteGeometry';
import { swipeContact } from '../../domain/swipe';

const frame=(n:number,bbox:[number,number,number,number]=[20,20,180,240])=>({n,file:`Idle/${String(n).padStart(5,'0')}.webp`,bbox});
const manifest:SpriteManifest={
  sourceSize:[960,960],crop:[350,320,240,320],
  clips:{Idle:[frame(1),frame(3),frame(9)],Good:[frame(1),frame(7)],Perfect:[frame(1),frame(9,[0,0,240,320])],Miss:[frame(1),frame(9)]},
};

const suppliedManifests=import.meta.glob<string>('/public/assets/monster-sprites/*/manifest.json',
  {eager:true,query:'?raw',import:'default'});
const suppliedFrames=import.meta.glob('/public/assets/monster-sprites/**/*.webp');

it('ships all four supplied action sets with every referenced frame',()=>{
  const expected={corn:[97,27,31,29],carrot:[25,28,35,29],cabbage:[64,31,29,21],jelly:[84,30,41,53]};
  expect(Object.keys(suppliedManifests)).toHaveLength(4);
  for(const [boss,counts] of Object.entries(expected)){
    const root=`/public/assets/monster-sprites/${boss}`;
    const source=suppliedManifests[`${root}/manifest.json`];
    expect(source,boss).toBeDefined();
    const shipped=parseSpriteManifest(JSON.parse(source));
    expect(shipped.sourceSize).toEqual([960,960]);
    for(const [index,clip] of ['Idle','Good','Perfect','Miss'].entries()){
      const frames=shipped.clips[clip as keyof typeof shipped.clips];
      expect(frames,boss).toHaveLength(counts[index]);
      for(const frame of frames){
        expect(`${root}/${frame.file}` in suppliedFrames).toBe(true);
        expect(frame.rect,`${boss} ${clip} tight image`).toBeDefined();
      }
    }
  }
  expect(Object.keys(suppliedFrames)).toHaveLength(654);
});

describe('sprite frame timing and placement',()=>{
  it('keeps the complete corn decoded set below the existing budget without moving its geometry',()=>{
    const source=parseSpriteManifest(JSON.parse(suppliedManifests['/public/assets/monster-sprites/corn/manifest.json']));
    expect(source.imageScale).toBe(.5);
    const bytes=Object.values(source.clips).flat().reduce((sum,frame)=>sum+decodedFrameBytes(source,frame),0);
    expect(bytes).toBeLessThan(80*1024*1024);
    expect(spriteGeometry(source,390,844)).toEqual(spriteGeometry({...source,imageScale:1},390,844));
  });

  it.each([0,-1,2,NaN])('rejects invalid image scale %s',imageScale=>{
    expect(()=>parseSpriteManifest({...manifest,imageScale})).toThrow('Sprite image scale is invalid');
  });

  it.each([30,60,120])('samples continuous poses at %i Hz with no clock-dependent reaction length',hz=>{
    const source=parseSpriteManifest(JSON.parse(suppliedManifests['/public/assets/monster-sprites/carrot/manifest.json']));
    let previous=-1;
    for(let age=0;age<550;age+=1000/hz){
      const pose=sampleFrames(source,'Perfect',age,'carrot');
      const position=source.clips.Perfect.indexOf(pose.from)+pose.mix;
      expect(position).toBeGreaterThanOrEqual(previous);previous=position;
      expect(pose.mix).toBeGreaterThanOrEqual(0);expect(pose.mix).toBeLessThan(1);
    }
    expect(sampleFrames(source,'Perfect',550,'carrot').from).toBe(source.clips.Perfect.at(-1));
  });

  it.each(['corn','carrot','cabbage','jelly'] as const)('plays %s Idle exports at an even 24 fps',boss=>{
    const supplied=parseSpriteManifest(JSON.parse(suppliedManifests[`/public/assets/monster-sprites/${boss}/manifest.json`]));
    supplied.clips.Idle.forEach((frame,index)=>{
      expect(frameAt(supplied,'Idle',(index+.5)*1000/24,boss).n).toBe(frame.n);
    });
  });
  it.each(['carrot','cabbage'] as const)('does not freeze a sparse %s action on a missing source number',boss=>{
    const supplied=parseSpriteManifest(JSON.parse(suppliedManifests[`/public/assets/monster-sprites/${boss}/manifest.json`]));
    for(const clip of ['Idle','Good','Perfect','Miss'] as const){
      const duration=clip==='Idle'?5000:reactionDurationMs(boss,clip);
      let previous=-1,held=0,longest=0;
      for(let time=0;time<duration;time++){
        const current=frameAt(supplied,clip,time,boss).n;
        held=current===previous?held+1:1;previous=current;
        longest=Math.max(longest,held);
      }
      expect(longest,`${boss} ${clip} longest still pose`).toBeLessThanOrEqual(clip==='Idle'?42:70);
    }
  });

  const mobileFramingCases=(['corn','jelly','carrot','cabbage'] as const).flatMap(boss=>
    ([[320,568],[390,844],[432,768]] as const).map(([width,height])=>[boss,width,height] as const));

  it.each(mobileFramingCases)('keeps every %s Idle frame inside the %ipx stage', (boss,width,height)=>{
    const supplied=parseSpriteManifest(JSON.parse(suppliedManifests[`/public/assets/monster-sprites/${boss}/manifest.json`]));
    const geometry=spriteGeometry(supplied,width,height);
    for(const frame of supplied.clips.Idle){
      const left=geometry.origin.x+(supplied.crop[0]+frame.bbox[0])*geometry.scale;
      const right=geometry.origin.x+(supplied.crop[0]+frame.bbox[2])*geometry.scale;
      expect(left,`${boss} Idle ${frame.n} left`).toBeGreaterThanOrEqual(width*.02-.001);
      expect(right,`${boss} Idle ${frame.n} right`).toBeLessThanOrEqual(width*.98+.001);
    }
  });

  it('uses export order rather than missing source numbers as dwell times',()=>{
    expect(frameAt(manifest,'Idle',0).n).toBe(1);
    expect(frameAt(manifest,'Idle',42).n).toBe(3);
    expect(frameAt(manifest,'Idle',100).n).toBe(9);
    expect(frameAt(manifest,'Idle',125).n).toBe(1);
    expect(frameAt(manifest,'Good',200).n).toBe(1);
    expect(frameAt(manifest,'Good',300).n).toBe(7);
    expect(frameAt(manifest,'Good',449).n).toBe(7);
  });

  it('uses one original-canvas origin, regardless of a dramatic Perfect frame',()=>{
    const geometry=spriteGeometry(manifest,390,844);
    const head=spriteAnchor(geometry,'corn','head');
    expect(geometry.sourceBody).toEqual([370,340,530,560]);
    expect(geometry.foot.y).toBeCloseTo(844*.8);
    expect(geometry.bodyCenter.y).toBeCloseTo(geometry.origin.y+(340+(560-340)*.55)*geometry.scale);
    expect(head.x).toBeGreaterThan(390*.3);
    expect(head.x).toBeLessThan(390*.7);
    expect(transformPoint(head,geometry.bodyCenter,neutralTransform)).toEqual(head);
    const changed={...manifest,clips:{...manifest.clips,Perfect:[frame(1,[0,0,240,320])]}};
    expect(spriteGeometry(changed,390,844)).toEqual(geometry);
  });

  it('moves a remaining cabbage knee ring onto the supplied Perfect pose',()=>{
    const cabbage=parseSpriteManifest(JSON.parse(suppliedManifests['/public/assets/monster-sprites/cabbage/manifest.json']));
    const geometry=spriteGeometry(cabbage,390,844);
    const frame=cabbage.clips.Perfect.find(item=>item.n===32)!;
    const staticKnee=spriteAnchor(geometry,'cabbage','rightKnee');
    const pose=spritePoseBounds(cabbage,'Perfect',frame);
    const movingKnee=spriteAnchor(geometry,'cabbage','rightKnee',pose);
    const sourceY=(staticKnee.y-geometry.origin.y)/geometry.scale-cabbage.crop[1];
    const movedY=(movingKnee.y-geometry.origin.y)/geometry.scale-cabbage.crop[1];
    expect(sourceY).toBeGreaterThan(frame.bbox[3]);
    expect(movedY).toBeGreaterThan(frame.bbox[1]);
    expect(movedY).toBeLessThan(frame.bbox[3]);
    // The brief beam is not a usable body box; interpolate between nearby poses.
    const beam=cabbage.clips.Perfect.find(item=>item.n===15)!;
    expect(spritePoseBounds(cabbage,'Perfect',beam)[2]-cabbage.crop[0]).toBeLessThan(600);
  });

  it('follows the jelly relay target when its Miss pose moves to the right',()=>{
    const jelly=parseSpriteManifest(JSON.parse(suppliedManifests['/public/assets/monster-sprites/jelly/manifest.json']));
    const geometry=spriteGeometry(jelly,390,844);
    const frame=jelly.clips.Miss.find(item=>item.n===56)!;
    const staticFin=spriteAnchor(geometry,'jelly','leftFin');
    const movedFin=spriteAnchor(geometry,'jelly','leftFin',spritePoseBounds(jelly,'Miss',frame));
    const sourceX=(staticFin.x-geometry.origin.x)/geometry.scale-jelly.crop[0];
    const movedX=(movedFin.x-geometry.origin.x)/geometry.scale-jelly.crop[0];
    expect(movedX-sourceX).toBeGreaterThan(80);
    expect(movedX).toBeGreaterThan(frame.bbox[0]);
    expect(movedX).toBeLessThan(frame.bbox[2]);
  });

  it('bridges the long carrot Perfect burst without moving a ring to the projectile',()=>{
    const carrot=parseSpriteManifest(JSON.parse(suppliedManifests['/public/assets/monster-sprites/carrot/manifest.json']));
    const before=carrot.clips.Perfect.find(item=>item.n===20)!;
    const after=carrot.clips.Perfect.find(item=>item.n===31)!;
    const first=carrot.clips.Perfect.find(item=>item.n===22)!;
    const last=carrot.clips.Perfect.find(item=>item.n===29)!;
    const center=(item:typeof first)=>{
      const [left,,right]=spritePoseBounds(carrot,'Perfect',item);
      return (left+right)/2;
    };
    expect(center(before)).toBeGreaterThan(center(first));
    expect(center(first)).toBeGreaterThan(center(last));
    expect(center(last)).toBeGreaterThan(center(after));
    const burst=spritePoseBounds(carrot,'Perfect',last);
    expect(burst[2]-burst[0]).toBeLessThan((after.bbox[2]-after.bbox[0])*1.4);
  });

  it('tests verdict strokes in normalized stage coordinates and follows the actor',()=>{
    const width=390,height=844,geometry=spriteGeometry(manifest,width,height);
    const center={x:geometry.bodyCenter.x/width,y:geometry.bodyCenter.y/height};
    expect(spriteContainsPoint(geometry,neutralTransform,center,width,height)).toBe(true);
    expect(spriteContainsPoint(geometry,neutralTransform,{x:0,y:0},width,height)).toBe(false);
    expect(spriteContainsPoint(geometry,{...neutralTransform,x:50},center,width,height)).toBe(true);
    expect(spriteContainsPoint(geometry,{...neutralTransform,x:200},center,width,height)).toBe(false);
    const cut=swipeContact({x:0,y:center.y},{x:1,y:center.y},width,height,
      point=>spriteContainsPoint(geometry,neutralTransform,point,width,height));
    expect(cut.contact).not.toBeNull();
    expect(cut.angle).toBe(0);
  });

  it('keeps the original jelly Perfect and Miss reaction durations',()=>{
    expect(reactionDurationMs('jelly','Good')).toBe(450);
    expect(reactionDurationMs('jelly','Perfect')).toBe(620);
    expect(reactionDurationMs('jelly','Miss')).toBe(720);
    expect(reactionDurationMs('corn','Perfect')).toBe(550);
  });

  it('rejects a frame whose cropped bounds cannot fit its WebP',()=>{
    const invalid={...manifest,clips:{...manifest.clips,Idle:[frame(1,[0,0,241,320])]}};
    expect(()=>parseSpriteManifest(invalid)).toThrow('Sprite Idle frame is invalid');
  });
});

describe('sprite frame loading',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('keeps startup pending until the first image has actually decoded',async()=>{
    const source=parseSpriteManifest(JSON.parse(suppliedManifests['/public/assets/monster-sprites/carrot/manifest.json']));
    let finishDecode:(()=>void)|undefined,ready=false,decodeCalls=0;
    vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>source}));
    vi.stubGlobal('Image',class {
      decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
      set src(value:string){if(value!=='data:,')queueMicrotask(()=>this.onload?.())}
      decode(){return ++decodeCalls===1?new Promise<void>(resolve=>{finishDecode=resolve}):Promise.resolve()}
    });
    const bank=new SpriteFrameBank('carrot');
    const loading=bank.ready().then(()=>{ready=true});
    try{
      await vi.waitFor(()=>expect(finishDecode).toBeTypeOf('function'));
      expect(ready).toBe(false);
      finishDecode!();await loading;
      expect(ready).toBe(true);
    }finally{bank.dispose();await loading.catch(()=>{})}
  });

  it('ignores an old decode completion after leaving the battle',async()=>{
    let finishDecode:(()=>void)|undefined;
    vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>manifest}));
    vi.stubGlobal('Image',class {
      decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
      set src(value:string){if(value!=='data:,')queueMicrotask(()=>this.onload?.())}
      decode(){return new Promise<void>(resolve=>{finishDecode=resolve})}
    });
    const bank=new SpriteFrameBank('corn');
    const rejected=expect(bank.ready()).rejects.toThrow('Sprite bank was disposed');
    await vi.waitFor(()=>expect(finishDecode).toBeTypeOf('function'));
    bank.dispose();finishDecode!();await rejected;
    expect(bank.manifest).toBeNull();
    expect(bank.request(manifest.clips.Idle[0])).toBeNull();
  });

  it.each(['corn','carrot','cabbage'] as const)('decodes %s actions before battle and reuses them on later loops',async boss=>{
    const source=parseSpriteManifest(JSON.parse(suppliedManifests[`/public/assets/monster-sprites/${boss}/manifest.json`]));
    const urls:string[]=[];let decodes=0;
    vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>source}));
    vi.stubGlobal('Image',class {
      decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
      set src(value:string){if(value!=='data:,'){urls.push(value);queueMicrotask(()=>this.onload?.())}}
      async decode(){decodes++}
    });
    const bank=new SpriteFrameBank(boss);
    try{
      await bank.ready();
      const frames=Object.values(source.clips).flat();
      expect(urls).toHaveLength(frames.length);
      expect(decodes).toBe(frames.length);
      for(let cycle=0;cycle<4;cycle++)for(const frame of frames)expect(bank.request(frame),frame.file).not.toBeNull();
      expect(new Set(urls).size).toBe(urls.length);
      expect(urls).toHaveLength(frames.length);
    }finally{bank.dispose()}
  });

  function controlledBank(){
    const images:ControlledImage[]=[];
    class ControlledImage {
      decoding='';
      onload:(()=>void)|null=null;
      onerror:(()=>void)|null=null;
      private value='';
      get src(){return this.value}
      set src(value:string){this.value=value;if(value!=='data:,')images.push(this)}
      finish(){this.onload?.()}
    }
    vi.stubGlobal('Image',ControlledImage);
    const frames=(clip:SpriteClip,count:number)=>Array.from({length:count},(_,index)=>({
      n:index+1,file:`${clip}/${String(index+1).padStart(5,'0')}.webp`,bbox:[20,20,180,240] as [number,number,number,number],
    }));
    const source:SpriteManifest={...manifest,clips:{
      Idle:frames('Idle',4),Good:frames('Good',12),Perfect:frames('Perfect',3),Miss:frames('Miss',3),
    }};
    const bank=new SpriteFrameBank('corn');
    bank.manifest=source;
    return {bank,source,images};
  }

  it('queues the latest current action when loading is saturated, instead of dropping it',()=>{
    const {bank,source,images}=controlledBank();
    for(const frame of source.clips.Good.slice(0,10))bank.request(frame);
    expect(images).toHaveLength(10);
    bank.request(source.clips.Perfect[0]);
    bank.request(source.clips.Perfect[1]);
    expect(images).toHaveLength(10);
    images[0].finish();
    expect(images).toHaveLength(11);
    expect(images[10].src).toContain('Perfect/00002.webp');
    images[10].finish();
    expect(bank.request(source.clips.Perfect[1])).toBe(images[10]);
    expect(bank.frameForImage(images[10] as unknown as HTMLImageElement)).toBe(source.clips.Perfect[1]);
    bank.dispose();
  });

  it('keeps image slots available for an action while prefetch is slow',()=>{
    const {bank,source,images}=controlledBank();
    bank.prefetch('Good',source.clips.Good[0],10);
    expect(images).toHaveLength(7);
    bank.request(source.clips.Perfect[0]);
    expect(images).toHaveLength(8);
    expect(images[7].src).toContain('Perfect/00001.webp');
    bank.dispose();
  });

  it('prefers a loaded frame from the current clip and never wraps reaction prefetch',()=>{
    const {bank,source,images}=controlledBank();
    bank.request(source.clips.Idle[0]);images[0].finish();
    bank.request(source.clips.Good[0]);images[1].finish();
    expect(bank.nearestLoaded('Perfect',source.clips.Perfect[1])).toBeNull();
    expect(bank.nearestLoaded('Good',source.clips.Good[2])).toBe(images[1]);
    bank.prefetch('Perfect',source.clips.Perfect[2],6);
    expect(images).toHaveLength(2);
    bank.prefetch('Idle',source.clips.Idle[3],1);
    expect(images).toHaveLength(2); // Idle wraps to its already loaded first frame.
    bank.dispose();
  });

  it('cancels in-flight image work when disposed during startup',async()=>{
    const {bank,source,images}=controlledBank();
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>source})));
    const loading=bank.ready();
    const rejected=expect(loading).rejects.toThrow('Sprite bank was disposed');
    await vi.waitFor(()=>expect(images).toHaveLength(1));
    bank.dispose();
    await rejected;
    expect(images[0].src).toBe('data:,');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(bank.manifest).toBeNull();
    expect(bank.request(source.clips.Good[0])).toBeNull();
  });
});
