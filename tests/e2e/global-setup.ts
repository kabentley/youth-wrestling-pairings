import { execSync } from "node:child_process";
import path from "node:path";

export default async function globalSetup() {
  // Ensure schema is applied to the e2e sqlite DB before tests run.
  // This uses Prisma "db push" to keep it fast and deterministic.
  const cwd = path.resolve(__dirname, "../.."); // project root
  execSync(`npm run db:sqlite && npx prisma db push --force-reset`, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: `file:./prisma/e2e.db`,
    },
  });
}
