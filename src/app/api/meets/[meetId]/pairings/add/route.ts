import { NextResponse } from "next/server";
import { z } from "zod";

import { MIN_MATS, getEligibleMatIndexes } from "@/lib/assignMats";
import type { MatWrestler } from "@/lib/assignMats";
import { db } from "@/lib/db";
import { logMeetChange } from "@/lib/meetActivity";
import { formatWrestlerLabel } from "@/lib/meetChangeFormat";
import { getMeetLockError, requireMeetLock } from "@/lib/meetLock";
import { pairingScore } from "@/lib/pairingScore";
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
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      homeTeamId: true,
      meetTeams: { select: { team: { select: { id: true, name: true, symbol: true } } } },
    },
  });
  if (!meet) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }
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

  const league = await db.league.findFirst({
    select: {
      ageAllowancePctPerYear: true,
      experienceAllowancePctPerYear: true,
      skillAllowancePctPerPoint: true,
    },
  });
  const scoreOptions = league ?? undefined;

  const wrestlers = await db.wrestler.findMany({
    where: { id: { in: [body.redId, body.greenId] } },
    select: {
      id: true,
      first: true,
      last: true,
      teamId: true,
      weight: true,
      birthdate: true,
      experienceYears: true,
      skill: true,
      team: { select: { symbol: true, name: true } },
    },
  });
  const red = wrestlers.find(w => w.id === body.redId);
  const green = wrestlers.find(w => w.id === body.greenId);
  if (!red || !green) {
    return NextResponse.json({ error: "Wrestler not found." }, { status: 404 });
  }
  const teamOrder = (() => {
    const order = new Map<string, number>();
    const homeId = meet.homeTeamId ?? null;
    const allTeams = meet.meetTeams.map(mt => mt.team);
    const label = (team: (typeof allTeams)[number]) =>
      (team.symbol || team.name || team.id).toLowerCase();
    let idx = 0;
    if (homeId) {
      order.set(homeId, idx);
      idx += 1;
    }
    const ordered = allTeams
      .filter(team => team.id !== homeId)
      .sort((a, b) => label(a).localeCompare(label(b)));
    for (const team of ordered) {
      if (!order.has(team.id)) {
        order.set(team.id, idx);
        idx += 1;
      }
    }
    return order;
  })();
  const compareWrestlers = (a: typeof red, b: typeof green) => {
    const aOrder = teamOrder.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = teamOrder.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aLast = a.last.toLowerCase();
    const bLast = b.last.toLowerCase();
    const lastCompare = aLast.localeCompare(bLast);
    if (lastCompare !== 0) return lastCompare;
    const aFirst = a.first.toLowerCase();
    const bFirst = b.first.toLowerCase();
    const firstCompare = aFirst.localeCompare(bFirst);
    if (firstCompare !== 0) return firstCompare;
    return a.id.localeCompare(b.id);
  };
  const orderedRed = compareWrestlers(red, green) <= 0 ? red : green;
  const orderedGreen = orderedRed.id === red.id ? green : red;
  const computedScore = pairingScore(orderedRed, orderedGreen, scoreOptions ?? undefined).score;

  const bout = await db.bout.create({
    data: {
      meetId,
      redId: orderedRed.id,
      greenId: orderedGreen.id,
      pairingScore: computedScore,
      source: user.id,
    },
  });
  await assignMatToBout(meetId, bout.id);
  const updatedBout = await db.bout.findUnique({ where: { id: bout.id } });
  const sourceRecord = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, username: true, name: true, teamId: true, team: { select: { color: true } } },
  });
  const sourceUser = sourceRecord
    ? {
      id: sourceRecord.id,
      username: sourceRecord.username,
      name: sourceRecord.name,
      teamId: sourceRecord.teamId,
      teamColor: sourceRecord.team?.color ?? null,
    }
    : { id: user.id, username: user.username, name: null, teamId: user.teamId ?? null, teamColor: null };

  const redName = formatWrestlerLabel(orderedRed) ?? "wrestler 1";
  const greenName = formatWrestlerLabel(orderedGreen) ?? "wrestler 2";
  await logMeetChange(meetId, user.id, `Added match for ${redName} with ${greenName}.`);
  return NextResponse.json({ ...(updatedBout ?? bout), sourceUser });
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
      deletedAt: true,
      meetTeams: { select: { teamId: true } },
    },
  });

  if (!meet || meet.deletedAt) return;
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
  const earlyStatuses = await db.meetWrestlerStatus.findMany({
    where: { meetId, status: "EARLY", wrestlerId: { in: [bout.redId, bout.greenId] } },
    select: { wrestlerId: true },
  });
  const insertAtHead = earlyStatuses.length > 0;

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

  const order = insertAtHead ? 1 : matCounts[bestMat] + 1;
  if (insertAtHead) {
    await db.bout.updateMany({
      where: { meetId, mat: bestMat + 1, order: { not: null } },
      data: { order: { increment: 1 } },
    });
  }
  await db.bout.update({
    where: { id: boutId },
    data: {
      mat: bestMat + 1,
      order,
      originalMat: bout.originalMat ?? (bestMat + 1),
    },
  });
}
