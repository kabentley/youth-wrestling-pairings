import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { meetId: string } }) {
  const bouts = await db.bout.findMany({
    where: { meetId: params.meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
  });
  const statuses = await db.meetWrestlerStatus.findMany({
    where: { meetId: params.meetId, status: "ABSENT" },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(statuses.map(s => s.wrestlerId));
  const filtered = bouts.filter(b => !absentIds.has(b.redId) && !absentIds.has(b.greenId));
  return NextResponse.json(filtered);
}
