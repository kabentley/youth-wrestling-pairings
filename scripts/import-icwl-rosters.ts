import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import xlsx from "xlsx";

import { db } from "@/lib/db";
import { planRosterUpsert, toISODateOnly } from "@/lib/importRoster";

const DEFAULT_ZIP = path.resolve("tests/fixtures/teams/icwl.zip");
const SKIP_FILES = new Set([
  "PAIRINGTemplate",
  "Outliers",
  "Steel Valley",
  "Wissahickon",
  "Coatesville",
  "Just Youth Athletics",
  "Lions Den",
]);

// Keep in sync with prisma/seed.ts (icwlTeamNames).
const ICWL_TEAM_NAMES = [
  "Abington Bulldogs Youth Wrestling",
  "Archbishop Ryan",
  "Aston Bandits Wrestling",
  "Avon Grove Youth Wrestling Association",
  "Beat The Streets",
  "Bensalem Youth Wrestling",
  "Boyertown Wrestling Demons",
  "Brandywine Youth Club Wrestling",
  "Central Buck Raiders Wrestling Federation",
  "Conestoga Youth Wrestling",
  "Council Rock Wrestling Association",
  "Downingtown Thunder",
  "Greater Norristown Wrestling Club",
  "Great Valley",
  "Hatboro Horsham Youth Wrestling",
  "Haverford Youth Wrestling Association",
  "Interboro Pirates Wrestling",
  "Kennett Wrestling Club",
  "Lower Merion Wrestling Club",
  "Media Lions Youth Wrestling",
  "Marple Newtown",
  "Methacton Youth Wrestling Club",
  "Neshaminy Youth Wrestling Club",
  "Norchester Wildcats Wrestling",
  "North Penn Wrestling",
  "Oxford Youth Wrestling",
  "Pennridge",
  "Pennsbury Falcons Wrestling Club",
  "Pottsgrove Youth Wrestling Club",
  "Perkiomen Valley Youth Wrestling Club",
  "Quakertown Youth Wrestling",
  "Ridley Roughriders Wrestling Club",
  "Souderton Youth Wrestling",
  "Springfield Athletic Association Wrestling",
  "Spring Ford Youth Wrestling Club",
  "Strath Haven Panthers",
  "Upper Perk",
  "Truman Youth Wrestling",
  "Upper Darby Youth Wrestling Club",
  "Upper Dublin Youth Wrestling Association",
  "Upper Moreland Youth Wrestling Club",
  "Warminster Spartans",
  "West Chester Youth Wrestling",
  "Wilmington Bulldog Wrestling",
];

const FILENAME_ALIASES: Record<string, string> = {
  Abington: "Abington Bulldogs Youth Wrestling",
  "Archbishop Ryan": "Archbishop Ryan",
  Aston: "Aston Bandits Wrestling",
  "Avon Grove": "Avon Grove Youth Wrestling Association",
  "Beat the Streets": "Beat The Streets",
  Bensalem: "Bensalem Youth Wrestling",
  Boyertown: "Boyertown Wrestling Demons",
  "BYC Brandywine": "Brandywine Youth Club Wrestling",
  "Central Bucks": "Central Buck Raiders Wrestling Federation",
  Conestoga: "Conestoga Youth Wrestling",
  "Council Rock": "Council Rock Wrestling Association",
  Downington: "Downingtown Thunder",
  "Great Valley": "Great Valley",
  "Greater Norristown": "Greater Norristown Wrestling Club",
  "Hatboro Horsham": "Hatboro Horsham Youth Wrestling",
  Haverford: "Haverford Youth Wrestling Association",
  Interboro: "Interboro Pirates Wrestling",
  Kennett: "Kennett Wrestling Club",
  "Lower Merion": "Lower Merion Wrestling Club",
  Media: "Media Lions Youth Wrestling",
  Marple: "Marple Newtown",
  Methacton: "Methacton Youth Wrestling Club",
  Neshaminy: "Neshaminy Youth Wrestling Club",
  Norchester: "Norchester Wildcats Wrestling",
  "North Penn": "North Penn Wrestling",
  Oxford: "Oxford Youth Wrestling",
  Pennridge: "Pennridge",
  Pennsbury: "Pennsbury Falcons Wrestling Club",
  "Perk Valley": "Perkiomen Valley Youth Wrestling Club",
  Pottsgrove: "Pottsgrove Youth Wrestling Club",
  Quakertown: "Quakertown Youth Wrestling",
  Ridley: "Ridley Roughriders Wrestling Club",
  Souderton: "Souderton Youth Wrestling",
  Springfield: "Springfield Athletic Association Wrestling",
  Springford: "Spring Ford Youth Wrestling Club",
  "Strath Haven": "Strath Haven Panthers",
  Truman: "Truman Youth Wrestling",
  "Upper Darby": "Upper Darby Youth Wrestling Club",
  "Upper Dublin": "Upper Dublin Youth Wrestling Association",
  "Upper Moreland": "Upper Moreland Youth Wrestling Club",
  "Upper Perk": "Upper Perk",
  Warminster: "Warminster Spartans",
  "West Chester": "West Chester Youth Wrestling",
  Wilmington: "Wilmington Bulldog Wrestling",
};

