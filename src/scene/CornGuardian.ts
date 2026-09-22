import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CombatState } from '../domain/combat';
import { deathFallDurationMs } from '../domain/combat';
import type { BodyAnchorId } from '../domain/v2';
import { verdictMotion } from './verdictMotion';
import { createGuardianRig, guardianPoseFor, type GuardianRig } from './GuardianRig';

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
  readonly rig:GuardianRig;
  private actor=new THREE.Group();
  private head=new THREE.Group();
  private leftLeg=new THREE.Group();
  private rightLeg=new THREE.Group();
  private armSegments:THREE.Group[][]=[];
  private legSegments:THREE.Group[][]=[];
  private crest=new THREE.Group();
  private materials:THREE.MeshStandardMaterial[]=[];
  private leafGeometry:THREE.ExtrudeGeometry;
  private eyes:THREE.Group[]=[];
  private brows:THREE.Mesh[]=[];
  private mouth=new THREE.Group();
  private painMouth:THREE.Mesh;

  constructor(){
    this.rig=createGuardianRig('corn-guardian-rig');
    this.root.name='corn-guardian-3d';
    this.body.name='corn-torso';this.head.name='corn-head';
    this.leftLeg.name='left-knee';this.rightLeg.name='right-knee';
    this.root.add(this.body,this.head,this.leftArm,this.rightArm,this.leftLeg,this.rightLeg);

    const kernel=this.material(0xf1ad2f,.34),kernelLight=this.material(0xffd769,.3),
      husk=this.material(0x6e963d,.66),huskDark=this.material(0x294b2a,.84),
      huskLight=this.material(0xa7c65a,.48),bronze=this.material(0xb77a37,.38,.55),
      boot=this.material(0x3b483b,.72,.25),face=this.material(0xffc94c,.4),
      eye=this.material(0x15262a,.2,.1),cream=this.material(0xfff1b4,.32),
      mouth=this.material(0x241913,.8),anchorTrim=this.material(0xf4ca68,.28,.45);

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
      const eyeGroup=new THREE.Group();eyeGroup.name=side<0?'corn-eye-left':'corn-eye-right';
      eyeGroup.position.set(side*.16,.07,.39);this.head.add(eyeGroup);this.eyes.push(eyeGroup);
      this.mesh(new THREE.SphereGeometry(.105,14,9),cream,eyeGroup,[0,0,0],[1,1.12,.38]);
      this.mesh(new THREE.SphereGeometry(.052,12,8),eye,eyeGroup,[0,-.015,.04],[.8,1,.35]);
      const brow=this.mesh(new RoundedBoxGeometry(.22,.055,.07,2,.02),huskDark,this.head,[side*.16,.2,.42]);brow.rotation.z=side*.2;this.brows.push(brow);
    }
    this.mouth.name='corn-mouth';this.head.add(this.mouth);
    const mouthMesh=this.mesh(new THREE.TorusGeometry(.12,.035,8,14,Math.PI*1.2),mouth,this.mouth,[0,-.18,.4],[1,.72,.45]);mouthMesh.rotation.x=Math.PI;
    this.mesh(new RoundedBoxGeometry(.15,.035,.025,2,.01),cream,this.mouth,[0,-.18,.43]);
    this.painMouth=this.mesh(new THREE.SphereGeometry(1,16,10),mouth,this.head,[0,-.18,.43],[.12,.075,.025]);
    this.painMouth.name='corn-pain-mouth';this.painMouth.visible=false;

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

    // Anatomical trim makes each possible target legible before the parry ring
    // arrives. These read as clasps, pads and a forehead crest, not UI markers.
    this.mesh(new THREE.TorusGeometry(.13,.016,7,24),anchorTrim,this.head,[0,.24,.48],[1,1,.38]);
    this.mesh(new THREE.CircleGeometry(.13,16),anchorTrim,this.body,[0,-.02,.47],[1,1,.2]);
    for(const arm of [this.leftArm,this.rightArm]){
      this.mesh(new THREE.TorusGeometry(.16,.018,7,24),anchorTrim,arm,[0,-.46,.23],[1,.82,.42]);
    }
    for(const leg of [this.leftLeg,this.rightLeg]){
      this.mesh(new THREE.TorusGeometry(.18,.018,7,24),anchorTrim,leg,[0,-.08,.31],[1,.8,.36]);
    }

    this.addAnchor('head',this.head,[0,.24,.47]);
    this.addAnchor('belly',this.body,[0,-.02,.46]);
    this.addAnchor('leftShoulder',this.leftArm,[0,.02,.2]);
    this.addAnchor('rightShoulder',this.rightArm,[0,.02,.2]);
    this.addAnchor('leftHand',this.leftArm,[0,-.39,.27]);
    this.addAnchor('rightHand',this.rightArm,[0,-.39,.27]);
    this.addAnchor('leftKnee',this.leftLeg,[0,-.08,.3]);
    this.addAnchor('rightKnee',this.rightLeg,[0,-.08,.3]);
    this.actor.name='corn-reaction-rig';this.actor.add(...this.root.children);this.root.add(this.actor);
    this.rig.root=this.root;this.rig.poseRoot=this.actor;this.rig.visualRoot=this.actor;this.rig.anchors=this.anchors;
    this.root.add(this.rig.hitProxy);
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
    const upper=new THREE.Group(),forearm=new THREE.Group(),hand=new THREE.Group();
    upper.name='corn-upper-arm';forearm.name='corn-forearm';hand.name='corn-hand';arm.add(upper,forearm,hand);this.armSegments.push([upper,forearm,hand]);
    this.mesh(new THREE.CapsuleGeometry(.15,.38,4,10),sleeve,upper,[0,-.17,0],[1,1,.85]);
    this.mesh(new THREE.SphereGeometry(.2,14,10),palm,hand,[0,-.48,.12],[1,.88,.8]);
    for(let i=-1;i<=1;i++){const finger=this.mesh(new THREE.CapsuleGeometry(.045,.2,3,8),palm,hand,[i*.075,-.65,.19],[1,1,.65]);finger.rotation.x=-.3;}
  }
  private makeLeg(leg:THREE.Group,side:number,boot:THREE.Material,knee:THREE.Material){
    leg.position.set(side*.3,.38,.01);
    const thigh=new THREE.Group(),shin=new THREE.Group(),foot=new THREE.Group();
    thigh.name='corn-thigh';shin.name='corn-shin';foot.name='corn-foot';leg.add(thigh,shin,foot);this.legSegments.push([thigh,shin,foot]);
    this.mesh(new THREE.CapsuleGeometry(.18,.4,4,10),knee,thigh,[0,.02,0],[1,1,.9]);
    const pad=this.mesh(new THREE.SphereGeometry(.19,12,8),this.material(0x58713c,.55),shin,[0,-.18,.25],[1,.72,.38]);pad.name='knee-pad';
    this.mesh(new RoundedBoxGeometry(.42,.28,.56,3,.08),boot,shin,[0,-.48,.02]);
    this.mesh(new RoundedBoxGeometry(.46,.12,.72,3,.045),this.material(0x596451,.65,.2),foot,[0,-.61,.16]);
  }
  private addAnchor(id:BodyAnchorId,parent:THREE.Object3D,position:[number,number,number]){
    const anchor=new THREE.Object3D();anchor.name=`parry-anchor-${id}`;anchor.position.set(...position);parent.add(anchor);this.anchors[id]=anchor;this.rig.fxSockets[id]=anchor;
  }
  getAnchor(id:BodyAnchorId){return this.anchors[id]??this.body}

  update(state:CombatState,reducedMotion=false){
    const {phase,elapsed,feedback}=state;
    const pain=verdictMotion(state,reducedMotion),w=pain.weight;
    this.rig.root.userData.guardianPose=guardianPoseFor(state,pain.x,pain.y,pain.compression);
    const age=feedback?state.time-feedback.time:Infinity;
    const success=(feedback?.kind==='Nice'||feedback?.kind==='Perfect')&&age<680;
    const perfect=success&&feedback?.kind==='Perfect';
    const t=state.time/1000;
    const charge=phase==='telegraph'?smooth(elapsed/state.tempo.telegraphMs):phase==='targetActive'?1-smooth(elapsed/380):0;
    const recoil=success?Math.sin(Math.min(age/(perfect?680:460),1)*Math.PI)*(reducedMotion?.15:1):0;
    const tremor=perfect&&!reducedMotion?Math.sin(t*68)*.035*Math.max(0,1-age/680):0;
    const defeated=state.battle.bossHp<=0;
    // Keep the death pose on one continuous event timeline through settle;
    // switching phases must not snap the actor from half-fallen to flat.
    const down=defeated?smooth(age/deathFallDurationMs):0;
    const slump=w+(defeated?1-down:0),motion=reducedMotion?0:1;
    const sway=Math.sin(t*1.7)*.025*motion*(1-w);
    // Placement root stays still: only this child rig recoils, so the cut volume never shrinks.
    const deathFall=defeated?down:0;
    // A readable forward collapse: knees give way first, hands reach down,
    // then the cob rolls over the front edge instead of simply shrinking.
    this.actor.position.set(tremor+pain.x*.025,-slump*.045+deathFall*.08,-recoil*(perfect?.34:.12)+deathFall*.2);
    this.actor.rotation.set(-charge*.06+recoil*(perfect?.28:.09)-slump*.04+pain.energy*.13-pain.y*.05+deathFall*.82,
      (-.16+sway+tremor*.8)*(1-w)+pain.x*.09,deathFall*.16-pain.x*.065);
    this.body.position.y=1.02+Math.sin(t*2.1)*.012*motion*(1-w)+pain.breath*.008;
    this.body.rotation.set(-slump*.055+pain.energy*.06,0,-pain.x*.035);
    this.body.scale.set(1-charge*.025+pain.compression*.022,1+charge*.03-pain.compression*.035,1);
    this.head.position.y=1.98-slump*.035+Math.sin(t*2.1+.4)*.012*motion*(1-w)+pain.breath*.012-deathFall*.18;
    this.head.rotation.set(slump*.13+pain.energy*.12-pain.followY*.08+deathFall*.42,0,recoil*.05-pain.followX*.12);
    this.leftArm.rotation.set(-charge*.5+recoil*(perfect?.35:.22)-slump*.2+pain.followY*.14+deathFall*.72,0,-.12-charge*.12-down*.25-slump*.13-pain.followX*.18-deathFall*.18);
    this.rightArm.rotation.set(-charge*.42-slump*.1-pain.followY*.1+deathFall*.66,0,.12+recoil*(perfect?.3:.18)+down*.24+slump*.1-pain.followX*.18+deathFall*.18);
    this.leftLeg.rotation.set(slump*.12-deathFall*.95,0,sideLean(-1,charge,recoil)-slump*.055+pain.x*.025);
    this.rightLeg.rotation.set(slump*.08-deathFall*1.08,0,sideLean(1,charge,recoil)+slump*.04+pain.x*.025);
    this.armSegments.forEach((segments,index)=>{
      const side=index===0?-1:1;
      segments[0].rotation.x=-charge*.18+deathFall*.25+pain.followY*.08;
      segments[1].rotation.x=deathFall*(.3+index*.08)+pain.followX*.06;
      segments[2].rotation.x=deathFall*.45+pain.followY*.05;
      segments[2].rotation.z=side*deathFall*.16;
    });
    this.legSegments.forEach((segments,index)=>{
      segments[0].rotation.x=-deathFall*(.18+index*.04);
      segments[1].rotation.x=-deathFall*(.55+index*.08);
      segments[2].rotation.x=-deathFall*.3;
    });
    this.crest.rotation.set(Math.sin(t*2.2)*.04*motion*(1-w)+recoil*.18+slump*.12+pain.followY*.2+deathFall*.25,0,-pain.followX*.2);
    const expression=defeated?1:pain.pain;
    this.eyes.forEach((eye,i)=>{eye.scale.y=1-expression*.7;eye.rotation.z=(i===0?-1:1)*expression*.18});
    this.brows.forEach((brow,i)=>{brow.rotation.z=(i===0?-1:1)*(.2-expression*.52)});
    this.mouth.visible=!defeated&&pain.pain<.1;this.painMouth.visible=!defeated&&pain.pain>=.1;
    this.painMouth.scale.set(.12,.045+.055*pain.pain,.025);
    const flash=Math.max(pain.flash,success?Math.max(0,(perfect?.95:.35)-age/220)*(reducedMotion?.3:1):0);
    for(const material of this.materials){material.emissive.setHex(0xffffff);material.emissiveIntensity=flash;}
  }
}

function sideLean(side:number,charge:number,recoil:number){return side*(charge*.08-recoil*.04)}
