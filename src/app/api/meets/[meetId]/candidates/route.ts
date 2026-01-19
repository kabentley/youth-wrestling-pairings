import { NextResponse } from "next/server";
import { z } from "zod";

import { DEFAULT_MAX_AGE_GAP_DAYS, MAX_MATCHES_PER_WRESTLER } from "@/lib/constants";
import { db } from "@/lib/db";

const boolFromQuery = z.preprocess((value) => {
  if (typeof value === "string") {
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
  }
  if (typeof value === "boolean") return value;
  return undefined;
}, z.boolean());

const QuerySchema = z.object({
  wrestlerId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),

  maxAgeGapDays: z.coerce.number().min(0).default(DEFAULT_MAX_AGE_GAP_DAYS),
  maxWeightDiffPct: z.coerce.number().min(0).default(12),
  enforceAgeGap: boolFromQuery.default(true),
  firstYearOnlyWithFirstYear: boolFromQuery.default(true),
  allowSameTeamMatches: boolFromQuery.default(false),
});

function daysBetween(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}
function weightPctDiff(a: number, b: number) {
  const diff = Math.abs(a - b);
  const base = Math.min(a, b);
  return base <= 0 ? 999 : (100 * diff) / base;
}

export async function GET(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const url = new URL(req.url);
  const q = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { matchesPerWrestler: true, maxMatchesPerWrestler: true },
  });
  const maxMatches = Math.min(
    MAX_MATCHES_PER_WRESTLER,
    Math.max(1, Math.floor(meet?.maxMatchesPerWrestler ?? MAX_MATCHES_PER_WRESTLER)),
  );

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    include: { team: { include: { wrestlers: true } } },
  });

  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });
  const statusById = new Map(statuses.map(s => [s.wrestlerId, s.status]));
  const absentIds = new Set(
    statuses
      .filter(s => s.status === "NOT_COMING")
      .map(s => s.wrestlerId)
  );

  const wrestlers = meetTeams.flatMap(mt =>
    mt.team.wrestlers.map(w => ({
      id: w.id,
      guid: w.guid,
      teamId: w.teamId,
      first: w.first,
      last: w.last,
      weight: w.weight,
      birthdate: w.birthdate,
      experienceYears: w.experienceYears,
      skill: w.skill,
      active: w.active,
      status: statusById.get(w.id) ?? null,
    }))
  ).filter(w => w.active && !absentIds.has(w.id));

  const target = wrestlers.find(w => w.id === q.wrestlerId);
  if (!target && absentIds.has(q.wrestlerId)) {
    return NextResponse.json({ error: "wrestler is marked not attending" }, { status: 400 });
  }
  if (!target) return NextResponse.json({ error: "wrestler not in this meet" }, { status: 404 });

  const currentBouts = await db.bout.findMany({
    where: {
      meetId,
    },
    select: { redId: true, greenId: true },
  });
  const currentOpponentIds = new Set<string>();
  const matchCounts = new Map<string, number>();
  for (const b of currentBouts) {
    matchCounts.set(b.redId, (matchCounts.get(b.redId) ?? 0) + 1);
    matchCounts.set(b.greenId, (matchCounts.get(b.greenId) ?? 0) + 1);
    const opponentId = b.redId === target.id ? b.greenId : b.redId;
    currentOpponentIds.add(opponentId);
  }

  const rows: any[] = [];
  for (const opp of wrestlers) {
    if (opp.id === target.id) continue;
    if ((matchCounts.get(opp.id) ?? 0) >= maxMatches) continue;
    if (currentOpponentIds.has(opp.id)) continue;

    if (!q.allowSameTeamMatches && opp.teamId === target.teamId) continue;
    const ageGapDays = daysBetween(target.birthdate, opp.birthdate);
    if (q.enforceAgeGap && ageGapDays > q.maxAgeGapDays) continue;

    const wPct = weightPctDiff(target.weight, opp.weight);
    if (wPct > q.maxWeightDiffPct) continue;

    if (q.firstYearOnlyWithFirstYear) {
      const tFirst = target.experienceYears <= 0;
      const oFirst = opp.experienceYears <= 0;
      if (tFirst !== oFirst) continue;
    }

    const wDiff = Math.abs(target.weight - opp.weight);
    const expGap = Math.abs(target.experienceYears - opp.experienceYears);
    const skillGap = Math.abs(target.skill - opp.skill);

    const score =
      4 * (wDiff / 10) +
      2 * (ageGapDays / 365) +
      2 * (expGap / 3) +
      2 * (skillGap / 3);

    rows.push({
      opponent: opp,
      score,
      details: { wDiff, wPct, ageGapDays, expGap, skillGap },
    });
  }

  rows.sort((a, b) => a.score - b.score);

  return NextResponse.json({
    target,
    candidates: rows.slice(0, q.limit),
  });
}
