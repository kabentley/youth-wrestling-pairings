import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const BodySchema = z.object({ aId: z.string().min(1), bId: z.string().min(1) });

export async function POST(req: Request) {
  await requireRole("COACH");
  const body = BodySchema.parse(await req.json());
  const [aId, bId] = body.aId < body.bId ? [body.aId, body.bId] : [body.bId, body.aId];

  await db.excludedPair.upsert({
    where: { meetId_aId_bId: { meetId: params.meetId, aId, bId } },
    update: {},
    create: { meetId: params.meetId, aId, bId },
  });

  return NextResponse.json({ ok: true });
}
