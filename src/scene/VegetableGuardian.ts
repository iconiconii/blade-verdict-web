import * as THREE from 'three';
import type { CombatState } from '../domain/combat';
import { deathFallDurationMs } from '../domain/combat';
import type { BodyAnchorId } from '../domain/v2';
import { goodParryDurationMs, parryDuration, parryImpulse, parrySquash, perfectParryDurationMs } from './hitMotion';
import { createGuardianRig, guardianPoseFor, type GuardianRig } from './GuardianRig';
import { verdictMotion } from './verdictMotion';

export type VegetableKind = 'carrot' | 'cabbage' | 'tomato';
type XYZ = [number, number, number];
type GuardianMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

interface VegetableStyle {
  body:number;
  bodyDark:number;
  bodyLight:number;
  leaf:number;
  leafLight:number;
  accent:number;
  bodyY:number;
  faceY:number;
  faceZ:number;
  scale:[number, number, number];
  physical?:boolean;
}

const styles:Record<VegetableKind,VegetableStyle> = {
  carrot:{body:0xf07825,bodyDark:0xb9431c,bodyLight:0xffb33a,leaf:0x4e9f42,leafLight:0x8cc84b,accent:0x6b3d1d,bodyY:1.03,faceY:.16,faceZ:.52,scale:[.88,1,.8]},
  cabbage:{body:0x82b85a,bodyDark:0x3e7f42,bodyLight:0xd8ed9c,leaf:0x5a9e5c,leafLight:0xc3e68c,accent:0x744529,bodyY:1.02,faceY:.14,faceZ:.68,scale:[1.02,.9,.92]},
  tomato:{body:0xe34b37,bodyDark:0x982b2e,bodyLight:0xff8060,leaf:0x3d9140,leafLight:0x91ca56,accent:0x5f301e,bodyY:1.03,faceY:.1,faceZ:.73,scale:[1,1,.96],physical:true},
};

const smooth=(value:number)=>THREE.MathUtils.smoothstep(Math.max(0,Math.min(1,value)),0,1);

function profileFor(kind:VegetableKind){
  // A smooth meridian is deliberately sampled densely.  The silhouette then
  // reads as a continuous vegetable instead of a pile of low-poly blocks.
  if(kind==='carrot')return [
    new THREE.Vector2(0,-.92),new THREE.Vector2(.08,-.9),new THREE.Vector2(.19,-.78),
    new THREE.Vector2(.31,-.58),new THREE.Vector2(.43,-.3),new THREE.Vector2(.51,.02),
    new THREE.Vector2(.54,.3),new THREE.Vector2(.51,.55),new THREE.Vector2(.42,.72),
    new THREE.Vector2(.25,.8),new THREE.Vector2(.08,.82),new THREE.Vector2(0,.81),
  ];
  if(kind==='cabbage')return [
    new THREE.Vector2(0,-.68),new THREE.Vector2(.23,-.68),new THREE.Vector2(.45,-.61),
    new THREE.Vector2(.62,-.45),new THREE.Vector2(.72,-.2),new THREE.Vector2(.76,.1),
    new THREE.Vector2(.73,.38),new THREE.Vector2(.63,.61),new THREE.Vector2(.47,.77),
    new THREE.Vector2(.25,.84),new THREE.Vector2(.08,.85),new THREE.Vector2(0,.84),
  ];
  return [
    new THREE.Vector2(0,-.7),new THREE.Vector2(.25,-.7),new THREE.Vector2(.48,-.63),
    new THREE.Vector2(.67,-.45),new THREE.Vector2(.78,-.18),new THREE.Vector2(.81,.12),
    new THREE.Vector2(.78,.39),new THREE.Vector2(.67,.6),new THREE.Vector2(.5,.73),
    new THREE.Vector2(.27,.79),new THREE.Vector2(.11,.78),new THREE.Vector2(0,.74),
  ];
}

function vegetableSurface(kind:VegetableKind){
  const geometry=new THREE.LatheGeometry(profileFor(kind),64);
  if(kind==='tomato'){
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i),y=positions.getY(i);
      const angle=Math.atan2(z,x),heightWeight=1-Math.min(1,Math.abs(y)/.82)*.35;
      const bulge=1+.065*Math.cos(angle*6)*heightWeight;
      positions.setXYZ(i,x*bulge,y,z*bulge);
    }
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

