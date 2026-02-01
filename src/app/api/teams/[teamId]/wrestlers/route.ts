import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";


import { db } from "@/lib/db";
import { requireSession, requireTeamCoach } from "@/lib/rbac";

const WrestlerSchema = z.object({
  first: z.string().min(1),
  last: z.string().min(1),
  weight: z.number().positive(),
  birthdate: z.string(),
  experienceYears: z.number().int().min(0),
  skill: z.number().int().min(0).max(5),
  isGirl: z.boolean().optional().default(false),
});

async function respondUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function formatZodIssues(issues: z.ZodIssue[]) {
  return issues
    .map(issue => {
      const path = issue.path.map(segment => String(segment)).filter(Boolean).join(".");
      if (path) {
        return `${path}: ${issue.message}`;
      }
      return issue.message;
    })
    .join(" ");
}

export async function GET(_: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  try {
    await requireSession();
  } catch {
    return respondUnauthorized();
  }
  const url = new URL(_.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";

  const wrestlers = await db.wrestler.findMany({
    where: {
      teamId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });
  return NextResponse.json(wrestlers);
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  try {
    await requireTeamCoach(teamId);
  } catch {
    return respondUnauthorized();
  }
  const body = await req.json();
  const parsed = WrestlerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodIssues(parsed.error.issues) || "Invalid wrestler data." },
      { status: 400 },
    );
  }

  try {
    const w = await db.wrestler.create({
      data: {
        teamId,
        first: parsed.data.first,
        last: parsed.data.last,
        weight: parsed.data.weight,
        birthdate: new Date(parsed.data.birthdate),
        experienceYears: parsed.data.experienceYears,
        skill: parsed.data.skill,
        isGirl: parsed.data.isGirl,
        active: true,
      },
    });
    return NextResponse.json(w);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A wrestler with that name already exists on this team." },
        { status: 409 },
      );
    }
    throw error;
  }
}
