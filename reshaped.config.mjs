import { generateThemeColors } from "@reshaped/theming";

/*
 * The app's one Reshaped theme, `photo`. Compile it with `pnpm theme`, which
 * writes src/themes/photo/ (theme.css, media.css, theme.json, tailwind.css);
 * the output is checked in, so a build never runs the generator.
 *
 * Colour and radius are lora-trainer's `lora-trainer` theme (its
 * reshaped.config.js): a monochrome ramp — black primary and brand, the
 * critical/warning/positive roles told apart by lightness rather than hue —
 * and square corners throughout. The photographs are the only colour on the
 * page.
 *
 * Type is ABCAreal, the face sigil-x-native-interviews' /sketches section
 * inherits from that site's root layout. It is self-hosted through
 * next/font/local in src/app/fonts.ts, which exposes it as `--font-areal` on
 * <html>; the theme names the variable, never a family, so next/font's
 * generated family name and its metric-matched fallback both apply.
 */
const areal = "var(--font-areal), Helvetica, Arial, sans-serif";

const config = {
  themes: {
    photo: {
      color: generateThemeColors({
        primary: { oklch: { l: 0, c: 0, h: 0 } },
        critical: { oklch: { l: 0.3, c: 0, h: 0 } },
        warning: { oklch: { l: 0.5, c: 0, h: 0 } },
        positive: { oklch: { l: 0.2, c: 0, h: 0 } },
        neutral: { oklch: { l: 0.92, c: 0, h: 0 } },
        brand: { oklch: { l: 0, c: 0, h: 0 } },
      }),
      fontFamily: {
        body: { family: areal },
        title: { family: areal },
        headline: { family: areal },
      },
      radius: {
        small: { px: 0 },
        medium: { px: 0 },
        large: { px: 0 },
      },
    },
  },
};

export default config;
