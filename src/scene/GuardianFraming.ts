import * as THREE from 'three';
import type { BossKind } from '../domain/v2';

// Measured from the corn cob/kernels and boot soles, not from its spatula or
// reaction symbols. The projection tests recompute this reference from meshes.
export const guardianFramingReference = {
  bodyArea: 2.353,
  groundY: -.345,
  soleZ: .34,
};

export interface GuardianMeasurements {
  bodyPoints: THREE.Vector3[];
  silhouettePoints: THREE.Vector3[];
  bodyArea: number;
  bodyCenterX: number;
  sole: THREE.Vector3;
}

const isBodyMesh = (kind:BossKind, name:string) => kind === 'corn'
  ? name === 'corn-cob-undercoat' || name === 'corn-top-cut' || name.startsWith('corn-kernel-')
  : kind === 'jelly'
    ? ['jelly-cap', 'jelly-face-core', 'jelly-mantle-shell'].includes(name)
    : name === `${kind}-surface` || (kind === 'cabbage' && /^cabbage-leaf-\d+$/.test(name));

const isSoleMesh = (kind:BossKind, name:string) => name === (kind === 'corn'
  ? 'corn-foot' : kind === 'jelly' ? 'jelly-foot-pad' : `${kind}-foot-mesh`);

/** A frontal hull measures the mass players read as the vegetable/gel itself. */
export function frontalHullArea(points:readonly {x:number;y:number}[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a:{x:number;y:number}, b:{x:number;y:number}, c:{x:number;y:number}) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (vertices:typeof sorted) => {
    const hull:typeof sorted = [];
    for (const vertex of vertices) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], vertex) <= 0) hull.pop();
      hull.push(vertex);
    }
    return hull.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  return Math.abs(hull.reduce((sum, point, index) => {
    const next = hull[(index + 1) % hull.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

/** Capture the rest pose once; hidden GOOD stars must not make a body smaller. */
export function measureGuardian(root:THREE.Object3D, kind:BossKind, includeSilhouette = false):GuardianMeasurements {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const bodyPoints:THREE.Vector3[] = [], silhouettePoints:THREE.Vector3[] = [], solePoints:THREE.Vector3[] = [];
  root.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (!positions) return;
    const isBody = isBodyMesh(kind, object.name), isSole = isSoleMesh(kind, object.name);
    if (!includeSilhouette && !isBody && !isSole) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    const instanceMatrix = new THREE.Matrix4(), meshMatrix = new THREE.Matrix4();
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let instance = 0; instance < instances; instance += 1) {
      if (object instanceof THREE.InstancedMesh) {
        object.getMatrixAt(instance, instanceMatrix);
        meshMatrix.multiplyMatrices(matrix, instanceMatrix);
      } else meshMatrix.copy(matrix);
      for (let index = 0; index < positions.count; index += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(meshMatrix);
        if (includeSilhouette) silhouettePoints.push(point);
        if (isBody) bodyPoints.push(point);
        if (isSole) solePoints.push(point);
      }
    }
  });
  const bodyArea = frontalHullArea(bodyPoints);
  if (bodyArea <= 0 || solePoints.length === 0) throw new Error(`Missing ${kind} guardian framing landmarks`);
  const bodyBounds = new THREE.Box3().setFromPoints(bodyPoints), soles = new THREE.Box3().setFromPoints(solePoints);
  return {
    bodyPoints, silhouettePoints, bodyArea,
    bodyCenterX: (bodyBounds.min.x + bodyBounds.max.x) / 2,
    sole: new THREE.Vector3((soles.min.x + soles.max.x) / 2, soles.min.y, (soles.min.z + soles.max.z) / 2),
  };
}

/**
 * Shared safety envelope after body-area normalization. Its tallest point is
 * the carrot leaf crown; its widest points are corn's wooden props. Using one
 * envelope for every guardian preserves equal body mass when a phone is short.
 * The tests bound this envelope against actual rest/telegraph geometry.
 */
const sharedEnvelope = [
  new THREE.Vector3(0, 3.25, .5),
  new THREE.Vector3(-1.54, 1.25, .8),
  new THREE.Vector3(1.28, 1.25, .9),
];

export function sharedGuardianFit(camera:THREE.Camera) {
  const ground = new THREE.Vector3(0, guardianFramingReference.groundY, guardianFramingReference.soleZ);
  const fits = (scale:number) => sharedEnvelope.every(point => {
    const projected = point.clone().sub(ground).multiplyScalar(scale).add(ground).project(camera);
    const x = (projected.x + 1) / 2, y = (1 - projected.y) / 2;
    return x >= .14 && x <= .94 && y >= .275;
  });
  if (fits(1)) return 1;
  let low = .1, high = 1;
  for (let step = 0; step < 16; step += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid; else high = mid;
  }
  return low;
}

/** Stable outer placement; animation continues to own all transforms beneath. */
export class GuardianFraming {
  readonly root = new THREE.Group();
  readonly measurements:Pick<GuardianMeasurements, 'bodyArea' | 'bodyCenterX' | 'sole'>;
  readonly bodyScale:number;

  constructor(guardian:THREE.Object3D, kind:BossKind) {
    const {bodyArea, bodyCenterX, sole} = measureGuardian(guardian, kind);
    // Do not retain the temporary vertex cloud for an entire mobile battle.
    this.measurements = {bodyArea, bodyCenterX, sole};
    this.bodyScale = Math.sqrt(guardianFramingReference.bodyArea / this.measurements.bodyArea);
    this.root.name = `${kind}-battle-placement`;
    this.root.add(guardian);
  }

  resize(camera:THREE.Camera) {
    const scale = this.bodyScale * sharedGuardianFit(camera);
    const {bodyCenterX, sole} = this.measurements;
    this.root.scale.setScalar(scale);
    this.root.position.set(-bodyCenterX * scale,
      guardianFramingReference.groundY - sole.y * scale,
      guardianFramingReference.soleZ - sole.z * scale);
    this.root.updateMatrixWorld(true);
  }
}
