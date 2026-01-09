import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

export async function GET() {
  let userId: string;
  try {
    ({ userId } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      teamId: true,
      team: { select: { name: true, symbol: true, logoData: true, color: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const teamLogoUrl = user.teamId && user.team?.logoData ? `/api/teams/${user.teamId}/logo/file` : null;
  const teamInfo = user.team
    ? {
        name: user.team.name,
        symbol: user.team.symbol,
        color: user.team.color,
      }
    : null;
  return NextResponse.json({
    id: user.id,
    username: user.username,
    role: user.role,
    teamId: user.teamId,
    team: teamInfo,
    teamLogoUrl,
  });
}
