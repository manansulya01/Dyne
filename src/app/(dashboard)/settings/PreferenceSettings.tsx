"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Prefs {
  emailNotifications: boolean;
  pushNotifications: boolean;
  notifySocial: boolean;
  notifyMessages: boolean;
  notifyCommunities: boolean;
  notifyEvents: boolean;
  profileVisibility: string;
  messagePermissions: string;
  activityVisibility: string;
}

const DEFAULTS: Prefs = {
  emailNotifications: true,
  pushNotifications: false,
  notifySocial: true,
  notifyMessages: true,
  notifyCommunities: true,
  notifyEvents: true,
  profileVisibility: "campus",
  messagePermissions: "everyone",
  activityVisibility: "everyone",
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

export function PreferenceSettings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.preferences) setPrefs({ ...DEFAULTS, ...json.preferences });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setStatus(res.ok ? "Saved" : "Could not save — try again");
    } catch {
      setStatus("Network error — try again");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 2500);
    }
  };

  const row = (label: string, desc: string, control: React.ReactNode) => (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {control}
    </div>
  );

  return (
    <Card className="dyne-card">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold tracking-tight">Notifications & privacy</h2>
            <p className="text-sm text-muted-foreground">Every toggle saves immediately to your account.</p>
          </div>
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">{saving ? "Saving…" : status}</span>
        </div>

        <div className="mt-2 divide-y divide-border">
          {row("Social activity", "Likes, comments, follows, and mentions.", <Toggle label="Social activity" checked={prefs.notifySocial} onChange={(v) => save({ notifySocial: v })} />)}
          {row("Messages", "New direct and group messages.", <Toggle label="Messages" checked={prefs.notifyMessages} onChange={(v) => save({ notifyMessages: v })} />)}
          {row("Communities", "Posts, polls, and announcements in your communities.", <Toggle label="Communities" checked={prefs.notifyCommunities} onChange={(v) => save({ notifyCommunities: v })} />)}
          {row("Events", "RSVPs, reminders, and campus gatherings.", <Toggle label="Events" checked={prefs.notifyEvents} onChange={(v) => save({ notifyEvents: v })} />)}
          {row("Email updates", "Occasional campus digests by email.", <Toggle label="Email updates" checked={prefs.emailNotifications} onChange={(v) => save({ emailNotifications: v })} />)}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="pref-visibility" className="text-sm font-medium">Profile visibility</label>
            <select id="pref-visibility" value={prefs.profileVisibility} onChange={(e) => save({ profileVisibility: e.target.value })} className="mt-1.5 min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm">
              <option value="campus">Campus (MVA only)</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div>
            <label htmlFor="pref-messages" className="text-sm font-medium">Who can message me</label>
            <select id="pref-messages" value={prefs.messagePermissions} onChange={(e) => save({ messagePermissions: e.target.value })} className="mt-1.5 min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm">
              <option value="everyone">Everyone on campus</option>
              <option value="following">People I follow</option>
              <option value="none">No one</option>
            </select>
          </div>
          <div>
            <label htmlFor="pref-activity" className="text-sm font-medium">Activity visibility</label>
            <select id="pref-activity" value={prefs.activityVisibility} onChange={(e) => save({ activityVisibility: e.target.value })} className="mt-1.5 min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm">
              <option value="everyone">Everyone</option>
              <option value="following">People I follow</option>
              <option value="private">Only me</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          Privacy controls are explicit: your likes and saved posts stay private to you, and message
          permissions are shown here rather than hidden. Session and password controls remain in their
          sections below.
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => window.location.reload()}>Refresh to verify persistence</Button>
      </CardContent>
    </Card>
  );
}
