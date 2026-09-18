import * as THREE from 'three';
import type { CombatState } from '../domain/combat';

const smooth=(t:number)=>THREE.MathUtils.smoothstep(t,0,1);

/** A translucent, elastic 3D jelly guardian with tentacle-like fins. */
export class JellyGuardian {
  readonly root=new THREE.Group();
  private body=new THREE.Group();
  private tentacles:THREE.Mesh[]=[];
  private materials:THREE.MeshPhysicalMaterial[]=[];
  private eyes:THREE.Mesh[]=[];
  constructor(){
    this.root.name='jelly-guardian-3d';this.root.add(this.body);this.body.position.y=1.05;
    const jelly=this.material(0x8b4fd1,.18,0,.55),jellyLight=this.material(0xc47dff,.15,0,.35),dark=this.material(0x26173a,.42,0,0),ink=new THREE.MeshBasicMaterial({color:0x130d1b});
    const blob=new THREE.Mesh(new THREE.IcosahedronGeometry(.82,3),jelly);blob.name='jelly-body';blob.scale.set(.94,1.2,.75);blob.castShadow=true;blob.receiveShadow=true;this.body.add(blob);
    const belly=new THREE.Mesh(new THREE.SphereGeometry(.56,24,16),jellyLight);belly.position.set(0,-.05,.52);belly.scale.set(.85,1.05,.24);belly.castShadow=true;this.body.add(belly);
    for(let row=0;row<4;row++)for(let col=0;col<7;col++){
      const a=col/7*Math.PI*2+(row%2)*.25,r=.58+row*.035;
      const bubble=new THREE.Mesh(new THREE.SphereGeometry(.08+(row%2)*.015,10,8),jellyLight);bubble.position.set(Math.sin(a)*r,-.4+row*.27,.48+Math.cos(a)*r*.3);bubble.castShadow=true;this.body.add(bubble);
    }
    for(const side of [-1,1]){
      const eye=this.mesh(new THREE.SphereGeometry(.13,16,10),ink,this.body,[side*.21,.42,.61],[1,1.25,.35]);this.eyes.push(eye);
      const brow=this.mesh(new THREE.TorusGeometry(.14,.025,5,14,Math.PI),dark,this.body,[side*.21,.6,.63]);brow.rotation.z=side*.18;
    }
    const mouth=this.mesh(new THREE.TorusGeometry(.13,.05,8,16,Math.PI*1.25),ink,this.body,[0,.08,.62]);mouth.rotation.x=Math.PI;
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2,fin=this.mesh(new THREE.CapsuleGeometry(.14,.5,4,10),i%2?jelly:jellyLight,this.root,[Math.sin(a)*.7,.28,Math.cos(a)*.38]);fin.scale.set(.75,1+(i%3)*.18,.75);fin.rotation.set(.16*Math.cos(a),a*.2,Math.cos(a)*.45);this.tentacles.push(fin);
    }
    const crown=this.mesh(new THREE.ConeGeometry(.3,.46,8),jellyLight,this.body,[0,1.02,.05]);crown.rotation.z=.15;
    const halo=this.mesh(new THREE.TorusGeometry(.62,.025,6,32),jellyLight,this.body,[0,-.65,0]);halo.rotation.x=Math.PI/2;halo.scale.set(1,.7,1);
  }
  private material(color:number,roughness:number,metalness:number,transmission:number){const material=new THREE.MeshPhysicalMaterial({color,roughness,metalness,transmission,thickness:.28,ior:1.35,clearcoat:.22,clearcoatRoughness:.3});this.materials.push(material);return material}
  private mesh(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,position=[0,0,0],scale=[1,1,1]){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position[0],position[1],position[2]);mesh.scale.set(scale[0],scale[1],scale[2]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
  update(state:CombatState,reducedMotion=false){
    const {phase,elapsed,feedback}=state,impact=phase==='impact'||phase==='stagger',success=impact&&feedback!==null&&feedback.kind!=='Miss',hitStop=feedback?.kind==='Perfect'&&phase==='impact'&&elapsed<100,t=(state.time-(hitStop?elapsed:0))/1000;
    const charge=phase==='telegraph'?smooth(elapsed/400):phase==='targetActive'?1-smooth(elapsed/360):0,age=phase==='stagger'&&feedback?.kind!=='Verdict'?elapsed+280:elapsed,recoil=success?Math.sin(Math.min(age/580,1)*Math.PI):0,down=state.battle.bossHp<=0?smooth(age/650):0,verdict=phase==='verdictReady'||phase==='verdictSlash',sway=reducedMotion||verdict?0:Math.sin(t*1.8)*.025;
    this.root.position.set(0,-.2+Math.sin(t*2)*.025,-recoil*.16);this.root.rotation.set(-charge*.12+recoil*.12,verdict?0:sway,down*1.1);this.body.scale.set(1+charge*.07,1-charge*.1,1+charge*.05);this.body.rotation.y=reducedMotion?0:Math.sin(t*1.2)*.06;
    this.tentacles.forEach((tentacle,i)=>{const a=i/6*Math.PI*2;tentacle.rotation.z=Math.cos(t*3+i)*.15+Math.cos(a)*charge*.4;tentacle.rotation.x=Math.sin(t*2+i)*.08+(this.root.rotation.x*.3);tentacle.scale.y=1+Math.sin(t*3+i)*.08+charge*.18});
    const flash=success&&phase==='impact'?Math.max(0,.8-elapsed/190):0;for(const material of this.materials){material.emissive.setHex(0xd9b8ff);material.emissiveIntensity=flash}
    this.eyes.forEach(eye=>eye.scale.y=phase==='telegraph'?1.5:1);
  }
}
