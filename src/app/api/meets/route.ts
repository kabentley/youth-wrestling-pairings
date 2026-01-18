import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { DEFAULT_MAX_AGE_GAP_DAYS } from "@/lib/constants";
import { db } from "@/lib/db";
import { MEET_LOCK_TTL_MS } from "@/lib/meetLock";
import { generatePairingsForMeet } from "@/lib/generatePairings";
import { logMeetChange } from "@/lib/meetActivity";
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
    select: { meetId: true, createdAt: true, actor: { select: { username: true } } },
  });
  const lastChangeByMeet = new Map<string, { at: Date; by: string | null }>();
  for (const change of changes) {
    if (lastChangeByMeet.has(change.meetId)) continue;
    lastChangeByMeet.set(change.meetId, {
      at: change.createdAt,
      by: change.actor?.username ?? null,
    });
  }
  return NextResponse.json(
    meets.map(meet => ({
      ...meet,
      lastChangeAt: lastChangeByMeet.get(meet.id)?.at ?? null,
      lastChangeBy: lastChangeByMeet.get(meet.id)?.by ?? null,
    })),
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
  const homeTeamId = parsed.homeTeamId ?? creatorTeamId;

  const now = new Date();
  const meet = await db.meet.create({
    data: {
      name: parsed.name,
      date: new Date(parsed.date),
      location: parsed.location?.trim() || undefined,
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
  const pairingSettings = {
    maxAgeGapDays: DEFAULT_MAX_AGE_GAP_DAYS,
    maxWeightDiffPct: 12,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: parsed.allowSameTeamMatches,
    matchesPerWrestler: parsed.matchesPerWrestler,
    maxMatchesPerWrestler: parsed.maxMatchesPerWrestler,
    balanceTeamPairs: true,
    balancePenalty: 0.25,
  };
  await generatePairingsForMeet(meet.id, pairingSettings);
  await logMeetChange(meet.id, user.id, "Auto-generated pairings.");
  await assignMatsForMeet(meet.id, { numMats: parsed.numMats });
  await logMeetChange(meet.id, user.id, "Auto-assigned mats.");
  await reorderBoutsForMeet(meet.id, { numMats: parsed.numMats, conflictGap: parsed.restGap });
  await logMeetChange(meet.id, user.id, "Auto-reordered mats.");

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
