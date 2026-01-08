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

export async function GET(req: Request) {
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, teamId: true },
  });
  const url = new URL(req.url);
  const { q, limit } = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const tokens = tokenize(q);

  if ((user?.role === "PARENT" || user?.role === "TABLE_WORKER") && !user.teamId) {
    return NextResponse.json({ error: "No team assigned." }, { status: 400 });
  }

  const where =
    tokens.length === 1
      ? {
          active: true,
          OR: [
            { first: { contains: tokens[0] } },
            { last: { contains: tokens[0] } },
          ],
        }
      : {
          active: true,
          AND: tokens.map((t) => ({
            OR: [
              { first: { contains: t } },
              { last: { contains: t } },
            ],
          })),
        };

  const teamFilter = (user?.role === "PARENT" || user?.role === "TABLE_WORKER") && user.teamId ? { teamId: user.teamId } : {};

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
