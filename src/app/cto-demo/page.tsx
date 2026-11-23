"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, Bell, Bookmark, BookOpen, CheckCircle2,
  ChevronRight, Clock3, Compass, FileText, GraduationCap, HardDrive,
  Heart, Library, MessageCircle, MoreHorizontal, Plus, Search, Send,
  ShieldCheck, Sparkles, Trash2, Upload, Users, Video, Wifi, X, Zap,
} from "lucide-react";

type Post = {
  id: number; name: string; handle: string; initials: string; role: string;
  time: string; body: string; category: string; likes: number; comments: number;
  liked: boolean; color: string;
};
type Material = {
  id: string; title: string; fileName: string; subject: string; grade: string;
  mime: string; size: number; blob: Blob; createdAt: number; transferMs: number;
};
type View = "feed" | "materials" | "communities" | "events" | "watch";

const seedPosts: Post[] = [
  { id: 1, name: "Aarav Mehta", handle: "aarav.m", initials: "AM", role: "Grade 10 · Student", time: "12 min ago", body: "The energy at today's robotics showcase was unreal. Huge respect to every team that presented!", category: "Campus life", likes: 48, comments: 12, liked: false, color: "from-cyan-400/30 to-blue-500/10" },
  { id: 2, name: "MVA Science Club", handle: "mva.science", initials: "SC", role: "Official club", time: "38 min ago", body: "Registrations are open for the Inter-House Science Challenge. Build a team of 3 and bring your best idea. Sign-ups close Friday!", category: "Clubs", likes: 76, comments: 21, liked: false, color: "from-violet-400/30 to-fuchsia-500/10" },
  { id: 3, name: "Diya Sharma", handle: "diya.s", initials: "DS", role: "Grade 9 · Student", time: "1 hr ago", body: "Library study session after school today? I'm revising physics — anyone is welcome to join.", category: "Study", likes: 31, comments: 8, liked: false, color: "from-emerald-400/30 to-teal-500/10" },
];
const groups = [
  { name: "MVA Science Club", members: 248, initials: "SC", description: "Experiments, robotics and science challenges.", color: "bg-violet-500/20 text-violet-200" },
  { name: "The Creative Circle", members: 186, initials: "CC", description: "Art, photography, writing and design.", color: "bg-pink-500/20 text-pink-200" },
  { name: "Football & Sports", members: 312, initials: "FS", description: "Fixtures, teams, training and campus sports.", color: "bg-emerald-500/20 text-emerald-200" },
];
const DB_NAME = "dyne-cto-materials";
const STORE_NAME = "materials";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif", "txt", "doc", "docx", "ppt", "pptx"]);

function openMaterialDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local demo library"));
  });
}
function saveMaterial(record: Material): Promise<void> {
  return openMaterialDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error ?? new Error("Local save failed")); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error ?? new Error("Local save was cancelled")); };
  }));
}
function readMaterials(): Promise<Material[]> {
  return openMaterialDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as Material[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error ?? new Error("Could not read local library"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { const error = tx.error; db.close(); reject(error ?? new Error("Local read failed")); };
  }));
}
function deleteMaterial(id: string): Promise<void> {
  return openMaterialDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error ?? new Error("Delete failed")); };
  }));
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
function formatMs(ms: number): string {
  if (ms < 1) return ms.toFixed(2);
  if (ms < 10) return ms.toFixed(2);
  return ms.toFixed(1);
}
function throughput(size: number, ms: number): string {
  if (ms <= 0) return "—";
  const rate = size / (1024 * 1024) / (ms / 1000);
  return rate >= 1000 ? (rate / 1000).toFixed(2) + " GB/s" : rate.toFixed(2) + " MB/s";
}
function seedMaterials(): Material[] {
  const samples = [
    { id: "sample-physics", title: "Motion & Laws of Motion — Revision Notes", fileName: "grade-10-physics-motion.txt", subject: "Physics", body: "MACRO VISION ACADEMY\nGRADE 10 · PHYSICS\n\nMOTION & LAWS OF MOTION — REVISION NOTES\n\n1. Distance is the total path travelled. Displacement is the shortest directed distance between initial and final positions.\n2. Speed = distance / time. Velocity = displacement / time.\n3. Acceleration = change in velocity / time.\n4. Newton's First Law: an object remains at rest or in uniform motion unless acted upon by a net external force.\n5. Newton's Second Law: F = ma.\n6. Newton's Third Law: every action has an equal and opposite reaction.\n\nPractice: A car accelerates from 0 to 20 m/s in 5 seconds. Find its acceleration.\n\nDEMO SAMPLE — NOT AN OFFICIAL SCHOOL HANDOUT." },
    { id: "sample-maths", title: "Quadratic Equations — Practice Worksheet", fileName: "grade-10-maths-quadratics.txt", subject: "Mathematics", body: "MACRO VISION ACADEMY\nGRADE 10 · MATHEMATICS\n\nQUADRATIC EQUATIONS — PRACTICE WORKSHEET\n\nSolve each equation:\n1. x² - 5x + 6 = 0\n2. 2x² + 7x + 3 = 0\n3. x² - 9 = 0\n4. 3x² - 12x = 0\n\nRemember: for ax² + bx + c = 0, the discriminant is D = b² - 4ac.\n\nDEMO SAMPLE — NOT AN OFFICIAL SCHOOL HANDOUT." },
    { id: "sample-biology", title: "Life Processes — Quick Revision", fileName: "grade-10-biology-life-processes.txt", subject: "Biology", body: "MACRO VISION ACADEMY\nGRADE 10 · BIOLOGY\n\nLIFE PROCESSES — QUICK REVISION\n\nNutrition: the process by which organisms obtain and use food.\nRespiration: release of energy from food molecules.\nTransportation: movement of materials within an organism.\nExcretion: removal of metabolic waste.\n\nPhotosynthesis: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ (in the presence of light and chlorophyll).\n\nDEMO SAMPLE — NOT AN OFFICIAL SCHOOL HANDOUT." },
  ];
  return samples.map((sample) => {
    const blob = new Blob([sample.body], { type: "text/plain" });
    return { id: sample.id, title: sample.title, fileName: sample.fileName, subject: sample.subject, grade: "Grade 10", mime: "text/plain", size: blob.size, blob, createdAt: Date.now() - (sample.id === "sample-physics" ? 1000 : sample.id === "sample-maths" ? 2000 : 3000), transferMs: 0 };
  });
}

