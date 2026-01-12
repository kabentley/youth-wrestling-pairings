import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
   
  var prisma: PrismaClient | undefined;
}

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

export const db = global.prisma ?? new PrismaClient({
  adapter: createAdapter(),
});

if (process.env.NODE_ENV !== "production") global.prisma = db;
