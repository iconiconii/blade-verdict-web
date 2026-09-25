import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CombatState } from '../domain/combat';
import { deathFallDurationMs } from '../domain/combat';
import type { BodyAnchorId } from '../domain/v2';
import { verdictMotion } from './verdictMotion';
import { createGuardianRig, guardianPoseFor, type GuardianRig } from './GuardianRig';

const smooth = (value:number) => THREE.MathUtils.smoothstep(Math.max(0, Math.min(1, value)), 0, 1);
type XYZ = [number, number, number];

/**
 * Low-poly corn warrior rebuilt from the reference silhouette.
 *
 * The important rule here is that the cob, husks, limbs and props are real
 * articulated objects. The battle scene can therefore project a parry ring on
 * a hand, knee or shield without making it look like a floating HUD element.
 */
export class CornGuardian {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly leftArm = new THREE.Group();
  readonly rightArm = new THREE.Group();
  readonly anchors:Partial<Record<BodyAnchorId, THREE.Object3D>> = {};
  readonly rig:GuardianRig;

  private actor = new THREE.Group();
  private face = new THREE.Group();
  private topCap = new THREE.Group();
  private huskCloak = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private armSegments:THREE.Group[][] = [];
  private legSegments:THREE.Group[][] = [];
  private materials:THREE.MeshStandardMaterial[] = [];
  private leafGeometry!:THREE.ExtrudeGeometry;
  private eyes:THREE.Group[] = [];
  private brows:THREE.Mesh[] = [];
  private mouth!:THREE.Group;
  private painMouth!:THREE.Mesh;
  private tongue!:THREE.Mesh;
  private shield!:THREE.Group;
  private spatula!:THREE.Group;

