import { useEffect } from 'react';
import { useGame } from '../store';
import { AudioManager } from './AudioManager';
import { backgroundMusic, globalAudioAssets } from './audioAssets';
import { MusicManager } from './MusicManager';

export interface GameAudioSnapshot { screen:string; battleId:string|null; paused:boolean; won:boolean }
export interface GameAudioOptions {
  shortAudio:Pick<AudioManager,'unlock'|'playCue'|'stopCue'|'stopAll'|'dispose'>;
  music:Pick<MusicManager,'gesture'|'setSuspended'|'duck'|'dispose'>;
  preload?:()=>Promise<void>;
  createBattleAudio?:()=>AudioManager;
}

/** App lifetime, independent of battle remounts. It observes, never changes game state. */
export class GameAudioController {
  private disposed=false;
  private suspended=false;
  private hasGesture=false;
  private pendingGesture=false;
  private needsPreload=true;
  private activeResult:string|null=null;
  private readonly results=new Set<string>();

  constructor(private readonly options:GameAudioOptions){}

  prepare():void {
    if(this.disposed||this.suspended||!this.needsPreload)return;
    this.needsPreload=false;
    try{void this.options.preload?.().catch(()=>{})}catch{/* A failed sample keeps its synth fallback. */}
  }

  gesture():void {
    if(this.disposed)return;
    this.hasGesture=true;
    if(this.suspended){this.pendingGesture=true;return;}
    this.unlock();
    this.prepare();
    this.options.music.gesture();
  }

  uiClick():void {
    if(this.disposed||this.suspended)return;
    // Covers accessibility-generated clicks as well as pointer/keyboard clicks.
    this.gesture();
    this.options.shortAudio.playCue('UI');
  }

  update(state:GameAudioSnapshot,hidden=false):void {
    if(this.disposed)return;
    const result=state.screen==='result'?state.battleId:null;
    if(this.activeResult&&this.activeResult!==result){
      // A rapid restart should not bring the old victory/defeat fanfare into the new battle.
      // Keep the navigation click and music alive; only remove these result voices.
      this.options.shortAudio.stopCue('Victory');
      this.options.shortAudio.stopCue('Defeat');
    }
    this.activeResult=result;
    const suspended=hidden||(state.screen==='battle'&&state.paused);
    if(suspended!==this.suspended){
      this.suspended=suspended;
      this.options.music.setSuspended(suspended);
      if(suspended){
        this.options.shortAudio.stopAll();
        this.needsPreload=true;
      }else if(this.hasGesture){
        this.unlock();
        this.prepare();
        if(this.pendingGesture)this.options.music.gesture();
        this.pendingGesture=false;
      }
    }
    if(state.screen!=='result'||!state.battleId||this.results.has(state.battleId))return;
    // Consume hidden/silent results too: focus, save retries and navigation do not replay them.
    this.results.add(state.battleId);
    if(this.results.size>64)this.results.delete(this.results.values().next().value!);
    if(!suspended&&this.hasGesture){
      this.options.shortAudio.playCue(state.won?'Victory':'Defeat');
      this.options.music.duck(state.won?3700:3000);
    }
  }

  duck(durationMs?:number):void {
    if(!this.disposed&&!this.suspended)this.options.music.duck(durationMs);
  }

  createBattleAudio():AudioManager {
    const audio=!this.disposed&&this.options.createBattleAudio?this.options.createBattleAudio():new AudioManager();
    // Reuse the menu gesture's running context. A new battle must not require
    // another tap before an automatic Miss/timeout can be heard.
    if(!this.disposed&&this.hasGesture&&!this.suspended){
      try{void audio.unlock().catch(()=>{})}catch{/* The battle can stay safely silent. */}
    }
    return audio;
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    this.results.clear();
    this.options.shortAudio.dispose();
    this.options.music.dispose();
  }

  private unlock():void {
    try{void this.options.shortAudio.unlock().catch(()=>{})}catch{/* Autoplay policy must not interrupt input. */}
  }
}

/** One delegated click listener also covers controls rendered through portals. */
export function isAudioUiTarget(target:EventTarget|null):boolean {
  if(!target||!('closest' in target)||typeof target.closest!=='function')return false;
  const element=target as Element;
  if(element.closest('.parry-target,[data-audio="silent"]'))return false;
  const control=element.closest('button,[role="tab"],[role="switch"]');
  return !!control&&!control.matches(':disabled')&&!control.closest('[aria-disabled="true"],[inert]');
}

interface AudioEnvironment {
  document:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>;
  snapshot:()=>GameAudioSnapshot;
  subscribe:(listener:()=>void)=>()=>void;
}

/** Exported connection boundary makes repeated mount/unmount cleanup testable without WebGL. */
export function connectGameAudio(controller:GameAudioController,environment:AudioEnvironment):()=>void {
  const doc=environment.document;
  const update=()=>controller.update(environment.snapshot(),doc.hidden);
  const pointer=()=>controller.gesture();
  const keyboard=(event:Event)=>{const key=event as KeyboardEvent;if(!key.repeat&&!key.isComposing)controller.gesture()};
  const click=(event:Event)=>{if(isAudioUiTarget(event.target))controller.uiClick()};
  const capture={capture:true};
  doc.addEventListener('pointerdown',pointer,capture);
  doc.addEventListener('keydown',keyboard,capture);
  doc.addEventListener('click',click,capture);
  doc.addEventListener('visibilitychange',update);
  const unsubscribe=environment.subscribe(update);
  update();
  controller.prepare();
  let connected=true;
  return()=>{
    if(!connected)return;
    connected=false;
    unsubscribe();
    doc.removeEventListener('pointerdown',pointer,capture);
    doc.removeEventListener('keydown',keyboard,capture);
    doc.removeEventListener('click',click,capture);
    doc.removeEventListener('visibilitychange',update);
    controller.dispose();
  };
}

let activeController:GameAudioController|null=null;
let activeCleanup:(()=>void)|null=null;

export function duckMusic(durationMs?:number):void { activeController?.duck(durationMs); }
export function createBattleAudio():AudioManager { return activeController?.createBattleAudio()??new AudioManager(); }

export function useGameAudio():void {
  useEffect(()=>{
    const shortAudio=new AudioManager({maxVoices:6});
    const controller=new GameAudioController({shortAudio,music:new MusicManager(backgroundMusic),
      preload:()=>shortAudio.preload(globalAudioAssets),createBattleAudio:()=>shortAudio.fork()});
    const cleanup=connectGameAudio(controller,{document,snapshot:()=>{
      const state=useGame.getState();
      return {screen:state.screen,battleId:state.battleId,paused:state.combat.paused,won:state.combat.battle.bossHp<=0};
    },subscribe:listener=>useGame.subscribe(listener)});
    activeController=controller;activeCleanup=cleanup;
    return()=>{
      cleanup();
      if(activeController===controller){activeController=null;activeCleanup=null;}
    };
  },[]);
}

if(import.meta.hot)import.meta.hot.dispose(()=>{activeCleanup?.();activeCleanup=null;activeController=null;});
