import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

export async function GET() {
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });
  if (!user?.teamId) {
    return NextResponse.json({ error: "Your account has no team assigned." }, { status: 400 });
  }

  const wrestlers = await db.wrestler.findMany({
    where: { teamId: user.teamId, active: true },
    select: {
      id: true,
      guid: true,
      first: true,
      last: true,
      teamId: true,
      weight: true,
      experienceYears: true,
      team: { select: { name: true, symbol: true, color: true } },
    },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });

  return NextResponse.json(
    wrestlers.map((w) => ({
      id: w.id,
      guid: w.guid,
      first: w.first,
      last: w.last,
      teamId: w.teamId,
      teamName: w.team.name,
      teamSymbol: w.team.symbol ?? undefined,
      teamColor: w.team.color ?? undefined,
      weight: w.weight,
      experienceYears: w.experienceYears,
    })),
  );
}
