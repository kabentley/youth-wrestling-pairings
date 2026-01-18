import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {

  var prisma: PrismaClient | undefined;
}

/**
 * Creates the appropriate Prisma driver adapter based on `DATABASE_URL`.
 *
 * - `file:` URLs use the BetterSQLite3 adapter (local dev).
 * - Everything else is treated as Postgres and uses the `@prisma/adapter-pg` driver.
 */
function createAdapter() {
  const rawUrl = process.env.DATABASE_URL ?? "";
  const url = rawUrl.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  if (!url) {
    throw new Error("DATABASE_URL is required to initialize Prisma");
  }
  if (url.startsWith("file:")) {
    return new PrismaBetterSqlite3({ url });
  }

  return new PrismaPg({ connectionString: url });
}

/**
 * Prisma client singleton.
 *
 * In development we cache the client on `globalThis` to avoid exhausting database
 * connections during hot reload.
 */
export const db = global.prisma ?? new PrismaClient({
  adapter: createAdapter(),
});

if (process.env.NODE_ENV !== "production") global.prisma = db;
