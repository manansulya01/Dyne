import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Vitest global setup: boot an in-memory MongoDB and point the app at it,
 * unless MONGODB_URI is already provided (e.g. Atlas for a staging run).
 */
export async function setup() {
  if (!process.env.MONGODB_URI) {
    const mongod = await MongoMemoryServer.create({
      instance: { dbName: "dyne_test" },
    });
    process.env.MONGODB_URI = mongod.getUri("dyne_test");
    process.env.MONGODB_DB = "dyne_test";
    (globalThis as Record<string, unknown>).__dyneTestMongod = mongod;
  } else if (!process.env.MONGODB_DB) {
    process.env.MONGODB_DB = "dyne_test";
  }

  return async () => {
    const mongod = (globalThis as Record<string, unknown>).__dyneTestMongod as
      | MongoMemoryServer
      | undefined;
    if (mongod) await mongod.stop();
  };
}
