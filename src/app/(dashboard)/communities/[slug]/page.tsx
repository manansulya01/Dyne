import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityDetailClient } from "./CommunityDetailClient";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} - Dyne`,
    description: `View community ${slug} on Dyne`,
  };
}

export default async function CommunityDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: community } = await supabase
    .from("communities")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!community) notFound();

  // Check if private and user is not a member
  if (community.is_private && user) {
    const { data: membership } = await supabase
      .from("community_members")
      .select("role")
      .eq("community_id", community.id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      notFound();
    }
  }

  return <CommunityDetailClient initialCommunity={community} currentUserId={user?.id || null} />;
}