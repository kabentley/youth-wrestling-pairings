import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  try {
    await requireRole("COACH");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    }
    throw error;
  }
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { deletedAt: true },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }
  const changes = await db.meetChange.findMany({
    where: { meetId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { username: true } } },
  });
  return NextResponse.json(changes);
}
