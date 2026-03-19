import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthorizationErrorCode, requireMeetParticipant } from "@/lib/rbac";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  try {
    await requireMeetParticipant(meetId);
  } catch (error) {
    const code = getAuthorizationErrorCode(error);
    if (code === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    if (code === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers: NO_STORE_HEADERS });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Meet not found" }, { status: 404, headers: NO_STORE_HEADERS });
    }
    throw error;
  }
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
    select: {
      wrestlerId: true,
      status: true,
      parentResponseStatus: true,
      lastChangedByUsername: true,
      lastChangedByRole: true,
      lastChangedSource: true,
      lastChangedAt: true,
    },
  });
  const statusMap = new Map(statuses.map(s => [s.wrestlerId, s]));

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
      isGirl: w.isGirl,
      status: statusMap.get(w.id)?.status ?? null,
      parentResponseStatus: statusMap.get(w.id)?.parentResponseStatus ?? null,
      statusChangedByUsername: statusMap.get(w.id)?.lastChangedByUsername ?? null,
      statusChangedByRole: statusMap.get(w.id)?.lastChangedByRole ?? null,
      statusChangedSource: statusMap.get(w.id)?.lastChangedSource ?? null,
      statusChangedAt: statusMap.get(w.id)?.lastChangedAt?.toISOString() ?? null,
      active: w.active,
    }))
  ).filter(w => (w.active ? true : boutWrestlerIds.has(w.id)));

  return NextResponse.json({ teams, wrestlers }, { headers: NO_STORE_HEADERS });
}
