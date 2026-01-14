import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const BodySchema = z.object({ password: z.string().min(6) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const passwordHash = await bcrypt.hash(body.password, 10);

  await db.user.update({
    where: { id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
