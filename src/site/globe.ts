/**
 * Home-screen Mars: a low-poly globe, each facet coloured from the Viking colour mosaic, lit from
 * the side so a night half shows. It is drawn at a fraction of the screen resolution and scaled up
 * with crisp pixels, the same faceted look as the terrain in the walk preview, kept subtle.
 * Gale Crater is marked; drag to turn the planet.
 */
import * as THREE from "three";

const GALE = { lat: -5.4, lon: 137.8 };
const D2R = Math.PI / 180;

/** unit-sphere point: lon 0 faces +z (the camera), east is +x */
const toXYZ = (lat: number, lon: number, r = 1) =>
  new THREE.Vector3(r * Math.cos(lat * D2R) * Math.sin(lon * D2R), r * Math.sin(lat * D2R), r * Math.cos(lat * D2R) * Math.cos(lon * D2R));

export class Globe {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private spin = new THREE.Group();
  private marker: THREE.Mesh;
  private yaw = 0;
  private vel = 0;
  private dragging = false;
  private lastX = 0;
  private t0 = performance.now();
  /** called every frame with Gale Crater's screen position (CSS px) and how much it faces us (0..1) */
  onSpot: ((x: number, y: number, facing: number) => void) | null = null;
  private tmpV = new THREE.Vector3();
  private tmpN = new THREE.Vector3();

