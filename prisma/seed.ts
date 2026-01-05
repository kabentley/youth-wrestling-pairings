import bcrypt from "bcryptjs";

import { db } from "@/lib/db";

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
  { first: "Ben", last: "Bentley", weight: 52, birthdate: "2015-03-11", experienceYears: 1, skill: 3 },
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

async function clearAll() {
  await db.excludedPair.deleteMany();
  await db.bout.deleteMany();
  await db.meetTeam.deleteMany();
  await db.meet.deleteMany();
  await db.wrestler.deleteMany();
  await db.team.deleteMany();
}

async function createTeam(name: string, symbol: string, roster: WrestlerSeed[]) {
  const team = await db.team.create({ data: { name, symbol } });
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

async function createMeet(name: string, date: string, teamIds: string[]) {
  return db.meet.create({
    data: {
      name,
      date: d(date),
      location: "Local Gym",
      meetTeams: { create: teamIds.map(teamId => ({ teamId })) },
    },
  });
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
    data: { username, email, phone, name: "Admin", passwordHash, role: "ADMIN" },
  });
  console.log(`Created admin user: ${username} (password from ADMIN_PASSWORD or default admin1234)`);
  return user;
}

async function main() {
  const seedMode = process.env.SEED_MODE ?? "demo"; // demo | empty
  if (seedMode === "empty") {
    console.log("Seeding: empty (clearing only)");
    await clearAll();
    return;
  }

  console.log("Seeding demo data...");
  await ensureAdmin();
  await clearAll();

  const t1 = await createTeam("Tigers", "TIG", rosterA);
  const t2 = await createTeam("Bears", "BEA", rosterB);
  const t3 = await createTeam("Eagles", "EAG", rosterC);
  const t4 = await createTeam("Wolves", "WOL", rosterD);

  // 2-team meet
  await createMeet("Week 1 (Tigers vs Bears)", "2026-01-15", [t1.id, t2.id]);
  // 4-team quad meet
  await createMeet("Quad Meet", "2026-01-22", [t1.id, t2.id, t3.id, t4.id]);

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
