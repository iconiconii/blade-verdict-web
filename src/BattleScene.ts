import * as THREE from 'three';
import { targetCenter, targetDiameter, weakPointsFor, type CombatState } from './domain/combat';

const colors={early:0xff845c,nice:0xffd369,perfect:0x74ffe4,late:0xff665c};
const vertexShader=`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// Original Unity animation frames have a flat green screen. Key only saturated
// green, preserving the dark olive leaf armour; no modified source artwork.
const fragmentShader=`uniform sampler2D map; uniform float flash; uniform float fade; varying vec2 vUv;
 void main(){vec4 c=texture2D(map,vUv);float green=c.g-max(c.r,c.b);float key=smoothstep(.20,.40,green)*smoothstep(.45,.65,c.g);float a=c.a*(1.-key)*fade;if(a<.04)discard;gl_FragColor=vec4(mix(c.rgb,vec3(1.),flash),a);}`;

export class BattleScene {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(0,1,0,-1,.1,1000);
  private textures:THREE.Texture[]=[];
  private manager=new THREE.LoadingManager();
  private frames:THREE.Texture[]=[];
  private boss:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private background:THREE.Mesh;
  private shadow:THREE.Mesh;
  private targetGroups:THREE.Group[]=[];
  private weakGroups:THREE.Group[]=[];
  private guide:THREE.Line;
  private trail:THREE.Mesh;
  private burst:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
  private shock:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
  private sparks:THREE.Mesh[]=[];
  private leaves:THREE.Mesh[]=[];
  private width=1; private height=1; private disposed=false;
  private onFailure:()=>void;

  constructor(private host:HTMLElement,onFailure:()=>void,onReady:()=>void){
    this.onFailure=onFailure;
    this.manager.onLoad=()=>{if(!this.disposed)onReady()};
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0b1719);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
    this.camera.position.z=100;
    this.background=this.plane(this.texture('/assets/corn-battlefield.png'),0);
    this.shadow=new THREE.Mesh(new THREE.CircleGeometry(1,48),new THREE.MeshBasicMaterial({color:0x091112,transparent:true,opacity:.65,depthWrite:false}));this.shadow.position.z=1;this.scene.add(this.shadow);
    this.frames=['idle','attack','hit','defeated'].map(name=>this.texture(`/assets/corn/${name}.png`));
    this.boss=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{map:{value:this.frames[0]},flash:{value:0},fade:{value:1}},transparent:true,depthWrite:false}));this.boss.position.z=10;this.scene.add(this.boss);
    for(let i=0;i<2;i++){
      const group=new THREE.Group();group.position.z=40;
      const halo=new THREE.Mesh(new THREE.RingGeometry(.63,.66,64),new THREE.MeshBasicMaterial({color:0xffd369,transparent:true,opacity:.3}));
      const ring=new THREE.Mesh(new THREE.RingGeometry(.48,.515,64),new THREE.MeshBasicMaterial({color:0xffd369}));
      const core=new THREE.Mesh(new THREE.CircleGeometry(.36,6),new THREE.MeshBasicMaterial({color:0xffd369}));core.rotation.z=Math.PI/6;core.position.z=1;
      const inner=new THREE.Mesh(new THREE.RingGeometry(.15,.18,32),new THREE.MeshBasicMaterial({color:0x182225}));inner.position.z=2;
      group.add(halo,ring,core,inner);this.targetGroups.push(group);this.scene.add(group);
      const path=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xfce59b,transparent:true,opacity:.3}));path.name=`attack-path-${i}`;path.position.z=15;this.scene.add(path);
    }
    for(let i=0;i<4;i++){
      const group=new THREE.Group();group.position.z=42;
      const ring=new THREE.Mesh(new THREE.RingGeometry(.85,1,4),new THREE.MeshBasicMaterial({color:0xfadf91}));
      const dot=new THREE.Mesh(new THREE.CircleGeometry(.24,4),new THREE.MeshBasicMaterial({color:0xffffff}));group.add(ring,dot);this.weakGroups.push(group);this.scene.add(group);
    }
    this.guide=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf9dc83,transparent:true,opacity:.28}));this.guide.position.z=38;this.scene.add(this.guide);
    this.trail=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xb6fff4,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false}));this.trail.position.z=50;this.scene.add(this.trail);
    this.burst=this.plane(this.texture('/assets/corn-vfx/perfect-burst.png'),55) as typeof this.burst;
    this.shock=new THREE.Mesh(new THREE.RingGeometry(.94,1,64),new THREE.MeshBasicMaterial({color:0x74ffe4,transparent:true,opacity:0,depthWrite:false}));this.shock.position.z=54;this.scene.add(this.shock);
    for(let i=0;i<24;i++){const spark=new THREE.Mesh(new THREE.CircleGeometry(1,3),new THREE.MeshBasicMaterial({color:0xffe6a5,transparent:true,depthWrite:false}));spark.position.z=52;this.sparks.push(spark);this.scene.add(spark)}
    for(let i=0;i<10;i++){const leaf=new THREE.Mesh(new THREE.CircleGeometry(1,3),new THREE.MeshBasicMaterial({color:i%2?0x94b858:0xffd267,transparent:true,opacity:.35,depthWrite:false}));leaf.position.z=8;this.leaves.push(leaf);this.scene.add(leaf)}
    this.resize();
  }
  private contextLost=(event:Event)=>{event.preventDefault();this.onFailure()};
  private texture(url:string){const t=new THREE.TextureLoader(this.manager).load(url,()=>{if(this.disposed)t.dispose()},undefined,()=>{if(!this.disposed)this.onFailure()});t.colorSpace=THREE.SRGBColorSpace;this.textures.push(t);return t}
  private plane(map:THREE.Texture,z:number){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false}));mesh.position.z=z;this.scene.add(mesh);return mesh}
  resize(){
    const {width,height}=this.host.getBoundingClientRect();if(width<=0||height<=0)return;
    this.width=width;this.height=height;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setSize(width,height,false);
    this.camera.right=width;this.camera.bottom=-height;this.camera.updateProjectionMatrix();
    const bgWidth=Math.max(width,height*941/1672),bgHeight=bgWidth*1672/941;
    this.background.scale.set(bgWidth,bgHeight,1);this.background.position.set(width/2,-height/2+(bgHeight-height)*.08,0);
  }
  render(s:CombatState,reducedMotion=false){
    if(this.disposed)return;const w=this.width,h=this.height,t=s.time/1000;
    const verdict=s.phase==='verdictReady'||s.phase==='verdictSlash'||s.feedback?.kind==='Verdict';
    const feedback=s.feedback,impact=s.phase==='impact'||s.phase==='stagger';
    const hit=impact&&feedback&&feedback.kind!=='Miss';
    const hitStop=feedback?.kind==='Perfect'&&s.phase==='impact'&&s.elapsed<100;
    const animTime=hitStop?(s.time-s.elapsed)/1000:t;
    const size=Math.min(w*1.45,h*1.12,860);
    const pose=s.battle.bossHp<=0?3:hit?2:s.phase==='telegraph'||s.phase==='targetActive'?1:0;
    this.boss.material.uniforms.map.value=this.frames[pose];
    this.boss.material.uniforms.flash.value=hit&&s.phase==='impact'?Math.max(0,.7-s.elapsed/210):0;
    this.boss.material.uniforms.fade.value=s.phase==='settle'&&s.battle.bossHp<=0?Math.max(0,1-s.elapsed/900):1;
    const bob=reducedMotion?0:Math.sin(animTime*2)*5;
    const recoil=!reducedMotion&&hit?Math.sin(s.elapsed/35)*Math.max(0,12-s.elapsed/30):0;
    const charge=s.phase==='telegraph'?Math.sin(s.elapsed/400*Math.PI)*.06:0;
    this.boss.position.set(w*.5+recoil,-h*.49+bob,10);this.boss.scale.set(size*(1-charge),size*(1+charge),1);
    this.boss.rotation.z=reducedMotion?0:s.battle.bossHp<=0?-.15:Math.sin(animTime*1.6)*.012;
    this.shadow.position.set(w*.5,-h*.49-size*.245,1);this.shadow.scale.set(size*.28,size*.045,1);
    for(let i=0;i<2;i++){
      const group=this.targetGroups[i],target=s.targets[i];
      const path=this.scene.getObjectByName(`attack-path-${i}`) as THREE.Line;
      const show=!!target&&!target.resolved&&(s.phase==='telegraph'||s.phase==='targetActive'&&s.elapsed>=target.startDelayMs);
      group.visible=path.visible=show;if(!show)continue;
      const center=targetCenter(target.position,w,h),d=targetDiameter(w,h),p=target.telegraphProgress,color=colors[target.phase];
      group.position.set(center.x,-center.y,40);group.scale.setScalar(d);
      const ring=group.children[1] as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
      const core=group.children[2] as THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>;
      ring.scale.setScalar(1.5-p*.65);ring.material.color.setHex(color);core.material.color.setHex(color);
      core.scale.setScalar(s.phase==='telegraph'?.45:1);ring.material.opacity=s.phase==='telegraph'?.5:1;
      const positions=new Float32Array([w*.5,-h*.51,0,center.x,-center.y,0]);path.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    }
    const weak=weakPointsFor(s.battle.verdictCount-(feedback?.kind==='Verdict'?1:0),w,h);
    for(let i=0;i<4;i++){
      const group=this.weakGroups[i],point=weak[i];group.visible=verdict;
      group.position.set(point.x*w,-point.y*h,42);group.scale.setScalar(point.radius*h*.8);
      const caught=s.stroke?.hitWeakPointIds.includes(point.id),ring=group.children[0] as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
      ring.material.color.setHex(caught?0x7dffdf:0xffdf8b);group.rotation.z=caught?Math.PI/4:Math.sin(t*2)*.08;
    }
    this.guide.visible=verdict;this.guide.geometry.setFromPoints(weak.map(p=>new THREE.Vector3(p.x*w,-p.y*h,0)));
    this.drawStroke(s);
    const effect=impact&&feedback!==null,age=s.phase==='stagger'&&feedback?.kind!=='Verdict'?s.elapsed+280:s.elapsed;
    const strength=Math.max(0,1-age/650),radius=25+age*.18;
    this.shock.visible=this.burst.visible=!!effect&&strength>0;
    if(feedback){
      const color=feedback.kind==='Miss'?0xff695e:feedback.kind==='Nice'?0xffd369:0x85ffdf;
      const x=feedback.position.x*w,y=-feedback.position.y*h;
      this.shock.position.set(x,y,54);this.shock.scale.setScalar(radius);this.shock.material.opacity=strength;this.shock.material.color.setHex(color);
      this.burst.position.set(x,y,55);this.burst.scale.setScalar(70+age*.14);this.burst.material.opacity=strength*.65;
      this.burst.material.color.setHex(feedback.kind==='Miss'?0xff5142:0xffffff);
      this.sparks.forEach((spark,i)=>{spark.visible=!!effect&&strength>0;const angle=i*2.39996;const speed=radius*(.8+(i%4)*.15);spark.position.set(x+Math.cos(angle)*speed,y+Math.sin(angle)*speed-age*age*.00009,52);spark.scale.setScalar((i%3+1)*1.7*strength);(spark.material as THREE.MeshBasicMaterial).color.setHex(color)});
    }else this.sparks.forEach(spark=>spark.visible=false);
    this.leaves.forEach((leaf,i)=>{const motion=reducedMotion?0:t*.018;leaf.position.x=((i*.113+motion)%1)*w;leaf.position.y=-((i*.219+motion*.7)%1)*h;leaf.rotation.z=i+t*.15;leaf.scale.set(3+(i%3)*2,7+(i%2)*3,1)});
    const shake=!reducedMotion&&feedback?.kind==='Miss'&&impact?Math.sin(s.elapsed*.13)*Math.max(0,7-age/45):0;
    this.camera.position.x=shake;this.renderer.render(this.scene,this.camera);
  }
  private drawStroke(s:CombatState){
    const points=s.stroke?.points??[];this.trail.visible=points.length>1;if(points.length<2)return;
    const vertices:number[]=[];const half=3;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],ax=a.x*this.width,ay=-a.y*this.height,bx=b.x*this.width,by=-b.y*this.height;
      const len=Math.hypot(bx-ax,by-ay)||1,nx=-(by-ay)/len*half,ny=(bx-ax)/len*half;
      vertices.push(ax+nx,ay+ny,0,ax-nx,ay-ny,0,bx+nx,by+ny,0,bx+nx,by+ny,0,ax-nx,ay-ny,0,bx-nx,by-ny,0);
    }
    this.trail.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));this.trail.geometry.computeBoundingSphere();
    (this.trail.material as THREE.MeshBasicMaterial).opacity=s.phase==='verdictSlash'?1:Math.max(0,1-s.elapsed/900);
  }
  dispose(){
    this.disposed=true;this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line){geometries.add(object.geometry);const m=object.material;if(Array.isArray(m))m.forEach(x=>materials.add(x));else materials.add(m)}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.renderer.dispose();this.renderer.domElement.remove();
  }
}
