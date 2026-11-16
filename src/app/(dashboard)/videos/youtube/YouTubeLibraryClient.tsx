"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Suggestion = {
  id: string;
  videoId: string;
  url: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  duration: string | null;
  status: "pending" | "approved" | "rejected";
  targetGrades: string[];
  reviewReason: string | null;
  note?: string | null;
  createdAt: string;
};

type PageState = { cursor: string | null; hasMore: boolean };

const staffRoles = new Set(["teacher", "admin", "super_admin"]);

export function YouTubeLibraryClient({ role }: { role: string }) {
  const isStudent = role === "student";
  const canReview = staffRoles.has(role);
  const canSuggest = isStudent || canReview;
  const [approved, setApproved] = useState<Suggestion[]>([]);
  const [mine, setMine] = useState<Suggestion[]>([]);
  const [queue, setQueue] = useState<Suggestion[]>([]);
  const [approvedPage, setApprovedPage] = useState<PageState>({ cursor: null, hasMore: false });
  const [minePage, setMinePage] = useState<PageState>({ cursor: null, hasMore: false });
  const [queuePage, setQueuePage] = useState<PageState>({ cursor: null, hasMore: false });
  const [loadingMore, setLoadingMore] = useState<"approved" | "mine" | "queue" | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gradeInputs, setGradeInputs] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const requests = [
        fetch("/api/youtube-suggestions?limit=24"),
        ...(canSuggest ? [fetch("/api/youtube-suggestions?mine=true&limit=30")] : []),
        ...(canReview ? [fetch("/api/youtube-suggestions?review=true&limit=50")] : []),
      ];
      const responses = await Promise.all(requests);
      const payloads = await Promise.all(responses.map(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not load YouTube library");
        return json as { suggestions?: Suggestion[]; cursor?: string | null; hasMore?: boolean };
      }));
      setApproved(payloads[0].suggestions ?? []);
      setApprovedPage({ cursor: payloads[0].cursor ?? null, hasMore: Boolean(payloads[0].hasMore) });
      let index = 1;
      if (canSuggest) {
        setMine(payloads[index].suggestions ?? []);
        setMinePage({ cursor: payloads[index].cursor ?? null, hasMore: Boolean(payloads[index].hasMore) });
        index++;
      }
      if (canReview) {
        setQueue(payloads[index].suggestions ?? []);
        setQueuePage({ cursor: payloads[index].cursor ?? null, hasMore: Boolean(payloads[index].hasMore) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load YouTube library");
    }
  }, [canSuggest, canReview]);

  useEffect(() => { void load(); }, [load]);

  async function loadMore(section: "approved" | "mine" | "queue") {
    const page = section === "approved" ? approvedPage : section === "mine" ? minePage : queuePage;
    if (!page.hasMore || !page.cursor || loadingMore) return;
    setLoadingMore(section);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: section === "queue" ? "50" : section === "mine" ? "30" : "24", before: page.cursor });
      if (section === "mine") params.set("mine", "true");
      if (section === "queue") params.set("review", "true");
      const response = await fetch(\`/api/youtube-suggestions?\${params.toString()}\`);
      const data = await response.json() as { suggestions?: Suggestion[]; cursor?: string | null; hasMore?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load more videos");
      const append = (previous: Suggestion[], next: Suggestion[]) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...next.filter((item) => !seen.has(item.id))];
      };
      const nextPage = { cursor: data.cursor ?? null, hasMore: Boolean(data.hasMore) };
      if (section === "approved") {
        setApproved((previous) => append(previous, data.suggestions ?? []));
        setApprovedPage(nextPage);
      } else if (section === "mine") {
        setMine((previous) => append(previous, data.suggestions ?? []));
        setMinePage(nextPage);
      } else {
        setQueue((previous) => append(previous, data.suggestions ?? []));
        setQueuePage(nextPage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more videos");
    } finally {
      setLoadingMore(null);
    }
  }


  async function submitSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/youtube-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Suggestion could not be submitted");
      setUrl("");
      setNote("");
      setMessage("Suggestion submitted. It will appear in the library after teacher approval.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggestion could not be submitted");
    } finally {
      setBusy(false);
    }
  }

  async function review(item: Suggestion, status: "approved" | "rejected") {
    setReviewing(item.id);
    setError(null);
    setMessage(null);
    try {
      const targetGrades = (gradeInputs[item.id] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
      const reason = reasons[item.id] ?? "";
      const response = await fetch(`/api/youtube-suggestions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, targetGrades, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Review failed");
      setMessage(status === "approved" ? "Video approved and added to the selected grades." : "Suggestion rejected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Dyne Watch</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">YouTube Library</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A school-curated collection. Only videos approved by teachers are playable in the student library.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{message}</p>}

      {canSuggest && (
        <section className="space-y-3 rounded-2xl border border-border p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">{isStudent ? "Suggest a video" : "Submit a YouTube video"}</h2>
            <p className="text-sm text-muted-foreground">Share a YouTube link. It stays private to the review team until approved for its intended grades.</p>
          </div>
          <form onSubmit={submitSuggestion} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste YouTube video URL" type="url" required maxLength={2048} className="min-h-[46px]" />
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why should we add it? (optional)" maxLength={500} className="min-h-[46px]" />
            <Button type="submit" disabled={busy || !url.trim()} className="min-h-[46px]">{busy ? "Submitting…" : "Submit suggestion"}</Button>
          </form>
        </section>
      )}

      {canReview && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Teacher review queue</h2>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">{queue.length} pending</span>
          </div>
          {queue.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No video suggestions waiting for review.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {queue.map((item) => (
                <article key={item.id} className="space-y-3 rounded-2xl border border-border p-4">
                  <div className="aspect-video overflow-hidden rounded-xl bg-muted">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${item.videoId}?rel=0&playsinline=1`}
                      title={item.title}
                      className="h-full w-full"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-xs text-muted-foreground">{item.channelTitle ?? "YouTube"} · Submitted {new Date(item.createdAt).toLocaleDateString()}</p>
                    {item.note && <p className="mt-1 text-sm text-muted-foreground">Student note: {item.note}</p>}
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open original video</a>
                  </div>
                  <Input
                    value={gradeInputs[item.id] ?? ""}
                    onChange={(event) => setGradeInputs((old) => ({ ...old, [item.id]: event.target.value }))}
                    placeholder="Allowed grades: 8, 9-A, 9-B or * for all"
                    aria-label={`Allowed grades for ${item.title}`}
                    className="min-h-[44px]"
                  />
                  <Input
                    value={reasons[item.id] ?? ""}
                    onChange={(event) => setReasons((old) => ({ ...old, [item.id]: event.target.value }))}
                    placeholder="Review note (required when rejecting)"
                    aria-label={`Review note for ${item.title}`}
                    className="min-h-[44px]"
                  />
                  <div className="flex gap-2">
                    <Button disabled={reviewing === item.id} onClick={() => void review(item, "approved")} className="min-h-[44px] flex-1">Approve</Button>
                    <Button disabled={reviewing === item.id} variant="outline" onClick={() => void review(item, "rejected")} className="min-h-[44px] flex-1">Reject</Button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {queuePage.hasMore && <Button variant="outline" disabled={loadingMore !== null} onClick={() => void loadMore("queue")}>{loadingMore === "queue" ? "Loading…" : "Load more pending"}</Button>}
        </section>
      )}

      {canSuggest && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">My submissions</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not submitted any videos yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {mine.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                  <span className={item.status === "approved" ? "shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700" : item.status === "rejected" ? "shrink-0 rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive" : "shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700"}>{item.status}</span>
                </div>
              ))}
            </div>
          )}
          {minePage.hasMore && <Button variant="outline" disabled={loadingMore !== null} onClick={() => void loadMore("mine")}>{loadingMore === "mine" ? "Loading…" : "Load more submissions"}</Button>}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Approved for you</h2>
          <p className="text-sm text-muted-foreground">Videos approved for your grade or the whole school.</p>
        </div>
        {approved.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No approved YouTube videos yet. Check back after teachers review suggestions.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {approved.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-border">
                <div className="aspect-video bg-muted">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${item.videoId}?rel=0&playsinline=1`}
                    title={item.title}
                    className="h-full w-full"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <div className="space-y-1 p-3">
                  <h3 className="line-clamp-2 font-semibold">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.channelTitle ?? "YouTube"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
