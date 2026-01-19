import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { DEFAULT_MAX_AGE_GAP_DAYS } from "@/lib/constants";
import { db } from "@/lib/db";
import { generatePairingsForMeet } from "@/lib/generatePairings";
import { logMeetChange } from "@/lib/meetActivity";
import { MEET_LOCK_TTL_MS } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";
import { reorderBoutsForMeet } from "@/lib/reorderBouts";

const MeetSchema = z.object({
  name: z.string().min(2),
  date: z.string(),
  location: z.string().optional(),
  teamIds: z.array(z.string()).min(2).max(4),
  homeTeamId: z.string().optional(),
  numMats: z.number().int().min(1).max(10).default(4),
  allowSameTeamMatches: z.boolean().default(false),
  matchesPerWrestler: z.number().int().min(1).max(5).default(2),
  maxMatchesPerWrestler: z.number().int().min(1).max(5).default(5),
  restGap: z.number().int().min(0).max(20).default(4),
  autoPairings: z.boolean().optional().default(true),
});

export async function GET() {
  const meets = await db.meet.findMany({
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
  const normalizeLocation = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed;
  };

  const meet = await db.meet.create({
    data: {
      name: parsed.name,
      date: new Date(parsed.date),
      location: normalizeLocation(parsed.location),
      homeTeamId,
      numMats: parsed.numMats,
      allowSameTeamMatches: parsed.allowSameTeamMatches,
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
  if (parsed.autoPairings) {
    const pairingSettings = {
      maxAgeGapDays: DEFAULT_MAX_AGE_GAP_DAYS,
      maxWeightDiffPct: 12,
      firstYearOnlyWithFirstYear: true,
      allowSameTeamMatches: parsed.allowSameTeamMatches,
      matchesPerWrestler: parsed.matchesPerWrestler,
      maxMatchesPerWrestler: parsed.maxMatchesPerWrestler,
    };
    await generatePairingsForMeet(meet.id, pairingSettings);
    await logMeetChange(meet.id, user.id, "Auto-generated pairings.");
    await assignMatsForMeet(meet.id, { numMats: parsed.numMats });
    await logMeetChange(meet.id, user.id, "Auto-assigned mats.");
    await reorderBoutsForMeet(meet.id, { numMats: parsed.numMats, conflictGap: parsed.restGap });
    await logMeetChange(meet.id, user.id, "Auto-reordered mats.");
  }

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
