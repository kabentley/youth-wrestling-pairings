import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function GET() {
  const { user } = await requireRole("COACH");
  if (!user.teamId) {
    return NextResponse.json({ error: "You must be assigned a team." }, { status: 403 });
  }
  const team = await db.team.findUnique({
    where: { id: user.teamId },
    select: { id: true, name: true, symbol: true, headCoachId: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const parents = db.user.findMany({
    where: { teamId: user.teamId, role: "PARENT" },
    select: { id: true, username: true, name: true, email: true, phone: true },
    orderBy: { username: "asc" },
  });
  const coaches = db.user.findMany({
    where: { teamId: user.teamId, role: "COACH" },
    select: { id: true, username: true, name: true, email: true, phone: true },
    orderBy: { username: "asc" },
  });
  const tableWorkers = db.user.findMany({
    where: { teamId: user.teamId, role: "TABLE_WORKER" },
    select: { id: true, username: true, name: true, email: true, phone: true },
    orderBy: { username: "asc" },
  });

  const [parentList, coachList, tableWorkerList] = await Promise.all([parents, coaches, tableWorkers]);
  return NextResponse.json({
    team,
    parents: parentList,
    coaches: coachList,
    tableWorkers: tableWorkerList,
  });
}
