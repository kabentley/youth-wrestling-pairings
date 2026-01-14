"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import MatBoardTab from "./matboard/MatBoardTab";
import WallChartTab from "./wall/WallChartTab";

import AppHeader from "@/components/AppHeader";
import { DAYS_PER_YEAR, DEFAULT_MAX_AGE_GAP_DAYS } from "@/lib/constants";

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const div = document.createElement("div");
    document.body.appendChild(div);
    setContainer(div);
    return () => {
      document.body.removeChild(div);
    };
  }, []);
  if (!container) return null;
  return createPortal(children, container);
}


type Team = { id: string; name: string; symbol?: string; color?: string };
type AttendanceStatus = "COMING" | "NOT_COMING" | "LATE" | "EARLY";
type Wrestler = {
  id: string;
  teamId: string;
  first: string;
  last: string;
  weight: number;
  experienceYears: number;
  skill: number;
  birthdate?: string;
  status?: AttendanceStatus | null;
};
type Bout = {
  id: string;
  redId: string;
  greenId: string;
  type: string;
  score: number;
  notes?: string | null;
  mat?: number | null;
  order?: number | null;
};

type Candidate = {
  opponent: Wrestler;
  score: number;
  details?: {
    wDiff: number;
    wPct: number;
    ageGapDays: number;
    expGap: number;
    skillGap: number;
  };
};

type LockState = {
  status: "loading" | "acquired" | "locked";
  lockedByUsername?: string | null;
  lockExpiresAt?: string | null;
};
type MeetChange = {
  id: string;
  message: string;
  createdAt: string;
  actor?: { username?: string | null } | null;
};
type MeetComment = {
  id: string;
  body: string;
  section?: string | null;
  createdAt: string;
  author?: { username?: string | null } | null;
};

const CURRENT_SHARED_COLUMN_MAP: Record<number, number> = {
  0: 0,
  1: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
};

const AVAILABLE_SHARED_COLUMN_MAP = CURRENT_SHARED_COLUMN_MAP;

