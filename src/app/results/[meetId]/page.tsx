"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import AppHeader from "@/components/AppHeader";
import { DEFAULT_MAT_RULES } from "@/lib/matRules";
import {
  buildWinnerLoserScore,
  isValidResultTime,
  isValidResultPeriod,
  normalizeResultType,
  parseWinnerLoserScore,
  PERIOD_OPTIONS,
  type ResultType,
  validateBoutResult,
} from "@/lib/resultEntry";

type TeamInfo = { id: string; name: string; symbol?: string | null; color?: string | null };
type WrestlerInfo = { id: string; first: string; last: string; teamId: string; team: TeamInfo };
type BoutRowApi = {
  id: string;
  mat: number | null;
  order: number | null;
  red: WrestlerInfo;
  green: WrestlerInfo;
  resultWinnerId: string | null;
  resultType: string | null;
  resultScore: string | null;
  resultPeriod: number | null;
  resultTime: string | null;
  resultNotes: string | null;
  resultAt: string | null;
};
type BoutRow = BoutRowApi & {
  resultWinnerScoreInput: string;
  resultLoserScoreInput: string;
};
type MeetInfo = {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  status?: string | null;
  homeTeamId?: string | null;
};
type ResultSnapshot = {
  winnerId: string | null;
  type: string | null;
  score: string | null;
  period: number | null;
  notes: string | null;
};

const TYPE_OPTIONS: Array<{ value: ResultType; label: string }> = [
  { value: "DEC", label: "DEC" },
  { value: "MAJ", label: "MAJ" },
  { value: "TF", label: "TF" },
  { value: "FALL", label: "FALL" },
  { value: "DQ", label: "DQ" },
  { value: "FOR", label: "No Match" },
];

