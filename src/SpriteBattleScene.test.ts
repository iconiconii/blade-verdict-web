import { afterEach,expect,it,vi } from 'vitest';
import { applyContinuousCut,createCombat,durations,startVerdict,tapTarget,tickCombat } from './domain/combat';
import { SpriteBattleScene } from './SpriteBattleScene';
import type { SpriteManifest } from './scene/sprites/SpriteFrames';
import { spriteGeometry } from './scene/sprites/SpriteGeometry';

const frame=(clip:string,n:number)=>({n,file:`${clip}/${String(n).padStart(5,'0')}.webp`,bbox:[300,300,660,660] as [number,number,number,number]});
const manifest:SpriteManifest={sourceSize:[960,960],crop:[0,0,960,960],clips:{
  Idle:[frame('Idle',0),frame('Idle',1)],Good:[frame('Good',0),frame('Good',1)],
  Perfect:[frame('Perfect',0),frame('Perfect',1)],Miss:[frame('Miss',0),frame('Miss',1)],
}};

afterEach(()=>vi.unstubAllGlobals());

const suppliedManifests=import.meta.glob<string>('/public/assets/monster-sprites/*/manifest.json',
  {eager:true,query:'?raw',import:'default'});

async function recordedScene(boss:'carrot'|'cabbage'|'jelly'|'tomato'){
  const source=JSON.parse(suppliedManifests[`/public/assets/monster-sprites/${boss}/manifest.json`]) as SpriteManifest;
  const draws:Array<{src:string;alpha:number}>=[];
  const properties:Record<string,unknown>={globalAlpha:1};
  const context=new Proxy(properties,{get:(target,key)=>key==='drawImage'
    ?(image:HTMLImageElement)=>{if(typeof image.src==='string')draws.push({src:image.src,alpha:Number(properties.globalAlpha)})}
    :target[key as string]??(()=>{})}) as unknown as CanvasRenderingContext2D;
  vi.stubGlobal('document',{createElement:()=>({dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,remove:()=>{}})});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>source}));
  vi.stubGlobal('Image',class {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;value='';
    set src(value:string){this.value=value;queueMicrotask(()=>this.onload?.())}
    get src(){return this.value}
    decode(){return Promise.resolve()}
  });
  let ready=false;
  const host={appendChild:()=>{},getBoundingClientRect:()=>({width:390,height:844})} as unknown as HTMLElement;
  const scene=new SpriteBattleScene(host,()=>{},()=>{ready=true},boss);
  await vi.waitFor(()=>expect(ready).toBe(true));
  return {scene,draws,source};
}

it.each(['carrot','cabbage','jelly','tomato'] as const)('shows every %s Perfect pose at 60Hz without extending the reaction',async boss=>{
  const {scene,draws,source}=await recordedScene(boss);
  const initial=createCombat(1,boss),event={id:1,kind:'Perfect' as const,time:1000,
    amount:1,position:{x:.5,y:.5},energyGain:0,angle:0,hitStopMs:80};
  try{
    scene.render({...initial,time:1000});
    for(let age=0;age<=720;age+=1000/60){
      const state={...initial,time:1000+age,feedback:event,effects:[event]};
      scene.render(state);
      expect(state.time).toBe(1000+age);
    }
    const visible=new Set(draws.filter(draw=>draw.alpha>.01).map(draw=>draw.src.split(`${boss}/`)[1]));
    expect(source.clips.Perfect.filter(frame=>!visible.has(frame.file)).map(frame=>frame.n)).toEqual([]);
  }finally{scene.dispose()}
});

it.each(['carrot','cabbage','jelly','tomato'] as const)('shows every %s Good pose at 60Hz within the original 450ms',async boss=>{
  const {scene,draws,source}=await recordedScene(boss);
  const initial=createCombat(1,boss),event={id:1,kind:'Nice' as const,time:1000,
    amount:1,position:{x:.5,y:.5},energyGain:0,angle:0,hitStopMs:25};
  try{
    scene.render({...initial,time:999});
    for(let age=0;age<475;age+=1000/60)scene.render({...initial,time:1000+age,feedback:event,effects:[event]});
    const visible=new Set(draws.filter(draw=>draw.alpha>.01).map(draw=>draw.src?.split(`${boss}/`)[1]));
    expect(source.clips.Good.filter(frame=>!visible.has(frame.file)).map(frame=>frame.n)).toEqual([]);
  }finally{scene.dispose()}
});

