"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type AccentPreset =
  | "dyne-blue" | "campus-blue" | "midnight" | "ocean" | "aurora"
  | "forest" | "campus" | "slate" | "violet" | "rose" | "amber";
export type Density = "compact" | "comfortable" | "spacious";
export type FontScale = "small" | "medium" | "large" | "xl";
export type MotionPref = "full" | "reduced" | "minimal";

export interface ThemeState {
  mode: ThemeMode;
  accent: AccentPreset;
  density: Density;
  fontScale: FontScale;
  motion: MotionPref;
  effective: "light" | "dark";
}

const STORAGE_KEY = "dyne-theme";

const DEFAULTS: ThemeState = {
  mode: "system",
  accent: "campus",
  density: "comfortable",
  fontScale: "medium",
  motion: "full",
  effective: "light",
};

export const ACCENT_PRESETS: Array<{ id: AccentPreset; label: string; swatch: string }> = [
  { id: "dyne-blue", label: "Dyne Blue", swatch: "#0f7ff2" },
  { id: "campus-blue", label: "Campus Blue", swatch: "#1d4ed8" },
  { id: "midnight", label: "Midnight", swatch: "#4f46e5" },
  { id: "ocean", label: "Ocean", swatch: "#0284c7" },
  { id: "aurora", label: "Aurora", swatch: "#0d9488" },
  { id: "forest", label: "Forest", swatch: "#166534" },
  { id: "campus", label: "Campus", swatch: "#15803d" },
  { id: "slate", label: "Slate", swatch: "#475569" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
  { id: "amber", label: "Amber", swatch: "#b45309" },
];

function load(): ThemeState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      return { ...DEFAULTS, effective: sys };
    }
    const m = JSON.parse(raw) as Partial<ThemeState>;
    const mode = m.mode === "light" || m.mode === "dark" || m.mode === "system" ? m.mode : "system";
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return {
      mode,
      accent: ACCENT_PRESETS.some((a) => a.id === m.accent) ? (m.accent as AccentPreset) : DEFAULTS.accent,
      density: m.density === "compact" ? "compact" : m.density === "spacious" ? "spacious" : "comfortable",
      fontScale: ["small", "medium", "large", "xl"].includes(m.fontScale ?? "") ? (m.fontScale as FontScale) : "medium",
      motion: m.motion === "reduced" ? "reduced" : m.motion === "minimal" ? "minimal" : "full",
      effective: mode === "system" ? sys : mode,
    };
  } catch {
    return DEFAULTS;
  }
}

function apply(s: ThemeState) {
  const r = document.documentElement;
  r.classList.toggle("dark", s.effective === "dark");
  r.dataset.theme = s.effective;
  r.dataset.accent = s.accent;
  r.dataset.density = s.density;
  r.dataset.fontScale = s.fontScale;
  r.dataset.motion = s.motion;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: s.mode, accent: s.accent, density: s.density, fontScale: s.fontScale, motion: s.motion }));
  } catch { /* private mode */ }
}

const Ctx = createContext<{ theme: ThemeState; update: (p: Partial<ThemeState>) => void; hydrated: boolean }>({
  theme: DEFAULTS,
  update: () => {},
  hydrated: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe: SSR and the first client render both use DEFAULTS, so
  // markup is deterministic. The persisted theme is synced in a mount effect
  // below (after hydration), and the pre-paint inline script in the root
  // layout has already set the matching DOM attributes — so there is no
  // visible flash when state catches up.
  const [theme, setTheme] = useState<ThemeState>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Initial persisted-theme sync only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Skip the first run: the inline pre-paint script already applied the
    // persisted theme to the DOM. Writing DEFAULTS here would flash.
    if (hydrated) apply(theme);
  }, [theme, hydrated]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setTheme((t) => (t.mode === "system" ? { ...t, effective: mq.matches ? "dark" : "light" } : t));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const update = useCallback((p: Partial<ThemeState>) => {
    setTheme((t) => {
      const next = { ...t, ...p };
      if (p.mode) {
        const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        next.effective = p.mode === "system" ? sys : p.mode;
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, update, hydrated }), [theme, update, hydrated]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
