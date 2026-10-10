import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyContinuousCut, createCombat, startVerdict, tickCombat, type CombatState } from '../domain/combat';
import type { BossKind } from '../domain/v2';
import { CornGuardian } from './CornGuardian';
import { JellyGuardian } from './JellyGuardian';
import { CabbageGuardian, CarrotGuardian, TomatoGuardian } from './VegetableGuardian';
import { frontalHullArea, GuardianFraming, guardianFramingReference, measureGuardian } from './GuardianFraming';
import { makeBattleCamera, projectPoint } from './layout';
import { MonsterHitArea } from './MonsterHitArea';

const constructors = {
  corn: CornGuardian, carrot: CarrotGuardian, cabbage: CabbageGuardian,
  tomato: TomatoGuardian, jelly: JellyGuardian,
};
const allocated:THREE.Group[] = [];
const make = (kind:BossKind) => {
  const guardian = new constructors[kind]();
  allocated.push(guardian.root);
  guardian.update(createCombat(7319, kind), true);
  return guardian;
};
afterEach(() => {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  for (const root of allocated.splice(0)) root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
});

const projected = (points:THREE.Vector3[], framing:GuardianFraming, camera:THREE.Camera) =>
  points.map(point => point.clone().applyMatrix4(framing.root.matrixWorld).project(camera));
const localPose = (root:THREE.Object3D) => {
  const values:number[] = [];
  root.traverse(object => values.push(...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()));
  return values;
};

