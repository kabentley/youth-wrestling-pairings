import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePairingsForMeet } from "@/lib/generatePairings";
import { requireRole } from "@/lib/rbac";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";

const SettingsSchema = z.object({
  maxAgeGapDays: z.number().int().min(0),
  maxWeightDiffPct: z.number().min(0),
  firstYearOnlyWithFirstYear: z.boolean(),
  allowSameTeamMatches: z.boolean().default(false),
  balanceTeamPairs: z.boolean().default(true),
  balancePenalty: z.number().min(0).default(0.25),
});

export async function POST(req: Request, { params }: { params: { meetId: string } }) {
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(params.meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = await req.json();
  const settings = SettingsSchema.parse(body);
  const result = await generatePairingsForMeet(params.meetId, settings);
  return NextResponse.json(result);
}
