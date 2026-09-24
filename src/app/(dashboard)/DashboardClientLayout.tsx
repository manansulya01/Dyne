"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/DropdownMenu";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  House,
  Compass,
  Users,
  MessageSquare,
  CalendarDays,
  Building2,
  Clapperboard,
  Search,
  Bell,
  Settings,
  ShieldCheck,
  Menu,
  X,
  Newspaper,
  CalendarClock,
  Moon,
  Sun,
  Monitor,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface DashboardClientLayoutProps {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role?: string | null;
  } | null;
  children: React.ReactNode;
}

const PRIMARY_NAV = [
  { name: "Home", href: "/feed", icon: House },
  { name: "Explore", href: "/explore", icon: Compass },
  { name: "Communities", href: "/communities", icon: Users },
  { name: "Messages", href: "/chat", icon: MessageSquare },
  { name: "Events", href: "/events", icon: CalendarDays },
  { name: "Campus", href: "/campus", icon: Building2 },
  { name: "Watch", href: "/watch", icon: Clapperboard },
  { name: "Schedule", href: "/schedule", icon: CalendarClock },
  { name: "Blogs", href: "/blogs", icon: Newspaper },
  { name: "Search", href: "/search", icon: Search },
];

const MOBILE_NAV = [
  { name: "Home", href: "/feed", icon: House },
  { name: "Explore", href: "/explore", icon: Compass },
  { name: "Messages", href: "/chat", icon: MessageSquare },
  { name: "Events", href: "/events", icon: CalendarDays },
  { name: "Watch", href: "/watch", icon: Clapperboard },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardClientLayout({ profile, children }: DashboardClientLayoutProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Lazy init avoids a mount-time setState cascade (lint: set-state-in-effect).
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("dyne-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications?unread=true&limit=1");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.unreadCount === "number") setUnread(data.unreadCount);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("dyne-sidebar-collapsed", c ? "0" : "1"); } catch { /* ignore */ }
      return !c;
    });
  };

  return (
    <div className="flex h-svh bg-background text-foreground">
      {/* Desktop / iPad sidebar */}
      <aside
        aria-label="Primary"
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex",
          collapsed ? "w-[76px]" : "w-64"
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4">
          <Link href="/feed" className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5" aria-label="Dyne home">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground" aria-hidden="true">
              D
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block text-[17px] font-bold leading-none tracking-tight">Dyne</span>
                <span className="block truncate text-[11px] text-muted-foreground">Macro Vision Academy</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button onClick={toggleCollapsed} aria-label="Collapse sidebar" className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronsLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="dyne-scroll flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label="Main navigation">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.name : undefined}
                className={cn(
                  "group flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-transparent group-hover:bg-card")}>
                  <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                {!collapsed && <span className="truncate">{item.name}</span>}
                {!collapsed && item.href === "/notifications" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{unread}</span>
                )}
              </Link>
            );
          })}
          <div className={cn("pt-2", !collapsed && "px-1")}>
            {!collapsed && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You</p>}
            <SidebarLink pathname={pathname} href="/notifications" icon={Bell} label="Notifications" collapsed={collapsed} badge={unread} />
            <SidebarLink pathname={pathname} href="/people" icon={Users} label="People" collapsed={collapsed} />
            <SidebarLink pathname={pathname} href="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
            {profile?.role === "admin" && (
              <SidebarLink pathname={pathname} href="/admin" icon={ShieldCheck} label="Admin" collapsed={collapsed} />
            )}
          </div>
        </nav>

        <div className="border-t border-border p-3">
          {collapsed ? (
            <button onClick={toggleCollapsed} aria-label="Expand sidebar" className="flex min-h-[44px] w-full items-center justify-center rounded-xl hover:bg-muted">
              <ChevronsRight className="h-5 w-5 text-muted-foreground" />
            </button>
          ) : (
            <ProfileFooter profile={profile} />
          )}
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <span className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">D</span>
                <span className="font-bold">Dyne</span>
              </span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Mobile navigation">
              {[...PRIMARY_NAV,
                { name: "Notifications", href: "/notifications", icon: Bell },
                { name: "People", href: "/people", icon: Users },
                { name: "Settings", href: "/settings", icon: Settings },
                ...(profile?.role === "admin" ? [{ name: "Admin", href: "/admin", icon: ShieldCheck }] : []),
              ].map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href + item.name}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] font-medium",
                      active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border p-3">
              <ProfileFooter profile={profile} />
            </div>
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header profile={profile} unread={unread} onMenu={() => setMobileOpen(true)} />
        <main className="dyne-scroll min-h-0 flex-1 overflow-y-auto pb-24 md:pb-10">{children}</main>
        {/* Mobile bottom navigation */}
        <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="grid grid-cols-5">
            {MOBILE_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", active && "text-primary")} aria-hidden="true" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function SidebarLink({ pathname, href, icon: Icon, label, collapsed, badge }: { pathname: string; href: string; icon: typeof Bell; label: string; collapsed: boolean; badge?: number }) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "group-hover:bg-card")}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && !!badge && badge > 0 && (
        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{badge > 99 ? "99+" : badge}</span>
      )}
    </Link>
  );
}