it('shows the jelly Perfect tail before recovery even when 60Hz samples miss the exact deadline',async()=>{
  const {scene,draws,source}=await recordedScene('jelly');
  const initial=createCombat(1,'jelly'),event={id:1,kind:'Perfect' as const,time:1000,
    amount:1,position:{x:.5,y:.5},energyGain:0,angle:0,hitStopMs:80};
  try{
    scene.render({...initial,time:999});
    // Advance absolute timestamps: no sample lands at 1700ms before recovery.
    for(let time=1000;time<1700;time+=1000/60)scene.render({...initial,time,feedback:event,effects:[event]});
    expect(draws.some(draw=>draw.alpha>.01&&draw.src.endsWith(source.clips.Perfect.at(-1)!.file))).toBe(true);
  }finally{scene.dispose()}
});

it('blends the last reaction into the start of Idle, not the global battle-time pose',async()=>{
  const {scene,draws,source}=await recordedScene('carrot');
  const initial=createCombat(1,'carrot'),event={id:1,kind:'Miss' as const,time:1234,
    amount:1,position:{x:.5,y:.5},energyGain:0,angle:0};
  try{
    for(let age=0;age<=540;age+=10)scene.render({...initial,time:1234+age,feedback:event,effects:[event]});
    const tail=draws.slice(-4);
    expect(tail.some(draw=>draw.src.includes('/Miss/'))).toBe(true);
    expect(tail.some(draw=>draw.src.includes(source.clips.Idle[0].file))).toBe(true);
    expect(tail.every(draw=>draw.alpha>0&&draw.alpha<1)).toBe(true);
  }finally{scene.dispose()}
});

it('interpolates across the Idle loop seam without resetting its clock',async()=>{
  const {scene,draws}=await recordedScene('carrot');
  const initial=createCombat(1,'carrot');
  try{
    for(let time=0;time<=1030;time+=10)scene.render({...initial,time});
    const tail=draws.slice(-2);
    expect(tail.some(draw=>draw.src.includes('Idle/00090.webp'))).toBe(true);
    expect(tail.some(draw=>draw.src.includes('Idle/00002.webp'))).toBe(true);
    expect(tail.every(draw=>draw.alpha>0&&draw.alpha<1)).toBe(true);
  }finally{scene.dispose()}
});

it('keeps the second circle animating and clickable during the first circle hit stop',async()=>{
  const {scene}=await recordedScene('cabbage');
  try{
    let state=createCombat(1,'cabbage');
    for(let i=0;i<100&&state.phase!=='targetActive';i++)state=tickCombat(state,50);
    const event={id:1,kind:'Perfect' as const,amount:1,position:{x:.5,y:.5},time:state.time,
      energyGain:1,angle:0,hitStopMs:80};
    const first={...state.targets[0],resolved:true,result:'Perfect' as const};
    const second={...state.targets[0],circleId:'second',targetIndex:1,anchorId:'rightKnee' as const};
    state={...state,targets:[first,second],feedback:event,effects:[event]};
    scene.render(state);
    const before=scene.getTargetLayout(1)!;
    const next=tickCombat(state,40);
    scene.render(next);
    const after=scene.getTargetLayout(1)!;
    expect(next.time-state.time).toBe(40);
    expect(after.diameter).not.toBe(before.diameter);
    expect(scene.getTargetAt(after.x,after.y,next)?.circleId).toBe('second');
    expect(tapTarget(next,'second').targets[1].resolved).toBe(true);
  }finally{scene.dispose()}
});

