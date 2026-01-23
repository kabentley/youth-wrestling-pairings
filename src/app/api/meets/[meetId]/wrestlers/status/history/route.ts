import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function GET(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  await requireRole("COACH");
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const wrestlerId = url.searchParams.get("wrestlerId");
  if (!wrestlerId) return NextResponse.json({ error: "wrestlerId required" }, { status: 400 });

  const history = await db.meetWrestlerStatusHistory.findMany({
    where: { meetId, wrestlerId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { changedBy: { select: { username: true } } },
  });

  return NextResponse.json(history);
}
