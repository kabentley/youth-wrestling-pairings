import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET() {
  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      symbol: true,
      logoData: true,
      headCoach: { select: { username: true, name: true } },
    },
  });
  return NextResponse.json(
    teams.map((team) => ({
      id: team.id,
      name: team.name,
      symbol: team.symbol,
      hasLogo: Boolean(team.logoData),
      headCoach: team.headCoach
        ? {
            username: team.headCoach.username,
            name: team.headCoach.name ?? null,
          }
        : null,
    })),
  );
}
