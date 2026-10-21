import path from "node:path";
import { getConfig } from "reshaped/config/postcss";

/*
 * Required by Reshaped, not optional.
 *
 * Reshaped ships its component CSS with unresolved custom media queries —
 * `@media (--rs-viewport-m)` and friends — which are invalid CSS until
 * postcss-custom-media inlines the real breakpoints. Those breakpoints live in
 * the theme's media.css, which postcss-global-data has to read off disk first.
 * Without this config the rules are dropped silently and every responsive
 * component renders at its smallest variant on all screens.
 *
 * The path is this app's compiled theme (`pnpm theme`), resolved from
 * process.cwd() rather than this file's location: Turbopack bundles the
 * config into .next, which rewrites that base path, and the working directory
 * during a build is the project root either way.
 *
 * Plugins are named as bare strings, so they must resolve from this project's
 * node_modules. pnpm won't hoist Reshaped's copies, which is why
 * postcss-custom-media, @csstools/postcss-global-data and cssnano are direct
 * devDependencies — cssnano pinned to the major Reshaped's config is written
 * against.
 */
export default getConfig({
  themeMediaCSSPath: path.join(process.cwd(), "src/themes/photo/media.css"),
});
