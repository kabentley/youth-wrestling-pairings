import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

export async function GET() {
  const { userId } = await requireSession();

  const children = await db.userChild.findMany({
    where: { userId },
    select: {
      wrestler: {
        select: {
          id: true,
          guid: true,
          first: true,
          last: true,
          teamId: true,
          team: { select: { name: true, symbol: true, color: true } },
        },
      },
    },
  });

  if (children.length === 0) {
    return NextResponse.json({ children: [], meets: [] });
  }

  const childIds = children.map((c) => c.wrestler.id);
  const bouts = await db.bout.findMany({
    where: {
      OR: [{ redId: { in: childIds } }, { greenId: { in: childIds } }],
    },
    select: {
      id: true,
      meetId: true,
      redId: true,
      greenId: true,
      mat: true,
      order: true,
      resultWinnerId: true,
      resultType: true,
      resultScore: true,
      resultPeriod: true,
      resultTime: true,
      meet: {
        select: {
          id: true,
          name: true,
          date: true,
          location: true,
        },
      },
    },
    orderBy: [{ meet: { date: "asc" } }, { mat: "asc" }, { order: "asc" }],
  });

  const wrestlerIds = new Set<string>();
  for (const b of bouts) {
    wrestlerIds.add(b.redId);
    wrestlerIds.add(b.greenId);
  }

  const wrestlers = await db.wrestler.findMany({
    where: { id: { in: Array.from(wrestlerIds) } },
    select: { id: true, first: true, last: true, teamId: true, team: { select: { name: true, symbol: true, color: true } } },
  });
  const wMap = new Map(wrestlers.map((w) => [w.id, w]));

  const meetMap = new Map<string, { meet: { id: string; name: string; date: Date; location: string | null }; matches: any[] }>();

  for (const b of bouts) {
    const meet = b.meet;
    if (!meetMap.has(meet.id)) {
      meetMap.set(meet.id, { meet, matches: [] });
    }

    if (childIds.includes(b.redId)) {
      const opp = wMap.get(b.greenId);
      meetMap.get(meet.id)!.matches.push({
        boutId: b.id,
        childId: b.redId,
        corner: "red",
        opponentId: b.greenId,
        opponentName: opp ? `${opp.first} ${opp.last}` : b.greenId,
        opponentTeam: opp?.team?.symbol ?? opp?.team?.name ?? opp?.teamId ?? "",
        opponentTeamColor: opp?.team?.color ?? "#000000",
        mat: b.mat,
        order: b.order,
        result: {
          winnerId: b.resultWinnerId ?? null,
          type: b.resultType ?? null,
          score: b.resultScore ?? null,
          period: b.resultPeriod ?? null,
          time: b.resultTime ?? null,
        },
      });
    }
    if (childIds.includes(b.greenId)) {
      const opp = wMap.get(b.redId);
      meetMap.get(meet.id)!.matches.push({
        boutId: b.id,
        childId: b.greenId,
        corner: "green",
        opponentId: b.redId,
        opponentName: opp ? `${opp.first} ${opp.last}` : b.redId,
        opponentTeam: opp?.team?.symbol ?? opp?.team?.name ?? opp?.teamId ?? "",
        opponentTeamColor: opp?.team?.color ?? "#000000",
        mat: b.mat,
        order: b.order,
        result: {
          winnerId: b.resultWinnerId ?? null,
          type: b.resultType ?? null,
          score: b.resultScore ?? null,
          period: b.resultPeriod ?? null,
          time: b.resultTime ?? null,
        },
      });
    }
  }

  const meets = Array.from(meetMap.values()).sort((a, b) => a.meet.date.getTime() - b.meet.date.getTime());

  return NextResponse.json({
    children: children.map((c) => ({
      id: c.wrestler.id,
      guid: c.wrestler.guid,
      first: c.wrestler.first,
      last: c.wrestler.last,
      teamId: c.wrestler.teamId,
      teamName: c.wrestler.team.name,
      teamSymbol: c.wrestler.team.symbol,
      teamColor: c.wrestler.team.color,
    })),
    meets,
  });
}
