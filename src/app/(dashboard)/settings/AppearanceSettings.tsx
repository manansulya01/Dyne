"use client";

import { ACCENT_PRESETS, useTheme, type AccentPreset, type Density, type FontScale, type MotionPref, type ThemeMode } from "@/components/theme/ThemeProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppearanceSettings() {
  const { theme, update } = useTheme();

  return (
    <Card className="dyne-card">
      <CardContent className="space-y-5 pt-5">
        <div>
          <h2 className="font-semibold tracking-tight">Appearance</h2>
          <p className="text-sm text-muted-foreground">Theme applies instantly and persists across sessions. Contrast stays accessible in every preset.</p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Mode</legend>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Color mode">
            {([
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ] as Array<{ id: ThemeMode; label: string; icon: typeof Sun }>).map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={theme.mode === m.id}
                onClick={() => update({ mode: m.id })}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border text-sm font-medium",
                  theme.mode === m.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                )}
              >
                <m.icon className="h-5 w-5" aria-hidden="true" />
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Accent</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Accent theme">
            {ACCENT_PRESETS.map((a) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={theme.accent === a.id}
                onClick={() => update({ accent: a.id as AccentPreset })}
                className={cn(
                  "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium",
                  theme.accent === a.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                )}
              >
                <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: a.swatch }} aria-hidden="true" />
                {a.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="density" className="text-sm font-medium">Density</label>
            <select
              id="density"
              value={theme.density}
              onChange={(e) => update({ density: e.target.value as Density })}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
          <div>
            <label htmlFor="font-scale" className="text-sm font-medium">Text size</label>
            <select
              id="font-scale"
              value={theme.fontScale}
              onChange={(e) => update({ fontScale: e.target.value as FontScale })}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="xl">Extra large</option>
            </select>
          </div>
          <div>
            <label htmlFor="motion" className="text-sm font-medium">Motion</label>
            <select
              id="motion"
              value={theme.motion}
              onChange={(e) => update({ motion: e.target.value as MotionPref })}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="full">Full</option>
              <option value="reduced">Reduced</option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
