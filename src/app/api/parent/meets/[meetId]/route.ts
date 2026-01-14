import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ meetId: string }> },
) {
  const { meetId } = await params;
  const { userId } = await requireSession();

  const children = await db.userChild.findMany({
    where: { userId },
    select: { wrestlerId: true },
  });
  if (children.length === 0) {
    return NextResponse.json({ error: "No linked wrestlers." }, { status: 404 });
  }

  const childIds = children.map((c) => c.wrestlerId);
  const hasAccess = await db.bout.count({
    where: {
      meetId,
      OR: [{ redId: { in: childIds } }, { greenId: { in: childIds } }],
    },
  });
  if (!hasAccess) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }

  const meet = await db.meet.findUnique({
      where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      homeTeam: { select: { name: true, symbol: true, address: true } },
    },
  });
  if (!meet) return NextResponse.json({ error: "Meet not found." }, { status: 404 });

  return NextResponse.json({
    id: meet.id,
    name: meet.name,
    date: meet.date,
    location: meet.location ?? meet.homeTeam?.address ?? null,
    homeTeam: meet.homeTeam ? `${meet.homeTeam.name} (${meet.homeTeam.symbol ?? ""})`.trim() : null,
  });
}
