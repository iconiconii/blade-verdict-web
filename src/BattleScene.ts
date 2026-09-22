import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CombatState } from './domain/combat';
import { CornGuardian } from './scene/CornGuardian';
import { JellyGuardian } from './scene/JellyGuardian';
import { SliceEffects } from './scene/SliceEffects';
import { makeBattleCamera, projectBodyAnchor } from './scene/layout';
import { MonsterHitArea } from './scene/MonsterHitArea';
import { ImpactPresentation } from './scene/ImpactPresentation';
import { ringRadiusAt, type BossKind } from './domain/v2';

type EffectMesh=THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
const basic=(color:number,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false});
export interface ParryTargetLayout { round:number; x:number; y:number; diameter:number; visible:boolean }

/** Perspective world plus a pixel-space Three.js effects pass. React owns text. */
export class BattleScene {
  private renderer:THREE.WebGLRenderer;
  private world=new THREE.Scene();
  private overlay=new THREE.Scene();
  private camera=makeBattleCamera(1,1);
  private overlayCamera=new THREE.OrthographicCamera(0,1,0,-1,.1,200);
  private guardian:CornGuardian|JellyGuardian;
  private hitArea:MonsterHitArea;
  private bossKind:BossKind;
  private targetRings:THREE.Group[]=[];
  private targetLayouts:ParryTargetLayout[]=[];
  private arenaPulse!:EffectMesh;
  private width=1;private height=1;private disposed=false;
  private jellyEnvironment:THREE.WebGLRenderTarget|null=null;
  private sliceEffects:SliceEffects;
  private impactPresentation=new ImpactPresentation();

  constructor(private host:HTMLElement,private onFailure:()=>void,onReady:()=>void,bossKind:BossKind='corn'){
    this.bossKind=bossKind;this.guardian=bossKind==='jelly'?new JellyGuardian():new CornGuardian();
    this.hitArea=new MonsterHitArea(this.guardian.root);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.1;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.autoClear=false;this.renderer.setClearColor(0x101e23);
    this.renderer.domElement.dataset.scene='true-3d';
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
    this.world.fog=new THREE.FogExp2(0x101e23,.055);
    this.world.add(this.guardian.root);this.setupArena();
    this.overlayCamera.position.z=100;
    this.sliceEffects=new SliceEffects(this.overlay,bossKind);
    for(let i=0;i<2;i++){
      // Pixel-space ring follows the projected anatomical anchor exactly.
      // Its diameter is shared with the HTML hit area, independent of camera/DPR.
      const group=new THREE.Group();group.name=`body-parry-ring-${i}`;group.visible=false;
      const halo=new THREE.Mesh(new THREE.RingGeometry(.90,1,64),basic(0xffd477,.16));
      const edge=new THREE.Mesh(new THREE.RingGeometry(.969,1,64),basic(0xffd477,.95));
      const inner=new THREE.Mesh(new THREE.RingGeometry(.81,.82,64),basic(0xffe7b4,.35));
      const core=new THREE.Mesh(new THREE.CircleGeometry(1,48),basic(0xffd477,.035));
      const marker=new THREE.Mesh(new THREE.CircleGeometry(.075,4),basic(0xffedba,.95));
      marker.rotation.z=Math.PI/4;
      group.add(core,halo,edge,inner,marker);
      group.children.forEach(child=>{child.renderOrder=20;(child as EffectMesh).material.depthTest=false});
      this.overlay.add(group);this.targetRings.push(group);
    }
    this.resize();queueMicrotask(()=>{if(!this.disposed)onReady()});
  }

