import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongo/client";
import { col } from "@/lib/mongo/collections";
import { withUser, jsonError } from "@/lib/security/authorize";
import { isAdminRole } from "@/lib/permissions";
import { logAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_PDF = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
const COLLECTIONS = ["posts", "announcements", "studyMaterials", "youtubeSuggestions"] as const;

async function adminContext() {
  const auth = await withUser();
  if (!auth.ok) return { response: auth.response } as const;
  if (!isAdminRole(auth.ctx.user.role)) return { response: jsonError(403, "Admin access required") } as const;
  return { db: auth.ctx.db, user: auth.ctx.user } as const;
}

export async function GET() {
  const auth = await adminContext();
  if ("response" in auth) return auth.response;
  const counts = await Promise.all(COLLECTIONS.map((name) => col(auth.db, name).countDocuments({ demoBatchId: { $exists: true } } as never)));
  return NextResponse.json({ active: counts.some(Boolean), counts: Object.fromEntries(COLLECTIONS.map((name, i) => [name, counts[i]])) }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Creates clearly-labelled sample content. It never creates login accounts or changes real records. */
export async function POST() {
  const auth = await adminContext();
  if ("response" in auth) return auth.response;
  const { db, user } = auth;
  const existing = await Promise.all(COLLECTIONS.map((name) => col(db, name).countDocuments({ demoBatchId: { $exists: true } } as never)));
  if (existing.some(Boolean)) return NextResponse.json({ error: "Demo data already exists. Restore it before seeding again." }, { status: 409 });

  const batchId = new ObjectId().toHexString();
  const now = new Date();
  const actorId = new ObjectId(user.id);
  const tag = { demoBatchId: batchId, isDemo: true };
  const posts = [
    { ...tag, authorId: actorId, content: "Welcome to the Dyne campus community! Share updates, celebrate achievements, and stay connected.", media: [], createdAt: now, updatedAt: now, deletedAt: null, post_type: "announcement" },
    { ...tag, authorId: actorId, content: "Science Week is coming soon. Which experiment or demonstration are you most excited to see?", media: [], createdAt: new Date(now.getTime() - 3600000), updatedAt: now, deletedAt: null, post_type: "text" },
    { ...tag, authorId: actorId, content: "A quick reminder: use the Study Materials library to find notes and revision resources for your grade.", media: [], createdAt: new Date(now.getTime() - 7200000), updatedAt: now, deletedAt: null, post_type: "text" },
  ];
  const announcements = [
    { ...tag, title: "Welcome to Dyne", body: "Your campus, your community, your network. Explore the feed, discover clubs, and connect with campus life.", category: "Campus", priority: "high", audience: "all", audienceIds: [], audienceClassGrade: null, audienceCommunityId: null, isPinned: true, attachmentUrl: null, attachmentName: null, linkUrl: null, startsAt: null, endsAt: null, notificationKey: null, createdBy: actorId, createdAt: now, updatedAt: now },
    { ...tag, title: "Grade 10 — Revision resource", body: "A sample revision handout is available below. This is demo content and can be removed from the admin console.", category: "Academics", priority: "normal", audience: "all", audienceIds: [], audienceClassGrade: "10", audienceCommunityId: null, isPinned: false, attachmentUrl: DEMO_PDF, attachmentName: "sample-revision-handout.pdf", linkUrl: null, startsAt: null, endsAt: null, notificationKey: null, createdBy: actorId, createdAt: new Date(now.getTime() - 1800000), updatedAt: now },
    { ...tag, title: "Campus Clubs Open Day", body: "Visit the club stalls, meet student leaders, and discover activities across campus. This sample notice demonstrates priority and audience targeting.", category: "Events", priority: "normal", audience: "students", audienceIds: [], audienceClassGrade: null, audienceCommunityId: null, isPinned: false, attachmentUrl: null, attachmentName: null, linkUrl: null, startsAt: null, endsAt: null, notificationKey: null, createdBy: actorId, createdAt: new Date(now.getTime() - 5400000), updatedAt: now },
  ];
  const materials = [
    { ...tag, title: "Mathematics — Sample Revision PDF", description: "Demo PDF used to preview the study-material library and download flow.", subject: "Mathematics", classGrade: "10", topic: "Revision", materialType: "revision", tags: ["demo", "revision", "mathematics"], teacher: user.displayName ?? "Demo Teacher", semester: "Term 1", academicYear: "2026–27", uploaderId: actorId, bucket: "study-materials", key: "demo/" + batchId + "/sample-revision.pdf", url: DEMO_PDF, demoDownloadUrl: DEMO_PDF, mime: "application/pdf", size: 13264, fileName: "sample-revision.pdf", isRemoved: false, isFeatured: true, status: "approved", createdAt: now, updatedAt: now },
    { ...tag, title: "Science — Lab Safety Quick Guide", description: "Sample resource entry for demonstrating subject filters and grade access.", subject: "Science", classGrade: "10", topic: "Laboratory", materialType: "revision", tags: ["demo", "science", "lab"], teacher: user.displayName ?? "Demo Teacher", semester: "Term 1", academicYear: "2026–27", uploaderId: actorId, bucket: "study-materials", key: "demo/" + batchId + "/lab-guide.pdf", url: DEMO_PDF, demoDownloadUrl: DEMO_PDF, mime: "application/pdf", size: 13264, fileName: "lab-safety-guide.pdf", isRemoved: false, isFeatured: false, status: "approved", createdAt: new Date(now.getTime() - 900000), updatedAt: now },
  ];
  const videos = [
    { ...tag, videoId: "jNQXAC9IVRw", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", title: "Me at the zoo — sample curated video", description: "A sample entry demonstrating the moderated YouTube library.", channelTitle: "jawed", thumbnailUrl: "https://img.youtube.com/vi/jNQXAC9IVRw/hqdefault.jpg", duration: "PT19S", suggestedBy: actorId, suggestedByRole: user.role, suggestionNote: "Demo library entry", status: "approved", targetGrades: ["*"], reviewReason: null, reviewedBy: actorId, reviewedAt: now, createdAt: now, updatedAt: now },
  ];
