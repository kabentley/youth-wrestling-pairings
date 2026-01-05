import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const CreateSchema = z.object({
  username: z.string().trim().min(3),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/),
  name: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "COACH", "PARENT"]).default("COACH"),
  teamId: z.string().nullable().optional(),
});

export async function GET() {
  await requireAdmin();
  const users = await db.user.findMany({
    select: { id: true, username: true, email: true, phone: true, name: true, role: true, teamId: true },
    orderBy: { username: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  await requireAdmin();
  const body = CreateSchema.parse(await req.json());
  const email = body.email.trim().toLowerCase();
  const phone = body.phone.trim();
  if (body.role !== "COACH" && body.teamId) {
    return NextResponse.json({ error: "Only coaches can be assigned a team" }, { status: 400 });
  }
  if (body.role === "COACH" && !body.teamId) {
    return NextResponse.json({ error: "Coaches must be assigned a team" }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await db.user.create({
    data: {
      username: body.username.toLowerCase(),
      email,
      phone,
      name: body.name,
      passwordHash,
      role: body.role,
      teamId: body.role === "COACH" ? body.teamId : null,
    },
    select: { id: true, username: true, email: true, name: true, role: true, teamId: true },
  });
  return NextResponse.json(user);
}
