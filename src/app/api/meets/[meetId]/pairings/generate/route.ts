import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { generatePairingsForMeet } from "@/lib/generatePairings";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";
import { reorderBoutsForMeet } from "@/lib/reorderBouts";

const SettingsSchema = z.object({
  firstYearOnlyWithFirstYear: z.boolean(),
  allowSameTeamMatches: z.boolean().default(false),
  girlsWrestleGirls: z.boolean().default(true),
  matchesPerWrestler: z.number().int().min(1).max(5).default(2),
  pruneTargetMatches: z.number().int().min(1).max(5).optional(),
  maxMatchesPerWrestler: z.number().int().min(1).max(5).optional(),
  preserveMats: z.boolean().optional(),
  allowRejectedMatchups: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = await req.json();
  const settings = SettingsSchema.parse(body);
  const [meet, league] = await Promise.all([
    db.meet.findUnique({
      where: { id: meetId },
      select: { maxMatchesPerWrestler: true, deletedAt: true, homeTeamId: true },
    }),
    db.league.findFirst({ select: { maxAgeGapYears: true, maxWeightDiffPct: true } }),
  ]);
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const maxAgeGapDays = Math.round((league?.maxAgeGapYears ?? 1) * 365);
  const maxWeightDiffPct = league?.maxWeightDiffPct ?? 10;
  const result = await generatePairingsForMeet(meetId, {
    ...settings,
    maxAgeGapDays,
    maxWeightDiffPct,
    maxMatchesPerWrestler: settings.maxMatchesPerWrestler ?? meet.maxMatchesPerWrestler,
    homeTeamId: meet.homeTeamId ?? null,
  });
  const createdCount = result.created;
  const targetMatches = settings.matchesPerWrestler;
  const changeMessages: string[] = [];
  const generatedMessage = `Generated pairings (${createdCount} bout${createdCount === 1 ? "" : "s"}; target ${targetMatches} matches).`;
  await logMeetChange(
    meetId,
    user.id,
    generatedMessage,
  );
  changeMessages.push(generatedMessage);
  const removedCount = result.removedOverTarget;
  if (removedCount > 0) {
    const pruneTarget = settings.pruneTargetMatches ?? settings.matchesPerWrestler;
    const targetLabel = pruneTarget ? `more than ${pruneTarget}` : "too many";
    const removedMessage = `Removed ${removedCount} bout${removedCount === 1 ? "" : "s"} where both wrestlers had ${targetLabel} matches.`;
    await logMeetChange(
      meetId,
      user.id,
      removedMessage,
    );
    changeMessages.push(removedMessage);
  }
  if (settings.preserveMats) {
    const assignResult = await assignMatsForMeet(meetId, { preserveExisting: true });
    if (assignResult.assigned > 0) {
      const assignedMessage = "Assigned mats for new bouts.";
      await logMeetChange(meetId, user.id, assignedMessage);
      changeMessages.push(assignedMessage);
    }
    return NextResponse.json({ ...result, ...assignResult, reordered: 0, changeMessages });
  }
  const assignResult = await assignMatsForMeet(meetId);
  const assignedMessage = "Assigned mats.";
  await logMeetChange(meetId, user.id, assignedMessage);
  changeMessages.push(assignedMessage);
  const reorderResult = await reorderBoutsForMeet(meetId);
  const reorderedMessage = "Reordered mats.";
  await logMeetChange(meetId, user.id, reorderedMessage);
  changeMessages.push(reorderedMessage);
  return NextResponse.json({ ...result, ...assignResult, ...reorderResult, changeMessages });
}
