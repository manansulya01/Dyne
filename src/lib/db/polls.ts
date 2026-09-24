import { Db, ObjectId } from "mongodb";
import { col, type PollDoc, type PollVoteDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { memberRole } from "./communities";
import { resolveAuthors } from "./authors";
import { serializeMany } from "./serialize";
import { safeLimit } from "@/lib/utils";

export async function createPoll(db: Db, authorId: string | ObjectId, input: { communityId: string; question: string; options: string[]; closesAt?: string }) {
  const role = await memberRole(db, input.communityId, authorId);
  if (!role) return { ok: false as const, reason: "forbidden" as const };
  const res = await col<PollDoc>(db, "polls").insertOne({
    communityId: toObjectId(input.communityId),
    authorId: toObjectId(authorId),
    question: input.question.trim(),
    options: input.options.map((o) => o.trim()).filter(Boolean),
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
    createdAt: new Date(),
  } as never);
  return { ok: true as const, pollId: res.insertedId };
}

export async function listPolls(db: Db, communityId: string, limit = 20, viewerId?: string | ObjectId) {
  const rows = await col<PollDoc>(db, "polls").find({ communityId: toObjectId(communityId) } as never).sort({ createdAt: -1 }).limit(safeLimit(limit, 50)).toArray();
  const authors = await resolveAuthors(db, rows.map((r) => r.authorId));
  const votes = await col<PollVoteDoc>(db, "pollVotes").aggregate([
    { $match: { pollId: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: { pollId: "$pollId", optionIndex: "$optionIndex" }, n: { $sum: 1 } } },
  ]).toArray();
  const countMap = new Map<string, number>();
  for (const v of votes) {
    const id = v._id as { pollId: ObjectId; optionIndex: number };
    countMap.set(`${id.pollId.toHexString()}:${id.optionIndex}`, v.n as number);
  }
  let myVotes = new Map<string, number>();
  if (viewerId) {
    const mine = await col<PollVoteDoc>(db, "pollVotes").find({ pollId: { $in: rows.map((r) => r._id) }, userId: toObjectId(viewerId) } as never).toArray();
    myVotes = new Map(mine.map((m) => [m.pollId.toHexString(), m.optionIndex]));
  }
  return serializeMany(rows.map((r) => {
    const id = r._id.toHexString();
    const counts = r.options.map((_: string, i: number) => countMap.get(`${id}:${i}`) ?? 0);
    return { ...r, author: authors.get(r.authorId.toHexString()) ?? null, counts, totalVotes: counts.reduce((a: number, b: number) => a + b, 0), myVote: myVotes.get(id) ?? null };
  }));
}

export async function votePoll(db: Db, pollId: string, userId: string | ObjectId, optionIndex: number) {
  const poll = await col<PollDoc>(db, "polls").findOne({ _id: toObjectId(pollId) } as never);
  if (!poll) return { ok: false as const, reason: "not_found" as const };
  if (poll.closesAt && poll.closesAt < new Date()) return { ok: false as const, reason: "closed" as const };
  if (optionIndex < 0 || optionIndex >= poll.options.length) return { ok: false as const, reason: "bad_option" as const };
  const role = await memberRole(db, poll.communityId, userId);
  if (!role) return { ok: false as const, reason: "forbidden" as const };
  await col<PollVoteDoc>(db, "pollVotes").updateOne(
    { pollId: poll._id, userId: toObjectId(userId) } as never,
    { $set: { optionIndex, createdAt: new Date() } },
    { upsert: true }
  );
  return { ok: true as const };
}
