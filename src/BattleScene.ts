import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { doubleTargetDiameter, targetDiameter, type CombatState } from './domain/combat';
import { CornGuardian } from './scene/CornGuardian';
import { JellyGuardian } from './scene/JellyGuardian';
import { makeBattleCamera, projectBodyAnchor, projectPoint, projectedWeakPoints } from './scene/layout';
import type { BossKind } from './domain/v2';

const colors={early:0xff9466,nice:0xffd369,perfect:0x74ffe4,late:0xff665c};
type EffectMesh=THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
const basic=(color:number,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,toneMapped:false});
export interface ParryTargetLayout { round:number; x:number; y:number; diameter:number; visible:boolean }

/** Perspective world plus a pixel-space Three.js effects pass. React owns text. */
export class BattleScene {
  private renderer:THREE.WebGLRenderer;
  private world=new THREE.Scene();
  private overlay=new THREE.Scene();
  private camera=makeBattleCamera(1,1);
  private overlayCamera=new THREE.OrthographicCamera(0,1,0,-1,.1,200);
  private guardian:CornGuardian|JellyGuardian;
  private bossKind:BossKind;
  private targetRings:THREE.Group[]=[];
  private targetLayouts:ParryTargetLayout[]=[];
  private weakGroups:THREE.Group[]=[];
  private guide:THREE.Line;
  private trail:EffectMesh;
  private slash:EffectMesh;
  private shock:EffectMesh;
  private sparks:EffectMesh[]=[];
  private width=1;private height=1;private disposed=false;
  private lineBuffer=new Float32Array(512*6*3);
  private lastStroke:CombatState['stroke']=null;
  private jellyEnvironment:THREE.WebGLRenderTarget|null=null;

