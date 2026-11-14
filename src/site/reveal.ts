/** Resolves once the page-change animation is over (set up by the inline script in each page's head). */
export const revealed = (): Promise<void> => (window as unknown as { __revealed?: Promise<void> }).__revealed ?? Promise.resolve();
