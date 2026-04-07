import { db } from "@/lib/db";
import { resolveStoredUserName } from "@/lib/userName";

type Options = {
  dryRun: boolean;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return { dryRun: args.includes("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs();
  const users = await db.user.findMany({
    where: {
      name: { not: null },
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      name: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let migrated = 0;
  let singleToken = 0;
  let skippedEmpty = 0;

  for (const user of users) {
    const resolved = resolveStoredUserName({ name: user.name });
    if (!resolved.firstName && !resolved.lastName) {
      skippedEmpty += 1;
      continue;
    }
    if (!resolved.lastName) {
      singleToken += 1;
    }
    const hasChange =
      resolved.firstName !== user.firstName ||
      resolved.lastName !== user.lastName;
    if (!hasChange) {
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN] ${user.username}: firstName=${resolved.firstName ?? "null"} lastName=${resolved.lastName ?? "null"}`);
      migrated += 1;
      continue;
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        firstName: resolved.firstName,
        lastName: resolved.lastName,
      },
    });
    migrated += 1;
  }

  console.log(`Scanned ${users.length} user records.`);
  console.log(`Backfilled ${migrated} users.`);
  console.log(`Single-token names: ${singleToken}.`);
  console.log(`Skipped empty names: ${skippedEmpty}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