  constructor() {
    this.rig = createGuardianRig('corn-guardian-rig');
    this.root.name = 'corn-guardian-3d';
    this.actor.name = 'corn-reaction-rig';
    this.body.name = 'corn-cob-body';
    this.face.name = 'corn-face';
    this.topCap.name = 'corn-top-cap';
    this.huskCloak.name = 'corn-husk-cloak';
    this.leftLeg.name = 'left-knee';
    this.rightLeg.name = 'right-knee';
    this.root.add(this.actor, this.rig.hitProxy);
    this.actor.add(this.body, this.huskCloak, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);

    const kernel = this.material(0xf2ad22, .34);
    const kernelLight = this.material(0xffd34f, .28);
    const kernelShadow = this.material(0xc97816, .44);
    const husk = this.material(0x4d8d35, .7);
    const huskLight = this.material(0x79ae3d, .6);
    const huskDark = this.material(0x24552d, .82);
    const wood = this.material(0x9d5724, .58);
    const woodLight = this.material(0xc37a32, .42);
    const woodDark = this.material(0x4b2919, .78);
    const bronze = this.material(0xd18b35, .34, .42);
    const boot = this.material(0x214632, .78);
    const eyeWhite = this.material(0xfff5d2, .3);
    const eyeDark = this.material(0x121d1b, .24, .05);
    const mouth = this.material(0x21130f, .72);
    const tongue = this.material(0xe95a46, .42);
    const top = this.material(0xffe6a0, .38);
    const anchorTrim = this.material(0xffd56d, .25, .38);

    // A broad, tapered cob is the visual mass. It replaces the old separate
    // head-and-box torso, which made the character read as a tall robot.
    this.body.position.set(0, 1.13, 0);
    const cobProfile = [
      new THREE.Vector2(0, -.76), new THREE.Vector2(.42, -.76),
      new THREE.Vector2(.58, -.56), new THREE.Vector2(.65, -.18),
      new THREE.Vector2(.67, .28), new THREE.Vector2(.61, .67),
      new THREE.Vector2(.48, .98), new THREE.Vector2(.28, 1.15),
      new THREE.Vector2(0, 1.18),
    ];
    const cob = new THREE.LatheGeometry(cobProfile, 18);
    cob.scale(1, 1, .78);
    cob.computeVertexNormals();
    this.mesh(cob, kernelShadow, this.body, 'corn-cob-undercoat');

    const kernelGeometry = new RoundedBoxGeometry(.205, .17, .15, 3, .035);
    const rowWidths = [.35, .48, .56, .6, .58, .5, .41, .28];
    const rowY = [-.58, -.37, -.15, .08, .31, .54, .75, .92];
    for (let row = 0; row < rowY.length; row += 1) {
      const count = row < 2 ? 4 : 5;
      for (let column = 0; column < count; column += 1) {
        const spread = rowWidths[row];
        const x = -spread + (column / (count - 1)) * spread * 2;
        const offset = row % 2 ? .055 : 0;
        const z = .48 + Math.max(0, 1 - Math.abs(x) / (.68 + .001)) * .06;
        const material = (row + column) % 5 === 0 ? kernelLight : kernel;
        const mesh = this.mesh(kernelGeometry, material, this.body, `corn-kernel-${row}-${column}`, [x + offset, rowY[row], z], [1, 1, .92]);
        mesh.rotation.z = ((column % 3) - 1) * .035;
      }
    }

    // The cream top cut is a very legible landmark and gives the head anchor a
    // physical surface to sit on.
    this.topCap.position.set(0, 1.11, 0);
    this.body.add(this.topCap);
    this.mesh(new THREE.CylinderGeometry(.31, .4, .17, 16), top, this.topCap, 'corn-top-cut', [0, 0, .02], [1, 1, .82]);
    this.mesh(new THREE.TorusGeometry(.31, .025, 6, 18), anchorTrim, this.topCap, 'corn-top-rim', [0, -.07, .025], [1, 1, .8]);

    this.buildFace(eyeWhite, eyeDark, mouth, tongue);
    this.buildBelt(bronze, woodDark, kernelLight);

    // Layered leaves create the wide triangular silhouette from the reference.
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(-.24, .04, -.38, .28, -.29, .54);
    leafShape.bezierCurveTo(-.2, .76, -.05, .92, 0, 1.02);
    leafShape.bezierCurveTo(.05, .92, .2, .76, .29, .54);
    leafShape.bezierCurveTo(.38, .28, .24, .04, 0, 0);
    this.leafGeometry = new THREE.ExtrudeGeometry(leafShape, {
      depth: .07, bevelEnabled: true, bevelSize: .018, bevelThickness: .014,
      bevelSegments: 2, curveSegments: 5,
    });
    this.buildLeaves(husk, huskLight, huskDark);

    this.makeArm(this.leftArm, -1, huskDark, kernelLight);
    this.makeArm(this.rightArm, 1, husk, kernel);
    this.makeLeg(this.leftLeg, -1, boot, kernelLight);
    this.makeLeg(this.rightLeg, 1, boot, kernel);
    this.buildSpatula(wood, woodLight, woodDark);
    this.buildShield(wood, woodLight, bronze, woodDark);

    // Small anatomical trims help players identify the target before the ring
    // appears, while staying visually integrated with the costume.
    this.mesh(new THREE.TorusGeometry(.18, .017, 7, 22), anchorTrim, this.leftArm, 'left-shoulder-clasp', [0, -.08, .22], [1, .8, .45]);
    this.mesh(new THREE.TorusGeometry(.18, .017, 7, 22), anchorTrim, this.rightArm, 'right-shoulder-clasp', [0, -.08, .22], [1, .8, .45]);
    this.mesh(new THREE.TorusGeometry(.19, .018, 7, 22), anchorTrim, this.leftLeg, 'left-knee-clasp', [0, -.02, .3], [1, .8, .4]);
    this.mesh(new THREE.TorusGeometry(.19, .018, 7, 22), anchorTrim, this.rightLeg, 'right-knee-clasp', [0, -.02, .3], [1, .8, .4]);

    // Every target is attached to the part it represents, not to the actor
    // origin. BattleScene projects these sockets into the HTML/overlay layer.
    this.addAnchor('head', this.topCap, [0, .02, .35]);
    this.addAnchor('belly', this.body, [0, -.08, .57]);
    this.addAnchor('leftShoulder', this.leftArm, [0, -.05, .2]);
    this.addAnchor('rightShoulder', this.rightArm, [0, -.05, .2]);
    this.addAnchor('leftHand', this.leftArm.getObjectByName('corn-left-hand') ?? this.leftArm, [0, .02, .28]);
    this.addAnchor('rightHand', this.rightArm.getObjectByName('corn-right-hand') ?? this.rightArm, [0, .02, .31]);
    this.addAnchor('leftKnee', this.leftLeg, [0, -.02, .31]);
    this.addAnchor('rightKnee', this.rightLeg, [0, -.02, .31]);

    this.rig.root = this.root;
    this.rig.poseRoot = this.actor;
    this.rig.visualRoot = this.actor;
    this.rig.anchors = this.anchors;
  }

