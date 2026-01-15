import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { assignMatsForMeet } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { generatePairingsForMeet, type PairingSettings } from "@/lib/generatePairings";

function d(s: string) {
  return new Date(s);
}

type WrestlerSeed = {
  first: string;
  last: string;
  weight: number;
  birthdate: string;
  experienceYears: number;
  skill: number;
};

const rosterA: WrestlerSeed[] = [
  { first: "Ben", last: "Jones", weight: 52, birthdate: "2015-03-11", experienceYears: 1, skill: 3 },
  { first: "Sam", last: "Smith", weight: 55, birthdate: "2014-11-02", experienceYears: 0, skill: 2 },
  { first: "Max", last: "Miller", weight: 60, birthdate: "2014-08-19", experienceYears: 2, skill: 4 },
  { first: "Noah", last: "Nelson", weight: 65, birthdate: "2013-12-07", experienceYears: 3, skill: 4 },
  { first: "Eli", last: "Evans", weight: 70, birthdate: "2013-05-21", experienceYears: 1, skill: 3 },
];

const rosterB: WrestlerSeed[] = [
  { first: "Leo", last: "Lopez", weight: 53, birthdate: "2015-01-10", experienceYears: 1, skill: 3 },
  { first: "Owen", last: "Olsen", weight: 56, birthdate: "2014-10-05", experienceYears: 0, skill: 2 },
  { first: "Jack", last: "Johnson", weight: 61, birthdate: "2014-07-01", experienceYears: 2, skill: 4 },
  { first: "Liam", last: "Lee", weight: 66, birthdate: "2013-11-12", experienceYears: 2, skill: 4 },
  { first: "Mason", last: "Moore", weight: 71, birthdate: "2013-04-02", experienceYears: 1, skill: 3 },
];

const rosterC: WrestlerSeed[] = [
  { first: "Aiden", last: "Anderson", weight: 50, birthdate: "2015-06-09", experienceYears: 0, skill: 2 },
  { first: "Carter", last: "Clark", weight: 57, birthdate: "2014-09-15", experienceYears: 1, skill: 3 },
  { first: "Wyatt", last: "Walker", weight: 62, birthdate: "2014-06-22", experienceYears: 2, skill: 3 },
  { first: "Grayson", last: "Green", weight: 67, birthdate: "2013-10-30", experienceYears: 3, skill: 5 },
  { first: "Hudson", last: "Hall", weight: 72, birthdate: "2013-03-14", experienceYears: 2, skill: 4 },
];

const rosterD: WrestlerSeed[] = [
  { first: "Luke", last: "Lewis", weight: 51, birthdate: "2015-04-18", experienceYears: 0, skill: 2 },
  { first: "Julian", last: "James", weight: 58, birthdate: "2014-08-03", experienceYears: 1, skill: 3 },
  { first: "Henry", last: "Harris", weight: 63, birthdate: "2014-05-10", experienceYears: 2, skill: 4 },
  { first: "Sebastian", last: "Scott", weight: 68, birthdate: "2013-09-06", experienceYears: 3, skill: 5 },
  { first: "David", last: "Davis", weight: 73, birthdate: "2013-02-25", experienceYears: 2, skill: 4 },
];

