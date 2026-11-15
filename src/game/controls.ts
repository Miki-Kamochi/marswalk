import * as THREE from "three";

/**
 * How the walk is viewed:
 * - fpv: the screen is a window, the mouse or a thumb turns the view;
 * - ar: the phone is the window, turning it turns the view (its motion sensor), touch to walk;
 * - vr: the same, drawn once per eye for a phone in a VR headset case (a mock-up for now).
 */
export type ViewMode = "fpv" | "ar" | "vr";

const DEG = Math.PI / 180;
// the phone's motion sensor angles to a camera rotation (as three.js's DeviceOrientationControls)
const SENSOR_TILT = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about x
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const sensorEuler = new THREE.Euler();
const sensorQuat = new THREE.Quaternion();
const screenQuat = new THREE.Quaternion();
const lookEuler = new THREE.Euler();

/**
 * First-person input. Desktop: click to capture the mouse, WASD / arrows to walk.
 * Phone: left thumb = walk stick, right thumb = drag to look.
 * AR / VR: the phone's motion sensor turns the view; holding a finger on the screen walks forward.
 */
export class Controls {
  /** look direction: yaw in radians clockwise from north, pitch up positive */
  yaw = 0;
  pitch = 0;
  /** head tilt to the side (only from the motion sensor) */
  roll = 0;
  mode: ViewMode = "fpv";
  /** true once the motion sensor has reported (false on most laptops) */
  motion = false;
  /** walk input: x = strafe right, y = forward, each -1..1 */
  moveX = 0;
  moveY = 0;
  readonly touch = matchMedia("(pointer: coarse)").matches;
  enabled = false;
  /** called on M / the map button */
  onMap: () => void = () => {};
  onScan: () => void = () => {};
  /** called on Escape to leave the walking simulation */
  onMenu: () => void = () => {};
  mapOpen = false;

  private keys = new Set<string>();
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private stickEl: HTMLElement;
  private knobEl: HTMLElement;
  /** sensor heading -> walk heading (the sensor's north is arbitrary, so "ahead" is set on start) */
  private yawOffset = 0;
  private recentreNext = true;
  private holdId: number | null = null;
  private mouseHold = false;
  private listening = false;
  private askOnTouch = false;

  constructor(private dom: HTMLElement) {
    this.stickEl = document.getElementById("stick")!;
    this.knobEl = document.getElementById("knob")!;
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Escape") { e.preventDefault(); this.onMenu(); return; }
      if (!this.enabled) return;
      if (e.code === "KeyE" || e.code === "Space") this.onScan();
      if (e.code === "KeyM") { e.preventDefault(); this.onMap(); }
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());

    dom.addEventListener("click", () => {
      if (this.enabled && !this.touch && document.pointerLockElement !== dom) this.capture();
    });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('mousedown', e => {
      if (e.button === 2 && this.enabled) { e.preventDefault(); this.onScan(); }
      // AR / VR on a laptop: hold the left button to walk, like holding a finger on the phone
      if (e.button === 0 && this.mode !== "fpv") this.mouseHold = true;
    });
    addEventListener("mouseup", (e) => { if (e.button === 0) this.mouseHold = false; });
    addEventListener("mousemove", (e) => {
      if (!this.enabled || document.pointerLockElement !== dom) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });

