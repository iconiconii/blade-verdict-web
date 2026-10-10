import { describe, expect, it } from 'vitest';
import { CornGuardian } from './CornGuardian';
import { JellyGuardian } from './JellyGuardian';
import { CarrotGuardian, CabbageGuardian, TomatoGuardian } from './VegetableGuardian';
import { liveParryLayouts, makeBattleCamera, nearestParryTarget, projectBodyAnchor } from './layout';
import { createCombat, prepareRound, tapTarget, tickCombat } from '../domain/combat';
import { deterministicBodyAnchor } from '../domain/v2';
import * as THREE from 'three';
import { GuardianFraming } from './GuardianFraming';

describe('portrait garden composition', () => {
  for (const [width, height] of [[320, 568], [390, 693], [390, 844], [432, 768]]) {
    it(`keeps anatomical anchor centers clear of the HUD at ${width}x${height}`, () => {
      for (const kind of ['corn', 'jelly'] as const) {
        const monster = kind === 'corn' ? new CornGuardian() : new JellyGuardian();
        const state = createCombat(7319, kind);
        monster.update(state, true);
        monster.root.updateMatrixWorld(true);
        const camera = makeBattleCamera(width, height);
        new GuardianFraming(monster.root, kind).resize(camera);
        for (const anchor of Object.values(monster.anchors)) {
          const center = projectBodyAnchor(anchor, camera, width, height);
          expect(center.x).toBeGreaterThan(width * .13);
          expect(center.x).toBeLessThan(width * .93);
          expect(center.y).toBeGreaterThan(height * .25);
          expect(center.y).toBeLessThan(height * .79);
        }
      }
    });
  }
});

describe('simultaneous ring picking',()=>{
  it.each([[320,568],[390,844],[432,768]])('keeps both full-size body rings reachable at %ix%i', (width,height)=>{
    const constructors=[['corn',CornGuardian],['carrot',CarrotGuardian],['cabbage',CabbageGuardian],['tomato',TomatoGuardian]] as const;
    for(const [kind,Guardian] of constructors){
      const guardian=new Guardian(),combat=createCombat(7319,kind),camera=makeBattleCamera(width,height);
      guardian.update(combat,true);guardian.root.updateMatrixWorld(true);
      new GuardianFraming(guardian.root, kind).resize(camera);
      for(let round=0;round<48;round++){
        const layouts=[0,1].map(index=>({
          ...projectBodyAnchor(guardian.getAnchor(deterministicBodyAnchor(7319,round,index,2,kind)),camera,width,height),
          index,round,circleId:`${round}:${index}`,diameter:combat.tempo.maxRadiusPx*2,visible:true,
        }));
        // A transparent rectangle or a larger overlapping ring must not
        // intercept the other circle's center on narrow touch screens.
        expect(nearestParryTarget(layouts,layouts[0])?.circleId).toBe(`${round}:0`);
        expect(nearestParryTarget([...layouts].reverse(),layouts[1])?.circleId).toBe(`${round}:1`);
        expect(nearestParryTarget([{...layouts[0],visible:false},layouts[1]],layouts[1])?.circleId).toBe(`${round}:1`);
        expect(nearestParryTarget(layouts,{x:0,y:0})).toBeNull();
      }
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
      guardian.root.traverse(object=>{
        if(object instanceof THREE.Mesh){geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material))}
        if(object instanceof THREE.InstancedMesh)object.dispose();
      });
      geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
    }
  });

  it('excludes resolved/paused layouts and ignores rectangular corners',()=>{
    const layout={index:0,circleId:'ring',round:0,x:100,y:100,diameter:100,visible:true};
    expect(nearestParryTarget([layout],{x:145,y:145})).toBeNull();
    expect(nearestParryTarget([{...layout,visible:false}],{x:100,y:100})).toBeNull();
  });

  it('filters a first-finger result before the next render can update the layouts',()=>{
    let combat=prepareRound(createCombat(7319,'tomato'));
    // Select a deterministic round that actually contains two circles.
    while(combat.targets.length!==2)combat=prepareRound({...combat,round:combat.round+1});
    combat=tickCombat(combat,combat.tempo.telegraphMs);
    const layouts=combat.targets.map((target,index)=>({index,round:combat.round,circleId:target.circleId,x:100+index*30,y:100,diameter:180,visible:true}));
    const first=tapTarget(combat,combat.targets[0].circleId);
    // In the overlap, the remaining target wins even near the old center.
    expect(nearestParryTarget(liveParryLayouts(layouts,first),{x:105,y:100})?.circleId).toBe(combat.targets[1].circleId);
    expect(liveParryLayouts(layouts,{...first,paused:true})).toEqual([]);
    expect(liveParryLayouts(layouts,{...first,phase:'impact'})).toEqual([]);
  });
});
