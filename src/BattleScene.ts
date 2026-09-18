import * as THREE from 'three';
export class BattleScene {
  private renderer:THREE.WebGLRenderer; private scene=new THREE.Scene(); private camera=new THREE.PerspectiveCamera(48,1,.1,100); private raf=0; private monster=new THREE.Group(); private ring:THREE.Mesh; private slash:THREE.Mesh;
  constructor(private host:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(this.renderer.domElement);
    this.camera.position.set(0,1.7,7);this.camera.lookAt(0,.7,0);this.scene.add(new THREE.HemisphereLight(0xfff4cf,0x102c25,2.5));const sun=new THREE.DirectionalLight(0xffd76e,4);sun.position.set(-3,5,4);this.scene.add(sun);
    const ground=new THREE.Mesh(new THREE.CircleGeometry(5,64),new THREE.MeshStandardMaterial({color:0x213c28,roughness:.9}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.2;this.scene.add(ground);
    const green=new THREE.MeshStandardMaterial({color:0x87a93e,roughness:.65});const gold=new THREE.MeshStandardMaterial({color:0xf4c542,roughness:.55});
    const body=new THREE.Mesh(new THREE.SphereGeometry(1.15,32,24),green);body.scale.y=1.35;this.monster.add(body);
    for(let i=0;i<9;i++){const k=new THREE.Mesh(new THREE.SphereGeometry(.18,16,12),gold);const a=i/9*Math.PI*2;k.position.set(Math.cos(a)*.72,.25+Math.sin(a)*.68,1.02);this.monster.add(k)}
    const eyeMat=new THREE.MeshBasicMaterial({color:0x160e09});[-.38,.38].forEach(x=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.11,12,8),eyeMat);e.position.set(x,.65,1.05);this.monster.add(e)});this.scene.add(this.monster);
    this.ring=new THREE.Mesh(new THREE.RingGeometry(.72,.79,64),new THREE.MeshBasicMaterial({color:0xffd65a,transparent:true,opacity:.9,side:THREE.DoubleSide}));this.ring.position.set(0,.3,1.45);this.scene.add(this.ring);
    this.slash=new THREE.Mesh(new THREE.PlaneGeometry(.09,4),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0}));this.slash.rotation.z=-.8;this.slash.position.z=2;this.scene.add(this.slash);this.resize();addEventListener('resize',this.resize);this.loop();
  }
  private resize=()=>{const w=this.host.clientWidth,h=this.host.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix()};
  private loop=()=>{const t=performance.now()/1000;this.monster.position.y=Math.sin(t*2)*.07;this.monster.rotation.y=Math.sin(t*.8)*.08;this.ring.rotation.z=t*.8;this.renderer.render(this.scene,this.camera);this.raf=requestAnimationFrame(this.loop)};
  setRing(progress:number,position:{x:number;y:number}){const ratio=progress<.35?3-(progress/.35)*.8:progress<.7?2.2-((progress-.35)/.35):progress<.9?1.2-((progress-.7)/.2)*.4:.8-((progress-.9)/.1)*.55;this.ring.scale.setScalar(Math.max(.3,ratio));this.ring.position.x=(position.x-.5)*4;this.ring.position.y=(position.y-.5)*3+.3;const mat=this.ring.material as THREE.MeshBasicMaterial;mat.color.set(progress>=.7&&progress<=.9?0x6fffe9:progress>=.35?0xffd65a:0xff714b)}
  flashSlash(){const m=this.slash.material as THREE.MeshBasicMaterial;m.opacity=1;let n=0;const tick=()=>{m.opacity=Math.max(0,1-n++/12);if(n<13)requestAnimationFrame(tick)};tick()}
  dispose(){cancelAnimationFrame(this.raf);removeEventListener('resize',this.resize);this.renderer.dispose();this.host.replaceChildren()}
}
