"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatBytes } from "@/lib/utils";

interface Material {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  class_grade: string;
  topic: string | null;
  material_type: string;
  tags: string[];
  teacher: string | null;
  semester: string | null;
  academic_year: string | null;
  uploader_id: string;
  uploader: { username: string; display_name: string | null } | null;
  mime: string;
  size: number;
  file_name: string;
  download_url: string;
  is_featured: boolean;
  created_at: string;
}

const TYPES = ["notes", "worksheet", "assignment", "question_paper", "revision", "reference", "presentation", "other"];

export function StudyMaterialsClient() {
  const [items, setItems] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [classGrade, setClassGrade] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [teacher, setTeacher] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "saved">("newest");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const load = useCallback(async (append = false) => {
    if (append) {
      if (!cursorRef.current) return;
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (subject) p.set("subject", subject);
      if (classGrade) p.set("classGrade", classGrade);
      if (materialType) p.set("materialType", materialType);
      if (teacher) p.set("teacher", teacher);
      if (sort === "saved") p.set("saved", "true");
      else p.set("sort", sort);
      p.set("limit", "30");
      if (append && cursorRef.current) p.set("cursor", cursorRef.current);
      const res = await fetch(`/api/study-materials?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setCanUpload(data.canUpload === true);
      if (data.canUpload !== true) setShowUpload(false);
      const list = data.materials ?? [];
      setItems((prev) => (append ? [...prev, ...list] : list));
      cursorRef.current = data.cursor ?? null;
      setHasMore(!!data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [search, subject, classGrade, materialType, teacher, sort]);

  useEffect(() => {
    const t = setTimeout(() => void load(false), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Study Materials</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Notes, worksheets, assignments and revision material shared by campus.
          </p>
        </div>
        {canUpload && (
          <Button onClick={() => setShowUpload((v) => !v)} className="min-h-[44px]">
            {showUpload ? "Close upload" : "Upload material"}
          </Button>
        )}
      </div>

      {canUpload && showUpload && <UploadForm onDone={() => { setShowUpload(false); void load(false); }} /> }

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="sm-search" className="sr-only">Search materials</label>
          <Input id="sm-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, subject…" className="min-h-[44px]" />
        </div>
        <div>
          <label htmlFor="sm-subject" className="sr-only">Filter by subject</label>
          <Input id="sm-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (e.g. Physics)" className="min-h-[44px]" />
        </div>
        <div>
          <label htmlFor="sm-grade" className="sr-only">Filter by class or grade</label>
          <Input id="sm-grade" value={classGrade} onChange={(e) => setClassGrade(e.target.value)} placeholder="Class/grade (e.g. 10-A)" className="min-h-[44px]" />
        </div>
        <div>
          <label htmlFor="sm-type" className="sr-only">Filter by material type</label>
          <select id="sm-type" value={materialType} onChange={(e) => setMaterialType(e.target.value)} className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sm-teacher" className="sr-only">Filter by teacher</label>
          <Input id="sm-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Teacher (optional)" className="min-h-[44px]" />
        </div>
        <div>
          <label htmlFor="sm-sort" className="sr-only">Sort materials</label>
          <select id="sm-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="min-h-[44px] w-full rounded-xl border border-input bg-background px-3 text-sm">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="saved">Saved by me</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12" role="status" aria-label="Loading study materials">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{error}</p>
          <Button variant="outline" className="mt-2 min-h-[44px]" onClick={() => void load(false)}>Retry</Button>        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">{sort === "saved" ? "No saved materials" : "No materials yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {sort === "saved"
              ? "Tap Save on any material to build your reading list."
              : "New notes, worksheets and study material will appear here when teachers share them."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Study materials">
          {items.map((m) => (
            <MaterialCard key={m.id} material={m} saved={savedIds.has(m.id)} onToggleSave={(id, next) => {
              setSavedIds((prev) => {
                const copy = new Set(prev);
                if (next) copy.add(id);
                else copy.delete(id);
                return copy;
              });
              if (sort === "saved" && !next) setItems((prev) => prev.filter((x) => x.id !== id));
            }} />
          ))}
        </ul>
      )}
      {hasMore && items.length > 0 && !isLoading && !error && (
        <Button variant="outline" className="min-h-[48px] w-full" onClick={() => void load(true)} disabled={isLoadingMore}>
          {isLoadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

function MaterialCard({ material: m, saved, onToggleSave }: { material: Material; saved: boolean; onToggleSave: (id: string, next: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const isImage = m.mime.startsWith("image/");
  const isPdf = m.mime === "application/pdf";
  const canPreview = isImage || isPdf;
  const toggleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/study-materials/${m.id}/save`, { method: saved ? "DELETE" : "POST" });
      if (res.ok) onToggleSave(m.id, !saved);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li>
      <Card className={m.is_featured ? "border-primary/40" : undefined}>
        <CardContent className="space-y-2 pt-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{m.title}</p>
              <p className="text-xs text-muted-foreground">
                {m.subject} · {m.class_grade} · {m.material_type.replace("_", " ")}
                {m.teacher ? ` · ${m.teacher}` : ""}
                {m.semester ? ` · ${m.semester}` : ""}
                {m.academic_year ? ` · ${m.academic_year}` : ""}
              </p>
            </div>
            {m.is_featured && <Badge>Featured</Badge>}
          </div>
          {m.description && <p className="line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
          <div className="flex flex-wrap gap-1">
            {m.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
          </div>
          <p className="text-xs text-muted-foreground">
            by {m.uploader?.display_name || m.uploader?.username || "campus member"} · {formatBytes(m.size)} · {m.file_name}
          </p>
          {preview && canPreview && (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded preview; dimensions unknown until loaded
                <img src={m.download_url} alt={`${m.title} preview`} className="max-h-96 w-full object-contain" loading="lazy" />
              ) : (
                <iframe src={m.download_url} title={`${m.title} preview`} className="h-96 w-full bg-white" loading="lazy" />
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={m.download_url} className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90" download>
              Download
            </a>
            {canPreview && (
              <button
                onClick={() => setPreview((v) => !v)}
                aria-expanded={preview}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {preview ? "Hide preview" : "Preview"}
              </button>
            )}
            <button
              onClick={toggleSave}
              disabled={busy}
              aria-pressed={saved}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
            <ReportMaterialButton id={m.id} />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function ReportMaterialButton({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  if (done) return <span className="inline-flex min-h-[44px] items-center text-xs text-muted-foreground">Reported — thanks</span>;
  return (
    <button
      onClick={async () => {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType: "study_material", targetId: id, reason: "other", description: "Study material report from study page" }),
        });
        if (res.ok) setDone(true);
      }}
      className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-3 text-xs text-muted-foreground hover:bg-muted"
    >
      Report
    </button>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ title: "", subject: "", classGrade: "", topic: "", materialType: "notes", description: "", tags: "", teacher: "", semester: "", academicYear: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Choose a file to upload"); return; }
    // Instant client pre-checks (server re-validates everything: MIME +
    // extension consistency, 50MB limit, executable blocklist).
    if (file.size > 50 * 1024 * 1024) { setError("File exceeds the 50MB limit"); return; }
    if (file.size <= 0) { setError("Empty file"); return; }
    const blocked = ["exe", "msi", "bat", "cmd", "ps1", "sh", "js", "mjs", "html", "htm", "svg", "php", "py", "jar", "apk", "dmg", "iso"];
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (blocked.includes(ext)) { setError(`.${ext} files are never allowed`); return; }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("bucket", "study-materials");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upJson = await up.json();
      if (!up.ok) throw new Error(typeof upJson.error === "string" ? upJson.error : "Upload failed");
      // /api/upload stages into pendingMedia for posts; study-materials uses the
      // driver key/url directly. Re-upload through the study path requires the key.
      const media = upJson.media as { bucket: string; key: string; url: string };
      const res = await fetch("/api/study-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          subject: form.subject,
          classGrade: form.classGrade,
          topic: form.topic || undefined,
          materialType: form.materialType,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          teacher: form.teacher || undefined,
          semester: form.semester || undefined,
          academicYear: form.academicYear || undefined,
          bucket: "study-materials",
          key: media.key,
          url: media.url,
          mime: file.type || "application/octet-stream",
          size: file.size,
          fileName: file.name,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : JSON.stringify(json.error));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl border border-border p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" required maxLength={200} className="min-h-[44px]" aria-label="Title" />
        <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" required maxLength={100} className="min-h-[44px]" aria-label="Subject" />
        <Input value={form.classGrade} onChange={(e) => setForm({ ...form, classGrade: e.target.value })} placeholder="Class/grade" required maxLength={50} className="min-h-[44px]" aria-label="Class or grade" />
        <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Topic (optional)" maxLength={100} className="min-h-[44px]" aria-label="Topic" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })} className="min-h-[44px] rounded-xl border border-input bg-background px-3 text-sm" aria-label="Material type">
          {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        <Input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} placeholder="Teacher (optional)" maxLength={100} className="min-h-[44px]" aria-label="Teacher" />
        <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma separated)" className="min-h-[44px]" aria-label="Tags" />
        <Input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} placeholder="Semester (optional)" maxLength={30} className="min-h-[44px]" aria-label="Semester" />
        <Input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} placeholder="Academic year (e.g. 2026-27)" maxLength={20} className="min-h-[44px]" aria-label="Academic year" />
      </div>
      <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" maxLength={2000} className="min-h-[44px]" aria-label="Description" />
      <div>
        <label htmlFor="sm-file" className="text-sm font-medium">File (PDF, images, docs, slides — max 50MB, no executables)</label>
        <input id="sm-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full min-h-[44px] text-sm" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.doc,.docx,.ppt,.pptx" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="min-h-[48px] w-full">{busy ? "Uploading…" : "Upload study material"}</Button>
    </form>
  );
}
