import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type CommunityMemberDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { requireProfile } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { listPosts } from "@/lib/db/posts";
import { listEvents } from "@/lib/db/events";
import { listTimetable } from "@/lib/db/content";
import {
  listAssignments,
  listCourses,
  listTasks,
  nextExam,
} from "@/lib/db/academic";
import { listGoals, listStudySessions, sessionEffectiveMs } from "@/lib/db/productivity";
import type { StudySessionDoc } from "@/lib/mongo/collections";
import {
  toAssignmentJSON,
  toCommunityJSON,
  toCourseJSON,
  toEventJSON,
  toExamJSON,
  toGoalJSON,
  toPostJSON,
  toTaskJSON,
} from "@/lib/db/contracts";
import { EmptyState } from "@/components/ui/EmptyState";
import { RichText } from "@/components/shared/RichText";
import { formatRelativeTime } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardList,
  GraduationCap,
  ListTodo,
  Sparkles,
  Timer,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard - Dyne",
  description: "Your personal campus command center",
};

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function fmtTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(+d)) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDay(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(+d)) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function examCountdown(iso: Date | string): string {
  const t = new Date(iso).getTime() - Date.now();
  if (isNaN(t) || t <= 0) return "Now";
  const d = Math.floor(t / 86400000);
  const h = Math.floor((t % 86400000) / 3600000);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${Math.floor((t % 3600000) / 60000)}m`;
  return "Soon";
}

function fmtMinutes(secs: number): string {
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const db = await getDb();
  await ensureIndexes(db);

  const uid = toObjectId(profile._id);
  const now = new Date();
  const todayDow = now.getDay();
  // Teachers and admins get the teaching workspace as their landing view; the
  // student dashboard below stays focused on personal academic work.
  if (hasPermission(profile.role as never, "assignments.create" as never)) {
    redirect("/teacher");
  }

  const name = profile.displayName || profile.username || "there";
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [
    timetableRows, eventRows, postRows, memberships, materials,
    todayTasks, assignments, goals, examRow, sessions, courses,
  ] = await Promise.all([
    listTimetable(db, profile.classGrade ?? undefined).catch(() => []),
    listEvents(db, uid, 6, { isAdmin: profile.role === "admin" || profile.role === "super_admin" }).catch(() => []),
    listPosts(db, { limit: 5 }).catch(() => []),
    col<CommunityMemberDoc>(db, "communityMembers").find({ userId: uid }).limit(50).toArray().catch(() => []),
    col(db, "studyMaterials")
      .find({ isRemoved: { $ne: true }, status: "approved" })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray()
      .catch(() => []),
    listTasks(db, uid, { view: "today", limit: 6 }).catch(() => []),
    listAssignments(db, uid, { status: "open", limit: 4 }).catch(() => []),
    listGoals(db, uid, { status: "open", limit: 3 }).catch(() => []),
    nextExam(db, uid).catch(() => null),
    listStudySessions(db, uid, { from: weekStart, limit: 100 }).catch(() => []),
    listCourses(db, uid, 6).catch(() => []),
  ]);

  const todaysClasses = (timetableRows as Array<Record<string, unknown>>).filter(
    (t) => Number(t.dayOfWeek) === todayDow
  );
  const upcomingEvents = (eventRows as Array<Record<string, unknown>>)
    .filter((e) => {
      const s = e.startTime as Date | string | undefined;
      if (!s) return false;
      const d = s instanceof Date ? s : new Date(s);
      return !isNaN(+d) && d >= new Date(now.getTime() - 6 * 3600 * 1000);
    })
    .slice(0, 4);

  const memberCommunityIds = memberships.map((m) => m.communityId);
  const myCommunities =
    memberCommunityIds.length > 0
      ? await col(db, "communities")
          .find({ _id: { $in: memberCommunityIds } })
          .limit(6)
          .toArray()
          .catch(() => [])
      : [];

  const mapJSON = <T,>(rows: unknown[], fn: (r: Record<string, unknown>) => T): T[] =>
    (rows as Array<Record<string, unknown>>).map((r) => {
      try { return fn(r); } catch { return null; }
    }).filter((x): x is NonNullable<typeof x> => x !== null);

  const posts = mapJSON(postRows as Array<Record<string, unknown>>, toPostJSON);
  const events = mapJSON(upcomingEvents, toEventJSON);
  const communities = mapJSON(myCommunities as Array<Record<string, unknown>>, toCommunityJSON);
  const tasks = mapJSON(todayTasks as Array<Record<string, unknown>>, toTaskJSON).slice(0, 5);
  const upcomingAssignments = mapJSON(assignments as Array<Record<string, unknown>>, toAssignmentJSON);
  const activeGoals = mapJSON(goals as Array<Record<string, unknown>>, toGoalJSON);
  const courseList = mapJSON(courses as Array<Record<string, unknown>>, toCourseJSON);
  const exam = examRow ? toExamJSON(examRow as unknown as Record<string, unknown>) : null;

  const studyTodaySecs = (sessions as StudySessionDoc[]).reduce((sum, s) => {
    if (s.status === "cancelled" || new Date(s.startedAt) < dayStart) return sum;
    return sum + Math.floor(sessionEffectiveMs(s, now) / 1000);
  }, 0);

  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const stats = [
    { label: "Classes today", value: String(todaysClasses.length), href: "/schedule", icon: CalendarClock },
    { label: "Tasks due today", value: String(tasks.length), href: "/tasks", icon: ListTodo },
    { label: "Studied today", value: fmtMinutes(studyTodaySecs), href: "/study-sessions", icon: Timer },
    { label: "Upcoming events", value: String(events.length), href: "/events", icon: CalendarDays },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-6 pt-5 sm:px-5">
      <p className="dyne-eyebrow">{dateLine}</p>
      <h1 className="dyne-page-title mt-1">
        {greetingFor(now.getHours())}, {name}.
      </h1>
      <p className="dyne-page-subtitle mt-1">
        What you need to know right now — all live from Dyne.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="dyne-card dyne-card-hover dyne-press block p-4"
            aria-label={`${s.label}: ${s.value}`}
          >
            <dt className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <s.icon className="h-4 w-4" aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{s.value}</dd>
          </Link>
        ))}
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <DashSection title="Today's tasks" href="/tasks" linkLabel="All tasks">
          {tasks.length === 0 ? (
            <EmptyDash text="No tasks due today." />
          ) : (
            <ul className="space-y-1.5">
              {tasks.map((t) => (
                <li key={String(t.id)} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                  {t.completed_at
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{String(t.title)}</span>
                  <Priority pill={String(t.priority)} />
                </li>
              ))}
            </ul>
          )}
        </DashSection>

        <section aria-label="Next exam" className="dyne-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="dyne-section-title flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" /> Next exam
            </h2>
            <Link href="/exams" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline">
              All exams <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {!exam ? (
            <div className="mt-1"><EmptyState icon={GraduationCap} title="No upcoming exams" description="Add exam dates to see a live countdown here." /></div>
          ) : (
            <div className="mt-3">
              <p className="truncate text-[15px] font-bold">{String(exam.title)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {exam.course ? `${String((exam.course as { name: string }).name)} · ` : ""}
                {fmtDay(exam.date as Date | string)} · {fmtTime(exam.date as Date | string)}
              </p>
              <p className="mt-1.5 inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                {examCountdown(exam.date as Date | string)}
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={typeof exam.preparation === "number" ? exam.preparation : 0} aria-valuemin={0} aria-valuemax={100} aria-label="Exam preparation">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${typeof exam.preparation === "number" ? exam.preparation : 0}%` }} />
                </div>
                <span className="text-xs font-bold tabular-nums">{typeof exam.preparation === "number" ? exam.preparation : 0}%</span>
              </div>
            </div>
          )}
        </section>

        <DashSection title="Today's schedule" href="/schedule" linkLabel="Full schedule">
          {todaysClasses.length === 0 ? (
            <EmptyDash text="No classes today." />
          ) : (
            <ul className="space-y-1.5">
              {todaysClasses.slice(0, 5).map((t, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2">
                  <span className="w-20 shrink-0 text-xs font-semibold tabular-nums">{String(t.startTime ?? "")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{String(t.subject ?? "Class")}</span>
                    {t.room ? <span className="block truncate text-xs text-muted-foreground">Room {String(t.room)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashSection>

        <DashSection title="Upcoming assignments" href="/assignments" linkLabel="All assignments">
          {upcomingAssignments.length === 0 ? (
            <EmptyDash text="Nothing open. Enjoy the calm." />
          ) : (
            <ul className="space-y-1.5">
              {upcomingAssignments.map((a) => (
                <li key={String(a.id)} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                  <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{String(a.title)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{typeof a.progress === "number" ? `${a.progress}%` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </DashSection>

        <DashSection title="Active goals" href="/goals" linkLabel="All goals">
          {activeGoals.length === 0 ? (
            <EmptyDash text="No active goals. Set one to get moving." />
          ) : (
            <ul className="space-y-2.5">
              {activeGoals.map((g) => {
                const pct = typeof g.target === "number" && g.target > 0
                  ? Math.min(100, Math.round((Number(g.current ?? 0) / Number(g.target)) * 100)) : 0;
                return (
                  <li key={String(g.id)}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{String(g.title)}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{String(g.current ?? 0)}/{String(g.target)} {String(g.unit ?? "")}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${String(g.title)} progress`}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashSection>

        <DashSection title="Your courses" href="/courses" linkLabel="All courses">
          {courseList.length === 0 ? (
            <EmptyDash text="No courses yet. Add your subjects." />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {courseList.map((c) => (
                <li key={String(c.id)}>
                  <Link href={`/courses/${String(c.id)}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted">
                    {String(c.name)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashSection>

        <DashSection title="Upcoming events" href="/events" linkLabel="All events">
          {events.length === 0 ? (
            <EmptyDash text="No upcoming events." />
          ) : (
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={String(e.id)}>
                  <Link href={`/events/${String(e.id)}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted">
                    <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{String(e.title)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {fmtDay(e.start_time as Date | string)} · {fmtTime(e.start_time as Date | string)}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashSection>

        <DashSection title="Your communities" href="/communities" linkLabel="Discover">
          {communities.length === 0 ? (
            <EmptyDash text="You haven't joined any communities yet." />
          ) : (
            <ul className="space-y-1.5">
              {communities.map((c) => (
                <li key={String(c.id)}>
                  <Link href={`/communities/${String(c.slug)}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold">
                      {String(c.name).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{String(c.name)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashSection>
      </div>

      <section aria-label="Fresh from campus" className="dyne-card mt-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="dyne-section-title flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" /> Fresh from campus
          </h2>
          <Link href="/feed" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline">
            Open feed <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {posts.length === 0 ? (
          <div className="mt-1"><EmptyState icon={Sparkles} title="No posts yet" description="Be the first to share something with campus today." /></div>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {posts.slice(0, 3).map((p) => (
              <li key={String(p.id)} className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{p.author?.display_name || p.author?.username || "Someone"}</span>
                  {" "}· <time>{formatRelativeTime(p.created_at as Date | string)}</time>
                </p>
                {typeof p.content === "string" && p.content ? (
                  <RichText text={p.content} className="dyne-line-3 mt-1 whitespace-pre-wrap break-words text-sm" />
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Shared media with campus.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(materials as Array<Record<string, unknown>>).length > 0 && (
        <section aria-label="New study materials" className="dyne-card mt-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="dyne-section-title flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" /> New study materials
            </h2>
            <Link href="/study-materials" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline">
              Library <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {(materials as Array<Record<string, unknown>>).map((m) => (
              <li key={String(m.id ?? m._id)} className="rounded-xl bg-muted/60 px-3 py-2.5">
                <p className="truncate text-sm font-semibold">{String(m.title ?? "Untitled")}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {String(m.subject ?? "")}{m.classGrade ? ` · ${String(m.classGrade)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link href="/analytics" className="inline-flex min-h-[44px] items-center gap-1 font-medium text-primary hover:underline">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> See your analytics
        </Link>
      </p>
    </div>
  );
}

function DashSection({ title, href, linkLabel, children }: {
  title: string; href: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="dyne-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="dyne-section-title">{title}</h2>
        <Link href={href} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline">
          {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyDash({ text }: { text: string }) {
  return <p className="rounded-xl bg-muted/60 px-3 py-3 text-sm text-muted-foreground">{text}</p>;
}

function Priority({ pill }: { pill: string }) {
  const cls = pill === "urgent"
    ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : pill === "high"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {pill}
    </span>
  );
}
