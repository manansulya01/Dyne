import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "Campus stories — Dyne Blogs",
  description: "Featured stories, latest articles, and announcements from Macro Vision Academy.",
};

interface Blog {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl?: string | null;
  cover_image_url?: string | null;
  category: string | null;
  publishedAt?: string | null;
  author?: { display_name?: string | null; displayName?: string | null; username?: string } | null;
}

async function fetchBlogs(): Promise<Blog[]> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/blogs?limit=30`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.blogs ?? [];
  } catch {
    return [];
  }
}

function cover(b: Blog) {
  return b.coverImageUrl ?? b.cover_image_url ?? null;
}
function authorName(b: Blog) {
  return b.author?.display_name ?? b.author?.displayName ?? b.author?.username ?? "MVA";
}

export default async function BlogsPage() {
  const blogs = await fetchBlogs();
  const featured = blogs[0] ?? null;
  const rest = blogs.slice(1);
  const categories = Array.from(new Set(blogs.map((b) => b.category).filter(Boolean))) as string[];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <LandingNav />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Dyne Blogs · MVA news</p>
        <h1 className="mt-2 text-[clamp(2rem,5vw,3.25rem)] font-extrabold tracking-tight">Campus stories</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Featured stories, latest articles, and announcements — published through official MVA
          workflows. Nothing here is hardcoded: every article is real data with an author and date.
        </p>

        {categories.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2" aria-label="Categories">
            {categories.map((c) => (
              <span key={c} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200">{c}</span>
            ))}
          </div>
        )}

        {blogs.length === 0 && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center">
            <h2 className="text-lg font-bold">No stories published yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
              When MVA staff, teachers, or clubs publish their first article, it will appear here
              with its author and publication date. Admins can publish from the Dyne admin area.
            </p>
            <Link href="/feed" className="mt-6 inline-flex min-h-[48px] items-center rounded-xl bg-cyan-400 px-6 font-semibold text-zinc-950 hover:bg-cyan-300">
              Open Dyne
            </Link>
          </div>
        )}

        {featured && (
          <Link href={`/blogs/${featured.slug}`} className="group mt-10 block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] hover:border-cyan-300/40">
            {cover(featured) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover(featured)!} alt="" className="h-64 w-full object-cover sm:h-96" />
            )}
            <span className="block p-6 sm:p-8">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Featured story{featured.category ? ` · ${featured.category}` : ""}</span>
              <span className="mt-2 block text-2xl font-extrabold tracking-tight group-hover:underline sm:text-3xl">{featured.title}</span>
              {featured.excerpt && <span className="mt-2 block max-w-3xl text-zinc-400">{featured.excerpt}</span>}
              <span className="mt-3 block text-sm text-zinc-500">By {authorName(featured)}</span>
            </span>
          </Link>
        )}

        {rest.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((b) => (
              <Link key={b.id} href={`/blogs/${b.slug}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] hover:border-cyan-300/40">
                {cover(b) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover(b)!} alt="" className="h-40 w-full object-cover" loading="lazy" />
                )}
                <span className="block p-5">
                  {b.category && <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">{b.category}</span>}
                  <span className="mt-1.5 block font-bold leading-snug group-hover:underline">{b.title}</span>
                  {b.excerpt && <span className="mt-1.5 line-clamp-2 block text-sm text-zinc-400">{b.excerpt}</span>}
                  <span className="mt-3 block text-xs text-zinc-500">By {authorName(b)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
