import { NextResponse } from "next/server";
import { z } from "zod";
import { assignMatsForMeet } from "@/lib/assignMats";

const BodySchema = z.object({
  numMats: z.number().int().min(1).max(10),
  minRestBouts: z.number().int().min(0).max(20),
  restPenalty: z.number().min(0).max(1000),
});

export async function POST(req: Request) {
  await requireRole("COACH");
  const body = BodySchema.parse(await req.json());
  const result = await assignMatsForMeet(params.meetId, body);
  return NextResponse.json(result);
}
