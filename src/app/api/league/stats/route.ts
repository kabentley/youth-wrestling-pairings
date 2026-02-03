import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export async function GET() {
  await requireAdmin();
  const [teamCount, activeWrestlers, inactiveWrestlers, totalGirls] = await Promise.all([
    db.team.count(),
    db.wrestler.count({ where: { active: true } }),
    db.wrestler.count({ where: { active: false } }),
    db.wrestler.count({ where: { isGirl: true } }),
  ]);

  return NextResponse.json({
    teamCount,
    activeWrestlers,
    inactiveWrestlers,
    totalWrestlers: activeWrestlers + inactiveWrestlers,
    totalGirls,
  });
}
