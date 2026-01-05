import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTeamCoach } from "@/lib/rbac";
import { z } from "zod";

const BodySchema = z.object({
  active: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: { teamId: string; wrestlerId: string } }) {
  await requireTeamCoach(params.teamId);
  const body = BodySchema.parse(await req.json());

  const wrestler = await db.wrestler.findUnique({
    where: { id: params.wrestlerId },
    select: { id: true, teamId: true },
  });
  if (!wrestler || wrestler.teamId !== params.teamId) {
    return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  }

  await db.wrestler.update({
    where: { id: params.wrestlerId },
    data: { active: body.active },
  });

  return NextResponse.json({ ok: true });
}
