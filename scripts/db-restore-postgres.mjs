import fs from "node:fs";
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
  const inputPathRaw = args.in ?? args.input;
  if (!inputPathRaw) {
    throw new Error("Backup file is required. Pass --in <path-to-dump>.");
  }
  const inputPath = path.resolve(process.cwd(), inputPathRaw);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Backup file not found: ${inputPath}`);
  }

  const targetEnvName = args["target-env"] ?? "DEV_DATABASE_URL";
  const targetUrl = args["target-url"] ?? process.env[targetEnvName] ?? process.env.DATABASE_URL ?? "";
  ensurePostgresUrl(targetUrl, "Target database URL");

  const restoreArgs = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    targetUrl,
    inputPath,
  ];

  console.log(`Restoring ${inputPath} into target database from ${targetEnvName}`);
  try {
    await runCommand("pg_restore", restoreArgs);
  } catch (err) {
    if (err instanceof Error && /spawn pg_restore ENOENT/i.test(err.message)) {
      throw new Error("pg_restore not found. Install PostgreSQL client tools and ensure pg_restore is on PATH.");
    }
    throw err;
  }
  console.log("Restore complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
