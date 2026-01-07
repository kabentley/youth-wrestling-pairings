import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: { in: ["NOT_COMING"] } },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(statuses.map(s => s.wrestlerId));
  const filtered = bouts.filter(b => !absentIds.has(b.redId) && !absentIds.has(b.greenId));
  return NextResponse.json(filtered);
}