  private setupArena(){
    const jelly=this.bossKind==='jelly';
    if(jelly){
      // A small local studio reflection map gives the gel broad, soft highlights.
      // No network asset or per-frame environment rendering is needed.
      const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);
      try{this.jellyEnvironment=pmrem.fromScene(room,.06,.1,100,{size:128});this.world.environment=this.jellyEnvironment.texture;this.world.environmentIntensity=.55}
      finally{room.dispose();pmrem.dispose()}
    }
    const hemi=new THREE.HemisphereLight(jelly?0xb799d9:0x9accc9,jelly?0x241d3b:0x40341d,1.8);this.world.add(hemi);
    const key=new THREE.DirectionalLight(jelly?0xe1c7ff:0xffe4aa,3.3);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-3,right:3,top:4,bottom:-2,near:.5,far:14});key.shadow.normalBias=.025;key.shadow.bias=-.0001;this.world.add(key);
    const rim=new THREE.DirectionalLight(jelly?0x9f80ff:0x80cdb9,2.5);rim.position.set(3,4,-3);this.world.add(rim);
    const floorMat=new THREE.MeshStandardMaterial({color:jelly?0x2d2948:0x324238,roughness:.94});
    const floor=new THREE.Mesh(new THREE.CircleGeometry(24,64),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-.14;floor.receiveShadow=true;this.world.add(floor);
    const plinth=new THREE.Mesh(new THREE.CylinderGeometry(1.67,1.76,.17,48),new THREE.MeshStandardMaterial({color:jelly?0x49416b:0x4e5740,roughness:.9}));plinth.position.y=-.085;plinth.receiveShadow=true;this.world.add(plinth);
    const rimRing=new THREE.Mesh(new THREE.TorusGeometry(1.6,.024,6,64),new THREE.MeshStandardMaterial({color:jelly?0xb697ed:0xb89550,metalness:.3,roughness:.65}));rimRing.rotation.x=-Math.PI/2;rimRing.position.y=.015;this.world.add(rimRing);
    this.arenaPulse=new THREE.Mesh(new THREE.RingGeometry(1.16,1.51,72),basic(jelly?0xa88cff:0xffca70,.12));
    this.arenaPulse.name='battle-arena-pulse';this.arenaPulse.rotation.x=-Math.PI/2;this.arenaPulse.position.y=.026;this.arenaPulse.renderOrder=3;this.arenaPulse.frustumCulled=false;this.world.add(this.arenaPulse);
    const stalkGeometry=new THREE.CylinderGeometry(.025,.04,1.25,5),stalkMat=new THREE.MeshStandardMaterial({color:jelly?0x463d62:0x315440,roughness:1});
    const earGeo=new THREE.CapsuleGeometry(.075,.19,2,6),earMat=new THREE.MeshStandardMaterial({color:0xa68b3d,roughness:.9});
    for(let i=0;i<26;i++){
      const side=i%2?1:-1,x=side*(2.3+(i%5)*.48),z=-.5-Math.floor(i/5)*.85;
      const stalk=new THREE.Mesh(stalkGeometry,stalkMat);stalk.position.set(x,.45,z);stalk.rotation.z=side*.15;this.world.add(stalk);
      const ear=new THREE.Mesh(earGeo,jelly?new THREE.MeshStandardMaterial({color:0x665591,roughness:.8}):earMat);ear.position.set(x-side*.07,.94,z);ear.rotation.z=side*.15;this.world.add(ear);
    }
    // Low-poly stones at the arena perimeter establish depth and scale.
    const stoneGeo=new THREE.DodecahedronGeometry(.16,0),stoneMat=new THREE.MeshStandardMaterial({color:jelly?0x3c3452:0x384944,roughness:1});
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2;const stone=new THREE.Mesh(stoneGeo,stoneMat);stone.position.set(Math.cos(a)*2.02,-.09,Math.sin(a)*2.02);stone.scale.set(1.1,.6,.8);stone.rotation.y=i;this.world.add(stone)}
  }
  private contextLost=(event:Event)=>{event.preventDefault();this.onFailure()};
  resize(){
    const {width,height}=this.host.getBoundingClientRect();if(width<=0||height<=0)return;
    this.width=width;this.height=height;this.camera=makeBattleCamera(width,height);
    this.hitArea.update(this.camera);
    this.overlayCamera.right=width;this.overlayCamera.bottom=-height;this.overlayCamera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setSize(width,height,false);
  }
  /** React uses the exact layout just rendered, never a second projection/animation clock. */
  getTargetLayout(index:number){return this.targetLayouts[index]}
  isPointInsideMonster(point:{x:number;y:number}){
    return this.hitArea.contains(point);
  }
  render(state:CombatState,reducedMotion=false){
    if(this.disposed)return;const {phase,feedback,elapsed}=state,w=this.width,h=this.height,t=state.time/1000;
    const verdict=phase==='verdictReady'||phase==='verdictSlash';
    const impact=phase==='impact'||phase==='stagger'||feedback?.kind==='Cut';
    const age=feedback?Math.max(0,state.time-feedback.time):(phase==='stagger'?elapsed+280:elapsed),strength=Math.max(0,1-age/650);
    const presentation=this.impactPresentation.update(state,reducedMotion);
    const shake=presentation.shake+(!reducedMotion&&feedback?.kind==='Miss'&&impact?Math.sin(t*120)*.026*strength:0);
    this.camera.position.x=shake;this.camera.updateMatrixWorld();
    this.guardian.update(presentation.actor,reducedMotion);this.guardian.root.updateMatrixWorld(true);
    this.hitArea.update(this.camera);
    const arenaColor=verdict?0x76ffe5:feedback?.kind==='Miss'?0xff665e:this.bossKind==='jelly'?0xa98cff:0xffc66b;
    this.arenaPulse.material.color.setHex(arenaColor);
    this.arenaPulse.material.opacity=(verdict?.18:phase==='telegraph'?.13:.08)+(Math.sin(t*3.4)*.018);
    this.arenaPulse.scale.setScalar(1+(verdict?.045:.018)*Math.sin(t*(verdict?5.2:2.4)));
    this.targetLayouts=[];
    for(let i=0;i<2;i++){
      const target=state.targets[i],group=this.targetRings[i];
      const show=!!target&&!target.resolved&&phase==='targetActive'&&elapsed>=target.startDelayMs
        &&elapsed-target.startDelayMs<target.ringDurationMs;
      group.visible=show;if(!target)continue;
      const center=projectBodyAnchor(this.guardian.getAnchor(target.anchorId),this.camera,w,h);
      const radius=ringRadiusAt(Math.max(0,elapsed-target.startDelayMs),target.ringDurationMs,target.maxRadiusPx);
      this.targetLayouts[i]={round:state.round,...center,diameter:Math.max(44,radius*2),visible:show};
      if(!show)continue;
      group.position.set(center.x,-center.y,24);group.scale.setScalar(radius);
      const color=target.phase==='perfect'?0x7fffe0:0xffd277;
      group.children.forEach(child=>(child as EffectMesh).material.color.setHex(color));
      const halo=group.children[1] as EffectMesh;
      halo.material.opacity=target.phase==='perfect'?.36:.16;
    }
    this.sliceEffects.update(state,reducedMotion,event=>event.anchorId
      ?projectBodyAnchor(this.guardian.getAnchor(event.anchorId),this.camera,w,h)
      :{x:event.position.x*w,y:event.position.y*h},w,h);
    this.renderer.clear();this.renderer.render(this.world,this.camera);this.renderer.clearDepth();this.renderer.render(this.overlay,this.overlayCamera);
    this.camera.position.x=0;this.camera.updateMatrixWorld();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    for(const scene of [this.world,this.overlay])scene.traverse(object=>{
      if(object instanceof THREE.Mesh||object instanceof THREE.Line){geometries.add(object.geometry);const m=object.material;if(Array.isArray(m))m.forEach(item=>materials.add(item));else materials.add(m);}
      if(object instanceof THREE.InstancedMesh)object.dispose();
      if(object instanceof THREE.DirectionalLight)object.shadow.dispose();
    });geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.world.environment=null;this.jellyEnvironment?.dispose();this.renderer.dispose();this.renderer.domElement.remove();
  }
}
