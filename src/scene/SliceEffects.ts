import * as THREE from 'three';
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
  constructor(private scene:THREE.Scene,kind:BossKind){
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
      const bladeMat=flat(0xffe6a1),face=flat(kind==='corn'?0xffecab:0xd8bcff),edge=flat(kind==='corn'?0xdf911e:0x8657c8);
      const kernels=flat(kind==='corn'?0xe8ab23:0x9d7aea),dustMat=flat(kind==='corn'?0xffbf42:0xb894ff);
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
          this.dummy.rotation.set(0,0,a);this.dummy.scale.set(kind==='corn'?1.2:.6,1,.45);this.dummy.updateMatrix();detail.setMatrixAt(i,this.dummy.matrix);
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
      if(event.kind==='Miss')continue;
      const slot=this.pool[this.cursor++%this.pool.length],p=position(event);
      const path=event.path&&event.path.length>1?event.path:null;
      const end=path?.at(-1),start=path?.at(-2);
      slot.event=event;slot.x=end?end.x*width:p.x;slot.y=end?end.y*height:p.y;
      slot.length=start&&end?Math.max(70,Math.min(320,Math.hypot((end.x-start.x)*640,(end.y-start.y)*640))):140;
    }
    for(const slot of this.pool){
      const event=slot.event,age=event?state.time-event.time:Infinity;
      slot.root.visible=age<720;if(!event||age>=720)continue;
      const progress=Math.min(1,age/720),fade=1-progress,cut=event.kind==='Cut',perfect=event.kind==='Perfect';
      const force=reducedMotion?.25:event.finisher?1.8:perfect||cut?1:.6;
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
      slot.trail.visible=age<260;slot.trail.material.opacity=Math.max(0,1-age/260)*(event.finisher?1:.65);
      slot.blade.visible=age<240;
      const tierScale=event.finisher?1.75:event.speed==='ferocious'?1.35:event.speed==='fast'?1.12:.9;
      slot.blade.scale.set(tierScale*slot.length/220,(perfect?1.12:.78)*(1+Math.min(age/240,1)*.2),1);
      slot.blade.material.color.setHex(event.finisher?0xffffff:perfect?0xc3fff2:cut?0xfff1d2:0xffda8d);
      slot.blade.material.opacity=Math.max(0,1-age/(event.finisher?360:240));
      slot.halves.forEach((half,i)=>{
        const side=i===0?-1:1;
        half.visible=cut;
        half.position.set(side*(6+progress*(event.finisher?145:100)*force),15+Math.sin(progress*Math.PI)*44*force-progress*progress*80,0);
        half.rotation.set(progress*1.4,side*progress*1.1,side*progress*.6);
        half.scale.setScalar((.75+Math.sin(progress*Math.PI)*.2)*Math.min(1,fade*4));
      });
      for(const m of slot.materials.slice(1))m.opacity=fade;
      for(let i=0;i<12;i++){
        const a=i*2.39996+event.id*.3,r=(8+progress*(65+(i%3)*28))*force;
        this.dummy.position.set(Math.cos(a)*r,Math.sin(a)*r-progress*progress*80,15);
        this.dummy.rotation.set(0,0,a);this.dummy.scale.set((2+i%3)*fade*(cut?1.5:1),3*fade,1);
        this.dummy.updateMatrix();slot.dust.setMatrixAt(i,this.dummy.matrix);
      }
      slot.dust.instanceMatrix.needsUpdate=true;
    }
  }
}
