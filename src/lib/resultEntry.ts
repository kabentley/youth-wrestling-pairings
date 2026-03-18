export const RESULT_TYPES = ["DEC", "MAJ", "TF", "FALL", "DQ", "FOR"] as const;
export const PERIOD_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "OT" },
  { value: 5, label: "OT2" },
  { value: 6, label: "OT3" },
] as const;

export type ResultType = (typeof RESULT_TYPES)[number];

export type BoutResultInput = {
  winnerId?: string | null;
  type?: string | null;
  score?: string | null;
  period?: number | null;
  time?: string | null;
  notes?: string | null;
};

export type ValidatedBoutResult = {
  winnerId: string | null;
  type: ResultType | null;
  score: string | null;
  period: number | null;
  time: string | null;
  notes: string | null;
};

export function isValidResultPeriod(value?: number | null) {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

export function formatResultPeriod(value?: number | null) {
  return PERIOD_OPTIONS.find((option) => option.value === value)?.label ?? "";
}

export function classifyDecisionTypeFromScore(score?: string | null) {
  const { winnerScore, loserScore } = parseWinnerLoserScore(score);
  if (winnerScore === null || loserScore === null || winnerScore <= loserScore) return null;
  const margin = winnerScore - loserScore;
  if (margin >= 15) return "TF" as const;
  if (margin >= 8) return "MAJ" as const;
  return "DEC" as const;
}

export function normalizeSavedResult(result: ValidatedBoutResult): ValidatedBoutResult {
  if (result.type !== "DEC") return result;
  const normalizedType = classifyDecisionTypeFromScore(result.score);
  if (!normalizedType || normalizedType === "DEC") return result;
  return {
    ...result,
    type: normalizedType,
  };
}

type ValidationResult =
  | { ok: true; value: ValidatedBoutResult }
  | { ok: false; error: string };

function trimNullable(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseScorePart(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeResultType(value?: string | null): ResultType | null {
  const trimmed = trimNullable(value);
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper === "PIN") return "FALL";
  if (upper === "MAJOR") return "MAJ";
  return RESULT_TYPES.includes(upper as ResultType) ? (upper as ResultType) : null;
}

export function isValidResultTime(value?: string | null) {
  const trimmed = trimNullable(value);
  return Boolean(trimmed && /^[0-9]:[0-5][0-9]$/.test(trimmed));
}

export function parseWinnerLoserScore(value?: string | null) {
  const trimmed = trimNullable(value);
  if (!trimmed) return { winnerScore: null, loserScore: null };
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (!match) return { winnerScore: null, loserScore: null };
  return {
    winnerScore: parseScorePart(match[1]),
    loserScore: parseScorePart(match[2]),
  };
}

export function buildWinnerLoserScore(winnerScore?: string | null, loserScore?: string | null) {
  const winner = trimNullable(winnerScore);
  const loser = trimNullable(loserScore);
  if (!winner || !loser) return null;
  return `${winner}-${loser}`;
}

function validateWinnerLoserScore(score: string | null, type?: ResultType | null) {
  const { winnerScore, loserScore } = parseWinnerLoserScore(score);
  if (winnerScore === null || loserScore === null) {
    return { ok: false as const, error: "Enter winner and loser scores." };
  }
  if (winnerScore <= 0 || loserScore < 0 || winnerScore >= 25 || loserScore >= 25) {
    return { ok: false as const, error: "Winner score must be 1-24 and loser score must be 0-24." };
  }
  if (winnerScore <= loserScore) {
    return { ok: false as const, error: "Winner score must be greater than loser score." };
  }
  const margin = winnerScore - loserScore;
  if (type === "MAJ" && margin < 8) {
    return { ok: false as const, error: "Major decisions require a win by at least 8 points." };
  }
  if (type === "TF" && margin < 15) {
    return { ok: false as const, error: "Technical falls require a win by at least 15 points." };
  }
  return { ok: true as const, value: `${winnerScore}-${loserScore}` };
}

export function validateBoutResult(input: BoutResultInput): ValidationResult {
  const winnerId = trimNullable(input.winnerId) ?? null;
  const rawType = trimNullable(input.type);
  const score = trimNullable(input.score);
  const period = typeof input.period === "number" && Number.isInteger(input.period) ? input.period : null;
  const time = trimNullable(input.time);
  const notes = trimNullable(input.notes);

  if (input.period != null && period === null) {
    return { ok: false, error: "Period must be a whole number." };
  }
  if (period !== null && !isValidResultPeriod(period)) {
    return { ok: false, error: "Select a valid period." };
  }

  if (!winnerId) {
    if (rawType || score || period !== null || time || notes) {
      return { ok: false, error: "Clear result type and details when no winner is selected." };
    }
    return {
      ok: true,
      value: { winnerId: null, type: null, score: null, period: null, time: null, notes: null },
    };
  }

  if (!rawType) {
    if (score || period !== null || time || notes) {
      return { ok: false, error: "Select a result type before entering details." };
    }
    return {
      ok: true,
      value: { winnerId, type: null, score: null, period: null, time: null, notes: null },
    };
  }

  const type = normalizeResultType(rawType);
  if (!type) {
    return { ok: false, error: "Invalid result type." };
  }

  if ((type === "DEC" || type === "MAJ")) {
    const validatedScore = validateWinnerLoserScore(score, type);
    if (!validatedScore.ok) return validatedScore;
    if (period !== null) return { ok: false, error: "Period is only used for falls and technical falls." };
    if (time) return { ok: false, error: "Time is only used for falls and technical falls." };
    return {
      ok: true,
      value: { winnerId, type, score: validatedScore.value, period, time: null, notes },
    };
  }

  if (type === "TF") {
    const validatedScore = validateWinnerLoserScore(score, type);
    if (!validatedScore.ok) return validatedScore;
    if (time && !isValidResultTime(time)) {
      return { ok: false, error: "Enter a time in x:xx format under 10 minutes." };
    }
    return {
      ok: true,
      value: { winnerId, type, score: validatedScore.value, period, time, notes },
    };
  }

  if (type === "FALL") {
    if (time && !isValidResultTime(time)) {
      return { ok: false, error: "Enter a time in x:xx format under 10 minutes." };
    }
    if (score) return { ok: false, error: "Fall results do not use a score." };
    return {
      ok: true,
      value: { winnerId, type, score: null, period, time, notes },
    };
  }

  if (!notes) {
    const resultLabel = type === "DQ" ? "DQ" : "forfeit";
    return { ok: false, error: `Enter a comment for ${resultLabel} results.` };
  }
  if (period !== null) return { ok: false, error: "Period is only used for falls and technical falls." };
  if (score) return { ok: false, error: "Score is only used for decision and technical fall results." };
  if (time) return { ok: false, error: "Time is only used for falls and technical falls." };
  return {
    ok: true,
    value: { winnerId, type, score: null, period, time: null, notes },
  };
}
