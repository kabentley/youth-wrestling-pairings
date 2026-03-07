"use client";

import { useEffect, useState } from "react";

import { adjustTeamTextColor } from "@/lib/contrastText";
import { formatTeamName } from "@/lib/formatTeamName";
import { isCheckinCheckpointName } from "@/lib/meetPhase";
import { pairKey } from "@/lib/pairKey";

type Team = {
  id: string;
  name: string;
  symbol?: string | null;
  color?: string | null;
};

type WrestlerStatus = "COMING" | "NOT_COMING" | "LATE" | "EARLY" | "ABSENT" | null;

type Wrestler = {
  id: string;
  teamId: string;
  first: string;
  last: string;
  weight: number;
  experienceYears: number;
  skill: number;
  isGirl: boolean;
  birthdate?: string;
  status?: WrestlerStatus;
};

type Bout = {
  id: string;
  redId: string;
  greenId: string;
  pairingScore?: number;
  mat?: number | null;
  order?: number | null;
  source?: string | null;
  createdAt?: string;
  sourceUser?: {
    id: string;
    name?: string | null;
    username?: string | null;
    teamId?: string | null;
    teamColor?: string | null;
  } | null;
};

type Checkpoint = {
  id: string;
  name: string;
  createdAt: string;
};

type CheckpointPayload = {
  bouts: Array<{
    redId: string;
    greenId: string;
  }>;
};

type Candidate = {
  opponent: Wrestler;
  score: number;
};

type SortState = {
  key: string;
  dir: "asc" | "desc";
};

type ScratchesTabProps = {
  meetId: string;
  teams: Team[];
  wrestlers: Wrestler[];
  bouts: Bout[];
  homeTeamId: string | null;
  checkpoints: Checkpoint[];
  targetMatchesPerWrestler: number | null;
  canManage: boolean;
  onEnsureLock: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
};

function isReplacementEligible(status?: WrestlerStatus) {
  return status === "COMING" || status === "LATE" || status === "EARLY";
}

function isScratchRosterStatus(status?: WrestlerStatus) {
  return status === "COMING" || status === "LATE" || status === "EARLY" || status === "ABSENT";
}

function wrestlerName(wrestler: Wrestler) {
  return `${wrestler.first} ${wrestler.last}`.trim();
}

function formatBoutNumber(mat?: number | null, order?: number | null) {
  if (!mat || !order) return "";
  const displayOrder = Math.max(0, order - 1);
  return `${mat}${String(displayOrder).padStart(2, "0")}`;
}

function ageYears(birthdate?: string) {
  if (!birthdate) return null;
  const parsed = new Date(birthdate);
  if (Number.isNaN(parsed.getTime())) return null;
  const days = Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
  return days / 365;
}

function sexColor(isGirl?: boolean) {
  if (isGirl === true) return "#d81b60";
  if (isGirl === false) return "#1565c0";
  return undefined;
}

function sortValueCompare(a: string | number | null | undefined, b: string | number | null | undefined, dir: "asc" | "desc") {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") {
    return dir === "asc" ? a - b : b - a;
  }
  const aText = String(a);
  const bText = String(b);
  return dir === "asc" ? aText.localeCompare(bText) : bText.localeCompare(aText);
}

function sortIndicator(sort: SortState, key: string) {
  if (sort.key !== key) return null;
  return <span style={{ fontSize: 10, marginLeft: 4 }}>{sort.dir === "asc" ? "\u25b2" : "\u25bc"}</span>;
}

function contrastTextColor(color?: string | null) {
  if (!color?.startsWith("#") || color.length !== 7) return "#ffffff";
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return "#ffffff";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

function deltaColor(value: number) {
  if (value < 0) return "#b00020";
  if (value > 0) return "#1b5e20";
  return undefined;
}

function fuzzyMatches(value: string, query: string) {
  const normalizedValue = value.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalizedQuery) return true;
  if (normalizedValue.includes(normalizedQuery)) return true;
  let queryIndex = 0;
  for (const char of normalizedValue) {
    if (char === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === normalizedQuery.length) return true;
    }
  }
  return false;
}

