import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const QuerySchema = z.object({
  wrestlerId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),

  maxAgeGapDays: z.coerce.number().int().min(0).default(365),
  maxWeightDiffPct: z.coerce.number().min(0).default(12),
  firstYearOnlyWithFirstYear: z.coerce.boolean().default(true),
  allowSameTeamMatches: z.coerce.boolean().default(false),
});

function daysBetween(a: Date, b: Date) {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}
function weightPctDiff(a: number, b: number) {
  const diff = Math.abs(a - b);
  const base = Math.min(a, b);
  return base <= 0 ? 999 : (100 * diff) / base;
}

export async function GET(req: Request, { params }: { params: { meetId: string } }) {
  const url = new URL(req.url);
  const q = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

  const meetTeams = await db.meetTeam.findMany({
    where: { meetId: params.meetId },
    include: { team: { include: { wrestlers: true } } },
  });

  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId: params.meetId },
    select: { wrestlerId: true, status: true },
  });
  const absentIds = new Set(statuses.filter(s => s.status === "ABSENT").map(s => s.wrestlerId));

  const wrestlers = meetTeams.flatMap(mt =>
    mt.team.wrestlers.map(w => ({
      id: w.id,
      teamId: w.teamId,
      first: w.first,
      last: w.last,
      weight: w.weight,
      birthdate: w.birthdate,
      experienceYears: w.experienceYears,
      skill: w.skill,
      active: w.active,
    }))
  ).filter(w => w.active && !absentIds.has(w.id));

  const target = wrestlers.find(w => w.id === q.wrestlerId);
  if (!target && absentIds.has(q.wrestlerId)) {
    return NextResponse.json({ error: "wrestler is marked not attending" }, { status: 400 });
  }
  if (!target) return NextResponse.json({ error: "wrestler not in this meet" }, { status: 404 });

  const excluded = await db.excludedPair.findMany({ where: { meetId: params.meetId } });
  const excludedSet = new Set(excluded.map(e => `${e.aId}|${e.bId}`));
  function isExcluded(aId: string, bId: string) {
    const [a, b] = aId < bId ? [aId, bId] : [bId, aId];
    return excludedSet.has(`${a}|${b}`);
  }

  const rows: any[] = [];
  for (const opp of wrestlers) {
    if (opp.id === target.id) continue;

    if (!q.allowSameTeamMatches && opp.teamId === target.teamId) continue;
    if (isExcluded(target.id, opp.id)) continue;

    const ageGapDays = daysBetween(target.birthdate, opp.birthdate);
    if (ageGapDays > q.maxAgeGapDays) continue;

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
