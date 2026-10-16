"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Item {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  admin_response: string | null;
  created_at: string;
}

const CATS = ["bug", "feature", "ui", "content", "safety", "other"];

export function FeedbackClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ title: "", description: "", category: "other", page: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/feedback?limit=30");
      const data = await res.json();
      if (res.ok) setItems(data.feedback ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial feedback load only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to submit");
      setNotice("Thanks — your feedback was submitted. Track its status below.");
      setForm({ title: "", description: "", category: "other", page: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bugs, features, UI, content and safety — we read everything.</p>
      </div>
      <Card>
        <CardContent className="space-y-2 pt-4">
          <form onSubmit={submit} className="space-y-2">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" required minLength={3} maxLength={200} className="min-h-[44px]" aria-label="Feedback title" />
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the issue or idea (min 10 characters)…" required minLength={10} maxLength={5000} rows={4} aria-label="Feedback description" />
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="min-h-[44px] rounded-xl border border-input bg-background px-3 text-sm" aria-label="Category">
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} placeholder="Page/context (optional)" maxLength={500} className="min-h-[44px]" aria-label="Page or context" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
            <Button type="submit" disabled={busy} className="min-h-[48px] w-full">{busy ? "Submitting…" : "Submit feedback"}</Button>
          </form>
        </CardContent>
      </Card>
      <h2 className="font-semibold">Your feedback</h2>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground" role="status">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing yet — submit your first report above.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id}>
              <Card>
                <CardContent className="space-y-1 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{f.category}</Badge>
                    <Badge>{f.status}</Badge>
                    <span className="text-xs text-muted-foreground">{f.priority}</span>
                  </div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-muted-foreground line-clamp-3">{f.description}</p>
                  {f.admin_response && (
                    <p className="rounded-lg bg-muted p-2 text-sm"><span className="font-medium">Response: </span>{f.admin_response}</p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
