"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { ArrowLeft, FileBarChart, Search, Users } from "lucide-react";

/**
 * Student report index.
 *
 * A student only ever sees their own report card. Teachers see the students in
 * the classes they actually teach; admins see everyone. The list is paged —
 * it never loads the whole campus.
 */

interface StudentRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  class_grade: string | null;
  created_at: string;
}

export function StudentReportsIndex({
  canList,
  selfId,
  initialStudents,
  initialTotal,
  initialHasMore,
  taughtClasses,
}: {
  canList: boolean;
  selfId: string;
  initialStudents: StudentRow[];
  initialTotal: number;
  initialHasMore: boolean;
  taughtClasses: string[];
}) {
  const [students, setStudents] = useState<StudentRow[]>(initialStudents);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [classGrade, setClassGrade] = useState("");
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = async (offset: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "25", offset: String(offset) });
      if (debounced) params.set("search", debounced);
      if (classGrade) params.set("classGrade", classGrade);
      const res = await fetch(`/api/student-reports?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) return;
      setTotal(data.total ?? 0);
      setHasMore(Boolean(data.hasMore));
      setStudents((prev) => {
        if (!append) return data.students ?? [];
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...(data.students ?? []).filter((s: StudentRow) => !seen.has(s.id))];
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canList) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced/classGrade are the intended triggers; `load` is stable per filter set
  }, [debounced, classGrade, canList]);

  if (!canList) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">My report</h1>
        <p className="text-sm text-muted-foreground">
          Your academic and campus activity report. Only you (and the teachers authorized to teach you)
          can read it.
        </p>
        <Button asChild className="min-h-[44px]">
          <Link href={`/reports/students/${selfId}`}>
            <FileBarChart className="h-4 w-4" aria-hidden="true" /> Open my report
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
        </Link>
      </Button>

      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Student reports</h1>
        <p className="text-sm text-muted-foreground">
          {total} student{total === 1 ? "" : "s"} you are authorized to view
          {taughtClasses.length > 0 ? ` · classes: ${taughtClasses.join(", ")}` : ""}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-52 flex-1">
          <label htmlFor="report-search" className="sr-only">
            Search students
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              id="report-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or username…"
              maxLength={100}
              className="min-h-[44px] border-0 px-0 focus-visible:ring-0"
            />
          </div>
        </div>
        {taughtClasses.length > 0 && (
          <div className="min-w-40">
            <label htmlFor="report-class" className="sr-only">
              Filter by class
            </label>
            <select
              id="report-class"
              value={classGrade}
              onChange={(e) => setClassGrade(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">All classes</option>
              {taughtClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {students.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <Users className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No students in scope</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {debounced || classGrade
              ? "No student matches this filter."
              : "You are not assigned to any class with students yet."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {students.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 pt-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={s.avatar_url || ""} alt="" />
                    <AvatarFallback name={s.display_name || s.username} />
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.display_name || s.username}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{s.username}
                      {s.class_grade ? ` · ${s.class_grade}` : ""}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="min-h-[44px]">
                    <Link href={`/reports/students/${s.id}`}>Open report</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {hasMore && students.length > 0 && (
        <Button
          variant="outline"
          className="min-h-[48px] w-full"
          disabled={loading}
          onClick={() => void load(students.length, true)}
        >
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}

      <p className={cn("text-xs text-muted-foreground")}>
        Reports contain academic and activity data. Every view of another student&apos;s report is written
        to the audit log.
      </p>
    </div>
  );
}
