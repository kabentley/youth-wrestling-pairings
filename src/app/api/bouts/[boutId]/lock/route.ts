import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const BodySchema = z.object({ locked: z.boolean() });

export async function PATCH(req: Request) {
  await requireRole("COACH");
  const body = BodySchema.parse(await req.json());

  const updated = await db.bout.update({
    where: { id: params.boutId },
    data: { locked: body.locked },
  });

  return NextResponse.json(updated);
}
