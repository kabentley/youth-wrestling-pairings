import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAnyRole } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "TABLE_WORKER", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to enter results." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!meet || meet.deletedAt) return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  if (user.role === "COACH" || user.role === "TABLE_WORKER") {
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned." }, { status: 403 });
    }
    const teamRows = await db.meetTeam.findMany({
      where: { meetId },
      select: { teamId: true },
    });
    const teamIds = new Set(teamRows.map(t => t.teamId));
    if (!teamIds.has(user.teamId)) {
      return NextResponse.json({ error: "You are not authorized to enter results for this meet." }, { status: 403 });
    }
  }

  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: { in: ["NOT_COMING"] } },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(absent.map(a => a.wrestlerId));

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      mat: true,
      order: true,
      redId: true,
      greenId: true,
      resultWinnerId: true,
      resultType: true,
      resultScore: true,
      resultPeriod: true,
      resultTime: true,
      resultNotes: true,
      resultAt: true,
    },
  });
  const filtered = bouts.filter(b => !absentIds.has(b.redId) && !absentIds.has(b.greenId));
  const wrestlerIds = new Set<string>();
  for (const b of filtered) {
    wrestlerIds.add(b.redId);
    wrestlerIds.add(b.greenId);
  }
  const wrestlers = await db.wrestler.findMany({
    where: { id: { in: Array.from(wrestlerIds) } },
    select: {
      id: true,
      first: true,
      last: true,
      teamId: true,
      team: { select: { name: true, symbol: true, color: true } },
    },
  });
  const wrestlerMap = new Map(wrestlers.map(w => [w.id, w]));

  return NextResponse.json({
    meet,
    bouts: filtered.map(b => ({
      id: b.id,
      mat: b.mat,
      order: b.order,
      red: wrestlerMap.get(b.redId) ?? { id: b.redId, first: "Unknown", last: "", teamId: "", team: { name: "", symbol: "", color: "#000000" } },
      green: wrestlerMap.get(b.greenId) ?? { id: b.greenId, first: "Unknown", last: "", teamId: "", team: { name: "", symbol: "", color: "#000000" } },
      resultWinnerId: b.resultWinnerId,
      resultType: b.resultType,
      resultScore: b.resultScore,
      resultPeriod: b.resultPeriod,
      resultTime: b.resultTime,
      resultNotes: b.resultNotes,
      resultAt: b.resultAt,
    })),
  });
}
