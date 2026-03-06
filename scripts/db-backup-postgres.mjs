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
  const sourceUrl = args["source-url"] ?? process.env[sourceEnvName] ?? process.env.DATABASE_URL ?? "";
  ensurePostgresUrl(sourceUrl, "Source database URL");

  const root = process.cwd();
  const backupDir = path.join(root, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const outFile = args.out
    ? path.resolve(root, args.out)
    : path.join(backupDir, `prod-${timestampUtcCompact()}.dump`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const dumpArgs = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    outFile,
    sourceUrl,
  ];

  console.log(`Backing up source database from ${sourceEnvName} to ${outFile}`);
  try {
    await runCommand("pg_dump", dumpArgs);
  } catch (err) {
    if (err instanceof Error && /spawn pg_dump ENOENT/i.test(err.message)) {
      throw new Error("pg_dump not found. Install PostgreSQL client tools and ensure pg_dump is on PATH.");
    }
    throw err;
  }
  console.log(`Backup complete: ${outFile}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
