import * as THREE from 'three';
import type { CombatState } from '../domain/combat';
import { guardianHitExpression, type HitExpressionKind } from './hitMotion';

type XYZ=[number,number,number];
type ExpressionKind=Exclude<HitExpressionKind,'Idle'>;

/** Three sculpted reaction faces, attached to each guardian's moving face socket. */
export class GuardianExpressions {
  readonly root=new THREE.Group();
  private faces:Record<ExpressionKind,THREE.Group>={Good:new THREE.Group(),Perfect:new THREE.Group(),Miss:new THREE.Group()};
  private sphere=new THREE.SphereGeometry(1,24,16);
  private dark=new THREE.MeshBasicMaterial({color:0x211710});
  private stroke:THREE.MeshBasicMaterial;
  private white=new THREE.MeshStandardMaterial({color:0xfff5dc,roughness:.42});
  private tongue=new THREE.MeshStandardMaterial({color:0xf65a63,roughness:.45});
  private cheek=new THREE.MeshBasicMaterial({color:0xf48270});
  private gold=new THREE.MeshBasicMaterial({color:0xffdb59});
  private mouthRed=new THREE.MeshBasicMaterial({color:0x9b2528});
  private goodSymbols=new THREE.Group();
  private goodMouth!:THREE.Mesh;
  private goodFaceLift:number;
  private pupils:THREE.Mesh[]=[];
  private tauntTongue!:THREE.Mesh;

  constructor(face:THREE.Group,private idleFeatures:THREE.Object3D[],name:string,depth=.12,scale=1,strokeColor=0x211710){
    this.stroke=new THREE.MeshBasicMaterial({color:strokeColor});
    this.goodFaceLift=name==='corn'?.24:.045;
    this.root.name=`${name}-hit-expressions`;this.root.position.z=depth;this.root.scale.setScalar(scale);
    face.add(this.root);
    for(const [kind,group] of Object.entries(this.faces)){
      group.name=`${name}-expression-${kind.toLowerCase()}`;group.visible=false;this.root.add(group);
    }
    this.buildGood();this.buildPerfect();this.buildMiss();
    // Above/outside the head silhouette, not tiny decorations on the eyebrow.
    this.goodSymbols.position.set(name==='jelly'?.62:name==='corn'?.67:.48,name==='corn'?1.07:name==='carrot'?1.18:name==='jelly'?1.5:.94,.02);
    if(name==='jelly'){
      for(const feature of this.faces.Good.children){
        if(feature.name==='surprised-raised-brow')feature.position.y=-.12;
      }
    }
  }

  private ball(parent:THREE.Object3D,name:string,material:THREE.Material,position:XYZ,scale:XYZ){
    const mesh=new THREE.Mesh(this.sphere,material);mesh.name=name;
    mesh.position.set(...position);mesh.scale.set(...scale);parent.add(mesh);return mesh;
  }

