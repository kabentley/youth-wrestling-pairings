import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function DELETE(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: { id: true, deletedAt: true },
  });
  if (!meet || !meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found" }, { status: 404 });
  }

  await db.meet.delete({ where: { id: meetId } });
  revalidatePath("/meets");

  return NextResponse.json({ ok: true });
}
