import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { formatDate } from "@/lib/utils";

interface Props { params: Promise<{ slug: string }>; }

async function fetchArticle(slug: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/blogs/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchArticle(slug);
  const title = data?.blog?.title ? `${data.blog.title} — Dyne Blogs` : "Article — Dyne Blogs";
  return { title, description: data?.blog?.excerpt ?? "An MVA campus story on Dyne." };
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const data = await fetchArticle(slug);
  if (!data?.blog) notFound();
  const b = data.blog as Record<string, unknown>;
  const author = b.author as Record<string, unknown> | null;
  const related = (data.related ?? []) as Array<Record<string, unknown>>;
  const cover = (b.coverImageUrl ?? b.cover_image_url ?? null) as string | null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
        <Link href="/blogs" className="text-sm text-cyan-300 hover:underline">← All stories</Link>
        {b.category ? <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">{String(b.category)}</p> : null}
        <h1 className="mt-2 text-[clamp(1.9rem,5vw,3rem)] font-extrabold leading-tight tracking-tight">{String(b.title)}</h1>
        <p className="mt-3 text-sm text-zinc-400">
          By {String(author?.display_name ?? author?.displayName ?? author?.username ?? "MVA")}
          {b.publishedAt ? ` · ${formatDate(String(b.publishedAt))}` : ""}
        </p>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="mt-6 w-full rounded-2xl border border-white/10 object-cover" />
        )}
        {b.excerpt ? <p className="mt-6 text-lg leading-relaxed text-zinc-300">{String(b.excerpt)}</p> : null}
        <article className="mt-4 whitespace-pre-wrap text-[1.05rem] leading-relaxed text-zinc-200">
          {String(b.content ?? "")}
        </article>

        {related.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-12 border-t border-white/10 pt-8">
            <h2 id="related-heading" className="text-lg font-bold">Related stories</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <Link key={String(r.id)} href={`/blogs/${String(r.slug)}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:border-cyan-300/40">
                  <span className="block text-sm font-bold leading-snug">{String(r.title)}</span>
                  {r.excerpt ? <span className="mt-1 line-clamp-2 block text-xs text-zinc-400">{String(r.excerpt)}</span> : null}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