export default function MeetDetail({ params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = use(params);
  const router = useRouter();
  const daysPerYear = DAYS_PER_YEAR;

  const [teams, setTeams] = useState<Team[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler | undefined>>({});
  const [meetName, setMeetName] = useState("");
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [meetStatus, setMeetStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  const [changes, setChanges] = useState<MeetChange[]>([]);
  const [comments, setComments] = useState<MeetComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentSection, setCommentSection] = useState("General");
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [attendanceColWidths, setAttendanceColWidths] = useState([90, 90]);
  const [pairingsColWidths, setPairingsColWidths] = useState([110, 110, 60, 60, 55, 55, 90]);
  const [currentTeamColWidth, setCurrentTeamColWidth] = useState(90);
  const [currentBoutColWidth, setCurrentBoutColWidth] = useState(90);
  const [availableTeamColWidth, setAvailableTeamColWidth] = useState(90);

  const sharedColumnWidths = {
    last: pairingsColWidths[0],
    first: pairingsColWidths[1],
    age: pairingsColWidths[2],
    weight: pairingsColWidths[3],
    exp: pairingsColWidths[4],
    skill: pairingsColWidths[5],
    matches: pairingsColWidths[6],
  };

  const currentColumnWidths = [
    sharedColumnWidths.last,
    sharedColumnWidths.first,
    currentTeamColWidth,
    sharedColumnWidths.age,
    sharedColumnWidths.weight,
    sharedColumnWidths.exp,
    sharedColumnWidths.skill,
    sharedColumnWidths.matches,
    currentBoutColWidth,
  ];

  const availableColumnWidths = [
    sharedColumnWidths.last,
    sharedColumnWidths.first,
    availableTeamColWidth,
    sharedColumnWidths.age,
    sharedColumnWidths.weight,
    sharedColumnWidths.exp,
    sharedColumnWidths.skill,
    sharedColumnWidths.matches,
  ];
  const resizeRef = useRef<{ kind: "attendance" | "pairings" | "current" | "available"; index: number; startX: number; startWidth: number } | null>(null);
  const lastSavedNameRef = useRef("");
  const nameSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [pairingsTeamId, setPairingsTeamId] = useState<string | null>(null);
  const [selectedPairingId, setSelectedPairingId] = useState<string | null>(null);
  const [attendanceSort, setAttendanceSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const [pairingsSort, setPairingsSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const currentSort = useMemo(() => ({ key: "last", dir: "asc" as const }), []);
  const [availableSort, setAvailableSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "score", dir: "asc" });
  const [authMsg, setAuthMsg] = useState("");
  const [editAllowed, setEditAllowed] = useState(true);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const lockStatusRef = useRef<LockState["status"]>("loading");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const candidatesReqIdRef = useRef(0);

  const [settings, setSettings] = useState({
    maxAgeGapDays: DEFAULT_MAX_AGE_GAP_DAYS,
    maxWeightDiffPct: 12,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: false,
  });
  const [ageDiffInput, setAgeDiffInput] = useState(String(DEFAULT_MAX_AGE_GAP_DAYS / daysPerYear));
  useEffect(() => {
    const years = settings.maxAgeGapDays / daysPerYear;
    setAgeDiffInput(Number.isFinite(years) ? String(years) : "");
  }, [settings.maxAgeGapDays, daysPerYear]);
  const [candidateRefreshVersion, setCandidateRefreshVersion] = useState(0);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [showAutoPairingsModal, setShowAutoPairingsModal] = useState(false);
  const [autoPairingsLoading, setAutoPairingsLoading] = useState(false);
  const [autoPairingsError, setAutoPairingsError] = useState<string | null>(null);

  async function rerunAutoPairings() {
    setAutoPairingsError(null);
    setAutoPairingsLoading(true);
    try {
      const clearRes = await fetch(`/api/meets/${meetId}/pairings`, { method: "DELETE" });
      if (!clearRes.ok) {
        const errorText = await clearRes.text();
        throw new Error(errorText || "Unable to clear existing bouts.");
      }
      const payload = {
        maxAgeGapDays: settings.maxAgeGapDays,
        maxWeightDiffPct: settings.maxWeightDiffPct,
        firstYearOnlyWithFirstYear: settings.firstYearOnlyWithFirstYear,
        allowSameTeamMatches: settings.allowSameTeamMatches,
      };
      const generateRes = await fetch(`/api/meets/${meetId}/pairings/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!generateRes.ok) {
        const json = await generateRes.json().catch(() => null);
        throw new Error(json?.error ?? "Unable to generate new pairings.");
      }
      await load();
      await loadActivity();
      setShowAutoPairingsModal(false);
    } catch (err) {
      setAutoPairingsError(err instanceof Error ? err.message : "Unable to rerun auto pairings.");
    } finally {
      setAutoPairingsLoading(false);
    }
  }

  const [showAttendance, setShowAttendance] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserTeamId, setCurrentUserTeamId] = useState<string | null>(null);
  const [showAddWrestler, setShowAddWrestler] = useState(false);
  const [newWrestlerFirst, setNewWrestlerFirst] = useState("");
  const [newWrestlerLast, setNewWrestlerLast] = useState("");
  const [newWrestlerBirthdate, setNewWrestlerBirthdate] = useState("");
  const [newWrestlerWeight, setNewWrestlerWeight] = useState("");
  const [newWrestlerExp, setNewWrestlerExp] = useState("0");
  const [newWrestlerSkill, setNewWrestlerSkill] = useState("0");
  const [activeTab, setActiveTab] = useState<"pairings" | "matboard" | "wall">("pairings");
  const [wallRefreshIndex, setWallRefreshIndex] = useState(0);
  const [addWrestlerMsg, setAddWrestlerMsg] = useState("");
  const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
  const [meetLocation, setMeetLocation] = useState<string | null>(null);

  const [target, setTarget] = useState<Wrestler | null>(null);
  const pairingMenuRef = useRef<HTMLDivElement | null>(null);
  const [pairingContext, setPairingContext] = useState<{ x: number; y: number; wrestler: Wrestler } | null>(null);
  const targetAge = target ? ageYears(target.birthdate)?.toFixed(1) : null;
  const attendanceStatusStyles: Record<Exclude<AttendanceStatus, "COMING">, { background: string; borderColor: string }> = {
    NOT_COMING: { background: "#f0f0f0", borderColor: "#cfcfcf" },
    LATE: { background: "#dff1ff", borderColor: "#b6defc" },
    EARLY: { background: "#f3eadf", borderColor: "#e2c8ad" },
  };
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  function updateLockState(next: LockState) {
    lockStatusRef.current = next.status;
    setLockState(next);
  }

  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.status === 401) {
      setAuthMsg("Please sign in to edit this meet.");
      return;
    }
    if (res.status === 403) {
      const json = await res.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to edit this meet.");
      setEditAllowed(false);
      return;
    }
    if (res.ok) {
      const json = await res.json();
      updateLockState({
        status: "acquired",
        lockExpiresAt: json.lockExpiresAt ?? null,
      });
      return;
    }

    if (res.status === 409) {
      const json = await res.json();
      updateLockState({
        status: "locked",
        lockedByUsername: json.lockedByUsername ?? "another user",
        lockExpiresAt: json.lockExpiresAt ?? null,
      });
      return;
    }

    updateLockState({ status: "locked", lockedByUsername: "unknown user" });
  }

  function releaseLock() {
    fetch(`/api/meets/${meetId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
  }

  function teamName(id: string) {
    const team = teams.find(t => t.id === id);
    return team?.symbol ?? team?.name ?? id;
  }
  function teamSymbol(id: string) {
    const team = teams.find(t => t.id === id);
    return team?.symbol ?? team?.name ?? id;
  }
  function teamColor(id: string) {
    return teams.find(t => t.id === id)?.color ?? "#000000";
  }
  function contrastText(color?: string) {
    if (!color?.startsWith("#")) return "#ffffff";
    const hex = color.slice(1);
    if (hex.length !== 6) return "#ffffff";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#ffffff";
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  }
  function statusLabel(status: AttendanceStatus | string | null | undefined) {
    if (!status || status === "NO_RESPONSE") return "Coming";
    if (status === "NOT_COMING") return "Not Coming";
    if (status === "COMING") return "Coming";
    if (status === "LATE") return "Arrive Late";
    if (status === "EARLY") return "Leave Early";
    if (status === "ABSENT") return "Not Coming";
    return status;
  }
  function statusColor(status: AttendanceStatus | null | undefined) {
    if (!status) return "#e6f6ea";
    if (status === "COMING") return "#e6f6ea";
    if (status === "NOT_COMING" || (status as string) === "ABSENT") return "#f0f0f0";
    if (status === "LATE") return "#dff1ff";
    if (status === "EARLY") return "#f3eadf";
    return "#ffffff";
  }
  function isNotAttending(status: AttendanceStatus | null | undefined) {
    return status === "NOT_COMING" || (status as string) === "ABSENT";
  }
  function ageYears(birthdate?: string) {
    if (!birthdate) return null;
    const bDate = new Date(birthdate);
    if (Number.isNaN(bDate.getTime())) return null;
    const now = new Date();
    const days = Math.floor((now.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
    return days / daysPerYear;
  }
  function boutNumber(mat?: number | null, order?: number | null) {
    if (!mat || !order) return "";
    const suffix = String(order).padStart(2, "0");
    return `${mat}${suffix}`;
  }
  function sortValueCompare(a: string | number | null | undefined, b: string | number | null | undefined, dir: "asc" | "desc") {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return dir === "asc" ? a - b : b - a;
    const aStr = String(a);
    const bStr = String(b);
    return dir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  }
  function toggleSort(
    setter: React.Dispatch<React.SetStateAction<{ key: string; dir: "asc" | "desc" }>>,
    key: string,
  ) {
    setter((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  function sortIndicator(sort: { key: string; dir: "asc" | "desc" }, key: string) {
    if (sort.key !== key) return null;
    return <span style={{ fontSize: 10, marginLeft: 4 }}>{sort.dir === "asc" ? "▲" : "▼"}</span>;
  }

  const load = useCallback(async () => {
    const [bRes, wRes, mRes, meRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/pairings`),
      fetch(`/api/meets/${meetId}/wrestlers`),
      fetch(`/api/meets/${meetId}`),
      fetch("/api/me"),
    ]);
    if ([bRes, wRes, mRes].some(r => r.status === 401)) {
      setAuthMsg("Please sign in to view this meet.");
      return;
    }
    if ([bRes, wRes, mRes].some(r => r.status === 403)) {
      const json = await mRes.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to view this meet.");
      setEditAllowed(false);
      return;
    }

    const bJson: Bout[] = await bRes.json();
    const wJson = await wRes.json();

    setBouts(bJson);
    setTeams(wJson.teams);
    setWrestlers(wJson.wrestlers);
    setCandidateRefreshVersion((prev) => prev + 1);

    const map: Record<string, Wrestler | undefined> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);

    if (mRes.ok) {
      const meetJson = await mRes.json();
      setMeetName(meetJson.name ?? "");
      lastSavedNameRef.current = meetJson.name ?? "";
      setMeetDate(meetJson.date ?? null);
      setSettings(s => ({
        ...s,
        allowSameTeamMatches: Boolean(meetJson.allowSameTeamMatches),
      }));
      setMeetStatus(meetJson.status ?? "DRAFT");
      setLastUpdatedAt(meetJson.updatedAt ?? null);
      setLastUpdatedBy(meetJson.updatedBy?.username ?? null);
      setHomeTeamId(meetJson.homeTeamId ?? null);
      setMeetLocation(meetJson.location ?? null);
    }
    if (meRes.ok) {
      const meJson = await meRes.json().catch(() => ({}));
      setCurrentUserRole(meJson?.role ?? null);
      setCurrentUserTeamId(meJson?.teamId ?? null);
    }
  }, [meetId]);

  const loadActivity = useCallback(async () => {
    const [changesRes, commentsRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/changes`),
      fetch(`/api/meets/${meetId}/comments`),
    ]);
    if (changesRes.ok) {
      const changesJson = await changesRes.json().catch(() => []);
      setChanges(Array.isArray(changesJson) ? changesJson : []);
    }
    if (commentsRes.ok) {
      const commentsJson = await commentsRes.json().catch(() => []);
      setComments(Array.isArray(commentsJson) ? commentsJson : []);
    }
  }, [meetId]);


  const canEdit =
    editAllowed && lockState.status === "acquired" && meetStatus === "DRAFT";
  const canChangeStatus = editAllowed && lockState.status === "acquired";
  const restartDisabled = !canEdit || meetStatus === "PUBLISHED";
  const handleRestartClick = () => {
    if (restartDisabled) return;
    setRestartError(null);
    setShowRestartModal(true);
  };

  useEffect(() => { void load(); void loadActivity(); }, [load, loadActivity]);
  useEffect(() => {
    const handleFocus = () => {
      void load();
      void loadActivity();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [load, loadActivity]);
  useEffect(() => {
    if (teams.length === 0) {
      if (activeTeamId) setActiveTeamId(null);
      return;
    }
    if (!activeTeamId || !teams.some(t => t.id === activeTeamId)) {
      setActiveTeamId(teams[0]?.id ?? null);
    }
  }, [teams, activeTeamId]);
  useEffect(() => {
    if (teams.length === 0) {
      if (pairingsTeamId) setPairingsTeamId(null);
      return;
    }
    if (!pairingsTeamId || !teams.some(t => t.id === pairingsTeamId)) {
      setPairingsTeamId(teams[0]?.id ?? null);
    }
  }, [teams, pairingsTeamId]);

  useEffect(() => {
    if (!canEdit) return;
    const trimmed = meetName.trim();
    if (trimmed.length < 2) return;
    if (trimmed === lastSavedNameRef.current) return;
    if (nameSaveTimeoutRef.current) {
      clearTimeout(nameSaveTimeoutRef.current);
    }
    nameSaveTimeoutRef.current = setTimeout(() => {
      void saveMeetName();
    }, 800);
    return () => {
      if (nameSaveTimeoutRef.current) {
        clearTimeout(nameSaveTimeoutRef.current);
        nameSaveTimeoutRef.current = null;
      }
    };
  }, [meetName, canEdit]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current) return;
      const { kind, index, startX, startWidth } = resizeRef.current;
      const delta = e.clientX - startX;

      if (kind === "attendance") {
        const nextWidth = Math.max(60, startWidth + delta);
        setAttendanceColWidths((prev) => prev.map((w, i) => (i === index ? nextWidth : w)));
      } else if (kind === "pairings") {
        const nextWidth = Math.max(40, startWidth + delta);
        setPairingsColWidths((prev) => prev.map((w, i) => (i === index ? nextWidth : w)));
      } else if (kind === "current") {
        const pairingsIndex = CURRENT_SHARED_COLUMN_MAP[index];
        if (pairingsIndex !== undefined) {
          const nextWidth = Math.max(40, startWidth + delta);
          setPairingsColWidths((prev) => prev.map((w, i) => (i === pairingsIndex ? nextWidth : w)));
        } else if (index === 2) {
          const nextWidth = Math.max(60, startWidth + delta);
          setCurrentTeamColWidth(nextWidth);
        } else if (index === 8) {
          const nextWidth = Math.max(60, startWidth + delta);
          setCurrentBoutColWidth(nextWidth);
        }
      } else {
        const pairingsIndex = AVAILABLE_SHARED_COLUMN_MAP[index];
        if (pairingsIndex !== undefined) {
          const nextWidth = Math.max(40, startWidth + delta);
          setPairingsColWidths((prev) => prev.map((w, i) => (i === pairingsIndex ? nextWidth : w)));
        } else if (index === 2) {
          const nextWidth = Math.max(60, startWidth + delta);
          setAvailableTeamColWidth(nextWidth);
        }
      }
    }

    function onMouseUp() {
      resizeRef.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
  useEffect(() => {
    if (!editAllowed) return;
    void acquireLock();
    const interval = setInterval(() => {
      if (lockStatusRef.current === "acquired") {
        void acquireLock();
      }
    }, 60_000);
    const onBeforeUnload = () => releaseLock();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseLock();
    };
  }, [meetId, editAllowed]);

  const matchedIds = new Set<string>();
  for (const b of bouts) { matchedIds.add(b.redId); matchedIds.add(b.greenId); }
  const rosterSorted = [...wrestlers].sort((a, b) => {
    const teamA = teamName(a.teamId);
    const teamB = teamName(b.teamId);
    if (teamA !== teamB) return teamA.localeCompare(teamB);
    const last = a.last.localeCompare(b.last);
    if (last !== 0) return last;
    return a.first.localeCompare(b.first);
  });
  const attendanceTeamId = pairingsTeamId ?? activeTeamId;
  const attendanceRoster = attendanceTeamId
    ? rosterSorted.filter(w => w.teamId === attendanceTeamId)
    : rosterSorted;
  const attendanceSorted = [...attendanceRoster].sort((a, b) => {
    const getValue = (w: Wrestler) => {
      if (attendanceSort.key === "last") return w.last;
      if (attendanceSort.key === "first") return w.first;
      if (attendanceSort.key === "status") return statusLabel(w.status ?? null);
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), attendanceSort.dir);
  });
  const attendingByTeam = pairingsTeamId
    ? rosterSorted.filter(w => w.teamId === pairingsTeamId && !isNotAttending(w.status))
    : rosterSorted.filter(w => !isNotAttending(w.status));
  const pairingsSorted = [...attendingByTeam].sort((a, b) => {
    const getValue = (w: Wrestler) => {
      if (pairingsSort.key === "last") return w.last;
      if (pairingsSort.key === "first") return w.first;
      if (pairingsSort.key === "age") return ageYears(w.birthdate) ?? null;
      if (pairingsSort.key === "weight") return w.weight;
      if (pairingsSort.key === "exp") return w.experienceYears;
      if (pairingsSort.key === "skill") return w.skill;
      if (pairingsSort.key === "matches") return matchCounts[w.id] ?? 0;
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), pairingsSort.dir);
  });
  const matchCounts = bouts.reduce((acc, bout) => {
    acc[bout.redId] = (acc[bout.redId] ?? 0) + 1;
    acc[bout.greenId] = (acc[bout.greenId] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  async function loadCandidates(wrestlerId: string, overrides?: Partial<typeof settings>) {
    if (!wrestlerId) {
      setCandidates([]);
      return;
    }
    const effectiveSettings = { ...settings, ...overrides };
    const qs = new URLSearchParams({
      wrestlerId,
      limit: "20",
      maxAgeGapDays: String(effectiveSettings.maxAgeGapDays),
      maxWeightDiffPct: String(effectiveSettings.maxWeightDiffPct),
      firstYearOnlyWithFirstYear: String(effectiveSettings.firstYearOnlyWithFirstYear),
      allowSameTeamMatches: String(effectiveSettings.allowSameTeamMatches),
    });
    const reqId = candidatesReqIdRef.current + 1;
    candidatesReqIdRef.current = reqId;
    const res = await fetch(`/api/meets/${meetId}/candidates?${qs.toString()}`);
    if (reqId !== candidatesReqIdRef.current) return;
    if (!res.ok) return;
    const json = await res.json();
    setCandidates(json.candidates ?? []);
  }

  function refreshAfterMatAssignments() {
    void load();
    void loadActivity();
    setWallRefreshIndex(idx => idx + 1);
  }

  useEffect(() => {
    if (attendingByTeam.length === 0) {
      setSelectedPairingId(null);
      return;
    }
    if (!selectedPairingId || !attendingByTeam.some(w => w.id === selectedPairingId)) {
      const nextId = attendingByTeam[0].id;
      setSelectedPairingId(nextId);
    }
  }, [attendingByTeam, selectedPairingId]);

  useEffect(() => {
    if (!selectedPairingId) {
      setTarget(null);
      return;
    }
    setTarget(wMap[selectedPairingId] ?? null);
  }, [selectedPairingId, wMap]);

  useEffect(() => {
    if (!pairingContext) return;
    const handleMouseDown = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (pairingMenuRef.current && targetNode && pairingMenuRef.current.contains(targetNode)) return;
      setPairingContext(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPairingContext(null);
      }
    };
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [pairingContext]);

  const candidateFetchConfig = useMemo(() => ({
    maxAgeGapDays: settings.maxAgeGapDays,
    maxWeightDiffPct: settings.maxWeightDiffPct,
    firstYearOnlyWithFirstYear: settings.firstYearOnlyWithFirstYear,
    allowSameTeamMatches: settings.allowSameTeamMatches,
    version: candidateRefreshVersion,
  }), [
    settings.maxAgeGapDays,
    settings.maxWeightDiffPct,
    settings.firstYearOnlyWithFirstYear,
    settings.allowSameTeamMatches,
    candidateRefreshVersion,
  ]);

  useEffect(() => {
    if (!selectedPairingId) {
      setCandidates([]);
      return;
    }
    const { version, ...query } = candidateFetchConfig;
    void loadCandidates(selectedPairingId, query);
  }, [selectedPairingId, candidateFetchConfig]);
  const attendanceCounts = attendanceRoster.reduce(
    (acc, w) => {
      const status = w.status ?? null;
      if (status === "NOT_COMING") acc.notComing += 1;
      else acc.coming += 1;
      return acc;
    },
    { coming: 0, notComing: 0 }
  );
  const teamList = teams.map(t => t.symbol ?? t.name).filter(Boolean).join(", ");
  const formattedDate = meetDate
    ? new Date(meetDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const metadataParts = [formattedDate, teamList].filter(Boolean);
  const homeTeam = homeTeamId ? teams.find(t => t.id === homeTeamId) ?? null : null;
  const homeLocationDisplay = meetLocation?.trim() || homeTeam?.address?.trim() || null;
  const addWrestlerTeamLabel = attendanceTeamId
    ? teams.find(t => t.id === attendanceTeamId)?.name ?? "Selected Team"
    : "Selected Team";
  const isAttendanceTeamCoach =
    currentUserRole === "COACH" &&
    attendanceTeamId !== null &&
    currentUserTeamId !== null &&
    currentUserTeamId === attendanceTeamId;
  const canEditRoster = currentUserRole === "ADMIN" || isAttendanceTeamCoach;

  const currentMatches = target
    ? bouts.filter(b => b.redId === target.id || b.greenId === target.id)
    : [];
  const currentMatchRows = currentMatches.map((b) => {
    const opponentId = b.redId === target?.id ? b.greenId : b.redId;
    return {
      bout: b,
      opponentId,
      opponent: opponentId ? wMap[opponentId] : undefined,
      boutOrder: (b.mat ?? 0) * 100 + (b.order ?? 0),
    };
  });
  const currentSorted = [...currentMatchRows].sort((a, b) => {
    const getValue = (row: typeof currentMatchRows[number]) => {
      const o = row.opponent;
      if (currentSort.key === "last") return o?.last ?? "";
      if (currentSort.key === "first") return o?.first ?? "";
      if (currentSort.key === "team") return teamSymbol(o?.teamId ?? "");
      if (currentSort.key === "age") return ageYears(o?.birthdate) ?? null;
      if (currentSort.key === "weight") return o?.weight ?? null;
      if (currentSort.key === "exp") return o?.experienceYears ?? null;
      if (currentSort.key === "skill") return o?.skill ?? null;
      if (currentSort.key === "matches") return matchCounts[row.opponentId] ?? 0;
      if (currentSort.key === "bout") return row.boutOrder;
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), currentSort.dir);
  });
  const availableFiltered = candidates
    .filter((c) => settings.allowSameTeamMatches || c.opponent.teamId !== target?.teamId)
    .filter((c) => {
      if (!settings.firstYearOnlyWithFirstYear) return true;
      const o = c.opponent;
      const tFirst = (target?.experienceYears ?? 0) <= 0;
      const oFirst = o.experienceYears <= 0;
      return tFirst === oFirst;
    })
    .filter((c) => {
      if (!target) return true;
      const opponent = c.opponent;
      return !bouts.some(b =>
        (b.redId === target.id && b.greenId === opponent.id) ||
        (b.greenId === target.id && b.redId === opponent.id)
      );
    })
    .map((c) => ({ opponent: c.opponent, score: c.score }));
  const availableSorted = [...availableFiltered].sort((a, b) => {
    const getValue = (row: { opponent: Wrestler; score: number }) => {
      const w = row.opponent;
      if (availableSort.key === "score") return row.score;
      if (availableSort.key === "last") return w.last;
      if (availableSort.key === "first") return w.first;
      if (availableSort.key === "team") return teamSymbol(w.teamId);
      if (availableSort.key === "age") return ageYears(w.birthdate) ?? null;
      if (availableSort.key === "weight") return w.weight;
      if (availableSort.key === "exp") return w.experienceYears;
      if (availableSort.key === "skill") return w.skill;
      if (availableSort.key === "matches") return matchCounts[w.id] ?? 0;
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), availableSort.dir);
  });
  async function restartMeetSetup() {
    if (!canEdit) return;
    setRestartLoading(true);
    setRestartError(null);
    try {
    const res = await fetch(`/api/meets/${meetId}`, {
      method: "DELETE",
    });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to restart meet setup.");
      }
      setShowRestartModal(false);
      const defaults = {
        name: meetName ?? undefined,
        date: meetDate ? meetDate.slice(0, 10) : undefined,
        location: meetLocation ?? undefined,
        homeTeamId: homeTeamId ?? undefined,
        teamIds: teams.map(team => team.id),
      };
      const params = new URLSearchParams();
      params.set("create", "1");
      params.set("defaults", encodeURIComponent(JSON.stringify(defaults)));
      void router.push(`/meets?${params.toString()}`);
    } catch (err) {
      console.error(err);
      setRestartError(err instanceof Error ? err.message : "Unable to restart meet setup.");
    } finally {
      setRestartLoading(false);
    }
  }

  async function addMatch(redId: string, greenId: string) {
    if (!canEdit) return;
    await fetch(`/api/meets/${meetId}/pairings/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redId, greenId }),
    });
    await load();
    await loadActivity();
    if (selectedPairingId) {
      await loadCandidates(selectedPairingId);
    }
  }

  async function updateWrestlerStatus(wrestlerId: string, status: AttendanceStatus | null) {
    await fetch(`/api/meets/${meetId}/wrestlers/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrestlerId, status }),
    });
    await load();
    await loadActivity();
    if (isNotAttending(status)) {
      setTarget(null);
      setCandidates([]);
    } else if (target?.id === wrestlerId) {
      await loadCandidates(wrestlerId);
    }
  }

  async function handlePairingContextStatus(status: AttendanceStatus | null) {
    if (!pairingContext) return;
    await updateWrestlerStatus(pairingContext.wrestler.id, status);
    setPairingContext(null);
  }

  async function removeBout(boutId: string) {
    if (!canEdit) return;
    await fetch(`/api/bouts/${boutId}`, { method: "DELETE" });
    await load();
    await loadActivity();
    if (target) await loadCandidates(target.id);
  }

  async function updateMeetStatus(nextStatus: "DRAFT" | "PUBLISHED") {
    if (!canChangeStatus) return;
    await fetch(`/api/meets/${meetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    await load();
    await loadActivity();
  }

  async function saveMeetName() {
    if (!canEdit) return;
    const trimmed = meetName.trim();
    if (trimmed.length < 2) return;
    if (trimmed === lastSavedNameRef.current) return;
    await fetch(`/api/meets/${meetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    lastSavedNameRef.current = trimmed;
    await load();
    await loadActivity();
  }

  async function submitComment() {
    const body = commentBody.trim();
    if (!body) return;
    await fetch(`/api/meets/${meetId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, section: commentSection }),
    });
    setCommentBody("");
    await load();
    await loadActivity();
  }

  async function bulkAttendance(action: "CLEAR" | "SET", status?: AttendanceStatus | null) {
    if (!canEdit) return;
    await fetch(`/api/meets/${meetId}/wrestlers/status/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, status: status ?? null, teamId: activeTeamId }),
    });
    await load();
    await loadActivity();
    setSelectedPairingId(null);
  }

  async function submitAddWrestler() {
    if (!attendanceTeamId) return;
    setAddWrestlerMsg("");
    const weightValue = Number(newWrestlerWeight);
    const expValue = Number(newWrestlerExp);
    const skillValue = Number(newWrestlerSkill);
    if (!newWrestlerFirst.trim() || !newWrestlerLast.trim()) {
      setAddWrestlerMsg("First and last name are required.");
      return;
    }
    if (!newWrestlerBirthdate) {
      setAddWrestlerMsg("Birthdate is required.");
      return;
    }
    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      setAddWrestlerMsg("Weight must be a positive number.");
      return;
    }
    const res = await fetch(`/api/teams/${attendanceTeamId}/wrestlers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first: newWrestlerFirst.trim(),
        last: newWrestlerLast.trim(),
        weight: weightValue,
        birthdate: newWrestlerBirthdate,
        experienceYears: Number.isFinite(expValue) ? expValue : 0,
        skill: Number.isFinite(skillValue) ? skillValue : 0,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setAddWrestlerMsg(json?.error ?? "Unable to add wrestler.");
      return;
    }
    setNewWrestlerFirst("");
    setNewWrestlerLast("");
    setNewWrestlerBirthdate("");
    setNewWrestlerWeight("");
    setNewWrestlerExp("0");
    setNewWrestlerSkill("0");
    setShowAddWrestler(false);
    await load();
  }

  return (
    <main className="meet-detail">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --accent: #1e88e5;
          --line: #d5dbe2;
          --warn: #b00020;
        }
        .meet-detail {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .meet-detail a {
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
        }
        .meet-detail a:hover {
          color: var(--accent);
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          border-bottom: 1px solid var(--line);
          padding-bottom: 12px;
          margin-bottom: 12px;
        }
        .topbar .nav {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .nav-btn {
          color: var(--ink);
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 10px;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.5px;
          cursor: pointer;
        }
        .nav-btn:hover {
          background: #f7f9fb;
        }
        .nav-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
          color: var(--muted);
          border-color: var(--line);
          background: transparent;
        }
        .subnav {
          display: flex;
          gap: 14px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .subnav a {
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid transparent;
        }
        .subnav a:hover {
          border-color: var(--line);
          background: #f7f9fb;
        }
        .tab-bar {
          display: flex;
          justify-content: flex-start;
          gap: 4px;
          margin-bottom: 0;
          padding: 0 8px;
          background: #f1f3f7;
          border: 1px solid #d0d5df;
          border-bottom: none;
          border-radius: 16px 16px 0 0;
          box-shadow: inset 0 -1px 0 rgba(13, 23, 66, 0.08);
        }
        .setup-control-row {
          margin-top: 22px;
        }
        .tab-button {
          flex: none;
          padding: 8px 14px;
          font-size: 14px;
          font-weight: 600;
          color: #5f6772;
          background: transparent;
          border: 1px solid transparent;
          border-bottom: 1px solid transparent;
          border-radius: 12px 12px 0 0;
          cursor: pointer;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .tab-button + .tab-button {
          margin-left: 4px;
        }
        .tab-button:hover:not(.active) {
          background: #e5e9f0;
          color: #1e3a82;
        }
        .tab-button.active {
          background: #fff;
          color: #1e2a4b;
          border-color: #d0d5df;
          border-bottom-color: #fff;
          box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.08);
        }
        .tab-button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
        .tab-body {
          margin-top: -1px;
          padding-top: 0;
          border: 1px solid #d0d5df;
          border-top: none;
          border-radius: 0 0 16px 16px;
          background: #fff;
        }
        .tab-body > *:first-child {
          margin-top: 0;
        }
        .meet-heading-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .meet-heading-title {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .meet-home-info {
          font-size: 14px;
          color: var(--muted);
          display: flex;
          gap: 8px;
          align-items: center;
          flex: 1;
          min-width: 0;
        }
        .meet-home-info .home-label {
          font-weight: 600;
          color: var(--ink);
        }
        .meet-home-info span {
          display: inline-flex;
          align-items: center;
        }
        .meet-home-info .home-team-name {
          font-weight: 600;
          color: var(--ink);
        }
        .meet-home-info .home-location {
          font-size: 13px;
          color: var(--muted);
        }
        .meet-heading-actions {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 12px;
          margin-left: auto;
          position: relative;
          z-index: 10;
        }
        .meet-status {
          font-size: 13px;
          color: #5b6472;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .meet-last-updated {
          font-size: 11px;
          color: #7a8290;
        }
        .meet-name-btn {
          font-size: 20px;
          font-weight: 700;
          line-height: 1;
          background: transparent;
          border: none;
          color: var(--ink);
          padding: 0;
          cursor: pointer;
        }
        .meet-name-btn:hover,
        .meet-name-btn:focus-visible {
          text-decoration: underline;
        }
        .meet-metadata {
          font-size: 16px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 12px;
          letter-spacing: 0.8px;
        }
        h2 {
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        input, select, textarea, button {
          font-family: inherit;
        }
        input, select, textarea {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 8px;
        }
        .notice {
          border: 1px solid #e8c3c3;
          background: #fff3f3;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 12px;
          color: var(--warn);
        }
        .panel {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 12px;
        }
        .panel.fill {
          display: flex;
          flex-direction: column;
          height: 320px;
        }
        .panel-title {
          margin: 0 0 8px;
        }
        .panel-scroll {
          max-height: 260px;
          overflow-y: scroll;
          padding-right: 6px;
        }
        .panel-scroll.fill {
          flex: 1;
          max-height: none;
          min-height: 0;
        }
        .attendance-table {
          table-layout: fixed;
          width: fit-content;
          max-width: 100%;
        }
        .pairings-table {
          table-layout: fixed;
          width: fit-content;
          max-width: 100%;
        }
        .pairings-table tbody tr:hover {
          background: #f7f9fb;
        }
        .pairings-table th,
        .pairings-table td,
        .attendance-table th,
        .attendance-table td {
          padding: 3px 6px;
          line-height: 1.2;
          font-size: 14px;
        }
        .match-row-hover:hover {
          box-shadow: 0 0 0 2px #1e88e5 inset;
          background: #f2f8ff;
        }
        .attendance-th {
          position: relative;
          padding-right: 18px;
        }
        .pairings-th {
          position: relative;
          padding-right: 18px;
        }
        .sortable-th {
          cursor: pointer;
          user-select: none;
        }
        .sortable-th:hover {
          color: var(--accent);
          background: #f7f9fb;
        }
        .pairings-table-wrapper {
          margin-top: 12px;
          max-height: calc(23 * 25px + 48px);
          overflow-y: auto;
        }
        .pairings-table thead th {
          position: sticky;
          top: 0;
          background: var(--card);
          z-index: 2;
        }
        .pairings-heading {
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .col-resizer {
          position: absolute;
          right: 2px;
          top: 0;
          width: 10px;
          height: 100%;
          cursor: col-resize;
          user-select: none;
          background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0) 100%);
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
        .tag {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 6px;
          border: 1px solid var(--line);
          background: #f7f9fb;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .wrestler-link {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }
        .wrestler-link:hover {
          text-decoration: underline;
          text-decoration-thickness: 2px;
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          border-radius: 4px;
        }
        .wrestler-link:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999;
        }
        .modal-card {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 16px;
          width: min(460px, 92vw);
          display: grid;
          gap: 10px;
        }
        .modal-row {
          display: grid;
          gap: 6px;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        .pairings-context-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
        }
        .pairings-context-menu {
          position: fixed;
          z-index: 1201;
          width: 210px;
          padding: 8px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          display: grid;
          gap: 6px;
        }
        .pairings-context-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
        }
        .pairings-context-item {
          border: none;
          border-radius: 6px;
          padding: 6px 8px;
          text-align: left;
          cursor: pointer;
          font-size: 13px;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .pairings-context-item:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
        .pairings-context-item:hover {
          transform: translateY(-1px);
        }
        .wall-chart-section {
          margin-top: 24px;
        }
        @media print {
          body {
            background: #fff;
          }
          .meet-detail {
            padding: 0;
          }
          .meet-detail > :not(.wall-chart-section) {
            display: none !important;
          }
          .wall-chart-section {
            margin-top: 0;
          }
        }
      `}</style>
      <AppHeader links={headerLinks} />
      <div className="meet-heading-row">
        <div className="meet-heading-title">
          {!isEditingName && (
            <button
              type="button"
              className="meet-name-btn"
              onClick={() => setIsEditingName(true)}
              disabled={!canEdit}
            >
              {meetName || "this meet"}
            </button>
          )}
          {isEditingName && (
            <>
              <input
                value={meetName}
                onChange={(e) => setMeetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setIsEditingName(false);
                  }
                }}
                placeholder=""
                disabled={!canEdit}
                style={{ minWidth: 220 }}
              />
              <button
                className="nav-btn"
                onClick={() => setIsEditingName(false)}
                disabled={!canEdit}
              >
                Done
              </button>
            </>
          )}
        </div>
        {(homeTeam || homeLocationDisplay) && (
          <div className="meet-home-info">
            <span className="home-label">Home team:</span>
            {homeTeam && (
              <span className="home-team-name">
                {homeTeam.name}
                {homeTeam.symbol ? ` (${homeTeam.symbol})` : ""}
              </span>
            )}
            {homeLocationDisplay && (
              <span className="home-location">· {homeLocationDisplay}</span>
            )}
          </div>
        )}
        <div className="meet-heading-actions">
          <div className="meet-status">
            <span>
              Status: <b>{meetStatus === "PUBLISHED" ? "Published" : "Draft"}</b>
            </span>
            {lastUpdatedAt && (
              <span className="meet-last-updated">
                Last updated {new Date(lastUpdatedAt).toLocaleString()} by {lastUpdatedBy ?? "unknown"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {activeTab === "pairings" && (
              <button
                type="button"
                className="nav-btn delete-btn"
                onClick={handleRestartClick}
                disabled={restartDisabled}
              >
                Restart Meet Setup
              </button>
            )}
            <button
              className="nav-btn"
              onClick={() => updateMeetStatus(meetStatus === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}
              disabled={!canChangeStatus}
            >
              {meetStatus === "PUBLISHED" ? "Reopen Draft" : "Publish"}
            </button>
          </div>
        </div>
      </div>
      {metadataParts.length > 0 && <div className="meet-metadata">{metadataParts.join(" · ")}</div>}
      <div className="tab-bar">
          {[
            { key: "pairings", label: "Pairings" },
          { key: "matboard", label: "Mat Assignments" },
          { key: "wall", label: "Wall Charts" },
        ].map(tab => (
          <button
            key={tab.key}
            className={`tab-button${activeTab === tab.key ? " active" : ""}`}
            onClick={() => {
              setActiveTab(tab.key as typeof activeTab);
              if (tab.key === "wall") {
                setWallRefreshIndex(idx => idx + 1);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-body">
        {activeTab === "pairings" && (
          <>
          {authMsg && (
            <div className="notice">
              {authMsg}
            </div>
          )}

          {lockState.status === "locked" && (
            <div className="notice">
              Editing locked by {lockState.lockedByUsername ?? "another user"}. Try again when they are done.
              <button className="nav-btn" onClick={acquireLock} style={{ marginLeft: 10 }}>Try again</button>
            </div>
          )}

      {meetStatus === "PUBLISHED" && (
        <div className="notice" style={{ marginTop: 16 }}>
          Meet has been published, so matches may not be changed. Reopen as Draft to make changes.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: 16, marginTop: 0 }}>
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Pairings</h3>
          </div>
          <div className="pairings-tab-bar">
            {teams.map(team => {
              const isActive = pairingsTeamId === team.id;
              const activeTextColor = contrastText(team.color);
              return (
              <button
                key={team.id}
                onClick={() => setPairingsTeamId(team.id)}
                className={`pairing-tab ${pairingsTeamId === team.id ? "active" : ""}`}
                style={{
                  background: isActive
                    ? (team.color ?? "#ffffff")
                    : team.color ? `${team.color}22` : undefined,
                  borderColor: team.color ?? undefined,
                  color: isActive && team.color ? activeTextColor : team.color ?? undefined,
                  borderWidth: isActive ? 2 : undefined,
                  fontWeight: isActive ? 700 : undefined,
                  boxShadow: isActive ? "0 -2px 0 #ffffff inset, 0 2px 0 rgba(0,0,0,0.12)" : undefined,
                }}
              >
                {team.symbol ? `${team.symbol} - ${team.name}` : team.name}
              </button>
            );
            })}
          </div>
        <div className="pairings-table-wrapper">
        <table className="pairings-table" cellPadding={4} style={{ borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: pairingsColWidths[0] }} />
              <col style={{ width: pairingsColWidths[1] }} />
              <col style={{ width: pairingsColWidths[2] }} />
              <col style={{ width: pairingsColWidths[3] }} />
              <col style={{ width: pairingsColWidths[4] }} />
              <col style={{ width: pairingsColWidths[5] }} />
              <col style={{ width: pairingsColWidths[6] }} />
            </colgroup>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                {[
                  { label: "Last", key: "last" },
                  { label: "First", key: "first" },
                  { label: "Age", key: "age" },
                  { label: "Weight", key: "weight" },
                  { label: "Exp", key: "exp" },
                  { label: "Skill", key: "skill" },
                  { label: "Matches", key: "matches" },
                ].map((col, index) => (
                  <th key={col.label} className="pairings-th sortable-th" onClick={() => toggleSort(setPairingsSort, col.key)}>
                    {col.label}{sortIndicator(pairingsSort, col.key)}
                    <span
                      className="col-resizer"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        resizeRef.current = {
                          kind: "pairings",
                          index,
                          startX: e.clientX,
                          startWidth: pairingsColWidths[index],
                        };
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
            {pairingsSorted.map(w => (
                <tr
                  key={w.id}
                  onClick={() => {
                    setSelectedPairingId(w.id);
                    setTarget(w);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedPairingId(w.id);
                    setTarget(w);
                    setPairingContext({ x: event.clientX, y: event.clientY, wrestler: w });
                  }}
                  style={{
                    borderTop: "1px solid #eee",
                    background: selectedPairingId === w.id ? "#e8f4ff" : undefined,
                    cursor: "pointer",
                  }}
                >
                    <td style={{ color: teamColor(w.teamId) }}>{w.last}</td>
                    <td style={{ color: teamColor(w.teamId) }}>{w.first}</td>
                    <td>{ageYears(w.birthdate)?.toFixed(1) ?? ""}</td>
                    <td>{w.weight}</td>
                    <td>{w.experienceYears}</td>
                    <td>{w.skill}</td>
                    <td>{matchCounts[w.id] ?? 0}</td>
                  </tr>
                ))}
              {attendingByTeam.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "#666" }}>No attending wrestlers.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>
                  Attendance {attendanceTeamId ? `- ${teams.find(t => t.id === attendanceTeamId)?.name ?? ""}` : ""}
                </h3>
                <button className="nav-btn" onClick={() => setShowAttendance(s => !s)}>
                  {showAttendance ? "Hide" : "Show"}
                </button>
              </div>
            {showAttendance && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <button
                    className="nav-btn"
                    onClick={() => bulkAttendance("SET", null)}
                    disabled={!canEdit}
                  >
                    Set all coming
                  </button>
                  {attendanceTeamId && (
                    <button
                      className="nav-btn"
                      onClick={() => {
                        if (!attendanceTeamId) return;
                        router.push(`/rosters?team=${attendanceTeamId}`);
                      }}
                      disabled={!canEdit || !attendanceTeamId || !canEditRoster}
                    >
                      Edit Roster
                    </button>
                  )}
                  <button
                    className="nav-btn"
                    onClick={() => {
                      setAutoPairingsError(null);
                      setShowAutoPairingsModal(true);
                    }}
                    disabled={!canEdit}
                  >
                    Re-run auto pairings
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                  Coming: {attendanceCounts.coming} - Not Coming: {attendanceCounts.notComing}
                </div>
                <table
                  className="attendance-table"
                  cellPadding={6}
                  style={{ borderCollapse: "collapse", tableLayout: "auto", width: "100%" }}
                >
                    <colgroup>
                      <col style={{ width: attendanceColWidths[0] }} />
                      <col style={{ width: attendanceColWidths[1] }} />
                      <col />
                    </colgroup>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                      {[
                        { label: "Last", key: "last", resizable: true },
                        { label: "First", key: "first", resizable: true },
                        { label: "Status", key: "status", resizable: false },
                      ].map((col, index) => (
                        <th key={col.label} className="attendance-th sortable-th" onClick={() => toggleSort(setAttendanceSort, col.key)}>
                          {col.label}{sortIndicator(attendanceSort, col.key)}
                          {col.resizable && (
                            <span
                              className="col-resizer"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                resizeRef.current = {
                                  kind: "attendance",
                                  index,
                                  startX: e.clientX,
                                  startWidth: attendanceColWidths[index],
                                };
                              }}
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                      {attendanceSorted.map(w => {
                        const isComing = !isNotAttending(w.status);
                        const isLate = w.status === "LATE";
                        const isEarly = w.status === "EARLY";
                        const nameBg = w.status === "NOT_COMING"
                          ? "#f0f0f0"
                          : w.status === "LATE" || w.status === "EARLY"
                            ? statusColor(w.status)
                            : undefined;
                        const nameColor = w.status === "NOT_COMING" ? "#8a8a8a" : undefined;
                        const nameDecoration = w.status === "NOT_COMING" ? "line-through" : undefined;
                        const toggleLabelStyle: React.CSSProperties = {
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: `1px solid ${isComing ? "#bcd8c1" : "#cfcfcf"}`,
                          background: isComing ? "#e6f6ea" : "#f0f0f0",
                          color: isComing ? "#1d232b" : "#5f6772",
                          cursor: canEdit ? "pointer" : "default",
                          transition: "background 0.2s, border-color 0.2s",
                          fontWeight: 600,
                          fontSize: 12,
                          minWidth: 0,
                        };
                        const activeStyle = (active: boolean, base: React.CSSProperties) =>
                          active
                            ? {
                                ...base,
                                fontWeight: 700,
                                opacity: 1,
                                color: "#1d232b",
                                WebkitTextFillColor: "#1d232b",
                              }
                            : base;
                        return (
                          <tr key={w.id} style={{ borderTop: "1px solid #eee" }}>
                            <td style={{ background: nameBg, color: nameColor, textDecoration: nameDecoration }}>{w.last}</td>
                            <td style={{ background: nameBg, color: nameColor, textDecoration: nameDecoration }}>{w.first}</td>
                            <td style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "nowrap",
                                  alignItems: "center",
                                  overflowX: "auto",
                                  paddingBottom: 2,
                                  whiteSpace: "nowrap",
                                  width: "100%",
                                }}
                              >
                                <label style={toggleLabelStyle}>
                                  <input
                                    type="checkbox"
                                    checked={isComing}
                                    disabled={!canEdit}
                                    onChange={(event) => {
                                      const nextStatus = event.target.checked ? null : "NOT_COMING";
                                      void updateWrestlerStatus(w.id, nextStatus);
                                    }}
                                    aria-label="Coming"
                                  />
                                  Coming
                                </label>
                                <button
                                  onClick={() => {
                                    const nextStatus = isLate ? null : "LATE";
                                    void updateWrestlerStatus(w.id, nextStatus);
                                  }}
                                  disabled={!canEdit || !isComing}
                                  style={activeStyle(isLate, { background: "#dff1ff", borderColor: "#b6defc" })}
                                >
                                  Arrive Late
                                </button>
                                <button
                                  onClick={() => {
                                    const nextStatus = isEarly ? null : "EARLY";
                                    void updateWrestlerStatus(w.id, nextStatus);
                                  }}
                                  disabled={!canEdit || !isComing}
                                  style={activeStyle(isEarly, { background: "#f3eadf", borderColor: "#e2c8ad" })}
                                >
                                  Leave Early
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {attendanceRoster.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ color: "#666" }}>No wrestlers on this team.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 10,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
              <h3 className="pairings-heading" style={{ margin: 0 }}>
                Current Matches For
              </h3>
              {target && (
                <>
                <span
                  style={{
                    color: "#111111",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 26,
                    fontWeight: 800,
                    background: "#f7f9fb",
                    border: "1px solid #d5dbe2",
                    borderRadius: 8,
                    padding: "4px 8px",
                    minWidth: 0,
                  }}
                >
                  {target.first} {target.last}
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>
                    ({teamName(target.teamId)})
                  </span>
                  <span style={{ width: 14, height: 14, background: teamColor(target.teamId), display: "inline-block", borderRadius: 3 }} />
                </span>
                <div
                   style={{
                     display: "flex",
                     alignItems: "center",
                     gap: 12,
                     fontSize: 18,
                     fontWeight: 800,
                     color: "#444",
                     flexWrap: "wrap",
                     paddingLeft: 10,
                     minWidth: 0,
                   }}
                 >
                  <span>Age: {targetAge ? `${targetAge}` : "—"}</span>
                  <span>Weight: {target.weight ?? "—"}</span>
                  <span>Exp: {target.experienceYears ?? "—"}</span>
                  <span>Skill: {target.skill ?? "—"}</span>
                </div>
              </>
            )}
            </div>
          </div>
          {!target && <div>Select a wrestler to see opponent options.</div>}

              {target && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <table className="pairings-table" cellPadding={4} style={{ borderCollapse: "collapse" }}>
                    <colgroup>
                      {currentColumnWidths.map((w, idx) => (
                        <col key={`current-col-${idx}`} style={{ width: w }} />
                      ))}
                      <col />
                    </colgroup>
                      <thead>
                        <tr>
                          {[
                            { label: "Last", key: "last" },
                            { label: "First", key: "first" },
                            { label: "Team", key: "team" },
                            { label: "Age", key: "age" },
                            { label: "Weight", key: "weight" },
                            { label: "Exp", key: "exp" },
                            { label: "Skill", key: "skill" },
                            { label: "Matches", key: "matches" },
                            { label: "Bout #", key: "bout" },
                          ].map((col, index) => (
                          <th key={col.label} align="left" className="pairings-th">
                              {col.label}
                            <span
                              className="col-resizer"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                resizeRef.current = {
                                  kind: "current",
                                  index,
                                  startX: e.clientX,
                                  startWidth: currentColumnWidths[index],
                                };
                              }}
                            />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {currentMatches.length === 0 && (
                          <tr>
                            <td colSpan={9} style={{ color: "#666" }}>None</td>
                          </tr>
                        )}
                        {currentSorted.map(({ bout, opponentId, opponent }) => {
                          const opponentColor = opponent ? teamColor(opponent.teamId) : undefined;
                          return (
                            <tr
                              key={bout.id}
                              className="match-row-hover"
                              onClick={() => {
                                if (!canEdit) return;
                                void removeBout(bout.id);
                              }}
                              style={{ borderTop: "1px solid #eee", cursor: canEdit ? "pointer" : "default" }}
                            >
                                <td style={opponentColor ? { color: opponentColor } : undefined}>{opponent?.last ?? ""}</td>
                                <td style={opponentColor ? { color: opponentColor } : undefined}>{opponent?.first ?? ""}</td>
                              <td>
                                {opponent && (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ width: 10, height: 10, background: teamColor(opponent.teamId), display: "inline-block" }} />
                                    {teamSymbol(opponent.teamId)}
                                  </span>
                                )}
                              </td>
                            <td align="left">{ageYears(opponent?.birthdate)?.toFixed(1) ?? ""}</td>
                            <td align="left">{opponent?.weight ?? ""}</td>
                            <td align="left">{opponent?.experienceYears ?? ""}</td>
                            <td align="left">{opponent?.skill ?? ""}</td>
                            <td align="left">{matchCounts[opponentId] ?? 0}</td>
                            <td align="left">{boutNumber(bout.mat, bout.order)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <h3 className="pairings-heading" style={{ margin: "10px 0 6px" }}>
                    Possible additional matches:
                  </h3>
                  <table className="pairings-table" cellPadding={4} style={{ borderCollapse: "collapse" }}>
                    <colgroup>
                      {availableColumnWidths.map((w, idx) => (
                        <col key={`available-col-${idx}`} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {[
                          { label: "Last", key: "last" },
                          { label: "First", key: "first" },
                          { label: "Team", key: "team" },
                          { label: "Age", key: "age" },
                          { label: "Weight", key: "weight" },
                          { label: "Exp", key: "exp" },
                          { label: "Skill", key: "skill" },
                          { label: "Matches", key: "matches" },
                        ].map((col, index) => (
                          <th
                            key={col.label}
                            align="left"
                            className="pairings-th sortable-th"
                            onClick={() => toggleSort(setAvailableSort, col.key)}
                          >
                            {col.label}
                            {sortIndicator(availableSort, col.key)}
                            <span
                              className="col-resizer"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                resizeRef.current = {
                                  kind: "available",
                                  index,
                                  startX: e.clientX,
                                  startWidth: availableColumnWidths[index],
                                };
                              }}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {availableSorted.map(({ opponent: o }) => {
                        const matchColor = teamColor(o.teamId);
                        return (
                          <tr
                            key={o.id}
                            className="match-row-hover"
                            onClick={() => {
                              if (!canEdit || !target) return;
                              void addMatch(target.id, o.id);
                            }}
                            style={{ borderTop: "1px solid #eee", cursor: canEdit ? "pointer" : "default" }}
                          >
                            <td style={{ color: matchColor }}>{o.last}</td>
                            <td style={{ color: matchColor }}>{o.first}</td>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 10, height: 10, background: teamColor(o.teamId), display: "inline-block" }} />
                                {teamSymbol(o.teamId)}
                              </span>
                            </td>
                            <td align="left">{ageYears(o.birthdate)?.toFixed(1) ?? ""}</td>
                            <td align="left">{o.weight}</td>
                            <td align="left">{o.experienceYears}</td>
                            <td align="left">{o.skill}</td>
                            <td align="left">{matchCounts[o.id] ?? 0}</td>
                          </tr>
                        );
                      })}
                      {availableSorted.length === 0 && (
                        <tr><td colSpan={8}>No candidates meet the current limits.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
                    Note: Click on wrestler name to add or remove.
                  </div>
                  <div
                    className="setup-control-row"
                    style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}
                  >
                    <label>
                      Max age diff:
                      <input
                        type="number"
                        step="0.5"
                        style={{ width: 64 }}
                        value={ageDiffInput}
                        disabled={!canEdit}
                        onChange={async e => {
                          const nextValue = e.target.value;
                          setAgeDiffInput(nextValue);
                          const parsed = Number(nextValue);
                          if (Number.isNaN(parsed)) return;
                          const maxAgeGapDays = Math.max(0, parsed * daysPerYear);
                          setSettings(s => ({ ...s, maxAgeGapDays }));
                        }}
                      />
                    </label>
                    <label>Max weight diff (%): <input type="number" style={{ width: 64 }} value={settings.maxWeightDiffPct} disabled={!canEdit} onChange={async e => {
                      const maxWeightDiffPct = Number(e.target.value);
                      setSettings(s => ({ ...s, maxWeightDiffPct }));
                    }} /></label>
                    <label><input type="checkbox" checked={settings.firstYearOnlyWithFirstYear} disabled={!canEdit} onChange={async e => {
                      const checked = e.target.checked;
                      setSettings(s => ({ ...s, firstYearOnlyWithFirstYear: checked }));
                    }} /> First-year only rule</label>
                    <label><input type="checkbox" checked={settings.allowSameTeamMatches} disabled={!canEdit} onChange={async e => {
                      const allowSameTeamMatches = e.target.checked;
                      setSettings(s => ({ ...s, allowSameTeamMatches }));
                    }} /> Include same team</label>
                  </div>
                </>
              )}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="nav-btn" onClick={() => setShowComments(prev => !prev)}>
            {showComments ? "Hide Comments" : "Show Comments"}
          </button>
          <button className="nav-btn" onClick={() => setShowChangeLog(s => !s)}>
            {showChangeLog ? "Hide Change Log" : "Show Change Log"}
          </button>
        </div>
        {showComments && (
          <div className="panel fill" style={{ marginTop: 10 }}>
            <h3 className="panel-title">Comments</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ fontSize: 12 }}>Section</label>
              <select value={commentSection} onChange={(e) => setCommentSection(e.target.value)} disabled={!canEdit}>
                <option value="General">General</option>
                <option value="Schedule">Schedule</option>
                <option value="Mat Rules">Mat Rules</option>
                <option value="Roster">Roster</option>
                <option value="Pairings">Pairings</option>
                <option value="Suggestion">Suggestion</option>
              </select>
              <textarea
                rows={3}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Leave a note for other coaches..."
                disabled={!canEdit}
              />
              <button onClick={submitComment} disabled={!canEdit || !commentBody.trim()}>
                Add Comment
              </button>
            </div>
            <div className="panel-scroll fill" style={{ display: "grid", gap: 10, marginTop: 12, fontSize: 13 }}>
              {comments.map(comment => (
                <div key={comment.id} style={{ borderTop: "1px solid #eee", paddingTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600 }}>{comment.author?.username ?? "unknown"}</div>
                    {comment.section && <span className="tag">{comment.section}</span>}
                  </div>
                  <div style={{ marginTop: 6 }}>{comment.body}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{new Date(comment.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {comments.length === 0 && <div style={{ color: "#666", fontSize: 12 }}>No comments yet.</div>}
            </div>
          </div>
        )}
        {showChangeLog && (
          <div className="panel fill" style={{ marginTop: 10 }}>
            <h3 className="panel-title">Change Log</h3>
            <div className="panel-scroll fill" style={{ display: "block", fontSize: 13 }}>
              {changes.map(change => (
                <div key={change.id} style={{ margin: "2px 0", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span style={{ fontWeight: 600 }}>
                    {change.actor?.username ?? "unknown"}
                  </span>{" "}
                  <span style={{ fontSize: 11, color: "#666" }}>
                    {new Date(change.createdAt).toLocaleString()}
                  </span>{" "}
                  <span>{change.message}</span>
                </div>
              ))}
              {changes.length === 0 && <div style={{ color: "#666", fontSize: 12 }}>No changes yet.</div>}
            </div>
          </div>
        )}
      </div>

      {showAddWrestler && (
        <div className="modal-backdrop" onClick={() => setShowAddWrestler(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Add Wrestler - {addWrestlerTeamLabel}</h3>
            <div className="modal-row">
              <label style={{ fontSize: 12 }}>First name</label>
              <input value={newWrestlerFirst} onChange={(e) => setNewWrestlerFirst(e.target.value)} />
            </div>
            <div className="modal-row">
              <label style={{ fontSize: 12 }}>Last name</label>
              <input value={newWrestlerLast} onChange={(e) => setNewWrestlerLast(e.target.value)} />
            </div>
            <div className="modal-row">
              <label style={{ fontSize: 12 }}>Birthdate</label>
              <input type="date" value={newWrestlerBirthdate} onChange={(e) => setNewWrestlerBirthdate(e.target.value)} />
            </div>
            <div className="modal-row">
              <label style={{ fontSize: 12 }}>Weight</label>
              <input type="number" min={1} value={newWrestlerWeight} onChange={(e) => setNewWrestlerWeight(e.target.value)} />
            </div>
            <div className="modal-row">
              <label style={{ fontSize: 12 }}>Experience years</label>
              <input type="number" min={0} value={newWrestlerExp} onChange={(e) => setNewWrestlerExp(e.target.value)} />
            </div>
            <div className="modal-row">
              <label style={{ fontSize: 12 }}>Skill (0-5)</label>
              <input type="number" min={0} max={5} value={newWrestlerSkill} onChange={(e) => setNewWrestlerSkill(e.target.value)} />
            </div>
            {addWrestlerMsg && <div style={{ color: "#b00020", fontSize: 12 }}>{addWrestlerMsg}</div>}
            <div className="modal-actions">
              <button className="nav-btn" onClick={() => setShowAddWrestler(false)}>Cancel</button>
              <button className="nav-btn" onClick={submitAddWrestler} disabled={!canEdit || !attendanceTeamId}>
                Add Wrestler
              </button>
            </div>
          </div>
        </div>
      )}
      {showRestartModal && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowRestartModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Restart Meet Setup</h3>
              <p style={{ margin: "0 0 8px", color: "#2b2b2b", fontSize: 14 }}>
                Restarting the setup removes every pairing from this meet. Once confirmed all bouts are cleared and you'll be redirected to create a new meet.
              </p>
              {restartError && (
                <div style={{ color: "#b00020", fontSize: 13, marginBottom: 6 }}>
                  {restartError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="nav-btn"
                  onClick={() => setShowRestartModal(false)}
                  type="button"
                  disabled={restartLoading}
                >
                  Cancel
                </button>
                <button
                  className="nav-btn delete-btn"
                  type="button"
                  onClick={restartMeetSetup}
                  disabled={!canEdit || restartLoading}
                >
                  {restartLoading ? "Restarting..." : "Restart Meet Setup"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {showAutoPairingsModal && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowAutoPairingsModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Re-run auto pairings</h3>
              <p style={{ marginTop: 8, marginBottom: 12 }}>
                This will clear every existing bout for the meet before generating a fresh set of auto pairings and mat assignments.
                Make sure you want to start over, as this cannot be undone.
              </p>
              {autoPairingsError && (
                <div style={{ color: "#b00020", fontSize: 13, marginBottom: 8 }}>
                  {autoPairingsError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="nav-btn"
                  onClick={() => setShowAutoPairingsModal(false)}
                  type="button"
                  disabled={autoPairingsLoading}
                >
                  Cancel
                </button>
                <button
                  className="nav-btn delete-btn"
                  type="button"
                  onClick={rerunAutoPairings}
                  disabled={!canEdit || autoPairingsLoading}
                >
                  {autoPairingsLoading ? "Running…" : "Re-run auto pairings"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {pairingContext && (() => {
        const menuWidth = 210;
        const menuHeight = 150;
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
        const left = viewportWidth ? Math.min(pairingContext.x, viewportWidth - menuWidth) : pairingContext.x;
        const top = viewportHeight ? Math.min(pairingContext.y, viewportHeight - menuHeight) : pairingContext.y;
        const fullName = `${pairingContext.wrestler.first} ${pairingContext.wrestler.last}`;
        return (
          <>
            <div className="pairings-context-backdrop" onMouseDown={() => setPairingContext(null)} />
            <div
              className="pairings-context-menu"
              ref={pairingMenuRef}
              style={{ left, top }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="pairings-context-title">{fullName}</div>
              <button
                className="pairings-context-item"
                style={{
                  background: attendanceStatusStyles.NOT_COMING.background,
                  border: `1px solid ${attendanceStatusStyles.NOT_COMING.borderColor}`,
                }}
                onClick={() => handlePairingContextStatus("NOT_COMING")}
              >
                Not Coming
              </button>
              <button
                className="pairings-context-item"
                style={{
                  background: attendanceStatusStyles.LATE.background,
                  border: `1px solid ${attendanceStatusStyles.LATE.borderColor}`,
                }}
                onClick={() => handlePairingContextStatus("LATE")}
              >
                Arrive Late
              </button>
              <button
                className="pairings-context-item"
                style={{
                  background: attendanceStatusStyles.EARLY.background,
                  border: `1px solid ${attendanceStatusStyles.EARLY.borderColor}`,
                }}
                onClick={() => handlePairingContextStatus("EARLY")}
              >
                Leave Early
              </button>
            </div>
          </>
        );
      })()}
          </>
        )}

        {activeTab === "matboard" && (
          <section className="matboard-tab">
            {meetStatus === "PUBLISHED" && (
              <div className="notice">
                Meet has been published, so matches may not be changed. Reopen as Draft to make changes.
              </div>
            )}
            <MatBoardTab
              meetId={meetId}
              onMatAssignmentsChange={refreshAfterMatAssignments}
              meetStatus={meetStatus}
            />
          </section>
        )}

        {activeTab === "wall" && (
          <section className="wall-chart-section">
            <WallChartTab meetId={meetId} refreshIndex={wallRefreshIndex} />
          </section>
        )}
      </div>
    </main>
  );
}
