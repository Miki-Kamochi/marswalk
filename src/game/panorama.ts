import * as THREE from 'three';

/** Five overlapping stereo wedges. These are actual rendered views of the scene.
 * The displayed strip uses left images; idealized stereo/orthoprojection is in Nav.observe.
 */
export class Panorama {
  readonly canvas = document.createElement('canvas');
  private target = new THREE.WebGLRenderTarget(256, 192);
  private camera = new THREE.PerspectiveCamera(62, 256 / 192, 0.15, 400000);
  private pixels = new Uint8Array(256 * 192 * 4);
  private tile = document.createElement('canvas');
  pairs = 0;
  constructor() { this.canvas.width = 1280; this.canvas.height = 192; this.tile.width = 256; this.tile.height = 192; }
  reset() { this.pairs = 0; this.canvas.getContext('2d')!.clearRect(0, 0, 1280, 192); }
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, position: THREE.Vector3) {
    const yaw = this.pairs * 2 * Math.PI / 5;
    const previous = renderer.getRenderTarget();
    try {
      this.camera.rotation.set(-0.25, -yaw, 0, 'YXZ');
      for (const eye of [-1, 1]) {
        this.camera.position.copy(position).add(new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(eye * 0.12));
        renderer.setRenderTarget(this.target);
        renderer.render(scene, this.camera);
        renderer.readRenderTargetPixels(this.target, 0, 0, 256, 192, this.pixels);
        if (eye === -1) {
          const data = new ImageData(256, 192);
          for (let row = 0; row < 192; row++) data.data.set(this.pixels.subarray((191-row)*1024, (192-row)*1024), row*1024);
          this.tile.getContext('2d')!.putImageData(data, 0, 0);
          this.canvas.getContext('2d')!.drawImage(this.tile, this.pairs * 256, 0);
        }
      }
      this.pairs++;
    } finally { renderer.setRenderTarget(previous); }
  }
}
