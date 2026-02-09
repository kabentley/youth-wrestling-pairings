import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

export async function POST() {
  const { user } = await requireSession();
  const result = await db.meet.updateMany({
    where: { lockedById: user.id },
    data: { lockedById: null, lockedAt: null, lockExpiresAt: null },
  });
  return NextResponse.json({ ok: true, released: result.count });
}
