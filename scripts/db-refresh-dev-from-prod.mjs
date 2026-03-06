import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function timestampUtcCompact() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function ensurePostgresUrl(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${label} must use postgres:// or postgresql://.`);
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceEnvName = args["source-env"] ?? "PROD_DATABASE_URL";
  const targetEnvName = args["target-env"] ?? "DEV_DATABASE_URL";
  const sourceUrl = args["source-url"] ?? process.env[sourceEnvName] ?? "";
  const targetUrl = args["target-url"] ?? process.env[targetEnvName] ?? process.env.DATABASE_URL ?? "";
  ensurePostgresUrl(sourceUrl, "Source database URL");
  ensurePostgresUrl(targetUrl, "Target database URL");

  const keepBackup = args.keep === "true";
  const backupDir = path.join(process.cwd(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = keepBackup
    ? path.join(backupDir, `prod-refresh-${timestampUtcCompact()}.dump`)
    : path.join(os.tmpdir(), `wrestling-scheduler-refresh-${process.pid}-${Date.now()}.dump`);

  const dumpArgs = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    backupPath,
    sourceUrl,
  ];
  const restoreArgs = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    targetUrl,
    backupPath,
  ];

  console.log(`Dumping prod from ${sourceEnvName} to ${backupPath}`);
  try {
    await runCommand("pg_dump", dumpArgs);
    console.log(`Restoring dump to dev target from ${targetEnvName}`);
    await runCommand("pg_restore", restoreArgs);
  } catch (err) {
    if (err instanceof Error && /spawn pg_(dump|restore) ENOENT/i.test(err.message)) {
      throw new Error("pg_dump/pg_restore not found. Install PostgreSQL client tools and ensure both are on PATH.");
    }
    throw err;
  } finally {
    if (!keepBackup) {
      try {
        fs.unlinkSync(backupPath);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  if (keepBackup) {
    console.log(`Done. Kept backup file: ${backupPath}`);
  } else {
    console.log("Done. Temporary backup file removed.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
