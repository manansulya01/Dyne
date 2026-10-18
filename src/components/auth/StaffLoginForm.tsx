"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, GraduationCap, LockKeyhole, Mail, ArrowLeft } from "lucide-react";
import Link from "next/link";

type StaffPortal = "teacher" | "admin";

export function StaffLoginForm({ portal }: { portal: StaffPortal }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isTeacher = portal === "teacher";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = new FormData();
      body.set("email", email);
      body.set("password", password);
      body.set("portal", portal);
      const response = await fetch("/api/auth/login", { method: "POST", body });
      const result: { error?: string | { _form?: string[] }; redirectTo?: string; success?: boolean } = await response.json();
      if (!response.ok || result.error) {
        const message = typeof result.error === "string"
          ? result.error
          : result.error?._form?.[0] ?? "Unable to sign in with this account.";
        setError(message);
        return;
      }
      router.refresh();
      router.replace(result.redirectTo ?? (isTeacher ? "/feed" : "/admin"));
    } catch {
      setError("A connection error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <section className="relative hidden overflow-hidden bg-slate-950 px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,rgba(37,99,235,0.28),transparent_45%),radial-gradient(ellipse_at_85%_80%,rgba(14,116,144,0.2),transparent_40%)]" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 font-bold tracking-[0.18em]">D</div>
            <div><p className="text-lg font-semibold tracking-[0.2em]">DYNE</p><p className="text-xs text-slate-400">Macro Vision Academy</p></div>
          </div>
          <div className="relative max-w-xl pb-12">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Staff access portal</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">{isTeacher ? "Teaching starts with a connected campus." : "A safer, stronger campus starts here."}</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">{isTeacher ? "Access academic tools, share approved learning resources, and stay connected with your school community." : "Manage campus operations, review reports, and maintain a respectful, secure community."}</p>
            <div className="mt-9 flex items-center gap-3 text-sm text-slate-300"><ShieldCheck className="h-5 w-5 text-blue-300" /> Protected access for authorized school personnel</div>
          </div>
          <p className="relative text-xs text-slate-500">DYNE · YOUR CAMPUS. YOUR COMMUNITY. YOUR NETWORK.</p>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <Link href="/login" className="mb-10 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">
              <ArrowLeft className="h-4 w-4" /> Back to general sign in
            </Link>
            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-white shadow-sm">
              {isTeacher ? <GraduationCap className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-800">{isTeacher ? "Faculty portal" : "Administration portal"}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{isTeacher ? "Teacher sign in" : "Administrator sign in"}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{isTeacher ? "Use your registered school account to access teaching tools." : "Authorized administrators only. Your account permissions are verified securely."}</p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="staff-email" className="mb-2 block text-sm font-medium text-slate-800">School email</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="staff-email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} placeholder="name@school.edu" className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:opacity-60" />
                </div>
              </div>
              <div>
                <label htmlFor="staff-password" className="mb-2 block text-sm font-medium text-slate-800">Password</label>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="staff-password" name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:opacity-60" />
                </div>
              </div>
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? "Verifying account…" : isTeacher ? "Sign in to teacher portal" : "Sign in to administration"}
              </button>
            </form>
            <div className="mt-6 rounded-xl border border-slate-200 bg-white/80 p-4 text-xs leading-5 text-slate-600">
              <p className="font-semibold text-slate-800">Secure staff access</p>
              <p className="mt-1">Your role is checked on the server. Selecting this portal does not grant staff or administrator privileges.</p>
            </div>
            <p className="mt-8 text-center text-xs text-slate-500">Need help? Contact your school’s Dyne administrator.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
