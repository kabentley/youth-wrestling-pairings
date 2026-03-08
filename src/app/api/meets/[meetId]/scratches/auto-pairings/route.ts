import { NextResponse } from "next/server";

import { assignMatsForMeet } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { generateScratchPairingsForMeet } from "@/lib/generateScratchPairings";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { normalizeMeetPhase } from "@/lib/meetPhase";
import { requireAnyRole } from "@/lib/rbac";

type CheckpointPayload = {
  attendance?: Array<{ wrestlerId?: string; status?: "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null }>;
  bouts?: Array<{ redId?: string; greenId?: string }>;
};

export async function POST(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to manage scratches." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    await requireMeetLock(meetId, user.id, user.role);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }

  const [meet, league, checkpoint] = await Promise.all([
    db.meet.findUnique({
      where: { id: meetId },
      select: {
        deletedAt: true,
      status: true,
      homeTeamId: true,
      allowSameTeamMatches: true,
      girlsWrestleGirls: true,
      matchesPerWrestler: true,
      maxMatchesPerWrestler: true,
      homeTeam: { select: { headCoachId: true } },
    },
    }),
    db.league.findFirst({ select: { maxAgeGapYears: true, maxWeightDiffPct: true } }),
    db.meetCheckpoint.findFirst({
      where: {
        meetId,
        OR: [
          { name: { startsWith: "Ready for Check-in " } },
          { name: { startsWith: "Check-in " } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true },
    }),
  ]);

  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
  if (normalizeMeetPhase(meet.status) !== "READY_FOR_CHECKIN") {
    return NextResponse.json({ error: "Scratch auto-pairings are only available during Check-in." }, { status: 400 });
  }
  if (!meet.homeTeamId) {
    return NextResponse.json({ error: "Meet must have a home team before generating replacement matches." }, { status: 400 });
  }

  const isCoordinator = Boolean(meet.homeTeam?.headCoachId) && meet.homeTeam?.headCoachId === user.id;
  if (!isCoordinator && user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only the Meet Coordinator or an admin can manage scratches." },
      { status: 403 },
    );
  }
  if (!checkpoint) {
    return NextResponse.json({ error: "No Check-in checkpoint found." }, { status: 400 });
  }

  const baselineMatchCounts = new Map<string, number>();
  const baselineAttendance = new Map<string, "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null>();
  const payload = (checkpoint.payload ?? {}) as CheckpointPayload;
  for (const attendance of Array.isArray(payload.attendance) ? payload.attendance : []) {
    if (typeof attendance.wrestlerId !== "string") continue;
    baselineAttendance.set(attendance.wrestlerId, attendance.status ?? null);
  }
  for (const bout of Array.isArray(payload.bouts) ? payload.bouts : []) {
    if (typeof bout.redId !== "string" || typeof bout.greenId !== "string") continue;
    baselineMatchCounts.set(bout.redId, (baselineMatchCounts.get(bout.redId) ?? 0) + 1);
    baselineMatchCounts.set(bout.greenId, (baselineMatchCounts.get(bout.greenId) ?? 0) + 1);
  }

  const [statuses, bouts] = await Promise.all([
    db.meetWrestlerStatus.findMany({
      where: { meetId },
      select: { wrestlerId: true, status: true },
    }),
    db.bout.findMany({
      where: { meetId },
      select: { redId: true, greenId: true },
    }),
  ]);

  const attendingIds = new Set(
    statuses
      .filter((entry) => entry.status === "COMING" || entry.status === "LATE" || entry.status === "EARLY")
      .map((entry) => entry.wrestlerId),
  );
  const currentMatchCounts = new Map<string, number>();
  for (const bout of bouts) {
    currentMatchCounts.set(bout.redId, (currentMatchCounts.get(bout.redId) ?? 0) + 1);
    currentMatchCounts.set(bout.greenId, (currentMatchCounts.get(bout.greenId) ?? 0) + 1);
  }

  const targetDeficits: Record<string, number> = {};
  const targetMatches = typeof meet.matchesPerWrestler === "number" ? Math.max(1, Math.floor(meet.matchesPerWrestler)) : null;
  for (const [wrestlerId, baselineMatches] of baselineMatchCounts.entries()) {
    if (!attendingIds.has(wrestlerId)) continue;
    const currentMatches = currentMatchCounts.get(wrestlerId) ?? 0;
    const lostMatches = Math.max(0, baselineMatches - currentMatches);
    if (lostMatches <= 0) continue;
    if (targetMatches === null) {
      targetDeficits[wrestlerId] = lostMatches;
      continue;
    }
    const shortfall = Math.max(0, targetMatches - currentMatches);
    const deficit = Math.min(lostMatches, shortfall);
    if (deficit > 0) {
      targetDeficits[wrestlerId] = deficit;
    }
  }
  if (targetMatches !== null) {
    for (const wrestlerId of attendingIds) {
      if (targetDeficits[wrestlerId]) continue;
      const baselineStatus = baselineAttendance.get(wrestlerId);
      const wasUnexpectedAtCheckin = baselineStatus == null || baselineStatus === "NOT_COMING";
      if (!wasUnexpectedAtCheckin) continue;
      const currentMatches = currentMatchCounts.get(wrestlerId) ?? 0;
      const shortfall = Math.max(0, targetMatches - currentMatches);
      if (shortfall > 0) {
        targetDeficits[wrestlerId] = shortfall;
      }
    }
  }

  const maxAgeGapDays = Math.round((league?.maxAgeGapYears ?? 1) * 365);
  const maxWeightDiffPct = league?.maxWeightDiffPct ?? 10;
  const result = await generateScratchPairingsForMeet(meetId, {
    maxAgeGapDays,
    maxWeightDiffPct,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: meet.allowSameTeamMatches,
    girlsWrestleGirls: meet.girlsWrestleGirls,
    allowRejectedMatchups: false,
    maxMatchesPerWrestler: meet.maxMatchesPerWrestler,
    homeTeamId: meet.homeTeamId,
    targetDeficits,
  });

  const changeMessages: string[] = [];
  if (result.created > 0) {
    const generatedMessage = `Generated scratch auto-pairings (${result.created} bout${result.created === 1 ? "" : "s"} for ${result.targetedWrestlers} wrestler${result.targetedWrestlers === 1 ? "" : "s"} needing matches).`;
    await logMeetChange(meetId, user.id, generatedMessage);
    changeMessages.push(generatedMessage);

    const assignResult = await assignMatsForMeet(meetId, { preserveExisting: true });
    if (assignResult.assigned > 0) {
      const assignedMessage = "Assigned mats for scratch auto-pairings.";
      await logMeetChange(meetId, user.id, assignedMessage);
      changeMessages.push(assignedMessage);
    }
    return NextResponse.json({ ...result, ...assignResult, changeMessages });
  }

  const noChangesMessage = result.targetedWrestlers > 0
    ? "No replacement matches could be found for wrestlers needing matches."
    : "No wrestlers currently need matches.";
  return NextResponse.json({
    ...result,
    assigned: 0,
    reordered: 0,
    changeMessages: [noChangesMessage],
  });
}
