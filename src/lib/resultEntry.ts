export const RESULT_TYPES = ["DEC", "MAJ", "TF", "FALL", "DQ", "FOR"] as const;

export type ResultType = (typeof RESULT_TYPES)[number];

export type BoutResultInput = {
  winnerId?: string | null;
  type?: string | null;
  score?: string | null;
  time?: string | null;
  notes?: string | null;
};

export type ValidatedBoutResult = {
  winnerId: string | null;
  type: ResultType | null;
  score: string | null;
  time: string | null;
  notes: string | null;
};

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
  if (type === "MAJ" && margin < 10) {
    return { ok: false as const, error: "Major decisions require a win by at least 10 points." };
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
  const time = trimNullable(input.time);
  const notes = trimNullable(input.notes);

  if (!winnerId) {
    if (rawType || score || time || notes) {
      return { ok: false, error: "Clear result type and details when no winner is selected." };
    }
    return {
      ok: true,
      value: { winnerId: null, type: null, score: null, time: null, notes: null },
    };
  }

  if (!rawType) {
    if (score || time || notes) {
      return { ok: false, error: "Select a result type before entering details." };
    }
    return {
      ok: true,
      value: { winnerId, type: null, score: null, time: null, notes: null },
    };
  }

  const type = normalizeResultType(rawType);
  if (!type) {
    return { ok: false, error: "Invalid result type." };
  }

  if ((type === "DEC" || type === "MAJ")) {
    const validatedScore = validateWinnerLoserScore(score, type);
    if (!validatedScore.ok) return validatedScore;
    if (time) return { ok: false, error: "Time is only used for falls and technical falls." };
    if (notes) return { ok: false, error: "Comments are only used for DQ and forfeit results." };
    return {
      ok: true,
      value: { winnerId, type, score: validatedScore.value, time: null, notes: null },
    };
  }

  if (type === "TF") {
    const validatedScore = validateWinnerLoserScore(score, type);
    if (!validatedScore.ok) return validatedScore;
    if (!isValidResultTime(time)) {
      return { ok: false, error: "Enter a time in x:xx format under 10 minutes." };
    }
    if (notes) return { ok: false, error: "Comments are only used for DQ and forfeit results." };
    return {
      ok: true,
      value: { winnerId, type, score: validatedScore.value, time, notes: null },
    };
  }

  if (type === "FALL") {
    if (!isValidResultTime(time)) {
      return { ok: false, error: "Enter a time in x:xx format under 10 minutes." };
    }
    if (score) return { ok: false, error: "Fall results only use a time." };
    if (notes) return { ok: false, error: "Comments are only used for DQ and forfeit results." };
    return {
      ok: true,
      value: { winnerId, type, score: null, time, notes: null },
    };
  }

  if (!notes) {
    const resultLabel = type === "DQ" ? "DQ" : "forfeit";
    return { ok: false, error: `Enter a comment for ${resultLabel} results.` };
  }
  if (score) return { ok: false, error: "Score is only used for decision and technical fall results." };
  if (time) return { ok: false, error: "Time is only used for falls and technical falls." };
  return {
    ok: true,
    value: { winnerId, type, score: null, time: null, notes },
  };
}
