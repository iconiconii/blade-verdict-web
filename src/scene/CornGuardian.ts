import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CombatState } from '../domain/combat';
import type { BodyAnchorId } from '../domain/v2';

const smooth=(t:number)=>THREE.MathUtils.smoothstep(t,0,1);

/**
 * Readable, low-poly corn guardian.
 *
 * The actor is deliberately built from separated masses (head, cob, palms,
 * knees and leaves). This gives each parry anchor a real surface to sit on,
 * rather than hiding it inside a noisy kernel sphere or behind a shield.
 */
export class CornGuardian {
  readonly root=new THREE.Group();
  readonly body=new THREE.Group();
  readonly leftArm=new THREE.Group();
  readonly rightArm=new THREE.Group();
  readonly anchors:Partial<Record<BodyAnchorId,THREE.Object3D>>={};
  private head=new THREE.Group();
  private leftLeg=new THREE.Group();
  private rightLeg=new THREE.Group();
  private crest=new THREE.Group();
  private materials:THREE.MeshStandardMaterial[]=[];
  private leafGeometry:THREE.ExtrudeGeometry;

  constructor(){
    this.root.name='corn-guardian-3d';
    this.body.name='corn-torso';this.head.name='corn-head';
    this.leftLeg.name='left-knee';this.rightLeg.name='right-knee';
    this.root.add(this.body,this.head,this.leftArm,this.rightArm,this.leftLeg,this.rightLeg);

    const kernel=this.material(0xf1ad2f,.34),kernelLight=this.material(0xffd769,.3),
      husk=this.material(0x6e963d,.66),huskDark=this.material(0x294b2a,.84),
      huskLight=this.material(0xa7c65a,.48),bronze=this.material(0xb77a37,.38,.55),
      boot=this.material(0x3b483b,.72,.25),face=this.material(0xffc94c,.4),
      eye=this.material(0x15262a,.2,.1),cream=this.material(0xfff1b4,.32),
      mouth=this.material(0x241913,.8);

    this.body.position.set(0,1.02,0);
    this.mesh(new RoundedBoxGeometry(.92,1.2,.66,4,.15),face,this.body,[0,0,0]);
    const kernelGeo=new RoundedBoxGeometry(.19,.16,.13,2,.035);
    for(let row=0;row<5;row++)for(let col=0;col<4;col++){
      const x=(col-1.5)*.215+(row%2)*.035,y=-.42+row*.215;
      this.mesh(kernelGeo,(row+col)%3===0?kernelLight:kernel,this.body,[x,y,.39],[1,1,.9]);
    }
    const belt=this.mesh(new THREE.TorusGeometry(.46,.035,6,24),bronze,this.body,[0,-.39,.02]);belt.rotation.x=Math.PI/2;
    this.mesh(new THREE.OctahedronGeometry(.11),bronze,this.body,[0,-.39,.43],[1,1,.35]);

    this.head.position.set(0,1.98,.02);
    this.mesh(new THREE.CapsuleGeometry(.43,.48,5,14),face,this.head,[0,0,0],[1,.96,.78]);
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      const x=(col-1.5)*.19+(row%2)*.035,y=-.3+row*.2;
      this.mesh(kernelGeo,(row+col)%2?kernel:kernelLight,this.head,[x,y,.35],[.9,.86,.8]);
    }
    for(const side of [-1,1]){
      this.mesh(new THREE.SphereGeometry(.105,14,9),cream,this.head,[side*.16,.07,.39],[1,1.12,.38]);
      this.mesh(new THREE.SphereGeometry(.052,12,8),eye,this.head,[side*.16,.055,.43],[.8,1,.35]);
      const brow=this.mesh(new RoundedBoxGeometry(.22,.055,.07,2,.02),huskDark,this.head,[side*.16,.2,.42]);brow.rotation.z=side*.2;
    }
    const mouthMesh=this.mesh(new THREE.TorusGeometry(.12,.035,8,14,Math.PI*1.2),mouth,this.head,[0,-.18,.4],[1,.72,.45]);mouthMesh.rotation.x=Math.PI;
    this.mesh(new RoundedBoxGeometry(.15,.035,.025,2,.01),cream,this.head,[0,-.18,.43]);

    const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.bezierCurveTo(-.3,.08,-.3,.48,0,.9);leafShape.bezierCurveTo(.3,.48,.3,.08,0,0);
    this.leafGeometry=new THREE.ExtrudeGeometry(leafShape,{depth:.065,bevelEnabled:true,bevelSize:.02,bevelThickness:.015,bevelSegments:2,curveSegments:5});
    this.crest.position.set(0,2.42,-.08);this.root.add(this.crest);
    for(let i=0;i<5;i++)this.addLeaf(this.crest,i%2?huskLight:huskDark,[(i-2)*.14,0,0],[.42,.72+(i%2)*.12,.85],[0,(i-2)*.16,(i-2)*.13]);
    for(const side of [-1,1]){
      this.addLeaf(this.root,side<0?husk:huskLight,[side*.48,1.45,.03],[.62,.8,.78],[.08,side*.32,side*.18]);
      this.addLeaf(this.root,huskDark,[side*.57,1.18,-.08],[.58,.85,.8],[-.08,side*.42,side*.2]);
    }

    this.makeArm(this.leftArm,-1,husk,kernelLight);
    this.makeArm(this.rightArm,1,huskLight,kernel);
    this.makeLeg(this.leftLeg,-1,boot,kernel);
    this.makeLeg(this.rightLeg,1,boot,kernelLight);