describe('shared guardian framing', () => {
  it('calibrates from real torso/sole geometry, not tall foliage, props or hidden reactions', () => {
    const corn = new GuardianFraming(make('corn').root, 'corn');
    expect(corn.measurements.bodyArea).toBeCloseTo(guardianFramingReference.bodyArea, 3);
    expect(corn.measurements.sole.y).toBeCloseTo(guardianFramingReference.groundY, 4);
    expect(corn.measurements.sole.z).toBeCloseTo(guardianFramingReference.soleZ, 4);
    const carrotGuardian = make('carrot');
    const carrotPoints = measureGuardian(carrotGuardian.root, 'carrot', true);
    const carrot = new GuardianFraming(carrotGuardian.root, 'carrot');
    expect(carrot.measurements.bodyArea / corn.measurements.bodyArea).toBeCloseTo(.53, 2);
    expect(carrot.bodyScale).toBeGreaterThan(1.35);
    expect(carrot.bodyScale).toBeLessThan(1.4);
    const bodyTop = Math.max(...carrotPoints.bodyPoints.map(point => point.y));
    const silhouetteTop = Math.max(...carrotPoints.silhouettePoints.map(point => point.y));
    expect(silhouetteTop - bodyTop).toBeGreaterThan(.65);
    // Constructor-only GOOD stars sit higher but are not visible at rest.
    expect(silhouetteTop).toBeLessThan(2.56);
  });

  // Desktop uses a portrait stage: 1280x720 desktop => 405x720 canvas.
  it.each([[320,568],[390,693],[390,844],[432,768],[405,720]])(
    'equalizes perceived mass and sole baseline without covering HUD at %ix%i', (width, height) => {
      const camera = makeBattleCamera(width, height);
      let cornArea = 0, cornSoleY = 0;
      for (const kind of Object.keys(constructors) as BossKind[]) {
        const guardian = make(kind), measured = measureGuardian(guardian.root, kind, true);
        const framing = new GuardianFraming(guardian.root, kind);
        framing.resize(camera);
        const bodyArea = frontalHullArea(projected(measured.bodyPoints, framing, camera));
        const bounds = new THREE.Box3().setFromPoints(projected(measured.silhouettePoints, framing, camera));
        const sole = projected([framing.measurements.sole], framing, camera)[0];
        if (kind === 'corn') { cornArea = bodyArea; cornSoleY = sole.y; }
        // Perspective and the different front/back depths introduce <10% mass
        // variation; the old carrot was only about half the corn's torso area.
        expect(bodyArea / cornArea, `${kind} body mass`).toBeGreaterThan(.9);
        expect(bodyArea / cornArea, `${kind} body mass`).toBeLessThan(1.1);
        expect(Math.abs(sole.y - cornSoleY) * height / 2, `${kind} sole alignment`).toBeLessThan(.1);
        expect((bounds.min.x + 1) / 2, `${kind} left edge`).toBeGreaterThan(.14);
        expect((bounds.max.x + 1) / 2, `${kind} right edge`).toBeLessThan(.94);
        expect((1 - bounds.max.y) / 2, `${kind} crown clearance`).toBeGreaterThan(.275);
        expect((1 - bounds.min.y) / 2, `${kind} item clearance`).toBeLessThan(.8);
        expect(framing.root.scale.x).toBe(framing.root.scale.y);
        expect(framing.root.scale.x).toBe(framing.root.scale.z);
        const transform = framing.root.matrixWorld.clone();
        framing.resize(makeBattleCamera(432, 768));
        framing.resize(camera);
        expect(framing.root.matrixWorld.equals(transform)).toBe(true);
        const ready = createCombat(7319, kind);
        guardian.update({...ready, phase:'telegraph', elapsed:ready.tempo.telegraphMs});
        const windup = measureGuardian(guardian.root, kind, true);
        const windupBounds = new THREE.Box3().setFromPoints(projected(windup.silhouettePoints, framing, camera));
        expect((1 - windupBounds.max.y) / 2, `${kind} windup crown`).toBeGreaterThan(.275);
        expect((1 - windupBounds.min.y) / 2, `${kind} windup feet`).toBeLessThan(.8);
      }
    },
  );

  it.each(Object.keys(constructors) as BossKind[])('keeps %s animation, anchors and stable hit volume in the same placement', kind => {
    const guardian = make(kind), unplaced = make(kind);
    const framing = new GuardianFraming(guardian.root, kind), camera = makeBattleCamera(320, 568);
    const hitArea = new MonsterHitArea(framing.root);
    framing.resize(camera);
    hitArea.update(camera);
    const placement = framing.root.matrixWorld.clone();
    const grid = Array.from({length:41 * 41}, (_, index) => ({x:(index % 41) / 40, y:Math.floor(index / 41) / 40}));
    const before = grid.map(point => hitArea.contains(point));
    const base = createCombat(7319, kind);
    const reactions:CombatState[] = (['Nice', 'Perfect', 'Miss'] as const).map(result => ({
      ...base, phase:'impact', time:100,
      feedback:{id:1, kind:result, amount:0, energyGain:0, position:{x:.5,y:.5}, angle:0, time:0},
    }));
    const verdict = startVerdict({...base, phase:'verdictReady', battle:{...base.battle, meter:100}});
    const cut = applyContinuousCut(verdict, {x:.5,y:.5}, true, -.7);
    reactions.push(tickCombat(cut, 90));
    reactions.push({...cut, phase:'settle', time:cut.time + 400, battle:{...cut.battle, bossHp:0}});
    for (const state of reactions) {
      guardian.update(state); unplaced.update(state);
      framing.root.updateMatrixWorld(true); unplaced.root.updateMatrixWorld(true);
      expect(localPose(guardian.root)).toEqual(localPose(unplaced.root));
      expect(framing.root.matrixWorld.equals(placement)).toBe(true);
      for (const id of ['head', 'belly'] as const) {
        const expected = unplaced.getAnchor(id).getWorldPosition(new THREE.Vector3()).applyMatrix4(placement);
        const actual = guardian.getAnchor(id).getWorldPosition(new THREE.Vector3());
        expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
      }
      hitArea.update(camera);
      expect(grid.map(point => hitArea.contains(point))).toEqual(before);
      if (state.phase === 'verdictSlash') {
        for (const id of ['head', 'belly'] as const) {
          expect(hitArea.contains(projectPoint(guardian.getAnchor(id).getWorldPosition(new THREE.Vector3()), camera))).toBe(true);
        }
      }
    }
  });
});