const STOP_WORDS = new Set([
  "youth",
  "wrestling",
  "club",
  "association",
  "federation",
  "athletic",
  "athletics",
  "wrestlers",
  "wrestler",
  "team",
  "boys",
  "girls",
]);

type ParsedRow = {
  first: string;
  last: string;
  weight: number;
  birthdate: string;
  experienceYears?: number;
  skill?: number;
};

function normalizeForMatch(value: string) {
  const ascii = value.normalize("NFKD").replace(/[\u0080-\uFFFF]/g, "");
  return ascii
    .replace(/&/g, "and")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripStopWords(value: string) {
  const parts = value.split(" ").filter(Boolean);
  return parts.filter(part => !STOP_WORDS.has(part)).join(" ");
}

function resolveTeamName(fileBaseName: string) {
  if (FILENAME_ALIASES[fileBaseName]) return FILENAME_ALIASES[fileBaseName];

  const base = normalizeForMatch(fileBaseName);
  const baseStripped = stripStopWords(base);
  let best: { name: string; score: number; diff: number } | null = null;

  for (const team of ICWL_TEAM_NAMES) {
    const normalized = normalizeForMatch(team);
    const stripped = stripStopWords(normalized);
    const candidates: Array<{ score: number; match: boolean }> = [
      { score: 3, match: base === normalized || baseStripped === stripped },
      { score: 2, match: normalized.includes(base) || base.includes(normalized) },
      { score: 1, match: stripped.includes(baseStripped) || baseStripped.includes(stripped) },
    ];
    const chosen = candidates.find(c => c.match);
    if (!chosen) continue;
    const diff = Math.abs(normalized.length - base.length);
    if (!best || chosen.score > best.score || (chosen.score === best.score && diff < best.diff)) {
      best = { name: team, score: chosen.score, diff };
    }
  }
  return best?.name ?? null;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findHeaderRow(rows: unknown[][]) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const normalized = row.map(cell => normalizeHeader(String(cell ?? "")));
    const hasFirst = normalized.some(cell => cell.includes("first"));
    const hasLast = normalized.some(cell => cell.includes("last"));
    if (hasFirst && hasLast) return i;
  }
  return -1;
}

function mapHeaders(headers: unknown[]) {
  const normalized = headers.map(h => normalizeHeader(String(h ?? "")));
  const lookup = (aliases: string[]) => {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    return normalized.findIndex(h => aliasSet.has(h));
  };
  return {
    first: lookup(["first", "firstname", "first name", "fname"]),
    last: lookup(["last", "lastname", "last name", "lname", "surname"]),
    weight: lookup(["weight", "wt", "lbs", "weightlbs", "weight lbs", "actualwt", "actual wt", "actual weight"]),
    birthdate: lookup(["birthdate", "dob", "dateofbirth", "date of birth", "birthday"]),
    experienceYears: lookup(["experience", "experienceyears", "years", "yrs", "exp"]),
    skill: lookup(["skill", "rating", "level"]),
  };
}

function normalizeBirthdate(value: unknown) {
  if (value instanceof Date) return toISODateOnly(value);
  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return toISODateOnly(new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)));
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return toISODateOnly(parsed);
  }
  return null;
}

