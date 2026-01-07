import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  await requireRole("COACH");
  const changes = await db.meetChange.findMany({
    where: { meetId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { username: true } } },
  });
  return NextResponse.json(changes);
}