function ProfileFooter({ profile }: { profile: DashboardClientLayoutProps["profile"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally { setBusy(false); }
  };
  if (!profile) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-h-[52px] w-full items-center gap-2.5 rounded-xl px-2 text-left hover:bg-muted" aria-label="Account menu">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile.avatar_url || ""} alt="" />
            <AvatarFallback name={profile.display_name || profile.username} />
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{profile.display_name || profile.username}</span>
            <span className="block truncate text-xs text-muted-foreground">@{profile.username}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild><Link href={`/profile/${profile.username}`} className="flex min-h-[44px] w-full items-center">View profile</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings" className="flex min-h-[44px] w-full items-center">Settings</Link></DropdownMenuItem>
        {profile.role === "admin" && (
          <DropdownMenuItem asChild><Link href="/admin" className="flex min-h-[44px] w-full items-center gap-2"><ShieldCheck className="h-4 w-4" /> Admin</Link></DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex min-h-[44px] cursor-pointer items-center text-destructive focus:text-destructive" onSelect={(e) => { e.preventDefault(); logout(); }}>
          {busy ? "Logging out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header({ profile, unread, onMenu }: { profile: DashboardClientLayoutProps["profile"]; unread: number; onMenu: () => void }) {
  const { theme, update, hydrated } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration gate; no external subscription
  useEffect(() => { setMounted(true); }, []);
  const cycleMode = () => {
    update({ mode: theme.mode === "light" ? "dark" : theme.mode === "dark" ? "system" : "light" });
  };
  // Hydration-safe: only render the real icon after both client mount and theme hydration.
  // Before that, render a neutral Monitor icon that matches the server render (DEFAULTS.mode = "system").
  const ModeIcon = mounted && hydrated
    ? theme.effective === "dark"
      ? Moon
      : theme.mode === "system"
      ? Monitor
      : Sun
    : Monitor;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-5">
        <button onClick={onMenu} aria-label="Open menu" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-muted md:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/feed" className="flex items-center gap-2 md:hidden" aria-label="Dyne home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-base font-extrabold text-primary-foreground">D</span>
          <span className="font-bold tracking-tight">Dyne</span>
        </Link>
        <div className="hidden flex-1 md:block">
          <GlobalSearchBox />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={cycleMode} aria-label={`Theme: ${theme.mode}. Activate to switch.`} title={`Theme: ${theme.mode}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
            <ModeIcon className="h-5 w-5" />
          </button>
          <Link href="/search" aria-label="Search" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
            <Search className="h-5 w-5" />
          </Link>
          <Link href="/notifications" aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`} className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-11 w-11 rounded-full p-0" aria-label="Account">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={profile?.avatar_url || ""} alt={profile?.display_name || profile?.username || "Your avatar"} />
                  <AvatarFallback name={profile?.display_name || profile?.username || "You"} />
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium">{profile?.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">@{profile?.username}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href={profile ? `/profile/${profile.username}` : "/feed"} className="flex min-h-[44px] w-full items-center">View profile</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/settings" className="flex min-h-[44px] w-full items-center">Settings</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="px-3 pb-2 md:hidden">
        <GlobalSearchBox compact />
      </div>
    </header>
  );
}

function GlobalSearchBox({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      aria-label="Campus search"
      className={cn("flex items-center gap-2 rounded-xl border border-border bg-card px-3", compact ? "min-h-[44px]" : "mx-auto min-h-[44px] max-w-xl")}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label htmlFor={compact ? "global-search-m" : "global-search"} className="sr-only">Search Dyne</label>
      <input
        id={compact ? "global-search-m" : "global-search"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search people, communities, posts, events…"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        maxLength={100}
      />
    </form>
  );
}
