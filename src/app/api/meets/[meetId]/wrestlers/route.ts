import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const meetTeams = await db.meetTeam.findMany({
    where: { meetId },
    include: { team: { include: { wrestlers: true } } },
  });

  const boutWrestlers = await db.bout.findMany({
    where: { meetId },
    select: { redId: true, greenId: true },
  });
  const boutWrestlerIds = new Set(boutWrestlers.flatMap(b => [b.redId, b.greenId]));

  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId },
    select: { wrestlerId: true, status: true },
  });
  const statusMap = new Map(statuses.map(s => [s.wrestlerId, s.status]));

  const teams = meetTeams.map(mt => ({
    id: mt.team.id,
    name: mt.team.name,
    symbol: mt.team.symbol,
    color: mt.team.color,
    defaultRestGap: mt.team.defaultRestGap,
    defaultMaxMatchesPerWrestler: mt.team.defaultMaxMatchesPerWrestler,
  }));
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
      status: statusMap.get(w.id) ?? null,
      active: w.active,
    }))
  ).filter(w => (w.active ? true : boutWrestlerIds.has(w.id)));

  return NextResponse.json({ teams, wrestlers });
}
