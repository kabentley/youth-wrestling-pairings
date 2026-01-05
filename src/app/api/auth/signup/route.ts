import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const BodySchema = z.object({
  username: z.string().trim().min(3).max(32),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/),
  name: z.string().trim().max(100).optional(),
  password: z.string().min(6).max(100),
});

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const username = normalizeUsername(body.username);
  const email = body.email.trim().toLowerCase();
  const phone = body.phone.trim();

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(body.password, 10);
  await db.user.create({
    data: {
      username,
      email,
      phone,
      name: (() => {
        const trimmed = body.name?.trim();
        return trimmed === "" ? null : (trimmed ?? null);
      })(),
      passwordHash,
      role: "PARENT",
    },
  });

  return NextResponse.json({ ok: true });
}
