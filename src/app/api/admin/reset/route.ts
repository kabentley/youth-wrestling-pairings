import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export async function POST() {
  await requireAdmin();
  await db.$transaction([db.meet.deleteMany(), db.wrestler.deleteMany()]);
  return NextResponse.json({ ok: true });
}
