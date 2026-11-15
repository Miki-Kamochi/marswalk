/**
 * Step-by-step pages (Introduction, How it works): one idea per screen, like a lesson.
 *
 * Markup: <main class="deck"> holds <section class="slide" data-slide="id"> blocks. Elements marked
 * data-reveal inside a slide appear one at a time on "next" before the deck moves on.
 * Keys: → / Space / PageDown next, ← / PageUp back, Home / End, F full screen. #n in the address
 * opens slide n (handy while presenting). Swipe works on touch, except on [data-interactive].
 */
import { tr } from "./lang";

export interface SlideCtx {
  el: HTMLElement;
  /** false once the slide has been left (stop animations then) */
  alive(): boolean;
  /** the "try it" part is done: make the next button glow */
  done(): void;
  /** the user asked for reduced motion: show final states at once */
  reduced: boolean;
  /** wait, resolving false if the slide was left meanwhile */
  wait(ms: number): Promise<boolean>;
  /** run fn every animation frame until it returns false or the slide is left */
  frames(fn: (t: number) => boolean | void): Promise<void>;
}

export interface Slide {
  /** called when the slide is shown; may return a cleanup */
  enter?(ctx: SlideCtx): void | (() => void) | Promise<void>;
  /** the i-th data-reveal element was just shown */
  reveal?(i: number, ctx: SlideCtx): void;
}

export function startDeck(slides: Record<string, Slide>): void {
  const deck = document.querySelector<HTMLElement>("main.deck")!;
  const els = Array.from(deck.querySelectorAll<HTMLElement>(".slide"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = -1;
  let gen = 0;
  let cleanup: (() => void) | void = undefined;
  let ctx: SlideCtx | null = null;

  // ------------------------------------------------------------ the bar at the bottom
  const bar = document.createElement("nav");
  bar.className = "deckbar";
  bar.setAttribute("aria-label", "Slides");
  bar.innerHTML = `
    <button class="db-prev" type="button" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
    <div class="db-dots" role="tablist">${els.map((_, i) => `<button type="button" role="tab" data-go="${i}" aria-label="${i + 1}"></button>`).join("")}</div>
    <span class="db-count" aria-live="polite"></span>
    <button class="db-full" type="button" aria-label="Full screen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg></button>
    <button class="db-next" type="button"><span class="lbl"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>`;
  document.body.appendChild(bar);
  const nextBtn = bar.querySelector<HTMLButtonElement>(".db-next")!;
  const prevBtn = bar.querySelector<HTMLButtonElement>(".db-prev")!;
  const count = bar.querySelector<HTMLElement>(".db-count")!;
  const dots = Array.from(bar.querySelectorAll<HTMLButtonElement>("[data-go]"));

  const pending = () => (index >= 0 ? Array.from(els[index].querySelectorAll<HTMLElement>("[data-reveal]:not(.shown)")) : []);
  function renderBar() {
    const last = index === els.length - 1 && !pending().length;
    nextBtn.querySelector(".lbl")!.textContent = last ? tr("Done", "おわり") : tr("Next", "次へ");
    nextBtn.disabled = last;
    prevBtn.disabled = index === 0;
    count.textContent = `${index + 1} / ${els.length}`;
    dots.forEach((d, i) => {
      d.classList.toggle("on", i === index);
      d.classList.toggle("seen", i < index);
      d.setAttribute("aria-selected", String(i === index));
    });
  }

  function go(i: number, dir = 1) {
    i = Math.max(0, Math.min(els.length - 1, i));
    if (i === index) return;
    if (typeof cleanup === "function") cleanup();
    cleanup = undefined;
    const prev = els[index];
    if (prev) {
      prev.classList.remove("on", "from-left", "from-right");
      prev.setAttribute("aria-hidden", "true");
      prev.inert = true;
    }
    index = i;
    const el = els[i];
    el.querySelectorAll("[data-reveal]").forEach((r) => r.classList.remove("shown"));
    el.classList.remove("from-left", "from-right");
    el.classList.add("on", dir > 0 ? "from-right" : "from-left");
    el.removeAttribute("aria-hidden");
    el.inert = false;
    nextBtn.classList.remove("ready");
    history.replaceState(null, "", `#${i + 1}`);
    const my = ++gen;
    const alive = () => my === gen;
    ctx = {
      el,
      alive,
      reduced,
      done: () => {
        if (alive()) nextBtn.classList.add("ready");
      },
      wait: (ms) => new Promise((r) => setTimeout(() => r(alive()), reduced ? 0 : ms)),
      frames: (fn) =>
        new Promise((resolve) => {
          const t0 = performance.now();
          const step = (now: number) => {
            // the first frame's time can be a little before t0
            if (!alive() || fn(Math.max(0, now - t0)) === false) return resolve();
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    };
    const s = slides[el.dataset.slide ?? ""];
    const out = s?.enter?.(ctx);
    if (typeof out === "function") cleanup = out;
    renderBar();
  }

  function next() {
    const p = pending();
    if (p.length) {
      p[0].classList.add("shown");
      const all = Array.from(els[index].querySelectorAll("[data-reveal]"));
      slides[els[index].dataset.slide ?? ""]?.reveal?.(all.indexOf(p[0]), ctx!);
      renderBar();
      return;
    }
    go(index + 1, 1);
  }
  const back = () => go(index - 1, -1);

  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", back);
  dots.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.go), Number(d.dataset.go) > index ? 1 : -1)));
  bar.querySelector(".db-full")!.addEventListener("click", toggleFull);
  // links inside slides can jump: <a data-goto="5">
  deck.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-goto]");
    if (a) go(Number(a.dataset.goto) - 1);
  });

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    const typing = t.matches("input, textarea, select");
    if (typing && t.matches("input[type=range]") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
    if (typing && !t.matches("input[type=range]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !t.matches("button, a"))) {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      back();
    } else if (e.key === "Home") go(0, -1);
    else if (e.key === "End") go(els.length - 1);
    else if (e.key === "f" || e.key === "F") toggleFull();
  });

  // swipe between slides, except where the slide itself takes the finger
  let sx = 0;
  let sy = 0;
  let swipe = false;
  deck.addEventListener("touchstart", (e) => {
    swipe = !(e.target as HTMLElement).closest("[data-interactive], input, button");
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  deck.addEventListener("touchend", (e) => {
    if (!swipe) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) (dx < 0 ? next : back)();
  }, { passive: true });

  addEventListener("hashchange", () => {
    const n = Number(location.hash.slice(1));
    if (n >= 1 && n - 1 !== index) go(n - 1);
  });
  document.addEventListener("langchange", renderBar);

  for (const el of els) {
    el.setAttribute("aria-hidden", "true");
    el.inert = true;
  }
  const start = Number(location.hash.slice(1));
  go(start >= 1 ? start - 1 : 0);
}

/** Ease in-out, 0..1 → 0..1. */
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
