/*
 * The app's Reshaped theme and colour mode, in one place: the root layout
 * server-renders them as attributes on <html> and ThemeProvider receives them
 * as props, and the two must agree. The theme is compiled from
 * reshaped.config.mjs by `pnpm theme`; postcss.config.mjs reads its media.css.
 *
 * Declared `as const` so each value narrows to its literal type — that is what
 * lets the colour mode satisfy Reshaped's ColorMode union instead of widening
 * to string.
 */
export const THEME = "photo" as const;

/*
 * The app follows the visitor's system setting, light or dark. The server
 * cannot see that setting — `prefers-color-scheme` is a client media query —
 * so the HTML is rendered light and COLOR_MODE_SCRIPT corrects it before
 * anything paints.
 */
export const FALLBACK_COLOR_MODE = "light" as const;
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/*
 * Runs inline in <head>, before <body> is parsed, so the page is painted in
 * the right mode from the start rather than light until hydration and then
 * dark. In a browser without matchMedia it leaves the fallback in place.
 *
 * An inline script: if a Content-Security-Policy is ever added, this needs a
 * nonce or a hash, or the app falls back to light-until-hydration.
 */
export const COLOR_MODE_SCRIPT = `(function(){try{var m=matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light";document.documentElement.setAttribute("data-rs-color-mode",m)}catch(e){}})();`;
