import { NextResponse } from "next/server";
import { z } from "zod";

import { MIN_MATS, getEligibleMatIndexes } from "@/lib/assignMats";
import type { MatWrestler } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { requireRole } from "@/lib/rbac";

const BodySchema = z.object({ redId: z.string().min(1), greenId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = await params;
  const { user } = await requireRole("COACH");
  try {
    await requireMeetLock(meetId, user.id);
  } catch (err) {
    const lockError = getMeetLockError(err);
    if (lockError) return NextResponse.json(lockError.body, { status: lockError.status });
    throw err;
  }
  const body = BodySchema.parse(await req.json());
  const absent = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: { in: ["NOT_COMING"] }, wrestlerId: { in: [body.redId, body.greenId] } },
    select: { wrestlerId: true },
  });
  if (absent.length > 0) {
    return NextResponse.json({ error: "Cannot create a match for a not-attending wrestler" }, { status: 400 });
  }

  const existing = await db.bout.findFirst({
    where: {
      meetId,
      OR: [
        { redId: body.redId, greenId: body.greenId },
        { redId: body.greenId, greenId: body.redId },
      ],
    },
  });
  if (existing) return NextResponse.json(existing);

  const bout = await db.bout.create({
    data: {
      meetId,
      redId: body.redId,
      greenId: body.greenId,
      type: "counting",
      score: 0,
      notes: "manual",
    },
  });
  await assignMatToBout(meetId, bout.id);
  const updatedBout = await db.bout.findUnique({ where: { id: bout.id } });

  const red = await db.wrestler.findUnique({
    where: { id: body.redId },
    select: { first: true, last: true },
  });
  const green = await db.wrestler.findUnique({
    where: { id: body.greenId },
    select: { first: true, last: true },
  });
  const redName = red ? `${red.first} ${red.last}` : "wrestler 1";
  const greenName = green ? `${green.first} ${green.last}` : "wrestler 2";
  await logMeetChange(meetId, user.id, `Added match for ${redName} with ${greenName}.`);
  return NextResponse.json(updatedBout ?? bout);
}

const RANGE_PENALTY_SCALE = 50;
const INELIGIBLE_PENALTY = 100_000;
const HOME_TEAM_PENALTY = 25;
const DEFAULT_RULE = {
  minExperience: 0,
  maxExperience: 10,
  minAge: 0,
  maxAge: 100,
  color: undefined,
};

function ageInYears(birthdate: Date, onDate: Date) {
  const diff = onDate.getTime() - birthdate.getTime();
  return diff / (365.25 * 24 * 60 * 60 * 1000);
}