    dom.addEventListener("touchstart", (e) => this.touchStart(e), { passive: false });
    dom.addEventListener("touchmove", (e) => this.touchMove(e), { passive: false });
    dom.addEventListener("touchend", (e) => this.touchEnd(e), { passive: false });
    dom.addEventListener("touchcancel", (e) => this.touchEnd(e), { passive: false });
  }

  /**
   * Switch the view mode. Call from a tap or click: iPhone asks for the motion sensor only then.
   * Resolves false if the sensor was refused.
   */
  async setMode(mode: ViewMode, gesture = true): Promise<boolean> {
    this.mode = mode;
    this.roll = 0;
    if (mode === "fpv") this.pitch = 0;
    this.recentre();
    if (mode === "fpv") return true;
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    let ok = true;
    if (ask && !gesture) {
      // iPhone: the permission prompt needs a tap; the first touch asks (see touchEnd)
      this.askOnTouch = true;
      return true;
    }
    if (ask) {
      try {
        ok = (await ask()) === "granted";
      } catch {
        ok = false;
      }
    }
    if (ok && !this.listening) {
      addEventListener("deviceorientation", this.onOrient);
      this.listening = true;
    }
    return ok;
  }

  /** Make the way the phone points now count as the current walk heading. */
  recentre() {
    this.recentreNext = true;
  }

  /** Turn the walk heading (the storm's unnoticed veer), in any mode. */
  turn(d: number) {
    this.yaw += d;
    this.yawOffset += d;
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    if (this.mode === "fpv" || e.alpha === null || e.beta === null || e.gamma === null) return;
    this.motion = true;
    const angle = screen.orientation?.angle ?? Number((window as unknown as { orientation?: number }).orientation ?? 0);
    sensorEuler.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, "YXZ");
    sensorQuat.setFromEuler(sensorEuler).multiply(SENSOR_TILT).multiply(screenQuat.setFromAxisAngle(Z_AXIS, -angle * DEG));
    lookEuler.setFromQuaternion(sensorQuat, "YXZ");
    const raw = -lookEuler.y;
    if (this.recentreNext) {
      this.yawOffset = this.yaw - raw;
      this.recentreNext = false;
    }
    this.yaw = raw + this.yawOffset;
    this.pitch = lookEuler.x;
    this.roll = lookEuler.z;
  };

  private look(dx: number, dy: number) {
    this.yaw += dx;
    this.pitch = Math.min(Math.max(this.pitch - dy, -1.35), 1.35);
  }

  private touchStart(e: TouchEvent) {
    e.preventDefault();
    if (!this.enabled) return;
    if (this.mode !== "fpv") {
      // AR / VR: a finger anywhere on the screen walks forward
      if (this.holdId === null) this.holdId = e.changedTouches[0].identifier;
      return;
    }
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < innerWidth * 0.45 && this.stickId === null) {
        this.stickId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stickEl.style.display = "block";
        this.stickEl.style.left = `${t.clientX - 60}px`;
        this.stickEl.style.top = `${t.clientY - 60}px`;
        this.knobEl.style.transform = "translate(0px, 0px)";
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private touchMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        let dx = (t.clientX - this.stickOrigin.x) / 50;
        let dy = (t.clientY - this.stickOrigin.y) / 50;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
        this.moveX = dx;
        this.moveY = -dy;
        this.knobEl.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      } else if (t.identifier === this.lookId) {
        this.look((t.clientX - this.lookLast.x) * 0.006, (t.clientY - this.lookLast.y) * 0.006);
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private touchEnd(e: TouchEvent) {
    e.preventDefault();
    if (this.askOnTouch && this.mode !== "fpv") {
      this.askOnTouch = false;
      void this.setMode(this.mode);
    }
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.holdId) this.holdId = null;
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.moveX = this.moveY = 0;
        this.stickEl.style.display = "none";
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  /** Read keyboard state into moveX / moveY (touch sets them directly). */
  update() {
    if (!this.enabled) { this.moveX = this.moveY = 0; return; }
    if (this.stickId !== null) return;
    if (this.mode !== "fpv" && (this.holdId !== null || this.mouseHold)) {
      this.moveX = 0;
      this.moveY = 1;
      return;
    }
    const k = this.keys;
    const x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const y = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    this.moveX = x / len;
    this.moveY = y / len;
  }

  /** Capture the mouse for looking around (needs a click; a refusal is harmless). */
  capture() {
    // with the motion sensor the phone itself is the view: no mouse capture
    if (this.mode !== "fpv" && this.motion) return;
    try {
      const p = this.dom.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* not allowed right now: the next click will try again */
    }
  }

  release() {
    this.keys.clear();
    this.moveX = this.moveY = 0;
    this.stickId = this.lookId = this.holdId = null;
    this.mouseHold = false;
    this.stickEl.style.display = 'none';
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }
}
