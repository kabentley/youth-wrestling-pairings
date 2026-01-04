import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  await db.user.update({
    where: { id: params.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaTempSecret: null },
  });
  return NextResponse.json({ ok: true });
}
