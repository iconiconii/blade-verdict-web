import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CombatFeedback, CombatState } from '../domain/combat';
import type { BossKind } from '../domain/v2';

const flat=(color:number,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
type Burst={root:THREE.Group; blade:THREE.Mesh<THREE.ShapeGeometry,THREE.MeshBasicMaterial>; halves:THREE.Group[];
  trail:THREE.Line<THREE.BufferGeometry,THREE.LineBasicMaterial>; dust:THREE.InstancedMesh; materials:THREE.MeshBasicMaterial[]; event:CombatFeedback|null; x:number; y:number; length:number};

/** Bounded object pool: curved blades, exposed food cross-sections and juice. No pointer polyline. */
export class SliceEffects {
  private pool:Burst[]=[];
  private seen=0;
  private cursor=0;
  private dummy=new THREE.Object3D();
  private goodEvent:CombatFeedback|null=null;
  private goodComic=new THREE.Group();
  private goodRays:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>[]=[];
  private goodChunks:THREE.InstancedMesh;
  constructor(private scene:THREE.Scene,kind:BossKind){
    const palette=kind==='corn'
      ?{face:0xffecab,edge:0xdf911e,kernels:0xe8ab23,dust:0xffbf42,detail:1.2}
      :kind==='carrot'
        ?{face:0xffb06a,edge:0xd95724,kernels:0xf28a31,dust:0xffa43d,detail:1.05}
        :kind==='cabbage'
          ?{face:0xd8efad,edge:0x5ca05a,kernels:0x9fc96c,dust:0xc7e58a,detail:.82}
          :kind==='tomato'
            ?{face:0xff9a75,edge:0xb52e38,kernels:0xe95b3d,dust:0xff875f,detail:.82}
            :{face:0xd8bcff,edge:0x8657c8,kernels:0x9d7aea,dust:0xb894ff,detail:.6};
    this.goodComic.name='good-comic-impact';this.goodComic.visible=false;this.goodComic.position.z=30;scene.add(this.goodComic);
    const rayGeometry=new THREE.BufferGeometry();
    rayGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,-.5,0,1,.5,0],3));
    const rayMaterial=flat(0xfff6d7,.28);
    for(let i=0;i<16;i++){
      const ray=new THREE.Mesh(rayGeometry,rayMaterial);ray.name='good-peripheral-speed-line';ray.renderOrder=30;
      this.goodComic.add(ray);this.goodRays.push(ray);
    }
    this.goodChunks=new THREE.InstancedMesh(new RoundedBoxGeometry(1,1,.7,2,.15),flat(palette.kernels),7);
    this.goodChunks.name='good-food-fragments';this.goodChunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.goodChunks.frustumCulled=false;this.goodChunks.renderOrder=40;this.goodComic.add(this.goodChunks);
    const bladeShape=new THREE.Shape();
    bladeShape.moveTo(-110,-20);bladeShape.quadraticCurveTo(-5,64,110,20);
    bladeShape.quadraticCurveTo(12,12,-110,-20);
    const bladeGeo=new THREE.ShapeGeometry(bladeShape,16);
    const halfShape=new THREE.Shape();halfShape.moveTo(0,-26);
    halfShape.absarc(0,0,26,-Math.PI/2,Math.PI/2,false);halfShape.lineTo(0,-26);
    const halfGeo=new THREE.ExtrudeGeometry(halfShape,{depth:9,bevelEnabled:true,bevelThickness:2,bevelSize:2,bevelSegments:1,curveSegments:12});
    const kernelGeo=new THREE.SphereGeometry(3.2,8,6),dropGeo=new THREE.SphereGeometry(1,8,6);
    for(let n=0;n<14;n++){
      const root=new THREE.Group();root.visible=false;root.position.z=36;scene.add(root);
      const bladeMat=flat(0xffe6a1),face=flat(palette.face),edge=flat(palette.edge);
      const kernels=flat(palette.kernels),dustMat=flat(palette.dust);
      const blade=new THREE.Mesh(bladeGeo,bladeMat);blade.position.z=18;blade.renderOrder=45;root.add(blade);
      const trail=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-80,0,19),new THREE.Vector3(80,0,19)]),new THREE.LineBasicMaterial({color:0xfff1c8,transparent:true,opacity:.8,depthTest:false,depthWrite:false,toneMapped:false}));
      trail.renderOrder=46;root.add(trail);
      const halves:THREE.Group[]=[];
      for(const side of [-1,1]){
        const half=new THREE.Group(),slice=new THREE.Mesh(halfGeo,[face,edge]);
        slice.rotation.z=side<0?Math.PI:0;slice.renderOrder=42;half.add(slice);
        const detail=new THREE.InstancedMesh(kernelGeo,kernels,9);detail.renderOrder=43;
        for(let i=0;i<9;i++){
          const a=-Math.PI/2+(i+1)/10*Math.PI;
          this.dummy.position.set(side*(Math.cos(a)*18+2),Math.sin(a)*18,12);
          this.dummy.rotation.set(0,0,a);this.dummy.scale.set(palette.detail,1,.45);this.dummy.updateMatrix();detail.setMatrixAt(i,this.dummy.matrix);
        }
        half.add(detail);root.add(half);halves.push(half);
      }
      const dust=new THREE.InstancedMesh(dropGeo,dustMat,12);dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dust.frustumCulled=false;dust.renderOrder=41;root.add(dust);
      this.pool.push({root,blade,halves,trail,dust,materials:[bladeMat,face,edge,kernels,dustMat],event:null,x:0,y:0,length:140});
    }
  }
  update(state:CombatState,reducedMotion:boolean,position:(event:CombatFeedback)=>{x:number;y:number},width=1,height=1){
    for(const event of state.effects){
      if(event.id<=this.seen)continue;
      this.seen=event.id;
      this.goodEvent=(event.contactResult??event.kind)==='Nice'?event:null;
      if(event.kind==='Miss')continue;
      const slot=this.pool[this.cursor++%this.pool.length],p=position(event);
      const path=event.path&&event.path.length>1?event.path:null;
      const end=path?.at(-1),start=path?.at(-2);
      slot.event=event;slot.x=end?end.x*width:p.x;slot.y=end?end.y*height:p.y;
      slot.length=start&&end?Math.max(70,Math.min(320,Math.hypot((end.x-start.x)*640,(end.y-start.y)*640))):140;
    }
    this.updateGoodComic(state,reducedMotion,width,height);
    for(const slot of this.pool){
      const event=slot.event,age=event?state.time-event.time:Infinity;
      slot.root.visible=age<720;if(!event||age>=720)continue;
      // Keep the actor visually frozen for the requested 60–80ms, then let
      // the final cut release its reused halves and dust immediately after.
      const fractureAge=event.finisher?Math.max(0,age-80):age;
      const progress=Math.min(1,fractureAge/(event.finisher?780:720)),fade=1-progress,cut=event.kind==='Cut',perfect=event.kind==='Perfect';
      const force=reducedMotion?.25:event.finisher?2.25:cut?(event.speed==='ferocious'?1.55:event.speed==='fast'?1.3:1.12):.6;
      slot.root.position.set(slot.x,-slot.y,36);
      slot.root.rotation.z=-event.angle;
      const path=event.path&&event.path.length>1?event.path:null;
      const trailPosition=slot.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      if(path){
        const start=path[0],end=path.at(-1)!;
        trailPosition.setXYZ(0,(start.x*width-slot.x),-(start.y*height-slot.y),19);
        trailPosition.setXYZ(1,(end.x*width-slot.x),-(end.y*height-slot.y),19);
      } else {
        trailPosition.setXYZ(0,-slot.length*.5,0,19);trailPosition.setXYZ(1,slot.length*.5,0,19);
      }
      trailPosition.needsUpdate=true;
      slot.trail.visible=age<(event.finisher?320:cut?280:260);
      slot.trail.material.opacity=Math.max(0,1-age/(event.finisher?320:cut?280:260))*(event.finisher?1:cut?.86:.65);
      slot.blade.visible=age<(event.finisher?270:cut?250:240);
      const tierScale=event.finisher?1.9:event.speed==='ferocious'?1.48:event.speed==='fast'?1.22:cut?1.06:.9;
      slot.blade.scale.set(tierScale*slot.length/220,(perfect?1.12:cut?1.02:.78)*(1+Math.min(age/240,1)*.2),1);
      slot.blade.material.color.setHex(event.finisher?0xffffff:perfect?0xc3fff2:cut?0xfff1d2:0xffda8d);
      slot.blade.material.opacity=Math.max(0,1-age/(event.finisher?360:240));
      slot.halves.forEach((half,i)=>{
        const side=i===0?-1:1;
        half.visible=cut&&(!event.finisher||age>=80);
        half.position.set(side*(6+progress*(event.finisher?145:100)*force),15+Math.sin(progress*Math.PI)*44*force-progress*progress*80,0);
        half.rotation.set(progress*1.4,side*progress*1.1,side*progress*.6);
        half.scale.setScalar((.75+Math.sin(progress*Math.PI)*.2)*Math.min(1,fade*4));
      });
      for(const m of slot.materials.slice(1))m.opacity=fade;
      for(let i=0;i<12;i++){
        const a=i*2.39996+event.id*.3,r=(8+progress*(65+(i%3)*28))*force;
        this.dummy.position.set(Math.cos(a)*r,Math.sin(a)*r-progress*progress*80,15);
        this.dummy.rotation.set(0,0,a);this.dummy.scale.set((2+i%3)*fade*(cut?2.1:1),3*fade*(cut?1.18:1),1);
        this.dummy.updateMatrix();slot.dust.setMatrixAt(i,this.dummy.matrix);
      }
      slot.dust.instanceMatrix.needsUpdate=true;
    }
  }

  private updateGoodComic(state:CombatState,reducedMotion:boolean,width:number,height:number){
    const event=this.goodEvent,age=event?state.time-event.time:Infinity;
    this.goodComic.visible=!reducedMotion&&age>=0&&age<250&&state.battle.bossHp>0
      &&state.phase!=='settle'&&state.phase!=='verdictReady'&&state.phase!=='verdictSlash';
    if(!this.goodComic.visible||!event)return;
    const progress=age/250,fade=1-progress;
    const centerX=width*.5,centerY=height*.55;
    for(let i=0;i<this.goodRays.length;i++){
      const ray=this.goodRays[i],angle=(i+.5)/this.goodRays.length*Math.PI*2;
      const dx=Math.cos(angle),dy=Math.sin(angle);
      const extent=Math.min((dx>0?width-centerX:centerX)/Math.abs(dx),(dy>0?centerY:height-centerY)/Math.abs(dy));
      // The middle remains empty: no lines across the face or the active blade.
      const start=Math.max(Math.min(width,height)*.29,extent*(.58+progress*.08));
      ray.position.set(centerX+dx*start,-centerY+dy*start,0);ray.rotation.z=angle;
      ray.scale.set(Math.max(0,extent-start),1.1+(i%3)*.35,1);ray.visible=age<210;
    }
    this.goodRays[0].material.opacity=Math.max(0,1-age/210)*.28;
    (this.goodChunks.material as THREE.MeshBasicMaterial).opacity=fade;
    for(let i=0;i<7;i++){
      const angle=i*2.39996+event.id*.4,r=(Math.min(width,height)*.19+progress*48)*(i%2?.92:1.12);
      this.dummy.position.set(centerX+Math.cos(angle)*r,-centerY+Math.sin(angle)*r-progress*progress*30,2);
      this.dummy.rotation.set(progress*2+i*.3,progress*1.8,angle+progress*1.6);
      this.dummy.scale.setScalar((6+i%3)*Math.min(1,fade*3));this.dummy.updateMatrix();
      this.goodChunks.setMatrixAt(i,this.dummy.matrix);
    }
    this.goodChunks.instanceMatrix.needsUpdate=true;
  }
}
