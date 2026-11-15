/**
 * First-person input. Desktop: click to capture the mouse, WASD / arrows to walk.
 * Phone: left thumb = walk stick, right thumb = drag to look.
 */
export class Controls {
  /** look direction: yaw in radians clockwise from north, pitch up positive */
  yaw = 0;
  pitch = 0;
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
    });
    addEventListener("mousemove", (e) => {
      if (!this.enabled || document.pointerLockElement !== dom) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });

    dom.addEventListener("touchstart", (e) => this.touchStart(e), { passive: false });
    dom.addEventListener("touchmove", (e) => this.touchMove(e), { passive: false });
    dom.addEventListener("touchend", (e) => this.touchEnd(e), { passive: false });
    dom.addEventListener("touchcancel", (e) => this.touchEnd(e), { passive: false });
  }

  private look(dx: number, dy: number) {
    this.yaw += dx;
    this.pitch = Math.min(Math.max(this.pitch - dy, -1.35), 1.35);
  }

  private touchStart(e: TouchEvent) {
    e.preventDefault();
    if (!this.enabled) return;
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
    for (const t of Array.from(e.changedTouches)) {
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
    const k = this.keys;
    const x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const y = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    this.moveX = x / len;
    this.moveY = y / len;
  }

  /** Capture the mouse for looking around (needs a click; a refusal is harmless). */
  capture() {
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
    this.stickId = this.lookId = null;
    this.stickEl.style.display = 'none';
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }
}
