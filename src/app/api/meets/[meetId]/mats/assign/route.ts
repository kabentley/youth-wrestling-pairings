import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { requireRole } from "@/lib/rbac";
import { reorderBoutsForMeetUntilStable } from "@/lib/reorderBouts";

const BodySchema = z.object({
  numMats: z.number().int().min(1).max(8),
});

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id, user.role);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = BodySchema.parse(await req.json());
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { homeTeamId: true, deletedAt: true, status: true, numMats: true, updatedById: true, homeTeam: { select: { headCoachId: true } } },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before assigning mats." }, { status: 400 });
  }
  if (normalizeMeetPhase(meet.status) !== "DRAFT") {
    return NextResponse.json({ error: "Mat count can only be changed during Draft." }, { status: 400 });
  }
  const coordinatorId = meet.homeTeam?.headCoachId ?? null;
  if (!coordinatorId || user.id !== coordinatorId) {
    return NextResponse.json({ error: "Only the Meet Coordinator can change the mat count." }, { status: 403 });
  }
  await db.meet.update({
    where: { id: meetId },
    data: { numMats: body.numMats, updatedById: user.id },
  });
  const result = await assignMatsForMeet(meetId, { numMats: body.numMats });
  const reorderResult = await reorderBoutsForMeetUntilStable(meetId, { numMats: body.numMats });
  const changeMessage =
    meet.numMats === body.numMats
      ? "Reassigned all bouts across the current mat list and reordered all mats."
      : `Changed mat count from ${meet.numMats} to ${body.numMats}, reassigned all bouts, and reordered all mats.`;
  await logMeetChange(meetId, user.id, changeMessage);
  return NextResponse.json({ ...result, reordered: reorderResult.reordered });
}
