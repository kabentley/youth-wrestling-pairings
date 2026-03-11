"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

type TeamCheckin = {
  teamId: string;
  checkinCompletedAt?: string | null;
  completedByUsername?: string | null;
};

type TeamCheckinInfo = {
  checkinCompletedAt: string | null;
  completedByUsername: string | null;
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
  attendance?: Array<{
    wrestlerId: string;
    status: WrestlerStatus;
  }>;
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
  teamCheckins: TeamCheckin[];
  canViewScratchMatchWorkspace: boolean;
  canManageScratchEntry: boolean;
  canManageScratchMatches: boolean;
  manageableTeamIds: string[];
  currentUserTeamId: string | null;
  meetCoordinatorLabel?: string | null;
  onEnsureLock: (force?: boolean) => Promise<boolean>;
  onRefresh: () => Promise<void>;
};

const SCRATCHES_TAB_FONT_SIZE_STORAGE_KEY = "scratchesTabFontSize";
const DEFAULT_SCRATCHES_TAB_FONT_SIZE = 14;
const MIN_SCRATCHES_TAB_FONT_SIZE = 10;
const MAX_SCRATCHES_TAB_FONT_SIZE = 22;

function clampScratchesTabFontSize(value: number) {
  return Math.max(MIN_SCRATCHES_TAB_FONT_SIZE, Math.min(MAX_SCRATCHES_TAB_FONT_SIZE, Math.round(value)));
}

function readStoredScratchesTabFontSize() {
  if (typeof window === "undefined") return DEFAULT_SCRATCHES_TAB_FONT_SIZE;
  const stored = window.localStorage.getItem(SCRATCHES_TAB_FONT_SIZE_STORAGE_KEY);
  if (!stored) return DEFAULT_SCRATCHES_TAB_FONT_SIZE;
  const parsed = Number(stored);
  return Number.isFinite(parsed)
    ? clampScratchesTabFontSize(parsed)
    : DEFAULT_SCRATCHES_TAB_FONT_SIZE;
}

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

function teamTitleLabel(team?: Team | null) {
  if (!team) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginLeft: 8,
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: team.color ? adjustTeamTextColor(team.color) : "#243041",
        }}
      >
        {team.symbol ?? team.name} - {team.name}
      </span>
    </span>
  );
}

