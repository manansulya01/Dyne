import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Vitest global setup: boot an in-memory MongoDB and point the app at it,
 * unless MONGODB_URI is already provided (e.g. Atlas for a staging run).
 *
 * Tests must never write to the real `dyne` database: this setup defaults to
 * a dedicated `dyne_test` database and refuses to run when MONGODB_DB is
 * explicitly set to `dyne`.
 */
export async function setup() {
  if (!process.env.MONGODB_URI) {
    const mongod = await MongoMemoryServer.create({
      instance: { dbName: "dyne_test" },
    });
    process.env.MONGODB_URI = mongod.getUri("dyne_test");
    process.env.MONGODB_DB = "dyne_test";
    (globalThis as Record<string, unknown>).__dyneTestMongod = mongod;
  } else {
    if (!process.env.MONGODB_DB) process.env.MONGODB_DB = "dyne_test";
    if (process.env.MONGODB_DB === "dyne") {
      throw new Error(
        "Refusing to run tests with MONGODB_DB=dyne (the real database). " +
          "Use a dedicated test database name such as dyne_test."
      );
    }
  }

  return async () => {
    const mongod = (globalThis as Record<string, unknown>).__dyneTestMongod as
      | MongoMemoryServer
      | undefined;
    if (mongod) await mongod.stop();
  };
}
