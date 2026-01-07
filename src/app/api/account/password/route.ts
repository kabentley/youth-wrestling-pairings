import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

const BodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100).regex(/[^A-Za-z0-9]/, "Password must include a symbol."),
});

export async function POST(req: Request) {
  const { userId } = await requireSession();
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password." }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) {
    return NextResponse.json({ error: "Password update not available for this account." }, { status: 400 });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustResetPassword: false, sessionVersion: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
