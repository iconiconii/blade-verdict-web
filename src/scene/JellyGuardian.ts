import * as THREE from 'three';
import type { CombatState } from '../domain/combat';
import { deathFallDurationMs } from '../domain/combat';
import type { BodyAnchorId } from '../domain/v2';
import { verdictMotion } from './verdictMotion';
import { createGuardianRig, guardianPoseFor, type GuardianRig } from './GuardianRig';

type XYZ = [number, number, number];
const smooth = (t:number) => THREE.MathUtils.smoothstep(t,0,1);

/** Smooth profile samples avoid the old bell's straight-sided, bucket-like shape. */
function jellySurface(profile:Array<[number,number]>, depth:number, scallop=0){
  const curve=new THREE.SplineCurve(profile.map(p=>new THREE.Vector2(...p)));
  const points=curve.getPoints(64).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y));
  const geometry=new THREE.LatheGeometry(points,64);
  const positions=geometry.getAttribute('position'), colors:number[]=[];
  const low=new THREE.Color(0x8873e9), high=new THREE.Color(0xe3b7ff);
  const minY=Math.min(...profile.map(p=>p[1])),maxY=Math.max(...profile.map(p=>p[1]));
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const angle=Math.atan2(x,z),v=(y-minY)/(maxY-minY);
    const wave=scallop*Math.cos(angle*8)*Math.pow(1-v,3);
    positions.setXYZ(i,x,y+wave,z*depth);
    const color=low.clone().lerp(high,THREE.MathUtils.smoothstep(v,.08,.9));
    colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

