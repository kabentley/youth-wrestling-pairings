import JSZip from "jszip";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export const runtime = "nodejs";

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "team";
}

function extensionFromMime(mime: string | null | undefined) {
  if (!mime) return "bin";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("avif")) return "avif";
  return "bin";
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const [league, teams] = await Promise.all([
    db.league.findFirst({
      select: {
        name: true,
        website: true,
        logoData: true,
        logoType: true,
        ageAllowancePctPerYear: true,
        experienceAllowancePctPerYear: true,
        skillAllowancePctPerPoint: true,
        maxAgeGapYears: true,
        maxWeightDiffPct: true,
      },
    }),
    db.team.findMany({
      include: {
        wrestlers: true,
        headCoach: { select: { id: true, username: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const exportStamp = new Date().toISOString();
  const trimmedLeagueName = league?.name?.trim();
  const leagueName = trimmedLeagueName && trimmedLeagueName.length > 0 ? trimmedLeagueName : "league";
  const safeLeague = sanitizeFilePart(leagueName);
  const zip = new JSZip();
  const leagueDir = zip.folder("logos/league");
  const logosDir = zip.folder("logos/teams");
  const rosterDir = zip.folder("rosters");

  const teamRows = teams.map(team => {
    const safeName = sanitizeFilePart(team.symbol || team.name);
    const logoExt = extensionFromMime(team.logoType ?? undefined);
    const logoFile = team.logoData ? `logos/teams/${safeName}.${logoExt}` : null;
    return {
      id: team.id,
      name: team.name,
      symbol: team.symbol,
      color: team.color,
      address: team.address ?? null,
      website: team.website ?? null,
      numMats: team.numMats,
      homeTeamPreferSameMat: team.homeTeamPreferSameMat,
      headCoachId: team.headCoachId ?? null,
      headCoachUsername: team.headCoach?.username ?? null,
      logoType: team.logoType ?? null,
      logoFile,
      rosterFile: `rosters/${safeName}.json`,
    };
  });

  const rosterMap = teams.map(team => {
    const safeName = sanitizeFilePart(team.symbol || team.name);
    const roster = team.wrestlers
      .map(w => ({
        first: w.first,
        last: w.last,
        weight: w.weight,
        birthdate: w.birthdate.toISOString().slice(0, 10),
        experienceYears: w.experienceYears,
        skill: w.skill,
        active: w.active,
      }))
      .sort((a, b) => (a.last === b.last ? a.first.localeCompare(b.first) : a.last.localeCompare(b.last)));
    rosterDir?.file(`${safeName}.json`, JSON.stringify(roster, null, 2));
    return { teamId: team.id, rosterFile: `rosters/${safeName}.json`, count: roster.length };
  });

  for (const team of teams) {
    if (!team.logoData) continue;
    const safeName = sanitizeFilePart(team.symbol || team.name);
    const ext = extensionFromMime(team.logoType ?? undefined);
    logosDir?.file(`${safeName}.${ext}`, Buffer.from(team.logoData));
  }

  const manifest = {
    exportedAt: exportStamp,
    teamCount: teams.length,
    rosterFiles: rosterMap,
    leagueFile: "league.json",
  };

  const leagueLogoFile = league?.logoData
    ? `logos/league/${safeLeague}.${extensionFromMime(league.logoType)}`
    : null;
  const leagueRow = {
    name: league?.name ?? null,
    website: league?.website ?? null,
    ageAllowancePctPerYear: league?.ageAllowancePctPerYear ?? null,
    experienceAllowancePctPerYear: league?.experienceAllowancePctPerYear ?? null,
    skillAllowancePctPerPoint: league?.skillAllowancePctPerPoint ?? null,
    maxAgeGapYears: league?.maxAgeGapYears ?? null,
    maxWeightDiffPct: league?.maxWeightDiffPct ?? null,
    logoType: league?.logoType ?? null,
    logoFile: leagueLogoFile,
  };

  if (league?.logoData && leagueLogoFile) {
    leagueDir?.file(`${safeLeague}.${extensionFromMime(league.logoType)}`, Buffer.from(league.logoData));
  }

  zip.file("teams.json", JSON.stringify(teamRows, null, 2));
  zip.file("league.json", JSON.stringify(leagueRow, null, 2));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const zipData = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return new NextResponse(new Uint8Array(zipData), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeLeague}_${exportStamp.slice(0, 10)}.zip"`,
    },
  });
}
