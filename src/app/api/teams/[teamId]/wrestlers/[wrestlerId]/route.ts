import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireTeamCoach } from "@/lib/rbac";

const BodySchema = z.object({
  active: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ teamId: string; wrestlerId: string }> }) {
  const { teamId, wrestlerId } = await params;
  await requireTeamCoach(teamId);
  const body = BodySchema.parse(await req.json());

  const wrestler = await db.wrestler.findUnique({
    where: { id: wrestlerId },
    select: { id: true, teamId: true },
  });
  if (wrestler?.teamId !== teamId) {
    return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  }

  await db.wrestler.update({
    where: { id: wrestlerId },
    data: { active: body.active },
  });

  return NextResponse.json({ ok: true });
}
