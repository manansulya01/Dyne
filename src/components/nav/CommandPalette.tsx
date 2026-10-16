"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  House, Compass, Users, MessageSquare, CalendarDays, Clapperboard,
  Search, Bell, Settings, ShieldCheck, Newspaper, CalendarClock, BookOpen,
  MessageSquareWarning, Moon, Sun, CheckCheck, LogOut, CornerDownLeft,
  Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/ThemeProvider";

interface PaletteProps {
  open: boolean;
  onClose: () => void;
  role?: string | null;
  username?: string | null;
}

interface SearchHit {
  people: Array<{ id: string; username: string; display_name: string | null }>;
  communities: Array<{ id: string; slug: string; name: string }>;
  events: Array<{ id: string; title: string }>;
  blogs: Array<{ id: string; slug: string; title: string }>;
  studyMaterials: Array<{ id: string; title: string }>;
  posts: Array<{ id: string; content: string | null }>;
}

interface Item {
  key: string;
  section: string;
  label: string;
  hint?: string;
  icon: typeof House;
  run: () => void;
}

const RECENT_KEY = "dyne-recent-searches";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function CommandPalette({ open, onClose, role, username }: PaletteProps) {
  const router = useRouter();
  const { theme, update } = useTheme();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  // Recents are read lazily on mount; the palette is mounted fresh on every
  // open (see DashboardClientLayout), so this is always current.
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback((href: string) => {
    onClose();
    setQ("");
    router.push(href);
  }, [onClose, router]);

  const remember = useCallback((term: string) => {
    const t = term.trim().slice(0, 100);
    if (t.length < 2) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onClose();
    router.push("/login");
    router.refresh();
  }, [onClose, router]);

  const markAllRead = useCallback(async () => {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotice(res.ok ? "All notifications marked as read." : "Could not update notifications.");
  }, []);

  const toggleDark = useCallback(() => {
    update({ mode: theme.effective === "dark" ? "light" : "dark" });
    onClose();
  }, [onClose, theme.effective, update]);

  const isAdmin = !!role && ["moderator", "admin", "super_admin", "staff"].includes(role);

  const commands: Item[] = useMemo(() => {
    const nav: Item[] = [
      { key: "go-home", section: "Go to", label: "Go Home", icon: House, run: () => go("/feed") },
      { key: "go-explore", section: "Go to", label: "Open Explore", icon: Compass, run: () => go("/explore") },
      { key: "go-communities", section: "Go to", label: "Open Communities", icon: Users, run: () => go("/communities") },
      { key: "go-messages", section: "Go to", label: "Open Group Chats", icon: MessageSquare, run: () => go("/chat") },
      { key: "go-calendar", section: "Go to", label: "Open Calendar", icon: CalendarDays, run: () => go("/calendar") },
      { key: "go-timetable", section: "Go to", label: "Open Timetable", icon: CalendarClock, run: () => go("/timetable") },
      { key: "go-study", section: "Go to", label: "Open Study Materials", icon: BookOpen, run: () => go("/study-materials") },
      { key: "go-watch", section: "Go to", label: "Open Watch", icon: Clapperboard, run: () => go("/watch") },
      { key: "go-blogs", section: "Go to", label: "Open Blogs", icon: Newspaper, run: () => go("/blogs") },
      { key: "go-notifications", section: "Go to", label: "Open Notifications", icon: Bell, run: () => go("/notifications") },
      { key: "go-feedback", section: "Go to", label: "Send Feedback", icon: MessageSquareWarning, run: () => go("/feedback") },
      { key: "go-saved", section: "Go to", label: "Open Saved Items", icon: Bookmark, run: () => go("/saved") },
      { key: "go-settings", section: "Go to", label: "Open Settings", icon: Settings, run: () => go("/settings") },
      ...(username ? [{ key: "go-profile", section: "Go to", label: "Open My Profile", icon: Users, run: () => go(`/profile/${username}`) } as Item] : []),
      ...(isAdmin ? [{ key: "go-admin", section: "Go to", label: "Open Admin Console", icon: ShieldCheck, run: () => go("/admin") } as Item] : []),
    ];
    const actions: Item[] = [
      { key: "act-theme", section: "Actions", label: theme.effective === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode", icon: theme.effective === "dark" ? Sun : Moon, run: toggleDark },
      { key: "act-read", section: "Actions", label: "Mark All Notifications Read", icon: CheckCheck, run: () => void markAllRead() },
      { key: "act-post", section: "Actions", label: "Create Post", hint: "Opens the feed composer", icon: CornerDownLeft, run: () => go("/feed") },
      { key: "act-logout", section: "Actions", label: "Log Out", icon: LogOut, run: () => void logout() },
    ];
    return [...nav, ...actions];
  }, [go, isAdmin, logout, markAllRead, toggleDark, theme.effective, username]);

  // Live search (debounced, server-side, permission-filtered by the API).
  // All state updates happen in async continuations. When the query is too
  // short, previous results are hidden by derivation (visibleHits below) —
  // never by a synchronous reset — so this effect sets no state synchronously.
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) return;
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        if (res.ok) {
          setHits(data);
          setCursor(0);
        }
      } catch { /* transient */ } finally {
        setLoading(false);
      }
    }, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, open]);

  // Focus the input on mount. No state involved — pure DOM sync.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const flat: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matched = term.length === 0
      ? commands
      : commands.filter((c) => c.label.toLowerCase().includes(term));
    const out: Item[] = [...matched];
    // Short queries hide server results by derivation (no synchronous reset).
    const activeHits = term.length >= 2 ? hits : null;
    if (activeHits) {
      for (const p of (activeHits.people ?? []).slice(0, 3)) {
        out.push({ key: `p-${p.id}`, section: "People", label: p.display_name || `@${p.username}`, hint: `@${p.username}`, icon: Users, run: () => { remember(q); go(`/profile/${p.username}`); } });
      }
      for (const c of (activeHits.communities ?? []).slice(0, 3)) {
        out.push({ key: `c-${c.id}`, section: "Communities", label: c.name, icon: Users, run: () => { remember(q); go(`/communities/${c.slug}`); } });
      }
      for (const e of (activeHits.events ?? []).slice(0, 2)) {
        out.push({ key: `e-${e.id}`, section: "Events", label: e.title, icon: CalendarDays, run: () => { remember(q); go(`/events/${e.id}`); } });
      }
      for (const b of (activeHits.blogs ?? []).slice(0, 2)) {
        out.push({ key: `b-${b.id}`, section: "Blogs", label: b.title, icon: Newspaper, run: () => { remember(q); go(`/blogs/${b.slug}`); } });
      }
      for (const s of (activeHits.studyMaterials ?? []).slice(0, 2)) {
        out.push({ key: `s-${s.id}`, section: "Study", label: s.title, icon: BookOpen, run: () => { remember(q); go("/study-materials"); } });
      }
    }
    return out.slice(0, 24);
  }, [commands, go, hits, q, remember]);

  // Cursor is clamped during render instead of reset in an effect: result
  // counts change as the user types, and the input handler resets to the top.
  const safeCursor = flat.length === 0 ? 0 : Math.min(Math.max(cursor, 0), flat.length - 1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); flat[safeCursor]?.run(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, safeCursor, onClose, open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${safeCursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeCursor]);

  if (!open) return null;

  let lastSection = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="dyne-fade-in w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="dyne-palette" className="sr-only">Search Dyne or type a command</label>
          <input
            id="dyne-palette"
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            placeholder="Search Dyne — pages, people, communities…"
            className="min-h-[52px] w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            maxLength={100}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="dyne-palette-list"
            aria-activedescendant={flat[safeCursor] ? `dyne-palette-${flat[safeCursor].key}` : undefined}
          />
          {loading && q.trim().length >= 2 && <span className="text-xs text-muted-foreground" role="status">…</span>}
          <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">esc</kbd>
        </div>
        <div ref={listRef} id="dyne-palette-list" role="listbox" aria-label="Results" className="dyne-scroll max-h-[46vh] overflow-y-auto p-2">
          {flat.length === 0 && !(loading && q.trim().length >= 2) && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium">No results for “{q.trim()}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a person, community, event, or a command like “Open Timetable”.</p>
              {recent.length > 0 && q.trim().length === 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {recent.map((r) => (
                    <button key={r} onClick={() => { setQ(r); setCursor(0); }} className="min-h-[44px] rounded-full border border-border px-3 text-xs hover:bg-muted">
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {flat.map((item, i) => {
            const header = item.section !== lastSection ? item.section : null;
            lastSection = item.section;
            return (
              <div key={item.key}>
                {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{header}</p>}
                <button
                  id={`dyne-palette-${item.key}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === safeCursor}
                  onClick={() => item.run()}
                  onMouseMove={() => setCursor(i)}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm",
                    i === safeCursor ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  {item.hint && <span className="truncate text-xs opacity-70">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        {notice && <p role="status" className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{notice}</p>}
        <div className="hidden items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground sm:flex">
          <span><kbd className="rounded border border-border px-1">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-border px-1">↵</kbd> open</span>
          <span className="ml-auto">Dyne command palette</span>
        </div>
      </div>
    </div>
  );
}
