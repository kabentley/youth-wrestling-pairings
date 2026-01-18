/** A single row of roster data, typically parsed from an import file. */
export type WrestlerRow = {
  first: string;
  last: string;
  weight: number;
  birthdate: string; // YYYY-MM-DD preferred
  experienceYears?: number;
  skill?: number;
};

/** Subset of the existing roster used to match incoming rows deterministically. */
export type ExistingWrestler = {
  id: string;
  first: string;
  last: string;
  birthdate: Date;
};

/** Update operation produced by `planRosterUpsert`. */
export type UpdateOp = {
  id: string;
  weight: number;
  experienceYears: number;
  skill: number;
};

/** Create operation produced by `planRosterUpsert`. */
export type CreateOp = {
  teamId: string;
  first: string;
  last: string;
  weight: number;
  birthdate: Date;
  experienceYears: number;
  skill: number;
};

/** Normalizes user-entered names for deterministic matching. */
export function normalizeName(s: string) {
  return s.trim();
}

/** Converts a Date into a YYYY-MM-DD string, normalized to UTC date-only. */
export function toISODateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** Parses an imported birthdate and normalizes to a date-only UTC Date. */
export function parseBirthdate(dateStr: string): Date | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  // normalize to date-only UTC
  return new Date(toISODateOnly(d));
}

function key(teamId: string, first: string, last: string, birthdateISO: string) {
  return `${teamId}|${first.toLowerCase()}|${last.toLowerCase()}|${birthdateISO}`;
}

/**
 * Build a deterministic plan:
 * - Match existing ONLY by (teamId + first + last + birthdate) [weight ignored]
 * - If match: UPDATE (overwrite weight/experienceYears/skill)
 * - If no match: CREATE
 * - Dedupe duplicates inside incoming rows using the same key
 */
export function planRosterUpsert(args: {
  teamId: string;
  incoming: WrestlerRow[];
  existing: ExistingWrestler[];
}) {
  const { teamId } = args;

  const existingMap = new Map<string, ExistingWrestler>();
  for (const w of args.existing) {
    const k = key(
      teamId,
      normalizeName(w.first),
      normalizeName(w.last),
      toISODateOnly(w.birthdate),
    );
    existingMap.set(k, w);
  }

  const seenIncoming = new Set<string>();
  const toUpdate: UpdateOp[] = [];
  const toCreate: CreateOp[] = [];

  for (const row of args.incoming) {
    const first = normalizeName(row.first);
    const last = normalizeName(row.last);
    const bd = parseBirthdate(row.birthdate);
    if (!first || !last || !bd) continue;

    const bdISO = toISODateOnly(bd);
    const k = key(teamId, first, last, bdISO);
    if (seenIncoming.has(k)) continue;
    seenIncoming.add(k);

    const experienceYears = Math.max(0, Math.floor(row.experienceYears ?? 0));
    const skill = Math.min(5, Math.max(0, Math.floor(row.skill ?? 3)));

    const existing = existingMap.get(k);
    if (existing) {
      toUpdate.push({
        id: existing.id,
        weight: row.weight,
        experienceYears,
        skill,
      });
    } else {
      toCreate.push({
        teamId,
        first,
        last,
        weight: row.weight,
        birthdate: new Date(bdISO),
        experienceYears,
        skill,
      });
    }
  }

  return { toUpdate, toCreate };
}
