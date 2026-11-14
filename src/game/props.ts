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

/** A sample site: only a ground ring and a collectable rock. */
export function makeSampleSite(index = 0): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.2, 5.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd66b, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  ring.name = "collection-ring";
  const colors = [0x795a47, 0x4e4039, 0x765265];
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), flat(colors[index % colors.length]));
  rock.scale.set(1.15, 0.72, 0.95);
  rock.position.set(-0.35, 0.42, 0.25);
  rock.name = "sample";
  g.add(ring, rock);
  return g;
}

export function setSampleCollected(site: THREE.Group, collected: boolean) {
  site.getObjectByName("sample")!.visible = !collected;
  const material = (site.getObjectByName("collection-ring") as THREE.Mesh).material as THREE.MeshBasicMaterial;
  material.color.setHex(collected ? 0x73d99a : 0xffd66b);
  material.opacity = collected ? 0.22 : 0.7;
}
