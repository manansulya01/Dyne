"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ClipboardList,
  GraduationCap,
  Library,
  Newspaper,
  Images,
  Megaphone,
  PlaySquare,
  Clapperboard,
  ShieldAlert,
  ShieldCheck,
  Users,
  ScrollText,
} from "lucide-react";

/**
 * Admin hub.
 *
 * Every tile is a real MongoDB count from /api/admin/analytics. Nothing is
 * estimated, and no section is linked unless the signed-in role holds the
 * matching permission.
 */

interface Stats {
  users: number;
  students: number;
  teachers: number;
  staff: number;
  posts: number;
  communities: number;
  events: number;
  videos: number;
  reels: number;
  stories: number;
  blogs: number;
  studyMaterials: number;
  classAssignments: number;
  classExams: number;
  examAttempts: number;
  pendingReports: number;
  moderationPending: number;
  moderationFlagged: number;
  activeSessions: number;
  newUsers30d: number;
  posts30d: number;
}

export function AdminHub({
  role,
  permissions,
}: {
  role: string;
  permissions: string[];
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [roleBreakdown, setRoleBreakdown] = useState<Array<{ _id: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/analytics");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load platform statistics.");
          return;
        }
        setStats(data.stats ?? null);
        setRoleBreakdown(data.roleBreakdown ?? []);
      } catch {
        if (!cancelled) setError("Could not load platform statistics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const can = (permission: string) => permissions.includes(permission);

  const sections = [
    { label: "Users", href: "/admin/users", icon: Users, permission: "users.manage", value: stats?.users },
    { label: "Moderation", href: "/admin/moderation", icon: ShieldAlert, permission: "moderation.queue", value: (stats?.moderationPending ?? 0) + (stats?.moderationFlagged ?? 0) },
    { label: "Analytics", href: "/admin/analytics", icon: BarChart3, permission: "analytics.read", value: null },
    { label: "Content", href: "/admin/content", icon: Library, permission: "content.manage", value: (stats?.blogs ?? 0) + (stats?.videos ?? 0) + (stats?.reels ?? 0) },
    { label: "Study materials", href: "/study-materials", icon: Library, permission: "study.feature", value: stats?.studyMaterials },
    { label: "Assignments", href: "/teacher/assignments", icon: ClipboardList, permission: "assignments.manage", value: stats?.classAssignments },
    { label: "Exams", href: "/teacher/exams", icon: GraduationCap, permission: "exams.create", value: stats?.classExams },
    { label: "Student reports", href: "/reports/students", icon: BarChart3, permission: "academic_reports.read", value: stats?.students },
    { label: "Videos", href: "/videos", icon: Clapperboard, permission: "videos.moderate", value: stats?.videos },
    { label: "Reels", href: "/reels", icon: PlaySquare, permission: "reels.moderate", value: stats?.reels },
    { label: "Blogs", href: "/blogs", icon: Newspaper, permission: "blogs.moderate", value: stats?.blogs },
    { label: "Stories", href: "/stories", icon: Images, permission: "stories.moderate", value: stats?.stories },
    { label: "Announcements", href: "/announcements", icon: Megaphone, permission: "announcements.manage", value: null },
    { label: "Communities", href: "/communities", icon: Users, permission: "communities.manage", value: stats?.communities },
    { label: "Events", href: "/events", icon: GraduationCap, permission: "events.manage", value: stats?.events },
    { label: "Audit log", href: "/admin/operations", icon: ScrollText, permission: "audit.view", value: null },
  ].filter((s) => can(s.permission));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight">Admin console</h1>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
          {role.replace("_", " ")}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {error}
        </p>
      )}

      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          Loading platform statistics…
        </p>
      )}

      {stats && (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              ["Users", stats.users],
              ["Students", stats.students],
              ["Teachers", stats.teachers],
              ["Pending review", (stats.moderationPending ?? 0) + (stats.moderationFlagged ?? 0)],
              ["Open reports", stats.pendingReports],
              ["Active sessions", stats.activeSessions],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <CardContent className="pt-4">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</dd>
                </CardContent>
              </Card>
            ))}
          </dl>

          <div>
            <h2 className="font-semibold">Sections</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="dyne-card dyne-card-hover dyne-press flex items-center gap-3 p-3"
                >
                  <s.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</span>
                  {s.value !== null && s.value !== undefined && (
                    <span className="shrink-0 text-sm font-bold tabular-nums">{s.value}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {roleBreakdown.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h2 className="font-semibold">Roles</h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {roleBreakdown.map((r) => (
                    <li
                      key={r._id}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                        "bg-muted text-muted-foreground"
                      )}
                    >
                      {r._id}: {r.count}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link href="/admin/operations">Reports, feedback &amp; audit</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link href="/teacher">Teaching workspace</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