  private material(color:number, roughness:number, metalness = 0) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.materials.push(material);
    return material;
  }

  private mesh(geometry:THREE.BufferGeometry, material:THREE.Material, parent:THREE.Object3D, name:string, position:XYZ = [0, 0, 0], scale:XYZ = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildFace(eyeWhite:THREE.Material, eyeDark:THREE.Material, mouth:THREE.Material, tongue:THREE.Material) {
    this.face.position.set(0, .05, .57);
    this.body.add(this.face);
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.name = side < 0 ? 'corn-eye-left' : 'corn-eye-right';
      eye.position.set(side * .19, .08, .06);
      this.face.add(eye);
      this.mesh(new THREE.SphereGeometry(1, 16, 10), eyeWhite, eye, 'corn-eye-white', [0, 0, 0], [.145, .21, .045]);
      this.mesh(new THREE.SphereGeometry(1, 12, 8), eyeDark, eye, 'corn-eye-pupil', [0, -.02, .045], [.06, .095, .025]);
      this.eyes.push(eye);
      const brow = this.mesh(new RoundedBoxGeometry(.27, .06, .05, 2, .02), eyeDark, this.face, 'corn-brow', [side * .19, .31, .085]);
      brow.rotation.z = side < 0 ? -.25 : .25;
      this.brows.push(brow);
    }

    this.mouth = new THREE.Group();
    this.mouth.name = 'corn-mouth';
    this.face.add(this.mouth);
    this.mesh(new RoundedBoxGeometry(.28, .2, .06, 4, .055), mouth, this.mouth, 'corn-mouth-cavity', [0, -.22, .075]);
    this.tongue = this.mesh(new THREE.SphereGeometry(1, 14, 8), tongue, this.mouth, 'corn-tongue', [0, -.29, .11], [.13, .055, .025]);
    this.mesh(new RoundedBoxGeometry(.17, .035, .025, 2, .01), eyeWhite, this.mouth, 'corn-upper-teeth', [0, -.16, .108]);
    this.painMouth = this.mesh(new THREE.SphereGeometry(1, 16, 10), mouth, this.face, 'corn-pain-mouth', [0, -.22, .082], [.16, .1, .035]);
    this.painMouth.visible = false;
  }

  private buildBelt(bronze:THREE.Material, dark:THREE.Material, jewel:THREE.Material) {
    const belt = new THREE.Group();
    belt.name = 'corn-belt';
    belt.position.set(0, -.49, .02);
    this.body.add(belt);
    const ring = this.mesh(new THREE.TorusGeometry(.54, .045, 8, 24), dark, belt, 'corn-belt-band', [0, 0, 0], [1, 1, .78]);
    ring.rotation.x = Math.PI / 2;
    this.mesh(new THREE.OctahedronGeometry(.14, 0), bronze, belt, 'corn-belt-buckle', [0, 0, .49], [1.2, 1.2, .45]);
    this.mesh(new THREE.OctahedronGeometry(.055, 0), jewel, belt, 'corn-belt-jewel', [0, -.18, .46], [1, 1, .38]);
  }

  private addLeaf(parent:THREE.Object3D, material:THREE.Material, name:string, position:XYZ, scale:XYZ, rotation:XYZ) {
    const leaf = this.mesh(this.leafGeometry, material, parent, name, position, scale);
    leaf.rotation.set(...rotation);
    return leaf;
  }

  private buildLeaves(husk:THREE.Material, light:THREE.Material, dark:THREE.Material) {
    // The cloak begins below the eyes. Keeping it behind the cob's front
    // kernels is important: it should frame the body, never cover the face.
    this.huskCloak.position.set(0, .12, .12);
    const leaves:Array<[THREE.Material, string, XYZ, XYZ, XYZ]> = [
      [dark, 'corn-leaf-back-left', [-.53, .28, -.05], [.7, .84, .9], [.03, -.52, -.17]],
      [dark, 'corn-leaf-back-right', [.53, .28, -.05], [.7, .84, .9], [.03, .52, .17]],
      [husk, 'corn-leaf-front-left', [-.34, .02, .28], [.72, .78, 1], [.01, -.32, -.11]],
      [husk, 'corn-leaf-front-right', [.34, .02, .28], [.72, .78, 1], [.01, .32, .11]],
      [light, 'corn-leaf-skirt-left', [-.44, -.18, .30], [.78, .68, .9], [.08, -.48, -.08]],
      [light, 'corn-leaf-skirt-right', [.44, -.18, .30], [.78, .68, .9], [.08, .48, .08]],
      [dark, 'corn-leaf-skirt-center', [0, -.2, .31], [.66, .62, .85], [0, 0, 0]],
    ];
    leaves.forEach(([material, name, position, scale, rotation]) => this.addLeaf(this.huskCloak, material, name, position, scale, rotation));
  }

  private makeArm(arm:THREE.Group, side:number, sleeve:THREE.Material, palm:THREE.Material) {
    arm.position.set(side * .68, 1.45, .04);
    arm.rotation.z = side * .08;
    const upper = new THREE.Group();
    const forearm = new THREE.Group();
    const hand = new THREE.Group();
    upper.name = 'corn-upper-arm';
    forearm.name = 'corn-forearm';
    hand.name = side < 0 ? 'corn-left-hand' : 'corn-right-hand';
    upper.position.set(0, -.08, 0);
    forearm.position.set(0, -.38, .01);
    hand.position.set(0, -.38, .06);
    arm.add(upper);
    upper.add(forearm);
    forearm.add(hand);
    this.armSegments.push([upper, forearm, hand]);
    this.mesh(new THREE.CapsuleGeometry(.16, .42, 4, 10), sleeve, upper, 'corn-upper-arm-mesh', [0, -.18, 0], [1, 1, .82]);
    this.mesh(new THREE.CapsuleGeometry(.17, .4, 4, 10), palm, forearm, 'corn-forearm-mesh', [0, -.2, .04], [1, 1, .82]);
    this.mesh(new THREE.SphereGeometry(.2, 14, 10), palm, hand, 'corn-palm', [0, 0, .17], [1, .9, .8]);
    for (let finger = -1; finger <= 1; finger += 1) {
      const mesh = this.mesh(new THREE.CapsuleGeometry(.045, .19, 3, 8), palm, hand, 'corn-finger', [finger * .075, -.12, .22], [1, 1, .7]);
      mesh.rotation.x = -.3;
    }
  }

  private makeLeg(leg:THREE.Group, side:number, boot:THREE.Material, kernel:THREE.Material) {
    leg.position.set(side * .31, .47, .02);
    const thigh = new THREE.Group();
    const shin = new THREE.Group();
    const foot = new THREE.Group();
    thigh.name = 'corn-thigh';
    shin.name = 'corn-shin';
    foot.name = 'corn-foot';
    shin.position.set(0, -.36, .02);
    foot.position.set(0, -.3, .1);
    leg.add(thigh);
    thigh.add(shin);
    shin.add(foot);
    this.legSegments.push([thigh, shin, foot]);
    this.mesh(new THREE.CapsuleGeometry(.2, .35, 4, 10), kernel, thigh, 'corn-thigh-mesh', [0, -.08, 0], [1, 1, .86]);
    this.mesh(new RoundedBoxGeometry(.42, .28, .58, 3, .07), boot, shin, 'corn-boot', [0, -.18, .12]);
    this.mesh(new RoundedBoxGeometry(.48, .15, .7, 3, .045), boot, foot, 'corn-foot', [0, -.08, .2]);
  }

  private buildSpatula(wood:THREE.Material, light:THREE.Material, dark:THREE.Material) {
    const hand = this.leftArm.getObjectByName('corn-left-hand');
    if (!hand) return;
    this.spatula = new THREE.Group();
    this.spatula.name = 'corn-wooden-spatula';
    // Keep the prop outside the cob silhouette and slightly toward the camera.
    // The hand remains the attachment point so picking/impact sockets stay
    // anatomical, while the blade reads as a weapon instead of body detail.
    this.spatula.position.set(-.18, .02, .48);
    this.spatula.rotation.z = .28;
    hand.add(this.spatula);
    this.mesh(new THREE.CylinderGeometry(.045, .06, .95, 8), wood, this.spatula, 'spatula-handle', [0, .46, 0]);
    const shape = new THREE.Shape();
    shape.moveTo(-.24, 0); shape.lineTo(.24, 0); shape.lineTo(.28, .48);
    shape.lineTo(.18, .65); shape.lineTo(-.18, .65); shape.lineTo(-.28, .48); shape.closePath();
    this.mesh(new THREE.ExtrudeGeometry(shape, { depth: .1, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 2 }), light, this.spatula, 'spatula-blade', [0, .78, 0]);
    for (const x of [-.11, 0, .11]) this.mesh(new RoundedBoxGeometry(.045, .35, .025, 2, .01), dark, this.spatula, 'spatula-groove', [x, 1.08, .065]);
  }

  private buildShield(wood:THREE.Material, light:THREE.Material, bronze:THREE.Material, dark:THREE.Material) {
    const hand = this.rightArm.getObjectByName('corn-right-hand');
    if (!hand) return;
    this.shield = new THREE.Group();
    this.shield.name = 'corn-round-shield';
    this.shield.position.set(.01, -.01, .2);
    this.shield.rotation.x = Math.PI / 2;
    hand.add(this.shield);
    this.mesh(new THREE.CylinderGeometry(.35, .35, .12, 16), dark, this.shield, 'shield-back');
    this.mesh(new THREE.CylinderGeometry(.31, .31, .13, 16), wood, this.shield, 'shield-face', [0, 0, .01]);
    this.mesh(new THREE.TorusGeometry(.32, .035, 8, 24), light, this.shield, 'shield-rim', [0, 0, .08]);
    this.mesh(new THREE.CylinderGeometry(.11, .11, .12, 12), bronze, this.shield, 'shield-boss', [0, 0, .1]);
    this.mesh(new THREE.TorusGeometry(.2, .015, 6, 20), bronze, this.shield, 'shield-inlay', [0, 0, .095]);
  }

  private addAnchor(id:BodyAnchorId, parent:THREE.Object3D, position:XYZ) {
    const anchor = new THREE.Object3D();
    anchor.name = `parry-anchor-${id}`;
    anchor.position.set(...position);
    parent.add(anchor);
    this.anchors[id] = anchor;
    this.rig.fxSockets[id] = anchor;
  }

  getAnchor(id:BodyAnchorId) {
    return this.anchors[id] ?? this.body;
  }

  update(state:CombatState, reducedMotion = false) {
    const { phase, elapsed, feedback } = state;
    const pain = verdictMotion(state, reducedMotion);
    const breakWeight = pain.weight;
    const feedbackAge = feedback ? Math.max(0, state.time - feedback.time) : Infinity;
    const success = (feedback?.kind === 'Nice' || feedback?.kind === 'Perfect') && feedbackAge < 680;
    const perfect = success && feedback?.kind === 'Perfect';
    const defeated = state.battle.bossHp <= 0;
    const t = state.time / 1000;
    const charge = phase === 'telegraph' ? smooth(elapsed / state.tempo.telegraphMs) : phase === 'targetActive' ? 1 - smooth(elapsed / 360) : 0;
    const recoil = success ? Math.sin(Math.min(feedbackAge / (perfect ? 680 : 460), 1) * Math.PI) : 0;
    const tremor = perfect && !reducedMotion ? Math.sin(t * 72) * .032 * Math.max(0, 1 - feedbackAge / 680) : 0;
    const death = defeated ? smooth(feedbackAge / deathFallDurationMs) : 0;
    const slump = breakWeight + (defeated ? 1 - death : 0);
    const idle = reducedMotion ? 0 : 1;

    this.rig.root.userData.guardianPose = guardianPoseFor(state, pain.x, pain.y, pain.compression);
    // The actor is the only placement that moves. Hit testing remains stable,
    // while all visible parts still share the same forward collapse.
    this.actor.position.set(tremor + pain.x * .025, -death * .08, -recoil * (perfect ? .18 : .1) + death * .18);
    this.actor.rotation.set(-charge * .07 + recoil * (perfect ? .2 : .1) - slump * .035 - pain.y * .05 + death * .92,
      tremor * .5 + pain.x * .08, death * .15 - pain.x * .06);
    this.actor.scale.set(1 + death * .08, 1 - death * .16, 1);

    this.body.position.y = 1.13 + Math.sin(t * 2.1) * .018 * idle * (1 - breakWeight) + pain.breath * .008 - death * .15;
    this.body.rotation.set(-slump * .04 + pain.energy * .06 + death * .24, 0, -pain.x * .035);
    this.body.scale.set(1 - charge * .02 + pain.compression * .04 + death * .12,
      1 + charge * .04 - pain.compression * .08 - death * .22,
      1 - charge * .01);
    this.face.rotation.set(death * .38, 0, -pain.followX * .04);
    this.face.position.y = .05 - death * .13;
    this.topCap.rotation.set(death * .28 + pain.followY * .06, 0, -pain.followX * .08);
    this.huskCloak.rotation.set(-charge * .03 + death * .32, 0, pain.followX * .05);
    this.huskCloak.scale.set(1 + breakWeight * .05 + death * .12, 1 - breakWeight * .025 - death * .24, 1);

    // Parent-child rotations keep the spatula and shield attached to the hands.
    this.leftArm.rotation.set(-charge * .5 + recoil * (perfect ? .3 : .17) + breakWeight * .16 + death * .7,
      0, -.1 - charge * .14 - pain.followX * .16 - death * .18);
    this.rightArm.rotation.set(-charge * .35 - breakWeight * .12 + death * .62,
      0, .1 + recoil * (perfect ? .28 : .14) + breakWeight * .08 + pain.followX * .15 + death * .18);
    this.armSegments.forEach((segments, index) => {
      const side = index === 0 ? -1 : 1;
      segments[0].rotation.set(-charge * .18 + pain.followY * .08 + death * .2, 0, side * breakWeight * .05);
      segments[1].rotation.set(death * (.28 + index * .08) + pain.followX * .05, 0, 0);
      segments[2].rotation.set(death * .42 + pain.followY * .04, 0, side * death * .12);
    });

    // Weapon-specific follow-through. The hand leads, the long wooden blade
    // lags behind it, then rebounds on a successful parry. Everything is
    // written from the rest pose each frame so repeated attacks never drift.
    const weaponWindup = phase === 'telegraph' ? charge : phase === 'targetActive' ? .72 + Math.sin(t * 3.2) * .025 : 0;
    const weaponHit = success ? recoil : feedback?.kind === 'Miss' && feedbackAge < 420 ? Math.sin(Math.min(feedbackAge / 420, 1) * Math.PI) : 0;
    const weaponDrop = breakWeight * .42;
    this.spatula.position.set(
      -.18 - weaponWindup * .1 - death * .28,
      .02 + weaponWindup * .05 - weaponDrop * .04 - death * .28,
      .48 + weaponWindup * .08 - death * .14,
    );
    this.spatula.rotation.set(
      -.04 + weaponWindup * .08 + weaponHit * (perfect ? .12 : .06) + death * .42,
      weaponWindup * .08 + pain.followX * .04,
      .28 - weaponWindup * .72 - weaponHit * (perfect ? .82 : .42) + weaponDrop + death * 1.08,
    );
    this.spatula.scale.set(1 + weaponHit * .035, 1 + weaponHit * .025, 1);

    this.leftLeg.rotation.set(breakWeight * .12 - death * .92, 0, -charge * .05 - death * .08);
    this.rightLeg.rotation.set(breakWeight * .1 - death * 1.02, 0, charge * .05 + death * .08);
    this.legSegments.forEach((segments, index) => {
      segments[0].rotation.x = -death * (.16 + index * .03);
      segments[1].rotation.x = -death * (.46 + index * .08);
      segments[2].rotation.x = -death * .24;
    });

    const expression = defeated ? 1 : pain.pain;
    this.eyes.forEach((eye, index) => {
      eye.scale.y = 1 - expression * .55;
      eye.rotation.z = (index === 0 ? -1 : 1) * expression * .16;
    });
    this.brows.forEach((brow, index) => {
      brow.rotation.z = (index === 0 ? -.25 : .25) + (index === 0 ? -1 : 1) * expression * .42;
    });
    this.mouth.visible = !defeated && pain.pain < .1;
    this.painMouth.visible = !defeated && pain.pain >= .1;
    this.tongue.visible = this.mouth.visible;
    this.painMouth.scale.set(.16, .08 + .06 * pain.pain, .035);

    const flash = Math.max(pain.flash, success ? Math.max(0, (perfect ? .95 : .35) - feedbackAge / 220) : 0);
    for (const material of this.materials) {
      material.emissive.setHex(0xffffff);
      material.emissiveIntensity = flash;
    }
  }
}
