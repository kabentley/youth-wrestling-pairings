import { NextResponse } from "next/server";
import { z } from "zod";

import { assignMatsForMeet } from "@/lib/assignMats";
import { generatePairingsForMeet } from "@/lib/generatePairings";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const SettingsSchema = z.object({
  maxAgeGapDays: z.number().min(0),
  maxWeightDiffPct: z.number().min(0),
  firstYearOnlyWithFirstYear: z.boolean(),
  allowSameTeamMatches: z.boolean().default(false),
  matchesPerWrestler: z.number().int().min(1).max(5).default(1),
  balanceTeamPairs: z.boolean().default(true),
  balancePenalty: z.number().min(0).default(0.25),
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
  const result = await generatePairingsForMeet(meetId, settings);
  await logMeetChange(meetId, user.id, "Generated pairings.");
  const assignResult = await assignMatsForMeet(meetId);
  await logMeetChange(meetId, user.id, "Assigned mats.");
  return NextResponse.json({ ...result, ...assignResult });
}