  private line(parent:THREE.Object3D,name:string,points:XYZ[],radius=.015,material:THREE.Material=this.stroke){
    const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,18,radius,7,false),material);
    mesh.name=name;parent.add(mesh);return mesh;
  }

  private eye(parent:THREE.Group,side:number,scale:XYZ=[.153,.21,.041]){
    return this.ball(parent,`reaction-eye-${side}`,this.white,[side*.19,.08,0],scale);
  }

  private star(parent:THREE.Group,x:number,y:number,size:number){
    const shape=new THREE.Shape();
    for(let i=0;i<10;i++){
      const angle=Math.PI/2+i*Math.PI/5,r=i%2?.45:1;
      const sx=Math.cos(angle)*r*size,sy=Math.sin(angle)*r*size;
      if(i===0)shape.moveTo(sx,sy);else shape.lineTo(sx,sy);
    }
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false});
    const outline=new THREE.Mesh(geometry,this.dark);outline.scale.set(1.1,1.1,1);outline.position.set(x,y,-.02);parent.add(outline);
    const mesh=new THREE.Mesh(geometry,this.gold);
    mesh.name='reaction-star';mesh.position.set(x,y,0);parent.add(mesh);
  }

  private buildGood(){
    const group=this.faces.Good;
    for(const side of [-1,1]){
      this.ball(group,'surprised-eye-outline',this.dark,[side*.19,.08,-.004],[.18,.201,.039]);
      const eye=this.eye(group,side,[.173,.191,.045]);eye.position.z=.013;
      this.ball(group,'surprised-small-pupil',this.dark,[side*.19,.075,.059],[.017,.025,.014]);
      this.line(group,'surprised-raised-brow',[[side*.34,.335,0],[side*.25,.38,.015],[side*.17,.369,.014],[side*.075,.338,0]],.026);
      this.ball(group,'surprised-flushed-cheek',this.cheek,[side*.285,-.13,-.004],[.086,.047,.017]);
    }
    this.goodMouth=this.ball(group,'surprised-o-mouth',this.dark,[0,-.235,0],[.095,.119,.028]);
    this.ball(group,'surprised-red-mouth',this.mouthRed,[0,-.24,.026],[.073,.096,.016]);
    this.ball(group,'surprised-tongue',this.tongue,[.006,-.293,.044],[.055,.033,.014]);
    this.goodSymbols.name='good-surprise-symbols';group.add(this.goodSymbols);
    this.star(this.goodSymbols,0,.12,.135);
    const exclamation=new THREE.Group();exclamation.position.set(.25,-.045,.01);exclamation.rotation.z=-.3;this.goodSymbols.add(exclamation);
    this.line(exclamation,'surprised-exclamation-outline',[[0,.03,-.012],[0,.32,-.012]],.04,this.dark);
    this.line(exclamation,'surprised-exclamation',[[0,.045,.008],[0,.315,.008]],.028,this.white);
    this.ball(exclamation,'surprised-exclamation-dot-outline',this.dark,[0,-.07,0],[.046,.046,.018]);
    this.ball(exclamation,'surprised-exclamation-dot',this.white,[0,-.07,.018],[.033,.033,.015]);
  }

  private buildPerfect(){
    const group=this.faces.Perfect;
    for(const side of [-1,1]){
      this.eye(group,side,[.153,.13,.033]);
      this.line(group,'hurt-squeezed-eye',[[side*.28,.115,.04],[side*.13,.075,.047],[side*.27,.025,.04]],.018,this.dark);
      this.line(group,'hurt-tensed-brow',[[side*.32,.32,0],[side*.22,.28,.01],[side*.08,.19,.02]],.038);
      this.ball(group,'hurt-flushed-cheek',this.cheek,[side*.255,-.08,-.005],[.105,.05,.014]);
      for(let i=0;i<2;i++)this.line(group,'hurt-cheek-mark',[[side*(.24+i*.045),-.07,.012],[side*(.22+i*.045),-.105,.012]],.006,this.tongue);
    }
    this.ball(group,'hurt-scream-mouth',this.dark,[0,-.245,0],[.175,.16,.035]);
    this.ball(group,'hurt-upper-teeth',this.white,[0,-.14,.025],[.127,.027,.019]);
    this.ball(group,'hurt-lower-teeth',this.white,[0,-.36,.025],[.113,.026,.019]);
    this.ball(group,'hurt-tongue',this.tongue,[.025,-.29,.035],[.078,.045,.016]);
  }

  private buildMiss(){
    const group=this.faces.Miss;
    for(const side of [-1,1]){
      // A lower hemisphere is a real half-lidded eye, rather than a squeezed whole eye.
      const eye=new THREE.Mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,Math.PI/2,Math.PI/2),this.white);
      eye.name='smug-half-lidded-eye';eye.position.set(side*.19,.075,0);eye.scale.set(.155,.15,.04);eye.rotation.z=side*.08;group.add(eye);
      const pupil=this.ball(group,'smug-sideways-pupil',this.dark,[side*.19+.03,.035,.041],[.04,.045,.015]);this.pupils.push(pupil);
      this.line(group,'smug-lid',[[side*.33,.075,.025],[side*.19,.07,.047],[side*.045,.065,.024]],.017,this.dark);
      this.line(group,'smug-asymmetric-brow',side<0?[[-.33,.29,0],[-.21,.24,.01],[-.09,.26,0]]:[[.07,.29,0],[.18,.35,.01],[.29,.3,0]],.024);
      this.ball(group,'smug-blush',this.cheek,[side*.265,-.105,-.005],[.075,.025,.014]);
    }
    this.line(group,'smug-crooked-smile',[[-.13,-.205,0],[-.03,-.235,.018],[.08,-.202,.028],[.175,-.125,.01]],.017);
    this.tauntTongue=this.ball(group,'smug-tongue-out',this.tongue,[.105,-.255,.025],[.065,.092,.025]);
    this.tauntTongue.rotation.z=.42;
    this.line(group,'smug-tongue-crease',[[.08,-.215,.055],[.105,-.27,.055]],.005,this.dark);
  }

  update(state:CombatState,reducedMotion=false,suppressed=false){
    const expression=guardianHitExpression(state);
    const active=!suppressed&&expression.kind!=='Idle'&&expression.weight>.001;
    this.root.userData.expression=active?expression.kind:'Idle';
    for(const [kind,face] of Object.entries(this.faces)){
      face.visible=active&&kind===expression.kind;
      face.position.set(0,0,0);face.rotation.set(0,0,0);face.scale.setScalar(1);
    }
    this.goodMouth.scale.set(.095,.119,.028);
    this.goodSymbols.scale.setScalar(1);this.goodSymbols.rotation.set(0,0,0);
    this.pupils.forEach((pupil,index)=>{pupil.position.x=(index===0?-1:1)*.19+.03});
    this.tauntTongue.scale.set(.065,.092,.025);
    if(!active)return expression;
    this.idleFeatures.forEach(feature=>{feature.visible=false});
    const group=this.faces[expression.kind as ExpressionKind];
    const age=Math.max(0,state.time-(state.feedback?.time??state.time));
    const movement=reducedMotion?0:expression.weight;
    group.scale.set(1,1+.035*movement*Math.sin(age*.025),1);
    group.position.set(0,reducedMotion?0:expression.weight*.01,0);
    group.rotation.set(0,0,expression.kind==='Miss'?-.075*movement:0);
    if(expression.kind==='Good'){
      group.position.y+=this.goodFaceLift+Math.sin(age*.018)*movement*.012;
      this.goodMouth.scale.y=.119*(.82+.18*expression.weight);
      const pop=reducedMotion?1:1+.15*Math.sin(Math.min(age/70,1)*Math.PI)*expression.weight;
      this.goodSymbols.scale.setScalar(pop);
      this.goodSymbols.rotation.z=reducedMotion?0:Math.sin(age*.024)*movement*.04;
    }
    if(expression.kind==='Perfect')group.rotation.z=Math.sin(age*.07)*movement*.025;
    if(expression.kind==='Miss'){
      this.pupils.forEach((pupil,index)=>{pupil.position.x=(index===0?-1:1)*.19+.03+Math.sin(age*.012)*movement*.01});
      this.tauntTongue.scale.y=.092*(1+Math.sin(age*.018)*movement*.12);
    }
    return expression;
  }
}
