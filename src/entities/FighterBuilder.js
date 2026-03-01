import * as THREE from 'three';

/**
 * Builds a procedural fighter with joint hierarchy:
 * root (hips)
 *   ├─ torso
 *   │   ├─ head
 *   │   ├─ upperArmL → lowerArmL → handL (weapon attach)
 *   │   └─ upperArmR → lowerArmR → handR
 *   ├─ upperLegL → lowerLegL
 *   └─ upperLegR → lowerLegR
 */
export class FighterBuilder {
  static build(color, isP2 = false) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.1,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.6),
      roughness: 0.7,
      metalness: 0.1,
    });

    const joints = {};

    // Root (hips level)
    const root = new THREE.Group();
    root.position.y = 0.9;

    // Hips
    const hipsGeo = new THREE.BoxGeometry(0.35, 0.15, 0.2);
    const hips = new THREE.Mesh(hipsGeo, darkMat);
    root.add(hips);
    joints.hips = root;

    // Torso
    const torso = new THREE.Group();
    torso.position.y = 0.1;
    root.add(torso);

    const torsoGeo = new THREE.BoxGeometry(0.3, 0.4, 0.18);
    torsoGeo.translate(0, 0.2, 0);
    const torsoMesh = new THREE.Mesh(torsoGeo, mat);
    torso.add(torsoMesh);
    joints.torso = torso;

    // Head
    const head = new THREE.Group();
    head.position.y = 0.45;
    torso.add(head);

    const headGeo = new THREE.SphereGeometry(0.1, 8, 6);
    headGeo.translate(0, 0.1, 0);
    const headMesh = new THREE.Mesh(headGeo, mat);
    head.add(headMesh);
    joints.head = head;

    // Arms
    const armSide = isP2 ? -1 : 1; // Weapon hand side
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;

      // Upper arm
      const upperArm = new THREE.Group();
      upperArm.position.set(sign * 0.22, 0.38, 0);
      torso.add(upperArm);

      const uaGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.25, 6);
      uaGeo.translate(0, -0.125, 0);
      const uaMesh = new THREE.Mesh(uaGeo, mat);
      upperArm.add(uaMesh);
      joints[`upperArm${side}`] = upperArm;

      // Lower arm
      const lowerArm = new THREE.Group();
      lowerArm.position.y = -0.25;
      upperArm.add(lowerArm);

      const laGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.22, 6);
      laGeo.translate(0, -0.11, 0);
      const laMesh = new THREE.Mesh(laGeo, darkMat);
      lowerArm.add(laMesh);
      joints[`lowerArm${side}`] = lowerArm;

      // Hand
      const hand = new THREE.Group();
      hand.position.y = -0.22;
      lowerArm.add(hand);

      const handGeo = new THREE.SphereGeometry(0.025, 6, 4);
      const handMesh = new THREE.Mesh(handGeo, mat);
      hand.add(handMesh);
      joints[`hand${side}`] = hand;
    }

    // Legs
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;

      // Upper leg
      const upperLeg = new THREE.Group();
      upperLeg.position.set(sign * 0.1, -0.05, 0);
      root.add(upperLeg);

      const ulGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.35, 6);
      ulGeo.translate(0, -0.175, 0);
      const ulMesh = new THREE.Mesh(ulGeo, darkMat);
      upperLeg.add(ulMesh);
      joints[`upperLeg${side}`] = upperLeg;

      // Lower leg
      const lowerLeg = new THREE.Group();
      lowerLeg.position.y = -0.35;
      upperLeg.add(lowerLeg);

      const llGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.35, 6);
      llGeo.translate(0, -0.175, 0);
      const llMesh = new THREE.Mesh(llGeo, mat);
      lowerLeg.add(llMesh);
      joints[`lowerLeg${side}`] = lowerLeg;
    }

    // Add shadow casting to all meshes
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return { root, joints };
  }
}