    this.addAnchor('head',this.head,[0,.24,.47]);
    this.addAnchor('belly',this.body,[0,-.02,.46]);
    this.addAnchor('leftShoulder',this.leftArm,[0,.02,.2]);
    this.addAnchor('rightShoulder',this.rightArm,[0,.02,.2]);
    this.addAnchor('leftHand',this.leftArm,[0,-.39,.27]);
    this.addAnchor('rightHand',this.rightArm,[0,-.39,.27]);
    this.addAnchor('leftKnee',this.leftLeg,[0,-.08,.3]);
    this.addAnchor('rightKnee',this.rightLeg,[0,-.08,.3]);
  }

  private material(color:number,roughness:number,metalness=0){
    const material=new THREE.MeshStandardMaterial({color,roughness,metalness});this.materials.push(material);return material;
  }
  private mesh(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,position=[0,0,0],scale=[1,1,1]){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position[0],position[1],position[2]);mesh.scale.set(scale[0],scale[1],scale[2]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  private addLeaf(parent:THREE.Object3D,material:THREE.Material,position:[number,number,number],scale:[number,number,number],rotation:[number,number,number]){
    const leaf=this.mesh(this.leafGeometry,material,parent,position,scale);leaf.rotation.set(...rotation);return leaf;
  }
  private makeArm(arm:THREE.Group,side:number,sleeve:THREE.Material,palm:THREE.Material){
    arm.position.set(side*.63,1.48,.02);arm.rotation.z=side*.08;
    this.mesh(new THREE.CapsuleGeometry(.15,.38,4,10),sleeve,arm,[0,-.17,0],[1,1,.85]);
    this.mesh(new THREE.SphereGeometry(.2,14,10),palm,arm,[0,-.48,.12],[1,.88,.8]);
    for(let i=-1;i<=1;i++){const finger=this.mesh(new THREE.CapsuleGeometry(.045,.2,3,8),palm,arm,[i*.075,-.65,.19],[1,1,.65]);finger.rotation.x=-.3;}
  }
  private makeLeg(leg:THREE.Group,side:number,boot:THREE.Material,knee:THREE.Material){
    leg.position.set(side*.3,.38,.01);
    this.mesh(new THREE.CapsuleGeometry(.18,.4,4,10),knee,leg,[0,.02,0],[1,1,.9]);
    const pad=this.mesh(new THREE.SphereGeometry(.19,12,8),this.material(0x58713c,.55),leg,[0,-.18,.25],[1,.72,.38]);pad.name='knee-pad';
    this.mesh(new RoundedBoxGeometry(.42,.28,.56,3,.08),boot,leg,[0,-.48,.02]);
    this.mesh(new RoundedBoxGeometry(.46,.12,.72,3,.045),this.material(0x596451,.65,.2),leg,[0,-.61,.16]);
  }
  private addAnchor(id:BodyAnchorId,parent:THREE.Object3D,position:[number,number,number]){
    const anchor=new THREE.Object3D();anchor.name=`parry-anchor-${id}`;anchor.position.set(...position);parent.add(anchor);this.anchors[id]=anchor;
  }
  getAnchor(id:BodyAnchorId){return this.anchors[id]??this.body}

  update(state:CombatState,reducedMotion=false){
    const {phase,elapsed,feedback}=state,impact=phase==='impact'||phase==='stagger',success=impact&&feedback!==null&&feedback.kind!=='Miss';
    const hitStop=feedback?.kind==='Perfect'&&phase==='impact'&&elapsed<100,t=(state.time-(hitStop?elapsed:0))/1000;
    const charge=phase==='telegraph'?smooth(elapsed/400):phase==='targetActive'?1-smooth(elapsed/380):0;
    const age=phase==='stagger'&&feedback?.kind!=='Verdict'?elapsed+280:elapsed,recoil=success?Math.sin(Math.min(age/580,1)*Math.PI):0;
    const down=state.battle.bossHp<=0?smooth(age/650):0,verdict=phase==='verdictReady'||phase==='verdictSlash';
    const sway=reducedMotion||verdict?0:Math.sin(t*1.7)*.025;
    this.root.position.set(0,down*.03,-recoil*.15);this.root.rotation.set(-charge*.06+recoil*.12,verdict?0:-.16+sway,down*1.1);
    this.body.position.y=1.02+(reducedMotion||verdict?0:Math.sin(t*2.1)*.012);this.body.scale.set(1-charge*.025,1+charge*.03,1);
    this.head.position.y=1.98+(reducedMotion||verdict?0:Math.sin(t*2.1+.4)*.012);this.head.rotation.z=recoil*.05;
    this.leftArm.rotation.set(-charge*.5+recoil*.22,0,-.12-charge*.12-down*.25);this.rightArm.rotation.set(-charge*.42,0,.12+recoil*.18+down*.24);
    this.leftLeg.rotation.z=sideLean(-1,charge,recoil);this.rightLeg.rotation.z=sideLean(1,charge,recoil);
    this.crest.rotation.x=reducedMotion||verdict?0:Math.sin(t*2.2)*.04+recoil*.18;
    const flash=success&&phase==='impact'?Math.max(0,.75-elapsed/190):0;for(const material of this.materials){material.emissive.setHex(0xffffff);material.emissiveIntensity=flash;}
  }
}

function sideLean(side:number,charge:number,recoil:number){return side*(charge*.08-recoil*.04)}
