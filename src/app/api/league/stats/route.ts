import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export async function GET() {
  await requireAdmin();
  const [teamCount, activeWrestlers, inactiveWrestlers] = await Promise.all([
    db.team.count(),
    db.wrestler.count({ where: { active: true } }),
    db.wrestler.count({ where: { active: false } }),
  ]);

  return NextResponse.json({
    teamCount,
    activeWrestlers,
    inactiveWrestlers,
    totalWrestlers: activeWrestlers + inactiveWrestlers,
  });
}