it.each(['carrot','tomato'] as const)('settles both real %s double-circle hits while continuing one body reaction',async boss=>{
  const {scene}=await recordedScene(boss);
  try{
    let state=createCombat(11,boss);
    for(let i=0;i<1000&&(state.phase!=='targetActive'||state.targets.length!==2);i++){
      if(state.phase==='targetActive')for(const target of state.targets)state=tapTarget(state,target.circleId);
      else state=tickCombat(state,20);
    }
    expect(state.targets).toHaveLength(2);
    scene.render(state);state=tapTarget(state,state.targets[0].circleId);scene.render(state);
    for(let i=0;i<15;i++){state=tickCombat(state,10);scene.render(state)}
    const playback=(scene as unknown as {playback:{age:number;revision:number}}).playback;
    const before={age:playback.age,revision:playback.revision,hp:state.battle.bossHp,combo:state.combo};
    state=tapTarget(state,state.targets[1].circleId);scene.render(state);
    expect(state.targets.every(target=>target.resolved)).toBe(true);
    expect(state.battle.bossHp).toBeLessThan(before.hp);
    expect(state.combo).toBe(before.combo+1);
    expect(playback.age).toBeGreaterThanOrEqual(before.age);
    expect(playback.revision).toBe(before.revision);
  }finally{scene.dispose()}
});

it('renders all four tomato verdicts, returns to parry, and finishes without an extra group',async()=>{
  const {scene}=await recordedScene('tomato');
  let state=createCombat(7319,'tomato');
  const verdicts:number[]=[],returns:number[]=[];
  try{
    for(let frame=0;frame<10000&&state.phase!=='settle';frame++){
      const previousStage=state.stageIndex;
      if(state.phase==='targetActive'){
        for(const circle of state.targets){
          scene.render(state);
          const target=scene.getTargetLayout(circle.targetIndex)!;
          expect(scene.getTargetAt(target.x,target.y,state)?.circleId).toBe(circle.circleId);
          state=tapTarget(state,circle.circleId);
          scene.render(state);
        }
      }else if(state.phase==='verdictReady'){
        verdicts.push(state.stageIndex);
        state=startVerdict(state);
      }else if(state.phase==='verdictSlash'){
        state=applyContinuousCut(state,{x:.5,y:.6},true);
      }else state=tickCombat(state,20);
      expect(()=>scene.render(state)).not.toThrow();
      if(state.stageIndex>previousStage&&state.battle.bossHp>0)returns.push(state.stageIndex);
    }
    expect(verdicts).toEqual([0,1,2,3]);
    expect(returns).toEqual([1,2,3]);
    expect(state.phase).toBe('settle');
    expect(state.battle.bossHp).toBe(0);
    expect(state.battle.playerHp).toBe(3);
    expect(state.targets).toEqual([]);
    for(let age=0;age<=1500;age+=20){
      expect(()=>scene.render({...state,time:state.time+age,elapsed:age})).not.toThrow();
    }
  }finally{scene.dispose()}
});

it('keeps rendering a shrinking carrot ring after verdict, then resumes the next group',async()=>{
  const arc=(_x:number,_y:number,radius:number)=>{
    if(radius<0)throw new DOMException('The arc radius is negative','IndexSizeError');
  };
  const context=new Proxy({}, {get:(_target,key)=>key==='arc'?arc:()=>{}}) as CanvasRenderingContext2D;
  const canvas={dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,remove:()=>{}};
  vi.stubGlobal('document',{createElement:()=>canvas});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>manifest}));
  vi.stubGlobal('Image',class {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    set src(_value:string){queueMicrotask(()=>this.onload?.())}
  });
  const host={appendChild:()=>{},getBoundingClientRect:()=>({width:390,height:844})} as unknown as HTMLElement;
  let ready=0;
  const scene=new SpriteBattleScene(host,()=>{},()=>ready++,'carrot');
  try{
    await vi.waitFor(()=>expect(ready).toBe(1));
    let state=createCombat(7319,'carrot');
    for(let frame=0;frame<1000&&state.phase!=='verdictReady';frame++){
      if(state.phase==='targetActive')for(const target of state.targets)state=tapTarget(state,target.circleId);
      else state=tickCombat(state,50);
    }
    expect(state.phase).toBe('verdictReady');
    // Waiting at manual release can align the next ring's final instant with
    // the negative half of its visual pulse, as in the real Canvas exception.
    const cycle=Math.PI*2*85;
    const ringEnd=state.time+durations.stagger+state.tempo.telegraphMs+state.tempo.durationMs-.1;
    const wait=((Math.PI*1.5*85-ringEnd)%cycle+cycle)%cycle;
    state=startVerdict(tickCombat(state,wait));
    for(let cut=0;cut<10&&state.phase==='verdictSlash';cut++)state=applyContinuousCut(state,{x:.5,y:.5},true);
    expect(state).toMatchObject({phase:'stagger',stageIndex:1,pointerId:null});
    state=tickCombat(state,durations.stagger);
    state=tickCombat(state,state.tempo.telegraphMs);
    expect(state.phase).toBe('targetActive');
    state=tickCombat(state,state.tempo.durationMs-.1);
    expect(()=>scene.render(state)).not.toThrow();
    state=tickCombat(state,1);
    expect(state.feedback?.kind).toBe('Miss');
    for(let frame=0;frame<100&&state.phase!=='targetActive';frame++){
      state=tickCombat(state,20);
      expect(()=>scene.render(state)).not.toThrow();
    }
    expect(state.phase).toBe('targetActive');
    expect(state.battle.playerHp).toBe(2);
    const target=scene.getTargetLayout(0)!;
    expect(target.visible).toBe(true);
    expect(scene.getTargetAt(target.x,target.y,state)?.circleId).toBe(target.circleId);
  }finally{scene.dispose()}
});

