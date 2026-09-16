import * as CANNON from 'cannon-es';

// cannon-es world with a ground plane. Stepped in two 1/120 s substeps per
// 60 Hz simulation frame by main.js so the active ragdoll muscles stay stable.
export class Physics {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -13, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 14;
    this.world.allowSleep = false;
    this.mat = new CANNON.Material('mannequin');
    const groundMat = new CANNON.Material('ground');
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.collisionFilterGroup = 1;
    ground.collisionFilterMask = 0xffff;
    this.world.addBody(ground);
    // feet skate: the root motor moves the body, so the ground only provides support
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.mat, groundMat, { friction: 0.12, restitution: 0.05 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.mat, this.mat, { friction: 0.3, restitution: 0.1 }));
  }
  substep() { this.world.step(1 / 120); }
}
