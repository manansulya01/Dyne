"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { ArrowLeft, FileBarChart, Users } from "lucide-react";

/**
 * Teacher's student list.
 *
 * Scoped to the classes the teacher actually teaches (server-derived), paged,
 * and every row links to the student's report — which is separately authorized.
 */

interface StudentRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  class_grade: string | null;
}

export function TeacherStudentsClient({
  initialStudents,
  initialTotal,
  initialHasMore,
  classes,
}: {
  initialStudents: StudentRow[];
  initialTotal: number;
  initialHasMore: boolean;
  classes: string[];
}) {
  const [students, setStudents] = useState<StudentRow[]>(initialStudents);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (offset: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "25", offset: String(offset) });
      if (debounced) params.set("search", debounced);
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
  }, [debounced]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-scoped server-state sync
    void load(0);
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-4 sm:px-4">
      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
        <Link href="/teacher">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Teaching workspace
        </Link>
      </Button>

      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">My students</h1>
        <p className="text-sm text-muted-foreground">
          {total} student{total === 1 ? "" : "s"} in your classes
          {classes.length > 0 ? ` (${classes.join(", ")})` : ""}.
        </p>
      </div>

      <div>
        <label htmlFor="teacher-student-search" className="sr-only">
          Search students
        </label>
        <Input
          id="teacher-student-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or username…"
          maxLength={100}
          className="min-h-[44px]"
        />
      </div>

      {students.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <Users className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No students in scope</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {debounced
              ? "No student matches this search."
              : "You have no class assignments or exams yet, so no students are in scope."}
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
                    <Link href={`/reports/students/${s.id}`}>
                      <FileBarChart className="h-4 w-4" aria-hidden="true" /> Report
                    </Link>
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
    </div>
  );
}
