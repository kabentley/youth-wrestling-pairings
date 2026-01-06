import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const CreateSchema = z.object({
  username: z.string().trim().min(3),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal("")),
  name: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "COACH", "PARENT"]).default("COACH"),
  teamId: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const querySchema = z.object({
    q: z.string().trim().optional().default(""),
    teamId: z.string().trim().optional().default(""),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(200).default(50),
  });
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    teamId: searchParams.get("teamId") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "50",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }
  const { q, page, pageSize, teamId } = parsed.data;
  const where = {
    ...(teamId ? { teamId } : {}),
    ...(q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: { id: true, username: true, email: true, phone: true, name: true, role: true, teamId: true },
      orderBy: { username: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

export async function POST(req: Request) {
  await requireAdmin();
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const email = body.email.trim().toLowerCase();
  const phone = body.phone ? body.phone.trim() : "";
  if (body.role === "ADMIN" && body.teamId) {
    return NextResponse.json({ error: "Admins cannot be assigned a team" }, { status: 400 });
  }
  if (body.role === "COACH" && !body.teamId) {
    return NextResponse.json({ error: "Coaches must be assigned a team" }, { status: 400 });
  }
  if (body.role === "PARENT" && !body.teamId) {
    return NextResponse.json({ error: "Parents must be assigned a team" }, { status: 400 });
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
      teamId: body.role === "ADMIN" ? null : body.teamId,
      phone: phone === "" ? "" : phone,
    },
    select: { id: true, username: true, email: true, name: true, role: true, teamId: true },
  });
  return NextResponse.json(user);
}
