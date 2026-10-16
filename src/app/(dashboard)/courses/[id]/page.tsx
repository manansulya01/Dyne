import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { requireProfile } from "@/lib/auth/server";
import {
  courseCounts,
  getCourse,
  listAssignments,
  listExams,
  listNotes,
  listTasks,
} from "@/lib/db/academic";
import { col } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import {
  toAssignmentJSON,
  toCourseJSON,
  toExamJSON,
  toNoteJSON,
  toStudyMaterialJSON,
  toTaskJSON,
} from "@/lib/db/contracts";
import { EmptyState } from "@/components/ui/EmptyState";
import { CourseDot, ProgressBar } from "@/components/academic/bits";
import { ArrowRight, BookOpen, ClipboardList, FileText, GraduationCap, ListTodo, NotebookPen } from "lucide-react";

export const metadata: Metadata = {
  title: "Course - Dyne",
  description: "Course overview",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const db = await getDb();
  await ensureIndexes(db);

  let row = null;
  try {
    row = await getCourse(db, profile._id, id);
  } catch {
    return notFound();
  }
  if (!row) return notFound();

  const [counts, tasks, assignments, exams, notes, materials] = await Promise.all([
    courseCounts(db, profile._id, id),
    listTasks(db, profile._id, { view: "all", courseId: id, limit: 6 }),
    listAssignments(db, profile._id, { status: "open", courseId: id, limit: 6 }),
    listExams(db, profile._id, { view: "upcoming", courseId: id, limit: 5 }),
    listNotes(db, profile._id, { courseId: id, limit: 5 }),
    col(db, "studyMaterials")
      .find({ uploaderId: toObjectId(profile._id), isRemoved: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()
      .catch(() => []),
  ]);

  const rec = row as unknown as Record<string, unknown>;
  const course = toCourseJSON({ ...rec, counts });
  const openTasks = tasks.map((t) => toTaskJSON(t as unknown as Record<string, unknown>));
  const openAssignments = assignments.map((a) => toAssignmentJSON(a as unknown as Record<string, unknown>));
  const upcomingExams = exams.map((e) => toExamJSON(e as unknown as Record<string, unknown>));
  const courseNotes = notes.map((n) => toNoteJSON(n as unknown as Record<string, unknown>));
  const courseMaterials = (materials as Array<Record<string, unknown>>)
    .map((m) => { try { return toStudyMaterialJSON(m); } catch { return null; } })
    .filter((m): m is NonNullable<typeof m> => !!m);

  const avgProgress = openAssignments.length > 0
    ? Math.round(openAssignments.reduce((s, a) => s + (typeof a.progress === "number" ? a.progress : 0), 0) / openAssignments.length)
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-4 sm:px-4">
      <Link href="/courses" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        ← All courses
      </Link>
      <div className="mt-1 flex items-center gap-2.5">
        <CourseDot color={String(course.color)} className="h-4 w-4" />
        <h1 className="dyne-page-title">{String(course.name)}</h1>
      </div>
      <p className="dyne-page-subtitle mt-1">
        {[course.code, course.instructor, course.semester, course.room ? `Room ${course.room}` : null].filter(Boolean).join(" · ") || "Course overview"}
      </p>
      {typeof course.description === "string" && course.description && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{course.description}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open tasks", value: counts.open_tasks, icon: ListTodo, href: "/tasks" },
          { label: "Open assignments", value: counts.open_assignments, icon: ClipboardList, href: "/assignments" },
          { label: "Upcoming exams", value: counts.upcoming_exams, icon: GraduationCap, href: "/exams" },
          { label: "Notes", value: counts.notes, icon: NotebookPen, href: "/notes" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="dyne-card dyne-card-hover block p-4">
            <dt className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
              <s.icon className="h-4 w-4" aria-hidden="true" /> {s.label}
            </dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{s.value}</dd>
          </Link>
        ))}
      </dl>

      {avgProgress !== null && (
        <section aria-label="Assignment progress" className="dyne-card mt-4 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Assignment progress</span>
            <span className="font-bold tabular-nums">{avgProgress}%</span>
          </div>
          <div className="mt-2"><ProgressBar value={avgProgress} label="Average assignment progress" /></div>
        </section>
      )}

      {course.schedule.length > 0 && (
        <section aria-label="Weekly schedule" className="dyne-card mt-4 p-4">
          <h2 className="dyne-section-title">Weekly schedule</h2>
          <ul className="mt-2 space-y-1.5">
            {course.schedule.map((s, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                <span className="w-10 font-semibold">{DAYS[s.dayOfWeek] ?? ""}</span>
                <span className="tabular-nums text-muted-foreground">{s.startTime} – {s.endTime}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DetailList
          title="Open tasks"
          href="/tasks"
          icon={ListTodo}
          empty="No open tasks for this course."
          items={openTasks.filter((t) => !t.completed_at).map((t) => ({ id: String(t.id), primary: String(t.title), secondary: null }))}
        />
        <DetailList
          title="Open assignments"
          href="/assignments"
          icon={ClipboardList}
          empty="No open assignments for this course."
          items={openAssignments.map((a) => ({ id: String(a.id), primary: String(a.title), secondary: typeof a.due_date === "string" ? new Date(a.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null }))}
        />
        <DetailList
          title="Upcoming exams"
          href="/exams"
          icon={GraduationCap}
          empty="No upcoming exams for this course."
          items={upcomingExams.map((e) => ({ id: String(e.id), primary: String(e.title), secondary: typeof e.date === "string" || e.date instanceof Date ? new Date(e.date as string | Date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null }))}
        />
        <DetailList
          title="Notes"
          href="/notes"
          icon={NotebookPen}
          empty="No notes for this course yet."
          items={courseNotes.map((n) => ({ id: String(n.id), primary: String(n.title), secondary: null }))}
        />
      </div>

      <section aria-label="Study materials" className="dyne-card mt-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="dyne-section-title flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" aria-hidden="true" /> Your uploads</h2>
          <Link href="/study-materials" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline">
            Library <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {courseMaterials.length === 0 ? (
          <div className="mt-1"><EmptyState icon={FileText} title="No materials uploaded" description="Upload notes, worksheets, and references from Study Materials." /></div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {courseMaterials.slice(0, 5).map((m) => (
              <li key={String(m.id)} className="truncate rounded-xl bg-muted/60 px-3 py-2 text-sm font-medium">
                {String(m.title)} <span className="text-xs font-normal text-muted-foreground">· {String(m.subject)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DetailList({ title, href, icon: Icon, empty, items }: {
  title: string;
  href: string;
  icon: typeof ListTodo;
  empty: string;
  items: Array<{ id: string; primary: string; secondary: string | null }>;
}) {
  return (
    <section aria-label={title} className="dyne-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="dyne-section-title flex items-center gap-2"><Icon className="h-5 w-5 text-primary" aria-hidden="true" /> {title}</h2>
        <Link href={href} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary hover:underline">
          Open <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.slice(0, 5).map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <span className="truncate font-medium">{i.primary}</span>
              {i.secondary && <span className="shrink-0 text-xs text-muted-foreground">{i.secondary}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
