import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { meetId: string } }) {
  const meetTeams = await db.meetTeam.findMany({
    where: { meetId: params.meetId },
    include: { team: { include: { wrestlers: true } } },
  });

  const teams = meetTeams.map(mt => ({ id: mt.team.id, name: mt.team.name }));
  const wrestlers = meetTeams.flatMap(mt =>
    mt.team.wrestlers.map(w => ({
      id: w.id,
      teamId: w.teamId,
      first: w.first,
      last: w.last,
      weight: w.weight,
      birthdate: w.birthdate,
      experienceYears: w.experienceYears,
      skill: w.skill,
    }))
  );

  return NextResponse.json({ teams, wrestlers });
}