it('draws tight images at their original canvas offset',async()=>{
  const drawImage=vi.fn();
  const context=new Proxy({}, {get:(_target,key)=>key==='drawImage'?drawImage:()=>{}}) as CanvasRenderingContext2D;
  const canvas={dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,remove:()=>{}};
  const source:SpriteManifest={...manifest,clips:{...manifest.clips,
    Idle:[{...frame('Idle',0),rect:[290,290,380,380]}],
  }};
  vi.stubGlobal('document',{createElement:()=>canvas});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>source}));
  vi.stubGlobal('Image',class {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    set src(_value:string){queueMicrotask(()=>this.onload?.())}
  });
  const width=390,height=844;
  const host={appendChild:()=>{},getBoundingClientRect:()=>({width,height})} as unknown as HTMLElement;
  let ready=0;
  const scene=new SpriteBattleScene(host,()=>{},()=>ready++,'corn');
  try{
    await vi.waitFor(()=>expect(ready).toBe(1));
    scene.render(createCombat(1,'corn'));
    const geometry=spriteGeometry(source,width,height);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(),
      geometry.origin.x+290*geometry.scale,geometry.origin.y+290*geometry.scale,
      380*geometry.scale,380*geometry.scale);
  }finally{scene.dispose()}
});

const cases=(['corn','jelly','carrot','cabbage','tomato'] as const).flatMap(boss=>
  ([[320,568],[390,844],[432,768]] as const).map(([width,height])=>[boss,width,height] as const));

it.each(cases)('%s at %ipx renders and picks a ring, then pauses it',async(boss,width,height)=>{
  const context=new Proxy({}, {get:()=>()=>{}}) as CanvasRenderingContext2D;
  const canvas={dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,remove:()=>{}};
  vi.stubGlobal('document',{createElement:()=>canvas});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>manifest}));
  vi.stubGlobal('Image',class {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    set src(_value:string){queueMicrotask(()=>this.onload?.())}
  });
  const host={appendChild:()=>{},getBoundingClientRect:()=>({width,height})} as unknown as HTMLElement;
  let ready=0,failed=0;
  const scene=new SpriteBattleScene(host,()=>failed++,()=>ready++,boss);
  try{
    await vi.waitFor(()=>expect(ready).toBe(1));
    expect(failed).toBe(0);
    let state=createCombat(1,boss);
    for(let i=0;i<100&&state.phase!=='targetActive';i++)state=tickCombat(state,50);
    expect(state.phase).toBe('targetActive');
    scene.render(state);
    const target=scene.getTargetLayout(0);
    expect(target?.visible).toBe(true);
    expect(target.x).toBeGreaterThan(0);
    expect(target.x).toBeLessThan(width);
    expect(target.y).toBeGreaterThan(0);
    expect(target.y).toBeLessThan(height);
    expect(scene.getTargetAt(target.x,target.y,state)?.circleId).toBe(target.circleId);
    const belly=scene.getBodyAnchorLayout('belly')!;
    expect(scene.isPointInsideMonster({x:belly.x/width,y:belly.y/height})).toBe(true);
    const paused={...state,paused:true};
    scene.render(paused);
    expect(scene.getTargetLayout(0)?.visible).toBe(false);
    expect(scene.getTargetAt(target.x,target.y,paused)).toBeNull();
    const hit=tapTarget(state,target.circleId);
    expect(hit.feedback?.kind).toBe('Nice');
    expect(()=>scene.render(hit)).not.toThrow();
    const finalEvent={...hit.feedback!,id:hit.feedback!.id+1,kind:'Cut' as const,
      time:hit.time,angle:0,finisher:true};
    const finished={...hit,time:hit.time+100,phase:'settle' as const,
      battle:{...hit.battle,bossHp:0},feedback:finalEvent,effects:[finalEvent]};
    expect(()=>scene.render(finished)).not.toThrow();
  }finally{scene.dispose()}
});

