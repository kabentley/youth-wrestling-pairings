import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

const BodySchema = z.object({
  username: z.string().trim().min(3).max(32),
  name: z.string().trim().max(100).optional(),
  password: z.string().min(6).max(100),
});

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());
  const username = normalizeUsername(body.username);

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  await db.user.create({
    data: {
      username,
      name: body.name?.trim() || null,
      passwordHash,
      role: "PARENT",
      mfaEnabled: false,
    },
  });

  return NextResponse.json({ ok: true });
}
