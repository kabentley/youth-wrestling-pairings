"use client";

import { useRouter, useSearchParams } from "next/navigation";
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


type Team = {
  id: string;
  name: string;
  symbol?: string;
  color?: string;
  address?: string | null;
  defaultRestGap?: number | null;
  defaultMaxMatchesPerWrestler?: number | null;
};
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
type TeamInfo = {
  id: string;
  name: string;
  symbol?: string;
};
type Bout = {
  id: string;
  redId: string;
  greenId: string;
  pairingScore: number;
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
type MeetCheckpoint = {
  id: string;
  name: string;
  createdAt: string;
  createdBy?: { username?: string | null } | null;
};
type CheckpointPayload = {
  version: 1;
  name: string;
  createdAt: string;
  meetId: string;
  meetName: string;
  meetDate: string;
  teamIds: string[];
  attendance: { wrestlerId: string; status: AttendanceStatus }[];
  bouts: { redId: string; greenId: string; pairingScore: number; mat?: number | null; order?: number | null; originalMat?: number | null }[];
};
type CheckpointDiff = {
  name: string;
  attendance: { wrestlerId: string; first: string; last: string; from: AttendanceStatus; to: AttendanceStatus }[];
  boutsAdded: { redId: string; greenId: string; redTeam?: string; greenTeam?: string }[];
  boutsRemoved: { redId: string; greenId: string; redTeam?: string; greenTeam?: string }[];
  matChangedCount: number;
};

const INACTIVITY_RELEASE_MS = 5 * 60 * 1000;

const CURRENT_SHARED_COLUMN_MAP: Record<number, number | undefined> = {
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
  const searchParams = useSearchParams();
  const editRequested = searchParams.get("edit") === "1";
  const autoPairingsRequested = searchParams.get("autopair") === "1";
  const autoPairingsRunRequested = searchParams.get("autogen") === "1";
  const [autoPairingsPending, setAutoPairingsPending] = useState(false);
  const [wantsEdit, setWantsEdit] = useState(editRequested);
  const daysPerYear = DAYS_PER_YEAR;

  const [teams, setTeams] = useState<Team[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler | undefined>>({});
  const [meetName, setMeetName] = useState("");
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [meetStatus, setMeetStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [meetLoaded, setMeetLoaded] = useState(false);
  const [matchesPerWrestler, setMatchesPerWrestler] = useState<number | null>(null);
  const [maxMatchesPerWrestler, setMaxMatchesPerWrestler] = useState<number | null>(null);
  const [restGap, setRestGap] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  const [changes, setChanges] = useState<MeetChange[]>([]);
  const [comments, setComments] = useState<MeetComment[]>([]);
  const [showComments, setShowComments] = useState(true);
  const [checkpoints, setCheckpoints] = useState<MeetCheckpoint[]>([]);
  const [checkpointsLoaded, setCheckpointsLoaded] = useState(false);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [checkpointName, setCheckpointName] = useState("");
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [checkpointSaving, setCheckpointSaving] = useState(false);
  const [checkpointApplyingId, setCheckpointApplyingId] = useState<string | null>(null);
  const [checkpointDeletingId, setCheckpointDeletingId] = useState<string | null>(null);
  const [checkpointDiff, setCheckpointDiff] = useState<CheckpointDiff | null>(null);
  const [checkpointDiffLoadingId, setCheckpointDiffLoadingId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [attendanceColWidths, setAttendanceColWidths] = useState([90, 90]);
  const [pairingsColWidths, setPairingsColWidths] = useState([110, 110, 60, 60, 55, 55, 70]);
  const [sharedPairingsColWidths, setSharedPairingsColWidths] = useState([110, 110, 60, 60, 55, 55, 70]);
  const pairingsTableWrapperRef = useRef<HTMLDivElement | null>(null);
  const [pairingsTableWidth, setPairingsTableWidth] = useState<number | null>(null);
  const [currentTeamColWidth, setCurrentTeamColWidth] = useState(90);
  const [currentBoutColWidth, setCurrentBoutColWidth] = useState(90);
  const [availableTeamColWidth, setAvailableTeamColWidth] = useState(90);

  const sharedColumnWidths = {
    last: sharedPairingsColWidths[0],
    first: sharedPairingsColWidths[1],
    age: sharedPairingsColWidths[2],
    weight: sharedPairingsColWidths[3],
    exp: sharedPairingsColWidths[4],
    skill: sharedPairingsColWidths[5],
    matches: sharedPairingsColWidths[6],
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
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDateValue, setEditDateValue] = useState("");
  const [pairingsTeamId, setPairingsTeamId] = useState<string | null>(null);
  const [selectedPairingId, setSelectedPairingId] = useState<string | null>(null);
  const [attendanceSort, setAttendanceSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const [pairingsSort, setPairingsSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const currentSort = useMemo(() => ({ key: "last", dir: "asc" as const }), []);
  const [availableSort, setAvailableSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "score", dir: "asc" });
  const [authMsg, setAuthMsg] = useState("");
  const [lockActionError, setLockActionError] = useState<string | null>(null);
  const [editAllowed, setEditAllowed] = useState(true);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const lockStatusRef = useRef<LockState["status"]>("loading");
  const prevLockStatusRef = useRef<LockState["status"]>("loading");
  const isUnmountingRef = useRef(false);
  const suppressEditRequestedRef = useRef(false);
  const [flashNotice, setFlashNotice] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityDeadlineRef = useRef<number | null>(null);
  const [inactivityRemainingMs, setInactivityRemainingMs] = useState<number | null>(null);
  const [meetDeletedNotice, setMeetDeletedNotice] = useState(false);
  const meetDeletedRef = useRef(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const candidatesReqIdRef = useRef(0);

  const [settings, setSettings] = useState({
    maxAgeGapDays: DEFAULT_MAX_AGE_GAP_DAYS,
    maxWeightDiffPct: 12,
    enforceAgeGapCheck: true,
    enforceWeightCheck: true,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: false,
  });
  const [candidateRefreshVersion, setCandidateRefreshVersion] = useState(0);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [showAutoPairingsConfirm, setShowAutoPairingsConfirm] = useState(false);
  const [clearAutoPairingsBeforeRun, setClearAutoPairingsBeforeRun] = useState(true);
  const [showAutoPairingsModal, setShowAutoPairingsModal] = useState(false);
  const [autoPairingsLoading, setAutoPairingsLoading] = useState(false);
  const [autoPairingsError, setAutoPairingsError] = useState<string | null>(null);
  const [autoPairingsSlow, setAutoPairingsSlow] = useState(false);
  const autoPairingsSlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportingMeet, setExportingMeet] = useState(false);
  const [autoPairingsTeamId, setAutoPairingsTeamId] = useState<string | null>(null);
  const [autoPairingsPrompted, setAutoPairingsPrompted] = useState(false);
  const [autoPairingsModalMode, setAutoPairingsModalMode] = useState<"manual" | "auto">("manual");
  const [modalAttendanceOverrides, setModalAttendanceOverrides] = useState<Map<string, AttendanceStatus | null>>(new Map());
  const pairingsInitRef = useRef(false);

  async function rerunAutoPairings(options: { clearExisting?: boolean } = {}) {
    const clearExisting = options.clearExisting ?? true;
    setAutoPairingsError(null);
    setAutoPairingsLoading(true);
    try {
      if (clearExisting) {
        const clearRes = await fetch(`/api/meets/${meetId}/pairings`, { method: "DELETE" });
        if (!clearRes.ok) {
          const errorText = await clearRes.text();
          throw new Error(errorText || "Unable to clear existing bouts.");
        }
      }
      const payload = {
        maxAgeGapDays: settings.maxAgeGapDays,
        maxWeightDiffPct: settings.enforceWeightCheck ? settings.maxWeightDiffPct : 999,
        firstYearOnlyWithFirstYear: settings.firstYearOnlyWithFirstYear,
        allowSameTeamMatches: settings.allowSameTeamMatches,
        matchesPerWrestler: matchesPerWrestler ?? undefined,
        maxMatchesPerWrestler: maxMatchesPerWrestler ?? undefined,
        preserveMats: !clearExisting,
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

  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
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
  const orderedPairingsTeams = useMemo(() => {
    if (!homeTeamId) return teams;
    const homeTeam = teams.find(t => t.id === homeTeamId);
    if (!homeTeam) return teams;
    return [homeTeam, ...teams.filter(t => t.id !== homeTeamId)];
  }, [teams, homeTeamId]);

  const [target, setTarget] = useState<Wrestler | null>(null);
  const pairingMenuRef = useRef<HTMLDivElement | null>(null);
  const [pairingContext, setPairingContext] = useState<{ x: number; y: number; wrestler: Wrestler } | null>(null);
  const targetAge = target ? ageYears(target.birthdate)?.toFixed(1) : null;
  const attendanceStatusStyles: Record<AttendanceStatus, { background: string; borderColor: string }> = {
    COMING: { background: "#eaf6e6", borderColor: "#c6e2ba" },
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

  const updateEditMode = useCallback((next: boolean, _reason?: string) => {
    if (!next) {
      suppressEditRequestedRef.current = true;
    }
    setWantsEdit(next);
    router.replace(next ? `/meets/${meetId}?edit=1` : `/meets/${meetId}`);
  }, [meetId, router]);

  const triggerNoticeFlash = useCallback(() => {
    setFlashNotice(false);
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setTimeout(() => {
      setFlashNotice(true);
      flashTimeoutRef.current = setTimeout(() => setFlashNotice(false), 700);
    }, 0);
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    inactivityDeadlineRef.current = null;
    setInactivityRemainingMs(null);
  }, []);

  const updateLockState = useCallback((next: LockState) => {
    prevLockStatusRef.current = next.status;
    lockStatusRef.current = next.status;
    setLockState(next);
    if (next.status === "acquired") {
      setLockActionError(null);
    }
    if (next.status !== "acquired") {
      clearInactivityTimer();
    }
  }, [clearInactivityTimer]);

  const releaseLock = useCallback(async (reason?: string, keepalive = false) => {
    const url = reason
      ? `/api/meets/${meetId}/lock?reason=${encodeURIComponent(reason)}`
      : `/api/meets/${meetId}/lock`;
    try {
      const res = await fetch(url, { method: "DELETE", keepalive });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const lockedBy = payload?.lockedByUsername ? ` Locked by ${payload.lockedByUsername}.` : "";
        const expiresAt = payload?.lockExpiresAt ? ` Expires ${new Date(payload.lockExpiresAt).toLocaleString()}.` : "";
        const message = payload?.error ?? `Unable to release lock (${res.status}).`;
        return { ok: false, message: `${message}${lockedBy}${expiresAt}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: "Unable to reach the server to release the lock." };
    }
  }, [meetId]);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityDeadlineRef.current = Date.now() + INACTIVITY_RELEASE_MS;
    setInactivityRemainingMs(INACTIVITY_RELEASE_MS);
    inactivityTimerRef.current = setTimeout(() => {
      void releaseLock("inactivity-timeout");
      updateLockState({ status: "locked", lockedByUsername: null });
    }, INACTIVITY_RELEASE_MS);
  }, [clearInactivityTimer, releaseLock, updateLockState]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (!autoPairingsLoading) {
      setAutoPairingsSlow(false);
      if (autoPairingsSlowTimerRef.current) {
        clearTimeout(autoPairingsSlowTimerRef.current);
        autoPairingsSlowTimerRef.current = null;
      }
      return;
    }
    setAutoPairingsSlow(false);
    if (autoPairingsSlowTimerRef.current) {
      clearTimeout(autoPairingsSlowTimerRef.current);
    }
    autoPairingsSlowTimerRef.current = setTimeout(() => {
      setAutoPairingsSlow(true);
    }, 1000);
    return () => {
      if (autoPairingsSlowTimerRef.current) {
        clearTimeout(autoPairingsSlowTimerRef.current);
        autoPairingsSlowTimerRef.current = null;
      }
    };
  }, [autoPairingsLoading]);

  useEffect(() => {
    return () => {
      clearInactivityTimer();
    };
  }, [clearInactivityTimer]);
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
    };
  }, []);

  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.status === 401) {
      setAuthMsg("Please sign in to edit this meet.");
      return false;
    }
    if (res.status === 403) {
      const json = await res.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to edit this meet.");
      setEditAllowed(false);
      return false;
    }
    if (res.status === 404) {
      if (!meetDeletedRef.current) {
        meetDeletedRef.current = true;
        setMeetDeletedNotice(true);
        setTimeout(() => {
          router.replace("/meets");
        }, 1500);
      }
      return false;
    }
    if (res.ok) {
      const json = await res.json();
      updateLockState({
        status: "acquired",
        lockExpiresAt: json.lockExpiresAt ?? null,
      });
      return true;
    }

    if (res.status === 409) {
      const json = await res.json();
      updateLockState({
        status: "locked",
        lockedByUsername: json.lockedByUsername ?? "another user",
        lockExpiresAt: json.lockExpiresAt ?? null,
      });
      await refreshLockStatus();
      return false;
    }

    updateLockState({ status: "locked", lockedByUsername: "unknown user" });
    return false;
  }

  const refreshLockStatus = useCallback(async () => {
    const res = await fetch(`/api/meets/${meetId}/lock`);
    if (res.status === 401) {
      setAuthMsg("Please sign in to view this meet.");
      return;
    }
    if (res.status === 403) {
      const json = await res.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to view this meet.");
      setEditAllowed(false);
      return;
    }
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    updateLockState({
      status: "locked",
      lockedByUsername: data.locked ? (data.lockedByUsername ?? null) : null,
      lockExpiresAt: data.lockExpiresAt ?? null,
    });
  }, [meetId, updateLockState]);

  function teamName(id: string) {
    const team = teams.find(t => t.id === id);
    return team?.symbol ?? team?.name ?? id;
  }
  function teamSymbolById(teamId?: string | null) {
    if (!teamId) return "";
    const team = teams.find(t => t.id === teamId);
    return team?.symbol ?? team?.name ?? "";
  }
  function teamColorById(teamId?: string | null) {
    if (!teamId) return undefined;
    const team = teams.find(t => t.id === teamId);
    return team?.color ?? undefined;
  }
  function teamSymbol(id: string) {
    const team = teams.find(t => t.id === id);
    return team?.symbol ?? team?.name ?? id;
  }

  async function exportMeet() {
    setExportingMeet(true);
    try {
      const res = await fetch(`/api/meets/${meetId}/export`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload?.error ?? `Unable to export meet (${res.status}).`;
        window.alert(message);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? "meet-export.zip";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to export meet.";
      window.alert(message);
    } finally {
      setExportingMeet(false);
    }
  }

  function defaultCheckpointName() {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `Checkpoint ${date} ${time}`;
  }

  function formatCheckpointDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  async function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function saveCheckpoint() {
    const rawName = checkpointName.trim();
    if (!rawName) return;
    const name = rawName.slice(0, 80);
    setCheckpointError(null);
    setCheckpointSaving(true);
    try {
      const res = await fetch(`/api/meets/${meetId}/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to save checkpoint (${res.status}).`);
      }
      const payload = await res.json().catch(() => null);
      if (payload) {
        setCheckpoints(prev => [payload as MeetCheckpoint, ...prev]);
      } else {
        await loadCheckpoints();
      }
      await loadActivity();
      setCheckpointName("");
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to save checkpoint.");
    } finally {
      setCheckpointSaving(false);
    }
  }

  async function downloadCheckpointSnapshot() {
    const name = checkpointName.trim() || defaultCheckpointName();
    setCheckpointError(null);
    setCheckpointDownloading(true);
    try {
      const res = await fetch(`/api/meets/${meetId}/checkpoints/download?name=${encodeURIComponent(name)}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to download checkpoint (${res.status}).`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename=\"([^\"]+)\"/.exec(disposition);
      const filename = match?.[1] ?? "meet-checkpoint.json";
      await downloadBlob(blob, filename);
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to download checkpoint.");
    } finally {
      setCheckpointDownloading(false);
    }
  }

  async function downloadSavedCheckpoint(id: string) {
    setCheckpointError(null);
    setCheckpointDownloadingId(id);
    try {
      const res = await fetch(`/api/meets/${meetId}/checkpoints/${id}?download=1`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to download checkpoint (${res.status}).`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename=\"([^\"]+)\"/.exec(disposition);
      const filename = match?.[1] ?? "meet-checkpoint.json";
      await downloadBlob(blob, filename);
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to download checkpoint.");
    } finally {
      setCheckpointDownloadingId(null);
    }
  }

  async function applyCheckpoint(id: string, name: string) {
    if (!canEdit) return;
    const confirmed = window.confirm(
      `Apply checkpoint "${name}"? This will replace attendance and bouts. Consider saving a new checkpoint first.`
    );
    if (!confirmed) return;
    setCheckpointError(null);
    setCheckpointApplyingId(id);
    try {
      const res = await fetch(`/api/meets/${meetId}/checkpoints/${id}/apply`, { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to apply checkpoint (${res.status}).`);
      }
      await load();
      await loadActivity();
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to apply checkpoint.");
    } finally {
      setCheckpointApplyingId(null);
    }
  }

  async function deleteCheckpoint(id: string) {
    if (!window.confirm("Delete this checkpoint? This cannot be undone.")) return;
    setCheckpointError(null);
    setCheckpointDeletingId(id);
    try {
      const res = await fetch(`/api/meets/${meetId}/checkpoints/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to delete checkpoint (${res.status}).`);
      }
      setCheckpoints(prev => prev.filter(cp => cp.id !== id));
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to delete checkpoint.");
    } finally {
      setCheckpointDeletingId(null);
    }
  }

  function normalizeAttendance(status?: AttendanceStatus | null) {
    return status ?? "COMING";
  }
  function formatStatusLabel(status: AttendanceStatus) {
    return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
  }

  function boutKey(redId: string, greenId: string) {
    return redId < greenId ? `${redId}|${greenId}` : `${greenId}|${redId}`;
  }

  async function showCheckpointChanges(id: string, name: string) {
    setCheckpointError(null);
    setCheckpointDiffLoadingId(id);
    try {
      const res = await fetch(`/api/meets/${meetId}/checkpoints/${id}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to load checkpoint (${res.status}).`);
      }
      const payload = await res.json().catch(() => null) as CheckpointPayload | null;
      if (!payload) {
        throw new Error("Unable to read checkpoint.");
      }
      const checkpointAttendance = new Map(payload.attendance.map(a => [a.wrestlerId, a.status]));
      const attendanceChanges = wrestlers
        .filter(w => wMap[w.id])
        .map(w => {
          const from = checkpointAttendance.get(w.id) ?? "COMING";
          const to = normalizeAttendance(w.status);
          return { wrestlerId: w.id, first: w.first, last: w.last, from, to };
        })
        .filter(entry => entry.from !== entry.to)
        .sort((a, b) => (a.last === b.last ? a.first.localeCompare(b.first) : a.last.localeCompare(b.last)));

      const currentBoutKeys = new Map<string, { redId: string; greenId: string; redTeam?: string; greenTeam?: string }>();
      for (const b of bouts) {
        currentBoutKeys.set(boutKey(b.redId, b.greenId), {
          redId: b.redId,
          greenId: b.greenId,
          redTeam: teamSymbolById(wMap[b.redId]?.teamId),
          greenTeam: teamSymbolById(wMap[b.greenId]?.teamId),
        });
      }
      const checkpointBoutKeys = new Map<string, { redId: string; greenId: string; redTeam?: string; greenTeam?: string }>();
      for (const b of payload.bouts) {
        checkpointBoutKeys.set(boutKey(b.redId, b.greenId), {
          redId: b.redId,
          greenId: b.greenId,
          redTeam: teamSymbolById(wMap[b.redId]?.teamId),
          greenTeam: teamSymbolById(wMap[b.greenId]?.teamId),
        });
      }
      const boutsAdded = [...currentBoutKeys.entries()]
        .filter(([key]) => !checkpointBoutKeys.has(key))
        .map(([, value]) => value);
      const boutsRemoved = [...checkpointBoutKeys.entries()]
        .filter(([key]) => !currentBoutKeys.has(key))
        .map(([, value]) => value);

      const currentBoutsByKey = new Map<string, { mat?: number | null; order?: number | null }>();
      for (const b of bouts) {
        currentBoutsByKey.set(boutKey(b.redId, b.greenId), { mat: b.mat ?? null, order: b.order ?? null });
      }
      const checkpointBoutsByKey = new Map<string, { mat?: number | null; order?: number | null }>();
      for (const b of payload.bouts) {
        checkpointBoutsByKey.set(boutKey(b.redId, b.greenId), { mat: b.mat ?? null, order: b.order ?? null });
      }
      let matChangedCount = 0;
      for (const [key, currentValue] of currentBoutsByKey.entries()) {
        const checkpointValue = checkpointBoutsByKey.get(key);
        if (!checkpointValue) continue;
        const matChanged = (currentValue.mat ?? null) !== (checkpointValue.mat ?? null);
        const orderChanged = (currentValue.order ?? null) !== (checkpointValue.order ?? null);
        if (matChanged || orderChanged) {
          matChangedCount += 1;
        }
      }

      setCheckpointDiff({ name, attendance: attendanceChanges, boutsAdded, boutsRemoved, matChangedCount });
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to load checkpoint changes.");
    } finally {
      setCheckpointDiffLoadingId(null);
    }
  }

  function teamColor(id: string) {
    return teams.find(t => t.id === id)?.color ?? "#000000";
  }
  function darkenHex(color: string, amount: number) {
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
  }
  function teamTextColor(id: string) {
    const color = teamColor(id);
    if (!color.startsWith("#") || color.length !== 7) return color;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance > 0.8) return darkenHex(color, 0.6);
    if (luminance > 0.7) return darkenHex(color, 0.45);
    if (luminance > 0.6) return darkenHex(color, 0.3);
    return color;
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
  const STATUS_LABELS: Record<AttendanceStatus, string> = {
    COMING: "Coming",
    NOT_COMING: "Not Coming",
    LATE: "Arrive Late",
    EARLY: "Leave Early",
  };
  function statusLabel(status: AttendanceStatus | null | undefined) {
    if (!status) return "Coming";
    return STATUS_LABELS[status];
  }
  function formatInactivityCountdown(ms: number) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  const STATUS_COLORS: Record<AttendanceStatus, string> = {
    COMING: "#e6f6ea",
    NOT_COMING: "#f0f0f0",
    EARLY: "#f3eadf",
    LATE: "#dff1ff",
  };

  function statusColor(status: AttendanceStatus | null | undefined) {
    if (!status) return "#e6f6ea";
    return STATUS_COLORS[status];
  }

  function isNotAttending(status: AttendanceStatus | null | undefined) {
    return status === "NOT_COMING";
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
    const displayOrder = Math.max(0, order - 1);
    const suffix = String(displayOrder).padStart(2, "0");
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
    if (mRes.status === 404) {
      if (!meetDeletedRef.current) {
        meetDeletedRef.current = true;
        setMeetDeletedNotice(true);
        setTimeout(() => {
          router.replace("/meets");
        }, 1500);
      }
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
        setLastUpdatedAt(meetJson.lastChangeAt ?? null);
        setLastUpdatedBy(meetJson.lastChangeBy ?? null);
        setHomeTeamId(meetJson.homeTeamId ?? null);
        setMeetLocation(meetJson.location ?? null);
        setMatchesPerWrestler(
          typeof meetJson.matchesPerWrestler === "number" ? meetJson.matchesPerWrestler : null,
        );
        setMaxMatchesPerWrestler(
          typeof meetJson.maxMatchesPerWrestler === "number" ? meetJson.maxMatchesPerWrestler : null,
        );
        setRestGap(
          typeof meetJson.restGap === "number" ? meetJson.restGap : 4,
        );
      }
      setMeetLoaded(true);
    if (meRes.ok) {
      const meJson = await meRes.json().catch(() => ({}));
      setCurrentUsername(meJson?.username ?? null);
    }
  }, [meetId, router]);

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

  const loadCheckpoints = useCallback(async () => {
    const res = await fetch(`/api/meets/${meetId}/checkpoints`);
    if (!res.ok) return;
    const payload = await res.json().catch(() => []);
    setCheckpoints(Array.isArray(payload) ? payload : []);
    setCheckpointsLoaded(true);
  }, [meetId]);


  const isDraft = meetStatus === "DRAFT";
  const isPublished = meetStatus === "PUBLISHED";
  const canEdit = editAllowed && wantsEdit && lockState.status === "acquired" && isDraft;
  const canChangeStatus = editAllowed && wantsEdit && (isPublished || lockState.status === "acquired");
  const restartDisabled = !canEdit || isPublished;
  const handleRestartClick = () => {
    if (restartDisabled) return;
    setRestartError(null);
    setShowRestartModal(true);
  };

  useEffect(() => { void load(); void loadActivity(); void loadCheckpoints(); }, [load, loadActivity, loadCheckpoints]);
  useEffect(() => {
    if (!homeTeamId) return undefined;
    let cancelled = false;
    const loadDefaults = async () => {
      const res = await fetch(`/api/teams/${homeTeamId}/mat-rules`);
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
      if (cancelled) return;
      if (typeof payload?.defaultMaxAgeGapDays === "number") {
        setSettings(s => ({ ...s, maxAgeGapDays: payload.defaultMaxAgeGapDays }));
      }
    };
    void loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [homeTeamId]);
  useEffect(() => {
    if (!editRequested) {
      suppressEditRequestedRef.current = false;
      return;
    }
    if (!wantsEdit && !suppressEditRequestedRef.current) {
      setWantsEdit(true);
    }
  }, [editRequested, wantsEdit]);
  // Avoid automatic reloads on tab visibility changes.
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
    if (orderedPairingsTeams.length === 0) {
      if (pairingsTeamId) setPairingsTeamId(null);
      return;
    }
    if (!pairingsTeamId || !orderedPairingsTeams.some(t => t.id === pairingsTeamId)) {
      const nextId = homeTeamId && orderedPairingsTeams.some(t => t.id === homeTeamId)
        ? homeTeamId
        : (orderedPairingsTeams[0]?.id ?? null);
      setPairingsTeamId(nextId);
    }
  }, [orderedPairingsTeams, pairingsTeamId, homeTeamId]);

  useEffect(() => {
    if (!meetLoaded) return;
    if (pairingsInitRef.current) return;
    if (!homeTeamId) return;
    if (!orderedPairingsTeams.some(t => t.id === homeTeamId)) return;
    setPairingsTeamId(homeTeamId);
    pairingsInitRef.current = true;
  }, [meetLoaded, homeTeamId, orderedPairingsTeams]);

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
          setSharedPairingsColWidths((prev) => prev.map((w, i) => (i === pairingsIndex ? nextWidth : w)));
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
          setSharedPairingsColWidths((prev) => prev.map((w, i) => (i === pairingsIndex ? nextWidth : w)));
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
    if (!editAllowed || !meetLoaded) return;
    if (meetStatus !== "DRAFT") {
      lockStatusRef.current = "locked";
      updateLockState({ status: "locked", lockedByUsername: null });
      return;
    }
    if (!wantsEdit) {
      void refreshLockStatus();
      const interval = setInterval(() => {
        void refreshLockStatus();
      }, 60_000);
      return () => clearInterval(interval);
    }
    void (async () => {
      const ok = await acquireLock();
      if (!ok) triggerNoticeFlash();
    })();
    const interval = setInterval(() => {
      if (lockStatusRef.current === "acquired") {
        void acquireLock();
      }
    }, 60_000);
    const onBeforeUnload = () => { void releaseLock("beforeunload", true); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (isUnmountingRef.current) {
        void releaseLock("unmount", true);
      }
    };
  }, [meetId, editAllowed, meetLoaded, meetStatus, wantsEdit, refreshLockStatus, triggerNoticeFlash]);

  useEffect(() => {
    if (!wantsEdit || lockState.status !== "acquired") return;
    resetInactivityTimer();
    const handleActivity = () => resetInactivityTimer();
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("scroll", handleActivity, { passive: true });
    return () => {
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      clearInactivityTimer();
    };
  }, [wantsEdit, lockState.status, resetInactivityTimer, clearInactivityTimer]);

  useEffect(() => {
    if (!wantsEdit || lockState.status !== "acquired") return;
    const handleVisibility = () => {
      if (document.hidden) return;
      const deadline = inactivityDeadlineRef.current;
      if (deadline && Date.now() >= deadline) {
        void releaseLock("visibility-inactivity");
        updateLockState({ status: "locked", lockedByUsername: null });
        return;
      }
      if (deadline) {
        setInactivityRemainingMs(Math.max(0, deadline - Date.now()));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [wantsEdit, lockState.status, releaseLock, updateLockState]);

  useEffect(() => {
    if (!wantsEdit || lockState.status !== "acquired") {
      setInactivityRemainingMs(null);
      return;
    }
    if (!inactivityDeadlineRef.current) {
      inactivityDeadlineRef.current = Date.now() + INACTIVITY_RELEASE_MS;
      setInactivityRemainingMs(INACTIVITY_RELEASE_MS);
    }
    const interval = setInterval(() => {
      if (!inactivityDeadlineRef.current) return;
      const remaining = Math.max(0, inactivityDeadlineRef.current - Date.now());
      setInactivityRemainingMs(remaining);
    }, 200);
    return () => clearInterval(interval);
  }, [wantsEdit, lockState.status]);

  const sortAttendanceRoster = useCallback((roster: Wrestler[]) => {
    return [...roster].sort((a, b) => {
      const getValue = (w: Wrestler) => {
        if (attendanceSort.key === "last") return w.last;
        if (attendanceSort.key === "first") return w.first;
        if (attendanceSort.key === "status") return statusLabel(w.status ?? null);
        return "";
      };
      return sortValueCompare(getValue(a), getValue(b), attendanceSort.dir);
    });
  }, [attendanceSort]);

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
  const attendanceTeamId: string | null = pairingsTeamId ?? activeTeamId;
  const modalAttendanceTeamId = autoPairingsTeamId ?? attendanceTeamId;
  const modalAttendanceRoster = modalAttendanceTeamId
    ? rosterSorted.filter(w => w.teamId === modalAttendanceTeamId)
    : rosterSorted;
  const modalAttendanceRosterWithOverrides = useMemo(
    () => modalAttendanceRoster.map(w => {
      if (!modalAttendanceOverrides.has(w.id)) return w;
      return { ...w, status: modalAttendanceOverrides.get(w.id) ?? null };
    }),
    [modalAttendanceRoster, modalAttendanceOverrides],
  );
  const modalAttendanceSorted = useMemo(
    () => sortAttendanceRoster(modalAttendanceRosterWithOverrides),
    [modalAttendanceRosterWithOverrides, sortAttendanceRoster],
  );
  const attendingByTeam = pairingsTeamId
    ? rosterSorted.filter(w => w.teamId === pairingsTeamId && !isNotAttending(w.status))
    : rosterSorted.filter(w => !isNotAttending(w.status));
  useEffect(() => {
    if (autoPairingsPrompted) return;
    if (!meetLoaded || bouts.length > 0) return;
    if (meetStatus !== "DRAFT") return;
    if (!autoPairingsPending) return;
    setAutoPairingsPrompted(true);
    setAutoPairingsPending(false);
    setAutoPairingsError(null);
    setAutoPairingsModalMode(autoPairingsRunRequested ? "auto" : "manual");
    setShowAutoPairingsModal(true);
    setModalAttendanceOverrides(new Map());
    if (autoPairingsRequested) {
      const nextUrl = editRequested ? `/meets/${meetId}?edit=1` : `/meets/${meetId}`;
      router.replace(nextUrl);
    }
  }, [
    autoPairingsPrompted,
    meetLoaded,
    bouts.length,
    meetStatus,
    autoPairingsPending,
    autoPairingsRequested,
    autoPairingsRunRequested,
    editRequested,
    meetId,
    router,
  ]);
  useEffect(() => {
    if (!showAutoPairingsModal) return;
    if (autoPairingsTeamId) return;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const nextTeamId = attendanceTeamId ?? orderedPairingsTeams[0]?.id ?? null;
    setAutoPairingsTeamId(nextTeamId);
  }, [showAutoPairingsModal, autoPairingsTeamId, attendanceTeamId, orderedPairingsTeams]);
  useEffect(() => {
    if (showAutoPairingsModal) {
      setModalAttendanceOverrides(new Map());
    }
  }, [showAutoPairingsModal]);
  useEffect(() => {
    const wrapper = pairingsTableWrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(entries => {
      setPairingsTableWidth(Math.floor(entries[0].contentRect.width));
    });
    observer.observe(wrapper);
    setPairingsTableWidth(Math.floor(wrapper.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  const allowPairingsOverflow = orderedPairingsTeams.length >= 3;
  const pairingsEffectiveColWidths = useMemo(() => {
    if (allowPairingsOverflow) return pairingsColWidths;
    if (pairingsTableWidth === null) return pairingsColWidths;
    const widths = [...pairingsColWidths];
    const minWidths = [70, 70, 50, 50, 45, 45, 50];
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    if (totalWidth <= pairingsTableWidth) return widths;
    let overflow = totalWidth - pairingsTableWidth;
    const shrinkOrder = [6, 5, 4, 3, 2, 1, 0];
    for (const index of shrinkOrder) {
      if (overflow <= 0) break;
      const minWidth = minWidths[index] ?? 40;
      const available = widths[index] - minWidth;
      if (available <= 0) continue;
      const delta = Math.min(available, overflow);
      widths[index] -= delta;
      overflow -= delta;
    }
    return widths;
  }, [allowPairingsOverflow, pairingsColWidths, pairingsTableWidth]);
  const matchCounts = bouts.reduce((acc, bout) => {
    acc.set(bout.redId, (acc.get(bout.redId) ?? 0) + 1);
    acc.set(bout.greenId, (acc.get(bout.greenId) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());
  const getMatchCount = (id: string) => matchCounts.get(id) ?? 0;

  const pairingsSorted = [...attendingByTeam].sort((a, b) => {
    const getValue = (w: Wrestler) => {
      if (pairingsSort.key === "last") return w.last;
      if (pairingsSort.key === "first") return w.first;
      if (pairingsSort.key === "age") return ageYears(w.birthdate) ?? null;
      if (pairingsSort.key === "weight") return w.weight;
      if (pairingsSort.key === "exp") return w.experienceYears;
      if (pairingsSort.key === "skill") return w.skill;
      if (pairingsSort.key === "matches") return getMatchCount(w.id);
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), pairingsSort.dir);
  });
  const selectedMatchCount = selectedPairingId ? getMatchCount(selectedPairingId) : 0;

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
      enforceAgeGap: String(effectiveSettings.enforceAgeGapCheck),
      maxWeightDiffPct: String(effectiveSettings.enforceWeightCheck ? effectiveSettings.maxWeightDiffPct : 999),
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
    enforceAgeGapCheck: settings.enforceAgeGapCheck,
    enforceWeightCheck: settings.enforceWeightCheck,
    firstYearOnlyWithFirstYear: settings.firstYearOnlyWithFirstYear,
    allowSameTeamMatches: settings.allowSameTeamMatches,
    version: candidateRefreshVersion,
  }), [
    settings.maxAgeGapDays,
    settings.maxWeightDiffPct,
    settings.enforceAgeGapCheck,
    settings.enforceWeightCheck,
    settings.firstYearOnlyWithFirstYear,
    settings.allowSameTeamMatches,
    candidateRefreshVersion,
  ]);

  useEffect(() => {
    if (!selectedPairingId) {
      setCandidates([]);
      return;
    }
    if (maxMatchesPerWrestler !== null && selectedMatchCount >= maxMatchesPerWrestler) {
      setCandidates([]);
      return;
    }
    const { version: _version, ...query } = candidateFetchConfig;
    void loadCandidates(selectedPairingId, query);
  }, [selectedPairingId, candidateFetchConfig, maxMatchesPerWrestler, selectedMatchCount]);
  const countAttendance = useCallback((roster: Wrestler[]) => {
    return roster.reduce(
      (acc, w) => {
        const status = w.status ?? null;
        if (status === "NOT_COMING") acc.notComing += 1;
        else acc.coming += 1;
        return acc;
      },
      { coming: 0, notComing: 0 }
    );
  }, []);
  const modalAttendanceCounts = useMemo(
    () => countAttendance(modalAttendanceRosterWithOverrides),
    [modalAttendanceRosterWithOverrides, countAttendance],
  );
  const orderedTeams = homeTeamId
    ? [
        ...teams.filter(t => t.id === homeTeamId),
        ...teams.filter(t => t.id !== homeTeamId),
      ]
    : teams;
  useEffect(() => {
    if (autoPairingsRequested && !autoPairingsPending) {
      setAutoPairingsPending(true);
    }
  }, [autoPairingsRequested, autoPairingsPending]);
  const teamList = orderedTeams.map(t => t.symbol ?? t.name).filter(Boolean).join(", ");
  const formattedDate = meetDate
    ? new Date(meetDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const metadataParts = [formattedDate, teamList].filter(Boolean);
  const homeTeam = homeTeamId ? teams.find(t => t.id === homeTeamId) ?? null : null;
  const trimmedMeetLocation = meetLocation?.trim();
  const trimmedHomeAddress = homeTeam?.address?.trim();
  let homeLocationDisplay: string | null = null;
  if (trimmedMeetLocation) {
    homeLocationDisplay = trimmedMeetLocation;
  } else if (trimmedHomeAddress) {
    homeLocationDisplay = trimmedHomeAddress;
  }
  const hasHomeInfo = Boolean(homeTeam ?? homeLocationDisplay);
  const attendanceTeam = attendanceTeamId ? teams.find(t => t.id === attendanceTeamId) : undefined;
  const modalAttendanceTeam = modalAttendanceTeamId ? teams.find(t => t.id === modalAttendanceTeamId) : undefined;
  const addWrestlerTeamLabel = attendanceTeam?.name ?? "Selected Team";

  const currentMatches = target
    ? bouts.filter(b => b.redId === target.id || b.greenId === target.id)
    : [];
  const targetMatchCount = target ? getMatchCount(target.id) : 0;
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
      if (currentSort.key === "matches") return getMatchCount(row.opponentId);
      if (currentSort.key === "bout") return row.boutOrder;
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), currentSort.dir);
  });
  const availableFiltered = candidates
    .filter(() => {
      if (!target) return true;
      if (maxMatchesPerWrestler === null) return true;
      return targetMatchCount < maxMatchesPerWrestler;
    })
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
      if (availableSort.key === "matches") return getMatchCount(w.id);
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
        name: meetName || undefined,
        date: meetDate ? meetDate.slice(0, 10) : undefined,
        location: meetLocation ? meetLocation.trim() : undefined,
        homeTeamId: homeTeamId ?? undefined,
        teamIds: teams.map(team => team.id),
        maxMatchesPerWrestler: (() => {
          const homeTeam = homeTeamId ? teams.find(team => team.id === homeTeamId) : null;
          const defaultMax = homeTeam?.defaultMaxMatchesPerWrestler ?? null;
          return typeof defaultMax === "number" ? defaultMax : (maxMatchesPerWrestler ?? undefined);
        })(),
        restGap: (() => {
          const homeTeam = homeTeamId ? teams.find(team => team.id === homeTeamId) : null;
          const defaultGap = homeTeam?.defaultRestGap ?? null;
          return typeof defaultGap === "number" ? defaultGap : (restGap ?? undefined);
        })(),
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
    const res = await fetch(`/api/meets/${meetId}/pairings/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redId, greenId }),
    });
    const created = await res.json().catch(() => null);
    if (res.ok && created?.id) {
      setBouts(prev => {
        const next = prev.filter(b => b.id !== created.id);
        return [...next, created];
      });
    } else {
      await load();
    }
    await loadActivity();
    if (selectedPairingId && (maxMatchesPerWrestler === null || selectedMatchCount + 1 < maxMatchesPerWrestler)) {
      await loadCandidates(selectedPairingId);
    } else {
      setCandidates([]);
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
      if (maxMatchesPerWrestler === null || targetMatchCount < maxMatchesPerWrestler) {
        await loadCandidates(wrestlerId);
      } else {
        setCandidates([]);
      }
    }
  }

  async function handlePairingContextStatus(status: AttendanceStatus | null) {
    if (!canEdit) {
      setPairingContext(null);
      return;
    }
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

  async function saveMeetDate(nextDate: string) {
    if (!canEdit) return;
    const trimmed = nextDate.trim();
    if (!trimmed) return;
    if (meetDate?.slice(0, 10) === trimmed) return;
    await fetch(`/api/meets/${meetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: trimmed }),
    });
    await load();
    await loadActivity();
  }

  async function submitComment() {
    const body = commentBody.trim();
    if (!body) return;
    await fetch(`/api/meets/${meetId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setCommentBody("");
    await load();
    await loadActivity();
  }

  const updateModalAttendanceStatus = (wrestlerId: string, status: AttendanceStatus | null) => {
    setModalAttendanceOverrides(prev => {
      const next = new Map(prev);
      next.set(wrestlerId, status);
      return next;
    });
  };

  const setModalAttendanceForTeam = (status: AttendanceStatus | null) => {
    setModalAttendanceOverrides(prev => {
      const next = new Map(prev);
      for (const wrestler of modalAttendanceRoster) {
        next.set(wrestler.id, status);
      }
      return next;
    });
  };

  const saveModalAttendanceChanges = useCallback(async () => {
    if (!canEdit) return false;
    const changes: { wrestlerId: string; status: AttendanceStatus | null }[] = [];
    for (const [wrestlerId, nextRaw] of modalAttendanceOverrides.entries()) {
      const wrestler = wMap[wrestlerId] ?? wrestlers.find(w => w.id === wrestlerId);
      if (!wrestler) continue;
      const baseStatus = wrestler.status ?? null;
      const nextStatus = nextRaw ?? null;
      if (nextStatus !== baseStatus) {
        changes.push({ wrestlerId, status: nextStatus });
      }
    }
    if (changes.length === 0) return true;
    const res = await fetch(`/api/meets/${meetId}/wrestlers/status/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setAutoPairingsError(json?.error ?? "Unable to save attendance changes.");
      return false;
    }
    await load();
    await loadActivity();
    setSelectedPairingId(null);
    setModalAttendanceOverrides(new Map());
    return true;
  }, [canEdit, load, loadActivity, meetId, modalAttendanceOverrides, wMap, wrestlers]);

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
          margin-bottom: 4px;
        }
        .meet-heading-title {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          flex-wrap: wrap;
        }
        .meet-heading-name-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .meet-home-info {
          font-size: 13px;
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
          gap: 10px;
          margin-left: auto;
          position: relative;
          z-index: 10;
        }
        .lock-release-banner {
          flex: 1;
          text-align: center;
          font-size: 15px;
          font-weight: 700;
          color: #b91c1c;
          animation: lock-release-flash 1s infinite;
        }
        @keyframes lock-release-flash {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        .meet-status {
          font-size: 12px;
          color: #5b6472;
          display: flex;
          flex-direction: column;
          gap: 2px;
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
        .meet-metadata-inline {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          letter-spacing: 0.6px;
        }
        .meet-date-btn {
          border: none;
          padding: 0;
          background: transparent;
          font-weight: 600;
          color: var(--ink);
          cursor: pointer;
        }
        .meet-date-btn:hover,
        .meet-date-btn:focus-visible {
          text-decoration: underline;
        }
        .meet-date-btn[disabled] {
          cursor: default;
          text-decoration: none;
        }
        .meet-name-btn[disabled] {
          cursor: default;
          text-decoration: none;
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
        .notice.flash {
          animation: notice-flash 0.6s ease;
        }
        .toast {
          position: fixed;
          top: 16px;
          right: 16px;
          background: #1d232b;
          color: #ffffff;
          padding: 10px 14px;
          border-radius: 10px;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
          font-weight: 600;
          z-index: 50;
        }
        @keyframes notice-flash {
          0% { box-shadow: 0 0 0 0 rgba(178, 0, 32, 0); }
          30% { box-shadow: 0 0 0 3px rgba(178, 0, 32, 0.35); }
          100% { box-shadow: 0 0 0 0 rgba(178, 0, 32, 0); }
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
        .pairings-pane.readonly {
          user-select: none;
        }
        .pairings-table tbody tr:hover {
          background: #f7f9fb;
        }
        .pairings-table tbody td.zero-matches-cell {
          background: #fff7cc;
        }
        .pairings-table th,
        .pairings-table td,
        .attendance-table th,
        .attendance-table td {
          padding: 3px 6px;
          line-height: 1.2;
          font-size: 14px;
        }
          .pairings-name-cell {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .pairings-name-cell.status-late {
            background: #dff1ff;
            background-clip: padding-box;
          }
          .pairings-name-cell.status-early {
            background: #f3eadf;
            background-clip: padding-box;
          }
          .match-row-hover:hover {
            box-shadow: 0 0 0 2px #1e88e5 inset;
            background: #f2f8ff;
          }
          .pairings-pane.readonly .match-row-hover:hover {
            box-shadow: none;
            background: transparent;
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
          overflow-x: auto;
        }
        .pairings-side-card {
          min-height: calc(23 * 25px + 145px);
        }
        .additional-matches-wrapper {
          margin-top: 0;
          max-height: clamp(220px, 32vh, calc(12 * 25px + 36px));
        }
        @media (max-height: 800px) {
          .pairings-table-wrapper {
            max-height: calc(16 * 25px + 36px);
          }
          .pairings-side-card {
            min-height: calc(16 * 25px + 145px);
          }
          .additional-matches-wrapper {
            max-height: clamp(200px, 28vh, calc(10 * 25px + 32px));
          }
          .pairings-side-card {
            max-height: calc(16 * 25px + 120px);
            overflow-y: visible;
          }
        }
        @media (max-height: 680px) {
          .pairings-table-wrapper {
            max-height: calc(12 * 25px + 32px);
          }
          .pairings-side-card {
            min-height: calc(12 * 25px + 135px);
          }
          .additional-matches-wrapper {
            max-height: clamp(170px, 24vh, calc(8 * 25px + 28px));
          }
          .pairings-side-card {
            max-height: calc(12 * 25px + 110px);
            overflow-y: visible;
          }
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
        .modal-card.checkpoint-modal {
          width: min(760px, 94vw);
        }
        .checkpoint-form {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .checkpoint-input {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--line);
          font-size: 14px;
          flex: 1;
          min-width: 180px;
        }
        .checkpoint-save-btn {
          background: var(--accent);
          border-color: var(--accent);
          color: #ffffff;
          padding: 10px 16px;
          font-size: 15px;
          min-width: 120px;
        }
        .checkpoint-save-btn:hover:not(:disabled) {
          background: #1870c7;
          border-color: #1870c7;
          color: #ffffff;
        }
        .checkpoint-apply-btn {
          background: var(--accent);
          border-color: var(--accent);
          color: #ffffff;
        }
        .checkpoint-apply-btn:hover:not(:disabled) {
          background: #1870c7;
          border-color: #1870c7;
          color: #ffffff;
        }
        .checkpoint-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 320px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .checkpoint-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px 12px;
          background: #f8fafc;
        }
        .checkpoint-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .checkpoint-name {
          font-weight: 700;
        }
        .checkpoint-meta {
          font-size: 12px;
          color: var(--muted);
        }
        .checkpoint-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-left: auto;
        }
        .checkpoint-actions .delete-btn {
          background: #b00020;
          border-color: #b00020;
          color: #ffffff;
        }
        .checkpoint-actions .delete-btn:hover:not(:disabled) {
          background: #920018;
          border-color: #920018;
          color: #ffffff;
        }
        .checkpoint-changes-btn {
          background: #1f7a3a;
          border-color: #1f7a3a;
          color: #ffffff;
        }
        .checkpoint-changes-btn:hover:not(:disabled) {
          background: #18612e;
          border-color: #18612e;
          color: #ffffff;
        }
        .checkpoint-empty {
          font-size: 13px;
          color: var(--muted);
        }
        .modal-card.checkpoint-diff-modal {
          width: min(760px, 94vw);
          max-height: 86vh;
          display: flex;
          flex-direction: column;
        }
        .diff-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .diff-header {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }
        .diff-header-title {
          font-size: 15px;
          color: var(--muted);
          font-weight: 600;
          letter-spacing: 0.2px;
        }
        .diff-header-name {
          font-size: 19px;
          font-weight: 800;
        }
        .diff-title {
          font-weight: 700;
          font-size: 16px;
        }
        .diff-table-wrap {
          border: none;
          border-radius: 10px;
          max-height: 220px;
          overflow: auto;
        }
        .diff-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 15px;
        }
        .diff-table th,
        .diff-table td {
          padding: 5px 7px;
          text-align: left;
          border-bottom: none;
          white-space: nowrap;
        }
        .diff-table.diff-table-bouts td {
          padding: 3px 5px;
        }
        .diff-table.diff-table-attendance td {
          padding: 3px 5px;
        }
        .diff-table thead th {
          position: sticky;
          top: 0;
          background: #ffffff;
          z-index: 1;
          font-weight: 700;
        }
        .diff-table tr:last-child td {
          border-bottom: none;
        }
        .diff-name {
          font-weight: 600;
        }
        .diff-team {
          font-size: 13px;
          color: var(--muted);
        }
        .diff-arrow {
          color: var(--muted);
        }
        .diff-vs {
          color: var(--muted);
          font-size: 12px;
        }
        .diff-vs-cell {
          color: var(--muted);
          font-weight: 700;
          width: 20px;
          text-align: center;
        }
        .diff-vs-inline {
          color: var(--muted);
          font-weight: 700;
        }
        .diff-status-inline {
          margin-left: 8px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .diff-status-chip {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 6px;
          border: 1px solid;
          font-size: 13px;
          font-weight: 700;
          color: #1d232b;
        }
        .diff-status-arrow {
          color: var(--muted);
          font-weight: 700;
          font-size: 13px;
        }
        .diff-empty {
          font-size: 14px;
          color: var(--muted);
        }
        .modal-card.progress-modal {
          width: min(420px, 90vw);
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .progress-spinner {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 4px solid #d7dde6;
          border-top-color: var(--accent);
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .modal-card.attendance-modal {
          width: min(640px, 92vw);
          max-height: 86vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .attendance-modal-body {
          display: grid;
          gap: 6px;
          min-height: 0;
          flex: 1;
          overflow: auto;
        }
        .attendance-modal-body .pairings-tab-bar {
          margin-top: 0;
        }
        .attendance-modal-table {
          border: 1px solid var(--line);
          border-radius: 10px;
          overflow: auto;
          max-height: 52vh;
          background: #fff;
        }
        .attendance-modal-table .attendance-table {
          font-size: 11px;
        }
        .attendance-modal-table .attendance-table th,
        .attendance-modal-table .attendance-table td {
          padding: 1px 4px;
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
        .modal-card.attendance-modal .modal-actions {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--line);
          background: #ffffff;
        }
        @media (max-width: 720px) {
          .modal-card.attendance-modal {
            width: 92vw;
            max-height: 92vh;
            padding: 12px;
          }
          .modal-card.attendance-modal .modal-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .modal-card.attendance-modal .modal-actions .nav-btn {
            width: 100%;
          }
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
        .pairings-context-menu.readonly {
          opacity: 0.92;
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
        .pairings-context-check {
          display: inline-flex;
          align-items: center;
        }
        .pairings-context-check input {
          pointer-events: none;
        }
        .pairings-context-item:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
        .pairings-context-item:hover {
          transform: translateY(-1px);
        }
        .pairings-context-item:disabled {
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
          opacity: 0.9;
        }
        .setup-control-row {
          max-width: 100%;
          flex-wrap: wrap;
          gap: 12px;
        }
        .setup-control-row label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex: 0 1 auto;
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
      {meetDeletedNotice && (
        <div className="toast">
          Meet was deleted. Returning to Meets...
        </div>
      )}
      <div className="meet-heading-row">
        <div className="meet-heading-title">
          {metadataParts.length > 0 && (
            <div className="meet-metadata-inline">
              {isEditingDate ? (
                <input
                  type="date"
                  value={editDateValue}
                  onChange={(e) => setEditDateValue(e.target.value)}
                  onBlur={() => {
                    setIsEditingDate(false);
                    void saveMeetDate(editDateValue);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setIsEditingDate(false);
                      void saveMeetDate(editDateValue);
                    }
                  }}
                  disabled={!canEdit}
                  style={{ minWidth: 140 }}
                />
              ) : (
              <button
                type="button"
                className="meet-date-btn"
                onClick={() => {
                  if (!canEdit) return;
                  setEditDateValue(meetDate ? meetDate.slice(0, 10) : "");
                  setIsEditingDate(true);
                }}
                disabled={!canEdit}
              >
                  {formattedDate ?? "Set date"}
                </button>
              )}
              {teamList ? ` - ${teamList}` : ""}
            </div>
          )}
          <div className="meet-heading-name-row">
            {!isEditingName && (
              <button
                type="button"
                className="meet-name-btn"
                onClick={() => {
                  if (!canEdit) return;
                  setIsEditingName(true);
                }}
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
            {hasHomeInfo && (
              <div className="meet-home-info">
                <span className="home-label">Home team:</span>
                {homeTeam && (
                  <span className="home-team-name">
                    {homeTeam.name}
                    {homeTeam.symbol ? ` (${homeTeam.symbol})` : ""}
                  </span>
                )}
                {homeLocationDisplay && (
                  <span className="home-location">- {homeLocationDisplay}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div
          className="lock-release-banner"
          style={{
            visibility:
              wantsEdit && lockState.status === "acquired" && inactivityRemainingMs !== null
                ? inactivityRemainingMs <= 30 * 1000
                  ? "visible"
                  : "hidden"
                : "hidden",
          }}
        >
          Lock will be released due to inactivity in:{" "}
          <b>{inactivityRemainingMs !== null ? formatInactivityCountdown(inactivityRemainingMs) : ""}</b>
        </div>
        <div className="meet-heading-actions">
          <div className="meet-status">
            <span>
              Status: <b>{meetStatus === "PUBLISHED" ? "Published" : "Draft"}</b>
            </span>
            {lastUpdatedAt && (
              <span className="meet-last-updated">
                Last edited {new Date(lastUpdatedAt).toLocaleString()} by {lastUpdatedBy ?? "unknown"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {isDraft && lockState.status !== "acquired" && (
              <button
                type="button"
                className="nav-btn"
                onClick={() => {
                  if (wantsEdit) {
                    void (async () => {
                      const ok = await acquireLock();
                      if (!ok) triggerNoticeFlash();
                    })();
                  } else {
                    updateEditMode(true, "start-edit");
                  }
                }}
              >
                Start Editing
              </button>
            )}
            {isDraft && wantsEdit && lockState.status === "acquired" && (
              <button
                type="button"
                className="nav-btn"
                onClick={() => {
                  void (async () => {
                    const released = await releaseLock("manual-release");
                    if (!released.ok) {
                      const message = released.message ?? "Unable to release lock.";
                      setLockActionError(message);
                      window.alert(message);
                      await refreshLockStatus();
                      triggerNoticeFlash();
                      return;
                    }
                    setLockActionError(null);
                    lockStatusRef.current = "locked";
                    updateLockState({ status: "locked", lockedByUsername: null });
                    updateEditMode(false, "release-lock");
                  })();
                }}
              >
                Release Lock
              </button>
            )}
            {activeTab === "pairings" && (
              <>
                <button
                  type="button"
                  className="nav-btn delete-btn"
                  onClick={handleRestartClick}
                  disabled={restartDisabled}
                >
                  Restart Meet Setup
                </button>
              </>
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
      {isDraft && lockState.status !== "acquired" && (
        <div className={`notice${flashNotice ? " flash" : ""}`} style={{ marginTop: 10 }}>
          Read-only mode. Click Start Editing to make changes.
          {lockState.lockedByUsername ? (
            lockState.lockedByUsername === currentUsername
              ? " Currently locked by you (another tab or device may be refreshing the lock)."
              : ` Currently locked by ${lockState.lockedByUsername}.`
          ) : ""}
        </div>
      )}
      {lockActionError && (
        <div className="notice" style={{ marginTop: 10 }}>
          {lockActionError}
        </div>
      )}
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
          <div className={`pairings-pane${canEdit ? "" : " readonly"}`}>
          {authMsg && (
            <div className="notice">
              {authMsg}
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="nav-btn"
                onClick={() => {
                  setClearAutoPairingsBeforeRun(true);
                  setShowAutoPairingsConfirm(true);
                }}
                disabled={!canEdit || autoPairingsLoading}
              >
                {autoPairingsLoading ? "Running..." : "Run Auto Pairings"}
              </button>
            <button
              type="button"
              className="nav-btn"
              onClick={() => {
                setAutoPairingsError(null);
                setAutoPairingsModalMode("manual");
                setAutoPairingsTeamId(attendanceTeamId);
                setShowAutoPairingsModal(true);
              }}
              disabled={!meetLoaded}
            >
              Attendance
            </button>
            <button
              type="button"
              className="nav-btn"
              onClick={() => {
                setCheckpointError(null);
                setShowCheckpointModal(true);
                if (!checkpointsLoaded) {
                  void loadCheckpoints();
                }
              }}
              disabled={!meetLoaded}
            >
              Checkpoints
            </button>
            </div>
          </div>
          <div className="pairings-tab-bar">
            {orderedPairingsTeams.map(team => {
              const isActive = pairingsTeamId === team.id;
              const activeTextColor = contrastText(team.color);
              const textColor = team.color ? teamTextColor(team.id) : undefined;
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
                  color: isActive && team.color ? activeTextColor : textColor ?? undefined,
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
        <div className="pairings-table-wrapper" ref={pairingsTableWrapperRef}>
        <table className="pairings-table" cellPadding={4} style={{ borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: pairingsEffectiveColWidths[0] }} />
              <col style={{ width: pairingsEffectiveColWidths[1] }} />
              <col style={{ width: pairingsEffectiveColWidths[2] }} />
              <col style={{ width: pairingsEffectiveColWidths[3] }} />
              <col style={{ width: pairingsEffectiveColWidths[4] }} />
              <col style={{ width: pairingsEffectiveColWidths[5] }} />
              <col style={{ width: pairingsEffectiveColWidths[6] }} />
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
                  <th
                    key={col.label}
                    className={`pairings-th sortable-th${index < 2 ? " pairings-name-cell" : ""}`}
                    onClick={() => toggleSort(setPairingsSort, col.key)}
                  >
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
            {pairingsSorted.map(w => {
              const statusClass = w.status === "LATE"
                ? " status-late"
                : w.status === "EARLY"
                  ? " status-early"
                  : "";
              return (
                <tr
                  key={w.id}
                  className={selectedPairingId === w.id ? "selected" : undefined}
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
                    backgroundColor: selectedPairingId === w.id ? "#f0f0f0" : undefined,
                    cursor: "pointer",
                  }}
                >
                    <td className={`pairings-name-cell${statusClass}`} style={{ color: teamTextColor(w.teamId) }}>{w.last}</td>
                    <td className={`pairings-name-cell${statusClass}`} style={{ color: teamTextColor(w.teamId) }}>{w.first}</td>
                    <td>{ageYears(w.birthdate)?.toFixed(1) ?? ""}</td>
                    <td>{w.weight}</td>
                    <td>{w.experienceYears}</td>
                    <td>{w.skill}</td>
                    <td className={getMatchCount(w.id) === 0 ? "zero-matches-cell" : undefined}>
                      {getMatchCount(w.id)}
                    </td>
                  </tr>
                );
            })}
              {attendingByTeam.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "#666" }}>No attending wrestlers.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>

        <div className="pairings-side-card" style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
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
                   <span>Weight: {target.weight}</span>
                   <span>Exp: {target.experienceYears}</span>
                   <span>Skill: {target.skill}</span>
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
                          const opponentColor = opponent ? teamTextColor(opponent.teamId) : undefined;
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
                            <td align="left">{getMatchCount(opponentId)}</td>
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
                  <div className="pairings-table-wrapper additional-matches-wrapper">
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
                        const matchColor = teamTextColor(o.teamId);
                        return (
                          <tr
                            key={o.id}
                            className="match-row-hover"
                            onClick={() => {
                              if (!canEdit) return;
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
                            <td align="left">{getMatchCount(o.id)}</td>
                          </tr>
                        );
                      })}
                      {availableSorted.length === 0 && (
                        <tr>
                          <td colSpan={8}>
                            {maxMatchesPerWrestler !== null && selectedMatchCount >= maxMatchesPerWrestler
                              ? "Wrestler already has maximum number of bouts"
                              : "No candidates meet the current limits."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
                    Note: Click on wrestler name to add or remove.
                  </div>
                    <div
                      className="setup-control-row"
                      style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}
                    >
                      <label><input type="checkbox" checked={settings.enforceAgeGapCheck} onChange={async e => {
                        const enforceAgeGapCheck = e.target.checked;
                        setSettings(s => ({ ...s, enforceAgeGapCheck }));
                      }} /> Enforce Age check</label>
                      <label><input type="checkbox" checked={settings.enforceWeightCheck} onChange={async e => {
                        const enforceWeightCheck = e.target.checked;
                        setSettings(s => ({ ...s, enforceWeightCheck }));
                      }} /> Enforce Weight check</label>
                      <label><input type="checkbox" checked={settings.firstYearOnlyWithFirstYear} onChange={async e => {
                        const checked = e.target.checked;
                        setSettings(s => ({ ...s, firstYearOnlyWithFirstYear: checked }));
                      }} /> First-year only rule</label>
                      <label><input type="checkbox" checked={settings.allowSameTeamMatches} onChange={async e => {
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
              <input
                type="text"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
                placeholder="Leave a note for other coaches..."
              />
            </div>
            <div className="panel-scroll fill" style={{ display: "block", marginTop: 12, fontSize: 13 }}>
              {comments.map(comment => (
                <div key={comment.id} style={{ margin: "2px 0", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span style={{ fontWeight: 600 }}>
                    {comment.author?.username ?? "unknown"}
                  </span>{" "}
                  <span style={{ fontSize: 11, color: "#666", marginRight: 10 }}>
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                  <span>{comment.body}</span>
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

      {showCheckpointModal && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowCheckpointModal(false)}>
            <div className="modal-card checkpoint-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Manage Checkpoints of the current state of the meet</h3>
              <div className="checkpoint-form">
                <input
                  className="checkpoint-input"
                  placeholder="New checkpoint name"
                  value={checkpointName}
                  onChange={(e) => setCheckpointName(e.target.value)}
                  maxLength={80}
                />
                <button
                  className="nav-btn checkpoint-save-btn"
                  type="button"
                  onClick={saveCheckpoint}
                  disabled={checkpointSaving || !checkpointName.trim()}
                  title="Save a checkpoint on the server"
                >
                  {checkpointSaving ? "Saving..." : "Save"}
                </button>
                <button
                  className="nav-btn"
                  type="button"
                  onClick={exportMeet}
                  disabled={!meetLoaded || exportingMeet}
                  title="Export a zip file for use with desktop Pairings program"
                >
                  {exportingMeet ? "Exporting..." : "Export to .wrs"}
                </button>
              </div>
              {checkpointError && (
                <div style={{ color: "#b00020", fontSize: 13, marginBottom: 8 }}>
                  {checkpointError}
                </div>
              )}
              <div className="checkpoint-list">
                {checkpoints.length === 0 && (
                  <div className="checkpoint-empty">No checkpoints saved yet.</div>
                )}
                {checkpoints.map(cp => (
                  <div key={cp.id} className="checkpoint-row">
                    <div className="checkpoint-info">
                      <div className="checkpoint-name">{cp.name}</div>
                      <div className="checkpoint-meta">
                        {formatCheckpointDate(cp.createdAt)}
                        {cp.createdBy?.username ? ` · ${cp.createdBy.username}` : ""}
                      </div>
                    </div>
                    <div className="checkpoint-actions">
                      <button
                        className="nav-btn delete-btn"
                        type="button"
                        onClick={() => deleteCheckpoint(cp.id)}
                        disabled={checkpointDeletingId === cp.id}
                        title={`Delete [${cp.name}]`}
                      >
                        {checkpointDeletingId === cp.id ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        className="nav-btn checkpoint-apply-btn"
                        type="button"
                        onClick={() => applyCheckpoint(cp.id, cp.name)}
                        disabled={!canEdit || checkpointApplyingId === cp.id}
                        title={`Revert the meet to [${cp.name}] (loses all changes made after this checkpoint was saved).`}
                      >
                        {checkpointApplyingId === cp.id ? "Applying..." : "Apply"}
                      </button>
                      <button
                        className="nav-btn checkpoint-changes-btn"
                        type="button"
                        onClick={() => showCheckpointChanges(cp.id, cp.name)}
                        disabled={checkpointDiffLoadingId === cp.id}
                        title={`Show changes since [${cp.name}]`}
                      >
                        {checkpointDiffLoadingId === cp.id ? "Loading..." : "Show Changes"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button className="nav-btn" onClick={() => setShowCheckpointModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {checkpointDiff && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setCheckpointDiff(null)}>
            <div className="modal-card checkpoint-diff-modal" onClick={(e) => e.stopPropagation()}>
              <div className="diff-header">
                <span className="diff-header-title">Changes since</span>
                <span className="diff-header-name">{checkpointDiff.name}</span>
              </div>
              {checkpointDiff.matChangedCount > 0 && (
                <div className="diff-section">
                  <div className="diff-title">
                    Mat assignments changed ({checkpointDiff.matChangedCount})
                  </div>
                </div>
              )}
              {checkpointDiff.attendance.length > 0 && (
                <div className="diff-section">
                  <div className="diff-title">Attendance changes ({checkpointDiff.attendance.length})</div>
                  <div className="diff-table-wrap">
                    <table className="diff-table diff-table-attendance">
                      <tbody>
                        {checkpointDiff.attendance.map(entry => (
                          <tr key={entry.wrestlerId}>
                            <td
                              style={{ color: teamColorById(wMap[entry.wrestlerId]?.teamId) ?? undefined }}
                            >
                              {entry.first} {entry.last}
                              {teamSymbolById(wMap[entry.wrestlerId]?.teamId)
                                ? ` (${teamSymbolById(wMap[entry.wrestlerId]?.teamId)})`
                                : ""}
                              <span className="diff-status-inline">
                                <span
                                  className="diff-status-chip"
                                  style={{
                                    background: attendanceStatusStyles[entry.from].background,
                                    borderColor: attendanceStatusStyles[entry.from].borderColor,
                                  }}
                                >
                                  {formatStatusLabel(entry.from)}
                                </span>
                                <span className="diff-status-arrow">→</span>
                                <span
                                  className="diff-status-chip"
                                  style={{
                                    background: attendanceStatusStyles[entry.to].background,
                                    borderColor: attendanceStatusStyles[entry.to].borderColor,
                                  }}
                                >
                                  {formatStatusLabel(entry.to)}
                                </span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {checkpointDiff.boutsAdded.length > 0 && (
                <div className="diff-section">
                  <div className="diff-title">Bouts added ({checkpointDiff.boutsAdded.length})</div>
                  <div className="diff-table-wrap">
                    <table className="diff-table diff-table-bouts">
                      <tbody>
                        {checkpointDiff.boutsAdded.map((b, idx) => (
                          <tr key={`${b.redId}-${b.greenId}-${idx}`}>
                            <td>
                              <span style={{ color: teamColorById(wMap[b.redId]?.teamId) ?? undefined }}>
                                {wMap[b.redId]?.first ?? "Unknown"} {wMap[b.redId]?.last ?? b.redId}
                                {b.redTeam ? ` (${b.redTeam})` : ""}
                              </span>
                              <span className="diff-vs-inline"> v </span>
                              <span style={{ color: teamColorById(wMap[b.greenId]?.teamId) ?? undefined }}>
                                {wMap[b.greenId]?.first ?? "Unknown"} {wMap[b.greenId]?.last ?? b.greenId}
                                {b.greenTeam ? ` (${b.greenTeam})` : ""}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {checkpointDiff.boutsRemoved.length > 0 && (
                <div className="diff-section">
                  <div className="diff-title">Bouts removed ({checkpointDiff.boutsRemoved.length})</div>
                  <div className="diff-table-wrap">
                    <table className="diff-table diff-table-bouts">
                      <tbody>
                        {checkpointDiff.boutsRemoved.map((b, idx) => (
                          <tr key={`${b.redId}-${b.greenId}-${idx}`}>
                            <td>
                              <span style={{ color: teamColorById(wMap[b.redId]?.teamId) ?? undefined }}>
                                {wMap[b.redId]?.first ?? "Unknown"} {wMap[b.redId]?.last ?? b.redId}
                                {b.redTeam ? ` (${b.redTeam})` : ""}
                              </span>
                              <span className="diff-vs-inline"> v </span>
                              <span style={{ color: teamColorById(wMap[b.greenId]?.teamId) ?? undefined }}>
                                {wMap[b.greenId]?.first ?? "Unknown"} {wMap[b.greenId]?.last ?? b.greenId}
                                {b.greenTeam ? ` (${b.greenTeam})` : ""}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {checkpointDiff.attendance.length === 0 &&
                checkpointDiff.matChangedCount === 0 &&
                checkpointDiff.boutsAdded.length === 0 &&
                checkpointDiff.boutsRemoved.length === 0 && (
                  <div className="diff-empty">No changes since this checkpoint.</div>
                )}
              <div className="modal-actions">
                <button className="nav-btn" onClick={() => setCheckpointDiff(null)}>Close</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
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
                Restarting will delete this meet and begin the process of creating a new meet.
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
            <div className="modal-card attendance-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Auto pairings attendance check</h3>
              <p style={{ marginTop: 4, marginBottom: 6 }}>
                Review attendance for each team before generating pairings. Only wrestlers marked as coming will be matched.
              </p>
              <div className="attendance-modal-body">
                <div>
                  <div style={{ fontSize: 12, color: "#5b6472", marginBottom: 6 }}>
                    Select team
                  </div>
                  <div className="pairings-tab-bar" style={{ marginTop: 0 }}>
                    {orderedPairingsTeams.map(team => {
                      const isActive = modalAttendanceTeamId === team.id;
                      const activeTextColor = contrastText(team.color);
                      const textColor = team.color ? teamTextColor(team.id) : undefined;
                      return (
                        <button
                          key={team.id}
                          onClick={() => setAutoPairingsTeamId(team.id)}
                          className={`pairing-tab ${isActive ? "active" : ""}`}
                          style={{
                            background: isActive
                              ? (team.color ?? "#ffffff")
                              : team.color ? `${team.color}22` : undefined,
                            borderColor: team.color ?? undefined,
                            color: isActive && team.color ? activeTextColor : textColor ?? undefined,
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
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, color: "#444", fontWeight: 600 }}>
                    {modalAttendanceTeam?.name ? `${modalAttendanceTeam.name} - ` : ""}Coming: {modalAttendanceCounts.coming} - Not Coming: {modalAttendanceCounts.notComing}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="nav-btn"
                      onClick={() => setModalAttendanceForTeam(null)}
                      disabled={!canEdit || !modalAttendanceTeamId}
                    >
                      Set all coming
                    </button>
                  </div>
                </div>
                <div className="attendance-modal-table">
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
                      {modalAttendanceSorted.map(w => {
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
                          padding: "1px 6px",
                          borderRadius: 6,
                          border: `1px solid ${isComing ? "#bcd8c1" : "#cfcfcf"}`,
                          background: isComing ? "#e6f6ea" : "#f0f0f0",
                          color: isComing ? "#1d232b" : "#5f6772",
                          cursor: canEdit ? "pointer" : "default",
                          transition: "background 0.2s, border-color 0.2s",
                          fontWeight: 600,
                          fontSize: 11,
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
                                      updateModalAttendanceStatus(w.id, nextStatus);
                                    }}
                                    aria-label="Coming"
                                  />
                                  Coming
                                </label>
                                <button
                                  onClick={() => {
                                    const nextStatus = isLate ? null : "LATE";
                                    updateModalAttendanceStatus(w.id, nextStatus);
                                  }}
                                  disabled={!canEdit || !isComing}
                                  style={activeStyle(isLate, { background: "#dff1ff", borderColor: "#b6defc", padding: "1px 6px", fontSize: 11 })}
                                >
                                  Arrive late
                                </button>
                                <button
                                  onClick={() => {
                                    const nextStatus = isEarly ? null : "EARLY";
                                    updateModalAttendanceStatus(w.id, nextStatus);
                                  }}
                                  disabled={!canEdit || !isComing}
                                  style={activeStyle(isEarly, { background: "#f3eadf", borderColor: "#e2c8ad", padding: "1px 6px", fontSize: 11 })}
                                >
                                  Leave early
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {modalAttendanceRoster.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ color: "#666" }}>No wrestlers on this team.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              {autoPairingsError && (
                <div style={{ color: "#b00020", fontSize: 13 }}>
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
                  className="nav-btn"
                  onClick={() => {
                    void (async () => {
                      if (!canEdit) {
                        setShowAutoPairingsModal(false);
                        return;
                      }
                      const saved = await saveModalAttendanceChanges();
                      if (!saved) return;
                      if (autoPairingsModalMode === "auto") {
                        await rerunAutoPairings();
                      }
                      setShowAutoPairingsModal(false);
                    })();
                  }}
                  type="button"
                  disabled={autoPairingsLoading}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {autoPairingsLoading && autoPairingsSlow && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card progress-modal" onClick={(e) => e.stopPropagation()}>
              <div className="progress-spinner" aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 700 }}>Generating pairings...</div>
                <div style={{ fontSize: 13, color: "#5b6472", marginTop: 4 }}>
                  This can take a bit for larger meets.
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {showAutoPairingsConfirm && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowAutoPairingsConfirm(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Run Auto Pairings</h3>
              <div style={{ fontSize: 13, color: "#5b6472" }}>
                Generate new pairings for this meet.
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={clearAutoPairingsBeforeRun}
                  onChange={(e) => setClearAutoPairingsBeforeRun(e.target.checked)}
                />
                Clear all existing bouts before generating
              </label>
              <div className="modal-actions">
                <button
                  className="nav-btn"
                  type="button"
                  onClick={() => setShowAutoPairingsConfirm(false)}
                  disabled={autoPairingsLoading}
                >
                  Cancel
                </button>
                <button
                  className="nav-btn delete-btn"
                  type="button"
                  onClick={() => {
                    void (async () => {
                      setShowAutoPairingsConfirm(false);
                      await rerunAutoPairings({ clearExisting: clearAutoPairingsBeforeRun });
                    })();
                  }}
                  disabled={!canEdit || autoPairingsLoading}
                >
                  {autoPairingsLoading ? "Running..." : "Run Auto Pairings"}
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
        const currentStatus = pairingContext.wrestler.status ?? "COMING";
        return (
          <>
            <div className="pairings-context-backdrop" onMouseDown={() => setPairingContext(null)} />
            <div
              className={`pairings-context-menu${canEdit ? "" : " readonly"}`}
              ref={pairingMenuRef}
              style={{ left, top }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="pairings-context-title">{fullName}</div>
              <button
                className="pairings-context-item"
                style={{
                  background: attendanceStatusStyles.COMING.background,
                  border: `1px solid ${attendanceStatusStyles.COMING.borderColor}`,
                }}
                onClick={() => handlePairingContextStatus("COMING")}
                disabled={!canEdit}
              >
                <span className="pairings-context-check" aria-hidden="true">
                  <input type="checkbox" checked={currentStatus === "COMING"} readOnly />
                </span>
                Coming
              </button>
              <button
                className="pairings-context-item"
                style={{
                  background: attendanceStatusStyles.NOT_COMING.background,
                  border: `1px solid ${attendanceStatusStyles.NOT_COMING.borderColor}`,
                }}
                onClick={() => handlePairingContextStatus("NOT_COMING")}
                disabled={!canEdit}
              >
                <span className="pairings-context-check" aria-hidden="true">
                  <input type="checkbox" checked={currentStatus === "NOT_COMING"} readOnly />
                </span>
                Not Coming
              </button>
              <button
                className="pairings-context-item"
                style={{
                  background: attendanceStatusStyles.LATE.background,
                  border: `1px solid ${attendanceStatusStyles.LATE.borderColor}`,
                }}
                onClick={() => handlePairingContextStatus("LATE")}
                disabled={!canEdit}
              >
                <span className="pairings-context-check" aria-hidden="true">
                  <input type="checkbox" checked={currentStatus === "LATE"} readOnly />
                </span>
                Arrive Late
              </button>
              <button
                className="pairings-context-item"
                style={{
                  background: attendanceStatusStyles.EARLY.background,
                  border: `1px solid ${attendanceStatusStyles.EARLY.borderColor}`,
                }}
                onClick={() => handlePairingContextStatus("EARLY")}
                disabled={!canEdit}
              >
                <span className="pairings-context-check" aria-hidden="true">
                  <input type="checkbox" checked={currentStatus === "EARLY"} readOnly />
                </span>
                Leave Early
              </button>
            </div>
          </>
        );
      })()}
          </div>
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
              lockState={lockState}
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