it('keeps a live ring on the image actually drawn while a reaction frame loads',async()=>{
  const context=new Proxy({}, {get:()=>()=>{}}) as CanvasRenderingContext2D;
  const canvas={dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,remove:()=>{}};
  const movingFrame={...frame('Perfect',1),bbox:[380,260,740,620] as [number,number,number,number]};
  const source:SpriteManifest={...manifest,clips:{...manifest.clips,Perfect:[frame('Perfect',0),movingFrame]}};
  let delayed: {onload:(()=>void)|null}|null=null;
  vi.stubGlobal('document',{createElement:()=>canvas});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>source}));
  vi.stubGlobal('Image',class {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    set src(value:string){
      if(value.includes('Perfect/00001.webp'))delayed=this;
      else queueMicrotask(()=>this.onload?.());
    }
  });
  const host={appendChild:()=>{},getBoundingClientRect:()=>({width:390,height:844})} as unknown as HTMLElement;
  const scene=new SpriteBattleScene(host,()=>{},()=>{},'cabbage');
  try{
    await vi.waitFor(()=>expect(scene.getBodyAnchorLayout('belly')).not.toBeNull());
    let state=createCombat(1,'cabbage');
    for(let i=0;i<100&&state.phase!=='targetActive';i++)state=tickCombat(state,50);
    const event={id:1,kind:'Perfect' as const,contactResult:'Perfect' as const,amount:1,
      position:{x:.5,y:.5},time:state.time-300,energyGain:1,angle:0};
    const first={...state.targets[0],circleId:'first',anchorId:'head' as const,resolved:true,result:'Perfect' as const};
    const second={...state.targets[0],circleId:'second',targetIndex:1,anchorId:'rightKnee' as const};
    const reacting={...state,targets:[first,second],feedback:event,effects:[event]};
    scene.render(reacting);
    const before=scene.getTargetLayout(1)!;
    expect(delayed).not.toBeNull();
    expect(scene.getTargetLayout(0)?.visible).toBe(false);
    expect(before.visible).toBe(true);
    expect(scene.getTargetAt(before.x,before.y,reacting)?.circleId).toBe(before.circleId);
    delayed!.onload?.();
    scene.render(reacting);
    const after=scene.getTargetLayout(1)!;
    expect(after.x-before.x).toBeGreaterThan(20);
    expect(after.y).toBeLessThan(before.y);
    expect(scene.getTargetAt(after.x,after.y,reacting)?.circleId).toBe(after.circleId);
  }finally{scene.dispose()}
});

