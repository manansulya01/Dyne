"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  GraduationCap,
  Users,
  BookOpen,
  Clapperboard,
  ClapperboardIcon,
  Megaphone,
  FileBarChart,
  Newspaper,
  Images,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

/**
 * Teacher (and admin) dashboard.
 *
 * Every tile is fetched from real endpoints; counts that the backend cannot
 * compute are shown as "No data" rather than a placeholder number.
 */

interface Totals {
  users: number;
  students: number;
  teachers: number;
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

export function TeacherDashboard({ role, userId }: { role: string; userId: string }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [assignments, setAssignments] = useState<
    Array<{ id: string; title: string; class_grade: string; due_date: string | null; assigned_count: number; completed_count: number; status: string }>
  >([]);
  const [exams, setExams] = useState<
    Array<{ id: string; title: string; class_grade: string; question_count: number; status: string; starts_at: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, assignRes, examRes] = await Promise.all([
          fetch("/api/admin/analytics"),
          fetch("/api/class-assignments?limit=6"),
          fetch("/api/class-exams?limit=6"),
        ]);
        const stats = statsRes.ok ? await statsRes.json() : null;
        const assign = assignRes.ok ? await assignRes.json() : null;
        const exam = examRes.ok ? await examRes.json() : null;
        if (cancelled) return;
        setTotals(stats?.stats ?? null);
        setAssignments(assign?.assignments ?? []);
        setExams(exam?.exams ?? []);
      } catch {
        if (!cancelled) setError("Could not load the teacher dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading teacher dashboard">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const pendingReview = (totals?.moderationPending ?? 0) + (totals?.moderationFlagged ?? 0);

  const tiles = [
    { label: "Assignments", value: totals?.classAssignments ?? null, href: "/teacher/assignments", icon: ClipboardList },
    { label: "Exams", value: totals?.classExams ?? null, href: "/teacher/exams", icon: GraduationCap },
    { label: "Students", value: totals?.students ?? null, href: "/teacher/students", icon: Users },
    { label: "Study materials", value: totals?.studyMaterials ?? null, href: "/study-materials", icon: BookOpen },
    { label: "Videos", value: totals?.videos ?? null, href: "/videos", icon: Clapperboard },
    { label: "Reels", value: totals?.reels ?? null, href: "/reels", icon: ClapperboardIcon },
    { label: "Blogs", value: totals?.blogs ?? null, href: "/blogs", icon: Newspaper },
    { label: "Active stories", value: totals?.stories ?? null, href: "/stories", icon: Images },
    { label: "Announcements", value: null, href: "/announcements", icon: Megaphone },
    { label: "Student reports", value: null, href: "/reports/students", icon: FileBarChart },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Teaching workspace</h1>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
          {role.replace("_", " ")}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {error}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="dyne-card dyne-card-hover dyne-press block p-4"
            aria-label={`${t.label}${t.value !== null ? `: ${t.value}` : ""}`}
          >
            <dt className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <t.icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">
              {t.value === null ? <span className="text-base font-semibold text-muted-foreground">Open</span> : t.value}
            </dd>
          </Link>
        ))}
      </dl>

      {pendingReview > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {pendingReview} item{pendingReview === 1 ? "" : "s"} awaiting moderation review.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Recent assignments</h2>
              <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
                <Link href="/teacher/assignments">All</Link>
              </Button>
            </div>
            {assignments.length === 0 ? (
              <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                No assignments yet. Create one to start tracking completion.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {assignments.map((a) => {
                  const pct =
                    a.assigned_count > 0
                      ? Math.round((a.completed_count / a.assigned_count) * 100)
                      : null;
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/teacher/assignments/${a.id}`}
                        className="block rounded-xl bg-muted/60 p-3 hover:bg-muted"
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.title}</span>
                          <span className="shrink-0 rounded bg-background px-2 py-0.5 text-[11px]">
                            {a.class_grade}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div
                            className="h-2 flex-1 overflow-hidden rounded-full bg-background"
                            role="progressbar"
                            aria-valuenow={pct ?? 0}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${a.title} completion`}
                          >
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {pct === null ? "No data" : `${pct}%`}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Recent exams</h2>
              <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
                <Link href="/teacher/exams">All</Link>
              </Button>
            </div>
            {exams.length === 0 ? (
              <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                No exams yet. Build one with the flexible exam creator.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {exams.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/teacher/exams/${e.id}`}
                      className="block rounded-xl bg-muted/60 p-3 hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.title}</span>
                        <span className="shrink-0 rounded bg-background px-2 py-0.5 text-[11px]">
                          {e.class_grade}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.question_count} question{e.question_count === 1 ? "" : "s"} ·{" "}
                        <span className="capitalize">{e.status}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { href: "/teacher/assignments/new", label: "New assignment" },
              { href: "/teacher/exams/new", label: "New exam" },
              { href: "/announcements", label: "Announcement" },
              { href: "/videos/upload", label: "Upload video" },
              { href: "/reels/upload", label: "Upload reel" },
              { href: "/stories", label: "Post story" },
              { href: "/study-materials", label: "Study materials" },
              { href: "/reports/students", label: "Student reports" },
            ].map((a) => (
              <Button key={a.href} asChild variant="outline" size="sm" className="min-h-[44px]">
                <Link href={a.href}>{a.label}</Link>
              </Button>
            ))}
            {role === "admin" || role === "super_admin" ? (
              <Button asChild variant="outline" size="sm" className={cn("min-h-[44px]")}>
                <Link href="/admin/moderation">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Moderation centre
                </Link>
              </Button>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Signed in as <span className="font-medium">{userId}</span>. Every action here is authorized
            server-side and recorded in the audit log.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
