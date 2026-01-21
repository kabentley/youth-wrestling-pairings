import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/rbac";

const PatchSchema = z.object({
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  name: z.string().trim().min(2).optional(),
  symbol: z.string().trim().min(2).max(4).optional(),
  address: z.string().trim().optional(),
  website: z.string().trim().url().optional().or(z.literal("")),
  headCoachId: z.string().trim().optional().or(z.literal("")),
  homeTeamPreferSameMat: z.boolean().optional(),
  defaultMaxMatchesPerWrestler: z.number().int().min(1).max(5).optional(),
  defaultRestGap: z.number().int().min(0).max(20).optional(),
  defaultMaxAgeGapDays: z.number().int().min(0).max(3650).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      symbol: true,
      color: true,
      address: true,
      website: true,
      homeTeamPreferSameMat: true,
      defaultMaxMatchesPerWrestler: true,
      defaultRestGap: true,
      defaultMaxAgeGapDays: true,
      logoData: true,
      headCoachId: true,
      headCoach: { select: { id: true, username: true } },
    },
  });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  return NextResponse.json({
    id: team.id,
    name: team.name,
    symbol: team.symbol,
    color: team.color,
    address: team.address,
    website: team.website,
    homeTeamPreferSameMat: team.homeTeamPreferSameMat,
    defaultMaxMatchesPerWrestler: team.defaultMaxMatchesPerWrestler,
    defaultRestGap: team.defaultRestGap,
    defaultMaxAgeGapDays: team.defaultMaxAgeGapDays,
    hasLogo: Boolean(team.logoData),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    const { userId } = await requireSession();
    const payload = await req.json();
    const parsed = PatchSchema.safeParse(payload);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
      return NextResponse.json({ error: detail || "Invalid team data." }, { status: 400 });
    }
    const body = parsed.data;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, teamId: true },
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isAdmin = user.role === "ADMIN";
    const isTeamCoach = user.role === "COACH" && user.teamId === teamId;
    if (!isAdmin && !isTeamCoach) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isAdmin && (body.name || body.symbol || body.headCoachId !== undefined)) {
      return NextResponse.json({ error: "Only admins can update name, symbol, address, or head coach" }, { status: 403 });
    }

    const data: {
      color?: string;
      name?: string;
      symbol?: string;
      address?: string | null;
      website?: string | null;
      headCoachId?: string | null;
      homeTeamPreferSameMat?: boolean;
      defaultMaxMatchesPerWrestler?: number;
      defaultRestGap?: number;
      defaultMaxAgeGapDays?: number;
    } = {};
    if (body.color) data.color = body.color;
    if (body.name) data.name = body.name.trim();
    if (body.symbol) data.symbol = body.symbol.trim().toUpperCase();
    if (body.address !== undefined) data.address = body.address.trim() || null;
    if (body.website !== undefined) data.website = body.website.trim() || null;
    if (body.headCoachId !== undefined) {
      const trimmed = body.headCoachId.trim();
      data.headCoachId = trimmed === "" ? null : trimmed;
    }
    if (body.homeTeamPreferSameMat !== undefined) data.homeTeamPreferSameMat = body.homeTeamPreferSameMat;
    if (body.defaultMaxMatchesPerWrestler !== undefined) data.defaultMaxMatchesPerWrestler = body.defaultMaxMatchesPerWrestler;
    if (body.defaultRestGap !== undefined) data.defaultRestGap = body.defaultRestGap;
    if (body.defaultMaxAgeGapDays !== undefined) data.defaultMaxAgeGapDays = body.defaultMaxAgeGapDays;

    const team = await db.team.update({
      where: { id: teamId },
      data,
      select: {
        id: true,
        name: true,
        symbol: true,
        color: true,
        logoData: true,
        address: true,
        website: true,
        headCoachId: true,
        homeTeamPreferSameMat: true,
        defaultMaxMatchesPerWrestler: true,
        defaultRestGap: true,
        defaultMaxAgeGapDays: true,
        headCoach: { select: { id: true, username: true } },
      },
    });
    return NextResponse.json({
      id: team.id,
      name: team.name,
      symbol: team.symbol,
      color: team.color,
      address: team.address,
      website: team.website,
      hasLogo: Boolean(team.logoData),
      headCoachId: team.headCoachId ?? null,
      headCoach: team.headCoach ? { id: team.headCoach.id, username: team.headCoach.username } : null,
      homeTeamPreferSameMat: team.homeTeamPreferSameMat,
      defaultMaxMatchesPerWrestler: team.defaultMaxMatchesPerWrestler,
      defaultRestGap: team.defaultRestGap,
      defaultMaxAgeGapDays: team.defaultMaxAgeGapDays,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Team name or symbol already exists. Choose a unique value." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Unable to update team. Check name and symbol, then try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireAdmin();
  await db.team.delete({ where: { id: teamId } });
  return NextResponse.json({ ok: true });
}
