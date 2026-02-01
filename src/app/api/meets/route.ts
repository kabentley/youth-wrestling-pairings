import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { MEET_LOCK_TTL_MS } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const MeetSchema = z.object({
  name: z.string().optional().default(""),
  date: z.string(),
  location: z.string().optional(),
  teamIds: z.array(z.string()).min(2).max(4),
  homeTeamId: z.string().optional(),
  numMats: z.number().int().min(1).max(6).default(4),
  allowSameTeamMatches: z.boolean().default(false),
  girlsWrestleGirls: z.boolean().default(true),
  matchesPerWrestler: z.number().int().min(1).max(5).default(2),
  maxMatchesPerWrestler: z.number().int().min(1).max(5).default(5),
  restGap: z.number().int().min(0).max(20).default(4),
  autoPairings: z.boolean().optional().default(true),
});

function formatMeetDate(dateStr: string) {
  const iso = dateStr.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildMeetName(
  teamIds: string[],
  teams: { id: string; symbol: string; name: string }[],
  homeTeamId?: string | null,
  date?: string,
) {
  const byId = new Map(teams.map(team => [team.id, team]));
  const ordered: string[] = [];
  const seen = new Set<string>();
  const pushTeam = (id: string) => {
    if (seen.has(id)) return;
    const team = byId.get(id);
    if (!team) return;
    const label = (team.symbol || team.name || "Team").trim();
    if (!label) return;
    ordered.push(label);
    seen.add(id);
  };
  if (homeTeamId) pushTeam(homeTeamId);
  const rest = teamIds.filter(id => id !== homeTeamId);
  const restOrdered = rest
    .map(id => byId.get(id))
    .filter((team): team is { id: string; symbol: string; name: string } => Boolean(team))
    .sort((a, b) => {
      const aLabel = (a.symbol || a.name || "").toLowerCase();
      const bLabel = (b.symbol || b.name || "").toLowerCase();
      if (aLabel < bLabel) return -1;
      if (aLabel > bLabel) return 1;
      return 0;
    });
  restOrdered.forEach(team => pushTeam(team.id));
  const base = ordered.length > 0 ? ordered.join("-") : "Meet";
  if (!date) return base;
  return `${base} ${formatMeetDate(date)}`;
}

function buildUniqueMeetName(baseName: string, existingNames: Set<string>) {
  if (!existingNames.has(baseName)) return baseName;
  let suffix = 1;
  while (existingNames.has(`${baseName} (${suffix})`)) {
    suffix += 1;
  }
  return `${baseName} (${suffix})`;
}

export async function GET() {
  const meets = await db.meet.findMany({
    where: { deletedAt: null },
    orderBy: { date: "desc" },
    include: {
      meetTeams: { include: { team: true } },
      updatedBy: { select: { username: true } },
    },
  });
  const changes = await db.meetChange.findMany({
    orderBy: { createdAt: "desc" },
    select: { meetId: true, createdAt: true, actorId: true },
  });
  const actorIds = Array.from(new Set(changes.map(change => change.actorId).filter((id): id is string => Boolean(id))));
  const actors = actorIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, username: true },
      })
    : [];
  const actorMap = new Map(actors.map(actor => [actor.id, actor.username]));
  const lastChangeByMeet = new Map<string, { at: Date; by?: string | null }>();
  for (const change of changes) {
    if (lastChangeByMeet.has(change.meetId)) continue;
    const actorName = change.actorId ? actorMap.get(change.actorId) ?? null : null;
    lastChangeByMeet.set(change.meetId, {
      at: change.createdAt,
      by: actorName,
    });
  }
  return NextResponse.json(
    meets.map(meet => {
      const entry = lastChangeByMeet.get(meet.id);
      return {
        ...meet,
        lastChangeAt: entry ? entry.at : null,
        lastChangeBy: entry?.by ?? null,
      };
    }),
  );
}

export async function POST(req: Request) {
  const { user } = await requireRole("COACH");
  const body = await req.json();
  const parsed = MeetSchema.parse(body);
  const creatorTeamId = user.teamId ?? parsed.homeTeamId ?? parsed.teamIds[0];
  if (!creatorTeamId) {
    return NextResponse.json({ error: "Creator must belong to a team" }, { status: 400 });
  }
  if (!parsed.teamIds.includes(creatorTeamId)) {
    return NextResponse.json({ error: "Creator's team must be part of the meet" }, { status: 400 });
  }
  if (user.role !== "ADMIN" && parsed.homeTeamId && parsed.homeTeamId !== creatorTeamId) {
    return NextResponse.json({ error: "Only admins can change the home team." }, { status: 403 });
  }
  const homeTeamId = user.role === "ADMIN"
    ? (parsed.homeTeamId ?? creatorTeamId)
    : creatorTeamId;

  const now = new Date();
  const meetTeams = await db.team.findMany({
    where: { id: { in: parsed.teamIds } },
    select: { id: true, symbol: true, name: true },
  });
  const meetName = buildMeetName(parsed.teamIds, meetTeams, homeTeamId, parsed.date);
  const existingMeetNames = await db.meet.findMany({
    where: { deletedAt: null, name: { startsWith: meetName } },
    select: { name: true },
  });
  const existingNameSet = new Set(existingMeetNames.map(entry => entry.name));
  const uniqueMeetName = buildUniqueMeetName(meetName, existingNameSet);
  const normalizeLocation = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed;
  };

  const meet = await db.meet.create({
    data: {
      name: uniqueMeetName,
      date: new Date(parsed.date),
      location: normalizeLocation(parsed.location),
      homeTeamId,
      numMats: parsed.numMats,
      allowSameTeamMatches: parsed.allowSameTeamMatches,
      girlsWrestleGirls: parsed.girlsWrestleGirls,
      matchesPerWrestler: parsed.matchesPerWrestler,
      maxMatchesPerWrestler: parsed.maxMatchesPerWrestler,
      restGap: parsed.restGap,
      updatedById: user.id,
      lockedById: user.id,
      lockedAt: now,
      lockExpiresAt: new Date(now.getTime() + MEET_LOCK_TTL_MS),
      meetTeams: { create: parsed.teamIds.map(teamId => ({ teamId })) },
    },
    include: { meetTeams: { include: { team: true } } },
  });

  await logMeetChange(meet.id, user.id, "Meet created.");
  // Auto pairings and initial checkpoint are handled client-side after attendance.

  if (!meet.location && meet.homeTeamId) {
    const home = await db.team.findUnique({ where: { id: meet.homeTeamId }, select: { address: true } });
    if (home?.address) {
      const updated = await db.meet.update({
        where: { id: meet.id },
        data: { location: home.address },
        include: { meetTeams: { include: { team: true } } },
      });
      return NextResponse.json(updated);
    }
  }

  return NextResponse.json(meet);
}