const icwlTeamNames = [
  "Abington Bulldogs Youth Wrestling",
  "Archbishop Ryan",
  "Aston Bandits Wrestling",
  "Avon Grove (Avon Grove Youth Wrestling Association)",
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

const sampleRosters = [rosterA, rosterB, rosterC, rosterD];

const TEAM_SYMBOL_OVERRIDES: Record<string, string> = {
  "Abington Bulldogs Youth Wrestling": "AB",
  "Archbishop Ryan": "AR",
  "Aston Bandits Wrestling": "AST",
  "Avon Grove (Avon Grove Youth Wrestling Association)": "AG",
  "Beat The Streets": "BTS",
  "Bensalem Youth Wrestling": "BEN",
  "Boyertown Wrestling Demons": "BOY",
  "Brandywine Youth Club Wrestling": "BYC",
  "Central Buck Raiders Wrestling Federation": "CBR",
  "Conestoga Youth Wrestling": "CON",
  "Council Rock Wrestling Association": "CR",
  "Downingtown Thunder": "DOW",
  "Greater Norristown Wrestling Club": "GN",
  "Great Valley": "GV",
  "Hatboro Horsham Youth Wrestling": "HH",
  "Haverford Youth Wrestling Association": "HAV",
  "Interboro Pirates Wrestling": "INT",
  "Kennett Wrestling Club": "KEN",
  "Lower Merion Wrestling Club": "LM",
  "Media Lions Youth Wrestling": "MED",
  "Marple Newtown": "MN",
  "Methacton Youth Wrestling Club": "MET",
  "Neshaminy Youth Wrestling Club": "NES",
  "Norchester Wildcats Wrestling": "NOR",
  "North Penn Wrestling": "NP",
  "Oxford Youth Wrestling": "OX",
  "Pennridge": "PR",
  "Pennsbury Falcons Wrestling Club": "PB",
  "Pottsgrove Youth Wrestling Club": "PG",
  "Perkiomen Valley Youth Wrestling Club": "PV",
  "Quakertown Youth Wrestling": "QUA",
  "Ridley Roughriders Wrestling Club": "RID",
  "Souderton Youth Wrestling": "SOU",
  "Springfield Athletic Association Wrestling": "SAA",
  "Spring Ford Youth Wrestling Club": "SF",
  "Strath Haven Panthers": "SH",
  "Upper Perk": "UP",
  "Truman Youth Wrestling": "TR",
  "Upper Darby Youth Wrestling Club": "DAR",
  "Upper Dublin Youth Wrestling Association": "UD",
  "Upper Moreland Youth Wrestling Club": "UMO",
  "Warminster Spartans": "WAR",
  "West Chester Youth Wrestling": "WC",
  "Wilmington Bulldog Wrestling": "WIL",
};

const TEAM_ADDRESSES: Record<string, string> = {
  "Abington Bulldogs Youth Wrestling": "2056 Susquehanna Road, Abington, PA 19001",
  "Archbishop Ryan": "11201 Academy Rd, Philadelphia, PA 19154",
  "Aston Bandits Wrestling": "2881 Pancoast Ave., Aston, PA 19014",
  "Avon Grove Youth Wrestling Association": "257 State Road, West Grove, PA",
  "Beat The Streets": "3700 Market St STE 300, Philadelphia, PA 19104",
  "Bensalem Youth Wrestling": "4319 Hulmeville Rd, Bensalem, PA 19020",
  "Boyertown Wrestling Demons": "380 South Madison St., Boyertown, PA 19512",
  "Brandywine Youth Club Wrestling": "552 Smithbridge Road, Glen Mills, PA 19342",
  "Central Buck Raiders Wrestling Federation": "700 East Butler Avenue, Doylestown, PA 18901",
  "Conestoga Youth Wrestling": "200 Irish Rd., Berwyn, PA 19312",
  "Council Rock Wrestling Association": "116 Richboro Newtown Rd, Newtown, PA 18940",
  "Downingtown Thunder": "50 Devon Drive, Exton, PA 19341",
  "Greater Norristown Wrestling Club": "230 Flowertown Road, Plymouth Meeting, PA 19462",
  "Great Valley": "225 Phoenixville Pike, Malvern, PA 19355",
  "Hatboro Horsham Youth Wrestling": "411 Babylon Road, Horsham, PA 19044",
  "Haverford Youth Wrestling Association": "200 Mill Road, Havertown, PA 19083",
  "Interboro Pirates Wrestling": "500 16th Ave, Prospect Park, PA 19076",
  "Kennett Wrestling Club": "300 East South Street, Kennett Square, PA 19348",
  "Lower Merion Wrestling Club": "600 N Ithan Ave, Bryn Mawr, PA 19010",
  "Media Lions Youth Wrestling": "134 Barren Rd, Media, PA 19063",
  "Marple Newtown": "1785 Bishop White Dr, Newton Square, PA 19073",
  "Methacton Youth Wrestling Club": "1001 Kriebel Mill Road, Norristown, PA 19403",
  "Neshaminy Youth Wrestling Club": "2250 Langhorne Yardley Rd, Langhorne, PA 19047",
  "Norchester Wildcats Wrestling": "881 Ridge Road, Pottstown, PA 19465",
  "North Penn Wrestling": "400 Penn St, Lansdale, PA 19446",
  "Oxford Youth Wrestling": "705 Waterway Road, Oxford, PA 19363",
  "Pennridge": "1228 N 5th St, Perkasie, PA 18944",
  "Pennsbury Falcons Wrestling Club": "705 Hood Blvd, Fairless Hills, PA 19030",
  "Perkiomen Valley Youth Wrestling Club": "509 Gravel Pike, Collegeville, PA 19426",
  "Pottsgrove Youth Wrestling Club": "Pottsgrove Senior High School",
  "Quakertown Youth Wrestling": "Quakertown, PA 18951",
  "Ridley Roughriders Wrestling Club": "901 Morton Ave, Folsom, PA 19033",
  "Souderton Youth Wrestling": "625 Lower Rd, Souderton, PA 18964",
  "Springfield Athletic Association Wrestling": "49 W. Leamy Avenue, Springfield, PA 19064",
  "Spring Ford Youth Wrestling Club": "400 S Lewis Rd, Royersford, PA 19468",
  "Strath Haven Panthers": "205 S. Providence Road, Wallingford, PA 19086",
  "Upper Perk": "2 Walt Road, Pennsburg, PA 18073",
  "Truman Youth Wrestling": "Neil Armstrong Middle School, 475 Wistar Rd, Fairless Hills, PA 19030",
  "Upper Darby Youth Wrestling Club": "601 N Lansdowne Ave, Drexel Hill, PA 19026",
  "Upper Dublin Youth Wrestling Association": "800 Loch Alsh Ave, Fort Washington, PA 19034",
  "Upper Moreland Youth Wrestling Club": "3000 Terwood Road, Willow Grove, PA 19090",
  "Warminster Spartans": "333 Centennial Road, Warminster, PA 18974",
  "West Chester Youth Wrestling": "1001 East Lincoln Highway, Exton, PA 19341",
  "Wilmington Bulldog Wrestling": "1400 Foulk Rd, Wilmington, DE 19803",
};

type LogoInfo = {
  logoData?: Buffer;
  logoType?: string;
};

type TeamMetadata = {
  website?: string | null;
  color?: string | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_DIR = path.join(__dirname, "team-logos");
const LOGO_MANIFEST_PATH = path.join(LOGO_DIR, "manifest.json");
const TEAM_METADATA_PATH = path.join(__dirname, "team-metadata.json");
const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

let normalizedLogoMap = new Map<string, string>();
let teamMetadataMap = new Map<string, TeamMetadata>();

function normalizeTeamName(value: string): string {
  const normalized = value.normalize("NFKD");
  const ascii = normalized.replace(/[\u0080-\uFFFF]/g, "");
  return ascii.replace(/\s+/g, " ").trim();
}

function getMimeType(fileName: string): string | undefined {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_TYPES[ext];
}

async function loadLogoManifest() {
  try {
    const contents = await readFile(LOGO_MANIFEST_PATH, "utf8");
    const entries: { team: string; file: string }[] = JSON.parse(contents);
    normalizedLogoMap = new Map(
      entries.map(entry => [normalizeTeamName(entry.team), entry.file]),
    );
  } catch (error) {
    console.warn("Unable to load team logos; proceeding without them", error);
    normalizedLogoMap = new Map();
  }
}

async function loadTeamMetadata() {
  try {
    const contents = await readFile(TEAM_METADATA_PATH, "utf8");
    const entries: { team: string; website?: string | null; color?: string | null }[] =
      JSON.parse(contents);
    teamMetadataMap = new Map(
      entries.map(entry => [normalizeTeamName(entry.team), entry]),
    );
  } catch (error) {
    console.warn("Unable to load team metadata; continuing without website info", error);
    teamMetadataMap = new Map();
  }
}

async function loadTeamLogo(name: string): Promise<LogoInfo> {
  const normalized = normalizeTeamName(name);
  const fileName = normalizedLogoMap.get(normalized);
  if (!fileName) return {};
  const filePath = path.join(LOGO_DIR, fileName);
  try {
    const data = await readFile(filePath);
    return {
      logoData: data,
      logoType: getMimeType(fileName),
    };
  } catch (error) {
    console.warn(`Unable to read logo for ${name}:`, error);
    return {};
  }
}

function toUint8Array(buffer?: Buffer) {
  if (!buffer) return undefined;
  return new Uint8Array(buffer);
}

function generateSymbol(name: string, existingSymbols: Set<string>) {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "T";
  let symbol = cleaned;
  let suffix = 1;
  while (existingSymbols.has(symbol)) {
    symbol = `${cleaned}${suffix}`;
    suffix += 1;
  }
  existingSymbols.add(symbol);
  return symbol;
}

async function clearAll() {
  await db.bout.deleteMany();
  await db.meetTeam.deleteMany();
  await db.meet.deleteMany();
  await db.wrestler.deleteMany();
  await db.team.deleteMany();
}

async function createTeam(name: string, symbol: string, roster: WrestlerSeed[]) {
  const logo = await loadTeamLogo(name);
  const metadata = teamMetadataMap.get(normalizeTeamName(name));
  const data: Prisma.TeamCreateInput = {
    name,
    symbol,
    address: TEAM_ADDRESSES[name],
    color: metadata?.color ?? undefined,
    website: metadata?.website ?? undefined,
    logoData: toUint8Array(logo.logoData) ?? undefined,
    logoType: logo.logoType ?? undefined,
  };
  const team = await db.team.create({ data });
  await db.wrestler.createMany({
    data: roster.map(w => ({
      teamId: team.id,
      first: w.first,
      last: w.last,
      weight: w.weight,
      birthdate: d(w.birthdate),
      experienceYears: w.experienceYears,
      skill: w.skill,
    })),
  });
  return team;
}

type SeedMeetOptions = {
  numMats?: number;
  allowSameTeamMatches?: boolean;
  matchesPerWrestler?: number;
};

async function finalizeMeet(meetId: string, options: Required<SeedMeetOptions>) {
  const pairingSettings: PairingSettings = {
    maxAgeGapDays: 365,
    maxWeightDiffPct: 12,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: options.allowSameTeamMatches,
    matchesPerWrestler: options.matchesPerWrestler,
    balanceTeamPairs: true,
    balancePenalty: 0.25,
  };
  await generatePairingsForMeet(meetId, pairingSettings);
  await assignMatsForMeet(meetId, { numMats: options.numMats });
}

async function createMeet(
  name: string,
  date: string,
  teamIds: string[],
  updatedById: string,
  options: SeedMeetOptions = {},
) {
  const now = new Date();
  const opts = {
    numMats: options.numMats ?? 4,
    allowSameTeamMatches: options.allowSameTeamMatches ?? false,
    matchesPerWrestler: options.matchesPerWrestler ?? 1,
  };
  const meet = await db.meet.create({
    data: {
      name,
      date: d(date),
      location: "Local Gym",
      status: "PUBLISHED",
      homeTeamId: teamIds[0],
      numMats: opts.numMats,
      allowSameTeamMatches: opts.allowSameTeamMatches,
      matchesPerWrestler: opts.matchesPerWrestler,
      updatedAt: now,
      updatedById,
      meetTeams: { create: teamIds.map(teamId => ({ teamId })) },
    },
  });
  await finalizeMeet(meet.id, opts);
  return meet;
}


async function ensureAdmin() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const phone = process.env.ADMIN_PHONE?.trim() || "+15555550100";
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: {
      username,
      email,
      phone,
      name: "Admin",
      passwordHash,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });
  console.log(`Created admin user: ${username} (password from ADMIN_PASSWORD or default admin1234)`);
  return user;
}

