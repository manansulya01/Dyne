"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/DropdownMenu";
import {
  LayoutDashboard,
  Users,
  Building2,
  MessageSquare,
  Calendar,
  Video,
  Search,
  Bell,
  Menu,
  X,
} from "lucide-react";

interface DashboardClientLayoutProps {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  children: React.ReactNode;
}

const navigation = [
  { name: "Home", href: "/home", icon: LayoutDashboard },
  { name: "People", href: "/people", icon: Users },
  { name: "Campus", href: "/campus", icon: Building2 },
  { name: "Communities", href: "/communities", icon: Users },
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Events", href: "/events", icon: Calendar },
  { name: "Watch", href: "/watch", icon: Video },
  { name: "Search", href: "/search", icon: Search },
];

export function DashboardClientLayout({ profile, children }: DashboardClientLayoutProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar pathname={pathname} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onOpen={() => setIsSidebarOpen(true)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header profile={profile} onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ pathname, isOpen, onClose, onOpen }: { pathname: string; isOpen: boolean; onClose: () => void; onOpen: () => void }) {
  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-md bg-background border"
        onClick={onOpen}
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-background border-r transition-transform duration-200 md:translate-x-0 md:relative",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Sidebar"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-4 border-b">
            <Link href="/home" className="text-xl font-bold text-primary" onClick={onClose}>
              Dyne
            </Link>
            <button
              className="md:hidden p-2 rounded-md hover:bg-accent"
              onClick={onClose}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-4" aria-label="Main navigation">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  aria-current={isActive ? "page" : undefined}
                  onClick={onClose}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t">
            <Link
              href="/notifications"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={onClose}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              Notifications
            </Link>
          </div>
        </div>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  );
}

function Header({ profile, onMenuClick }: { profile: DashboardClientLayoutProps["profile"]; onMenuClick: () => void }) {
  return (
    <header className="h-16 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b sticky top-0 z-30">
      <div className="flex h-full items-center justify-between px-4">
        <button
          className="md:hidden p-2 rounded-md hover:bg-accent"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex-1 md:hidden" />
        <div className="flex items-center gap-4">
          <form action="/api/auth/logout" method="POST">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={profile?.avatar_url || ""} alt="" />
                    <AvatarFallback name={profile?.display_name || profile?.username || "User"} />
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1">
                  <p className="text-sm font-medium">{profile?.display_name}</p>
                  <p className="text-xs text-muted-foreground">@{profile?.username}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile/@me" className="w-full">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="w-full">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <button type="submit" className="w-full text-left">Log out</button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </form>
        </div>
      </div>
    </header>
  );
}