import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { z } from "zod";
import bcrypt from "bcryptjs";

const BodySchema = z.object({ password: z.string().min(6) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = BodySchema.parse(await req.json());
  const passwordHash = await bcrypt.hash(body.password, 10);

  await db.user.update({
    where: { id: params.id },
    data: { passwordHash, mfaEnabled: false, mfaSecret: null, mfaTempSecret: null },
  });

  return NextResponse.json({ ok: true });
}
