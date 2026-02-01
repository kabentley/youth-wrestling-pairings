/** A single row of roster data, typically parsed from an import file. */
export type WrestlerRow = {
  first: string;
  last: string;
  weight: number;
  birthdate: string; // YYYY-MM-DD preferred
  experienceYears?: number;
  skill?: number;
  isGirl?: boolean;
};

/** Subset of the existing roster used to match incoming rows deterministically. */
export type ExistingWrestler = {
  id: string;
  first: string;
  last: string;
  birthdate: Date;
  weight: number;
  experienceYears: number;
  skill: number;
  isGirl: boolean;
};

/** Update operation produced by `planRosterUpsert`. */
export type UpdateOp = {
  id: string;
  weight: number;
  birthdate: Date;
  experienceYears: number;
  skill: number;
  isGirl?: boolean;
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
  isGirl?: boolean;
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

function normalizeIsGirl(value?: string | null): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["girl", "g", "female", "f", "true", "yes", "y", "1"].includes(normalized)) return true;
  if (["boy", "b", "male", "m", "false", "no", "n", "0"].includes(normalized)) return false;
  return undefined;
}

function key(teamId: string, first: string, last: string) {
  return `${teamId}|${first.toLowerCase()}|${last.toLowerCase()}`;
}

/**
 * Build a deterministic plan:
 * - Match existing ONLY by (teamId + first + last) [birthdate ignored]
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
    const k = key(teamId, first, last);
    if (seenIncoming.has(k)) continue;
    seenIncoming.add(k);

    const experienceYears = Math.max(0, Math.floor(row.experienceYears ?? 0));
    const skill = Math.min(5, Math.max(0, Math.floor(row.skill ?? 3)));
    const isGirl = row.isGirl ?? normalizeIsGirl((row as { sex?: string }).sex);

    const existing = existingMap.get(k);
    if (existing) {
      const weight = row.weight;
      const birthdate = new Date(bdISO);
      const girlChanged = isGirl !== undefined && isGirl !== existing.isGirl;
      if (
        existing.weight !== weight ||
        toISODateOnly(existing.birthdate) !== bdISO ||
        existing.experienceYears !== experienceYears ||
        existing.skill !== skill ||
        girlChanged
      ) {
        const update: UpdateOp = {
          id: existing.id,
          weight,
          birthdate,
          experienceYears,
          skill,
        };
        if (girlChanged) update.isGirl = isGirl;
        toUpdate.push(update);
      }
    } else {
      const create: CreateOp = {
        teamId,
        first,
        last,
        weight: row.weight,
        birthdate: new Date(bdISO),
        experienceYears,
        skill,
      };
      if (isGirl !== undefined) create.isGirl = isGirl;
      toCreate.push(create);
    }
  }

  return { toUpdate, toCreate };
}
