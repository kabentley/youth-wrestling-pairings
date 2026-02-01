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
      select: { maxMatchesPerWrestler: true, deletedAt: true },
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
  });
  await logMeetChange(meetId, user.id, "Generated pairings.");
  if (settings.preserveMats) {
    const assignResult = await assignMatsForMeet(meetId, { preserveExisting: true });
    if (assignResult.assigned > 0) {
      await logMeetChange(meetId, user.id, "Assigned mats for new bouts.");
    }
    return NextResponse.json({ ...result, ...assignResult, reordered: 0 });
  }
  const assignResult = await assignMatsForMeet(meetId);
  await logMeetChange(meetId, user.id, "Assigned mats.");
  const reorderResult = await reorderBoutsForMeet(meetId);
  await logMeetChange(meetId, user.id, "Reordered mats.");
  return NextResponse.json({ ...result, ...assignResult, ...reorderResult });
}
