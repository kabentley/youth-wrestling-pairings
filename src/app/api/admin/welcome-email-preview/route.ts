import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { buildWelcomeEmailPreview } from "@/lib/welcomeEmail";

const BodySchema = z.object({
  teamId: z.string().trim().optional().default(""),
});

export async function POST(req: Request) {
  await requireAdmin();
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preview payload." }, { status: 400 });
  }

  const { teamId } = parsed.data;
  const selectedTeamId = teamId.trim();
  const team = selectedTeamId
    ? await db.team.findUnique({
      where: { id: selectedTeamId },
      select: { id: true, name: true, symbol: true },
    })
    : null;
  const previewWrestlers = team
    ? await db.wrestler.findMany({
      where: { teamId: team.id, active: true },
      select: { first: true, last: true },
      orderBy: [{ last: "asc" }, { first: "asc" }],
      take: 3,
    })
    : [];

  const preview = await buildWelcomeEmailPreview({
    request: req,
    email: "newuser@example.com",
    username: "newuser1",
    fullName: "Sample Parent",
    tempPassword: "TempPass123!",
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
    teamLabel: team ? `${team.name} (${team.symbol})` : null,
    linkedWrestlerNames: previewWrestlers.map((wrestler) => `${wrestler.first} ${wrestler.last}`.trim()),
    mustResetPassword: true,
  });

  return NextResponse.json(preview);
}
