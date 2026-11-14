/**
 * English / Japanese switch shared by every page.
 *
 * Static text sits in the HTML twice, marked data-l="en" and data-l="ja"; site.css hides the
 * one that is not selected. Text built in code uses tr(en, ja) and listens for "langchange".
 */

export type Lang = "en" | "ja";

const KEY = "marswalk-lang";

export function getLang(): Lang {
  return document.documentElement.dataset.lang === "ja" ? "ja" : "en";
}

export function setLang(lang: Lang): void {
  document.documentElement.dataset.lang = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // private windows may refuse storage; the choice then lasts for this page only
  }
  for (const b of document.querySelectorAll<HTMLElement>("[data-set-lang]")) {
    b.setAttribute("aria-pressed", String(b.dataset.setLang === lang));
  }
  // one-button switches show the language you would switch to
  for (const b of document.querySelectorAll<HTMLElement>("[data-toggle-lang]")) b.textContent = lang === "ja" ? "EN" : "日本語";
  document.dispatchEvent(new CustomEvent("langchange"));
}

/** Pick the saved or the browser's language and wire up the buttons marked data-set-lang. */
export function initLang(): void {
  let lang: Lang = navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "ja") lang = saved;
  } catch {
    // no storage: use the browser's language
  }
  for (const b of document.querySelectorAll<HTMLElement>("[data-set-lang]")) {
    b.addEventListener("click", () => setLang(b.dataset.setLang as Lang));
  }
  for (const b of document.querySelectorAll<HTMLElement>("[data-toggle-lang]")) {
    b.addEventListener("click", () => setLang(getLang() === "ja" ? "en" : "ja"));
  }
  setLang(lang);
}

export const tr = (en: string, ja: string): string => (getLang() === "ja" ? ja : en);
