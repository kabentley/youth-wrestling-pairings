import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePairingsForMeet } from "@/lib/generatePairings";

const SettingsSchema = z.object({
  maxAgeGapDays: z.number().int().min(0),
  maxWeightDiffPct: z.number().min(0),
  firstYearOnlyWithFirstYear: z.boolean(),
  allowSameTeamMatches: z.boolean().default(false),
  balanceTeamPairs: z.boolean().default(true),
  balancePenalty: z.number().min(0).default(0.25),
});

export async function POST(req: Request) {
  await requireRole("COACH");
  const body = await req.json();
  const settings = SettingsSchema.parse(body);
  const result = await generatePairingsForMeet(params.meetId, settings);
  return NextResponse.json(result);
}