function rangePenalty(value: number, min: number, max: number) {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

async function assignMatToBout(meetId: string, boutId: string) {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      date: true,
      homeTeamId: true,
      numMats: true,
      meetTeams: { select: { teamId: true } },
    },
  });

  if (!meet) return;
  const teamIds = meet.meetTeams.map(mt => mt.teamId);
  const wrestlers = await db.wrestler.findMany({
    where: { teamId: { in: teamIds } },
    select: { id: true, teamId: true, birthdate: true, experienceYears: true, first: true, last: true },
  });
  const wMap = new Map<string, MatWrestler>(wrestlers.map(w => [w.id, w]));

  const homeTeamId = meet.homeTeamId ?? null;
  const teamRules = homeTeamId
    ? await db.teamMatRule.findMany({
        where: { teamId: homeTeamId },
        orderBy: { matIndex: "asc" },
      })
    : [];
  const homeTeamPrefs = homeTeamId
    ? await db.team.findUnique({
        where: { id: homeTeamId },
        select: { homeTeamPreferSameMat: true },
      })
    : null;

  const baseRules = teamRules.map(rule => ({
    minExperience: rule.minExperience,
    maxExperience: rule.maxExperience,
    minAge: rule.minAge,
    maxAge: rule.maxAge,
    color: rule.color ?? undefined,
  }));

  const numMats = Math.max(MIN_MATS, meet.numMats);
  const rules = baseRules.length > 0 ? baseRules.slice(0, numMats) : [];
  while (rules.length < numMats) {
    rules.push({ ...DEFAULT_RULE });
  }

  const mats = rules.map(rule => ({ boutIds: [], rule }));

  const bouts = await db.bout.findMany({
    where: { meetId },
    select: { id: true, mat: true, originalMat: true, redId: true, greenId: true },
  });

  const matCounts = new Array(numMats).fill(0);
  for (const b of bouts) {
    if (b.mat == null) continue;
    const matIdx = Math.max(1, Math.min(numMats, b.mat)) - 1;
    matCounts[matIdx] += 1;
  }

  let homeTeamMatIdx: number | null = null;
  const homeWrestlerMat = new Map<string, number>();
  for (const b of bouts) {
    if (b.mat == null) continue;
    const red = wMap.get(b.redId);
    const green = wMap.get(b.greenId);
    const isHomeBout = red?.teamId === homeTeamId || green?.teamId === homeTeamId;
    if (isHomeBout && homeTeamMatIdx === null) {
      homeTeamMatIdx = Math.max(0, Math.min(numMats - 1, b.mat - 1));
    }
    if (homeTeamId && red?.teamId === homeTeamId) {
      homeWrestlerMat.set(b.redId, Math.max(0, Math.min(numMats - 1, b.mat - 1)));
    }
    if (homeTeamId && green?.teamId === homeTeamId) {
      homeWrestlerMat.set(b.greenId, Math.max(0, Math.min(numMats - 1, b.mat - 1)));
    }
  }

  const bout = bouts.find(b => b.id === boutId);
  if (!bout) return;

  function getWrestler(id: string) {
    return wMap.get(id) ?? null;
  }

  const meetDate = new Date(meet.date);
  const { indexes: eligibleMats } = getEligibleMatIndexes(
    bout,
    mats,
    wMap,
    meetDate,
    homeTeamId,
    homeWrestlerMat,
    Boolean(homeTeamPrefs?.homeTeamPreferSameMat),
  );
  const red = getWrestler(bout.redId);
  const green = getWrestler(bout.greenId);

  function matPenalty(matIdx: number) {
    const rule = rules[matIdx];
    const nextOrder = matCounts[matIdx] + 1;
    let p = 0;

    const redAge = red ? ageInYears(new Date(red.birthdate), meetDate) : 0;
    const greenAge = green ? ageInYears(new Date(green.birthdate), meetDate) : 0;
    const expPenalty =
      rangePenalty(red?.experienceYears ?? 0, rule.minExperience, rule.maxExperience) +
      rangePenalty(green?.experienceYears ?? 0, rule.minExperience, rule.maxExperience);
    const agePenalty =
      rangePenalty(redAge, rule.minAge, rule.maxAge) +
      rangePenalty(greenAge, rule.minAge, rule.maxAge);
    const eligible = expPenalty === 0 && agePenalty === 0;
    if (eligible) {
      p += (expPenalty + agePenalty) * RANGE_PENALTY_SCALE;
    } else {
      p += INELIGIBLE_PENALTY;
    }

    if (homeTeamPrefs?.homeTeamPreferSameMat && homeTeamId) {
      const isHomeBout =
        red?.teamId === homeTeamId ||
        green?.teamId === homeTeamId;
      if (isHomeBout && homeTeamMatIdx !== null && homeTeamMatIdx !== matIdx) {
        p += HOME_TEAM_PENALTY;
      }
    }

    p += nextOrder * 0.01;
    return p;
  }

  let bestMat = eligibleMats.length > 0
    ? eligibleMats[0]
    : matCounts.reduce((bestIdx, count, idx) => (count < matCounts[bestIdx] ? idx : bestIdx), 0);
  if (eligibleMats.length > 0) {
    let bestScore = Number.POSITIVE_INFINITY;
    for (const m of eligibleMats) {
      const penalty = matPenalty(m);
      if (penalty < bestScore) {
        bestScore = penalty;
        bestMat = m;
      }
    }
  }

  const order = matCounts[bestMat] + 1;
  await db.bout.update({
    where: { id: boutId },
    data: {
      mat: bestMat + 1,
      order,
      originalMat: bout.originalMat ?? (bestMat + 1),
    },
  });
}
