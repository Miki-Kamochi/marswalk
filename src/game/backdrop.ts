import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

/** User-supplied, unreferenced Z-up STL. Decorative placement, not a geodetic DEM.
 * One source unit = 500 m. Centre the XY footprint and leave the real local terrain exposed.
 */
export async function loadBackdrop(): Promise<THREE.Mesh> {
  const geometry = await new STLLoader().loadAsync(`${import.meta.env.BASE_URL}models/Mars_view.stl`);
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  const cx = (b.min.x+b.max.x)/2, cy = (b.min.y+b.max.y)/2;
  const src = geometry.getAttribute('position');
  const positions: number[] = [];
  for(let i=0;i<src.count;i+=3) {
    const triangle: number[] = [];
    for(let j=0;j<3;j++) {
      const x=(src.getX(i+j)-cx)*500, z=-(src.getY(i+j)-cy)*500;
      const radius=Math.hypot(x,z);
      // Lower the inner transition under the real DEM; keep the supplied skyline.
      const blend=THREE.MathUtils.smoothstep(radius,3500,8500);
      const y=(src.getZ(i+j)-b.min.z)*500*blend-450*(1-blend);
      triangle.push(x,y,z);
    }
    const mx=(triangle[0]+triangle[3]+triangle[6])/3, mz=(triangle[2]+triangle[5]+triangle[8])/3;
    if(Math.hypot(mx,mz)>3500)positions.push(...triangle);
  }
  geometry.dispose();
  const meshGeometry=new THREE.BufferGeometry();
  meshGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  meshGeometry.computeVertexNormals();meshGeometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(meshGeometry,new THREE.MeshStandardMaterial({color:0xb58a6a,roughness:1,flatShading:true,side:THREE.DoubleSide}));
  mesh.name='Mars_view_STL_backdrop';return mesh;
}