async function ensureLeague(name: string) {
  const existing = await db.league.findFirst({ select: { id: true } });
  if (!existing) {
    await db.league.create({ data: { name } });
    return;
  }
  await db.league.update({
    where: { id: existing.id },
    data: { name },
  });
}

async function main() {
  const seedMode = process.env.SEED_MODE ?? "demo"; // demo | empty
  if (seedMode === "empty") {
    console.log("Seeding: empty (clearing only)");
    await clearAll();
    return;
  }

  console.log("Seeding demo data...");
  const admin = await ensureAdmin();
  await clearAll();
  await ensureLeague("ICWL");
  await loadLogoManifest();
  await loadTeamMetadata();

  const usedSymbols = new Set<string>();
  const createdTeams: { id: string }[] = [];
  for (const [index, name] of icwlTeamNames.entries()) {
    const roster = sampleRosters[index % sampleRosters.length];
    let symbol = TEAM_SYMBOL_OVERRIDES[name];
    if (symbol) {
      if (usedSymbols.has(symbol)) {
        console.warn(`symbol override ${symbol} already used for ${name}; falling back to generated symbol`);
        symbol = generateSymbol(name, usedSymbols);
      } else {
        usedSymbols.add(symbol);
      }
    } else {
      symbol = generateSymbol(name, usedSymbols);
    }
    const team = await createTeam(name, symbol, roster);
    createdTeams.push(team);
  }

  if (createdTeams.length >= 4) {
    const [teamA, teamB, teamC, teamD] = createdTeams;
    await createMeet("Week 1 (Teams 1 vs 2)", "2026-01-15", [teamA.id, teamB.id], admin.id);
    await createMeet("Quad Meet", "2026-01-22", [teamA.id, teamB.id, teamC.id, teamD.id], admin.id);
  } else {
    console.warn("Not enough teams created to seed sample meets");
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
