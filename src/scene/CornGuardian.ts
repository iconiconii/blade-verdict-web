import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CombatState } from '../domain/combat';

const smooth=(t:number)=>THREE.MathUtils.smoothstep(t,0,1);

/** A full-volume mesh actor. No billboard, sprite sheet or raster character. */
export class CornGuardian {
  readonly root=new THREE.Group();
  readonly body=new THREE.Group();
  readonly leftArm=new THREE.Group();
  readonly rightArm=new THREE.Group();
  private crest=new THREE.Group();
  private materials:THREE.MeshStandardMaterial[]=[];
  private leaves:THREE.Mesh[]=[];

  constructor(){
    this.root.name='corn-guardian-3d';this.body.name='cob-body';
    this.root.add(this.body);this.body.position.y=1.12;
    const gold=this.material(0xf5b42d,.38),ochre=this.material(0x9a561c,.65);
    const green=this.material(0x3b702e,.65),lightGreen=this.material(0x78a747,.5),darkGreen=this.material(0x203f29,.8);
    const bronze=this.material(0xbe813c,.35,.62),iron=this.material(0x384641,.42,.65),wood=this.material(0x59311d,.75);
    const cream=this.material(0xfff0b9,.45),ink=this.material(0x211911,.66);
    const shape=[new THREE.Vector2(0,-.65),new THREE.Vector2(.32,-.63),new THREE.Vector2(.48,-.4),new THREE.Vector2(.51,.15),new THREE.Vector2(.47,.6),new THREE.Vector2(.32,.82),new THREE.Vector2(0,.87)];
    this.mesh(new THREE.LatheGeometry(shape,24),ochre,this.body);
    const kernelGeo=new RoundedBoxGeometry(.245,.205,.15,2,.05);
    const kernels=new THREE.InstancedMesh(kernelGeo,gold,12*7);kernels.name='instanced-kernels';kernels.castShadow=true;kernels.receiveShadow=true;
    const dummy=new THREE.Object3D();
    for(let row=0;row<7;row++)for(let col=0;col<12;col++){
      const angle=col/12*Math.PI*2,rad=.44+Math.sin(row/6*Math.PI)*.055;
      dummy.position.set(Math.sin(angle)*rad,-.49+row*.205,Math.cos(angle)*rad);
      dummy.rotation.set(0,angle,0);dummy.scale.setScalar(row===6?.83:1);dummy.updateMatrix();
      kernels.setMatrixAt(row*12+col,dummy.matrix);
      kernels.setColorAt(row*12+col,new THREE.Color().setHSL(.103+((col+row)%3)*.007,.84,.48+((col+row)%2)*.1));
    }
    kernels.instanceMatrix.needsUpdate=true;this.body.add(kernels);

    // Face projects beyond the kernels; brows, eyes and mouth also have depth.
    const face=this.mesh(new RoundedBoxGeometry(.68,.57,.17,3,.11),gold,this.body,[0,.31,.53]);
    face.name='face';
    for(const side of [-1,1]){
      this.mesh(new THREE.SphereGeometry(.115,16,10),cream,this.body,[side*.18,.38,.647],[1,1.1,.5]);
      this.mesh(new THREE.SphereGeometry(.061,12,10),ink,this.body,[side*.172,.36,.704],[.8,1,.5]);
      const brow=this.mesh(new RoundedBoxGeometry(.27,.074,.09,2,.025),darkGreen,this.body,[side*.18,.52,.68]);brow.rotation.z=side*.22;
      const boot=this.mesh(new RoundedBoxGeometry(.38,.29,.54,2,.08),darkGreen,this.root,[side*.28,.18,.11]);boot.name=`boot-${side}`;
      this.mesh(new RoundedBoxGeometry(.3,.09,.36,2,.035),bronze,this.root,[side*.28,.22,.28]);
    }
    this.mesh(new THREE.SphereGeometry(.12,16,12),ink,this.body,[0,.145,.631],[1.55,.68,.45]);
    this.mesh(new RoundedBoxGeometry(.19,.054,.04,2,.015),cream,this.body,[0,.176,.687]);

    // Curved, thick extruded husks wrap around the lower body, plus leaf crown.
    const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.bezierCurveTo(-.34,.12,-.3,.52,0,.96);leafShape.bezierCurveTo(.3,.52,.34,.12,0,0);
    const leafGeometry=new THREE.ExtrudeGeometry(leafShape,{depth:.055,bevelEnabled:true,bevelSize:.026,bevelThickness:.02,bevelSegments:2,steps:1,curveSegments:6});
    for(let i=0;i<9;i++){
      const angle=i/9*Math.PI*2;
      const leaf=this.mesh(leafGeometry,i%2?green:darkGreen,this.body,[Math.sin(angle)*.38,-.64,Math.cos(angle)*.38]);
      leaf.rotation.set(-.3,angle,0);leaf.scale.set(.85,.78,1);this.leaves.push(leaf);
    }
    this.crest.position.y=.76;this.body.add(this.crest);
    for(let i=0;i<5;i++){
      const angle=(i-2)*.58;
      const leaf=this.mesh(leafGeometry,i%2?green:lightGreen,this.crest,[Math.sin(angle)*.15,0,-.08]);
      leaf.rotation.set(-.34,angle,(i-2)*.25);leaf.scale.set(.46,.57+(i%2)*.12,.8);
    }
    const belt=this.mesh(new THREE.TorusGeometry(.49,.05,6,24),wood,this.body,[0,-.35,0]);belt.rotation.x=Math.PI/2;
    const buckle=this.mesh(new THREE.OctahedronGeometry(.14),bronze,this.body,[0,-.35,.61]);buckle.scale.z=.4;

    this.makeArm(this.leftArm,-1,green,gold);this.makeArm(this.rightArm,1,green,gold);
    const weapon=new THREE.Group();weapon.name='spatula';weapon.position.set(-.08,-.48,.08);this.leftArm.add(weapon);
    this.mesh(new THREE.CylinderGeometry(.054,.063,1.05,10),wood,weapon,[0,.25,0]);
    this.mesh(new RoundedBoxGeometry(.42,.5,.1,2,.045),iron,weapon,[0,.98,0]);
    for(let i=-1;i<=1;i++)this.mesh(new RoundedBoxGeometry(.038,.25,.02,1,.015),bronze,weapon,[i*.1,1.02,.06]);
    this.mesh(new THREE.TorusGeometry(.058,.018,6,12),bronze,weapon,[0,-.2,0]).rotation.x=Math.PI/2;
    const shield=new THREE.Group();shield.name='shield';shield.position.set(.1,-.39,.24);shield.rotation.y=-.22;this.rightArm.add(shield);
    const disc=this.mesh(new THREE.CylinderGeometry(.43,.43,.14,24),wood,shield);disc.rotation.x=Math.PI/2;
    this.mesh(new THREE.TorusGeometry(.42,.045,8,32),bronze,shield,[0,0,.08]);
    const hub=this.mesh(new THREE.SphereGeometry(.145,16,10),bronze,shield,[0,0,.11]);hub.scale.z=.5;
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;this.mesh(new THREE.SphereGeometry(.029,6,4),bronze,shield,[Math.sin(a)*.34,Math.cos(a)*.34,.09]);}
  }
  private material(color:number,roughness:number,metalness=0){const mat=new THREE.MeshStandardMaterial({color,roughness,metalness});this.materials.push(mat);return mat}
  private mesh(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,position=[0,0,0],scale=[1,1,1]){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position[0],position[1],position[2]);mesh.scale.set(scale[0],scale[1],scale[2]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  private makeArm(arm:THREE.Group,side:number,sleeve:THREE.Material,hand:THREE.Material){
    arm.name=side<0?'left-arm':'right-arm';arm.position.set(side*.54,1.37,0);this.root.add(arm);
    this.mesh(new THREE.CapsuleGeometry(.14,.29,3,10),sleeve,arm,[side*.08,-.19,0]);
    this.mesh(new THREE.SphereGeometry(.155,12,8),hand,arm,[side*.1,-.47,.05]);
  }
  update(state:CombatState,reducedMotion=false){
    const {phase,elapsed,feedback}=state;
    const impact=phase==='impact'||phase==='stagger';
    const success=impact&&feedback!==null&&feedback.kind!=='Miss';
    const hitStop=feedback?.kind==='Perfect'&&phase==='impact'&&elapsed<100;
    const t=(state.time-(hitStop?elapsed:0))/1000;
    const charge=phase==='telegraph'?smooth(elapsed/400):phase==='targetActive'?1-smooth(elapsed/380):0;
    const age=phase==='stagger'&&feedback?.kind!=='Verdict'?elapsed+280:elapsed;
    const recoil=success?Math.sin(Math.min(age/580,1)*Math.PI):0;
    const down=state.battle.bossHp<=0?(phase==='settle'?1:smooth(age/650)):0;
    const verdict=phase==='verdictReady'||phase==='verdictSlash';
    const sway=reducedMotion||verdict?0:Math.sin(t*1.7)*.025;
    this.root.position.set(0,down*.03,-recoil*.18);
    this.root.rotation.set(-charge*.07+recoil*.16,verdict?0:-.2+sway,down*1.2);
    this.body.position.y=1.12+(reducedMotion||verdict?0:Math.sin(t*2.2)*.014);
    this.body.scale.set(1-charge*.025,1+charge*.035,1);
    this.leftArm.rotation.set(-charge*.9+recoil*.4,0,-.22-charge*.22-down*.5);
    this.rightArm.rotation.set(-charge*.36,0,.2+recoil*.28+down*.4);
    this.crest.rotation.x=reducedMotion||verdict?0:Math.sin(t*2.2)*.04+recoil*.25;
    const flash=success&&phase==='impact'?Math.max(0,.75-elapsed/190):0;
    for(const material of this.materials){material.emissive.setHex(0xffffff);material.emissiveIntensity=flash;}
  }
}