export default function CtoDemoPage() {
  const [posts, setPosts] = useState(seedPosts);
  const [tab, setTab] = useState("For you");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("materials");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [dbReady, setDbReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<{ direction: "upload" | "download"; ms: number; size: number; name: string } | null>(null);
  const [transferError, setTransferError] = useState("");
  const [query, setQuery] = useState("");
  const [joined, setJoined] = useState<string[]>([]);
  const [going, setGoing] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);

  const refreshMaterials = useCallback(async () => {
    const rows = await readMaterials();
    setMaterials(rows);
  }, []);

  useEffect(() => {
    let alive = true;
    async function initialize() {
      try {
        const existing = await readMaterials();
        if (existing.length === 0) {
          for (const sample of seedMaterials()) await saveMaterial(sample);
        }
        const rows = await readMaterials();
        if (alive) { setMaterials(rows); setDbReady(true); }
      } catch {
        if (alive) { setTransferError("This browser blocked local storage. Allow site storage to use the demo transfer lab."); setDbReady(false); }
      }
    }
    void initialize();
    return () => { alive = false; };
  }, []);

  const visiblePosts = tab === "For you" ? posts : posts.filter((post) => post.category === tab);
  const filteredMaterials = useMemo(() => materials.filter((item) => {
    const value = (item.title + " " + item.subject + " " + item.fileName).toLowerCase();
    return value.includes(query.toLowerCase());
  }), [materials, query]);
  const totalBytes = materials.reduce((sum, item) => sum + item.size, 0);

  function like(id: number) {
    setPosts((current) => current.map((post) => post.id === id ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) } : post));
  }
  function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    setPosts((current) => [{ id: Date.now(), name: "You", handle: "guest", initials: "YO", role: "CTO demo visitor", time: "just now", body: draft.trim(), category: "Campus life", likes: 0, comments: 0, liked: false, color: "from-cyan-400/30 to-blue-500/10" }, ...current]);
    setDraft(""); setTab("For you"); setNotice("Your post is live in this preview. It stays in this browser session only.");
  }
  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setTransferError(""); setTransfer(null);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension)) { setTransferError("This file type is not supported. Choose a PDF, image, text, Word or PowerPoint file."); return; }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) { setTransferError("Choose a file between 1 byte and 50 MB."); return; }
    setBusy(true);
    try {
      const started = performance.now();
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" });
      const id = "upload-" + (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
      const record: Material = { id, title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "), fileName: file.name, subject: "Uploaded by guest", grade: "Demo library", mime: file.type || "application/octet-stream", size: blob.size, blob, createdAt: Date.now(), transferMs: 0 };
      await saveMaterial(record);
      const elapsed = performance.now() - started;
      record.transferMs = elapsed;
      await saveMaterial(record);
      await refreshMaterials();
      setTransfer({ direction: "upload", ms: elapsed, size: file.size, name: file.name });
      setNotice("File saved in this browser's private demo library. It has not been sent to the school's server.");
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : "The browser could not store this file.");
    } finally { setBusy(false); }
  }
  async function downloadFile(item: Material) {
    setTransferError(""); setTransfer(null);
    setBusy(true);
    try {
      const started = performance.now();
      const rows = await readMaterials();
      const stored = rows.find((row) => row.id === item.id);
      if (!stored) throw new Error("This file is no longer in the local demo library.");
      const blob = new Blob([await stored.blob.arrayBuffer()], { type: stored.mime });
      const elapsed = performance.now() - started;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = stored.fileName; anchor.click();
      URL.revokeObjectURL(url);
      setTransfer({ direction: "download", ms: elapsed, size: stored.size, name: stored.fileName });
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : "Download failed.");
    } finally { setBusy(false); }
  }
  async function removeMaterial(id: string) {
    await deleteMaterial(id);
    await refreshMaterials();
    setNotice("Demo file removed from this browser's local library.");
    if (transfer) setTransfer(null);
  }
  async function resetLibrary() {
    setBusy(true);
    try {
      for (const item of materials) await deleteMaterial(item.id);
      for (const sample of seedMaterials()) await saveMaterial(sample);
      await refreshMaterials();
      setTransfer(null); setTransferError("");
      setNotice("Sample study library restored.");
    } finally { setBusy(false); }
  }

  const navItems: { id: View; label: string; icon: typeof BookOpen }[] = [
    { id: "feed", label: "Home feed", icon: Sparkles },
    { id: "materials", label: "Study materials", icon: Library },
    { id: "communities", label: "Communities", icon: Users },
    { id: "events", label: "Events", icon: Compass },
    { id: "watch", label: "Dyne Watch", icon: Video },
  ];

  return (
    <main className="min-h-screen bg-[#080d18] text-slate-100">
      <div className="border-b border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-2.5 text-center text-xs font-semibold text-cyan-100"><Sparkles className="mr-2 inline h-4 w-4" /> CTO INTERACTIVE PREVIEW <span className="ml-2 hidden font-normal text-cyan-100/60 sm:inline">Fictional demo content · isolated from school accounts and production data</span></div>
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080d18]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-5 px-4 sm:px-6">
          <Link href="/cto-demo" className="flex shrink-0 items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300 font-black text-slate-950">D</span><span className="text-lg font-black tracking-[0.18em]">DYNE</span></Link>
          <div className="hidden max-w-md flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 md:flex"><Search className="h-4 w-4 text-slate-500" /><span className="text-sm text-slate-500">Search the campus preview</span></div>
          <div className="ml-auto flex items-center gap-3"><button type="button" onClick={() => setNotice("You are all caught up in this preview.")} aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-300 hover:bg-white/[0.07]"><Bell className="h-5 w-5" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cyan-300" /></button><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-300 to-blue-500 text-xs font-bold text-slate-950">CT</span><span className="hidden text-left sm:block"><span className="block text-xs font-semibold">Guest preview</span><span className="block text-[10px] text-slate-500">CTO walkthrough</span></span></div></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)_280px]">
        <aside className="hidden lg:block"><div className="sticky top-24 space-y-7"><div><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Workspace</p><nav className="space-y-1">{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setView(id); setNotice(""); }} className={"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm " + (view === id ? "bg-cyan-300/10 font-semibold text-cyan-200 ring-1 ring-cyan-300/15" : "text-slate-400 hover:bg-white/[0.05] hover:text-white")}><Icon className="h-[17px] w-[17px]" />{label}{view === id && <ChevronRight className="ml-auto h-3.5 w-3.5" />}</button>)}</nav></div><div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-cyan-300/[0.10] to-blue-500/[0.03] p-4"><GraduationCap className="h-6 w-6 text-cyan-200" /><p className="mt-3 text-sm font-semibold">Built for MVA</p><p className="mt-1 text-xs leading-relaxed text-slate-400">A connected campus experience for students, teachers and staff.</p><div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-200"><ShieldCheck className="h-3.5 w-3.5" /> Private campus network</div></div><p className="px-3 text-[10px] text-slate-600">DYNE · CTO PREVIEW BUILD</p></div></aside>

        <section className="mx-auto w-full max-w-[780px] space-y-5">
          {view === "materials" && (
            <>
              <div className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-[#102b40] via-[#101b31] to-[#17132b] p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200"><Zap className="h-3 w-3" /> Dyne Fast Transfer</div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-[38px]">Study materials.<br /><span className="bg-gradient-to-r from-cyan-200 to-blue-300 bg-clip-text text-transparent">Ready in milliseconds.</span></h1>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">A fast, searchable library for class notes, worksheets and revision files. Upload a document, save it locally, then download it and inspect the measured transfer time.</p>
                  <div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] text-slate-400">Library files</p><p className="mt-1 text-2xl font-bold tabular-nums">{materials.length}</p></div>
                    <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] text-slate-400">Stored locally</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatBytes(totalBytes)}</p></div>
                    <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] text-slate-400">Transfer display</p><p className="mt-1 text-2xl font-bold tabular-nums">ms</p></div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-300/20 bg-[#0e1928] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Wifi className="h-4 w-4 text-cyan-200" /><h2 className="text-sm font-bold">Live transfer benchmark</h2></div><p className="mt-1 text-xs text-slate-500">Measured on this device using the browser's persistent local file store.</p></div><span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold " + (dbReady ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200")}>{dbReady ? "LOCAL STORE READY" : "INITIALISING"}</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr]">
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Last upload / save</p><p className="mt-2 text-3xl font-bold tabular-nums text-cyan-100">{transfer?.direction === "upload" ? formatMs(transfer.ms) : "—"}<span className="ml-1 text-sm font-medium text-slate-400">ms</span></p><p className="mt-1 truncate text-[11px] text-slate-500">{transfer?.direction === "upload" ? transfer.name : "Upload a file to measure"}</p></div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Last download / read</p><p className="mt-2 text-3xl font-bold tabular-nums text-cyan-100">{transfer?.direction === "download" ? formatMs(transfer.ms) : "—"}<span className="ml-1 text-sm font-medium text-slate-400">ms</span></p><p className="mt-1 truncate text-[11px] text-slate-500">{transfer?.direction === "download" ? transfer.name : "Download a file to measure"}</p></div>
                </div>
                {transfer && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cyan-300/[0.07] px-4 py-3 text-xs"><span className="text-cyan-100">{transfer.direction === "upload" ? "Write completed" : "Read completed"} · {formatBytes(transfer.size)}</span><span className="font-semibold tabular-nums text-cyan-200">{throughput(transfer.size, transfer.ms)}</span></div>}
                {transferError && <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-200">{transferError}</p>}
                <div className="mt-4 flex flex-wrap gap-2"><label className={"inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-cyan-300 px-4 text-xs font-bold text-slate-950 hover:bg-cyan-200 " + (!dbReady || busy ? "pointer-events-none opacity-50" : "")}><Upload className="h-4 w-4" />{busy ? "Working…" : "Upload a study file"}<input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.doc,.docx,.ppt,.pptx" disabled={!dbReady || busy} onChange={(event) => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button type="button" disabled={!dbReady || busy} onClick={() => void resetLibrary()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/[0.05] disabled:opacity-40"><Sparkles className="h-4 w-4" /> Reset sample library</button></div>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-500">Accuracy note: these milliseconds measure file reads/writes in this browser's IndexedDB on this device, not an internet, FTP, Vercel or Cloudflare R2 transfer. Network transfer timings must be benchmarked against the deployed storage service.</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Study library</h2><p className="mt-0.5 text-xs text-slate-500">Grade 10 · Sample resources and your uploaded demo files</p></div><div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search materials…" className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs outline-none placeholder:text-slate-500 focus:border-cyan-300/40" /></div></div>
              {!dbReady ? <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-slate-500">Preparing the local study library…</div> : filteredMaterials.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No matching study materials.</div> : <div className="space-y-3">{filteredMaterials.map((item) => <article key={item.id} className="rounded-2xl border border-white/[0.09] bg-[#101827] p-4"><div className="flex flex-wrap items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200"><FileText className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold">{item.title}</p><p className="mt-1 text-[11px] text-slate-500">{item.subject} · {item.grade} · {formatBytes(item.size)} · {item.fileName}</p></div><span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-medium text-emerald-200">Available</span></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3"><span className="text-[10px] text-slate-500">{item.id.startsWith("sample-") ? "Curated sample file" : "Uploaded in this browser"}</span><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void downloadFile(item)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-cyan-300 px-3 text-[11px] font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50"><ArrowDownToLine className="h-3.5 w-3.5" /> Download & measure</button>{!item.id.startsWith("sample-") && <button type="button" disabled={busy} aria-label="Remove uploaded file" onClick={() => void removeMaterial(item.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-300/30 hover:text-rose-200 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}</div></div></article>)}</div>}
            </>
          )}

          {view === "feed" && (
            <>
              <div className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-[#10263b] via-[#101b31] to-[#17132b] p-6 sm:p-8"><div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200"><Sparkles className="h-3 w-3" /> Your campus, connected</div><h1 className="mt-4 text-3xl font-bold leading-tight sm:text-[38px]">One campus.<br /><span className="bg-gradient-to-r from-cyan-200 to-blue-300 bg-clip-text text-transparent">A thousand ways to connect.</span></h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300">The social layer of Macro Vision Academy — campus conversations, clubs, learning and events in one shared space.</p></div>
              <form onSubmit={publish} className="rounded-2xl border border-white/[0.09] bg-[#101827] p-4"><label htmlFor="demo-post" className="sr-only">Write a campus post</label><textarea id="demo-post" value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} placeholder="Share something with your campus…" className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-500" /><div className="mt-3 flex justify-end border-t border-white/[0.07] pt-3"><button type="submit" disabled={!draft.trim()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3.5 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"><Send className="h-3.5 w-3.5" /> Publish post</button></div></form>
              <div className="flex gap-2 border-b border-white/[0.08]">{["For you", "Campus life", "Clubs", "Study"].map((label) => <button key={label} type="button" onClick={() => setTab(label)} className={"border-b-2 px-3 pb-3 text-xs font-semibold " + (tab === label ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500")}>{label}</button>)}</div>
              {visiblePosts.map((post) => <article key={post.id} className="rounded-2xl border border-white/[0.09] bg-[#101827] p-4"><div className="flex items-center gap-3"><span className={"grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br " + post.color + " text-xs font-bold"}>{post.initials}</span><div className="flex-1"><p className="text-sm font-semibold">{post.name}</p><p className="text-[11px] text-slate-500">@{post.handle} · {post.role} · {post.time}</p></div><MoreHorizontal className="h-5 w-5 text-slate-500" /></div><p className="mt-4 text-sm leading-relaxed text-slate-200">{post.body}</p><div className="mt-4 flex gap-5 border-t border-white/[0.07] pt-3"><button type="button" onClick={() => like(post.id)} className={"inline-flex items-center gap-1.5 text-xs " + (post.liked ? "text-rose-300" : "text-slate-500")}><Heart className={"h-4 w-4 " + (post.liked ? "fill-current" : "")} />{post.likes}</button><button type="button" onClick={() => setNotice("Sample discussion: " + post.comments + " replies. Comments are preview-only.")} className="inline-flex items-center gap-1.5 text-xs text-slate-500"><MessageCircle className="h-4 w-4" />{post.comments} comments</button><button type="button" onClick={() => setSaved((current) => current.includes(String(post.id)) ? current.filter((id) => id !== String(post.id)) : [...current, String(post.id)])} className="ml-auto text-slate-500"><Bookmark className={"h-4 w-4 " + (saved.includes(String(post.id)) ? "fill-cyan-200 text-cyan-200" : "")} /></button></div></article>)}
            </>
          )}

          {view === "communities" && <><div><h1 className="text-2xl font-bold">Campus communities</h1><p className="mt-1 text-sm text-slate-500">Find your people, share ideas and build something together.</p></div>{groups.map((group) => <article key={group.name} className="rounded-2xl border border-white/[0.09] bg-[#101827] p-5"><div className="flex items-center gap-3"><span className={"grid h-12 w-12 place-items-center rounded-xl text-sm font-bold " + group.color}>{group.initials}</span><div className="flex-1"><h2 className="font-semibold">{group.name}</h2><p className="text-xs text-slate-500">{group.members + (joined.includes(group.name) ? 1 : 0)} members</p></div><button type="button" onClick={() => setJoined((current) => current.includes(group.name) ? current.filter((name) => name !== group.name) : [...current, group.name])} className="rounded-lg bg-cyan-300 px-4 py-2 text-xs font-bold text-slate-950">{joined.includes(group.name) ? "Joined ✓" : "Join community"}</button></div><p className="mt-4 text-sm text-slate-400">{group.description}</p></article>)}</>}

          {view === "events" && <><div><h1 className="text-2xl font-bold">What's happening at MVA</h1><p className="mt-1 text-sm text-slate-500">Explore campus events and save your place.</p></div>{[{id:"science",day:"26",month:"NOV",name:"Inter-House Science Challenge",place:"Anhad Anand Auditorium",time:"10:00 AM",description:"Teams showcase experiments, prototypes and creative problem-solving."},{id:"arts",day:"29",month:"NOV",name:"Creative Arts Showcase",place:"Vision Paradise",time:"1:30 PM",description:"A celebration of student art, music, photography and performance."},{id:"sports",day:"04",month:"DEC",name:"Campus Sports Meet",place:"MVA Sports Ground",time:"8:30 AM",description:"A day of team spirit, track events and friendly competition."}].map((event) => <article key={event.id} className="rounded-2xl border border-white/[0.09] bg-[#101827] p-5"><div className="flex gap-4"><div className="h-fit w-14 shrink-0 rounded-xl bg-cyan-300/10 py-2 text-center"><span className="block text-[9px] font-bold text-cyan-200">{event.month}</span><span className="block text-2xl font-bold">{event.day}</span></div><div className="flex-1"><h2 className="font-semibold">{event.name}</h2><p className="mt-1 text-xs text-slate-500">{event.place} · {event.time}</p><p className="mt-3 text-sm text-slate-400">{event.description}</p><button type="button" onClick={() => setGoing((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} className="mt-4 rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-200">{going.includes(event.id) ? "Going ✓" : "I'm interested"}</button></div></div></article>)}</>}

          {view === "watch" && <><div className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-[#142b3c] to-[#17152b] p-7"><div className="flex items-center gap-2 text-cyan-200"><Video className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-widest">Dyne Watch</span></div><h1 className="mt-4 text-3xl font-bold">Ideas worth sharing.</h1><p className="mt-2 text-sm text-slate-400">A campus video space for lessons, projects, performances and highlights.</p></div>{[{name:"Robotics Showcase 2026",by:"MVA Science Club",length:"03:42",description:"Student teams present their latest robotics builds."},{name:"A day at Vision Paradise",by:"Campus Media Team",length:"02:18",description:"A look inside campus life, learning spaces and activities."},{name:"Quick Physics: Newton's Laws",by:"Learning Studio",length:"05:06",description:"A student-friendly explainer of the three laws of motion."}].map((video, index) => <article key={video.name} className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101827]"><div className={"flex aspect-video items-center justify-center bg-gradient-to-br " + ["from-cyan-900/60 to-blue-950","from-violet-900/60 to-slate-950","from-emerald-900/50 to-slate-950"][index]}><span className="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-black/30 text-cyan-100"><Video className="h-6 w-6" /></span><span className="absolute ml-64 mt-32 rounded bg-black/70 px-2 py-1 text-[10px]">{video.length}</span></div><div className="p-4"><h2 className="font-semibold">{video.name}</h2><p className="mt-1 text-xs text-slate-500">{video.by}</p><p className="mt-3 text-sm text-slate-400">{video.description}</p><button type="button" onClick={() => setNotice("This is a curated video placeholder. Live playback is available in the signed-in Dyne Watch app.")} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200">View video details <ArrowRight className="h-3.5 w-3.5" /></button></div></article>)}</>}
        </section>

        <aside className="hidden space-y-5 lg:block">
          <div className="rounded-2xl border border-white/[0.09] bg-[#101827] p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">Quick access</h2><BookOpen className="h-4 w-4 text-cyan-200" /></div><button type="button" onClick={() => setView("materials")} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-cyan-300/[0.08] p-3 text-left"><Library className="h-5 w-5 text-cyan-200" /><span className="flex-1"><span className="block text-xs font-semibold">Study materials</span><span className="mt-0.5 block text-[10px] text-slate-500">Fast file library & transfer test</span></span><ChevronRight className="h-4 w-4 text-slate-500" /></button><button type="button" onClick={() => setView("feed")} className="mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/[0.04]"><Sparkles className="h-5 w-5 text-slate-400" /><span className="text-xs font-semibold">Campus feed</span><ChevronRight className="ml-auto h-4 w-4 text-slate-500" /></button></div>
          <div className="rounded-2xl border border-white/[0.09] bg-[#101827] p-4"><h2 className="text-sm font-bold">Your communities</h2><div className="mt-3 space-y-3">{groups.map((group) => <div key={group.name} className="flex items-center gap-3"><span className={"grid h-9 w-9 place-items-center rounded-xl text-[10px] font-bold " + group.color}>{group.initials}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{group.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{group.members} members</p></div></div>)}</div></div>
          <div className="rounded-2xl border border-white/[0.09] bg-gradient-to-br from-[#142b3c] to-[#17152b] p-4"><div className="flex items-center gap-2 text-cyan-200"><HardDrive className="h-4 w-4" /><span className="text-xs font-bold">Transfer architecture</span></div><p className="mt-2 text-xs leading-relaxed text-slate-400">The production design uses direct browser-to-object-storage transfers so large files can bypass the app server. This demo measures local browser storage only.</p></div>
          <p className="px-2 text-[10px] leading-relaxed text-slate-600">Fictional student names, events, counts and files are demonstration content. Nothing here is written to the live school database.</p>
        </aside>
      </div>

      {notice && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,560px)] -translate-x-1/2 items-start justify-between gap-3 rounded-xl border border-cyan-300/20 bg-[#102236] px-4 py-3 text-xs text-cyan-100 shadow-2xl"><span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      <footer className="border-t border-white/[0.07] px-4 py-6 text-center text-[11px] text-slate-600">DYNE · MACRO VISION ACADEMY · PRIVATE CAMPUS NETWORK<div className="mt-3 flex justify-center gap-4"><Link href="/login" className="text-slate-400 hover:text-cyan-200">Sign in to live Dyne</Link><Link href="/" className="text-slate-400 hover:text-cyan-200">Main website</Link></div><p className="mt-2">Demo uploads remain in this browser only. Reset the sample library to remove your uploaded demo files.</p></footer>
    </main>
  );
}
