import { redirect } from "next/navigation";
import { objectIdSchema } from "@/lib/mongo/ids";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Legacy `/watch/[id]` → canonical `/videos/[id]`.
 *
 * One implementation, one URL. Old links and bookmarks keep working without
 * maintaining a duplicate detail page (or letting the two drift apart).
 */
export default async function WatchDetailRedirect({ params }: Props) {
  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) redirect("/videos");
  redirect(`/videos/${id}`);
}
