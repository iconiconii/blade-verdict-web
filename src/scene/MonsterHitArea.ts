import * as THREE from 'three';

/** Rest-pose volume follows the placement root, never the animated reaction rig. */
export class MonsterHitArea {
  private corners:THREE.Vector3[]=[];
  private point=new THREE.Vector3();
  private ellipse={x:.5,y:.5,rx:0,ry:0};

  constructor(private placement:THREE.Object3D){
    placement.updateWorldMatrix(true,true);
    const inverse=placement.matrixWorld.clone().invert();
    const bounds=new THREE.Box3().setFromObject(placement).applyMatrix4(inverse);
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      this.corners.push(new THREE.Vector3(x,y,z));
    }
  }

  update(camera:THREE.Camera){
    this.placement.updateWorldMatrix(true,false);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const corner of this.corners){
      this.point.copy(corner).applyMatrix4(this.placement.matrixWorld).project(camera);
      const x=(this.point.x+1)/2,y=(1-this.point.y)/2;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    // Preserve the existing forgiving mobile ellipse and minimum touch coverage.
    Object.assign(this.ellipse,{x:(minX+maxX)/2,y:(minY+maxY)/2,
      rx:Math.max(.12,(maxX-minX)*.47),ry:Math.max(.12,(maxY-minY)*.43)});
  }

  contains(point:{x:number;y:number}){
    const {x,y,rx,ry}=this.ellipse;
    return ((point.x-x)/rx)**2+((point.y-y)/ry)**2<=1;
  }
}
