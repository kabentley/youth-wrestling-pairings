import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { meetId: string } }) {
  const bouts = await db.bout.findMany({
    where: { meetId: params.meetId },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { score: "asc" }],
  });
  return NextResponse.json(bouts);
}