/** Tapered, curved fins rather than intersecting capsules and ball joints. */
function jellyLimb(points:XYZ[],width:number,depth:number){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const geometry=new THREE.TubeGeometry(curve,40,1,16,false);
  const positions=geometry.getAttribute('position'),frames=curve.computeFrenetFrames(40,false);
  for(let row=0;row<=40;row++){
    const t=row/40,center=curve.getPointAt(t);
    const radius=width*Math.pow(Math.sin(Math.PI*t),.65);
    for(let col=0;col<=16;col++){
      const angle=col/16*Math.PI*2;
      const p=center.clone().addScaledVector(frames.normals[row],-Math.cos(angle)*radius)
        .addScaledVector(frames.binormals[row],Math.sin(angle)*radius*depth);
      positions.setXYZ(row*17+col,p.x,p.y,p.z);
    }
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

/** Moon-jelly silhouette: scalloped hood, unobstructed face and flowing fins. */
export class JellyGuardian {
  readonly root=new THREE.Group();
  readonly anchors:Partial<Record<BodyAnchorId,THREE.Object3D>>={};
  readonly rig:GuardianRig;
  private actor=new THREE.Group();
  private hood=new THREE.Group();
  private face=new THREE.Group();
  private body=new THREE.Group();
  private fins:THREE.Group[]=[];
  private feet:THREE.Group[]=[];
  private eyes:THREE.Mesh[]=[];
  private materials:Array<{material:THREE.MeshPhysicalMaterial;emissive:THREE.Color;intensity:number}>=[];
  private pearl:THREE.Mesh;
  private mouth:THREE.Mesh;
  private painMouth:THREE.Mesh;

  constructor(){
    this.rig=createGuardianRig('jelly-guardian-rig');
    this.root.name='jelly-guardian-3d';
    this.hood.name='jelly-hood';this.hood.position.set(0,1.78,-.025);
    this.face.name='jelly-face';this.face.position.set(0,1.48,.16);
    this.body.name='jelly-mantle';this.body.position.set(0,.94,0);
    this.root.add(this.hood,this.face,this.body);

    // Transmission alone provides volume. Combining it with alpha blending
    // made the previous shell sort through the eyes and limbs.
    const gel=this.material({color:0xbaa0ef,roughness:.2,transmission:.32,thickness:.32});
    const gradientGel=this.material({color:0xffffff,vertexColors:true,roughness:.24,transmission:.26,thickness:.23});
    const dark=this.material({color:0x39275c,roughness:.3,transmission:0,clearcoat:.7});
    const eye=this.material({color:0xe6fbff,emissive:0xb2efff,emissiveIntensity:1.4,roughness:.2});
    const edge=this.material({color:0xcec2ff,emissive:0x9b91ff,emissiveIntensity:.32,roughness:.25});
    const anchorGlow=this.material({color:0x8e7acb,emissive:0x6652d9,emissiveIntensity:.32,roughness:.22,clearcoat:1});
    const blush=this.material({color:0xe7a1dc,emissive:0xb85ead,emissiveIntensity:.14,roughness:.4});
    const sphere=new THREE.SphereGeometry(1,32,24);

    const cap=jellySurface([[0,-.06],[.42,-.085],[.79,-.035],[.92,.055],[.85,.25],[.64,.46],[.32,.59],[0,.62]],.8,.027);
    this.mesh(cap,gradientGel,this.hood,'jelly-cap');
    // Thin scalloped lip follows the hood, leaving the whole face open below.
    const lipPoints=Array.from({length:97},(_,i)=>{
      const a=i/96*Math.PI*2;
      return new THREE.Vector3(.866*Math.sin(a),.012+.021*Math.cos(a*8),.866*.8*Math.cos(a));
    });
    this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lipPoints,true),96,.018,6,true),edge,this.hood,'jelly-cap-rim');

    // One face volume; there is no separate belly/nose intersecting the eyes.
    this.mesh(sphere,dark,this.face,'jelly-face-core',[0,0,0],[.435,.36,.32]);
    for(const side of [-1,1]){
      const eyeMesh=this.mesh(sphere,eye,this.face,side<0?'jelly-eye-left':'jelly-eye-right',[side*.165,.045,.298],[.069,.115,.038]);
      eyeMesh.rotation.z=side*-.12;this.eyes.push(eyeMesh);
      this.mesh(sphere,blush,this.face,'jelly-cheek',[side*.28,-.065,.254],[.069,.025,.016]);
    }
    const smile=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.074,-.115,.31),new THREE.Vector3(0,-.185,.327),new THREE.Vector3(.074,-.115,.31));
    this.mouth=this.mesh(new THREE.TubeGeometry(smile,16,.012,6,false),edge,this.face,'jelly-smile');
    this.painMouth=this.mesh(new THREE.TorusGeometry(1,.14,6,24),edge,this.face,'jelly-pain-mouth',[0,-.14,.326],[.08,.06,.04]);
    this.painMouth.visible=false;

    // A small pear-shaped mantle and a rippled hem, well below the face.
    const mantle=jellySurface([[0,-.36],[.23,-.35],[.40,-.26],[.35,-.08],[.285,.2],[.22,.33],[0,.37]],.82,.027);
    this.mesh(mantle,gradientGel,this.body,'jelly-mantle-shell');
    this.mesh(sphere,dark,this.body,'jelly-inner-core',[0,.04,-.01],[.19,.245,.17]);
    this.pearl=this.mesh(sphere,edge,this.body,'jelly-heart',[0,.04,.267],[.09,.125,.045]);
    // A few restrained bioluminescent seams make the three body anchors read as
    // anatomy (crown, heart and lower joint), not floating interaction markers.
    this.mesh(new THREE.TorusGeometry(.13,.013,8,24,Math.PI*1.35),anchorGlow,this.hood,'jelly-crown-seam',[.10,.32,.605],[1,1,.32]);
    this.mesh(new THREE.TorusGeometry(.125,.013,8,24,Math.PI*1.35),anchorGlow,this.body,'jelly-heart-seam',[0,.035,.31],[1,1,.34]);
    this.mesh(new THREE.TorusGeometry(.11,.011,8,22,Math.PI*1.25),anchorGlow,this.body,'jelly-hem-seam',[0,-.28,.355],[1,1,.32]);

    for(const side of [-1,1]){
      const fin=new THREE.Group();fin.name=side<0?'jelly-left-fin':'jelly-right-fin';
      fin.position.set(side*.53,1.61,-.035);this.root.add(fin);this.fins.push(fin);
      const points:XYZ[]=[[0,.075,0],[side*.14,-.12,.02],[side*.35,-.47,.06],[side*.43,-.75,.11],[side*.29,-.96,.19]];
      this.mesh(jellyLimb(points,.21,.64),gel,fin,'jelly-fin-surface');
      const trace=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.13,-.16,.115),new THREE.Vector3(side*.31,-.43,.187),new THREE.Vector3(side*.39,-.68,.20)]);
      this.mesh(new THREE.TubeGeometry(trace,24,.011,6,false),edge,fin,'jelly-fin-edge');
      this.mesh(new THREE.SphereGeometry(.064,12,8),anchorGlow,fin,'jelly-fin-joint',[side*.34,-.47,.205],[1,.86,.5]);
      this.addAnchor(side<0?'leftFin':'rightFin',fin,[side*.34,-.47,.20]);

      const foot=new THREE.Group();foot.name=side<0?'jelly-left-foot':'jelly-right-foot';
      foot.position.set(side*.25,.65,.02);this.root.add(foot);this.feet.push(foot);
      const footPoints:XYZ[]=[[0,.02,0],[side*.045,-.13,.045],[side*.09,-.30,.11],[side*.05,-.43,.2]];
      this.mesh(jellyLimb(footPoints,.16,.84),gel,foot,'jelly-foot-stem');
      this.mesh(sphere,gel,foot,'jelly-foot-pad',[side*.07,-.43,.18],[.215,.12,.235]);
      this.mesh(new THREE.TorusGeometry(.09,.01,8,20,Math.PI*1.2),anchorGlow,foot,'jelly-foot-joint',[side*.07,-.23,.235],[1,.85,.42]);
      this.addAnchor(side<0?'leftJoint':'rightJoint',foot,[side*.07,-.23,.232]);
    }

    // Sparse suspended pearls enrich the gel without visual noise on the face.
    const bubbles=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),edge,10);
    bubbles.name='jelly-hood-pearls';
    const dummy=new THREE.Object3D();
    for(let i=0;i<10;i++){
      const a=i*2.39996,ring=.45+(i%3)*.11;
      dummy.position.set(Math.sin(a)*ring,.13+(i%3)*.055,Math.cos(a)*ring*.75);
      dummy.scale.setScalar(.014+(i%3)*.006);dummy.updateMatrix();bubbles.setMatrixAt(i,dummy.matrix);
    }
    this.hood.add(bubbles);
    this.addAnchor('head',this.hood,[.10,.32,.603],[-.25,0,0]);
    this.addAnchor('belly',this.body,[0,.035,.30]);
    // Keep the legacy lower-joint id on the flowing hem, not a third pillar-leg.
    this.addAnchor('lowerJoint',this.body,[0,-.28,.35]);
    this.actor.name='jelly-reaction-rig';this.actor.add(...this.root.children);this.root.add(this.actor);
    this.rig.root=this.root;this.rig.poseRoot=this.actor;this.rig.visualRoot=this.actor;this.rig.anchors=this.anchors;
    this.root.add(this.rig.hitProxy);
  }

  private material(options:THREE.MeshPhysicalMaterialParameters){
    const material=new THREE.MeshPhysicalMaterial({
      metalness:0,roughness:.23,clearcoat:1,clearcoatRoughness:.18,
      ior:1.32,envMapIntensity:.75,...options,
    });
    this.materials.push({material,emissive:material.emissive.clone(),intensity:material.emissiveIntensity});
    return material;
  }

  private mesh(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,name:string,position:XYZ=[0,0,0],scale:XYZ=[1,1,1]){
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);
    // Clear gel should not cast opaque bands across the glowing face.
    const translucent=material instanceof THREE.MeshPhysicalMaterial&&material.transmission>0;
    mesh.castShadow=!translucent;mesh.receiveShadow=false;parent.add(mesh);return mesh;
  }

  private addAnchor(id:BodyAnchorId,parent:THREE.Object3D,position:XYZ,rotation:XYZ=[0,0,0]){
    const anchor=new THREE.Object3D();anchor.name=`parry-anchor-${id}`;anchor.position.set(...position);anchor.rotation.set(...rotation);parent.add(anchor);this.anchors[id]=anchor;this.rig.fxSockets[id]=anchor;
  }
  getAnchor(id:BodyAnchorId){return this.anchors[id]??this.body}

  update(state:CombatState,reducedMotion=false){
    const {phase,elapsed,feedback}=state;
    const pain=verdictMotion(state,reducedMotion),w=pain.weight;
    this.rig.root.userData.guardianPose=guardianPoseFor(state,pain.x,pain.y,pain.compression);
    const feedbackAge=feedback?Math.max(0,state.time-feedback.time):Infinity;
    const success=(feedback?.kind==='Nice'||feedback?.kind==='Perfect')&&feedbackAge<680;
    const perfect=success&&feedback?.kind==='Perfect';
    const t=state.time/1000;
    const charge=phase==='telegraph'?smooth(elapsed/state.tempo.telegraphMs):phase==='targetActive'?1-smooth(elapsed/360):0;
    const recoil=success?Math.sin(Math.min(feedbackAge/(perfect?680:460),1)*Math.PI)*(reducedMotion?.15:1):0;
    const tremor=perfect&&!reducedMotion?Math.sin(t*72)*.028*Math.max(0,1-feedbackAge/680):0;
    const defeated=state.battle.bossHp<=0;
    // Death is driven by the finisher timestamp, not by the stagger/settle
    // boundary, so the soft body keeps falling instead of snapping down.
    const down=defeated?smooth(feedbackAge/deathFallDurationMs):0;
    const slump=w+(defeated?1-down:0),motion=reducedMotion?0:1;
    const bob=Math.sin(t*2)*.025*motion*(1-w);
    // Soft-body death: cap buckles, fins lose lift, then the mantle folds
    // forward onto the plinth rather than disappearing vertically.
    const deathFall=defeated?down:0;
    this.actor.position.set(tremor+pain.x*.035,.035+bob-down*.08,-recoil*(perfect?.18:.1)+deathFall*.18);
    this.actor.rotation.set(-charge*.055+recoil*(perfect?.16:.08)-slump*.04-pain.y*.065+deathFall*.62,
      (-.06+Math.sin(t*1.5)*.025+tremor)*motion*(1-w)+pain.x*.08,deathFall*.12-pain.x*.07);
    this.actor.scale.set(1+down*.25+slump*.035,1-down*.65-slump*.05,1+down*.15);
    // Attached anchors share each part's motion, including the breathing squash.
    this.hood.scale.set(1+charge*.055+recoil*(perfect?.14:.04)+pain.compression*.14,
      1-charge*.065-recoil*(perfect?.2:.06)-pain.compression*.22,1+charge*.025+pain.compression*.07);
    this.hood.position.y=1.78-slump*.035+Math.sin(t*2-.3)*.012*motion*(1-w)+pain.breath*.012-deathFall*.22;
    this.hood.rotation.set(deathFall*.3,-deathFall*.08,-pain.x*.06);
    this.hood.scale.y*=1-deathFall*.12;
    this.body.scale.set(1+charge*.055+pain.compression*.12+deathFall*.15,1-charge*.04-pain.compression*.17-deathFall*.32,1+pain.compression*.06);
    this.body.rotation.set(deathFall*.24,-deathFall*.06,-pain.followX*.085);
    this.face.position.y=1.48-slump*.03-pain.compression*.012+pain.breath*.005-deathFall*.16;
    this.face.rotation.set(deathFall*.4,0,-pain.followX*.04);
    this.fins.forEach((fin,i)=>{
      const side=i===0?-1:1;
      fin.rotation.set(-charge*.06-pain.followY*.17,side*charge*.04,
        side*(charge*.14+Math.sin(t*2.2+i)*.045*motion*(1-w)-slump*.07-deathFall*.22)-pain.followX*.22+side*pain.breath*.016);
    });
    this.feet.forEach((foot,i)=>foot.rotation.set(-deathFall*.55,0,Math.sin(t*2.4+i)*.04*motion*(1-w)-pain.followX*.08));
    const blink=reducedMotion||phase!=='telegraph'?1:1-.55*Math.sin(charge*Math.PI);
    const expression=defeated?1:pain.pain;
    this.eyes.forEach((eye,i)=>{
      eye.scale.y=.115*blink*(1-Math.sqrt(expression)*.82);
      eye.rotation.z=(i===0?-1:1)*(-.12+expression*.55);
    });
    this.mouth.visible=!defeated&&pain.pain<.1;this.painMouth.visible=!defeated&&pain.pain>=.1;
    this.painMouth.scale.set(.08,.035+.04*pain.pain,.04);
    const heartPulse=phase==='telegraph'?1+.14*Math.sin(charge*Math.PI):success?1+.12*Math.sin(Math.min(feedbackAge/280,1)*Math.PI):1+pain.energy*.16;
    this.pearl.scale.set(.09*heartPulse,.125*heartPulse,.045*heartPulse);
    const flash=Math.max(pain.flash,success?Math.max(0,(perfect?.9:.35)-feedbackAge/220)*(reducedMotion?.3:1):0);
    for(const {material,emissive,intensity} of this.materials){
      material.emissive.copy(emissive).lerp(new THREE.Color(0xe5d9ff),flash);
      material.emissiveIntensity=intensity+flash;
    }
  }
}
