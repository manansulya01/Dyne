import { MongoClient, Db, ObjectId } from "mongodb";
import { getMongoEnv } from "./env";

/**
 * Cached MongoDB client.
 *
 * - Uses a module-global cache so development hot-reloads reuse one connection
 *   pool instead of exhausting server connections.
 * - Server-only: this module must never be imported by client components.
 */

declare global {
  // `var` is required syntax for global augmentation.
  var __dyneMongoClient: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  const { uri } = getMongoEnv();
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    // Bounded so an unreachable database fails fast instead of hanging the
    // request (verified: with a paused mongod the API stopped responding
    // rather than returning a prompt error).
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 20000,
    waitQueueTimeoutMS: 5000,
  });
  return client.connect().catch((err: unknown) => {
    // Never cache a rejected connection: the next request must retry so the
    // app recovers as soon as MongoDB is reachable again.
    if (globalThis.__dyneMongoClient) {
      globalThis.__dyneMongoClient = undefined;
    }
    try {
      void client.close().catch(() => {});
    } catch {
      /* ignore close errors */
    }
    throw toActionableMongoError(err);
  });
}

export function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.__dyneMongoClient) {
    globalThis.__dyneMongoClient = createClientPromise();
  }
  return globalThis.__dyneMongoClient.catch((err: unknown) => {
    // Defensive: if a rejected promise was cached by an older path, clear it
    // so later requests retry instead of replaying the same failure.
    globalThis.__dyneMongoClient = undefined;
    throw err;
  });
}

export async function getDb(): Promise<Db> {
  const { dbName } = getMongoEnv();
  let client: MongoClient;
  try {
    client = await getMongoClient();
  } catch (err) {
    throw toActionableMongoError(err);
  }
  try {
    // Harmless read-only check that surfaces an unreachable server here
    // (with an actionable message) instead of midway through a query.
    await client.db(dbName).command({ ping: 1 });
  } catch (err) {
    globalThis.__dyneMongoClient = undefined;
    throw toActionableMongoError(err);
  }
  return client.db(dbName);
}

/**
 * Translate driver connection failures into a clear, actionable error.
 * Never includes the connection string, credentials, or host secrets —
 * only what the operator needs to do next.
 */
export function toActionableMongoError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /server selection/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /topology/i.test(message) ||
    /connect/i.test(message)
  ) {
    const hint =
      "Cannot reach MongoDB. Check that MONGODB_URI points at a running " +
      "instance (local mongod, Docker, or Atlas allow-listed for this host), " +
      "then retry. See .env.example for configuration.";
    const wrapped = new Error(`MongoDB unavailable: ${hint}`);
    // Preserve the driver code for logs without leaking connection details.
    (wrapped as Error & { cause?: unknown }).cause =
      err instanceof Error ? err.name : "MongoConnectionError";
    return wrapped;
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Test helper: reset the cached client (used by the test harness only). */
export function __resetMongoClientForTests(): void {
  globalThis.__dyneMongoClient = undefined;
}

export { ObjectId };