  constructor(private host:HTMLElement,private onFailure:()=>void,onReady:()=>void,bossKind:BossKind='corn'){
    this.bossKind=bossKind;this.guardian=bossKind==='jelly'?new JellyGuardian():new CornGuardian();
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.1;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.autoClear=false;this.renderer.setClearColor(0x101e23);
    this.renderer.domElement.dataset.scene='true-3d';
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
    this.world.fog=new THREE.FogExp2(0x101e23,.055);
    this.world.add(this.guardian.root);this.setupArena();
    this.overlayCamera.position.z=100;
    for(let i=0;i<2;i++){
      // These rings are real world objects mounted on the selected body anchor.
      // React still owns the invisible 72px touch target; Three.js owns this visual.
      const group=new THREE.Group();group.name=`body-parry-ring-${i}`;group.visible=false;group.renderOrder=20;
      const outer=new THREE.Mesh(new THREE.TorusGeometry(.24,.035,8,36),basic(0xffb64f,.9));
      const warning=new THREE.Mesh(new THREE.TorusGeometry(.19,.018,6,28),basic(0xffd369,.95));
      const core=new THREE.Mesh(new THREE.CircleGeometry(.1,24),basic(0x64f4e6,.72));core.position.z=.012;
      const center=new THREE.Mesh(new THREE.TorusGeometry(.065,.014,6,20),basic(0xd7fff7,.95));center.position.z=.02;
      group.add(outer,warning,core,center);this.targetRings.push(group);
    }
    for(let i=0;i<4;i++){
      const group=new THREE.Group();group.position.z=25;
      group.add(new THREE.Mesh(new THREE.RingGeometry(.8,.95,4),basic(0xffdf8b)),new THREE.Mesh(new THREE.CircleGeometry(.22,4),basic(0xffffff)));
      this.weakGroups.push(group);this.overlay.add(group);
    }
    this.guide=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3)),new THREE.LineBasicMaterial({color:0xffdf8b,transparent:true,opacity:.28,toneMapped:false}));this.guide.position.z=23;this.overlay.add(this.guide);
    const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(this.lineBuffer,3).setUsage(THREE.DynamicDrawUsage));trailGeo.setDrawRange(0,0);
    this.trail=new THREE.Mesh(trailGeo,basic(0xb6fff4,.95));this.trail.material.side=THREE.DoubleSide;this.trail.frustumCulled=false;this.trail.position.z=40;this.overlay.add(this.trail);
    this.slash=new THREE.Mesh(new THREE.PlaneGeometry(1,1),basic(0xd9fff3,.9));this.slash.position.z=38;this.slash.rotation.z=-.65;this.overlay.add(this.slash);
    this.shock=new THREE.Mesh(new THREE.RingGeometry(.94,1,48),basic(0x74ffe4,.9));this.shock.position.z=35;this.overlay.add(this.shock);
    const sparkGeometry=new THREE.CircleGeometry(1,3),sparkMaterial=basic(0xffe6a5,.9);
    for(let i=0;i<24;i++){const spark=new THREE.Mesh(sparkGeometry,sparkMaterial);spark.position.z=36;this.sparks.push(spark);this.overlay.add(spark)}
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
    this.overlayCamera.right=width;this.overlayCamera.bottom=-height;this.overlayCamera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setSize(width,height,false);this.lastStroke=null;
  }
  /** React uses the exact layout just rendered, never a second projection/animation clock. */
  getTargetLayout(index:number){return this.targetLayouts[index]}
  isPointInsideMonster(point:{x:number;y:number}){
    this.guardian.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(this.guardian.root),min=new THREE.Vector3(Infinity,Infinity,Infinity),max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const projected=projectPoint(new THREE.Vector3(x,y,z),this.camera);min.x=Math.min(min.x,projected.x);min.y=Math.min(min.y,projected.y);max.x=Math.max(max.x,projected.x);max.y=Math.max(max.y,projected.y)}
    const cx=(min.x+max.x)/2,cy=(min.y+max.y)/2,rx=Math.max(.12,(max.x-min.x)*.47),ry=Math.max(.12,(max.y-min.y)*.43);const dx=(point.x-cx)/rx,dy=(point.y-cy)/ry;return dx*dx+dy*dy<=1;
  }
  render(state:CombatState,reducedMotion=false){
    if(this.disposed)return;const {phase,feedback,elapsed}=state,w=this.width,h=this.height,t=state.time/1000;
    const impact=phase==='impact'||phase==='stagger'||feedback?.kind==='Cut';
    const age=feedback?Math.max(0,state.time-feedback.time):(phase==='stagger'?elapsed+280:elapsed),strength=Math.max(0,1-age/650);
    const shake=!reducedMotion&&feedback?.kind==='Miss'&&impact?Math.sin(t*120)*.026*strength:0;
    this.camera.position.x=shake;this.camera.updateMatrixWorld();
    this.guardian.update(state,reducedMotion);this.guardian.root.updateMatrixWorld(true);
    this.targetLayouts=[];
    for(let i=0;i<2;i++){
      const target=state.targets[i],group=this.targetRings[i];
      const show=!!target&&!target.resolved&&(
        phase==='telegraph'&&target.targetIndex===0
        || phase==='targetActive'&&elapsed>=target.startDelayMs
      );
      group.visible=show;if(!target)continue;
      const center=projectBodyAnchor(this.guardian.getAnchor(target.anchorId),this.camera,w,h),d=Math.max(targetDiameter(w,h),state.targets.length===2?doubleTargetDiameter:0);
      this.targetLayouts[i]={round:state.round,...center,diameter:d,visible:show};
      if(!show)continue;
      const anchor=this.guardian.getAnchor(target.anchorId);if(group.parent!==anchor)anchor.add(group);
      group.position.set(0,0,.055);group.rotation.z=Math.sin(t*1.8+i)*.035;
      const pulse=1+Math.sin(t*7+i)*.04,scale=(1.08-target.telegraphProgress*.3)*pulse;group.scale.setScalar(scale);
      const outer=group.children[0] as EffectMesh,warning=group.children[1] as EffectMesh,core=group.children[2] as EffectMesh,centerMesh=group.children[3] as EffectMesh;
      outer.material.color.setHex(target.phase==='perfect'?0x76ffe5:target.phase==='late'?0xff675e:0xffa94f);
      warning.material.color.setHex(colors[target.phase]);core.material.color.setHex(target.phase==='perfect'?0x9affed:0x5ed9e0);centerMesh.material.color.setHex(0xeaffff);
      core.material.opacity=phase==='telegraph'?.58:.86;
    }
    const verdict=false;
    const weak=projectedWeakPoints(state.battle.verdictCount-(feedback?.kind==='Verdict'?1:0),w,h,this.bossKind);
    const guidePoints=this.guide.geometry.getAttribute('position') as THREE.BufferAttribute;
    weak.forEach((point,i)=>{
      const group=this.weakGroups[i];group.visible=verdict;group.position.set(point.x*w,-point.y*h,25);group.scale.set(point.radius*h,point.radius*h,1);
      const caught=state.stroke?.hitWeakPointIds.includes(point.id);(group.children[0] as EffectMesh).material.color.setHex(caught?0x74ffe4:0xffdf8b);group.rotation.z=caught?Math.PI/4:0;
      guidePoints.setXYZ(i,point.x*w,-point.y*h,0);
    });guidePoints.needsUpdate=true;this.guide.visible=verdict;this.guide.frustumCulled=false;
    this.drawStroke(state);
    this.shock.visible=this.slash.visible=!!feedback&&impact&&strength>0;
    const position=feedback?.anchorId?projectBodyAnchor(this.guardian.getAnchor(feedback.anchorId),this.camera,w,h):{x:(feedback?.position.x??.5)*w,y:(feedback?.position.y??.5)*h};
    if(feedback){
      const color=feedback.kind==='Miss'?0xff695e:feedback.kind==='Nice'?0xffd369:0x85ffdf;
      this.shock.position.set(position.x,-position.y,35);this.shock.scale.setScalar(25+age*.18);this.shock.material.opacity=strength;this.shock.material.color.setHex(color);
      this.slash.visible=this.slash.visible&&feedback.kind!=='Miss';this.slash.position.set(position.x,-position.y,38);this.slash.scale.set(3+strength*4,Math.min(w*.6,290),1);this.slash.material.opacity=strength;
      this.sparks.forEach((spark,i)=>{spark.visible=impact&&strength>0;const a=i*2.39996,r=(25+age*.17)*(.7+(i%4)*.14);spark.position.set(position.x+Math.cos(a)*r,-position.y+Math.sin(a)*r-age*age*.00005,36);spark.scale.setScalar((i%3+1)*1.7*strength);spark.material.color.setHex(color)});
    }else this.sparks.forEach(spark=>spark.visible=false);
    this.renderer.clear();this.renderer.render(this.world,this.camera);this.renderer.clearDepth();this.renderer.render(this.overlay,this.overlayCamera);
    this.camera.position.x=0;this.camera.updateMatrixWorld();
  }
  private drawStroke(state:CombatState){
    const stroke=state.stroke,points=stroke?.points??[];this.trail.visible=points.length>1;
    if(stroke!==this.lastStroke){
      let count=0;
      for(let i=1;i<Math.min(points.length,513);i++){
        const a=points[i-1],b=points[i],ax=a.x*this.width,ay=-a.y*this.height,bx=b.x*this.width,by=-b.y*this.height;
        const len=Math.hypot(bx-ax,by-ay)||1,nx=-(by-ay)/len*3,ny=(bx-ax)/len*3;
        this.lineBuffer.set([ax+nx,ay+ny,0,ax-nx,ay-ny,0,bx+nx,by+ny,0,bx+nx,by+ny,0,ax-nx,ay-ny,0,bx-nx,by-ny,0],count);count+=18;
      }
      this.trail.geometry.getAttribute('position').needsUpdate=true;this.trail.geometry.setDrawRange(0,count/3);this.lastStroke=stroke;
    }
    this.trail.material.opacity=state.phase==='verdictSlash'?1:Math.max(0,1-state.elapsed/900);
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
