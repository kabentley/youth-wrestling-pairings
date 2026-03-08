import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    throw error;
  }
}
