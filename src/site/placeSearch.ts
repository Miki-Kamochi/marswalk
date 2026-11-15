/**
 * A search box with suggestions for places in the map area (science stops, camps, landmarks),
 * used on the home screen and in the planner. Arrow keys move through the suggestions,
 * Enter picks, Escape closes.
 */
import type { Place } from "../data/loader";
import { placeName } from "../sim/text";
import { tr } from "./lang";

const KIND_ORDER: Record<string, number> = { stop: 0, camp: 1, landmark: 2 };

const KIND: Record<string, [string, string]> = {
  stop: ["Science target", "科学目標"],
  camp: ["Camp", "キャンプ"],
  landmark: ["Landmark", "目印"],
};

export function searchable(places: Place[]): Place[] {
  return places.filter((p) => p.kind in KIND_ORDER).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function attachPlaceSearch(
  input: HTMLInputElement,
  list: HTMLElement,
  places: Place[],
  onPick: (p: Place) => void,
  onHover?: (p: Place | null) => void,
): { close(): void } {
  let shown: Place[] = [];
  let active = -1;
  list.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = places.filter((p) => !q || placeName(p.id, p.name).toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
    list.innerHTML = shown.length
      ? shown
          .map(
            (p, i) => `<li role="option" data-i="${i}" aria-selected="${i === active}" class="${p.kind}">
              <span class="pin" aria-hidden="true"></span>
              <span class="nm">${esc(placeName(p.id, p.name))}</span>
              <span class="kd">${esc(tr(...KIND[p.kind]))}</span>
            </li>`,
          )
          .join("")
      : `<li class="none">${esc(tr("No place with that name", "その名前の場所はありません"))}</li>`;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute("aria-expanded", "false");
    onHover?.(null);
  };
  const pick = (i: number) => {
    const p = shown[i];
    if (!p) return;
    input.value = placeName(p.id, p.name);
    close();
    onPick(p);
  };

  input.addEventListener("focus", render);
  input.addEventListener("input", () => {
    active = -1;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) render();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(shown.length, 1);
      render();
      onHover?.(shown[active] ?? null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active >= 0 ? active : 0);
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });
  list.addEventListener("mousedown", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-i]");
    if (!li) return;
    e.preventDefault();
    pick(Number(li.dataset.i));
  });
  list.addEventListener("mouseover", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-i]");
    if (li) onHover?.(shown[Number(li.dataset.i)] ?? null);
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  document.addEventListener("langchange", () => {
    if (!list.hidden) render();
  });
  return { close };
}
