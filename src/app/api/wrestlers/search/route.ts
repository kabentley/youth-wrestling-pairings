import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function tokenize(q: string) {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
}

const clauseForToken = (token: string) => ({
  OR: [
    { first: { contains: token, mode: "insensitive" as const } },
    { last: { contains: token, mode: "insensitive" as const } },
  ],
});

export async function GET(req: Request) {
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, teamId: true },
  });
  const url = new URL(req.url);
  const { q, limit } = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const tokens = tokenize(q);

  const rolesRequiringTeam = user?.role === "TABLE_WORKER" || user?.role === "COACH";
  if (rolesRequiringTeam && !user.teamId) {
    return NextResponse.json({ error: "No team assigned." }, { status: 400 });
  }

  const where =
    tokens.length === 1
      ? {
          active: true,
          OR: clauseForToken(tokens[0]).OR,
        }
      : {
          active: true,
          AND: tokens.map((t) => clauseForToken(t)),
        };

  const teamFilter =
    (user?.role === "TABLE_WORKER" || user?.role === "COACH") && user.teamId ? { teamId: user.teamId } : {};

  const wrestlers = await db.wrestler.findMany({
    where: { ...where, ...teamFilter },
    take: limit,
    select: {
      id: true,
      guid: true,
      first: true,
      last: true,
      teamId: true,
      birthdate: true,
      active: true,
      team: { select: { name: true, symbol: true, color: true } },
    },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });

  return NextResponse.json(
    wrestlers.map((w) => ({
      id: w.id,
      guid: w.guid,
      first: w.first,
      last: w.last,
      teamId: w.teamId,
      teamName: w.team.name,
      teamSymbol: w.team.symbol,
      teamColor: w.team.color,
      birthdate: w.birthdate,
    })),
  );
}