export default function ScratchesTab({
  meetId,
  teams,
  wrestlers,
  bouts,
  homeTeamId,
  checkpoints,
  targetMatchesPerWrestler,
  teamCheckins,
  canViewScratchMatchWorkspace,
  canManageScratchEntry,
  canManageScratchMatches,
  manageableTeamIds,
  currentUserTeamId,
  meetCoordinatorLabel = null,
  onEnsureLock,
  onRefresh,
}: ScratchesTabProps) {
  const visibleScratchTeams = canViewScratchMatchWorkspace
    ? teams
    : teams.filter((team) => manageableTeamIds.includes(team.id));
  const orderedTeamsSource = homeTeamId
    ? [visibleScratchTeams.find((team) => team.id === homeTeamId), ...visibleScratchTeams.filter((team) => team.id !== homeTeamId)].filter(
        (team): team is Team => Boolean(team),
      )
    : visibleScratchTeams;
  const orderedTeams = orderedTeamsSource;
  const checkinTeams = canViewScratchMatchWorkspace
    ? orderedTeams
    : orderedTeams.filter((team) => team.id === currentUserTeamId);
  const fallbackCheckinTeams = !canViewScratchMatchWorkspace && checkinTeams.length === 0
    ? orderedTeams.slice(0, 1)
    : checkinTeams;
  const initialActiveTeamId = fallbackCheckinTeams.length > 0
    ? fallbackCheckinTeams[0].id
    : orderedTeams.length > 0
      ? orderedTeams[0].id
      : null;
  const [activeTeamId, setActiveTeamId] = useState<string | null>(initialActiveTeamId);
  const [selectedDetailWrestlerId, setSelectedDetailWrestlerId] = useState<string | null>(null);
  const [candidateRows, setCandidateRows] = useState<Candidate[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateRefreshVersion, setCandidateRefreshVersion] = useState(0);
  const [baselineMatchCounts, setBaselineMatchCounts] = useState<Map<string, number>>(new Map());
  const [baselineOpponentIds, setBaselineOpponentIds] = useState<Map<string, string[]>>(new Map());
  const [baselineAttendanceStatuses, setBaselineAttendanceStatuses] = useState<Map<string, WrestlerStatus>>(new Map());
  const [baselineBoutKeys, setBaselineBoutKeys] = useState<Set<string>>(new Set());
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [pendingScratchChanges, setPendingScratchChanges] = useState<Map<string, boolean>>(new Map());
  const [pendingArrivalAdds, setPendingArrivalAdds] = useState<Set<string>>(new Set());
  const [scratchSaveLoading, setScratchSaveLoading] = useState(false);
  const [showScratchModal, setShowScratchModal] = useState(false);
  const [showUnexpectedArrivalsModal, setShowUnexpectedArrivalsModal] = useState(false);
  const [localTeamCheckins, setLocalTeamCheckins] = useState<Map<string, TeamCheckinInfo>>(
    new Map(
      teamCheckins.map((entry) => [
        entry.teamId,
        {
          checkinCompletedAt: entry.checkinCompletedAt ?? null,
          completedByUsername: entry.completedByUsername ?? null,
        },
      ]),
    ),
  );
  const [refreshingTeamCheckins, setRefreshingTeamCheckins] = useState(false);
  const [addLoadingId, setAddLoadingId] = useState<string | null>(null);
  const [removeLoadingId, setRemoveLoadingId] = useState<string | null>(null);
  const [autoPairingLoading, setAutoPairingLoading] = useState(false);
  const [, setNotice] = useState<string | null>(null);
  const [currentSort, setCurrentSort] = useState<SortState>({ key: "bout", dir: "asc" });
  const [availableSort, setAvailableSort] = useState<SortState>({ key: "score", dir: "asc" });
  const [scratchSearch, setScratchSearch] = useState("");
  const [unexpectedArrivalSearch, setUnexpectedArrivalSearch] = useState("");
  const [settings, setSettings] = useState({
    enforceAgeGapCheck: true,
    enforceWeightCheck: true,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: false,
    girlsWrestleGirls: true,
  });
  const [isPhoneLayout, setIsPhoneLayout] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [scratchesFontSize, setScratchesFontSize] = useState(DEFAULT_SCRATCHES_TAB_FONT_SIZE);
  const [scratchesFontSizeReady, setScratchesFontSizeReady] = useState(false);
  const [scratchesFontSizeOpen, setScratchesFontSizeOpen] = useState(false);
  const [scratchesFontSizeSliding, setScratchesFontSizeSliding] = useState(false);
  const pendingScratchChangesRef = useRef(pendingScratchChanges);
  const pendingArrivalAddsRef = useRef(pendingArrivalAdds);
  const scratchSaveLoadingRef = useRef(scratchSaveLoading);
  const scratchesFontSizeControlRef = useRef<HTMLDivElement | null>(null);
  const scratchesFontSizeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    pendingScratchChangesRef.current = pendingScratchChanges;
  }, [pendingScratchChanges]);

  useEffect(() => {
    pendingArrivalAddsRef.current = pendingArrivalAdds;
  }, [pendingArrivalAdds]);

  useEffect(() => {
    scratchSaveLoadingRef.current = scratchSaveLoading;
  }, [scratchSaveLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 700px)");
    const updateLayout = () => setIsPhoneLayout(mediaQuery.matches);
    updateLayout();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateLayout);
      return () => mediaQuery.removeEventListener("change", updateLayout);
    }
    mediaQuery.addListener(updateLayout);
    return () => mediaQuery.removeListener(updateLayout);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateTouchDevice = () => setIsTouchDevice(mediaQuery.matches);
    updateTouchDevice();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateTouchDevice);
      return () => mediaQuery.removeEventListener("change", updateTouchDevice);
    }
    mediaQuery.addListener(updateTouchDevice);
    return () => mediaQuery.removeListener(updateTouchDevice);
  }, []);

  useLayoutEffect(() => {
    setScratchesFontSize(readStoredScratchesTabFontSize());
    setScratchesFontSizeReady(true);
  }, []);

  useEffect(() => {
    if (!scratchesFontSizeOpen) return;
    scratchesFontSizeInputRef.current?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (scratchesFontSizeControlRef.current?.contains(target)) return;
      setScratchesFontSizeOpen(false);
      setScratchesFontSizeSliding(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [scratchesFontSizeOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!scratchesFontSizeReady) return;
    window.localStorage.setItem(SCRATCHES_TAB_FONT_SIZE_STORAGE_KEY, String(scratchesFontSize));
  }, [scratchesFontSize, scratchesFontSizeReady]);

  useEffect(() => {
    setLocalTeamCheckins((current) => {
      const next = new Map(current);
      for (const entry of teamCheckins) {
        const incomingValue = entry.checkinCompletedAt ?? null;
        const currentValue = next.get(entry.teamId) ?? { checkinCompletedAt: null, completedByUsername: null };
        next.set(entry.teamId, {
          checkinCompletedAt: incomingValue ?? currentValue.checkinCompletedAt,
          completedByUsername: entry.completedByUsername ?? currentValue.completedByUsername,
        });
      }
      return next;
    });
  }, [teamCheckins]);

  useEffect(() => {
    const allowedTeams = canViewScratchMatchWorkspace ? orderedTeams : fallbackCheckinTeams;
    if (!activeTeamId || allowedTeams.some((team) => team.id === activeTeamId)) return;
    setActiveTeamId(allowedTeams[0]?.id ?? null);
  }, [activeTeamId, canViewScratchMatchWorkspace, fallbackCheckinTeams, orderedTeams]);

  const manageableTeamIdSet = new Set(manageableTeamIds);
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const teamCheckinMap = localTeamCheckins;
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
      setBaselineAttendanceStatuses(new Map());
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
        const attendanceStatuses = new Map<string, WrestlerStatus>();
        const keys = new Set<string>();
        for (const attendance of Array.isArray(payload.attendance) ? payload.attendance : []) {
          attendanceStatuses.set(attendance.wrestlerId, attendance.status ?? null);
        }
        for (const bout of Array.isArray(payload.bouts) ? payload.bouts : []) {
          counts.set(bout.redId, (counts.get(bout.redId) ?? 0) + 1);
          counts.set(bout.greenId, (counts.get(bout.greenId) ?? 0) + 1);
          opponents.set(bout.redId, [...(opponents.get(bout.redId) ?? []), bout.greenId]);
          opponents.set(bout.greenId, [...(opponents.get(bout.greenId) ?? []), bout.redId]);
          keys.add(pairKey(bout.redId, bout.greenId));
        }
        setBaselineMatchCounts(counts);
        setBaselineOpponentIds(opponents);
        setBaselineAttendanceStatuses(attendanceStatuses);
        setBaselineBoutKeys(keys);
      })
      .catch((err) => {
        if (cancelled) return;
        setBaselineMatchCounts(new Map());
        setBaselineOpponentIds(new Map());
        setBaselineAttendanceStatuses(new Map());
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
    .filter((wrestler) => wrestler.teamId === activeTeamId && isScratchRosterStatus(effectiveScratchStatus(wrestler)))
    .sort((a, b) => {
      const last = a.last.localeCompare(b.last, undefined, { sensitivity: "base" });
      if (last !== 0) return last;
      return a.first.localeCompare(b.first, undefined, { sensitivity: "base" });
    });
  const filteredTeamRoster = teamRoster.filter((wrestler) =>
    fuzzyMatches(`${wrestler.first} ${wrestler.last}`, scratchSearch),
  );
  const unexpectedArrivalsRoster = wrestlers
    .filter((wrestler) => wrestler.teamId === activeTeamId && !isScratchRosterStatus(wrestler.status))
    .sort((a, b) => {
      const last = a.last.localeCompare(b.last, undefined, { sensitivity: "base" });
      if (last !== 0) return last;
      return a.first.localeCompare(b.first, undefined, { sensitivity: "base" });
    });
  const filteredUnexpectedArrivalsRoster = unexpectedArrivalsRoster.filter((wrestler) =>
    fuzzyMatches(`${wrestler.first} ${wrestler.last}`, unexpectedArrivalSearch),
  );
  const isUnexpectedArrivalWrestler = (wrestler: Wrestler) => {
    const baselineStatus = baselineAttendanceStatuses.get(wrestler.id);
    return baselineStatus == null || baselineStatus === "NOT_COMING";
  };

  const replacementRows = wrestlers
    .filter((wrestler) => isReplacementEligible(wrestler.status))
    .map((wrestler) => {
      const matches = matchCounts.get(wrestler.id) ?? 0;
      const baselineMatches = baselineMatchCounts.get(wrestler.id) ?? 0;
      const isUnexpectedArrival = isUnexpectedArrivalWrestler(wrestler);
      return {
        wrestler,
        matches,
        baselineMatches,
        isUnexpectedArrival,
        lostMatches: Math.max(0, baselineMatches - matches),
      };
    })
    .filter((row) => {
      if (targetMatchesPerWrestler === null) {
        return row.lostMatches > 0;
      }
      return row.matches < targetMatchesPerWrestler && (row.lostMatches > 0 || row.isUnexpectedArrival);
    })
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
    if (!selectedDetailWrestlerId) {
      setSelectedDetailWrestlerId(replacementRows[0]?.wrestler.id ?? null);
      return;
    }
    if (wrestlerMap.has(selectedDetailWrestlerId)) return;
    setSelectedDetailWrestlerId(replacementRows[0]?.wrestler.id ?? null);
  }, [replacementRows, selectedDetailWrestlerId, wrestlerMap]);

  const selectedWrestler = selectedDetailWrestlerId ? wrestlerMap.get(selectedDetailWrestlerId) ?? null : null;
  const selectedCandidateWrestlerId = selectedWrestler?.id ?? null;
  const selectedTeam = selectedWrestler ? teamMap.get(selectedWrestler.teamId) ?? null : null;
  useEffect(() => {
    if (!selectedCandidateWrestlerId) {
      setCandidateRows([]);
      setCandidateError(null);
      return;
    }
    let cancelled = false;
    setCandidateLoading(true);
    setCandidateError(null);
    const params = new URLSearchParams({
      wrestlerId: selectedCandidateWrestlerId,
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
    selectedCandidateWrestlerId,
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
      (bout.redId === row.opponent.id && bout.greenId === selectedWrestler?.id) ||
      (bout.greenId === row.opponent.id && bout.redId === selectedWrestler?.id)
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
      if (!(await onEnsureLock(true))) {
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

  function persistedScratchAbsent(wrestlerId: string) {
    return wrestlerMap.get(wrestlerId)?.status === "ABSENT";
  }

  function effectiveScratchStatus(wrestler: Wrestler) {
    if (pendingArrivalAdds.has(wrestler.id)) return "COMING";
    const pendingAbsent = pendingScratchChanges.get(wrestler.id);
    if (pendingAbsent === undefined) return wrestler.status;
    return pendingAbsent ? "ABSENT" : "COMING";
  }

  function queueScratchChange(wrestlerId: string, absent: boolean) {
    const baseAbsent = persistedScratchAbsent(wrestlerId);
    setPendingScratchChanges((current) => {
      const next = new Map(current);
      if (absent === baseAbsent) {
        next.delete(wrestlerId);
      } else {
        next.set(wrestlerId, absent);
      }
      pendingScratchChangesRef.current = next;
      return next;
    });
  }

  function clearPendingScratchChanges() {
    pendingScratchChangesRef.current = new Map();
    pendingArrivalAddsRef.current = new Set();
    setPendingScratchChanges(new Map());
    setPendingArrivalAdds(new Set());
  }

  function queueUnexpectedArrival(wrestlerId: string) {
    setPendingArrivalAdds((current) => {
      const next = new Set(current);
      if (next.has(wrestlerId)) {
        next.delete(wrestlerId);
      } else {
        next.add(wrestlerId);
      }
      pendingArrivalAddsRef.current = next;
      return next;
    });
  }

  async function saveScratchChanges(options?: { completeTeamId?: string | null }) {
    const combinedChanges = new Map<string, boolean>();
    for (const wrestlerId of pendingArrivalAddsRef.current) {
      combinedChanges.set(wrestlerId, false);
    }
    for (const [wrestlerId, absent] of pendingScratchChangesRef.current.entries()) {
      combinedChanges.set(wrestlerId, absent);
    }
    const changes = [...combinedChanges.entries()].map(([wrestlerId, absent]) => ({ wrestlerId, absent }));
    const completeTeamId = options?.completeTeamId ?? null;
    if ((changes.length === 0 && !completeTeamId) || scratchSaveLoadingRef.current) {
      return changes.length === 0 && !completeTeamId;
    }
    setNotice(null);
    scratchSaveLoadingRef.current = true;
    setScratchSaveLoading(true);
    try {
      const response = await fetch(`/api/meets/${meetId}/scratches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes,
          ...(completeTeamId ? { completeTeamId } : {}),
        }),
      });
      const payload = response.ok ? await response.json().catch(() => null) : await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save scratch changes.");
      }
      if (completeTeamId && payload?.completedTeamCheckin) {
        setLocalTeamCheckins((current) => {
          const next = new Map(current);
          next.set(completeTeamId, {
            checkinCompletedAt: payload.completedTeamCheckin.checkinCompletedAt ?? null,
            completedByUsername: payload.completedTeamCheckin.completedByUsername ?? null,
          });
          return next;
        });
      }
      await refreshScratchData();
      clearPendingScratchChanges();
      setNotice(payload?.message ?? "Scratch changes saved.");
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to save scratch changes.");
      return false;
    } finally {
      scratchSaveLoadingRef.current = false;
      setScratchSaveLoading(false);
    }
  }

  function openScratchModal(teamId: string) {
    if (!manageableTeamIdSet.has(teamId)) return;
    clearPendingScratchChanges();
    setActiveTeamId(teamId);
    setScratchSearch("");
    setUnexpectedArrivalSearch("");
    setShowUnexpectedArrivalsModal(false);
    setShowScratchModal(true);
  }

  function cancelScratchModal() {
    clearPendingScratchChanges();
    setShowUnexpectedArrivalsModal(false);
    setShowScratchModal(false);
  }

  async function completeScratchModal() {
    if (!activeTeamId) {
      setShowScratchModal(false);
      return;
    }
    const ok = await saveScratchChanges({ completeTeamId: activeTeamId });
    if (ok) {
      setShowUnexpectedArrivalsModal(false);
      setShowScratchModal(false);
    }
  }

  function openUnexpectedArrivalsModal() {
    setUnexpectedArrivalSearch("");
    setShowUnexpectedArrivalsModal(true);
  }

  function closeUnexpectedArrivalsModal() {
    setShowUnexpectedArrivalsModal(false);
  }

  async function refreshTeamCheckins() {
    if (refreshingTeamCheckins) return;
    setRefreshingTeamCheckins(true);
    try {
      await refreshScratchData();
    } finally {
      setRefreshingTeamCheckins(false);
    }
  }

  async function addReplacementMatch(opponentId: string) {
    if (!selectedWrestler) return;
    setNotice(null);
    setAddLoadingId(opponentId);
    try {
      await runManagedRequest(
        () => fetch(`/api/meets/${meetId}/pairings/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ redId: selectedWrestler.id, greenId: opponentId }),
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
      await runManagedRequest(
        () => fetch(`/api/bouts/${boutId}`, { method: "DELETE" }),
        "Unable to remove match.",
      );
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
  const scratchesTableFontSize = isPhoneLayout
    ? Math.max(MIN_SCRATCHES_TAB_FONT_SIZE, scratchesFontSize - 1)
    : scratchesFontSize;
  const scratchesHeaderFontSize = Math.max(10, scratchesTableFontSize - 1);
  const scratchesFontSliderPercent =
    ((scratchesFontSize - MIN_SCRATCHES_TAB_FONT_SIZE)
      / (MAX_SCRATCHES_TAB_FONT_SIZE - MIN_SCRATCHES_TAB_FONT_SIZE))
    * 100;
  const pairingsTableStyle = {
    borderCollapse: "collapse" as const,
    width: "fit-content",
    maxWidth: "100%",
    tableLayout: "fixed" as const,
    fontSize: scratchesTableFontSize,
  };
  const pairingsHeaderCellStyle = {
    padding: isPhoneLayout ? "2px 10px 2px 4px" : "3px 18px 3px 6px",
    borderBottom: "1px solid #e1e7ef",
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
    position: "relative" as const,
    lineHeight: isPhoneLayout ? 1.05 : 1.15,
    fontSize: scratchesHeaderFontSize,
  };
  const pairingsBodyCellStyle = {
    padding: isPhoneLayout ? "2px 4px" : "3px 6px",
    lineHeight: isPhoneLayout ? 1.05 : 1.2,
    fontSize: scratchesTableFontSize,
  };
  const useTouchModalLayout = isPhoneLayout || isTouchDevice;
  const modalCardStyle = {
    width: useTouchModalLayout ? "min(100%, 720px)" : "min(760px, 100%)",
    maxHeight: useTouchModalLayout
      ? "calc(100svh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px)"
      : "calc(100vh - 24px)",
    height: undefined,
    background: "#ffffff",
    borderRadius: useTouchModalLayout ? 12 : 16,
    border: "1px solid #d5dbe2",
    boxShadow: useTouchModalLayout ? "none" : "0 18px 60px rgba(15, 23, 42, 0.28)",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    overflow: "hidden",
  } as const;
  const modalBodyPadding = isPhoneLayout ? 10 : 14;
  const modalFooterPadding = isPhoneLayout ? "10px 10px calc(10px + env(safe-area-inset-bottom, 0px))" : "12px 18px 16px";
  const mobileActionButtonStyle = {
    minHeight: 28,
    padding: "3px 8px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap" as const,
  };

  function renderScratchRosterContent() {
    if (!isPhoneLayout) {
      return (
        <>
          {filteredTeamRoster.length === 0 && (
            <div style={{ color: "#5a6673", fontSize: 13, padding: "6px 4px" }}>
              {teamRoster.length === 0 ? "No scheduled wrestlers on this team." : "No wrestlers match this search."}
            </div>
          )}
          {filteredTeamRoster.length > 0 && (
            <table cellPadding={4} style={{ ...pairingsTableStyle, width: "100%" }}>
              <colgroup>
                <col style={{ width: 220 }} />
                <col />
              </colgroup>
              <tbody>
                {filteredTeamRoster.map((wrestler) => {
                  const effectiveStatus = effectiveScratchStatus(wrestler);
                  const absent = effectiveStatus === "ABSENT";
                  const beforeOpponents = baselineOpponentsText(wrestler.id);
                  const rowBackground = absent ? "#f8eded" : "#e6f7e6";
                  const rowBorder = absent ? "#dfc1c1" : "#c7ddc7";
                  return (
                    <tr
                      key={wrestler.id}
                      onClick={() => {
                        if (!canManageScratchEntry || scratchSaveLoading) return;
                        queueScratchChange(wrestler.id, !absent);
                      }}
                      style={{
                        background: rowBackground,
                        borderTop: `1px solid ${rowBorder}`,
                        cursor: !canManageScratchEntry || scratchSaveLoading ? "default" : "pointer",
                      }}
                    >
                      <td style={{ ...pairingsBodyCellStyle, color: teamTextColor(wrestler.teamId) }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {wrestler.first} {wrestler.last}
                          </span>
                          <span
                            aria-hidden={!absent}
                            style={{
                              border: "1px solid #d0b2b2",
                              borderRadius: 999,
                              background: "#fff7f7",
                              color: "#7a3d3d",
                              display: "inline-flex",
                              alignItems: "center",
                              minHeight: 20,
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "1px 8px",
                              lineHeight: 1,
                              whiteSpace: "nowrap",
                              flex: "0 0 auto",
                              textTransform: "lowercase",
                              visibility: absent ? "visible" : "hidden",
                            }}
                          >
                            scratched
                          </span>
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
        </>
      );
    }

    return (
      <div style={{ display: "grid", gap: 4 }}>
        {filteredTeamRoster.length === 0 && (
          <div style={{ color: "#5a6673", fontSize: 14, padding: "6px 4px", lineHeight: 1.15 }}>
            {teamRoster.length === 0 ? "No scheduled wrestlers on this team." : "No wrestlers match this search."}
          </div>
        )}
        {filteredTeamRoster.map((wrestler) => {
          const effectiveStatus = effectiveScratchStatus(wrestler);
          const absent = effectiveStatus === "ABSENT";
          return (
            <div
              key={wrestler.id}
              onClick={() => {
                if (!canManageScratchEntry || scratchSaveLoading) return;
                queueScratchChange(wrestler.id, !absent);
              }}
              style={{
                border: `1px solid ${absent ? "#dfc1c1" : "#c7ddc7"}`,
                borderRadius: 8,
                background: absent ? "#f8eded" : "#e6f7e6",
                padding: "6px 8px",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
                lineHeight: 1.05,
                cursor: !canManageScratchEntry || scratchSaveLoading ? "default" : "pointer",
              }}
            >
              <div style={{ minWidth: 0, color: teamTextColor(wrestler.teamId), fontSize: 14, fontWeight: 700, lineHeight: 1.02 }}>
                {wrestler.first} {wrestler.last}
              </div>
              <span
                aria-hidden={!absent}
                style={{
                  ...mobileActionButtonStyle,
                  border: "1px solid #d0b2b2",
                  borderRadius: 999,
                  background: "#fff7f7",
                  color: "#7a3d3d",
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 20,
                  padding: "1px 8px",
                  lineHeight: 1,
                  cursor: "inherit",
                  flex: "0 0 auto",
                  textTransform: "lowercase",
                  visibility: absent ? "visible" : "hidden",
                }}
              >
                scratched
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  function renderUnexpectedArrivalsContent() {
    if (!isPhoneLayout) {
      return (
        <>
          {filteredUnexpectedArrivalsRoster.length === 0 && (
            <div style={{ color: "#5a6673", fontSize: 13, padding: "6px 4px" }}>
              {unexpectedArrivalsRoster.length === 0 ? "No unexpected-arrival candidates for this team." : "No wrestlers match this search."}
            </div>
          )}
          {filteredUnexpectedArrivalsRoster.length > 0 && (
            <table cellPadding={4} style={{ ...pairingsTableStyle, width: "100%" }}>
              <colgroup>
                <col style={{ width: 260 }} />
                <col />
              </colgroup>
              <thead>
                <tr style={{ background: "#f7f9fc" }}>
                  <th align="left" style={pairingsHeaderCellStyle}>Name</th>
                  <th align="left" style={pairingsHeaderCellStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnexpectedArrivalsRoster.map((wrestler) => {
                  const pendingAdd = pendingArrivalAdds.has(wrestler.id);
                  return (
                    <tr key={wrestler.id} style={{ borderTop: "1px solid #e5e8ee", background: "#ffffff" }}>
                      <td style={{ ...pairingsBodyCellStyle, color: teamTextColor(wrestler.teamId) }}>
                        <div style={{ display: "flex", alignItems: "center", minHeight: 20 }}>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {wrestler.first} {wrestler.last}
                          </span>
                        </div>
                      </td>
                      <td style={pairingsBodyCellStyle}>
                        <button
                          type="button"
                          onClick={() => queueUnexpectedArrival(wrestler.id)}
                          disabled={!canManageScratchEntry || scratchSaveLoading}
                          style={{
                            border: `1px solid ${pendingAdd ? "#d0b2b2" : "#bcd8c1"}`,
                            borderRadius: 4,
                            background: pendingAdd ? "#fff7f7" : "#e6f6ea",
                            color: pendingAdd ? "#7a3d3d" : "#1d5b2a",
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "1px 6px",
                            cursor: !canManageScratchEntry || scratchSaveLoading ? "default" : "pointer",
                            whiteSpace: "nowrap",
                            flex: "0 0 auto",
                          }}
                        >
                          {pendingAdd ? "Undo" : "Add to meet"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      );
    }

    return (
      <div style={{ display: "grid", gap: 4 }}>
        {filteredUnexpectedArrivalsRoster.length === 0 && (
          <div style={{ color: "#5a6673", fontSize: 14, padding: "6px 4px", lineHeight: 1.15 }}>
            {unexpectedArrivalsRoster.length === 0 ? "No unexpected-arrival candidates for this team." : "No wrestlers match this search."}
          </div>
        )}
        {filteredUnexpectedArrivalsRoster.map((wrestler) => {
          const pendingAdd = pendingArrivalAdds.has(wrestler.id);
          return (
            <div
              key={wrestler.id}
              style={{
                border: "1px solid #d5dbe2",
                borderRadius: 8,
                background: "#ffffff",
                padding: "6px 8px",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
                lineHeight: 1.05,
              }}
            >
              <div style={{ minWidth: 0, color: teamTextColor(wrestler.teamId), fontSize: 14, fontWeight: 700, lineHeight: 1.02 }}>
                {wrestler.first} {wrestler.last}
              </div>
              <button
                type="button"
                onClick={() => queueUnexpectedArrival(wrestler.id)}
                disabled={!canManageScratchEntry || scratchSaveLoading}
                style={{
                  ...mobileActionButtonStyle,
                  border: `1px solid ${pendingAdd ? "#d0b2b2" : "#bcd8c1"}`,
                  background: pendingAdd ? "#fff7f7" : "#e6f6ea",
                  color: pendingAdd ? "#7a3d3d" : "#1d5b2a",
                  cursor: !canManageScratchEntry || scratchSaveLoading ? "default" : "pointer",
                  flex: "0 0 auto",
                }}
              >
                {pendingAdd ? "Undo" : "Add to meet"}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section
      className="panel fill"
      style={{
        display: "grid",
        gap: 14,
        padding: isPhoneLayout ? 8 : 16,
        height: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: canManageScratchEntry ? "space-between" : "flex-start", gap: isPhoneLayout ? 8 : 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        {canManageScratchEntry && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: isPhoneLayout ? 8 : 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#243041", marginRight: 4, lineHeight: isPhoneLayout ? 1.05 : undefined }}>
              Enter Scratches For:
            </div>
            {fallbackCheckinTeams.map((team) => {
              const canEditScratchTeam = manageableTeamIdSet.has(team.id);
              const teamColorValue = team.color ?? "#7a1738";
              const textColor = adjustTeamTextColor(teamColorValue);
              const completedInfo = teamCheckinMap.get(team.id) ?? { checkinCompletedAt: null, completedByUsername: null };
              const completedAt = completedInfo.checkinCompletedAt;
              const completedByUsername = completedInfo.completedByUsername;
              const completedTitle = completedAt
                ? [
                    `Check-in complete for ${formatTeamName(team)}.`,
                    completedByUsername ? `Completed by ${completedByUsername}.` : null,
                    `Completed at ${new Date(completedAt).toLocaleString()}.`,
                  ].filter(Boolean).join(" ")
                : undefined;
              return (
                <button
                  key={team.id}
                  type="button"
                  className="team-chip-btn"
                  onClick={() => openScratchModal(team.id)}
                  disabled={!canEditScratchTeam || !canManageScratchEntry}
                  title={completedTitle}
                  style={{
                    background: team.color ? `${team.color}22` : "#f7f9fc",
                    color: textColor,
                    border: `1px solid ${teamColorValue}`,
                    borderWidth: 2,
                    padding: isPhoneLayout ? "6px 10px" : "8px 14px",
                    borderRadius: isPhoneLayout ? 8 : 10,
                  fontWeight: 700,
                  opacity: canEditScratchTeam ? 1 : 0.65,
                  boxShadow: "0 -2px 0 #ffffff inset, 0 2px 0 rgba(0,0,0,0.12)",
                  cursor: canEditScratchTeam ? "pointer" : "default",
                }}
              >
                  <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span>{team.symbol ?? team.name}</span>
                      {completedAt && (
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: "#e6f6ea",
                            border: "1px solid #b8d9c0",
                            color: "#1d5b2a",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          Done
                        </span>
                      )}
                    </span>
                    {completedAt && completedByUsername && (
                      <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, lineHeight: isPhoneLayout ? 1.05 : undefined }}>
                        by {completedByUsername}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {canManageScratchMatches && (
              <button
                type="button"
                className="nav-btn"
                onClick={() => void refreshTeamCheckins()}
                disabled={refreshingTeamCheckins}
                style={{ padding: "8px 14px", borderRadius: 10 }}
              >
                {refreshingTeamCheckins ? "Refreshing..." : "Refresh"}
              </button>
            )}
            <div
              ref={scratchesFontSizeControlRef}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                color: "#4b5563",
              }}
            >
              <button
                type="button"
                className="nav-btn secondary"
                onClick={() => {
                  setScratchesFontSizeOpen(open => !open);
                  setScratchesFontSizeSliding(false);
                }}
                aria-label="Adjust scratches font size"
                aria-expanded={scratchesFontSizeOpen}
                title="Adjust the scratches font size"
                style={{ padding: "8px 10px", lineHeight: 1 }}
              >
                <span
                  aria-hidden="true"
                  style={{ display: "inline-flex", alignItems: "baseline", gap: 1, lineHeight: 1 }}
                >
                  <span style={{ fontSize: 18 }}>A</span>
                  <span style={{ fontSize: 13 }}>A</span>
                </span>
              </button>
              {scratchesFontSizeOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 40,
                    width: 220,
                    padding: "10px 12px",
                    border: "1px solid #d5dbe2",
                    borderRadius: 10,
                    background: "#ffffff",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.16)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563", marginBottom: 8 }}>
                    Change font size
                  </div>
                  <div style={{ position: "relative", overflow: "visible" }}>
                    {scratchesFontSizeSliding && (
                      <span
                        style={{
                          position: "absolute",
                          left: `calc(${scratchesFontSliderPercent}% - 2px)`,
                          top: -18,
                          transform: "translateX(-50%)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#1f2937",
                          background: "#ffffff",
                          padding: "1px 6px",
                          borderRadius: 999,
                          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.18)",
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {scratchesFontSize}px
                      </span>
                    )}
                    <input
                      ref={scratchesFontSizeInputRef}
                      type="range"
                      min={MIN_SCRATCHES_TAB_FONT_SIZE}
                      max={MAX_SCRATCHES_TAB_FONT_SIZE}
                      step={1}
                      value={scratchesFontSize}
                      onChange={event => setScratchesFontSize(clampScratchesTabFontSize(Number(event.target.value)))}
                      onPointerDown={() => setScratchesFontSizeSliding(true)}
                      onPointerUp={() => {
                        setScratchesFontSizeSliding(false);
                        setScratchesFontSizeOpen(false);
                      }}
                      onPointerCancel={() => {
                        setScratchesFontSizeSliding(false);
                        setScratchesFontSizeOpen(false);
                      }}
                      onBlur={() => {
                        setScratchesFontSizeSliding(false);
                        setScratchesFontSizeOpen(false);
                      }}
                      onKeyDown={event => {
                        if (event.key === "Escape") {
                          setScratchesFontSizeSliding(false);
                          setScratchesFontSizeOpen(false);
                        }
                      }}
                      aria-label="Adjust scratches font size"
                      style={{ width: "100%", margin: 0 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {!canManageScratchEntry && (
          <div className="notice" style={{ margin: 0, textAlign: "left" }}>
            Coaches need edit access from the Meet Coordinator to enter scratches. Contact {meetCoordinatorLabel ?? "the Meet Coordinator"} for access.
          </div>
        )}
      </div>

      {canViewScratchMatchWorkspace ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isPhoneLayout ? "minmax(0, 1fr)" : "minmax(260px, 320px) minmax(0, 1fr)",
            gridTemplateRows: isPhoneLayout ? "auto auto auto" : "minmax(260px, 38dvh) minmax(0, 1fr)",
            gap: isPhoneLayout ? 8 : 12,
            alignSelf: "stretch",
            height: isPhoneLayout ? "auto" : "calc(100dvh - 220px)",
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
                className="nav-btn primary"
                onClick={() => void runAutoPairings()}
                disabled={!canManageScratchMatches || baselineLoading || Boolean(baselineError) || replacementRows.length === 0 || autoPairingLoading}
              >
                {autoPairingLoading ? "Running..." : "Auto pair for scratches"}
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "grid", gap: 8 }}>
              {!canManageScratchMatches && (
                <div style={{ color: "#5a6673", fontSize: 13 }}>
                  Start Editing to add or remove replacement matches.
                </div>
              )}
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
                      : `No wrestlers currently need matches below the ${targetMatchesPerWrestler}-match minimum.`}
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
                                {team ? ` (${team.symbol ?? team.name})` : ""}
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
                        {selectedTeam ? ` (${selectedTeam.symbol ?? selectedTeam.name})` : ""}
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
                                        if (!canManageScratchMatches || removeLoadingId === bout.id) return;
                                        void removeReplacementMatch(bout.id);
                                      }}
                                      style={{
                                        borderTop: "1px solid #eee",
                                        cursor: canManageScratchMatches ? "pointer" : "default",
                                        background: removeLoadingId === bout.id ? "#faf7f2" : "#ffffff",
                                      }}
                                      title={canManageScratchMatches ? "Click to remove this match." : undefined}
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
                                    No candidates available right now.
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
                                      if (!canManageScratchMatches || loading) return;
                                      void addReplacementMatch(opponent.id);
                                    }}
                                    style={{
                                      borderTop: "1px solid #eee",
                                      cursor: canManageScratchMatches ? "pointer" : "default",
                                      background: loading ? "#eef6ff" : "#ffffff",
                                    }}
                                    title={canManageScratchMatches ? "Click to add this match." : undefined}
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
              gridColumn: isPhoneLayout ? 1 : "1 / span 2",
              gridRow: isPhoneLayout ? 3 : 2,
            }}
          >
              <div
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid #e5e8ee",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 700 }}>New matches</div>
                <div style={{ color: "#5a6673", fontSize: 14 }}>
                  Click on wrestler names to add or remove matches for them.
                </div>
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
                <div style={{ border: "1px solid #d5dbe2", borderRadius: 8, overflow: isPhoneLayout ? "auto" : "hidden", background: "#ffffff" }}>
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
              gridColumn: isPhoneLayout ? 1 : 2,
              gridRow: isPhoneLayout ? 2 : 1,
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
                    <span style={{ fontSize: 18, lineHeight: "20px", fontWeight: 700, color: "#243041" }}>
                      Current matches:
                    </span>
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
                      {selectedTeam ? ` (${selectedTeam.symbol ?? selectedTeam.name})` : ""}
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

                  <div style={{ display: "grid", gap: 0 }}>
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
                                    if (!canManageScratchMatches || removeLoadingId === bout.id) return;
                                    void removeReplacementMatch(bout.id);
                                  }}
                                  style={{
                                    borderTop: "1px solid #eee",
                                    cursor: canManageScratchMatches ? "pointer" : "default",
                                    background: removeLoadingId === bout.id ? "#faf7f2" : "#ffffff",
                                  }}
                                  title={canManageScratchMatches ? "Click to remove this match." : undefined}
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
                                  No candidates available right now.
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
                                    if (!canManageScratchMatches || loading) return;
                                    void addReplacementMatch(opponent.id);
                                  }}
                                  style={{
                                    borderTop: "1px solid #eee",
                                    cursor: canManageScratchMatches ? "pointer" : "default",
                                    background: loading ? "#eef6ff" : "#ffffff",
                                  }}
                                  title={canManageScratchMatches ? "Click to add this match." : undefined}
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
      ) : (
        <div
          style={{
            border: "1px solid #d5dbe2",
            borderRadius: 12,
            background: "#ffffff",
            padding: isPhoneLayout ? 12 : 16,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ color: "#5a6673", fontSize: 14, lineHeight: 1.25 }}>
            Open your team and finish check-in when your wrestlers are accounted for.
          </div>
        </div>
      )}

      {showScratchModal && (
        <div
          onClick={cancelScratchModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 26, 36, 0.48)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: useTouchModalLayout
              ? "calc(8px + env(safe-area-inset-top, 0px)) 8px calc(8px + env(safe-area-inset-bottom, 0px))"
              : 20,
            zIndex: 1000,
            overflowY: "auto",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={modalCardStyle}
          >
            <div style={{ padding: isPhoneLayout ? "12px 10px 8px" : "16px 18px 10px", borderBottom: "1px solid #e5e8ee" }}>
              <div style={{ fontSize: isPhoneLayout ? 18 : 22, fontWeight: 800, color: "#243041", display: "flex", alignItems: "center", flexWrap: "wrap", lineHeight: isPhoneLayout ? 1.05 : undefined }}>
                <span>Enter scratches for:</span>
                {teamTitleLabel(activeTeam)}
              </div>
            </div>

            <div style={{ padding: modalBodyPadding, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ display: "flex", gap: isPhoneLayout ? 8 : 10, alignItems: "center", marginBottom: isPhoneLayout ? 8 : 10 }}>
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
                  style={{ flex: 1, minWidth: 0, padding: isPhoneLayout ? "8px 10px" : "6px 8px", fontSize: isPhoneLayout ? 16 : 13 }}
                />
              </div>
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
                {!isPhoneLayout && (
                  <table cellPadding={4} style={{ ...pairingsTableStyle, width: "100%", flex: "0 0 auto" }}>
                    <colgroup>
                      <col style={{ width: 220 }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr style={{ background: "#f7f9fc" }}>
                        <th align="left" style={pairingsHeaderCellStyle}>Name</th>
                        <th align="left" style={pairingsHeaderCellStyle}>Opponents</th>
                      </tr>
                    </thead>
                  </table>
                )}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isPhoneLayout ? 6 : 4 }}>
                  {renderScratchRosterContent()}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: modalFooterPadding,
                borderTop: "1px solid #e5e8ee",
                display: "grid",
                gap: 10,
              }}
            >
              <button
                type="button"
                className="nav-btn secondary"
                onClick={openUnexpectedArrivalsModal}
                disabled={!canManageScratchEntry || scratchSaveLoading}
                style={isPhoneLayout ? { width: "100%" } : undefined}
              >
                Unexpected arrivals
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <button
                  type="button"
                  className="nav-btn"
                  onClick={cancelScratchModal}
                  disabled={scratchSaveLoading}
                  style={isPhoneLayout ? { width: "100%" } : undefined}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="nav-btn primary"
                  onClick={() => void completeScratchModal()}
                  disabled={!canManageScratchEntry || scratchSaveLoading}
                  style={isPhoneLayout ? { width: "100%" } : undefined}
                >
                  {scratchSaveLoading ? "Saving..." : "Done"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showScratchModal && showUnexpectedArrivalsModal && (
        <div
          onClick={closeUnexpectedArrivalsModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20, 26, 36, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: useTouchModalLayout
              ? "calc(8px + env(safe-area-inset-top, 0px)) 8px calc(8px + env(safe-area-inset-bottom, 0px))"
              : 20,
            zIndex: 1001,
            overflowY: "auto",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={modalCardStyle}
          >
            <div style={{ padding: isPhoneLayout ? "12px 10px 8px" : "16px 18px 10px", borderBottom: "1px solid #e5e8ee" }}>
              <div style={{ fontSize: isPhoneLayout ? 18 : 22, fontWeight: 800, color: "#243041", display: "flex", alignItems: "center", flexWrap: "wrap", lineHeight: isPhoneLayout ? 1.05 : undefined }}>
                <span>Unexpected arrivals for:</span>
                {teamTitleLabel(activeTeam)}
              </div>
            </div>

            <div style={{ padding: modalBodyPadding, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ color: "#5a6673", fontSize: 15, marginBottom: 10, lineHeight: isPhoneLayout ? 1.15 : undefined }}>
                Add wrestlers who showed up unexpectedly but weren&apos;t scheduled.
              </div>
              <input
                type="text"
                value={unexpectedArrivalSearch}
                onChange={(event) => setUnexpectedArrivalSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  setUnexpectedArrivalSearch("");
                }}
                placeholder="Search"
                aria-label="Unexpected arrivals search"
                style={{ width: "100%", marginBottom: isPhoneLayout ? 6 : 8, padding: isPhoneLayout ? "8px 10px" : "6px 8px", fontSize: isPhoneLayout ? 16 : 13 }}
              />
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "#f7f9fc",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isPhoneLayout ? 6 : 4 }}>
                  {renderUnexpectedArrivalsContent()}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: modalFooterPadding,
                borderTop: "1px solid #e5e8ee",
                display: "grid",
                gap: 10,
              }}
            >
              <button
                type="button"
                className="nav-btn primary"
                onClick={closeUnexpectedArrivalsModal}
                disabled={scratchSaveLoading}
                style={isPhoneLayout ? { width: "100%" } : { justifySelf: "end" }}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
