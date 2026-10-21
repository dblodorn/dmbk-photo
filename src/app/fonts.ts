import localFont from "next/font/local";

/*
 * ABCAreal, the face of sigil-x-native-interviews' /sketches section (which
 * inherits it from that site's root layout), self-hosted through
 * next/font/local so no visitor's browser opens a connection to a font CDN.
 * The six static instances are declared; the browser downloads only the
 * weights a page paints.
 *
 * `variable` exposes the family as `--font-areal` on <html>, and the Reshaped
 * theme (reshaped.config.mjs) points every font-family token at that
 * variable, so nothing else in the app names the family.
 */
export const areal = localFont({
  src: [
    { path: "../fonts/ABCAreal-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ABCAreal-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/ABCAreal-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ABCAreal-MediumItalic.woff2", weight: "500", style: "italic" },
    { path: "../fonts/ABCAreal-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/ABCAreal-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-areal",
  display: "swap",
});
