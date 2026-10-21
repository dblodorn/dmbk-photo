import type { Metadata } from "next";
import { areal } from "./fonts";
import ThemeProvider from "./ThemeProvider";
import { COLOR_MODE_SCRIPT, FALLBACK_COLOR_MODE, THEME } from "./theme";

/*
 * The compiled `photo` theme (its --rs-* tokens), then the little it cannot
 * reach. Reshaped's components bring their own CSS with them. Every route
 * wears these: the gallery and the admin are one design system.
 */
import "@/themes/photo/theme.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://photo.dmbk.io"),
  title: { default: "Photographs — dmbk", template: "%s — dmbk photo" },
  description: "A gallery of photographs.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * The theme attributes are server-rendered on <html> on purpose. Reshaped
   * sets them itself, but from an effect after mount, and every rule it ships
   * reads from `[data-rs-theme]` — so without them here the first paint of
   * every page would be unstyled.
   *
   * suppressHydrationWarning is for COLOR_MODE_SCRIPT, which swaps the
   * colour-mode attribute for the system's before anything paints. The
   * suppression reaches <html>'s own attributes only, so a real mismatch
   * anywhere below is still reported.
   */
  return (
    <html
      lang="en"
      className={areal.variable}
      data-rs-theme={THEME}
      data-rs-color-mode={FALLBACK_COLOR_MODE}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
