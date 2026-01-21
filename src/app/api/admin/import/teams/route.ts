import JSZip from "jszip";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { planRosterUpsert } from "@/lib/importRoster";
import { requireAdmin } from "@/lib/rbac";

export const runtime = "nodejs";

type TeamRow = {
  id?: string;
  name: string;
  symbol: string;
  color?: string;
  address?: string | null;
  website?: string | null;
  numMats?: number;
  homeTeamPreferSameMat?: boolean;
  logoType?: string | null;
  logoFile?: string | null;
  rosterFile?: string;
};

type WrestlerRow = {
  first: string;
  last: string;
  weight: number;
  birthdate: string;
  experienceYears: number;
  skill: number;
  active?: boolean;
};

type LeagueRow = {
  name?: string | null;
  website?: string | null;
  logoType?: string | null;
  logoFile?: string | null;
};

function mimeFromExtension(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Zip file required." }, { status: 400 });
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const leagueEntry = zip.file("league.json");
  const teamsEntry = zip.file("teams.json");
  if (!teamsEntry) {
    return NextResponse.json({ error: "teams.json not found in zip." }, { status: 400 });
  }

  await db.wrestler.deleteMany();
  if (leagueEntry) {
    const leagueRow = JSON.parse(await leagueEntry.async("string")) as LeagueRow;
    const existingLeague = await db.league.findFirst();
    const data = {
      name: leagueRow.name ?? undefined,
      website: leagueRow.website ?? undefined,
    };
    if (existingLeague) {
      await db.league.update({ where: { id: existingLeague.id }, data });
    } else if (leagueRow.name || leagueRow.website) {
      await db.league.create({ data });
    }

    if (leagueRow.logoFile) {
      const logoEntry = zip.file(leagueRow.logoFile);
      if (logoEntry) {
        const logoData = await logoEntry.async("nodebuffer");
        const logoType = leagueRow.logoType ?? mimeFromExtension(leagueRow.logoFile);
        const leagueRecord = existingLeague ?? (await db.league.findFirst());
        if (leagueRecord) {
          await db.league.update({
            where: { id: leagueRecord.id },
            data: { logoData: Buffer.from(logoData), logoType },
          });
        }
      }
    }
  }
  const teams = JSON.parse(await teamsEntry.async("string")) as TeamRow[];
  if (!Array.isArray(teams)) {
    return NextResponse.json({ error: "teams.json must be an array." }, { status: 400 });
  }

  let createdTeams = 0;
  let updatedTeams = 0;
  let createdWrestlers = 0;
  let updatedWrestlers = 0;
  let logoUpdates = 0;
  let leagueUpdated = Boolean(leagueEntry);

  for (const teamRow of teams) {
    if (!teamRow.name || !teamRow.symbol) continue;
    const symbol = teamRow.symbol.trim().toUpperCase();
    let team = teamRow.id
      ? await db.team.findUnique({ where: { id: teamRow.id } })
      : null;
    team ??= await db.team.findFirst({
      where: { OR: [{ symbol }, { name: teamRow.name.trim() }] },
    });

    if (!team) {
      team = await db.team.create({
        data: {
          name: teamRow.name.trim(),
          symbol,
          color: teamRow.color ?? "#000000",
          address: teamRow.address ?? null,
          website: teamRow.website ?? null,
          numMats: typeof teamRow.numMats === "number" ? teamRow.numMats : 4,
          homeTeamPreferSameMat: teamRow.homeTeamPreferSameMat ?? true,
        },
      });
      createdTeams += 1;
    } else {
      await db.team.update({
        where: { id: team.id },
        data: {
          name: teamRow.name.trim(),
          symbol,
          color: teamRow.color ?? team.color,
          address: teamRow.address ?? team.address,
          website: teamRow.website ?? team.website,
          numMats: typeof teamRow.numMats === "number" ? teamRow.numMats : team.numMats,
          homeTeamPreferSameMat: typeof teamRow.homeTeamPreferSameMat === "boolean"
            ? teamRow.homeTeamPreferSameMat
            : team.homeTeamPreferSameMat,
        },
      });
      updatedTeams += 1;
    }

    if (teamRow.logoFile) {
      const logoEntry = zip.file(teamRow.logoFile);
      if (logoEntry) {
        const logoData = await logoEntry.async("nodebuffer");
        const logoType = teamRow.logoType ?? mimeFromExtension(teamRow.logoFile);
        await db.team.update({
          where: { id: team.id },
          data: { logoData: Buffer.from(logoData), logoType },
        });
        logoUpdates += 1;
      }
    }

    const rosterPath = teamRow.rosterFile;
    if (!rosterPath) continue;
    const rosterEntry = zip.file(rosterPath);
    if (!rosterEntry) continue;
    const roster = JSON.parse(await rosterEntry.async("string")) as WrestlerRow[];
    if (!Array.isArray(roster) || roster.length === 0) continue;

    const incoming = roster.map(w => ({
      first: w.first,
      last: w.last,
      weight: Number(w.weight),
      birthdate: w.birthdate,
      experienceYears: Number(w.experienceYears),
      skill: Number(w.skill),
    }));
    const existingWrestlers = await db.wrestler.findMany({
      where: { teamId: team.id },
      select: { id: true, first: true, last: true, birthdate: true, weight: true, experienceYears: true, skill: true },
    });
    const plan = planRosterUpsert({
      teamId: team.id,
      incoming,
      existing: existingWrestlers,
    });
    if (plan.toUpdate.length) {
      await db.$transaction(
        plan.toUpdate.map(u =>
          db.wrestler.update({
            where: { id: u.id },
            data: { weight: u.weight, experienceYears: u.experienceYears, skill: u.skill },
          }),
        ),
      );
      updatedWrestlers += plan.toUpdate.length;
    }
    if (plan.toCreate.length) {
      for (const w of plan.toCreate) {
        try {
          await db.wrestler.create({
            data: { ...w, active: true },
          });
          createdWrestlers += 1;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            continue;
          }
          throw err;
        }
      }
    }
  }

  return NextResponse.json({
    leagueUpdated,
    teamsCreated: createdTeams,
    teamsUpdated: updatedTeams,
    wrestlersCreated: createdWrestlers,
    wrestlersUpdated: updatedWrestlers,
    logosUpdated: logoUpdates,
  });
}
