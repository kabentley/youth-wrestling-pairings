import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

const BodySchema = z.object({
  wrestlerId: z.string().min(1),
});

export async function GET() {
  const { userId } = await requireSession();
  const rows = await db.userChild.findMany({
    where: { userId },
    select: {
      wrestler: {
        select: {
          id: true,
          guid: true,
          first: true,
          last: true,
          teamId: true,
          active: true,
          birthdate: true,
          weight: true,
          experienceYears: true,
          team: { select: { name: true, symbol: true, color: true } },
        },
      },
    },
    orderBy: { wrestler: { last: "asc" } },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.wrestler.id,
      guid: r.wrestler.guid,
      first: r.wrestler.first,
      last: r.wrestler.last,
      teamId: r.wrestler.teamId,
      teamName: r.wrestler.team.name,
      teamSymbol: r.wrestler.team.symbol,
      teamColor: r.wrestler.team.color,
      active: r.wrestler.active,
      birthdate: r.wrestler.birthdate,
      weight: r.wrestler.weight,
      experienceYears: r.wrestler.experienceYears,
    })),
  );
}

export async function POST(req: Request) {
  const { userId } = await requireSession();
  const body = BodySchema.parse(await req.json());

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, teamId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.teamId) {
    return NextResponse.json({ error: "Your account has no team assigned." }, { status: 400 });
  }

  const wrestler = await db.wrestler.findUnique({
    where: { id: body.wrestlerId },
    select: { id: true, active: true, teamId: true },
  });
  if (!wrestler?.active) {
    return NextResponse.json({ error: "Wrestler not found" }, { status: 404 });
  }
  if (user.role === "PARENT" && wrestler.teamId !== user.teamId) {
    return NextResponse.json({ error: "You can only add wrestlers from your team." }, { status: 403 });
  }

  await db.userChild.upsert({
    where: { userId_wrestlerId: { userId, wrestlerId: body.wrestlerId } },
    update: {},
    create: { userId, wrestlerId: body.wrestlerId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId } = await requireSession();
  const body = BodySchema.parse(await req.json());

  await db.userChild.deleteMany({
    where: { userId, wrestlerId: body.wrestlerId },
  });

  return NextResponse.json({ ok: true });
}
