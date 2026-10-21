"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Reshaped } from "reshaped";
import { DARK_QUERY, FALLBACK_COLOR_MODE, THEME } from "./theme";

type ColorMode = "light" | "dark";

/*
 * The visitor's system colour mode, followed live: switching the OS to dark
 * while a page is open switches the page too.
 *
 * Read from matchMedia in the state initialiser rather than settled in an
 * effect, so the first client render already has the right mode. Reshaped
 * writes the mode to <html> from an effect, so it changes no markup React
 * compares at hydration; until then <html> carries what COLOR_MODE_SCRIPT set.
 */
function useSystemColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>(() =>
    typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches
      ? "dark"
      : FALLBACK_COLOR_MODE,
  );

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const follow = () => setMode(query.matches ? "dark" : "light");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  return mode;
}

/**
 * Reshaped for the whole app, unscoped: it owns the document, so its reset and
 * the theme's tokens apply from <html> down and the page canvas takes the
 * theme's page colour without help. The colour mode is controlled —
 * `colorMode`, not `defaultColorMode` — so it tracks the system setting rather
 * than being fixed at mount.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const colorMode = useSystemColorMode();
  return (
    <Reshaped theme={THEME} colorMode={colorMode}>
      {children}
    </Reshaped>
  );
}
