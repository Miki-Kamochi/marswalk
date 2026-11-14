/** Placeholder low-poly objects (original, built from primitives). Replaced with nicer models later. */
import * as THREE from "three";

const flat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Pressurised rover: the astronaut's home during the EVA. About 5 m long. */
export function makeRover(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 4.6), flat(0xe8e4dc));
  body.position.y = 1.75;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.6, 6), flat(0xd9d4ca));
  cab.rotation.x = Math.PI / 2;
  cab.position.set(0, 1.75, -2.9);
  const window_ = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.1), flat(0x1c2a3a));
  window_.position.set(0, 2.0, -3.72);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.25, 4.64), flat(0xd8572a));
  stripe.position.y = 1.3;
  g.add(body, cab, window_, stripe);
  for (const x of [-1.55, 1.55]) {
    for (const z of [-2.2, 0, 2.2]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 8), flat(0x33302c));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.62, z);
      g.add(wheel);
    }
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), flat(0x888888));
  mast.position.set(0.9, 3.7, 1.6);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, fog: false }));
  lamp.position.set(0.9, 4.9, 1.6);
  g.add(mast, lamp);
  return g;
}

/** A sample site: a small flag and a ring on the ground. */
export function makeSampleSite(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), flat(0xdddddd));
  pole.position.y = 1.1;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.03), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  flag.position.set(0.36, 1.95, 0);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.0, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), flat(0x6a5560));
  rock.position.set(-0.6, 0.3, 0.5);
  rock.name = "sample";
  g.add(pole, flag, ring, rock);
  return g;
}
