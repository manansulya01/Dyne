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
  // eslint-disable-next-line no-var
  var __dyneMongoClient: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  const { uri } = getMongoEnv();
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  });
  return client.connect();
}

export function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.__dyneMongoClient) {
    globalThis.__dyneMongoClient = createClientPromise();
  }
  return globalThis.__dyneMongoClient;
}

export async function getDb(): Promise<Db> {
  const { dbName } = getMongoEnv();
  const client = await getMongoClient();
  return client.db(dbName);
}

/** Test helper: reset the cached client (used by the test harness only). */
export function __resetMongoClientForTests(): void {
  globalThis.__dyneMongoClient = undefined;
}

export { ObjectId };