export default function ScratchesTab({
  meetId,
  teams,
  wrestlers,
  bouts,
  homeTeamId,
  checkpoints,
  targetMatchesPerWrestler,
  canManage,
  onEnsureLock,
  onRefresh,
}: ScratchesTabProps) {
  const orderedTeams = homeTeamId
    ? [teams.find((team) => team.id === homeTeamId), ...teams.filter((team) => team.id !== homeTeamId)].filter(
        (team): team is Team => Boolean(team),
      )
    : teams;
  const [activeTeamId, setActiveTeamId] = useState<string | null>(orderedTeams[0]?.id ?? null);
  const [selectedNeedsWrestlerId, setSelectedNeedsWrestlerId] = useState<string | null>(null);
  const [selectedDetailWrestlerId, setSelectedDetailWrestlerId] = useState<string | null>(null);
  const [candidateRows, setCandidateRows] = useState<Candidate[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateRefreshVersion, setCandidateRefreshVersion] = useState(0);
  const [baselineMatchCounts, setBaselineMatchCounts] = useState<Map<string, number>>(new Map());
  const [baselineOpponentIds, setBaselineOpponentIds] = useState<Map<string, string[]>>(new Map());
  const [baselineBoutKeys, setBaselineBoutKeys] = useState<Set<string>>(new Set());
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [scratchLoadingId, setScratchLoadingId] = useState<string | null>(null);
  const [addLoadingId, setAddLoadingId] = useState<string | null>(null);
  const [removeLoadingId, setRemoveLoadingId] = useState<string | null>(null);
  const [autoPairingLoading, setAutoPairingLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentSort, setCurrentSort] = useState<SortState>({ key: "bout", dir: "asc" });
  const [availableSort, setAvailableSort] = useState<SortState>({ key: "score", dir: "asc" });
  const [scratchSearch, setScratchSearch] = useState("");
  const [settings, setSettings] = useState({
    enforceAgeGapCheck: true,
    enforceWeightCheck: true,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: false,
    girlsWrestleGirls: true,
  });

  useEffect(() => {
    if (!activeTeamId || orderedTeams.some((team) => team.id === activeTeamId)) return;
    setActiveTeamId(orderedTeams[0]?.id ?? null);
  }, [activeTeamId, orderedTeams]);

  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const wrestlerMap = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler]));
  const matchCounts = new Map<string, number>();
  for (const bout of bouts) {
    matchCounts.set(bout.redId, (matchCounts.get(bout.redId) ?? 0) + 1);
    matchCounts.set(bout.greenId, (matchCounts.get(bout.greenId) ?? 0) + 1);
  }

  const teamColor = (teamId?: string | null) => teamId ? (teamMap.get(teamId)?.color ?? "#000000") : "#000000";
  const teamTextColor = (teamId?: string | null) => adjustTeamTextColor(teamColor(teamId));
  const teamSymbol = (teamId?: string | null) => teamId ? (teamMap.get(teamId)?.symbol ?? teamMap.get(teamId)?.name ?? "") : "";
  const baselineOpponentsText = (wrestlerId: string) => {
    const opponentIds = baselineOpponentIds.get(wrestlerId) ?? [];
    if (opponentIds.length === 0) return "None";
    return opponentIds.map((opponentId) => {
      const opponent = wrestlerMap.get(opponentId);
      if (!opponent) return opponentId;
      const symbol = teamSymbol(opponent.teamId);
      return symbol ? `${wrestlerName(opponent)} (${symbol})` : wrestlerName(opponent);
    }).join(", ");
  };
  const currentBoutKeys = new Set(bouts.map((bout) => pairKey(bout.redId, bout.greenId)));
  const lostScratchOpponentsText = (wrestlerId: string) => {
    const opponentIds = baselineOpponentIds.get(wrestlerId) ?? [];
    const labels = opponentIds
      .filter((opponentId) => {
        const opponent = wrestlerMap.get(opponentId);
        return opponent?.status === "ABSENT" && !currentBoutKeys.has(pairKey(wrestlerId, opponentId));
      })
      .map((opponentId) => {
        const opponent = wrestlerMap.get(opponentId);
        if (!opponent) return opponentId;
        const symbol = teamSymbol(opponent.teamId);
        return symbol ? `${wrestlerName(opponent)} (${symbol})` : wrestlerName(opponent);
      });
    return labels.length > 0 ? labels.join(", ") : "None";
  };

  useEffect(() => {
    const baselineCheckpoint = checkpoints.find((checkpoint) => isCheckinCheckpointName(checkpoint.name));
    if (!baselineCheckpoint) {
      setBaselineMatchCounts(new Map());
      setBaselineOpponentIds(new Map());
      setBaselineBoutKeys(new Set());
      setBaselineError("No Check-in checkpoint found.");
      setBaselineLoading(false);
      return;
    }
    let cancelled = false;
    setBaselineLoading(true);
    setBaselineError(null);
    fetch(`/api/meets/${meetId}/checkpoints/${baselineCheckpoint.id}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Unable to load Check-in checkpoint.");
        }
        return response.json();
      })
      .then((payload: CheckpointPayload) => {
        if (cancelled) return;
        const counts = new Map<string, number>();
        const opponents = new Map<string, string[]>();
        const keys = new Set<string>();
        for (const bout of Array.isArray(payload?.bouts) ? payload.bouts : []) {
          counts.set(bout.redId, (counts.get(bout.redId) ?? 0) + 1);
          counts.set(bout.greenId, (counts.get(bout.greenId) ?? 0) + 1);
          opponents.set(bout.redId, [...(opponents.get(bout.redId) ?? []), bout.greenId]);
          opponents.set(bout.greenId, [...(opponents.get(bout.greenId) ?? []), bout.redId]);
          keys.add(pairKey(bout.redId, bout.greenId));
        }
        setBaselineMatchCounts(counts);
        setBaselineOpponentIds(opponents);
        setBaselineBoutKeys(keys);
      })
      .catch((err) => {
        if (cancelled) return;
        setBaselineMatchCounts(new Map());
        setBaselineOpponentIds(new Map());
        setBaselineBoutKeys(new Set());
        setBaselineError(err instanceof Error ? err.message : "Unable to load Check-in checkpoint.");
      })
      .finally(() => {
        if (!cancelled) setBaselineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkpoints, meetId]);

  const teamRoster = wrestlers
    .filter((wrestler) => wrestler.teamId === activeTeamId && isScratchRosterStatus(wrestler.status))
    .sort((a, b) => {
      const last = a.last.localeCompare(b.last, undefined, { sensitivity: "base" });
      if (last !== 0) return last;
      return a.first.localeCompare(b.first, undefined, { sensitivity: "base" });
    });
  const filteredTeamRoster = teamRoster.filter((wrestler) =>
    fuzzyMatches(`${wrestler.first} ${wrestler.last}`, scratchSearch),
  );

  const replacementRows = wrestlers
    .filter((wrestler) => isReplacementEligible(wrestler.status))
    .map((wrestler) => {
      const matches = matchCounts.get(wrestler.id) ?? 0;
      const baselineMatches = baselineMatchCounts.get(wrestler.id) ?? 0;
      return {
        wrestler,
        matches,
        baselineMatches,
        lostMatches: Math.max(0, baselineMatches - matches),
      };
    })
    .filter((row) => row.lostMatches > 0)
    .filter((row) => targetMatchesPerWrestler === null || row.matches < targetMatchesPerWrestler)
    .sort((a, b) => {
      if (a.lostMatches !== b.lostMatches) return b.lostMatches - a.lostMatches;
      if (targetMatchesPerWrestler !== null) {
        const aNeeded = Math.max(0, targetMatchesPerWrestler - a.matches);
        const bNeeded = Math.max(0, targetMatchesPerWrestler - b.matches);
        if (aNeeded !== bNeeded) return bNeeded - aNeeded;
      }
      if (a.matches !== b.matches) return a.matches - b.matches;
      const last = a.wrestler.last.localeCompare(b.wrestler.last, undefined, { sensitivity: "base" });
      if (last !== 0) return last;
      return a.wrestler.first.localeCompare(b.wrestler.first, undefined, { sensitivity: "base" });
    });

  useEffect(() => {
    if (!selectedNeedsWrestlerId) {
      setSelectedNeedsWrestlerId(replacementRows[0]?.wrestler.id ?? null);
      return;
    }
    if (replacementRows.some((row) => row.wrestler.id === selectedNeedsWrestlerId)) return;
    setSelectedNeedsWrestlerId(replacementRows[0]?.wrestler.id ?? null);
  }, [replacementRows, selectedNeedsWrestlerId]);

  useEffect(() => {
    if (!selectedDetailWrestlerId) {
      setSelectedDetailWrestlerId(replacementRows[0]?.wrestler.id ?? null);
      return;
    }
    if (wrestlerMap.has(selectedDetailWrestlerId)) return;
    setSelectedDetailWrestlerId(replacementRows[0]?.wrestler.id ?? null);
  }, [replacementRows, selectedDetailWrestlerId, wrestlerMap]);

  const selectedWrestler = selectedDetailWrestlerId ? wrestlerMap.get(selectedDetailWrestlerId) ?? null : null;
  const selectedReplacement = replacementRows.find((row) => row.wrestler.id === selectedDetailWrestlerId) ?? null;
  const selectedReplacementId = selectedReplacement?.wrestler.id ?? null;
  const selectedTeam = selectedWrestler ? teamMap.get(selectedWrestler.teamId) ?? null : null;
  useEffect(() => {
    if (!selectedReplacementId) {
      setCandidateRows([]);
      setCandidateError(null);
      return;
    }
    let cancelled = false;
    setCandidateLoading(true);
    setCandidateError(null);
    const params = new URLSearchParams({
      wrestlerId: selectedReplacementId,
      limit: "20",
      enforceAgeGap: String(settings.enforceAgeGapCheck),
      enforceWeightCheck: String(settings.enforceWeightCheck),
      firstYearOnlyWithFirstYear: String(settings.firstYearOnlyWithFirstYear),
      allowSameTeamMatches: String(settings.allowSameTeamMatches),
      girlsWrestleGirls: String(settings.girlsWrestleGirls),
    });
    fetch(`/api/meets/${meetId}/candidates?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Unable to load candidates.");
        }
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setCandidateRows(Array.isArray(payload?.candidates) ? payload.candidates : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setCandidateRows([]);
        setCandidateError(err instanceof Error ? err.message : "Unable to load candidates.");
      })
      .finally(() => {
        if (!cancelled) setCandidateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    candidateRefreshVersion,
    meetId,
    selectedReplacementId,
    settings.allowSameTeamMatches,
    settings.enforceAgeGapCheck,
    settings.enforceWeightCheck,
    settings.firstYearOnlyWithFirstYear,
    settings.girlsWrestleGirls,
  ]);
  const newMatches = bouts
    .filter((bout) => !baselineBoutKeys.has(pairKey(bout.redId, bout.greenId)))
    .map((bout) => ({
      bout,
      red: wrestlerMap.get(bout.redId),
      green: wrestlerMap.get(bout.greenId),
    }))
    .sort((a, b) => {
      const matDiff = (a.bout.mat ?? 999) - (b.bout.mat ?? 999);
      if (matDiff !== 0) return matDiff;
      const orderDiff = (a.bout.order ?? 999) - (b.bout.order ?? 999);
      if (orderDiff !== 0) return orderDiff;
      const createdAtDiff = new Date(b.bout.createdAt ?? 0).getTime() - new Date(a.bout.createdAt ?? 0).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.bout.id.localeCompare(b.bout.id);
    });
  const currentBouts = selectedWrestler
    ? bouts
        .filter((bout) => bout.redId === selectedWrestler.id || bout.greenId === selectedWrestler.id)
        .sort((a, b) => {
          const matDiff = (a.mat ?? 999) - (b.mat ?? 999);
          if (matDiff !== 0) return matDiff;
          return (a.order ?? 999) - (b.order ?? 999);
        })
    : [];

  const currentMatchRows = selectedWrestler
    ? currentBouts.map((bout) => {
        const opponentId = bout.redId === selectedWrestler.id ? bout.greenId : bout.redId;
        return {
          bout,
          opponentId,
          opponent: wrestlerMap.get(opponentId),
          signedScore:
            typeof bout.pairingScore === "number"
              ? (bout.redId === selectedWrestler.id ? bout.pairingScore : -bout.pairingScore)
              : Number.NaN,
          boutOrder: (bout.mat ?? 0) * 100 + (bout.order ?? 0),
        };
      })
    : [];

  const currentSorted = [...currentMatchRows].sort((a, b) => {
    const getValue = (row: (typeof currentMatchRows)[number]) => {
      const opponent = row.opponent;
      if (currentSort.key === "bout") return row.boutOrder;
      if (currentSort.key === "score") return Math.abs(row.signedScore);
      if (currentSort.key === "last") return opponent?.last ?? "";
      if (currentSort.key === "first") return opponent?.first ?? "";
      if (currentSort.key === "team") return teamSymbol(opponent?.teamId);
      if (currentSort.key === "girl") return opponent?.isGirl ? 0 : 1;
      if (currentSort.key === "age") return ageYears(opponent?.birthdate) ?? null;
      if (currentSort.key === "weight") return opponent?.weight ?? null;
      if (currentSort.key === "exp") return opponent?.experienceYears ?? null;
      if (currentSort.key === "skill") return opponent?.skill ?? null;
      if (currentSort.key === "matches") return matchCounts.get(row.opponentId) ?? 0;
      if (currentSort.key === "source") return row.bout.sourceUser?.username ?? "Auto";
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), currentSort.dir);
  });

  const availableFiltered = candidateRows
    .filter((row) => !currentBouts.some((bout) => (
      (bout.redId === row.opponent.id && bout.greenId === selectedReplacement?.wrestler.id) ||
      (bout.greenId === row.opponent.id && bout.redId === selectedReplacement?.wrestler.id)
    )))
    .map((row) => ({ opponent: row.opponent, score: row.score }));

  const availableSorted = [...availableFiltered].sort((a, b) => {
    const getValue = (row: (typeof availableFiltered)[number]) => {
      const opponent = row.opponent;
      if (availableSort.key === "score") return Math.abs(row.score);
      if (availableSort.key === "last") return opponent.last;
      if (availableSort.key === "first") return opponent.first;
      if (availableSort.key === "team") return teamSymbol(opponent.teamId);
      if (availableSort.key === "girl") return opponent.isGirl ? 0 : 1;
      if (availableSort.key === "age") return ageYears(opponent.birthdate) ?? null;
      if (availableSort.key === "weight") return opponent.weight;
      if (availableSort.key === "exp") return opponent.experienceYears;
      if (availableSort.key === "skill") return opponent.skill;
      if (availableSort.key === "matches") return matchCounts.get(opponent.id) ?? 0;
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), availableSort.dir);
  });

  const availableDisplay = availableSorted.slice(0, 20);

  function toggleSort(setter: React.Dispatch<React.SetStateAction<SortState>>, key: string) {
    setter((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  async function refreshScratchData() {
    await onRefresh();
    setCandidateRefreshVersion((version) => version + 1);
  }

  async function runManagedRequest(makeRequest: () => Promise<Response>, fallbackError: string) {
    if (!(await onEnsureLock())) {
      throw new Error("Meet lock required");
    }
    let response = await makeRequest();
    let payload = response.ok ? null : await response.clone().json().catch(() => null);
    if (!response.ok && payload?.error === "Meet lock required") {
      if (!(await onEnsureLock())) {
        throw new Error("Meet lock required");
      }
      response = await makeRequest();
      payload = response.ok ? null : await response.clone().json().catch(() => null);
    }
    if (!response.ok) {
      throw new Error(payload?.error ?? fallbackError);
    }
    return response;
  }

  async function updateScratch(wrestlerId: string, absent: boolean) {
    setNotice(null);
    setScratchLoadingId(wrestlerId);
    try {
      const response = await runManagedRequest(
        () => fetch(`/api/meets/${meetId}/scratches`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wrestlerId, absent }),
        }),
        "Unable to update scratch status.",
      );
      const payload = await response.json().catch(() => null);
      await refreshScratchData();
      setNotice(
        absent
          ? `Removed ${payload?.deletedBouts ?? 0} scheduled bout${payload?.deletedBouts === 1 ? "" : "s"}.`
          : `Wrestler restored to coming${typeof payload?.restoredBouts === "number" && payload.restoredBouts > 0
            ? ` and ${payload.restoredBouts} checkpoint bout${payload.restoredBouts === 1 ? "" : "s"}`
            : ""}${typeof payload?.assignedBouts === "number" && payload.assignedBouts > 0
            ? ` (${payload.assignedBouts} mat assignment${payload.assignedBouts === 1 ? "" : "s"} updated)`
            : ""}.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to update scratch status.");
    } finally {
      setScratchLoadingId(null);
    }
  }

  async function addReplacementMatch(opponentId: string) {
    if (!selectedReplacement) return;
    setNotice(null);
    setAddLoadingId(opponentId);
    try {
      await runManagedRequest(
        () => fetch(`/api/meets/${meetId}/pairings/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ redId: selectedReplacement.wrestler.id, greenId: opponentId }),
        }),
        "Unable to add replacement match.",
      );
      await refreshScratchData();
      setNotice("Replacement match added.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to add replacement match.");
    } finally {
      setAddLoadingId(null);
    }
  }

  async function removeReplacementMatch(boutId: string) {
    setNotice(null);
    setRemoveLoadingId(boutId);
    try {
      const response = await runManagedRequest(
        () => fetch(`/api/bouts/${boutId}`, { method: "DELETE" }),
        "Unable to remove match.",
      );
      const payload = await response.json().catch(() => null);
      await refreshScratchData();
      setNotice("Match removed.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to remove match.");
    } finally {
      setRemoveLoadingId(null);
    }
  }

  async function runAutoPairings() {
    setNotice(null);
    setAutoPairingLoading(true);
    try {
      const response = await runManagedRequest(
        () => fetch(`/api/meets/${meetId}/scratches/auto-pairings`, {
          method: "POST",
        }),
        "Unable to run scratch auto-pairings.",
      );
      const payload = await response.json().catch(() => null);
      await refreshScratchData();
      const message = Array.isArray(payload?.changeMessages) && payload.changeMessages.length > 0
        ? payload.changeMessages.join(" ")
        : payload?.created > 0
          ? `Generated ${payload.created} replacement bout${payload.created === 1 ? "" : "s"}.`
          : "No replacement matches were found.";
      setNotice(message);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to run scratch auto-pairings.");
    } finally {
      setAutoPairingLoading(false);
    }
  }

  const activeTeam = orderedTeams.find((team) => team.id === activeTeamId) ?? null;
  const sharedColumnWidths = {
    last: 110,
    first: 95,
    girl: 45,
    age: 60,
    weight: 60,
    exp: 45,
    skill: 45,
    score: 70,
    matches: 70,
  };
  const currentColumnWidths = [
    sharedColumnWidths.last,
    sharedColumnWidths.first,
    70,
    sharedColumnWidths.girl,
    sharedColumnWidths.age,
    sharedColumnWidths.weight,
    sharedColumnWidths.exp,
    sharedColumnWidths.skill,
    sharedColumnWidths.score,
    sharedColumnWidths.matches,
    66,
    80,
  ];
  const availableColumnWidths = [
    sharedColumnWidths.last,
    sharedColumnWidths.first,
    70,
    sharedColumnWidths.girl,
    sharedColumnWidths.age,
    sharedColumnWidths.weight,
    sharedColumnWidths.exp,
    sharedColumnWidths.skill,
    sharedColumnWidths.score,
    sharedColumnWidths.matches,
  ];
  const currentColumnDefs = [
    { label: "Last", key: "last" },
    { label: "First", key: "first" },
    { label: "Team", key: "team" },
    { label: "Girl", key: "girl" },
    { label: "Age", key: "age" },
    { label: "Weight", key: "weight" },
    { label: "Exp", key: "exp" },
    { label: "Skill", key: "skill" },
    { label: "\u0394", key: "score" },
    { label: "Matches", key: "matches" },
    { label: "Bout #", key: "bout" },
    { label: "Added By", key: "source" },
  ] as const;
  const availableColumnDefs = [
    { label: "Last", key: "last" },
    { label: "First", key: "first" },
    { label: "Team", key: "team" },
    { label: "Girl", key: "girl" },
    { label: "Age", key: "age" },
    { label: "Weight", key: "weight" },
    { label: "Exp", key: "exp" },
    { label: "Skill", key: "skill" },
    { label: "\u0394", key: "score" },
    { label: "Matches", key: "matches" },
  ] as const;
  const newMatchesColumnWidths = [230, 230, 78, 70, 96];
  const pairingsTableStyle = {
    borderCollapse: "collapse" as const,
    width: "fit-content",
    maxWidth: "100%",
    tableLayout: "fixed" as const,
    fontSize: 14,
  };
  const pairingsHeaderCellStyle = {
    padding: "3px 18px 3px 6px",
    borderBottom: "1px solid #e1e7ef",
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
    position: "relative" as const,
  };
  const pairingsBodyCellStyle = {
    padding: "3px 6px",
    lineHeight: 1.2,
  };

  return (
    <section
      className="panel fill"
      style={{
        display: "grid",
        gap: 14,
        padding: 16,
        height: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h3 className="panel-title" style={{ marginBottom: 4 }}>Scratches</h3>
          <div
            style={{
              minHeight: 22,
              fontSize: 14,
              lineHeight: "22px",
              color: "#5a6673",
            }}
          >
            {notice ?? " "}
          </div>
        </div>
        {!canManage && (
          <div className="notice" style={{ margin: 0 }}>
            Start editing as the Meet Coordinator or admin to manage scratches.
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(360px, 500px) minmax(640px, 1fr)",
          gap: 16,
          alignItems: "stretch",
          height: "calc(100dvh - 220px)",
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            gap: 10,
            height: "100%",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {orderedTeams.map((team) => {
              const active = team.id === activeTeamId;
              const teamColorValue = team.color ?? "#7a1738";
              const textColor = active ? "#ffffff" : adjustTeamTextColor(teamColorValue);
              return (
                <button
                  key={team.id}
                  type="button"
                  className="team-chip-btn"
                  onClick={() => setActiveTeamId(team.id)}
                  style={{
                    background: active ? teamColorValue : "#ffffff",
                    color: textColor,
                    border: `1px solid ${teamColorValue}`,
                    borderBottomWidth: active ? 3 : 1,
                    padding: "8px 14px",
                    borderRadius: "10px 10px 0 0",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {team.symbol || team.name}
                </button>
              );
            })}
          </div>
          <div
            style={{
              border: "1px solid #d5dbe2",
              borderRadius: 12,
              background: "#ffffff",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e8ee", fontWeight: 700, color: activeTeam?.color ? adjustTeamTextColor(activeTeam.color) : "#1d232b" }}>
              {activeTeam ? formatTeamName(activeTeam) : "Team"}
            </div>
            <div style={{ padding: 10, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
              <input
                type="text"
                value={scratchSearch}
                onChange={(event) => setScratchSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  setScratchSearch("");
                }}
                placeholder="Search"
                aria-label="Scratch roster search"
                style={{ width: "100%", marginBottom: 6, padding: "3px 6px", fontSize: 13 }}
              />
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "#f6fbf6",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <table cellPadding={4} style={{ ...pairingsTableStyle, width: "100%", flex: "0 0 auto" }}>
                  <colgroup>
                    <col style={{ width: 190 }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#f7f9fc" }}>
                      <th align="left" style={pairingsHeaderCellStyle}>Name</th>
                      <th align="left" style={pairingsHeaderCellStyle}>Opponents</th>
                    </tr>
                  </thead>
                </table>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 4 }}>
                  {filteredTeamRoster.length === 0 && (
                    <div style={{ color: "#5a6673", fontSize: 13, padding: "6px 4px" }}>
                      {teamRoster.length === 0 ? "No scheduled wrestlers on this team." : "No wrestlers match this search."}
                    </div>
                  )}
                  {filteredTeamRoster.length > 0 && (
                    <table cellPadding={4} style={{ ...pairingsTableStyle, width: "100%" }}>
                      <colgroup>
                        <col style={{ width: 190 }} />
                        <col />
                      </colgroup>
                      <tbody>
                        {filteredTeamRoster.map((wrestler) => {
                          const absent = wrestler.status === "ABSENT";
                          const loading = scratchLoadingId === wrestler.id;
                          const isLate = wrestler.status === "LATE";
                          const isEarly = wrestler.status === "EARLY";
                          const beforeOpponents = baselineOpponentsText(wrestler.id);
                          const rowBackground = absent
                            ? "#f8eded"
                            : isLate
                              ? "#dff1ff"
                              : isEarly
                                ? "#f3eadf"
                                : "#e6f7e6";
                          const rowBorder = absent
                            ? "#dfc1c1"
                            : isLate
                              ? "#b6defc"
                              : isEarly
                                ? "#e2c8ad"
                                : "#c7ddc7";
                          return (
                            <tr
                              key={wrestler.id}
                              style={{
                                background: rowBackground,
                                borderTop: `1px solid ${rowBorder}`,
                              }}
                            >
                              <td style={{ ...pairingsBodyCellStyle, color: teamTextColor(wrestler.teamId) }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {wrestler.first} {wrestler.last}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void updateScratch(wrestler.id, !absent)}
                                    disabled={!canManage || loading}
                                    style={{
                                      border: `1px solid ${absent ? "#bcd8c1" : "#d0b2b2"}`,
                                      borderRadius: 4,
                                      background: absent ? "#e6f6ea" : "#fff7f7",
                                      color: absent ? "#1d5b2a" : "#7a3d3d",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      padding: "1px 6px",
                                      cursor: !canManage || loading ? "default" : "pointer",
                                      whiteSpace: "nowrap",
                                      flex: "0 0 auto",
                                    }}
                                    title={absent ? "Restore wrestler to coming" : "Scratch wrestler"}
                                  >
                                    {loading ? "Saving..." : absent ? "Restore" : "Scratch"}
                                  </button>
                                </div>
                              </td>
                              <td
                                style={{
                                  ...pairingsBodyCellStyle,
                                  color: "#5a6673",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                title={beforeOpponents}
                              >
                                {beforeOpponents}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
            gridTemplateRows: "minmax(260px, 38dvh) minmax(0, 1fr)",
            gap: 12,
            alignSelf: "stretch",
            height: "100%",
            minHeight: 0,
          }}
        >
          <div
            style={{
              border: "1px solid #d5dbe2",
              borderRadius: 12,
              background: "#ffffff",
              overflow: "hidden",
              gridColumn: 1,
              gridRow: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e8ee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>Needs matches due to scratches</div>
              <button
                type="button"
                className="nav-btn secondary"
                onClick={() => void runAutoPairings()}
                disabled={!canManage || baselineLoading || Boolean(baselineError) || replacementRows.length === 0 || autoPairingLoading}
              >
                {autoPairingLoading ? "Running..." : "Auto pair for scratches"}
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gap: 8 }}>
                {baselineLoading && (
                  <div style={{ color: "#5a6673", fontSize: 13 }}>Loading Check-in checkpoint...</div>
                )}
                {!baselineLoading && baselineError && (
                  <div style={{ color: "#5a6673", fontSize: 13 }}>{baselineError}</div>
                )}
                {!baselineLoading && !baselineError && replacementRows.length === 0 && (
                  <div style={{ color: "#5a6673", fontSize: 13 }}>
                    {targetMatchesPerWrestler === null
                      ? "No wrestlers have lost matches since Check-in."
                      : `No wrestlers are below the ${targetMatchesPerWrestler}-match minimum.`}
                  </div>
                )}
                {!baselineLoading && !baselineError && replacementRows.length > 0 && (
                  <div style={{ border: "1px solid #d5dbe2", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                    <table cellPadding={4} style={{ ...pairingsTableStyle, width: "100%" }}>
                      <colgroup>
                        <col />
                        <col style={{ width: 72 }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: "#f7f9fc" }}>
                          <th align="left" style={pairingsHeaderCellStyle}>Name</th>
                          <th align="left" style={pairingsHeaderCellStyle}>Matches</th>
                        </tr>
                      </thead>
                      <tbody>
                        {replacementRows.map((row) => {
                          const selected = row.wrestler.id === selectedDetailWrestlerId;
                          const team = teamMap.get(row.wrestler.teamId) ?? null;
                          return (
                            <tr
                              key={row.wrestler.id}
                              onClick={() => {
                                setSelectedNeedsWrestlerId(row.wrestler.id);
                                setSelectedDetailWrestlerId(row.wrestler.id);
                              }}
                              style={{
                                borderTop: "1px solid #eee",
                                background: selected ? "#f2f8ff" : "#ffffff",
                                cursor: "pointer",
                              }}
                            >
                              <td
                                style={{
                                  ...pairingsBodyCellStyle,
                                  color: teamTextColor(row.wrestler.teamId),
                                  fontWeight: selected ? 700 : 500,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {wrestlerName(row.wrestler)}
                                {team ? ` (${team.symbol || team.name})` : ""}
                              </td>
                              <td
                                style={{
                                  ...pairingsBodyCellStyle,
                                  fontVariantNumeric: "tabular-nums",
                                  color: "#243041",
                                  fontWeight: selected ? 700 : 500,
                                  background: row.matches === 0 ? "#fff7cc" : undefined,
                                }}
                              >
                                {row.matches}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ display: "none" }}>
                {!selectedWrestler && (
                  <div style={{ color: "#5a6673", fontSize: 13 }}>Select a wrestler to review current and replacement matches.</div>
                )}
                {selectedWrestler && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 18,
                          color: teamTextColor(selectedWrestler.teamId),
                          background: "#f7f9fc",
                          border: "1px solid #d7dee8",
                          borderRadius: 10,
                          padding: "6px 10px",
                          minWidth: 0,
                        }}
                      >
                        {wrestlerName(selectedWrestler)}
                        {selectedTeam ? ` (${selectedTeam.symbol || selectedTeam.name})` : ""}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#444",
                          flexWrap: "wrap",
                          minWidth: 0,
                        }}
                      >
                        <span>
                          Age: <span style={{ color: sexColor(selectedWrestler.isGirl) }}>{ageYears(selectedWrestler.birthdate)?.toFixed(1) ?? "—"}</span>
                        </span>
                        <span>Weight: {selectedWrestler.weight}</span>
                        <span>Exp: {selectedWrestler.experienceYears}</span>
                        <span>Skill: {selectedWrestler.skill}</span>
                        <span
                          style={{ fontSize: 14, fontWeight: 600, color: "#5a6673" }}
                          title={lostScratchOpponentsText(selectedWrestler.id)}
                        >
                          Lost matches: {lostScratchOpponentsText(selectedWrestler.id)}
                        </span>
                      </div>
                    </div>

                    {!selectedReplacement && (
                      <div style={{ color: "#5a6673", fontSize: 13 }}>
                        This wrestler is not currently below the match minimum.
                      </div>
                    )}

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ border: "1px solid #d7dee8", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ maxHeight: "24dvh", overflow: "auto" }}>
                          <table cellPadding={4} style={pairingsTableStyle}>
                            <colgroup>
                              {currentColumnWidths.map((width, index) => (
                                <col key={`current-col-${index}`} style={{ width }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr style={{ background: "#f7f9fc" }}>
                                {currentColumnDefs.map((column) => (
                                  <th
                                    key={column.key}
                                    align={column.key === "score" ? "center" : "left"}
                                    style={pairingsHeaderCellStyle}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleSort(setCurrentSort, column.key)}
                                      style={{ all: "unset", cursor: "pointer" }}
                                    >
                                      {column.label}
                                      {sortIndicator(currentSort, column.key)}
                                    </button>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {currentSorted.length === 0 && (
                                <tr>
                                  <td colSpan={12} style={{ ...pairingsBodyCellStyle, color: "#666" }}>None</td>
                                </tr>
                              )}
                              {currentSorted.map(({ bout, opponentId, opponent, signedScore }) => {
                                const opponentColor = opponent ? teamTextColor(opponent.teamId) : undefined;
                                const sourceColor = bout.sourceUser?.teamColor ?? null;
                                const sourceText = sourceColor ? contrastTextColor(sourceColor) : "#6a7483";
                                const sourceBackground = sourceColor ?? "#f7f9fc";
                                const sourceBorder = sourceColor ?? "#e4e9f2";
                                return (
                                  <tr
                                    key={bout.id}
                                    onClick={() => {
                                      if (!canManage || removeLoadingId === bout.id) return;
                                      void removeReplacementMatch(bout.id);
                                    }}
                                    style={{
                                      borderTop: "1px solid #eee",
                                      cursor: canManage ? "pointer" : "default",
                                      background: removeLoadingId === bout.id ? "#faf7f2" : "#ffffff",
                                    }}
                                    title={canManage ? "Click to remove this match." : undefined}
                                  >
                                    <td style={{ ...pairingsBodyCellStyle, color: opponentColor }}>{opponent?.last ?? ""}</td>
                                    <td style={{ ...pairingsBodyCellStyle, color: opponentColor }}>{opponent?.first ?? ""}</td>
                                    <td style={pairingsBodyCellStyle}>
                                      {opponent && (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                          <span style={{ width: 10, height: 10, background: teamColor(opponent.teamId), display: "inline-block" }} />
                                          {teamSymbol(opponent.teamId)}
                                        </span>
                                      )}
                                    </td>
                                    <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent?.isGirl) }}>{opponent?.isGirl ? "Yes" : "No"}</td>
                                    <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent?.isGirl) }}>{ageYears(opponent?.birthdate)?.toFixed(1) ?? ""}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>{opponent?.weight ?? ""}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>{opponent?.experienceYears ?? ""}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>{opponent?.skill ?? ""}</td>
                                    <td align="left" style={{ ...pairingsBodyCellStyle, color: Number.isFinite(signedScore) ? deltaColor(signedScore) : undefined }}>
                                      {Number.isFinite(signedScore) ? signedScore.toFixed(2) : ""}
                                    </td>
                                    <td align="left" style={pairingsBodyCellStyle}>{matchCounts.get(opponentId) ?? 0}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>{formatBoutNumber(bout.mat, bout.order)}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>
                                      <span
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          letterSpacing: "0.2px",
                                          color: sourceText,
                                          background: sourceBackground,
                                          border: `1px solid ${sourceBorder}`,
                                          padding: "1px 6px",
                                          borderRadius: 999,
                                          display: "inline-flex",
                                          alignItems: "center",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {removeLoadingId === bout.id ? "Removing..." : (bout.sourceUser?.username ?? "Auto")}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#243041" }}>
                        Possible additional matches:
                      </h3>
                      <div style={{ border: "1px solid #d7dee8", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ maxHeight: "28dvh", overflow: "auto" }}>
                          <table cellPadding={4} style={pairingsTableStyle}>
                            <colgroup>
                              {availableColumnWidths.map((width, index) => (
                                <col key={`available-col-${index}`} style={{ width }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr style={{ background: "#f7f9fc" }}>
                                {availableColumnDefs.map((column) => (
                                  <th
                                    key={column.key}
                                    align={column.key === "score" ? "center" : "left"}
                                    style={pairingsHeaderCellStyle}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleSort(setAvailableSort, column.key)}
                                      style={{ all: "unset", cursor: "pointer" }}
                                    >
                                      {column.label}
                                      {sortIndicator(availableSort, column.key)}
                                    </button>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {candidateLoading && (
                                <tr>
                                  <td colSpan={10} style={{ ...pairingsBodyCellStyle, color: "#5a6673" }}>Loading candidates...</td>
                                </tr>
                              )}
                              {!candidateLoading && candidateError && (
                                <tr>
                                  <td colSpan={10} style={{ ...pairingsBodyCellStyle, color: "#b00020" }}>{candidateError}</td>
                                </tr>
                              )}
                              {!candidateLoading && !candidateError && availableDisplay.length === 0 && (
                                <tr>
                                  <td colSpan={10} style={{ ...pairingsBodyCellStyle, color: "#666" }}>
                                    {selectedReplacement
                                      ? "No candidates available right now."
                                      : "This wrestler does not currently need a replacement match."}
                                  </td>
                                </tr>
                              )}
                              {!candidateLoading && !candidateError && availableDisplay.map(({ opponent, score }) => {
                                const matches = matchCounts.get(opponent.id) ?? 0;
                                const loading = addLoadingId === opponent.id;
                                return (
                                  <tr
                                    key={opponent.id}
                                    onClick={() => {
                                      if (!canManage || loading) return;
                                      void addReplacementMatch(opponent.id);
                                    }}
                                    style={{
                                      borderTop: "1px solid #eee",
                                      cursor: canManage ? "pointer" : "default",
                                      background: loading ? "#eef6ff" : "#ffffff",
                                    }}
                                    title={canManage ? "Click to add this match." : undefined}
                                  >
                                    <td style={{ ...pairingsBodyCellStyle, color: teamTextColor(opponent.teamId) }}>{opponent.last}</td>
                                    <td style={{ ...pairingsBodyCellStyle, color: teamTextColor(opponent.teamId) }}>{opponent.first}</td>
                                    <td style={pairingsBodyCellStyle}>
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 10, height: 10, background: teamColor(opponent.teamId), display: "inline-block" }} />
                                        {teamSymbol(opponent.teamId)}
                                      </span>
                                    </td>
                                    <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent.isGirl) }}>{opponent.isGirl ? "Yes" : "No"}</td>
                                    <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent.isGirl) }}>{ageYears(opponent.birthdate)?.toFixed(1) ?? ""}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>{opponent.weight}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>{opponent.experienceYears}</td>
                                    <td align="left" style={pairingsBodyCellStyle}>{opponent.skill}</td>
                                    <td align="left" style={{ ...pairingsBodyCellStyle, color: Number.isFinite(score) ? deltaColor(score) : undefined }}>
                                      {loading ? "Adding..." : Number.isFinite(score) ? score.toFixed(2) : ""}
                                    </td>
                                    <td align="left" style={pairingsBodyCellStyle}>{matches}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div
                        style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.enforceAgeGapCheck}
                            onChange={(e) => {
                              const enforceAgeGapCheck = e.target.checked;
                              setSettings((current) => ({ ...current, enforceAgeGapCheck }));
                            }}
                          />{" "}
                          Enforce Age check
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.enforceWeightCheck}
                            onChange={(e) => {
                              const enforceWeightCheck = e.target.checked;
                              setSettings((current) => ({ ...current, enforceWeightCheck }));
                            }}
                          />{" "}
                          Enforce Weight check
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.firstYearOnlyWithFirstYear}
                            onChange={(e) => {
                              const firstYearOnlyWithFirstYear = e.target.checked;
                              setSettings((current) => ({ ...current, firstYearOnlyWithFirstYear }));
                            }}
                          />{" "}
                          First-year only rule
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.girlsWrestleGirls}
                            onChange={(e) => {
                              const girlsWrestleGirls = e.target.checked;
                              setSettings((current) => ({ ...current, girlsWrestleGirls }));
                            }}
                          />{" "}
                          Girls wrestle girls
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.allowSameTeamMatches}
                            onChange={(e) => {
                              const allowSameTeamMatches = e.target.checked;
                              setSettings((current) => ({ ...current, allowSameTeamMatches }));
                            }}
                          />{" "}
                          Include same team
                        </label>
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: "#666" }}>
                      Note: Click a row to add or remove a match.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #d5dbe2",
              borderRadius: 12,
              background: "#ffffff",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              gridColumn: 2,
              gridRow: 1,
            }}
          >
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e8ee", fontWeight: 700 }}>
                New matches
              </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
              {baselineLoading && (
                <div style={{ color: "#5a6673", fontSize: 13 }}>Loading Check-in checkpoint...</div>
              )}
              {!baselineLoading && baselineError && (
                <div style={{ color: "#5a6673", fontSize: 13 }}>{baselineError}</div>
              )}
              {!baselineLoading && !baselineError && newMatches.length === 0 && (
                <div style={{ color: "#5a6673", fontSize: 13 }}>No new matches have been added.</div>
              )}
              {!baselineLoading && !baselineError && newMatches.length > 0 && (
                <div style={{ border: "1px solid #d5dbe2", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                  <table cellPadding={4} style={pairingsTableStyle}>
                    <colgroup>
                      {newMatchesColumnWidths.map((width, index) => (
                        <col key={`new-matches-col-${index}`} style={{ width }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr style={{ background: "#f7f9fc" }}>
                        <th align="left" style={pairingsHeaderCellStyle}>Wrestler 1</th>
                        <th align="left" style={pairingsHeaderCellStyle}>Wrestler 2</th>
                        <th align="left" style={pairingsHeaderCellStyle}>Bout #</th>
                        <th align="left" style={pairingsHeaderCellStyle}>Δ</th>
                        <th align="left" style={pairingsHeaderCellStyle}>Added By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newMatches.map(({ bout, red, green }) => {
                        const addedBy = bout.sourceUser?.username ?? "Auto";
                        const sourceColor = bout.sourceUser?.teamColor ?? null;
                        const sourceText = sourceColor ? contrastTextColor(sourceColor) : "#6a7483";
                        const sourceBackground = sourceColor ?? "#f7f9fc";
                        const sourceBorder = sourceColor ?? "#e4e9f2";
                        const redSelected = red?.id === selectedDetailWrestlerId;
                        const greenSelected = green?.id === selectedDetailWrestlerId;
                        const redLabel = red ? `${wrestlerName(red)}${teamSymbol(red.teamId) ? ` (${teamSymbol(red.teamId)})` : ""}` : bout.redId;
                        const greenLabel = green ? `${wrestlerName(green)}${teamSymbol(green.teamId) ? ` (${teamSymbol(green.teamId)})` : ""}` : bout.greenId;
                        return (
                          <tr key={bout.id} style={{ borderTop: "1px solid #eee" }}>
                            <td
                              onClick={() => {
                                if (red) setSelectedDetailWrestlerId(red.id);
                              }}
                              style={{
                                ...pairingsBodyCellStyle,
                                color: red ? teamTextColor(red.teamId) : undefined,
                                background: redSelected ? "#f2f8ff" : undefined,
                                cursor: red ? "pointer" : "default",
                              }}
                              title={redLabel}
                            >
                              {red ? (
                                <span
                                  style={{
                                    display: "block",
                                    fontWeight: redSelected ? 700 : 500,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                  title={`Show ${redLabel}`}
                                >
                                  {redLabel}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: "block",
                                    fontWeight: redSelected ? 700 : 500,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {redLabel}
                                </span>
                              )}
                            </td>
                            <td
                              onClick={() => {
                                if (green) setSelectedDetailWrestlerId(green.id);
                              }}
                              style={{
                                ...pairingsBodyCellStyle,
                                color: green ? teamTextColor(green.teamId) : undefined,
                                background: greenSelected ? "#f2f8ff" : undefined,
                                cursor: green ? "pointer" : "default",
                              }}
                              title={greenLabel}
                            >
                              {green ? (
                                <span
                                  style={{
                                    display: "block",
                                    fontWeight: greenSelected ? 700 : 500,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                  title={`Show ${greenLabel}`}
                                >
                                  {greenLabel}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: "block",
                                    fontWeight: greenSelected ? 700 : 500,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {greenLabel}
                                </span>
                              )}
                            </td>
                            <td style={pairingsBodyCellStyle}>{formatBoutNumber(bout.mat, bout.order)}</td>
                            <td
                              style={{
                                ...pairingsBodyCellStyle,
                                color: typeof bout.pairingScore === "number" ? deltaColor(bout.pairingScore) : undefined,
                              }}
                            >
                              {typeof bout.pairingScore === "number" ? bout.pairingScore.toFixed(2) : ""}
                            </td>
                            <td style={pairingsBodyCellStyle}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: "0.2px",
                                  color: sourceText,
                                  background: sourceBackground,
                                  border: `1px solid ${sourceBorder}`,
                                  padding: "1px 6px",
                                  borderRadius: 999,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {addedBy}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              border: "1px solid #d5dbe2",
              borderRadius: 12,
              background: "#ffffff",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              gridColumn: "1 / span 2",
              gridRow: 2,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, padding: 12, display: "grid", gap: 6, alignContent: "start" }}>
              {!selectedWrestler && (
                <div style={{ color: "#5a6673", fontSize: 13 }}>Select a wrestler to review current and replacement matches.</div>
              )}
              {selectedWrestler && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 18,
                        color: teamTextColor(selectedWrestler.teamId),
                        background: "#f7f9fc",
                        border: "1px solid #d7dee8",
                        borderRadius: 10,
                        padding: "6px 10px",
                        minWidth: 0,
                      }}
                    >
                      {wrestlerName(selectedWrestler)}
                      {selectedTeam ? ` (${selectedTeam.symbol || selectedTeam.name})` : ""}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#444",
                        flexWrap: "wrap",
                        minWidth: 0,
                      }}
                    >
                      <span>
                        Age: <span style={{ color: sexColor(selectedWrestler.isGirl) }}>{ageYears(selectedWrestler.birthdate)?.toFixed(1) ?? "â€”"}</span>
                      </span>
                      <span>Weight: {selectedWrestler.weight}</span>
                      <span>Exp: {selectedWrestler.experienceYears}</span>
                      <span>Skill: {selectedWrestler.skill}</span>
                      <span
                        style={{ fontSize: 14, fontWeight: 600, color: "#5a6673" }}
                        title={lostScratchOpponentsText(selectedWrestler.id)}
                      >
                        Lost matches: {lostScratchOpponentsText(selectedWrestler.id)}
                      </span>
                    </div>
                  </div>

                  {!selectedReplacement && (
                    <div style={{ color: "#5a6673", fontSize: 13 }}>
                      This wrestler is not currently below the match minimum.
                    </div>
                  )}

                  <div style={{ display: "grid", gap: 0 }}>
                    <h3 style={{ margin: "4px 0 0", fontSize: 18, lineHeight: "20px", fontWeight: 700, color: "#243041" }}>
                      Current matches:
                    </h3>
                    <div style={{ border: "1px solid #d7dee8", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ maxHeight: "24dvh", overflow: "auto" }}>
                        <table cellPadding={4} style={pairingsTableStyle}>
                          <colgroup>
                            {currentColumnWidths.map((width, index) => (
                              <col key={`current-col-${index}`} style={{ width }} />
                            ))}
                          </colgroup>
                          <thead>
                            <tr style={{ background: "#f7f9fc" }}>
                              {currentColumnDefs.map((column) => (
                                <th
                                  key={column.key}
                                  align={column.key === "score" ? "center" : "left"}
                                  style={pairingsHeaderCellStyle}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleSort(setCurrentSort, column.key)}
                                    style={{ all: "unset", cursor: "pointer" }}
                                  >
                                    {column.label}
                                    {sortIndicator(currentSort, column.key)}
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {currentSorted.length === 0 && (
                              <tr>
                                <td colSpan={12} style={{ ...pairingsBodyCellStyle, color: "#666" }}>None</td>
                              </tr>
                            )}
                            {currentSorted.map(({ bout, opponentId, opponent, signedScore }) => {
                              const opponentColor = opponent ? teamTextColor(opponent.teamId) : undefined;
                              const sourceColor = bout.sourceUser?.teamColor ?? null;
                              const sourceText = sourceColor ? contrastTextColor(sourceColor) : "#6a7483";
                              const sourceBackground = sourceColor ?? "#f7f9fc";
                              const sourceBorder = sourceColor ?? "#e4e9f2";
                              return (
                                <tr
                                  key={bout.id}
                                  onClick={() => {
                                    if (!canManage || removeLoadingId === bout.id) return;
                                    void removeReplacementMatch(bout.id);
                                  }}
                                  style={{
                                    borderTop: "1px solid #eee",
                                    cursor: canManage ? "pointer" : "default",
                                    background: removeLoadingId === bout.id ? "#faf7f2" : "#ffffff",
                                  }}
                                  title={canManage ? "Click to remove this match." : undefined}
                                >
                                  <td style={{ ...pairingsBodyCellStyle, color: opponentColor }}>{opponent?.last ?? ""}</td>
                                  <td style={{ ...pairingsBodyCellStyle, color: opponentColor }}>{opponent?.first ?? ""}</td>
                                  <td style={pairingsBodyCellStyle}>
                                    {opponent && (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 10, height: 10, background: teamColor(opponent.teamId), display: "inline-block" }} />
                                        {teamSymbol(opponent.teamId)}
                                      </span>
                                    )}
                                  </td>
                                  <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent?.isGirl) }}>{opponent?.isGirl ? "Yes" : "No"}</td>
                                  <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent?.isGirl) }}>{ageYears(opponent?.birthdate)?.toFixed(1) ?? ""}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>{opponent?.weight ?? ""}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>{opponent?.experienceYears ?? ""}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>{opponent?.skill ?? ""}</td>
                                  <td align="left" style={{ ...pairingsBodyCellStyle, color: Number.isFinite(signedScore) ? deltaColor(signedScore) : undefined }}>
                                    {Number.isFinite(signedScore) ? signedScore.toFixed(2) : ""}
                                  </td>
                                  <td align="left" style={pairingsBodyCellStyle}>{matchCounts.get(opponentId) ?? 0}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>{formatBoutNumber(bout.mat, bout.order)}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        letterSpacing: "0.2px",
                                        color: sourceText,
                                        background: sourceBackground,
                                        border: `1px solid ${sourceBorder}`,
                                        padding: "1px 6px",
                                        borderRadius: 999,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {removeLoadingId === bout.id ? "Removing..." : (bout.sourceUser?.username ?? "Auto")}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <h3 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: "#243041" }}>
                      Possible additional matches:
                    </h3>
                    <div style={{ border: "1px solid #d7dee8", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ maxHeight: "28dvh", overflow: "auto" }}>
                        <table cellPadding={4} style={pairingsTableStyle}>
                          <colgroup>
                            {availableColumnWidths.map((width, index) => (
                              <col key={`available-col-${index}`} style={{ width }} />
                            ))}
                          </colgroup>
                          <thead>
                            <tr style={{ background: "#f7f9fc" }}>
                              {availableColumnDefs.map((column) => (
                                <th
                                  key={column.key}
                                  align={column.key === "score" ? "center" : "left"}
                                  style={pairingsHeaderCellStyle}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleSort(setAvailableSort, column.key)}
                                    style={{ all: "unset", cursor: "pointer" }}
                                  >
                                    {column.label}
                                    {sortIndicator(availableSort, column.key)}
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {candidateLoading && (
                              <tr>
                                <td colSpan={10} style={{ ...pairingsBodyCellStyle, color: "#5a6673" }}>Loading candidates...</td>
                              </tr>
                            )}
                            {!candidateLoading && candidateError && (
                              <tr>
                                <td colSpan={10} style={{ ...pairingsBodyCellStyle, color: "#b00020" }}>{candidateError}</td>
                              </tr>
                            )}
                            {!candidateLoading && !candidateError && availableDisplay.length === 0 && (
                              <tr>
                                <td colSpan={10} style={{ ...pairingsBodyCellStyle, color: "#666" }}>
                                  {selectedReplacement
                                    ? "No candidates available right now."
                                    : "This wrestler does not currently need a replacement match."}
                                </td>
                              </tr>
                            )}
                            {!candidateLoading && !candidateError && availableDisplay.map(({ opponent, score }) => {
                              const matches = matchCounts.get(opponent.id) ?? 0;
                              const loading = addLoadingId === opponent.id;
                              return (
                                <tr
                                  key={opponent.id}
                                  onClick={() => {
                                    if (!canManage || loading) return;
                                    void addReplacementMatch(opponent.id);
                                  }}
                                  style={{
                                    borderTop: "1px solid #eee",
                                    cursor: canManage ? "pointer" : "default",
                                    background: loading ? "#eef6ff" : "#ffffff",
                                  }}
                                  title={canManage ? "Click to add this match." : undefined}
                                >
                                  <td style={{ ...pairingsBodyCellStyle, color: teamTextColor(opponent.teamId) }}>{opponent.last}</td>
                                  <td style={{ ...pairingsBodyCellStyle, color: teamTextColor(opponent.teamId) }}>{opponent.first}</td>
                                  <td style={pairingsBodyCellStyle}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ width: 10, height: 10, background: teamColor(opponent.teamId), display: "inline-block" }} />
                                      {teamSymbol(opponent.teamId)}
                                    </span>
                                  </td>
                                  <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent.isGirl) }}>{opponent.isGirl ? "Yes" : "No"}</td>
                                  <td align="left" style={{ ...pairingsBodyCellStyle, color: sexColor(opponent.isGirl) }}>{ageYears(opponent.birthdate)?.toFixed(1) ?? ""}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>{opponent.weight}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>{opponent.experienceYears}</td>
                                  <td align="left" style={pairingsBodyCellStyle}>{opponent.skill}</td>
                                  <td align="left" style={{ ...pairingsBodyCellStyle, color: Number.isFinite(score) ? deltaColor(score) : undefined }}>
                                    {loading ? "Adding..." : Number.isFinite(score) ? score.toFixed(2) : ""}
                                  </td>
                                  <td align="left" style={pairingsBodyCellStyle}>{matches}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.enforceAgeGapCheck}
                          onChange={(e) => {
                            const enforceAgeGapCheck = e.target.checked;
                            setSettings((current) => ({ ...current, enforceAgeGapCheck }));
                          }}
                        />{" "}
                        Enforce Age check
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.enforceWeightCheck}
                          onChange={(e) => {
                            const enforceWeightCheck = e.target.checked;
                            setSettings((current) => ({ ...current, enforceWeightCheck }));
                          }}
                        />{" "}
                        Enforce Weight check
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.firstYearOnlyWithFirstYear}
                          onChange={(e) => {
                            const firstYearOnlyWithFirstYear = e.target.checked;
                            setSettings((current) => ({ ...current, firstYearOnlyWithFirstYear }));
                          }}
                        />{" "}
                        First-year only rule
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.girlsWrestleGirls}
                          onChange={(e) => {
                            const girlsWrestleGirls = e.target.checked;
                            setSettings((current) => ({ ...current, girlsWrestleGirls }));
                          }}
                        />{" "}
                        Girls wrestle girls
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.allowSameTeamMatches}
                          onChange={(e) => {
                            const allowSameTeamMatches = e.target.checked;
                            setSettings((current) => ({ ...current, allowSameTeamMatches }));
                          }}
                        />{" "}
                        Include same team
                      </label>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: "#666" }}>
                    Note: Click a row to add or remove a match.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