it.each([
  ['Nice','Good'],['Perfect','Perfect'],['Miss','Miss'],
] as const)('uses the supplied %s result clip, not the Idle animation',async(kind,clip)=>{
  const context=new Proxy({}, {get:()=>()=>{}}) as CanvasRenderingContext2D;
  const canvas={dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,remove:()=>{}};
  const requested:string[]=[];
  vi.stubGlobal('document',{createElement:()=>canvas});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>manifest}));
  vi.stubGlobal('Image',class {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    set src(value:string){requested.push(value);queueMicrotask(()=>this.onload?.())}
  });
  const host={appendChild:()=>{},getBoundingClientRect:()=>({width:390,height:844})} as unknown as HTMLElement;
  let ready=0;
  const scene=new SpriteBattleScene(host,()=>{},()=>ready++,'corn');
  try{
    await vi.waitFor(()=>expect(ready).toBe(1));
    let state=createCombat(1,'corn');
    for(let i=0;i<100&&state.phase!=='targetActive';i++)state=tickCombat(state,50);
    const event={id:1,kind,contactResult:kind,amount:kind==='Miss'?1:10,
      position:{x:.5,y:.5},time:state.time-300,energyGain:0,angle:0};
    scene.render({...state,feedback:event,effects:[event]});
    expect(requested.some(url=>url.includes(`/${clip}/00001.webp`))).toBe(true);
  }finally{scene.dispose()}
});

it('splits the finisher sprite on the actual off-center cut line',async()=>{
  const translations:Array<[number,number]>=[];
  const context=new Proxy({}, {get:(_target,key)=>key==='translate'
    ?(x:number,y:number)=>{translations.push([x,y])}:()=>{}}) as CanvasRenderingContext2D;
  const canvas={dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,remove:()=>{}};
  vi.stubGlobal('document',{createElement:()=>canvas});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>manifest}));
  vi.stubGlobal('Image',class {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    set src(_value:string){queueMicrotask(()=>this.onload?.())}
  });
  const width=390,height=844;
  const host={appendChild:()=>{},getBoundingClientRect:()=>({width,height})} as unknown as HTMLElement;
  let ready=0;
  const scene=new SpriteBattleScene(host,()=>{},()=>ready++,'corn');
  try{
    await vi.waitFor(()=>expect(ready).toBe(1));
    const initial=createCombat(1,'corn');
    const cut={id:1,kind:'Cut' as const,amount:100,position:{x:.25,y:.35},time:0,
      energyGain:0,angle:Math.PI/4,finisher:true};
    scene.render({...initial,time:80,phase:'settle',battle:{...initial.battle,bossHp:0},
      feedback:cut,effects:[cut]});
    expect(translations.filter(([x,y])=>x===width*.25&&y===height*.35)).toHaveLength(4);
    expect(translations.filter(([x,y])=>x===0&&y===0)).toHaveLength(2);
  }finally{scene.dispose()}
});

it('cleans up pending frames and callbacks across 20 battle restarts',async()=>{
  const context=new Proxy({}, {get:()=>()=>{}}) as CanvasRenderingContext2D;
  let attached=0;
  vi.stubGlobal('document',{createElement:()=>({
    dataset:{},style:{},setAttribute:()=>{},getContext:()=>context,
    remove:()=>{attached--},
  })});
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>manifest}));
  class ControlledImage {
    decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    private value='';
    set src(value:string){
      this.value=value;
      if(value==='data:,')return;
      images.push(this);
      if(value.includes('/Idle/00000.webp'))queueMicrotask(()=>this.onload?.());
    }
    get src(){return this.value}
  }
  const images:ControlledImage[]=[];
  vi.stubGlobal('Image',ControlledImage);
  const host={
    appendChild:()=>{attached++},
    getBoundingClientRect:()=>({width:390,height:844}),
  } as unknown as HTMLElement;
  let ready=0,failed=0;
  for(let cycle=0;cycle<20;cycle++){
    const scene=new SpriteBattleScene(host,()=>failed++,()=>ready++,'corn');
    await vi.waitFor(()=>expect(ready).toBe(cycle+1));
    expect(attached).toBe(1);
    const pending=images.filter(image=>image.onload!==null);
    expect(pending.length).toBeGreaterThan(0);
    const lateCallbacks=pending.map(image=>image.onload!);
    scene.dispose();
    expect(attached).toBe(0);
    for(const image of pending){
      expect(image.src).toBe('data:,');
      expect(image.onload).toBeNull();
      expect(image.onerror).toBeNull();
    }
    for(const callback of lateCallbacks)callback();
    await Promise.resolve();
    expect(ready).toBe(cycle+1);
    expect(failed).toBe(0);
  }
  expect(attached).toBe(0);
});