  private constructor(
    private host: HTMLElement,
    private pixel: number,
    private still: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.spin.rotation.z = 25.2 * D2R * 0.35; // a hint of Mars's axial tilt
    this.scene.add(this.spin);

    // light from the right and a little behind: a lit crescent, the rest in night
    const sun = new THREE.DirectionalLight(0xfff1e0, 4.4);
    sun.position.set(2.4, 0.9, 1.5);
    this.scene.add(sun, new THREE.AmbientLight(0x7a6050, 1.1));

    // thin warm rim of atmosphere
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 48, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: { uSun: { value: sun.position.clone().normalize() } },
        vertexShader: `varying vec3 vN; varying vec3 vW;
          void main(){ vN = normalize(normalMatrix * normal); vW = normalize((modelMatrix * vec4(position,1.)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
        fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
          void main(){ float edge = pow(1. - abs(vN.z), 3.); float lit = smoothstep(-0.3, 0.6, dot(vW, uSun));
          gl_FragColor = vec4(vec3(1., .55, .3), edge * (0.4 + 0.6 * lit) * .75); }`,
      }),
    );
    this.scene.add(rim);

    // Gale Crater: a small bright square that sits on the surface
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.045), new THREE.MeshBasicMaterial({ color: 0xff6b2c }));
    const p = toXYZ(GALE.lat, GALE.lon, 1.004);
    this.marker.position.copy(p);
    this.marker.lookAt(p.clone().multiplyScalar(2));
    this.spin.add(this.marker);
    // start with Gale on the lit side, a little right of centre
    this.yaw = (-GALE.lon + 40) * D2R;

    this.addStars();
    this.resize();
    if (!still) this.bindDrag();
  }

  static async create(host: HTMLElement, texUrl: string, still: boolean): Promise<Globe> {
    const g = new Globe(host, innerWidth < 720 ? 2 : 3, still);
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error(`cannot load ${texUrl}`));
      i.src = texUrl;
    });
    g.addPlanet(img);
    return g;
  }

  /** low-poly sphere; each triangle takes the mosaic colour at its centre */
  private addPlanet(img: HTMLImageElement): void {
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const sample = (lat: number, lon: number) => {
      // average a small patch so one facet does not pick up a single noisy pixel
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      const cx = ((lon + 180) / 360) * cv.width;
      const cy = ((90 - lat) / 180) * cv.height;
      for (let dy = -3; dy <= 3; dy += 3)
        for (let dx = -3; dx <= 3; dx += 3) {
          const x = (Math.floor(cx + dx) + cv.width) % cv.width;
          const y = Math.min(cv.height - 1, Math.max(0, Math.floor(cy + dy)));
          const i = (y * cv.width + x) * 4;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          n++;
        }
      return [r / n / 255, g / n / 255, b / n / 255];
    };

    const geo = new THREE.IcosahedronGeometry(1, 24); // ~12,500 facets: faceted, still recognisable
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Vector3();
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i + k));
      c.normalize();
      const lat = Math.asin(c.y) / D2R;
      const lon = Math.atan2(c.x, c.z) / D2R;
      const [r, g, b] = sample(lat, lon);
      tmp.setRGB(r, g, b, THREE.SRGBColorSpace);
      for (let k = 0; k < 3; k++) tmp.toArray(col, (i + k) * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const planet = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.spin.add(planet);
  }

  /** two layers of pixel stars: many faint ones, a few bright ones that slowly twinkle */
  private stars: THREE.PointsMaterial[] = [];
  private addStars(): void {
    const layer = (n: number, size: number, opacity: number, color: number) => {
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(Math.random() * 2.4 - 1.2, Math.random() * 1.6 - 0.8, -1).normalize().multiplyScalar(40);
        v.toArray(a, i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(a, 3));
      const m = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false });
      this.scene.add(new THREE.Points(g, m));
      this.stars.push(m);
    };
    layer(420, 1, 0.85, 0xe6dccf);
    layer(46, 2, 1, 0xfff4e6);
  }

  private bindDrag(): void {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const d = (e.clientX - this.lastX) * 0.006;
      this.lastX = e.clientX;
      this.yaw += d;
      this.vel = d;
    });
    const up = () => (this.dragging = false);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  /**
   * Size the globe to the screen and report its diameter and centre to CSS (--globe-d, --globe-y),
   * so the title words and the search box can be laid out around it.
   */
  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.pixel = w < 720 ? 2 : 3;
    // draw at 1/pixel of the CSS size; CSS scales it back up with crisp pixels
    this.renderer.setPixelRatio(1 / this.pixel);
    this.renderer.setSize(w, h, true);
    // the globe fills the space between the top bar and the cards above the search bar,
    // and leaves room for "Ares" and "Sight" on either side (on phones the title sits above)
    const phone = w < 720;
    const top = phone ? 130 : 64;
    const below = phone ? 330 : 274;
    const font = Math.min(124, Math.max(46, 0.075 * w));
    const sideRoom = phone ? w - 40 : w - 2 * (2.8 * font + 32 + 24);
    const d = Math.max(160, Math.min(h - below - top - 8, sideRoom));
    const cy = top + (h - below - top) / 2;
    const half = h / d; // world units from the screen centre to its top edge (radius 1 = d/2 px)
    const lift = ((h / 2 - cy) * 2) / d;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.position.set(0, -lift, half / Math.tan((this.camera.fov / 2) * D2R));
    this.camera.lookAt(0, -lift, 0);
    this.camera.updateProjectionMatrix();
    const root = document.documentElement.style;
    root.setProperty("--globe-d", `${Math.round(d)}px`);
    root.setProperty("--globe-y", `${Math.round(cy)}px`);
    root.setProperty("--title-size", `${Math.round(font)}px`);
  }

  frame(now: number): void {
    if (!this.still && !this.dragging) {
      this.vel *= 0.95;
      this.yaw += this.vel + 0.0006; // one turn in about three minutes
    }
    const t = (now - this.t0) / 1000;
    this.spin.rotation.y = this.yaw;
    const pulse = this.still ? 1 : 0.85 + 0.35 * Math.abs(Math.sin(t * 1.6));
    this.marker.scale.setScalar(pulse);
    if (!this.still) this.stars[1].opacity = 0.75 + 0.25 * Math.sin(t * 0.9);
    this.renderer.render(this.scene, this.camera);
    if (this.onSpot) {
      this.marker.getWorldPosition(this.tmpV);
      this.tmpN.copy(this.tmpV).normalize();
      const facing = this.tmpN.dot(this.tmpV.clone().sub(this.camera.position).normalize().negate());
      this.tmpV.project(this.camera);
      const el = this.renderer.domElement;
      this.onSpot(((this.tmpV.x + 1) / 2) * el.clientWidth, ((1 - this.tmpV.y) / 2) * el.clientHeight, facing);
    }
  }
}
