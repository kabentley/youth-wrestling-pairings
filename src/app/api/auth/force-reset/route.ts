import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

const BodySchema = z.object({
  username: z.string().trim().min(6).optional(),
  currentPassword: z.string().min(1).optional(),
  password: z.string().min(8).max(100).regex(/[^A-Za-z0-9]/, "Password must include a symbol."),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password." }, { status: 400 });
  }
  let userId: string | undefined;
  try {
    ({ userId } = await requireSession());
  } catch {
    userId = undefined;
  }

  if (!userId) {
    const username = parsed.data.username?.trim().toLowerCase() ?? "";
    const currentPassword = parsed.data.currentPassword ?? "";
    if (!username || !currentPassword) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const user = await db.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true },
    });
    if (!user?.passwordHash) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 400 });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 400 });
    }
    userId = user.id;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustResetPassword: false,
      sessionVersion: { increment: 1 },
    },
  });

  return NextResponse.json({ ok: true });
}
