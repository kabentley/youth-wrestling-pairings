import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx.cmd tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