function trimNullable(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function deriveScoreInputs(resultType: string | null, resultScore: string | null) {
  const type = normalizeResultType(resultType);
  if (type !== "DEC" && type !== "MAJ" && type !== "TF") {
    return { resultWinnerScoreInput: "", resultLoserScoreInput: "" };
  }
  const { winnerScore, loserScore } = parseWinnerLoserScore(resultScore);
  return {
    resultWinnerScoreInput: winnerScore?.toString() ?? "",
    resultLoserScoreInput: loserScore?.toString() ?? "",
  };
}

function normalizeBoutRow(row: BoutRowApi): BoutRow {
  const type = normalizeResultType(row.resultType);
  const fallbackTime = !trimNullable(row.resultTime) && type === "FALL" && isValidResultTime(row.resultScore)
    ? trimNullable(row.resultScore)
    : trimNullable(row.resultTime);
  const normalizedPeriod = type === "FALL" || type === "TF"
    ? row.resultPeriod ?? null
    : null;
  return {
    ...row,
    resultType: type,
    resultScore: trimNullable(row.resultScore),
    resultPeriod: normalizedPeriod,
    resultTime: fallbackTime,
    resultNotes: trimNullable(row.resultNotes),
    ...deriveScoreInputs(type, row.resultScore),
  };
}

function snapshotForBout(bout: BoutRow): ResultSnapshot {
  return {
    winnerId: bout.resultWinnerId ?? null,
    type: normalizeResultType(bout.resultType),
    score: buildWinnerLoserScore(bout.resultWinnerScoreInput, bout.resultLoserScoreInput),
    period: bout.resultPeriod ?? null,
    notes: trimNullable(bout.resultNotes),
  };
}

function sameSnapshot(a?: ResultSnapshot, b?: ResultSnapshot) {
  return a?.winnerId === b?.winnerId
    && a?.type === b?.type
    && a?.score === b?.score
    && a?.period === b?.period
    && a?.notes === b?.notes;
}

function hasSnapshotValue(snapshot?: ResultSnapshot) {
  if (!snapshot) return false;
  return snapshot.winnerId !== null
    || snapshot.type !== null
    || snapshot.score !== null
    || snapshot.period !== null
    || snapshot.notes !== null;
}

function sanitizeRowForType(bout: BoutRow, nextType: ResultType | null): Partial<BoutRow> {
  if (!nextType) {
    return {
      resultType: null,
      resultScore: null,
      resultPeriod: null,
      resultTime: null,
      resultNotes: null,
      resultWinnerScoreInput: "",
      resultLoserScoreInput: "",
    };
  }
  if (nextType === "DEC" || nextType === "MAJ") {
    return {
      resultType: nextType,
      resultScore: buildWinnerLoserScore(bout.resultWinnerScoreInput, bout.resultLoserScoreInput),
      resultPeriod: null,
      resultTime: null,
    };
  }
  if (nextType === "TF") {
    return {
      resultType: nextType,
      resultScore: buildWinnerLoserScore(bout.resultWinnerScoreInput, bout.resultLoserScoreInput),
      resultPeriod: bout.resultPeriod ?? null,
      resultTime: null,
    };
  }
  if (nextType === "FALL") {
    return {
      resultType: nextType,
      resultScore: null,
      resultPeriod: bout.resultPeriod ?? null,
      resultTime: null,
      resultWinnerScoreInput: "",
      resultLoserScoreInput: "",
    };
  }
  return {
    resultType: nextType,
    resultScore: null,
    resultPeriod: null,
    resultTime: null,
    resultWinnerScoreInput: "",
    resultLoserScoreInput: "",
  };
}

function parseScoreInputValue(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function getRowValidationState(bout: BoutRow) {
  const type = normalizeResultType(bout.resultType);
  const winnerScore = parseScoreInputValue(bout.resultWinnerScoreInput);
  const loserScore = parseScoreInputValue(bout.resultLoserScoreInput);
  const usesScore = type === "DEC" || type === "MAJ" || type === "TF";
  const usesPeriod = type === "FALL" || type === "TF";
  const usesNotes = type === "DQ" || type === "FOR";
  const scoreMargin = winnerScore !== null && loserScore !== null ? winnerScore - loserScore : null;

  const winnerScoreInvalid = usesScore && (
    winnerScore === null
    || winnerScore <= 0
    || winnerScore >= 25
    || (loserScore !== null && winnerScore <= loserScore)
    || (type === "MAJ" && scoreMargin !== null && scoreMargin < 8)
    || (type === "TF" && scoreMargin !== null && scoreMargin < 15)
  );
  const loserScoreInvalid = usesScore && (
    loserScore === null
    || loserScore < 0
    || loserScore >= 25
    || (winnerScore !== null && loserScore >= winnerScore)
    || (type === "MAJ" && scoreMargin !== null && scoreMargin < 8)
    || (type === "TF" && scoreMargin !== null && scoreMargin < 15)
  );
  const periodInvalid = usesPeriod && bout.resultPeriod !== null && !isValidResultPeriod(bout.resultPeriod);
  const notesInvalid = usesNotes && !trimNullable(bout.resultNotes);

  return {
    winnerScoreInvalid,
    loserScoreInvalid,
    periodInvalid,
    notesInvalid,
  };
}

export default function EnterResultsPage() {
  const params = useParams<{ meetId: string }>();
  const meetId = params.meetId;
  const [meet, setMeet] = useState<MeetInfo | null>(null);
  const [bouts, setBouts] = useState<BoutRow[]>([]);
  const [msg, setMsg] = useState("");
  const [activeMat, setActiveMat] = useState<number | "unassigned">("unassigned");
  const [matColors, setMatColors] = useState<Record<number, string | null>>({});
  const originalResultsRef = useRef<Record<string, ResultSnapshot | undefined>>({});
  const boutsRef = useRef<BoutRow[]>([]);
  const pendingWinnerAdvanceBoutIdRef = useRef<string | null>(null);
  const pendingTypeAdvanceBoutIdRef = useRef<string | null>(null);

  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/account", label: "Account" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  const canEdit = true;

  function boutLabel(mat?: number | null, order?: number | null) {
    if (!mat || !order) return "Unassigned";
    const ordValue = Math.max(0, order - 1);
    const ordStr = String(ordValue).padStart(2, "0");
    return `${mat}${ordStr}`;
  }

  function updateBout(id: string, patch: Partial<BoutRow>) {
    setBouts((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
      boutsRef.current = next;
      return next;
    });
  }

  function updateWinnerSelection(
    id: string,
    winnerId: string | null,
    options?: { advanceFocus?: boolean },
  ) {
    pendingWinnerAdvanceBoutIdRef.current = winnerId && options?.advanceFocus ? id : null;
    setBouts((prev) => {
      const next = prev.map((b) => {
        if (b.id !== id) return b;
        if (!winnerId) {
          return {
            ...b,
            resultWinnerId: null,
            resultType: null,
            resultScore: null,
            resultPeriod: null,
            resultTime: null,
            resultNotes: null,
            resultWinnerScoreInput: "",
            resultLoserScoreInput: "",
          };
        }
        if (b.resultType) {
          return { ...b, resultWinnerId: winnerId };
        }
        return {
          ...b,
          resultWinnerId: winnerId,
          ...sanitizeRowForType(b, "DEC"),
        };
      });
      boutsRef.current = next;
      return next;
    });
  }

  function updateTypeSelection(id: string, rawType: string) {
    const nextType = normalizeResultType(rawType);
    setBouts((prev) => {
      const next = prev.map((b) => (
        b.id === id
          ? { ...b, ...sanitizeRowForType(b, nextType) }
          : b
      ));
      boutsRef.current = next;
      return next;
    });
  }

  function updateScoreInput(id: string, side: "winner" | "loser", value: string) {
    const cleaned = value.replace(/\D/g, "").slice(0, 2);
    setBouts((prev) => {
      const next = prev.map((b) => {
        if (b.id !== id) return b;
        const updated = side === "winner"
          ? { ...b, resultWinnerScoreInput: cleaned }
          : { ...b, resultLoserScoreInput: cleaned };

        return {
          ...updated,
          resultScore: buildWinnerLoserScore(updated.resultWinnerScoreInput, updated.resultLoserScoreInput),
        };
      });
      boutsRef.current = next;
      return next;
    });
  }

  function updatePeriodInput(id: string, value: string) {
    if (!value) {
      updateBout(id, { resultPeriod: null });
      return;
    }
    const parsed = Number.parseInt(value, 10);
    updateBout(id, { resultPeriod: Number.isInteger(parsed) && isValidResultPeriod(parsed) ? parsed : null });
  }

  function updateNotesInput(id: string, value: string) {
    updateBout(id, { resultNotes: value });
  }

  async function load() {
    setMsg("");
    const res = await fetch(`/api/meets/${meetId}/results`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg(json?.error ?? "Unable to load results.");
      return;
    }
    const json = await res.json();
    setMeet(json.meet ?? null);
    const nextBouts = Array.isArray(json.bouts)
      ? (json.bouts as BoutRowApi[]).map(normalizeBoutRow)
      : [];
    setBouts(nextBouts);
    boutsRef.current = nextBouts;
    const original: Record<string, ResultSnapshot | undefined> = {};
    for (const bout of nextBouts) {
      original[bout.id] = snapshotForBout(bout);
    }
    originalResultsRef.current = original;
  }

  function handleSaveError(message: string) {
    setMsg(message);
  }

  function handleRowSubmitKey(
    event: React.KeyboardEvent<HTMLSelectElement | HTMLInputElement>,
    boutId: string,
    index: number,
  ) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void saveResult(boutId);
    focusNextRow(index);
  }

  function handleAdvanceFieldKey(
    event: React.KeyboardEvent<HTMLSelectElement | HTMLInputElement>,
  ) {
    if (event.key !== " ") return;
    event.preventDefault();
    focusNextResultField(event.currentTarget);
  }

  function focusNextResultField(currentField: HTMLSelectElement | HTMLInputElement) {
    const fields = Array.from(
      document.querySelectorAll<HTMLSelectElement | HTMLInputElement>("[data-result-nav='true']:not(:disabled)"),
    );
    const currentIndex = fields.indexOf(currentField);
    if (currentIndex < 0) return;
    fields.at(currentIndex + 1)?.focus();
  }

  function handleSelectTabAdvance(
    event: React.KeyboardEvent<HTMLSelectElement>,
    onCommit?: (value: string) => void,
  ) {
    if (event.key !== "Tab" || event.shiftKey) return;
    const field = event.currentTarget;
    window.setTimeout(() => {
      onCommit?.(field.value);
      focusNextResultField(field);
    }, 0);
  }

  function handleWinnerFieldKey(
    event: React.KeyboardEvent<HTMLSelectElement>,
    boutId: string,
    currentWinnerId: string | null,
    wrestlers: Array<{ id: string; first: string; last: string }>,
  ) {
    if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) return;
    const letter = event.key.toUpperCase();
    const matches = wrestlers.filter((wrestler) => (
      wrestler.first.toUpperCase().startsWith(letter)
      || wrestler.last.toUpperCase().startsWith(letter)
    ));
    if (matches.length === 0) return;
    event.preventDefault();
    const currentIndex = currentWinnerId ? matches.findIndex((wrestler) => wrestler.id === currentWinnerId) : -1;
    const nextWinner = matches[(currentIndex + 1 + matches.length) % matches.length];
    updateWinnerSelection(boutId, nextWinner.id);
  }

  function handleTypeFieldKey(
    event: React.KeyboardEvent<HTMLSelectElement>,
    boutId: string,
    currentType: ResultType | null,
  ) {
    if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) return;
    const letter = event.key.toUpperCase();
    const matches = TYPE_OPTIONS.filter((option) => option.label.toUpperCase().startsWith(letter));
    if (matches.length === 0) return;
    event.preventDefault();
    const currentIndex = currentType ? matches.findIndex((option) => option.value === currentType) : -1;
    const nextType = matches[(currentIndex + 1 + matches.length) % matches.length];
    pendingTypeAdvanceBoutIdRef.current = boutId;
    updateTypeSelection(boutId, nextType.value);
  }

  function handlePeriodFieldKey(
    event: React.KeyboardEvent<HTMLSelectElement>,
    boutId: string,
    currentPeriod: number | null,
  ) {
    if (event.key.length !== 1 || !/[0-9a-z]/i.test(event.key)) return;
    const key = event.key.toUpperCase();
    let matches = PERIOD_OPTIONS.filter((option) => option.label.toUpperCase().startsWith(key));
    if (matches.length === 0 && /^[1-6]$/.test(key)) {
      matches = PERIOD_OPTIONS.filter((option) => option.value === Number.parseInt(key, 10));
    }
    if (matches.length === 0) return;
    event.preventDefault();
    const currentIndex = currentPeriod !== null ? matches.findIndex((option) => option.value === currentPeriod) : -1;
    const nextPeriod = matches[(currentIndex + 1 + matches.length) % matches.length];
    updateBout(boutId, { resultPeriod: nextPeriod.value });
  }

  async function saveResult(boutId: string) {
    const bout = boutsRef.current.find((row) => row.id === boutId);
    if (!bout) return;
    const nextSnapshot = snapshotForBout(bout);
    const original = originalResultsRef.current[bout.id];
    if (sameSnapshot(original, nextSnapshot)) {
      return;
    }
    const validated = validateBoutResult(nextSnapshot);
    if (!validated.ok) {
      return;
    }
    try {
      const res = await fetch(`/api/bouts/${bout.id}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winnerId: validated.value.winnerId,
          type: validated.value.type,
          score: validated.value.score,
          period: validated.value.period,
          time: null,
          notes: validated.value.notes,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        handleSaveError(json?.error ?? "Unable to save result.");
        return;
      }
      const json = await res.json();
      const patch = normalizeBoutRow({
        ...bout,
        resultWinnerId: json.resultWinnerId ?? null,
        resultType: json.resultType ?? null,
        resultScore: json.resultScore ?? null,
        resultPeriod: json.resultPeriod ?? null,
        resultTime: json.resultTime ?? null,
        resultNotes: json.resultNotes ?? null,
        resultAt: json.resultAt ?? null,
      });
      updateBout(bout.id, patch);
      originalResultsRef.current[bout.id] = snapshotForBout({ ...bout, ...patch });
      setMsg("");
    } finally {
      // no-op
    }
  }

  function exportResults() {
    window.location.assign(`/api/meets/${meetId}/results/export`);
  }

  useEffect(() => {
    void load();
  }, [meetId]);

  useEffect(() => {
    let cancelled = false;
    const fetchMatColors = async () => {
      const res = await fetch(`/api/meets/${meetId}/mat-rules`);
      if (!res.ok) {
        if (!cancelled) setMatColors({});
        return;
      }
      const payload = await res.json().catch(() => null);
      if (cancelled) return;
      const colors: Record<number, string | null> = {};
      const rules = Array.isArray(payload?.rules) ? payload.rules : [];
      for (const rule of rules) {
        if (typeof rule.matIndex === "number") {
          const trimmed = typeof rule.color === "string" ? rule.color.trim() : "";
          colors[rule.matIndex] = trimmed.length > 0 ? trimmed : null;
        }
      }
      setMatColors(colors);
    };
    void fetchMatColors();
    return () => {
      cancelled = true;
    };
  }, [meetId]);

  useEffect(() => {
    const pendingBoutId = pendingWinnerAdvanceBoutIdRef.current;
    if (!pendingBoutId) return;
    const nextField = document.querySelector<HTMLSelectElement>(
      `[data-bout-id="${pendingBoutId}"][data-type-field="true"]:not(:disabled)`,
    );
    if (!nextField) return;
    pendingWinnerAdvanceBoutIdRef.current = null;
    nextField.focus();
  }, [bouts]);

  useEffect(() => {
    const pendingBoutId = pendingTypeAdvanceBoutIdRef.current;
    if (!pendingBoutId) return;
    const nextField = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-bout-id="${pendingBoutId}"][data-detail-first="true"]:not(:disabled)`,
    );
    if (!nextField) return;
    pendingTypeAdvanceBoutIdRef.current = null;
    nextField.focus();
  }, [bouts]);

  const meetNameDisplay = meet?.name ?? "Meet";

  const darkenHex = (color: string, amount: number) => {
    if (!color.startsWith("#") || color.length !== 7) return color;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
    const factor = Math.max(0, Math.min(1, 1 - amount));
    const nr = Math.round(r * factor);
    const ng = Math.round(g * factor);
    const nb = Math.round(b * factor);
    return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
  };
  const matTextColor = (color?: string | null) => {
    if (!color?.startsWith("#") || color.length !== 7) return color ?? "#000000";
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance > 0.8) return darkenHex(color, 0.6);
    if (luminance > 0.7) return darkenHex(color, 0.45);
    if (luminance > 0.6) return darkenHex(color, 0.3);
    return color;
  };
  const contrastText = (color?: string | null) => {
    if (!color?.startsWith("#")) return "#ffffff";
    const hex = color.slice(1);
    if (hex.length !== 6) return "#ffffff";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#ffffff";
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  };
  const getDefaultMatColor = (matIndex: number) => {
    const preset = DEFAULT_MAT_RULES[(matIndex - 1) % DEFAULT_MAT_RULES.length];
    return preset.color ?? "#f2f2f2";
  };
  const getMatColor = (matIndex: number) => {
    if (!matIndex || matIndex < 1) return "#f2f2f2";
    const stored = matColors[matIndex];
    if (stored?.trim()) return stored.trim();
    return getDefaultMatColor(matIndex);
  };

  const mats = useMemo(() => {
    const matSet = new Set<number>();
    let hasUnassigned = false;
    for (const b of bouts) {
      if (!b.mat || !b.order) {
        hasUnassigned = true;
        continue;
      }
      matSet.add(b.mat);
    }
    const ordered = Array.from(matSet).sort((a, b) => a - b);
    return { ordered, hasUnassigned };
  }, [bouts]);

  useEffect(() => {
    if (mats.ordered.length === 0 && mats.hasUnassigned) {
      setActiveMat("unassigned");
      return;
    }
    if (activeMat === "unassigned") {
      if (!mats.hasUnassigned && mats.ordered.length > 0) {
        setActiveMat(mats.ordered[0]);
      }
      return;
    }
    if (typeof activeMat === "number" && !mats.ordered.includes(activeMat)) {
      if (mats.ordered.length > 0) {
        setActiveMat(mats.ordered[0]);
      } else if (mats.hasUnassigned) {
        setActiveMat("unassigned");
      }
    }
  }, [activeMat, mats]);

  const filteredBouts = useMemo(() => {
    if (activeMat === "unassigned") {
      return bouts.filter(b => !b.mat || !b.order);
    }
    return bouts.filter(b => b.mat === activeMat);
  }, [activeMat, bouts]);

  const focusNextRow = (index: number) => {
    const fields = Array.from(document.querySelectorAll<HTMLSelectElement | HTMLInputElement>(".first-field"));
    if (index + 1 < fields.length) {
      fields[index + 1].focus();
    }
  };

  return (
    <main className="results-entry">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --accent: #1e88e5;
          --line: #d5dbe2;
        }
        .results-entry {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          border-bottom: 1px solid var(--line);
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .title {
          font-family: "Oswald", Arial, sans-serif;
          font-size: clamp(24px, 3vw, 36px);
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .title .meet-name {
          font-size: 0.85em;
          font-weight: 600;
          text-transform: none;
        }
        .title .meet-location {
          font-size: 0.7em;
          font-weight: 500;
          color: var(--muted);
          text-transform: none;
          letter-spacing: 0.2px;
        }
        .subtitle {
          margin-top: 6px;
          color: var(--muted);
          font-size: 14px;
        }
        .notice {
          border: 1px solid #e8c3c3;
          background: #fff3f3;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 12px;
          color: #b00020;
        }
        .lock {
          background: #fffaf0;
          border: 1px solid #f3c27a;
          color: #8a4b00;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .table-wrap {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px;
          max-width: 1200px;
          margin: 0;
        }
        .table-scroll {
          overflow-x: auto;
          overflow-y: auto;
          max-height: calc(100dvh - 220px);
          scrollbar-gutter: stable;
        }
        .pairings-tab-bar {
          display: flex;
          gap: 6px;
          align-items: flex-end;
          border-bottom: 1px solid var(--line);
          margin-top: 8px;
        }
        .pairing-tab {
          border: 1px solid var(--line);
          border-bottom: none;
          border-radius: 8px 8px 0 0;
          background: #eef1f4;
          padding: 6px 12px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
        }
        .pairing-tab.active {
          background: #ffffff;
          color: var(--ink);
          box-shadow: 0 -2px 0 #ffffff inset;
        }
        .pairing-tab:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
        .tab-body {
          margin-top: -1px;
          padding-top: 0;
          border: 1px solid var(--line);
          border-top: none;
          background: #fff;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          min-width: 980px;
          table-layout: auto;
        }
        th, td {
          border-bottom: 1px solid var(--line);
          padding: 4px;
          font-size: 12px;
          text-align: left;
          vertical-align: top;
        }
        th {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
          position: sticky;
          top: 0;
          background: var(--card);
          background-clip: padding-box;
          z-index: 2;
          box-shadow: inset 0 -1px 0 var(--line);
        }
        .bout-num {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }
        .winner-col select {
          font-size: 14px;
          font-weight: 600;
        }
        .type-col select,
        .score-col input {
          font-size: 14px;
          font-weight: 600;
        }
        .details-cell {
          min-width: 360px;
        }
        .details-group {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: nowrap;
          flex: 0 0 auto;
          min-width: fit-content;
        }
        .details-row {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          min-width: 0;
          flex-wrap: nowrap;
        }
        .details-group label {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .score-mini {
          width: 56px;
          text-align: center;
          font-weight: 700;
        }
        .period-select {
          width: 78px;
          text-align: left;
          font-weight: 700;
        }
        .comment-group {
          margin-left: auto;
        }
        .comment-input {
          width: 132px;
        }
        .comment-input::placeholder {
          color: #a8b0bd;
        }
        .field-invalid {
          border-color: #c62828;
          background: #fff2f2;
        }
        .details-hint {
          color: var(--muted);
          font-size: 12px;
          line-height: 1.3;
          padding-top: 6px;
        }
        .saved-badge {
          display: inline-flex;
          align-items: center;
          border: 1px solid #9cc9a7;
          background: #edf8f0;
          color: #23633a;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .saved-badge-slot {
          display: inline-flex;
          justify-content: flex-end;
          min-width: 56px;
          flex: 0 0 56px;
        }
        .saved-badge.hidden {
          visibility: hidden;
        }
        .wrestler {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          font-size: 15px;
        }
        input, select, button, textarea {
          font-family: inherit;
        }
        input, select, textarea {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 4px 6px;
          width: 100%;
          box-sizing: border-box;
          font-size: 12px;
        }
        textarea {
          min-height: 40px;
          resize: vertical;
        }
        .results-entry .btn {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 4px 8px;
          font-weight: 700;
          background: #ffffff;
          color: var(--ink);
          cursor: pointer;
          font-size: 12px;
        }
        .results-entry .btn.toolbar-btn {
          padding: 8px 14px;
          font-size: 14px;
        }
        .results-entry .btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .results-entry .app-header-actions {
          flex-wrap: nowrap;
        }
        .results-entry .app-header-user-info {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }
        .first-field:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          box-shadow: 0 0 0 2px rgba(30, 136, 229, 0.15);
        }
        .status {
          font-size: 12px;
          color: var(--muted);
          margin-top: 6px;
        }
        .name-col {
          white-space: nowrap;
          min-width: 260px;
          max-width: none;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vs {
          color: var(--muted);
          font-weight: 600;
          margin: 0 6px;
        }
        .name-col .wrestler {
          display: inline-block;
          max-width: 100%;
          overflow: visible;
          text-overflow: clip;
          vertical-align: bottom;
        }
      `}</style>

      <AppHeader links={headerLinks} />

      <div className="header">
        <div>
          <h1 className="title">
            Results for: <span className="meet-name">{meetNameDisplay}</span>
            {meet?.location ? <span className="meet-location"> - {meet.location}</span> : ""}
          </h1>
        </div>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn toolbar-btn" type="button" onClick={exportResults}>Export to .xlsx</button>
            <button className="btn toolbar-btn" type="button" onClick={load}>Refresh</button>
          </div>
        </div>
      </div>

      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="pairings-tab-bar" role="tablist" aria-label="Mat tabs">
        {mats.ordered.map((mat) => (
          <button
            key={mat}
            className={`pairing-tab ${activeMat === mat ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeMat === mat}
            onClick={() => setActiveMat(mat)}
            style={{
              background: activeMat === mat
                ? getMatColor(mat)
                : getMatColor(mat) ? `${getMatColor(mat)}22` : undefined,
              borderColor: getMatColor(mat),
              color: activeMat === mat
                ? contrastText(getMatColor(mat))
                : matTextColor(getMatColor(mat)),
              borderWidth: activeMat === mat ? 2 : undefined,
              fontWeight: activeMat === mat ? 700 : undefined,
              boxShadow: activeMat === mat ? "0 -2px 0 #ffffff inset, 0 2px 0 rgba(0,0,0,0.12)" : undefined,
            }}
          >
            Mat {mat}
          </button>
        ))}
        {mats.hasUnassigned && (
          <button
            className={`pairing-tab ${activeMat === "unassigned" ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeMat === "unassigned"}
            onClick={() => setActiveMat("unassigned")}
          >
            Unassigned
          </button>
        )}
      </div>

      <div className="tab-body">
        <div className="table-wrap">
          <div className="table-scroll">
          <table>
          <thead>
            <tr>
              <th>Bout</th>
              <th className="name-col">Wrestlers</th>
              <th>Winner</th>
              <th>Type</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredBouts.map((b, index) => {
              const redLabel = `${b.red.first} ${b.red.last}`;
              const greenLabel = `${b.green.first} ${b.green.last}`;
              const isHomeRed = meet?.homeTeamId ? b.red.teamId === meet.homeTeamId : false;
              const isHomeGreen = meet?.homeTeamId ? b.green.teamId === meet.homeTeamId : false;
              const first = meet?.homeTeamId && isHomeGreen && !isHomeRed ? b.green : b.red;
              const second = first.id === b.red.id ? b.green : b.red;
              const firstLabel = first.id === b.red.id ? redLabel : greenLabel;
              const secondLabel = second.id === b.red.id ? redLabel : greenLabel;
              const firstTeamLabel = first.team.symbol ?? first.team.name;
              const secondTeamLabel = second.team.symbol ?? second.team.name;
              const firstOptionColor = matTextColor(first.team.color);
              const secondOptionColor = matTextColor(second.team.color);
              const resultType = normalizeResultType(b.resultType);
              const validationState = getRowValidationState(b);
              const currentSnapshot = snapshotForBout(b);
              const savedSnapshot = originalResultsRef.current[b.id];
              const showSavedBadge = hasSnapshotValue(savedSnapshot) && sameSnapshot(savedSnapshot, currentSnapshot);
              const winnerColor = b.resultWinnerId === b.red.id
                ? matTextColor(b.red.team.color)
                : b.resultWinnerId === b.green.id
                  ? matTextColor(b.green.team.color)
                  : undefined;
              return (
                <tr
                  key={b.id}
                  onBlur={(e) => {
                    const next = e.relatedTarget as HTMLElement | null;
                    if (next && e.currentTarget.contains(next)) return;
                    void saveResult(b.id);
                  }}
                >
                  <td className="bout-num">{boutLabel(b.mat, b.order)}</td>
                  <td className="name-col">
                    <span className="wrestler" style={{ color: matTextColor(first.team.color) }}>
                      {firstLabel} ({firstTeamLabel})
                    </span>
                    <span className="vs">v</span>
                    <span className="wrestler" style={{ color: matTextColor(second.team.color) }}>
                      {secondLabel} ({secondTeamLabel})
                    </span>
                  </td>
                  <td className="winner-col">
                    <select
                      className="first-field"
                      data-result-nav="true"
                      value={b.resultWinnerId ?? ""}
                      onChange={(e) => updateWinnerSelection(b.id, e.target.value || null, { advanceFocus: true })}
                      onKeyDown={(e) => {
                        handleWinnerFieldKey(e, b.id, b.resultWinnerId ?? null, [
                          { id: first.id, first: first.first, last: first.last },
                          { id: second.id, first: second.first, last: second.last },
                        ]);
                        handleSelectTabAdvance(e, (value) => updateWinnerSelection(b.id, value || null, { advanceFocus: false }));
                        handleAdvanceFieldKey(e);
                        handleRowSubmitKey(e, b.id, index);
                      }}
                      disabled={!canEdit}
                      style={{ color: winnerColor }}
                    >
                      <option value="">No winner</option>
                      <option value={first.id} style={{ color: firstOptionColor, fontWeight: 600 }}>
                        {firstLabel} ({firstTeamLabel})
                      </option>
                      <option value={second.id} style={{ color: secondOptionColor, fontWeight: 600 }}>
                        {secondLabel} ({secondTeamLabel})
                      </option>
                    </select>
                  </td>
                  <td className="type-col">
                    {b.resultWinnerId ? (
                      <select
                        data-bout-id={b.id}
                        data-type-field="true"
                        data-result-nav="true"
                        value={resultType ?? ""}
                        onChange={(e) => updateTypeSelection(b.id, e.target.value)}
                        onKeyDown={(e) => {
                          handleTypeFieldKey(e, b.id, resultType);
                          handleAdvanceFieldKey(e);
                          handleRowSubmitKey(e, b.id, index);
                        }}
                        disabled={!canEdit}
                      >
                        <option value="">Select type</option>
                        {TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td className="score-col details-cell">
                    {!resultType ? null : (
                      <div className="details-row">
                        {(resultType === "DEC" || resultType === "MAJ" || resultType === "TF") && (
                          <div className="details-group">
                            <label>
                              W
                              <input
                                data-bout-id={b.id}
                                data-detail-first="true"
                                data-result-nav="true"
                                className={`score-mini${validationState.winnerScoreInvalid ? " field-invalid" : ""}`}
                                inputMode="numeric"
                                aria-invalid={validationState.winnerScoreInvalid}
                                value={b.resultWinnerScoreInput}
                                onChange={(e) => updateScoreInput(b.id, "winner", e.target.value)}
                                onKeyDown={(e) => {
                                  handleAdvanceFieldKey(e);
                                  handleRowSubmitKey(e, b.id, index);
                                }}
                                disabled={!canEdit}
                              />
                            </label>
                            <label>
                              L
                              <input
                                data-result-nav="true"
                                className={`score-mini${validationState.loserScoreInvalid ? " field-invalid" : ""}`}
                                inputMode="numeric"
                                aria-invalid={validationState.loserScoreInvalid}
                                value={b.resultLoserScoreInput}
                                onChange={(e) => updateScoreInput(b.id, "loser", e.target.value)}
                                onKeyDown={(e) => {
                                  handleAdvanceFieldKey(e);
                                  handleRowSubmitKey(e, b.id, index);
                                }}
                                disabled={!canEdit}
                              />
                            </label>
                            {resultType === "TF" && (
                              <label>
                                Period
                                <select
                                  data-bout-id={b.id}
                                  data-result-nav="true"
                                  className={`period-select${validationState.periodInvalid ? " field-invalid" : ""}`}
                                  aria-invalid={validationState.periodInvalid}
                                  value={b.resultPeriod?.toString() ?? ""}
                                  onChange={(e) => updatePeriodInput(b.id, e.target.value)}
                                  onKeyDown={(e) => {
                                    handlePeriodFieldKey(e, b.id, b.resultPeriod ?? null);
                                    handleAdvanceFieldKey(e);
                                    handleRowSubmitKey(e, b.id, index);
                                  }}
                                  disabled={!canEdit}
                                >
                                  <option value="">Select</option>
                                  {PERIOD_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value.toString()}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        )}
                        {resultType === "FALL" && (
                          <div className="details-group">
                            <label>
                              Period
                              <select
                                data-bout-id={b.id}
                                data-detail-first="true"
                                data-result-nav="true"
                                className={`period-select${validationState.periodInvalid ? " field-invalid" : ""}`}
                                aria-invalid={validationState.periodInvalid}
                                value={b.resultPeriod?.toString() ?? ""}
                                onChange={(e) => updatePeriodInput(b.id, e.target.value)}
                                onKeyDown={(e) => {
                                  handlePeriodFieldKey(e, b.id, b.resultPeriod ?? null);
                                  handleAdvanceFieldKey(e);
                                  handleRowSubmitKey(e, b.id, index);
                                }}
                                disabled={!canEdit}
                              >
                                <option value="">Select</option>
                                {PERIOD_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value.toString()}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        )}
                        <div className="details-group comment-group">
                          <label aria-label="Comment">
                            <input
                              data-bout-id={b.id}
                              className={`comment-input${validationState.notesInvalid ? " field-invalid" : ""}`}
                              aria-invalid={validationState.notesInvalid}
                              placeholder="comment"
                              value={b.resultNotes ?? ""}
                              onChange={(e) => updateNotesInput(b.id, e.target.value)}
                              onKeyDown={(e) => handleRowSubmitKey(e, b.id, index)}
                              disabled={!canEdit}
                            />
                          </label>
                        </div>
                        <span className="saved-badge-slot">
                          <span className={`saved-badge${showSavedBadge ? "" : " hidden"}`}>Saved</span>
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredBouts.length === 0 && (
              <tr>
                <td colSpan={5}>No bouts available for results.</td>
              </tr>
            )}
          </tbody>
          </table>
          </div>
        </div>
      </div>
    </main>
  );
}
