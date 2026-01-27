import { db } from "@/lib/db";

type Options = {
  dryRun: boolean;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return { dryRun: args.includes("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs();
  const count = await db.team.count();

  if (dryRun) {
    console.log(`[DRY RUN] Would update ${count} teams to homeTeamPreferSameMat=true.`);
    return;
  }

  await db.team.updateMany({ data: { homeTeamPreferSameMat: true } });
  console.log(`Updated ${count} teams to homeTeamPreferSameMat=true.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
