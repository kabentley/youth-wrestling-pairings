import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const TeamSchema = z.object({ name: z.string().min(2) });

export async function GET() {
  const teams = await db.team.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(teams);
}

export async function POST(req: Request) {
  await requireRole("COACH");
  const body = await req.json();
  const parsed = TeamSchema.parse(body);
  const team = await db.team.create({ data: parsed });
  return NextResponse.json(team);
}
