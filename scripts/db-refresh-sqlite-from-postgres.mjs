import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import pg from "pg";

const { Client } = pg;

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

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

function ensurePostgresUrl(value, label) {
  if (!value) throw new Error(`${label} is required.`);
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

function parseDotEnv(content) {
  const map = new Map();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function loadDotEnvMap(rootDir) {
  const dotenvPath = path.join(rootDir, ".env");
  if (!fs.existsSync(dotenvPath)) return new Map();
  const content = fs.readFileSync(dotenvPath, "utf8");
  return parseDotEnv(content);
}

function resolveEnvValue(key, envFileMap) {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim() !== "") {
    return fromProcess.trim();
  }
  const fromFile = envFileMap.get(key);
  if (typeof fromFile === "string" && fromFile.trim() !== "") {
    return fromFile.trim();
  }
  return "";
}

function resolveSqlitePathFromUrl(rawUrl, rootDir) {
  const value = rawUrl.trim();
  if (!value.startsWith("file:")) {
    throw new Error(`SQLite URL must start with file:. Received: ${value}`);
  }
  const filePathRaw = value.slice("file:".length);
  if (!filePathRaw) {
    throw new Error(`SQLite URL is missing file path: ${value}`);
  }
  if (path.isAbsolute(filePathRaw)) return filePathRaw;
  return path.resolve(rootDir, filePathRaw);
}

function normalizePgValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function asCount(value) {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadSourceTables(client) {
  const tableRows = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name ASC
  `);
  const tableNames = tableRows.rows
    .map((row) => row.table_name)
    .filter((name) => typeof name === "string" && name.length > 0)
    .filter((name) => name !== "_prisma_migrations");

  const source = new Map();
  for (const table of tableNames) {
    const columnsResult = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position ASC
      `,
      [table],
    );
    const columns = columnsResult.rows
      .map((row) => row.column_name)
      .filter((name) => typeof name === "string" && name.length > 0);
    if (columns.length === 0) continue;
    const selectSql = `SELECT ${columns.map((column) => quoteIdent(column)).join(", ")} FROM ${quoteIdent(table)}`;
    const rowsResult = await client.query(selectSql);
    source.set(table, {
      columns,
      rows: rowsResult.rows.map((row) => {
        const normalized = {};
        for (const column of columns) {
          normalized[column] = normalizePgValue(row[column]);
        }
        return normalized;
      }),
    });
  }
  return source;
}

function loadSqliteTableColumns(db) {
  const tableRows = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name <> '_prisma_migrations'
    ORDER BY name ASC
  `).all();
  const map = new Map();
  for (const row of tableRows) {
    const table = row.name;
    if (typeof table !== "string" || table.length === 0) continue;
    const pragmaRows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
    const columns = pragmaRows
      .map((col) => col.name)
      .filter((name) => typeof name === "string" && name.length > 0);
    map.set(table, columns);
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const envFileMap = loadDotEnvMap(rootDir);

  const sourceEnvName = args["source-env"] ?? "PROD_DATABASE_URL";
  const sourceUrl = args["source-url"] ?? resolveEnvValue(sourceEnvName, envFileMap);
  ensurePostgresUrl(sourceUrl, "Source Postgres URL");

  const sqliteEnvName = args["sqlite-env"] ?? "SQLITE_DATABASE_URL";
  const sqliteUrlCandidate =
    args["sqlite-url"] ||
    resolveEnvValue(sqliteEnvName, envFileMap) ||
    resolveEnvValue("DATABASE_URL", envFileMap) ||
    "file:./dev.db";
  const sqlitePath = resolveSqlitePathFromUrl(sqliteUrlCandidate, rootDir);

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(
      `SQLite database not found at ${sqlitePath}. Create it first (for example: npm run db:sqlite && npm run db:push:sqlite).`,
    );
  }

  const backupsDir = path.join(rootDir, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const skipSqliteBackup = args["skip-sqlite-backup"] === "true";
  if (!skipSqliteBackup) {
    const sqliteBackupPath = path.join(backupsDir, `sqlite-before-refresh-${timestampUtcCompact()}.db`);
    fs.copyFileSync(sqlitePath, sqliteBackupPath);
    console.log(`Backed up local SQLite DB: ${sqliteBackupPath}`);
  }

  console.log(`Connecting to source Postgres (${sourceEnvName})...`);
  const client = new Client({ connectionString: sourceUrl });
  await client.connect();
  let sourceTables;
  try {
    sourceTables = await loadSourceTables(client);
  } finally {
    await client.end();
  }

  const db = new Database(sqlitePath);
  try {
    const sqliteTables = loadSqliteTableColumns(db);
    const commonTables = [...sourceTables.keys()].filter((table) => sqliteTables.has(table));
    if (commonTables.length === 0) {
      throw new Error("No common tables found between source Postgres and target SQLite.");
    }

    const totalSourceRows = commonTables.reduce((acc, table) => acc + asCount(sourceTables.get(table)?.rows.length ?? 0), 0);
    console.log(`Refreshing ${commonTables.length} table(s), source rows: ${totalSourceRows}`);

    db.pragma("foreign_keys = OFF");
    const tx = db.transaction(() => {
      for (const table of commonTables) {
        db.prepare(`DELETE FROM ${quoteIdent(table)}`).run();
      }
      for (const table of commonTables) {
        const source = sourceTables.get(table);
        if (!source) continue;
        const sqliteColumns = sqliteTables.get(table) ?? [];
        const insertColumns = source.columns.filter((column) => sqliteColumns.includes(column));
        if (insertColumns.length === 0 || source.rows.length === 0) continue;
        const placeholders = insertColumns.map(() => "?").join(", ");
        const insertSql =
          `INSERT INTO ${quoteIdent(table)} (` +
          `${insertColumns.map((column) => quoteIdent(column)).join(", ")}) VALUES (${placeholders})`;
        const stmt = db.prepare(insertSql);
        for (const row of source.rows) {
          const values = insertColumns.map((column) => row[column] ?? null);
          stmt.run(values);
        }
      }
    });
    tx();
    db.pragma("foreign_keys = ON");

    const totalInserted = commonTables.reduce((acc, table) => {
      const source = sourceTables.get(table);
      if (!source) return acc;
      const sqliteColumns = sqliteTables.get(table) ?? [];
      const insertColumns = source.columns.filter((column) => sqliteColumns.includes(column));
      if (insertColumns.length === 0) return acc;
      return acc + source.rows.length;
    }, 0);
    console.log(`SQLite refresh complete. Inserted ${totalInserted} row(s) into ${commonTables.length} table(s).`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
