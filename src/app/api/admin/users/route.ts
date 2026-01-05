import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { z } from "zod";
import bcrypt from "bcryptjs";

const CreateSchema = z.object({
  username: z.string().trim().min(3),
  name: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "COACH", "VIEWER"]).default("COACH"),
});

export async function GET() {
  await requireAdmin();
  const users = await db.user.findMany({
    select: { id: true, username: true, name: true, role: true, mfaEnabled: true },
    orderBy: { username: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  await requireAdmin();
  const body = CreateSchema.parse(await req.json());
  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await db.user.create({
    data: {
      username: body.username.toLowerCase(),
      name: body.name,
      passwordHash,
      role: body.role,
      mfaEnabled: false,
    },
    select: { id: true, username: true, name: true, role: true, mfaEnabled: true },
  });
  return NextResponse.json(user);
}