interface LeafSurfaceOptions {
  bend?:number;
  cup?:number;
  ripple?:number;
  tipWidth?:number;
  baseWidth?:number;
  rows?:number;
  columns?:number;
}

/** A small, curved parameter surface for leaves (not a flat billboard). */
function leafSurfaceGeometry(width:number,height:number,options:LeafSurfaceOptions={}):THREE.BufferGeometry{
  const bend=options.bend??0,cup=options.cup??.08,ripple=options.ripple??.025;
  const tipWidth=options.tipWidth??0,baseWidth=options.baseWidth??0;
  const rows=options.rows??18,columns=options.columns??6;
  const positions:number[]=[],colors:number[]=[],uvs:number[]=[],indices:number[]=[];
  // Vertex colors are intentionally near-white tints so they add a soft
  // growth gradient without multiplying the material into muddy black.
  const low=new THREE.Color(.72,.88,.68),high=new THREE.Color(1,1,.9),color=new THREE.Color();
  for(let row=0;row<=rows;row++){
    const u=row/rows;
    const edge=Math.sin(Math.PI*u)**.52;
    const edgeBlend=u>.72?THREE.MathUtils.lerp(edge,tipWidth,(u-.72)/.28):edge;
    const halfWidth=width*.5*(baseWidth+(1-baseWidth)*edgeBlend);
    const centerX=bend*u*u;
    for(let column=0;column<=columns;column++){
      const v=column/columns,across=v*2-1;
      const x=centerX+across*halfWidth;
      const z=cup*(1-across*across)*Math.sin(Math.PI*u)+ripple*Math.sin(u*Math.PI*3+across*1.8)*(1-u);
      positions.push(x,height*u,z);uvs.push(v,u);
      color.copy(low).lerp(high,.18+.82*u).multiplyScalar(1-.12*Math.abs(across));
      colors.push(color.r,color.g,color.b);
    }
  }
  const stride=columns+1;
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const a=row*stride+column,b=a+1,c=a+stride,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

function vineGeometry(points:XYZ[],radius:number){
  const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
  const geometry=new THREE.TubeGeometry(curve,24,radius,8,false);
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Three smooth vegetable guardians share the combat rig but keep distinct
 * silhouettes: a tapered carrot with a leafy crown, a layered cabbage head,
 * and a glossy lobed tomato with a calyx. None of the main bodies use block
 * primitives, so the identity reads even without the HUD label.
 */
export class VegetableGuardian {
  readonly root=new THREE.Group();
  readonly anchors:Partial<Record<BodyAnchorId,THREE.Object3D>>={};
  readonly rig:GuardianRig;
  readonly kind:VegetableKind;

  private actor=new THREE.Group();
  private body=new THREE.Group();
  private face=new THREE.Group();
  private crown=new THREE.Group();
  private leftArm=new THREE.Group();
  private rightArm=new THREE.Group();
  private leftLeg=new THREE.Group();
  private rightLeg=new THREE.Group();
  private arms:THREE.Group[][]=[];
  private legs:THREE.Group[][]=[];
  private materials:GuardianMaterial[]=[];
  private eyes:THREE.Group[]=[];
  private brows:THREE.Mesh[]=[];
  private mouth!:THREE.Group;
  private painMouth!:THREE.Mesh;
  private leafGeo:THREE.BufferGeometry;
  private restPose=new Map<THREE.Object3D,{position:THREE.Vector3;rotation:THREE.Euler;scale:THREE.Vector3}>();

  constructor(kind:VegetableKind){
    this.kind=kind;
    const style=styles[kind];
    this.rig=createGuardianRig(`${kind}-guardian-rig`);
    this.root.name=`${kind}-guardian-3d`;
    this.actor.name=`${kind}-reaction-rig`;
    this.body.name=`${kind}-body`;
    this.face.name=`${kind}-face`;
    this.crown.name=`${kind}-crown`;
    this.leftArm.name=`${kind}-left-arm`;this.rightArm.name=`${kind}-right-arm`;
    this.leftLeg.name=`${kind}-left-leg`;this.rightLeg.name=`${kind}-right-leg`;
    this.root.add(this.actor,this.rig.hitProxy);
    this.actor.add(this.body,this.crown,this.leftArm,this.rightArm,this.leftLeg,this.rightLeg);
    this.body.position.y=style.bodyY;
    this.crown.position.set(0,style.bodyY+.63,.02);

    const bodyMaterial=this.material(style.body,.34,0,style.physical);
    const darkMaterial=this.material(style.bodyDark,.52);
    const lightMaterial=this.material(style.bodyLight,.3,0,style.physical);
    const leafMaterial=this.material(style.leaf,.56,0,false,true);
    const leafLight=this.material(style.leafLight,.4,0,false,true);
    const accent=this.material(style.accent,.62);
    const eyeWhite=this.material(0xfff7d8,.24);
    const eyeDark=this.material(0x18231a,.28);
    const mouthMaterial=this.material(0x29130f,.72);
    const tongue=this.material(0xef6350,.42);

    this.mesh(vegetableSurface(kind),bodyMaterial,this.body,`${kind}-surface`,[0,0,0],style.scale);
    this.leafGeo=leafSurfaceGeometry(.42,1.1,{bend:.05,cup:.1,ripple:.025});
    if(kind==='carrot')this.buildCarrotCrown(leafMaterial,leafLight);
    if(kind==='cabbage')this.buildCabbageLeaves(leafMaterial,leafLight,lightMaterial);
    if(kind==='tomato')this.buildTomatoCalyx(leafMaterial,leafLight);
    this.buildFace(eyeWhite,eyeDark,mouthMaterial,tongue,style);
    this.buildLimbs(kind==='cabbage'?leafMaterial:darkMaterial,bodyMaterial,accent);
    if(kind==='carrot')this.buildFork(accent,lightMaterial);
    if(kind==='cabbage')this.buildRollingPin(accent,lightMaterial);
    if(kind==='tomato')this.buildVineWhip(leafMaterial);

    this.addAnchor('head',kind==='carrot'?this.crown:this.body,kind==='carrot'?[0,.35,.2]:[0,.55,.48]);
    this.addAnchor('belly',this.body,[0,kind==='carrot'?.05:.02,.56]);
    this.addAnchor('leftShoulder',this.leftArm,[0,.02,.16]);
    this.addAnchor('rightShoulder',this.rightArm,[0,.02,.16]);
    this.addAnchor('leftHand',this.leftArm.getObjectByName(`${kind}-left-hand`)??this.leftArm,[0,.02,.24]);
    this.addAnchor('rightHand',this.rightArm.getObjectByName(`${kind}-right-hand`)??this.rightArm,[0,.02,.24]);
    this.addAnchor('leftKnee',this.leftLeg,[0,0,.2]);
    this.addAnchor('rightKnee',this.rightLeg,[0,0,.2]);
    this.rig.root=this.root;this.rig.poseRoot=this.actor;this.rig.visualRoot=this.actor;this.rig.anchors=this.anchors;
    this.captureRestPose();
  }

  private material(color:number,roughness:number,metalness=0,physical=false,vertexColors=false){
    const material=physical
      ?new THREE.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.65,clearcoatRoughness:.16})
      :new THREE.MeshStandardMaterial({color,roughness,metalness});
    material.vertexColors=vertexColors;
    if(vertexColors)material.side=THREE.DoubleSide;
    this.materials.push(material);return material;
  }

  private mesh(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,name:string,position:XYZ=[0,0,0],scale:XYZ=[1,1,1]){
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }

  private buildCarrotCrown(leaf:THREE.Material,light:THREE.Material){
    // A fan of feathery fronds makes the carrot read as a root vegetable,
    // rather than a generic green spike.  Each frond has a stem and paired
    // pinnae with a real cup/bend surface.
    this.crown.position.set(0,1.55,.02);
    for(let i=0;i<5;i++){
      const spread=(i-2)*.16,lean=spread*.52;
      const stalk=this.mesh(vineGeometry([[0,0,0],[spread*.22,.16,.02],[spread,.34,.01]],.018),leaf,this.crown,`carrot-leaf-stalk-${i}`);
      stalk.rotation.z=-spread*.08;
      const blade=this.mesh(leafSurfaceGeometry(.18,.72,{bend:lean,cup:.075,ripple:.028,tipWidth:.05,rows:20}),i%2?light:leaf,this.crown,`carrot-leaf-blade-${i}`,[spread,.27,.02]);
      blade.rotation.set((i-2)*.075,spread*.08,(i-2)*.12);
      for(let pair=0;pair<4;pair++){
        const u=.26+pair*.14,y=.27+u*.53,x=spread+lean*u*u;
        for(const side of [-1,1]){
          const pinna=this.mesh(leafSurfaceGeometry(.065,.16,{bend:side*.018,cup:.03,ripple:.01,tipWidth:.02,rows:8,columns:4}),pair%2?leaf:light,this.crown,`carrot-crown-pinna-${i}-${pair}-${side}`,[x+side*.055,y,.04]);
          pinna.rotation.set(0,0,side*(.78+u*.25));
        }
      }
    }
    this.mesh(new THREE.TorusGeometry(.16,.022,10,28),light,this.crown,'carrot-crown-collar',[0,.015,.02],[1,1,.7]);
    // Fine root grooves and root hairs continue the surface detail down the
    // tapered body.  They sit just above the orange skin instead of being
    // chunky geometry strips.
    const rootRidges=this.material(0xd9571d,.46);
    for(let i=0;i<7;i++){
      const y=-.68+i*.18,radius=.27+Math.min(1,(y+.68)/1.48)*.24;
      const ridge=this.mesh(new THREE.TorusGeometry(radius,.011,6,48),rootRidges,this.body,`carrot-root-groove-${i}`,[0,y,.015],[1,1,.76]);
      ridge.rotation.x=Math.PI/2;
    }
    for(let i=0;i<6;i++){
      const side=i%2?1:-1,y=-.73+Math.floor(i/2)*.18,x=side*(.23+(i%3)*.06);
      this.mesh(vineGeometry([[x,y,.18],[x+side*.03,y-.06,.32],[x+side*.08,y-.15,.27]],.008),rootRidges,this.body,`carrot-root-hair-${i}`);
    }
  }

  private buildCabbageLeaves(leaf:THREE.Material,light:THREE.Material,center:THREE.Material){
    // The pale stalk is intentionally visible between the face and the
    // leaves.  Broad, round-ended leaves wrap around it in two layers.
    const stalkProfile=[new THREE.Vector2(.09,-.58),new THREE.Vector2(.13,-.42),new THREE.Vector2(.18,-.12),new THREE.Vector2(.21,.3),new THREE.Vector2(.16,.62),new THREE.Vector2(.08,.76)];
    const stalk=this.mesh(new THREE.LatheGeometry(stalkProfile,32),center,this.body,'cabbage-leaf-stalk',[0,-.04,.28],[1,1,.58]);
    stalk.rotation.z=.035;
    const veinMaterial=this.material(0xeaf3b4,.38);
    const leaves:Array<{angle:number;radius:number;z:number;width:number;height:number;bend:number;material:THREE.Material}> = [];
    for(let i=0;i<10;i++){
      const angle=i/10*Math.PI*2+.12;
      leaves.push({angle,radius:.56,z:.02,width:.82,height:1.5,bend:(i%2?-1:1)*.16,material:i%3===0?light:leaf});
    }
    for(let i=0;i<7;i++){
      const angle=i/7*Math.PI*2+.38;
      leaves.push({angle,radius:.4,z:.23,width:.72,height:1.34,bend:(i%2?-1:1)*.11,material:i%2?leaf:light});
    }
    leaves.forEach((entry,index)=>{
      const {angle,radius,z,width,height,bend,material}=entry;
      const frontOffset=Math.cos(angle)>.12?-.2:0;
      const surfaceZ=Math.cos(angle)*radius+z+frontOffset;
      const leafMaterial=Math.cos(angle)>.12?(index%2?center:light):material;
      const shell=this.mesh(leafSurfaceGeometry(width,height,{bend,cup:.16,ripple:.05,tipWidth:.48,baseWidth:.1,rows:22,columns:8}),leafMaterial,this.body,`cabbage-leaf-${index}`,
        [Math.sin(angle)*radius,-.34+index%3*.035,surfaceZ]);
      shell.rotation.set(.18+Math.sin(angle)*.08,angle,Math.cos(angle)*.12);
      // Veins are curved tubes following the leaf surface, not straight
      // decals; front veins remain clear of the face.
      if(Math.cos(angle)>.12){
        const vx=Math.sin(angle)*radius, vz=surfaceZ+.16;
        this.mesh(vineGeometry([[vx,-.28,vz],[vx+Math.sin(angle)*.05,.22,vz+.04],[vx+Math.sin(angle)*.1,.67,vz-.02]],.012),veinMaterial,this.body,`cabbage-vein-${index}`);
        this.mesh(vineGeometry([[vx,-.06,vz],[vx+Math.sin(angle)*.18,.2,vz+.02],[vx+Math.sin(angle)*.23,.4,vz-.01]],.006),veinMaterial,this.body,`cabbage-vein-branch-${index}`);
      }
    });
  }

  private buildTomatoCalyx(leaf:THREE.Material,light:THREE.Material){
    this.crown.position.set(0,1.75,.02);
    const stemMaterial=this.material(0x4a6b28,.48);
    this.mesh(vineGeometry([[0,-.1,0],[.03,.12,.02],[-.04,.36,.01],[.04,.58,.04]],.034),stemMaterial,this.crown,'tomato-curved-stem');
    this.mesh(new THREE.SphereGeometry(.07,18,12),light,this.crown,'tomato-stem-bud',[.04,.56,.04]);
    const dimple=this.material(0x9e2e2d,.5);
    this.mesh(new THREE.TorusGeometry(.22,.045,10,36),light,this.crown,'tomato-top-rim',[0,-.05,.01],[1,1,.9]);
    this.mesh(new THREE.SphereGeometry(.17,24,14),dimple,this.crown,'tomato-top-dimple',[0,-.073,.01],[1,.16,1]);
    // Horizontal, star-like sepals curl away from the depression.  Rotating
    // a curved surface keeps their thickness and catches the light naturally.
    for(let i=0;i<7;i++){
      const angle=i/7*Math.PI*2+.12;
      const blade=this.mesh(leafSurfaceGeometry(.2,.52,{bend:.12,cup:.06,ripple:.018,tipWidth:.02,baseWidth:.1,rows:16,columns:5}),i%2?leaf:light,this.crown,`tomato-calyx-${i}`,[Math.sin(angle)*.07,.0,Math.cos(angle)*.07]);
      blade.rotation.set(Math.PI/2-.12,angle,Math.sin(angle)*.08);
    }
  }

  private buildFace(white:THREE.Material,dark:THREE.Material,mouth:THREE.Material,tongue:THREE.Material,style:VegetableStyle){
    this.face.position.set(0,style.faceY,style.faceZ);this.body.add(this.face);
    for(const side of [-1,1]){
      const eye=new THREE.Group();eye.name=`${this.kind}-eye-${side<0?'left':'right'}`;eye.position.set(side*.19,.08,.05);this.face.add(eye);
      this.mesh(new THREE.SphereGeometry(1,24,16),white,eye,`${this.kind}-eye-white`,[0,0,0],[.15,.21,.05]);
      this.mesh(new THREE.SphereGeometry(1,16,12),dark,eye,`${this.kind}-pupil`,[0,-.02,.05],[.064,.1,.03]);
      this.eyes.push(eye);
      const brow=this.mesh(new THREE.CapsuleGeometry(.034,.22,5,12),dark,this.face,`${this.kind}-brow`,[side*.19,.31,.08],[1,1,.72]);
      // Nearly horizontal brows slope down toward the nose: an angry
      // expression that remains readable during a hit reaction.
      brow.rotation.z=side<0?-.3:.3;brow.rotation.y=side*.04;this.brows.push(brow);
    }
    this.mouth=new THREE.Group();this.mouth.name=`${this.kind}-mouth`;this.face.add(this.mouth);
    this.mesh(new THREE.SphereGeometry(1,20,14),mouth,this.mouth,`${this.kind}-mouth-cavity`,[0,-.21,.07],[.17,.12,.045]);
    this.mesh(new THREE.SphereGeometry(1,16,10),tongue,this.mouth,`${this.kind}-tongue`,[0,-.26,.1],[.09,.035,.02]);
    for(const side of [-1,1]){
      const fang=this.mesh(new THREE.ConeGeometry(.034,.13,12),white,this.mouth,`${this.kind}-fang-${side<0?'left':'right'}`,[side*.085,-.18,.11],[1,1,.8]);
      fang.rotation.z=Math.PI;
    }
    this.painMouth=this.mesh(new THREE.TorusGeometry(1,.12,8,24),mouth,this.face,`${this.kind}-pain-mouth`,[0,-.21,.078],[.13,.09,.03]);
    this.painMouth.visible=false;
  }

  private buildLimbs(sleeve:THREE.Material,bodyMaterial:THREE.Material,accent:THREE.Material){
    for(const [index,arm] of [this.leftArm,this.rightArm].entries()){
      const side=index===0?-1:1;arm.position.set(side*.6,1.22,.03);arm.rotation.z=side*.08;
      const upper=new THREE.Group(),forearm=new THREE.Group(),hand=new THREE.Group();
      upper.name=`${this.kind}-upper-arm`;forearm.name=`${this.kind}-forearm`;hand.name=`${this.kind}-${side<0?'left':'right'}-hand`;
      upper.position.set(0,-.06,0);forearm.position.set(0,-.27,.01);hand.position.set(0,-.25,.08);arm.add(upper);upper.add(forearm);forearm.add(hand);
      this.arms.push([upper,forearm,hand]);
      this.mesh(new THREE.CapsuleGeometry(.14,.24,6,14),sleeve,upper,`${this.kind}-upper-arm-mesh`,[0,-.12,0],[1,1,.82]);
      this.mesh(new THREE.CapsuleGeometry(.145,.23,6,14),bodyMaterial,forearm,`${this.kind}-forearm-mesh`,[0,-.12,.03],[1,1,.8]);
      this.mesh(new THREE.SphereGeometry(.17,20,14),bodyMaterial,hand,`${this.kind}-palm`,[0,0,.17],[1,.9,.82]);
      this.mesh(new THREE.TorusGeometry(.14,.014,7,18),accent,hand,`${this.kind}-hand-cuff`,[0,-.07,.14],[1,1,.7]);
    }
    for(const [index,leg] of [this.leftLeg,this.rightLeg].entries()){
      const side=index===0?-1:1;leg.position.set(side*.27,.47,.03);
      const thigh=new THREE.Group(),shin=new THREE.Group(),foot=new THREE.Group();
      thigh.name=`${this.kind}-thigh`;shin.name=`${this.kind}-shin`;foot.name=`${this.kind}-foot`;
      shin.position.set(0,-.2,.02);foot.position.set(0,-.16,.14);leg.add(thigh);thigh.add(shin);shin.add(foot);this.legs.push([thigh,shin,foot]);
      this.mesh(new THREE.CapsuleGeometry(.17,.22,6,14),bodyMaterial,thigh,`${this.kind}-thigh-mesh`,[0,-.06,0]);
      this.mesh(new THREE.CapsuleGeometry(.17,.2,6,14),sleeve,shin,`${this.kind}-shin-mesh`,[0,-.1,.08],[1,1,.9]);
      this.mesh(new THREE.SphereGeometry(.21,20,14),accent,foot,`${this.kind}-foot-mesh`,[0,-.06,.16],[1,.43,1.25]);
    }
  }

  private buildFork(handle:THREE.Material,blade:THREE.Material){
    const hand=this.leftArm.getObjectByName(`${this.kind}-left-hand`);if(!hand)return;
    const fork=new THREE.Group();fork.name='carrot-fork';fork.position.set(-.12,.02,.34);fork.rotation.z=.18;hand.add(fork);
    // The shaft starts inside the palm so the three-pronged trident never
    // appears to float in front of the hand.
    this.mesh(new THREE.CylinderGeometry(.035,.05,.82,14),handle,fork,'carrot-fork-handle',[0,.39,0]);
    this.mesh(new THREE.CylinderGeometry(.055,.055,.12,12),blade,fork,'carrot-fork-cross',[0,.79,0],[1,1,.7]);
    for(const x of [-.11,0,.11]){
      const tine=this.mesh(vineGeometry([[x,.82,0],[x*.92,.97,.015],[x*.76,1.1,.02]],.024),blade,fork,'carrot-trident-tine');
      tine.userData.role='trident';
    }
  }

  private buildRollingPin(handle:THREE.Material,barrel:THREE.Material){
    const hand=this.rightArm.getObjectByName(`${this.kind}-right-hand`);if(!hand)return;
    const pin=new THREE.Group();pin.name='cabbage-rolling-pin';pin.position.set(.02,.02,.28);pin.rotation.z=Math.PI/2;hand.add(pin);
    this.mesh(new THREE.CylinderGeometry(.095,.095,.58,24),barrel,pin,'cabbage-pin-barrel');
    // Handles overlap the barrel ends by a few centimetres; this removes the
    // old visible gap that made the rolling pin look disconnected.
    this.mesh(new THREE.CylinderGeometry(.04,.055,.23,14),handle,pin,'cabbage-pin-handle-left',[-.34,0,0]);
    this.mesh(new THREE.CylinderGeometry(.04,.055,.23,14),handle,pin,'cabbage-pin-handle-right',[.34,0,0]);
    this.mesh(new THREE.SphereGeometry(.065,14,10),handle,pin,'cabbage-pin-knob-left',[-.47,0,0]);
    this.mesh(new THREE.SphereGeometry(.065,14,10),handle,pin,'cabbage-pin-knob-right',[.47,0,0]);
  }

  private buildVineWhip(leaf:THREE.Material){
    const hand=this.rightArm.getObjectByName(`${this.kind}-right-hand`);if(!hand)return;
    this.mesh(vineGeometry([[0,0,.1],[.18,.25,.18],[.38,.34,.16]],.018),leaf,hand,'tomato-vine-whip');
  }

  private addAnchor(id:BodyAnchorId,parent:THREE.Object3D,position:XYZ){
    const anchor=new THREE.Object3D();anchor.name=`parry-anchor-${id}`;anchor.position.set(...position);parent.add(anchor);this.anchors[id]=anchor;this.rig.fxSockets[id]=anchor;
  }

  private captureRestPose(){
    const nodes=[this.actor,this.body,this.crown,this.leftArm,this.rightArm,this.leftLeg,this.rightLeg,
      ...this.arms.flat(),...this.legs.flat(),...this.eyes,...this.brows];
    for(const node of new Set(nodes))this.restPose.set(node,{position:node.position.clone(),rotation:node.rotation.clone(),scale:node.scale.clone()});
  }

  /** Reapply every animated node's rest transform before evaluating a frame. */
  private resetRestPose(){
    for(const [node,pose] of this.restPose){
      node.position.copy(pose.position);node.rotation.copy(pose.rotation);node.scale.copy(pose.scale);
    }
  }

  getAnchor(id:BodyAnchorId){return this.anchors[id]??this.body}

  update(state:CombatState,reducedMotion=false){
    // The combat loop may skip frames or switch directly from verdict to
    // death.  Rewriting from rest makes all poses deterministic and prevents
    // reaction transforms from accumulating across updates.
    this.resetRestPose();
    const {phase,elapsed,feedback}=state;
    const pain=verdictMotion(state,reducedMotion),breakWeight=pain.weight;
    const feedbackAge=feedback?Math.max(0,state.time-feedback.time):Infinity;
    const success=(feedback?.kind==='Nice'||feedback?.kind==='Perfect')&&feedbackAge<parryDuration(feedback.kind);
    const perfect=success&&feedback?.kind==='Perfect';
    const parryMs=perfect?perfectParryDurationMs:goodParryDurationMs;
    const recoil=success?parryImpulse(feedbackAge,parryMs)*(reducedMotion?.15:1):0;
    const squash=success?parrySquash(feedbackAge,parryMs)*(reducedMotion?.15:1):0;
    const verdictSquash=pain.compression*(.2+Math.abs(pain.y)*.8);
    const defeated=state.battle.bossHp<=0,t=state.time/1000;
    const charge=phase==='telegraph'?smooth(elapsed/state.tempo.telegraphMs):phase==='targetActive'?1-smooth(elapsed/360):0;
    const death=defeated?smooth(feedbackAge/deathFallDurationMs):0;
    const tremor=perfect&&!reducedMotion?Math.sin(t*72)*.026*Math.max(0,1-feedbackAge/parryMs):0;
    const verticalSquash=Math.max(0,verdictSquash);
    this.rig.root.userData.guardianPose=guardianPoseFor(state,pain.x,pain.y,pain.compression);
    this.actor.position.set(tremor+pain.x*.1,-death*.08-verticalSquash*.03,-recoil*(perfect?.16:.09)+death*.18);
    this.actor.rotation.set(-charge*.05+recoil*(perfect?.21:.105)-breakWeight*.032-pain.y*.28+death*.88,
      tremor*.5+pain.x*.14,death*.15-pain.x*.22-pain.followX*.04);
    this.actor.scale.set(1+death*.08+squash*(perfect?.055:.025)+verdictSquash*.035,
      1-death*.16-squash*(perfect?.09:.045)-verdictSquash*.08,
      1+squash*(perfect?.028:.012)+verdictSquash*.02);
    this.body.position.y=styles[this.kind].bodyY-squash*(perfect?.03:.016)-death*.13;
    this.body.rotation.set(-breakWeight*.035+pain.energy*.05+death*.2,0,-pain.x*.028);
    this.body.scale.set(1+squash*(perfect?.045:.02)+verdictSquash*.08+death*.1,
      1-squash*(perfect?.11:.055)-verdictSquash*.16-death*.2,
      1+squash*(perfect?.03:.012)+verdictSquash*.05);
    this.crown.rotation.set(death*.35-pain.followY*.04,0,-pain.followX*.1);
    this.crown.scale.setScalar(1+verdictSquash*.04+death*.1);
    this.leftArm.rotation.set(-charge*.28+recoil*(perfect?.25:.14)+breakWeight*.12+death*.65,0,-.1-pain.followX*.12-death*.15);
    this.rightArm.rotation.set(-charge*.2-breakWeight*.1+death*.58,0,.1+recoil*(perfect?.22:.11)+pain.followX*.13+death*.15);
    this.arms.forEach((segments,index)=>{const side=index===0?-1:1;segments[0].rotation.set(pain.followY*.08+death*.16,0,side*breakWeight*.04);segments[1].rotation.set(pain.followX*.04+death*.24,0,0);segments[2].rotation.set(pain.followY*.04+death*.35,0,side*death*.08)});
    this.leftLeg.rotation.set(breakWeight*.1-death*.84,0,-charge*.04-death*.08);
    this.rightLeg.rotation.set(breakWeight*.08-death*.92,0,charge*.04+death*.08);
    this.legs.forEach((segments,index)=>{segments[0].rotation.x=-death*(.12+index*.03);segments[1].rotation.x=-death*(.34+index*.06);segments[2].rotation.x=-death*.2});
    const expression=defeated?1:pain.pain;
    this.eyes.forEach((eye,index)=>{eye.scale.y=1-expression*.55;eye.rotation.z=(index===0?-1:1)*expression*.14});
    this.brows.forEach((brow,index)=>{brow.rotation.z=(index===0?-.3:.3)+(index===0?-1:1)*expression*.36});
    this.mouth.visible=!defeated&&pain.pain<.1;this.painMouth.visible=!defeated&&pain.pain>=.1;
    const flash=Math.max(pain.flash,success?Math.max(0,(perfect?.95:.34)-feedbackAge/220):0);
    for(const material of this.materials){material.emissive.setHex(0xffffff);material.emissiveIntensity=flash}
  }
}

export class CarrotGuardian extends VegetableGuardian { constructor(){super('carrot')} }
export class CabbageGuardian extends VegetableGuardian { constructor(){super('cabbage')} }
export class TomatoGuardian extends VegetableGuardian { constructor(){super('tomato')} }
