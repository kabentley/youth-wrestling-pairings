import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { db } from "@/lib/db";
import { requireAnyRole } from "@/lib/rbac";

export const runtime = "nodejs";

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "results";
}

function wrestlerLabel(wrestler: {
  first: string;
  last: string;
  team: { symbol?: string | null; name?: string | null };
}) {
  const fullName = `${wrestler.first} ${wrestler.last}`.trim();
  const symbol = wrestler.team.symbol?.trim() ?? "";
  const teamLabel = symbol.length > 0 ? symbol : (wrestler.team.name?.trim() ?? "");
  return teamLabel ? `${fullName} (${teamLabel})` : fullName;
}

function winnerLabel(
  winnerId: string | null,
  red: { id: string; first: string; last: string; team: { symbol?: string | null; name?: string | null } },
  green: { id: string; first: string; last: string; team: { symbol?: string | null; name?: string | null } },
) {
  if (!winnerId) return "";
  if (winnerId === red.id) return wrestlerLabel(red);
  if (winnerId === green.id) return wrestlerLabel(green);
  return winnerId;
}

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  let user: Awaited<ReturnType<typeof requireAnyRole>>["user"];
  try {
    ({ user } = await requireAnyRole(["COACH", "TABLE_WORKER", "ADMIN"]));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "You are not authorized to export results." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      deletedAt: true,
    },
  });
  if (!meet || meet.deletedAt) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }

  if (user.role === "COACH" || user.role === "TABLE_WORKER") {
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned." }, { status: 403 });
    }
    const teamRows = await db.meetTeam.findMany({
      where: { meetId },
      select: { teamId: true },
    });
    const teamIds = new Set(teamRows.map((team) => team.teamId));
    if (!teamIds.has(user.teamId)) {
      return NextResponse.json({ error: "You are not authorized to export results for this meet." }, { status: 403 });
    }
  }

  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: { in: ["NOT_COMING"] } },
    select: { wrestlerId: true },
  });
  const absentIds = new Set(absent.map((entry) => entry.wrestlerId));

  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      mat: true,
      order: true,
      redId: true,
      greenId: true,
      resultWinnerId: true,
      resultType: true,
      resultScore: true,
      resultPeriod: true,
      resultTime: true,
      resultNotes: true,
      resultAt: true,
    },
  });

  const filteredBouts = bouts.filter((bout) => !absentIds.has(bout.redId) && !absentIds.has(bout.greenId));
  const resultBouts = filteredBouts.filter((bout) =>
    bout.resultWinnerId !== null ||
    (bout.resultType?.trim() ?? "") !== "" ||
    (bout.resultScore?.trim() ?? "") !== "" ||
    bout.resultPeriod !== null ||
    (bout.resultTime?.trim() ?? "") !== "" ||
    (bout.resultNotes?.trim() ?? "") !== "" ||
    bout.resultAt !== null
  );
  const wrestlerIds = Array.from(new Set(resultBouts.flatMap((bout) => [bout.redId, bout.greenId])));
  const wrestlers = await db.wrestler.findMany({
    where: { id: { in: wrestlerIds } },
    select: {
      id: true,
      first: true,
      last: true,
      team: { select: { name: true, symbol: true } },
    },
  });
  const wrestlerMap = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler]));

  const workbook = XLSX.utils.book_new();
  const rows: Array<Record<string, string | number>> = [];

  for (const bout of resultBouts) {
    const red = wrestlerMap.get(bout.redId) ?? { id: bout.redId, first: "Unknown", last: "", team: { name: "", symbol: "" } };
    const green = wrestlerMap.get(bout.greenId) ?? { id: bout.greenId, first: "Unknown", last: "", team: { name: "", symbol: "" } };
    rows.push({
      Wrestler1: wrestlerLabel(red),
      Wrestler2: wrestlerLabel(green),
      Winner: winnerLabel(bout.resultWinnerId, red, green),
      Type: bout.resultType ?? "",
      Score: bout.resultScore ?? "",
    });
  }

  if (rows.length === 0) {
    const emptySheet = XLSX.utils.json_to_sheet([{ Message: "No results recorded." }]);
    XLSX.utils.book_append_sheet(workbook, emptySheet, "Results");
  } else {
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Results");
  }

  const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const stamp = meet.date.toISOString().slice(0, 10);
  const safeMeetName = sanitizeFilePart(meet.name || "results");

  return new NextResponse(fileBuffer as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeMeetName}_results_${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