function parseWeight(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseRowsWithColumns(rows: unknown[][], startIndex: number, columns: {
  first: number;
  last: number;
  weight: number;
  birthdate: number;
  experienceYears: number;
  skill: number;
}) {
  const parsed: ParsedRow[] = [];
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    const first = String(row[columns.first] ?? "").trim();
    const last = String(row[columns.last] ?? "").trim();
    if (!first || !last) continue;

    const weight = parseWeight(row[columns.weight]);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const birthdate = normalizeBirthdate(row[columns.birthdate]);
    if (!birthdate) continue;

    const expRaw = columns.experienceYears >= 0 ? row[columns.experienceYears] : "";
    const skillRaw = columns.skill >= 0 ? row[columns.skill] : "";
    const experienceYears = Number.isFinite(Number(expRaw)) ? Math.max(0, Math.floor(Number(expRaw))) : 0;
    const skill = Number.isFinite(Number(skillRaw)) ? Math.min(5, Math.max(0, Math.floor(Number(skillRaw)))) : 3;

    parsed.push({ first, last, weight, birthdate, experienceYears, skill });
  }
  return parsed;
}

function parseRowsFromSheet(rows: unknown[][]) {
  if (!rows.length) return [];
  const headerIndex = findHeaderRow(rows);
  if (headerIndex >= 0) {
    const headerRow = rows[headerIndex] ?? [];
    const columns = mapHeaders(headerRow);
    const requiredColumns = [columns.first, columns.last, columns.weight, columns.birthdate];
    if (!requiredColumns.some(idx => idx === -1)) {
      const parsed = parseRowsWithColumns(rows, headerIndex + 1, columns);
      if (parsed.length) return parsed;
    }
  }
  const fallbackColumns = { first: 0, last: 1, weight: 2, birthdate: 3, experienceYears: 4, skill: 5 };
  return parseRowsWithColumns(rows, 0, fallbackColumns);
}

function parseWorkbook(filePath: string) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const parsed = parseRowsFromSheet(rows);
    if (parsed.length) return parsed;
  }
  return [];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { zip: string; dryRun: boolean } = {
    zip: DEFAULT_ZIP,
    dryRun: args.includes("--dry-run"),
  };
  const zipIndex = args.findIndex(arg => arg === "--zip");
  if (zipIndex >= 0 && args[zipIndex + 1]) {
    options.zip = path.resolve(args[zipIndex + 1]);
  }
  return options;
}

function expandZip(zipPath: string, dest: string) {
  if (process.platform !== "win32") {
    throw new Error("This script expects Windows PowerShell for Expand-Archive.");
  }
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
  ], { stdio: "inherit" });
}

async function main() {
  const { zip, dryRun } = parseArgs();
  if (!existsSync(zip)) {
    throw new Error(`Zip not found: ${zip}`);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "icwl-"));
  try {
    expandZip(zip, tempDir);
    const entries = await readdir(tempDir, { withFileTypes: true });
    const excelFiles = entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx"))
      .map(entry => path.join(tempDir, entry.name));

    const teams = await db.team.findMany({ select: { id: true, name: true } });
    const teamByName = new Map(teams.map(team => [team.name, team.id]));

    for (const filePath of excelFiles) {
      const baseName = path.basename(filePath, ".xlsx");
      if (SKIP_FILES.has(baseName)) {
        console.warn(`Skipping ${baseName}: not in ICWL seed list.`);
        continue;
      }
      const teamName = resolveTeamName(baseName);
      if (!teamName) {
        console.warn(`No team match for ${baseName}; skipping.`);
        continue;
      }
      const teamId = teamByName.get(teamName);
      if (!teamId) {
        console.warn(`Team not in database: ${teamName}; skipping ${baseName}.`);
        continue;
      }

      const rows = parseWorkbook(filePath);
      if (!rows.length) {
        console.warn(`No roster rows found for ${teamName} (${baseName}).`);
        continue;
      }

      const existing = await db.wrestler.findMany({
        where: { teamId },
        select: { id: true, first: true, last: true, birthdate: true },
      });

      const plan = planRosterUpsert({
        teamId,
        incoming: rows,
        existing,
      });

      if (dryRun) {
        console.log(`[DRY RUN] ${teamName}: ${plan.toCreate.length} create, ${plan.toUpdate.length} update`);
        continue;
    }

      if (plan.toUpdate.length) {
        await db.$transaction(
          plan.toUpdate.map(u =>
            db.wrestler.update({
              where: { id: u.id },
              data: { weight: u.weight, experienceYears: u.experienceYears, skill: u.skill },
            }),
          ),
        );
      }

      if (plan.toCreate.length) {
        await db.wrestler.createMany({
          data: plan.toCreate.map(w => ({ ...w, active: true })),
        });
      }

      console.log(`${teamName}: ${plan.toCreate.length} created, ${plan.toUpdate.length} updated`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await db.$disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
