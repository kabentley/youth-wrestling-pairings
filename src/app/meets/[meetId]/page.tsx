"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import MatBoardTab from "./matboard/MatBoardTab";
import AttendanceTab from "./attendance/AttendanceTab";
import VolunteersTab from "./volunteers/VolunteersTab";
import ScratchesTab from "./scratches/ScratchesTab";
import ScoringSheetTab from "./wall/ScoringSheetTab";
import ScratchSheetTab from "./wall/ScratchSheetTab";
import WallChartTab from "./wall/WallChartTab";

import AppHeader from "@/components/AppHeader";
import { DAYS_PER_YEAR } from "@/lib/constants";
import { adjustTeamTextColor } from "@/lib/contrastText";
import { formatTeamName } from "@/lib/formatTeamName";
import {
  isEditableMeetPhase,
  meetPhaseLabel,
  normalizeMeetPhase,
  type MeetPhase,
} from "@/lib/meetPhase";
import { pairKey } from "@/lib/pairKey";

// Render into document.body after mount to avoid SSR/DOM mismatches for modals.
function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
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
type AttendanceStatus = "COMING" | "NOT_COMING" | "LATE" | "EARLY" | "ABSENT";
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
  status?: AttendanceStatus | null;
};
type Bout = {
  id: string;
  redId: string;
  greenId: string;
  pairingScore: number;
  mat?: number | null;
  order?: number | null;
  assignedByPeopleRule?: boolean;
  peopleRuleUserId?: string | null;
  source?: string | null;
  createdAt?: string;
  sourceUser?: {
    id: string;
    name?: string | null;
    username?: string | null;
    teamId?: string | null;
    teamColor?: string | null;
  } | null;
  peopleRuleUser?: {
    id: string;
    role?: string | null;
    name?: string | null;
    username?: string | null;
    teamId?: string | null;
    teamColor?: string | null;
  } | null;
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
type PairingContextMode = "status" | "showMatches";
type PairingContext = {
  x: number;
  y: number;
  wrestler: Wrestler;
  mode: PairingContextMode;
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
type MatchesTooltip =
  | { mode: "matches"; wrestlerId: string; x: number; y: number }
  | {
      mode: "rejected";
      left: { name: string; teamId: string | null };
      right: { name: string; teamId: string | null };
      by: string;
      at: string;
      x: number;
      y: number;
    }
  | {
      mode: "manual";
      left: { name: string; teamId: string | null };
      right: { name: string; teamId: string | null };
      by: string;
      at: string;
      x: number;
      y: number;
    }
  | { mode: "auto"; at: string; x: number; y: number };
type MeetCheckpoint = {
  id: string;
  name: string;
  createdAt: string;
  createdBy?: { username?: string | null } | null;
};
type LockAccessCoach = {
  id: string;
  username: string;
  name?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamSymbol?: string | null;
  teamColor?: string | null;
  isHeadCoach?: boolean;
  canAcquireLock: boolean;
};
type LockAccessTeamGroup = {
  key: string;
  title: string;
  color: string | null;
  coaches: LockAccessCoach[];
};
type CheckpointPayload = {
  version: 1;
  name: string;
  createdAt: string;
  meetId: string;
  meetName: string;
  meetDate: string;
  teamIds: string[];
  attendance: { wrestlerId: string; status: AttendanceStatus | null }[];
  bouts: {
    redId: string;
    greenId: string;
    pairingScore: number;
    mat?: number | null;
    order?: number | null;
    originalMat?: number | null;
    assignedByPeopleRule?: boolean;
    peopleRuleUserId?: string | null;
    source?: string | null;
    createdAt?: string;
  }[];
};
type AttendanceDiffStatus = AttendanceStatus | "NO_REPLY";
type CheckpointDiff = {
  name: string;
  attendance: { wrestlerId: string; first: string; last: string; from: AttendanceDiffStatus; to: AttendanceDiffStatus }[];
  boutsAdded: { redId: string; greenId: string; redTeam?: string; greenTeam?: string }[];
  boutsRemoved: { redId: string; greenId: string; redTeam?: string; greenTeam?: string }[];
  matChangedCount: number;
};
type ReadyForCheckinChecklistItem = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  severity: "error" | "warning";
  action?: "sync-volunteer-mats" | "fix-rest-conflicts";
  actionLabel?: string;
};
type ReadyForCheckinChecklist = {
  ok: boolean;
  checkedAt: string;
  items: ReadyForCheckinChecklistItem[];
};

type CheckpointSaveRowProps = {
  onSave: (name: string) => Promise<boolean>;
};

// Inline form row for naming and saving a checkpoint.
function CheckpointSaveRow({ onSave }: CheckpointSaveRowProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Guard empty names and provide optimistic UI while saving.
  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const ok = await onSave(trimmed);
    setSaving(false);
    if (ok) setName("");
  };

  return (
    <div className="checkpoint-form">
      <input
        className="checkpoint-input"
        placeholder="New checkpoint name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleSave();
          }
        }}
      />
      <button
        className="nav-btn checkpoint-save-btn"
        type="button"
        onClick={handleSave}
        disabled={saving || !name.trim()}
        title="Save a checkpoint of the current state of the meet"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

const INACTIVITY_RELEASE_MS = 5 * 60 * 1000;

const CURRENT_SHARED_COLUMN_MAP: Record<number, number | undefined> = {
  0: 0,
  1: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
};

const AVAILABLE_SHARED_COLUMN_MAP = CURRENT_SHARED_COLUMN_MAP;
const DEFAULT_PRUNE_TARGET_MATCHES = 5;

export default function MeetDetail({ params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const editRequested = searchParams.get("edit") === "1";
  const [wantsEdit, setWantsEdit] = useState(editRequested);
  const daysPerYear = DAYS_PER_YEAR;

  const [teams, setTeams] = useState<Team[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler | undefined>>({});
  const [meetName, setMeetName] = useState("");
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [attendanceDeadline, setAttendanceDeadline] = useState<string | null>(null);
  const [meetStatus, setMeetStatus] = useState<MeetPhase>("DRAFT");
  const [meetLoaded, setMeetLoaded] = useState(false);
  const [matchesPerWrestler, setMatchesPerWrestler] = useState<number | null>(null);
  const [savedMatchesPerWrestler, setSavedMatchesPerWrestler] = useState<number | null>(null);
  const [maxMatchesPerWrestler, setMaxMatchesPerWrestler] = useState<number | null>(null);
  const [restGap, setRestGap] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  const [changes, setChanges] = useState<MeetChange[]>([]);
  const [comments, setComments] = useState<MeetComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const commentsVisibilityInitializedRef = useRef(false);
  const [checkpoints, setCheckpoints] = useState<MeetCheckpoint[]>([]);
  const [checkpointsLoaded, setCheckpointsLoaded] = useState(false);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [showEditAccessModal, setShowEditAccessModal] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [checkpointApplyingId, setCheckpointApplyingId] = useState<string | null>(null);
  const [checkpointDeletingId, setCheckpointDeletingId] = useState<string | null>(null);
  const [checkpointDiff, setCheckpointDiff] = useState<CheckpointDiff | null>(null);
  const [checkpointDiffLoadingId, setCheckpointDiffLoadingId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [attendanceColWidths, setAttendanceColWidths] = useState([90, 90]);
  const [pairingsColWidths, setPairingsColWidths] = useState([110, 95, 45, 60, 60, 45, 45, 70]);
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [sharedPairingsColWidths, setSharedPairingsColWidths] = useState([110, 95, 45, 60, 60, 45, 45, 70, 70]);
  const pairingsTableWrapperRef = useRef<HTMLDivElement | null>(null);
  const [pairingsTableWidth, setPairingsTableWidth] = useState<number | null>(null);
  const [currentBoutColWidth, setCurrentBoutColWidth] = useState(66);
  const [currentTeamColWidth, setCurrentTeamColWidth] = useState(70);
  const [currentSourceColWidth, setCurrentSourceColWidth] = useState(80);
  const [availableTeamColWidth, setAvailableTeamColWidth] = useState(70);

  const sharedColumnWidths = {
    last: sharedPairingsColWidths[0],
    first: sharedPairingsColWidths[1],
    girl: sharedPairingsColWidths[2],
    age: sharedPairingsColWidths[3],
    weight: sharedPairingsColWidths[4],
    exp: sharedPairingsColWidths[5],
    skill: sharedPairingsColWidths[6],
    score: sharedPairingsColWidths[7],
    matches: sharedPairingsColWidths[8],
  };

  const currentColumnWidths = [
    sharedColumnWidths.last,
    sharedColumnWidths.first,
    currentTeamColWidth,
    sharedColumnWidths.girl,
    sharedColumnWidths.age,
    sharedColumnWidths.weight,
    sharedColumnWidths.exp,
    sharedColumnWidths.skill,
    sharedColumnWidths.score,
    sharedColumnWidths.matches,
    currentBoutColWidth,
    currentSourceColWidth,
  ];

  const rejectedBadgeColWidth = 90;
  const availableColumnWidths = [
    sharedColumnWidths.last,
    sharedColumnWidths.first,
    availableTeamColWidth,
    sharedColumnWidths.girl,
    sharedColumnWidths.age,
    sharedColumnWidths.weight,
    sharedColumnWidths.exp,
    sharedColumnWidths.skill,
    sharedColumnWidths.score,
    sharedColumnWidths.matches,
    rejectedBadgeColWidth,
  ];
  const resizeRef = useRef<{ kind: "attendance" | "pairings" | "current" | "available"; index: number; startX: number; startWidth: number } | null>(null);
  const lastSavedNameRef = useRef("");
  const nameSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [pairingsTeamId, setPairingsTeamId] = useState<string | null>(null);
  const [selectedPairingId, setSelectedPairingId] = useState<string | null>(null);
  const [attendanceSort, setAttendanceSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const [pairingsSort, setPairingsSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const currentSort = useMemo(() => ({ key: "score", dir: "asc" as const }), []);
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
  const [rejectedPairs, setRejectedPairs] = useState<Map<string, {
    a: { name: string; teamId: string | null };
    b: { name: string; teamId: string | null };
    by: string;
    at: string;
    byTeamId: string | null;
    byTeamColor: string | null;
  }>>(new Map());

  const [settings, setSettings] = useState({
    enforceAgeGapCheck: true,
    enforceWeightCheck: true,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: false,
    girlsWrestleGirls: true,
  });
  const [candidateRefreshVersion, setCandidateRefreshVersion] = useState(0);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [showAutoPairingsConfirm, setShowAutoPairingsConfirm] = useState(false);
  const [clearAutoPairingsBeforeRun, setClearAutoPairingsBeforeRun] = useState(false);
  const [pruneTargetMatches, setPruneTargetMatches] = useState<number | null>(null);
  const [allowRejectedMatchups, setAllowRejectedMatchups] = useState(false);
  const [autoMatchesPerWrestler, setAutoMatchesPerWrestler] = useState<number | null>(null);
  const [autoMaxMatchesPerWrestler, setAutoMaxMatchesPerWrestler] = useState<number | null>(null);
  const [autoPairingsLoading, setAutoPairingsLoading] = useState(false);
  const [autoPairingsError, setAutoPairingsError] = useState<string | null>(null);
  const [autoPairingsSummary, setAutoPairingsSummary] = useState<string | null>(null);
  const [autoPairingsSlow, setAutoPairingsSlow] = useState(false);
  const autoPairingsSlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportingMeet, setExportingMeet] = useState(false);
  const [showCloseAttendanceWarningModal, setShowCloseAttendanceWarningModal] = useState(false);
  const [showPublishWarningModal, setShowPublishWarningModal] = useState(false);
  const pairingsInitRef = useRef(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserTeamId, setCurrentUserTeamId] = useState<string | null>(null);
  const [lockAccessLoaded, setLockAccessLoaded] = useState(false);
  const [canManageLockAccess, setCanManageLockAccess] = useState(false);
  const [canAcquireMeetLock, setCanAcquireMeetLock] = useState(true);
  const [coordinatorName, setCoordinatorName] = useState<string | null>(null);
  const [coordinatorUsername, setCoordinatorUsername] = useState<string | null>(null);
  const [coordinatorAssigned, setCoordinatorAssigned] = useState(true);
  const [lockAccessCoaches, setLockAccessCoaches] = useState<LockAccessCoach[]>([]);
  const [lockAccessDraftIds, setLockAccessDraftIds] = useState<Set<string>>(new Set());
  const [lockAccessSaving, setLockAccessSaving] = useState(false);
  const [lockAccessError, setLockAccessError] = useState<string | null>(null);
  const [showReadyForCheckinModal, setShowReadyForCheckinModal] = useState(false);
  const [readyForCheckinChecklist, setReadyForCheckinChecklist] = useState<ReadyForCheckinChecklist | null>(null);
  const [readyForCheckinLoading, setReadyForCheckinLoading] = useState(false);
  const [readyForCheckinSubmitting, setReadyForCheckinSubmitting] = useState(false);
  const [readyForCheckinError, setReadyForCheckinError] = useState<string | null>(null);
  const [readyForCheckinActionId, setReadyForCheckinActionId] = useState<string | null>(null);
  const [readyForCheckinTargetStatus, setReadyForCheckinTargetStatus] = useState<"READY_FOR_CHECKIN" | "PUBLISHED">("READY_FOR_CHECKIN");

  // Rebuild pairings (optionally clearing existing bouts) and refresh UI state.
  async function rerunAutoPairings(options: { clearExisting?: boolean } = {}) {
    const clearExisting = options.clearExisting ?? true;
    setAutoPairingsError(null);
    setAutoPairingsSummary(null);
    setAutoPairingsLoading(true);
    try {
      if (clearExisting) {
        const clearRes = await fetch(`/api/meets/${meetId}/pairings`, { method: "DELETE" });
        if (!clearRes.ok) {
          const errorText = await clearRes.text();
          throw new Error(errorText || "Unable to clear existing bouts.");
        }
      }
        const targetMatchesValue = autoMatchesPerWrestler ?? matchesPerWrestler ?? savedMatchesPerWrestler ?? undefined;
        const pruneTargetValue = pruneTargetMatches ?? DEFAULT_PRUNE_TARGET_MATCHES;
        const effectivePruneTarget = targetMatchesValue !== undefined
          ? Math.max(pruneTargetValue, targetMatchesValue)
          : pruneTargetValue;
        const payload = {
          firstYearOnlyWithFirstYear: settings.firstYearOnlyWithFirstYear,
          allowSameTeamMatches: settings.allowSameTeamMatches,
          girlsWrestleGirls: settings.girlsWrestleGirls,
          matchesPerWrestler: autoMatchesPerWrestler ?? matchesPerWrestler ?? undefined,
          pruneTargetMatches: effectivePruneTarget,
          maxMatchesPerWrestler: autoMaxMatchesPerWrestler ?? maxMatchesPerWrestler ?? undefined,
          preserveMats: !clearExisting,
          allowRejectedMatchups: allowRejectedMatchups && rejectedPairs.size > 0,
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
        const generateJson = await generateRes.json().catch(() => null);
        const changeMessages = Array.isArray(generateJson?.changeMessages)
          ? generateJson.changeMessages.filter(
              (message: unknown): message is string =>
                typeof message === "string" && message.trim().length > 0,
            )
          : [];
        const addedCount = typeof generateJson?.created === "number" ? generateJson.created : 0;
        const removedCount =
          typeof generateJson?.removedOverTarget === "number" ? generateJson.removedOverTarget : 0;
        await load();
      await loadActivity();
      const dialogMessages = changeMessages.length > 0
        ? changeMessages
        : [
            `Added ${addedCount} bout${addedCount === 1 ? "" : "s"}.`,
            `Removed ${removedCount} bout${removedCount === 1 ? "" : "s"}.`,
          ];
      setAutoPairingsSummary(`Auto pairings: ${dialogMessages.join(" ")}`);
      return true;
    } catch (err) {
      setAutoPairingsError(err instanceof Error ? err.message : "Unable to rerun auto pairings.");
      return false;
    } finally {
      setAutoPairingsLoading(false);
    }
  }

  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pairings" | "attendance" | "matboard" | "volunteers" | "wallMat" | "wallTeam" | "scratch" | "scratches" | "scoring">("pairings");
  const checkinDefaultTabAppliedRef = useRef(false);
  const [wallRefreshIndex, setWallRefreshIndex] = useState(0);
  const [matRefreshIndex, setMatRefreshIndex] = useState(0);
  const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
  const [meetLocation, setMeetLocation] = useState<string | null>(null);
  // Keep the home team first in the pairings tab order.
  const orderedPairingsTeams = useMemo(() => {
    if (!homeTeamId) return teams;
    const homeTeam = teams.find(t => t.id === homeTeamId);
    if (!homeTeam) return teams;
    return [homeTeam, ...teams.filter(t => t.id !== homeTeamId)];
  }, [teams, homeTeamId]);

  const [target, setTarget] = useState<Wrestler | null>(null);
  const pairingMenuRef = useRef<HTMLDivElement | null>(null);
  const [pairingMenuSize, setPairingMenuSize] = useState({ width: 210, height: 150 });
  const [pairingContext, setPairingContext] = useState<PairingContext | null>(null);
  const [matchesTooltip, setMatchesTooltip] = useState<MatchesTooltip | null>(null);
  const targetAge = target ? ageYears(target.birthdate)?.toFixed(1) : null;
  const autoTargetMatches = autoMatchesPerWrestler ?? matchesPerWrestler ?? savedMatchesPerWrestler ?? null;
  const pruneTargetMin = autoTargetMatches ?? 1;
  const pruneTargetDisplay = pruneTargetMatches ?? DEFAULT_PRUNE_TARGET_MATCHES;
  const attendanceStatusStyles: Record<AttendanceDiffStatus, { background: string; borderColor: string }> = {
    COMING: { background: "#eaf6e6", borderColor: "#c6e2ba" },
    NOT_COMING: { background: "#f0f0f0", borderColor: "#cfcfcf" },
    LATE: { background: "#dff1ff", borderColor: "#b6defc" },
    EARLY: { background: "#f3eadf", borderColor: "#e2c8ad" },
    ABSENT: { background: "#f4ecec", borderColor: "#dfc1c1" },
    NO_REPLY: { background: "#f1f3f5", borderColor: "#d6dbe1" },
  };
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  // Toggle edit mode and keep the URL in sync for deep links.
  const updateEditMode = useCallback((next: boolean, _reason?: string) => {
    if (!next) {
      suppressEditRequestedRef.current = true;
    }
    setWantsEdit(next);
    router.replace(next ? `/meets/${meetId}?edit=1` : `/meets/${meetId}`);
  }, [meetId, router]);

  // Briefly flash a UI notice (used after saves).
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

  // Stop inactivity tracking and clear countdown.
  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    inactivityDeadlineRef.current = null;
    setInactivityRemainingMs(null);
  }, []);

  // Centralized lock state update to keep timers/errors consistent.
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

  // Release the meet lock, optionally with a reason for server logs.
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

  // Reset inactivity timer and auto-release the lock after timeout.
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

  // Attempt to acquire the meet edit lock and surface server guidance if blocked.
  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.status === 401) {
      setAuthMsg("Please sign in to edit this meet.");
      return false;
    }
    if (res.status === 403) {
      const json = await res.json().catch(() => ({}));
      if (json?.code === "LOCK_ACCESS_DENIED") {
        const coordinatorHintName = typeof json?.coordinatorName === "string" ? json.coordinatorName.trim() : "";
        const coordinatorHintUsername = typeof json?.coordinatorUsername === "string" ? json.coordinatorUsername : "";
        let coordinatorHintDisplayName = coordinatorHintUsername;
        if (coordinatorHintName) {
          coordinatorHintDisplayName = coordinatorHintName;
        }
        const coordinatorHintLabel = coordinatorHintUsername
          ? `${coordinatorHintDisplayName} (@${coordinatorHintUsername})`
          : "";
        const coordinatorHint = coordinatorHintLabel
          ? ` Ask Meet Coordinator ${coordinatorHintLabel} for access.`
          : "";
        setLockActionError(`You do not have edit access for this meet.${coordinatorHint}`);
        updateLockState({ status: "locked", lockedByUsername: null });
        await refreshLockStatus();
        return false;
      }
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

  // Poll lock status so the UI can reflect who currently owns the lock.
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

  // Display helpers for teams (symbol/name/color).
  function teamSymbolById(teamId?: string | null) {
    if (!teamId) return "";
    const team = teams.find(t => t.id === teamId);
    return team?.symbol ?? team?.name ?? "";
  }
  function teamSymbol(id: string) {
    const team = teams.find(t => t.id === id);
    return team?.symbol ?? team?.name ?? id;
  }

  // Export the meet as a .wrs bundle and download locally.
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

  // Normalize checkpoint timestamps for consistent display.
  function formatCheckpointDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  // Apply a saved checkpoint and refresh derived views.
  async function applyCheckpoint(id: string, name: string) {
    if (!canApplyCheckpoint) return;
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
      setShowCheckpointModal(false);
      setCheckpointDiff(null);
      setMatRefreshIndex(idx => idx + 1);
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to apply checkpoint.");
    } finally {
      setCheckpointApplyingId(null);
    }
  }

  // Remove a saved checkpoint entry.
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

  // Normalize missing attendance to a consistent default.
  function normalizeAttendance(status?: AttendanceStatus | null): AttendanceDiffStatus {
    return status ?? "NO_REPLY";
  }
  // Render-friendly label for attendance status chips.
  function formatStatusLabel(status: AttendanceDiffStatus) {
    return STATUS_LABELS[status];
  }

  // Stable key for a bout regardless of red/green order.
  function boutKey(redId: string, greenId: string) {
    return redId < greenId ? `${redId}|${greenId}` : `${greenId}|${redId}`;
  }

  // Compute diffs between a checkpoint and current meet (attendance + bouts + mats).
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
      // Build attendance changes by comparing checkpoint snapshot vs current roster state.
      const checkpointAttendance = new Map(payload.attendance.map(a => [a.wrestlerId, a.status]));
      const attendanceChanges = wrestlers
        .filter(w => wMap[w.id])
        .map(w => {
          const from = normalizeAttendance(checkpointAttendance.get(w.id));
          const to = normalizeAttendance(w.status);
          return { wrestlerId: w.id, first: w.first, last: w.last, from, to };
        })
        .filter(entry => entry.from !== entry.to)
        .sort((a, b) => (a.last === b.last ? a.first.localeCompare(b.first) : a.last.localeCompare(b.last)));

      // Index current bouts by unordered key so red/green swaps don't matter.
      const currentBoutKeys = new Map<string, { redId: string; greenId: string; redTeam?: string; greenTeam?: string }>();
      for (const b of bouts) {
        currentBoutKeys.set(boutKey(b.redId, b.greenId), {
          redId: b.redId,
          greenId: b.greenId,
          redTeam: teamSymbolById(wMap[b.redId]?.teamId),
          greenTeam: teamSymbolById(wMap[b.greenId]?.teamId),
        });
      }
      // Index checkpoint bouts the same way for diffing.
      const checkpointBoutKeys = new Map<string, { redId: string; greenId: string; redTeam?: string; greenTeam?: string }>();
      for (const b of payload.bouts) {
        checkpointBoutKeys.set(boutKey(b.redId, b.greenId), {
          redId: b.redId,
          greenId: b.greenId,
          redTeam: teamSymbolById(wMap[b.redId]?.teamId),
          greenTeam: teamSymbolById(wMap[b.greenId]?.teamId),
        });
      }
      // Compute added/removed bouts between checkpoint and current state.
      const boutsAdded = [...currentBoutKeys.entries()]
        .filter(([key]) => !checkpointBoutKeys.has(key))
        .map(([, value]) => value);
      const boutsRemoved = [...checkpointBoutKeys.entries()]
        .filter(([key]) => !currentBoutKeys.has(key))
        .map(([, value]) => value);

      // Count any mat/order changes for bouts that exist in both snapshots.
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

  // Base team color (unadjusted) with a safe fallback.
  function teamColor(id: string) {
    return teams.find(t => t.id === id)?.color ?? "#000000";
  }
  // Darken a hex color to improve contrast on light backgrounds.
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
  // Adjust team color for readable text while preserving identity.
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
  // Choose white/black based on background luminance.
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
  const STATUS_LABELS: Record<AttendanceDiffStatus, string> = {
    COMING: "Coming",
    NOT_COMING: "Not Coming",
    LATE: "Arrive Late",
    EARLY: "Leave Early",
    ABSENT: "Scratched",
    NO_REPLY: "No Reply",
  };
  // Normalize attendance status labels for UI chips.
  function statusLabel(status: AttendanceStatus | null | undefined) {
    if (!status) return "No Reply";
    return STATUS_LABELS[status];
  }
  // Format the remaining lock timeout as M:SS.
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
    ABSENT: "#f4ecec",
  };

  // Color encode attendance status in roster lists.
  function statusColor(status: AttendanceStatus | null | undefined) {
    if (!status) return "#f0f0f0";
    return STATUS_COLORS[status];
  }

  function isAttending(status: AttendanceStatus | null | undefined) {
    return status === "COMING" || status === "LATE" || status === "EARLY";
  }

  // Treat any non-explicit attendance as excluded from pairings.
  function isNotAttending(status: AttendanceStatus | null | undefined) {
    return !isAttending(status);
  }
  // Convert birthdate string to decimal age in years.
  function ageYears(birthdate?: string) {
    if (!birthdate) return null;
    const bDate = new Date(birthdate);
    if (Number.isNaN(bDate.getTime())) return null;
    const now = new Date();
    const days = Math.floor((now.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
    return days / daysPerYear;
  }
  // Provide a consistent accent color for girl/boy labels.
  function sexColor(isGirl?: boolean) {
    if (isGirl === true) return "#d81b60";
    if (isGirl === false) return "#1565c0";
    return undefined;
  }
  // Format a mat+order into a human-friendly bout number.
  function boutNumber(mat?: number | null, order?: number | null) {
    if (!mat || !order) return "";
    const displayOrder = Math.max(0, order - 1);
    const suffix = String(displayOrder).padStart(2, "0");
    return `${mat}${suffix}`;
  }
  // Compare values with null-safe ordering and direction control.
  function sortValueCompare(a: string | number | null | undefined, b: string | number | null | undefined, dir: "asc" | "desc") {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return dir === "asc" ? a - b : b - a;
    const aStr = String(a);
    const bStr = String(b);
    return dir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  }
  // Toggle sort direction or switch to a new key.
  function toggleSort(
    setter: React.Dispatch<React.SetStateAction<{ key: string; dir: "asc" | "desc" }>>,
    key: string,
  ) {
    setter((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  // Visual indicator for active sort direction.
  function sortIndicator(sort: { key: string; dir: "asc" | "desc" }, key: string) {
    if (sort.key !== key) return null;
    return <span style={{ fontSize: 10, marginLeft: 4 }}>{sort.dir === "asc" ? "▲" : "▼"}</span>;
  }

  const loadLockAccess = useCallback(async () => {
    const res = await fetch(`/api/meets/${meetId}/lock/access`, { cache: "no-store" });
    if (res.status === 401) {
      setLockAccessLoaded(true);
      return;
    }
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setLockAccessError(typeof payload?.error === "string" ? payload.error : "Unable to load edit access settings.");
      setLockAccessLoaded(true);
      return;
    }
    const payload = await res.json().catch(() => ({}));
    const coaches: unknown[] = Array.isArray(payload?.coaches) ? payload.coaches : [];
    const mapped: LockAccessCoach[] = coaches
      .filter((row): row is {
        id: string;
        username: string;
        name?: unknown;
        teamId?: unknown;
        teamName?: unknown;
        teamSymbol?: unknown;
        teamColor?: unknown;
        isHeadCoach?: unknown;
        canAcquireLock?: unknown;
      } => {
        if (typeof row !== "object" || row === null) return false;
        const candidate = row as Record<string, unknown>;
        return typeof candidate.id === "string" && typeof candidate.username === "string";
      })
      .map((row) => ({
        id: row.id,
        username: row.username,
        name: typeof row.name === "string" ? row.name : null,
        teamId: typeof row.teamId === "string" ? row.teamId : null,
        teamName: typeof row.teamName === "string" ? row.teamName : null,
        teamSymbol: typeof row.teamSymbol === "string" ? row.teamSymbol : null,
        teamColor: typeof row.teamColor === "string" ? row.teamColor : null,
        isHeadCoach: Boolean(row.isHeadCoach),
        canAcquireLock: Boolean(row.canAcquireLock),
      }));
    const granted = new Set(mapped.filter((coach) => coach.canAcquireLock).map((coach) => coach.id));
    setCanManageLockAccess(Boolean(payload?.canManageLockAccess));
    setCanAcquireMeetLock(Boolean(payload?.canAcquireLock));
    setCoordinatorName(payload?.coordinator?.name ?? null);
    setCoordinatorUsername(payload?.coordinator?.username ?? null);
    setCoordinatorAssigned(Boolean(payload?.coordinatorAssigned));
    setLockAccessCoaches(mapped);
    setLockAccessDraftIds(granted);
    setLockAccessError(null);
    setLockAccessLoaded(true);
  }, [meetId]);

  // Load primary meet data (bouts, wrestlers, meet metadata, current user).
  const load = useCallback(async () => {
    const [bRes, wRes, mRes, meRes, rRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/pairings`, { cache: "no-store" }),
      fetch(`/api/meets/${meetId}/wrestlers`, { cache: "no-store" }),
      fetch(`/api/meets/${meetId}`, { cache: "no-store" }),
      fetch("/api/me", { cache: "no-store" }),
      fetch(`/api/meets/${meetId}/rejected-pairs`, { cache: "no-store" }),
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
        setAttendanceDeadline(meetJson.attendanceDeadline ?? null);
        setSettings(s => ({
          ...s,
          allowSameTeamMatches: Boolean(meetJson.allowSameTeamMatches),
          girlsWrestleGirls: Boolean(meetJson.girlsWrestleGirls),
        }));
        setMeetStatus(normalizeMeetPhase(meetJson.status));
        setLastUpdatedAt(meetJson.lastChangeAt ?? null);
        setLastUpdatedBy(meetJson.lastChangeBy ?? null);
        setHomeTeamId(meetJson.homeTeamId ?? null);
        setMeetLocation(meetJson.location ?? null);
        setMatchesPerWrestler(
          typeof meetJson.matchesPerWrestler === "number" ? meetJson.matchesPerWrestler : null,
        );
        const nextTargetMatches = typeof meetJson.matchesPerWrestler === "number"
          ? meetJson.matchesPerWrestler
          : null;
        setSavedMatchesPerWrestler(nextTargetMatches);
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
      setCurrentUserRole(typeof meJson?.role === "string" ? meJson.role : null);
      setCurrentUserTeamId(typeof meJson?.teamId === "string" ? meJson.teamId : null);
    } else {
      setCurrentUsername(null);
      setCurrentUserRole(null);
      setCurrentUserTeamId(null);
    }
    if (rRes.ok) {
      const rejectedJson = await rRes.json().catch(() => ({}));
      const rows = Array.isArray(rejectedJson?.pairs) ? rejectedJson.pairs : [];
      const next = new Map<string, {
        a: { name: string; teamId: string | null };
        b: { name: string; teamId: string | null };
        by: string;
        at: string;
        byTeamId: string | null;
        byTeamColor: string | null;
      }>();
      for (const row of rows) {
        if (!row || typeof row.pairKey !== "string") continue;
        const a = row.wrestlerA ? `${row.wrestlerA.first} ${row.wrestlerA.last}`.trim() : "Wrestler";
        const b = row.wrestlerB ? `${row.wrestlerB.first} ${row.wrestlerB.last}`.trim() : "Wrestler";
        const by = row.createdBy?.username ?? "unknown user";
        const at = row.createdAt ? new Date(row.createdAt).toLocaleString() : "unknown time";
        next.set(row.pairKey, {
          a: { name: a, teamId: row.wrestlerA?.teamId ?? null },
          b: { name: b, teamId: row.wrestlerB?.teamId ?? null },
          by,
          at,
          byTeamId: row.createdBy?.teamId ?? null,
          byTeamColor: row.createdBy?.team?.color ?? null,
        });
      }
      setRejectedPairs(next);
    } else {
      setRejectedPairs(new Map());
    }
  }, [meetId, router]);

  // Fetch change log + comments for the activity panel.
  const loadActivity = useCallback(async () => {
    const [changesRes, commentsRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/changes`),
      fetch(`/api/meets/${meetId}/comments`),
    ]);
    if (changesRes.ok) {
      const changesJson = await changesRes.json().catch(() => []);
      const changeList = Array.isArray(changesJson) ? changesJson : [];
      setChanges(changeList);
      const latest = changeList[0];
      setLastUpdatedAt(latest?.createdAt ?? null);
      setLastUpdatedBy(latest?.actor?.username ?? null);
    }
    if (commentsRes.ok) {
      const commentsJson = await commentsRes.json().catch(() => []);
      const commentList = Array.isArray(commentsJson) ? commentsJson : [];
      setComments(commentList);
      if (!commentsVisibilityInitializedRef.current) {
        setShowComments(commentList.length > 0);
        commentsVisibilityInitializedRef.current = true;
      }
    }
  }, [meetId]);

  // Fetch saved checkpoints for the meet.
  const loadCheckpoints = useCallback(async () => {
    const res = await fetch(`/api/meets/${meetId}/checkpoints`);
    if (!res.ok) return;
    const payload = await res.json().catch(() => []);
    setCheckpoints(Array.isArray(payload) ? payload : []);
    setCheckpointsLoaded(true);
  }, [meetId]);

  const saveLockAccess = useCallback(async (nextIds: Set<string>) => {
    if (!canManageLockAccess) return false;
    setLockAccessSaving(true);
    setLockAccessError(null);
    try {
      const res = await fetch(`/api/meets/${meetId}/lock/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedCoachIds: [...nextIds] }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? `Unable to save edit access (${res.status}).`);
      }
      await Promise.all([
        loadLockAccess(),
        refreshLockStatus(),
      ]);
      triggerNoticeFlash();
      return true;
    } catch (err) {
      setLockAccessError(err instanceof Error ? err.message : "Unable to save edit access.");
      return false;
    } finally {
      setLockAccessSaving(false);
    }
  }, [canManageLockAccess, loadLockAccess, meetId, refreshLockStatus, triggerNoticeFlash]);

  // Save a checkpoint with a validated, trimmed name.
  const saveCheckpointByName = useCallback(async (rawName: string) => {
    const name = rawName.trim().slice(0, 80);
    if (!name) return false;
    setCheckpointError(null);
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
      return true;
    } catch (err) {
      setCheckpointError(err instanceof Error ? err.message : "Unable to save checkpoint.");
      return false;
    }
  }, [loadActivity, loadCheckpoints, meetId]);

  const isPublished = meetStatus === "PUBLISHED";
  const canViewPublishedSheets = meetStatus === "PUBLISHED";
  const canViewCheckinSheet = meetStatus === "READY_FOR_CHECKIN";
  const isEditablePhase = isEditableMeetPhase(meetStatus);
  const lockAccessDenied = lockAccessLoaded && !canManageLockAccess && !canAcquireMeetLock;
  const canEdit = editAllowed && wantsEdit && lockState.status === "acquired" && isEditablePhase;
  const isMeetCoordinator = Boolean(currentUsername) && Boolean(coordinatorUsername) && currentUsername === coordinatorUsername;
  const canApplyCheckpoint = canEdit && isMeetCoordinator;
  const canShowCheckpointApply = canApplyCheckpoint && !isPublished;
  const canViewScratches = meetStatus === "READY_FOR_CHECKIN" && (isMeetCoordinator || currentUserRole === "ADMIN");
  const canManageScratches = canViewScratches && canEdit;
  const defaultTabForPhase = meetStatus === "ATTENDANCE" ? "attendance" : "pairings";
  const canChangeStatus =
    (isMeetCoordinator || currentUserRole === "ADMIN") &&
    editAllowed &&
    (isPublished || lockState.status === "acquired");
  const canReopenAttendance = meetStatus === "DRAFT" && canChangeStatus && bouts.length === 0;
  const canViewVolunteers = Boolean(
    homeTeamId &&
    currentUserTeamId &&
    currentUserTeamId === homeTeamId &&
    ["ADMIN", "COACH"].includes(currentUserRole ?? ""),
  );
  const canShowVolunteers = canViewVolunteers && meetStatus !== "ATTENDANCE" && meetStatus !== "READY_FOR_CHECKIN";
  const grantedCoachIds = useMemo(
    () => new Set(lockAccessCoaches.filter((coach) => coach.canAcquireLock).map((coach) => coach.id)),
    [lockAccessCoaches],
  );
  const lockAccessDirty = useMemo(() => {
    if (grantedCoachIds.size !== lockAccessDraftIds.size) return true;
    for (const id of grantedCoachIds) {
      if (!lockAccessDraftIds.has(id)) return true;
    }
    return false;
  }, [grantedCoachIds, lockAccessDraftIds]);
  const coordinatorDisplay = useMemo(() => {
    if (!coordinatorUsername) return null;
    const trimmedName = coordinatorName?.trim();
    let displayName = coordinatorUsername;
    if (trimmedName) {
      displayName = trimmedName;
    }
    return `${displayName} (@${coordinatorUsername})`;
  }, [coordinatorName, coordinatorUsername]);
  const lockAccessByTeam = useMemo<LockAccessTeamGroup[]>(() => {
    const grouped = new Map<string, LockAccessTeamGroup>();
    for (const coach of lockAccessCoaches) {
      const teamName = coach.teamName?.trim() ?? "";
      const teamSymbol = coach.teamSymbol?.trim() ?? "";
      const teamTitle = teamName && teamSymbol
        ? `${teamName} (${teamSymbol})`
        : (teamName ? teamName : teamSymbol ? teamSymbol : "Team");
      const key = coach.teamId ?? `unknown:${teamTitle}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          title: teamTitle,
          color: coach.teamColor ?? null,
          coaches: [coach],
        });
        continue;
      }
      if (!existing.color && coach.teamColor) {
        existing.color = coach.teamColor;
      }
      existing.coaches.push(coach);
    }
    const rows = Array.from(grouped.values());
    for (const row of rows) {
      row.coaches.sort((a, b) => {
        const aHead = Boolean(a.isHeadCoach);
        const bHead = Boolean(b.isHeadCoach);
        if (aHead !== bHead) return aHead ? -1 : 1;
        const aTrimmedName = a.name?.trim();
        const bTrimmedName = b.name?.trim();
        let aName = a.username;
        if (aTrimmedName) {
          aName = aTrimmedName;
        }
        let bName = b.username;
        if (bTrimmedName) {
          bName = bTrimmedName;
        }
        return aName.localeCompare(bName);
      });
    }
    rows.sort((a, b) => {
      const aHome = Boolean(homeTeamId) && a.key === homeTeamId;
      const bHome = Boolean(homeTeamId) && b.key === homeTeamId;
      if (aHome !== bHome) return aHome ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
    return rows;
  }, [homeTeamId, lockAccessCoaches]);
  const allEligibleSelected = useMemo(
    () => lockAccessCoaches.length > 0 && lockAccessCoaches.every((coach) => lockAccessDraftIds.has(coach.id)),
    [lockAccessCoaches, lockAccessDraftIds],
  );
  const handleEditAccessDone = useCallback(() => {
    if (lockAccessSaving) return;
    void (async () => {
      if (coordinatorAssigned && lockAccessDirty) {
        const saved = await saveLockAccess(lockAccessDraftIds);
        if (!saved) return;
      }
      setShowEditAccessModal(false);
    })();
  }, [coordinatorAssigned, lockAccessDirty, lockAccessDraftIds, lockAccessSaving, saveLockAccess]);

  useEffect(() => { void load(); void loadActivity(); void loadCheckpoints(); }, [load, loadActivity, loadCheckpoints]);
  useEffect(() => { void loadLockAccess(); }, [loadLockAccess]);
  useEffect(() => {
    if (canManageLockAccess && lockAccessLoaded) return;
    setShowEditAccessModal(false);
  }, [canManageLockAccess, lockAccessLoaded]);
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
    if (activeTab !== "volunteers") return;
    if (canShowVolunteers) return;
    setActiveTab(defaultTabForPhase);
  }, [activeTab, canShowVolunteers, defaultTabForPhase]);
  useEffect(() => {
    if (activeTab !== "pairings") return;
    if (meetStatus !== "ATTENDANCE") return;
    setActiveTab("attendance");
  }, [activeTab, meetStatus]);
  useEffect(() => {
    if (activeTab !== "matboard") return;
    if (meetStatus !== "ATTENDANCE") return;
    setActiveTab(defaultTabForPhase);
  }, [activeTab, meetStatus, defaultTabForPhase]);
  useEffect(() => {
    if (!["wallMat", "wallTeam", "scoring"].includes(activeTab)) return;
    if (canViewPublishedSheets) return;
    setActiveTab(defaultTabForPhase);
  }, [activeTab, canViewPublishedSheets, defaultTabForPhase]);
  useEffect(() => {
    if (activeTab !== "scratch") return;
    if (canViewCheckinSheet) return;
    setActiveTab(defaultTabForPhase);
  }, [activeTab, canViewCheckinSheet, defaultTabForPhase]);
  useEffect(() => {
    if (activeTab !== "scratches") return;
    if (canViewScratches) return;
    setActiveTab(defaultTabForPhase);
  }, [activeTab, canViewScratches, defaultTabForPhase]);
  useEffect(() => {
    if (meetStatus !== "READY_FOR_CHECKIN") {
      checkinDefaultTabAppliedRef.current = false;
      return;
    }
    if (!meetLoaded || !canViewScratches) return;
    if (!checkinDefaultTabAppliedRef.current) {
      setActiveTab("scratches");
      checkinDefaultTabAppliedRef.current = true;
    }
  }, [meetLoaded, meetStatus, canViewScratches]);

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
    // Adjust column widths based on drag position for the active table.
    const handleResizeMove = (clientX: number) => {
      if (!resizeRef.current) return;
      const { kind, index, startX, startWidth } = resizeRef.current;
      const delta = clientX - startX;

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
        } else if (index === 10) {
          const nextWidth = Math.max(55, startWidth + delta);
          setCurrentBoutColWidth(nextWidth);
        } else if (index === 11) {
          const nextWidth = Math.max(60, startWidth + delta);
          setCurrentSourceColWidth(nextWidth);
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
    };

    function onMouseMove(e: MouseEvent) {
      handleResizeMove(e.clientX);
    }

    function onTouchMove(e: TouchEvent) {
      if (!resizeRef.current) return;
      if (e.touches.length === 0) return;
      e.preventDefault();
      handleResizeMove(e.touches[0].clientX);
    }

    function onResizeEnd() {
      resizeRef.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onResizeEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onResizeEnd);
    window.addEventListener("touchcancel", onResizeEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onResizeEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onResizeEnd);
      window.removeEventListener("touchcancel", onResizeEnd);
    };
  }, []);
  useEffect(() => {
    if (!editAllowed || !meetLoaded) return;
    if (!isEditableMeetPhase(meetStatus)) {
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

  // Stable roster sort for attendance modal (last/first/team).
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
  // Cache team labels for quick lookup in tables.
  const teamLabelById = useMemo(() => {
    return new Map(teams.map(team => [team.id, formatTeamName(team)]));
  }, [teams]);
  // Sort roster for pairings and attendance displays.
  const rosterSorted = useMemo(() => {
    return [...wrestlers].sort((a, b) => {
      const teamA = teamLabelById.get(a.teamId) ?? a.teamId;
      const teamB = teamLabelById.get(b.teamId) ?? b.teamId;
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      const last = a.last.localeCompare(b.last);
      if (last !== 0) return last;
      return a.first.localeCompare(b.first);
    });
  }, [teamLabelById, wrestlers]);
  const pairingsHeaderTeam = pairingsTeamId
    ? teams.find(t => t.id === pairingsTeamId)
    : activeTeamId ? teams.find(t => t.id === activeTeamId) : undefined;
  const pairingsHeaderColor = pairingsHeaderTeam?.color
    ? teamTextColor(pairingsHeaderTeam.id)
    : "#2a3b4d";
  const attendingByTeam = pairingsTeamId
    ? rosterSorted.filter(w => w.teamId === pairingsTeamId && !isNotAttending(w.status))
    : rosterSorted.filter(w => !isNotAttending(w.status));
  useEffect(() => {
    if (matchesPerWrestler === null) return;
    setPruneTargetMatches((prev) => {
      if (prev !== null && prev < matchesPerWrestler) return matchesPerWrestler;
      return prev;
    });
  }, [matchesPerWrestler]);
  useEffect(() => {
    if (!showAutoPairingsConfirm) return;
    setAutoMatchesPerWrestler(matchesPerWrestler);
    setAutoMaxMatchesPerWrestler(maxMatchesPerWrestler);
  }, [showAutoPairingsConfirm, matchesPerWrestler, maxMatchesPerWrestler]);
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsNarrowScreen(window.innerWidth <= 980);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const allowPairingsOverflow =
    orderedPairingsTeams.length >= 3 ||
    isNarrowScreen ||
    (pairingsTableWidth !== null && pairingsTableWidth < 700);
  // Shrink columns proportionally when the table overflows the viewport.
  const pairingsEffectiveColWidths = useMemo(() => {
    if (allowPairingsOverflow) return pairingsColWidths;
    if (pairingsTableWidth === null) return pairingsColWidths;
    const widths = [...pairingsColWidths];
    const minWidths = [70, 60, 40, 50, 50, 35, 35, 50];
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    if (totalWidth <= pairingsTableWidth) return widths;
    let overflow = totalWidth - pairingsTableWidth;
    const shrinkOrder = [7, 6, 5, 4, 3, 2, 1, 0];
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
  // Clamp name columns on narrow screens for readability.
  const pairingsColWidthsForView = useMemo(() => {
    if (!isNarrowScreen) return pairingsEffectiveColWidths;
    const next = [...pairingsEffectiveColWidths];
    next[0] = Math.min(next[0], 70);
    next[1] = Math.min(next[1], 70);
    return next;
  }, [isNarrowScreen, pairingsEffectiveColWidths]);
  // Clamp name columns in the current-matches table on narrow screens.
  const currentColumnWidthsForView = useMemo(() => {
    if (!isNarrowScreen) return currentColumnWidths;
    const next = [...currentColumnWidths];
    next[0] = Math.min(next[0], 70);
    next[1] = Math.min(next[1], 70);
    return next;
  }, [isNarrowScreen, currentColumnWidths]);
  // Clamp name columns in the additional-matches table on narrow screens.
  const availableColumnWidthsForView = useMemo(() => {
    if (!isNarrowScreen) return availableColumnWidths;
    const next = [...availableColumnWidths];
    next[0] = Math.min(next[0], 70);
    next[1] = Math.min(next[1], 70);
    return next;
  }, [isNarrowScreen, availableColumnWidths]);
  // Index bouts by wrestler for fast tooltip lookups.
  const boutsByWrestlerId = useMemo(() => {
    const map = new Map<string, { bout: Bout; opponentId: string }[]>();
    // Index both sides of each bout for quick opponent lookup.
    for (const bout of bouts) {
      if (bout.redId && bout.greenId) {
        const redList = map.get(bout.redId) ?? [];
        redList.push({ bout, opponentId: bout.greenId });
        map.set(bout.redId, redList);

        const greenList = map.get(bout.greenId) ?? [];
        greenList.push({ bout, opponentId: bout.redId });
        map.set(bout.greenId, greenList);
      }
    }
    return map;
  }, [bouts]);
  // Precompute match counts per wrestler for tables and tooltips.
  const matchCounts = bouts.reduce((acc, bout) => {
    acc.set(bout.redId, (acc.get(bout.redId) ?? 0) + 1);
    acc.set(bout.greenId, (acc.get(bout.greenId) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());
  const getMatchCount = (id: string) => matchCounts.get(id) ?? 0;
  // Show/update the floating tooltip near the cursor.
  const showMatchesTooltip = useCallback((event: React.MouseEvent, wrestlerId: string) => {
    setMatchesTooltip({ mode: "matches", wrestlerId, x: event.clientX, y: event.clientY });
  }, []);
  const showRejectedTooltip = useCallback((
    event: React.MouseEvent,
    details: { left: { name: string; teamId: string | null }; right: { name: string; teamId: string | null }; by: string; at: string },
  ) => {
    setMatchesTooltip({ mode: "rejected", ...details, x: event.clientX, y: event.clientY });
  }, []);
  const showManualTooltip = useCallback((
    event: React.MouseEvent,
    details: { left: { name: string; teamId: string | null }; right: { name: string; teamId: string | null }; by: string; at: string },
  ) => {
    setMatchesTooltip({ mode: "manual", ...details, x: event.clientX, y: event.clientY });
  }, []);
  const showAutoTooltip = useCallback((event: React.MouseEvent, at: string) => {
    setMatchesTooltip({ mode: "auto", at, x: event.clientX, y: event.clientY });
  }, []);
  // Hide the floating tooltip.
  const hideMatchesTooltip = useCallback(() => setMatchesTooltip(null), []);
  // On touch devices, hide tooltips on any tap.
  useEffect(() => {
    if (!matchesTooltip) return;
    const handleTap = () => {
      hideMatchesTooltip();
    };
    document.addEventListener("pointerdown", handleTap);
    document.addEventListener("touchstart", handleTap);
    return () => {
      document.removeEventListener("pointerdown", handleTap);
      document.removeEventListener("touchstart", handleTap);
    };
  }, [matchesTooltip, hideMatchesTooltip]);
  // Suppress tooltip when hovering name cells; show elsewhere in the row.
  const handleMatchesHover = useCallback((event: React.MouseEvent, wrestlerId: string) => {
    const node = event.target as HTMLElement | null;
    if (node?.closest('[data-tooltip-skip="true"]')) {
      hideMatchesTooltip();
      return;
    }
    showMatchesTooltip(event, wrestlerId);
  }, [hideMatchesTooltip, showMatchesTooltip]);

  // Sort pairings roster according to the active column.
  const pairingsSorted = [...attendingByTeam].sort((a, b) => {
    const getValue = (w: Wrestler) => {
      if (pairingsSort.key === "last") return w.last;
      if (pairingsSort.key === "first") return w.first;
      if (pairingsSort.key === "girl") return w.isGirl ? 0 : 1;
      if (pairingsSort.key === "age") return ageYears(w.birthdate) ?? null;
      if (pairingsSort.key === "weight") return w.weight;
      if (pairingsSort.key === "exp") return w.experienceYears;
      if (pairingsSort.key === "skill") return w.skill;
      if (pairingsSort.key === "matches") return getMatchCount(w.id);
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), pairingsSort.dir);
  });

  // Keep the selected row visible during keyboard navigation.
  const scrollPairingsRowIntoView = useCallback((wrestlerId: string) => {
    const wrapper = pairingsTableWrapperRef.current;
    if (!wrapper) return;
    const row = wrapper.querySelector<HTMLTableRowElement>(`tr[data-pairing-id="${wrestlerId}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, []);

  // Jump to the wrestler's team tab and select them.
  const showMatchesForWrestler = useCallback((wrestler: Wrestler) => {
    setActiveTab("pairings");
    setPairingsTeamId(wrestler.teamId);
    setSelectedPairingId(wrestler.id);
    pairingsTableWrapperRef.current?.focus();
    // Wait for the roster table to re-render after team switch/selection.
    setTimeout(() => scrollPairingsRowIntoView(wrestler.id), 0);
  }, [scrollPairingsRowIntoView]);

  // Keyboard navigation for the roster table.
  const handlePairingsKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (pairingsSorted.length === 0) return;
    event.preventDefault();

    const currentIndex = selectedPairingId
      ? pairingsSorted.findIndex(w => w.id === selectedPairingId)
      : -1;
    const nextIndex = event.key === "ArrowDown"
      ? Math.min(pairingsSorted.length - 1, currentIndex >= 0 ? currentIndex + 1 : 0)
      : Math.max(0, currentIndex > 0 ? currentIndex - 1 : 0);
    if (nextIndex === currentIndex) return;

    const nextId = pairingsSorted[nextIndex]?.id;
    if (!nextId) return;
    setSelectedPairingId(nextId);
    requestAnimationFrame(() => {
      scrollPairingsRowIntoView(nextId);
    });
  }, [pairingsSorted, scrollPairingsRowIntoView, selectedPairingId]);
  const selectedMatchCount = selectedPairingId ? getMatchCount(selectedPairingId) : 0;

  // Fetch candidate opponents based on current pairing constraints.
  async function loadCandidates(wrestlerId: string, overrides?: Partial<typeof settings>) {
    if (!wrestlerId) {
      setCandidates([]);
      return;
    }
    const effectiveSettings = { ...settings, ...overrides };
      const qs = new URLSearchParams({
        wrestlerId,
        limit: "20",
        enforceAgeGap: String(effectiveSettings.enforceAgeGapCheck),
        enforceWeightCheck: String(effectiveSettings.enforceWeightCheck),
        firstYearOnlyWithFirstYear: String(effectiveSettings.firstYearOnlyWithFirstYear),
        allowSameTeamMatches: String(effectiveSettings.allowSameTeamMatches),
        girlsWrestleGirls: String(effectiveSettings.girlsWrestleGirls),
      });
    const reqId = candidatesReqIdRef.current + 1;
    candidatesReqIdRef.current = reqId;
    const res = await fetch(`/api/meets/${meetId}/candidates?${qs.toString()}`);
    if (reqId !== candidatesReqIdRef.current) return;
    if (!res.ok) return;
    const json = await res.json();
    setCandidates(json.candidates ?? []);
  }

  // Refresh meet + activity after mat changes.
  async function refreshAfterMatAssignments() {
    try {
      const pairingsRes = await fetch(`/api/meets/${meetId}/pairings`, { cache: "no-store" });
      if (pairingsRes.ok) {
        const pairingsJson = await pairingsRes.json().catch(() => []);
        setBouts(Array.isArray(pairingsJson) ? pairingsJson : []);
      }
    } catch {
      // Keep current view if lightweight refresh fails.
    }
    await loadActivity();
    setMatRefreshIndex((idx) => idx + 1);
    setWallRefreshIndex((idx) => idx + 1);
  }

  const refreshAfterAttendanceChange = useCallback(async () => {
    await Promise.all([
      load(),
      loadActivity(),
    ]);
    setMatRefreshIndex(idx => idx + 1);
    setWallRefreshIndex(idx => idx + 1);
  }, [load, loadActivity]);

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

  useEffect(() => {
    if (!pairingContext) return;
    let frameId = 0;
    const updateMenuSize = () => {
      const menu = pairingMenuRef.current;
      if (!menu) return;
      const nextWidth = Math.ceil(menu.offsetWidth);
      const nextHeight = Math.ceil(menu.offsetHeight);
      setPairingMenuSize((current) => (
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      ));
    };
    frameId = window.requestAnimationFrame(updateMenuSize);
    window.addEventListener("resize", updateMenuSize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMenuSize);
    };
  }, [pairingContext, canEdit]);

  const candidateFetchConfig = useMemo(() => ({
    enforceAgeGapCheck: settings.enforceAgeGapCheck,
    enforceWeightCheck: settings.enforceWeightCheck,
    firstYearOnlyWithFirstYear: settings.firstYearOnlyWithFirstYear,
    allowSameTeamMatches: settings.allowSameTeamMatches,
    girlsWrestleGirls: settings.girlsWrestleGirls,
    version: candidateRefreshVersion,
  }), [
    settings.enforceAgeGapCheck,
    settings.enforceWeightCheck,
    settings.firstYearOnlyWithFirstYear,
    settings.allowSameTeamMatches,
    settings.girlsWrestleGirls,
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
  const homeTeam = homeTeamId ? teams.find(t => t.id === homeTeamId) ?? null : null;
  const topMeetCoordinatorDisplay =
    coordinatorDisplay ?? (lockAccessLoaded && !coordinatorAssigned ? "Not assigned" : null);
  const hasHomeInfo = Boolean(homeTeam ?? topMeetCoordinatorDisplay);

  // Current matches for the selected wrestler.
  const currentMatches = target
    ? bouts.filter(b => b.redId === target.id || b.greenId === target.id)
    : [];
  const targetMatchCount = target ? getMatchCount(target.id) : 0;
  // Normalize current matches into rows with opponent + derived scores.
  const currentMatchRows = currentMatches.map((b) => {
    const opponentId = b.redId === target?.id ? b.greenId : b.redId;
    const signedScore = target
      ? (b.redId === target.id ? b.pairingScore : -b.pairingScore)
      : b.pairingScore;
    return {
      bout: b,
      opponentId,
      opponent: opponentId ? wMap[opponentId] : undefined,
      boutOrder: (b.mat ?? 0) * 100 + (b.order ?? 0),
      signedScore,
    };
  });
  // Sort current matches by the chosen column.
  const currentSorted = [...currentMatchRows].sort((a, b) => {
    const getValue = (row: typeof currentMatchRows[number]) => {
      const o = row.opponent;
      if (currentSort.key === "score") return Math.abs(row.signedScore);
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
  // Filter candidates against match limits and pairing rules.
  const availableFiltered = candidates
    .filter(() => {
      if (!target) return true;
      if (maxMatchesPerWrestler === null) return true;
      return targetMatchCount < maxMatchesPerWrestler;
    })
    .filter((c) => settings.allowSameTeamMatches || c.opponent.teamId !== target?.teamId)
    .filter((c) => !settings.girlsWrestleGirls || c.opponent.isGirl === target?.isGirl)
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
  // Sort candidate list by the chosen column.
  const availableSorted = [...availableFiltered].sort((a, b) => {
    const getValue = (row: { opponent: Wrestler; score: number }) => {
      const w = row.opponent;
      if (availableSort.key === "score") return Math.abs(row.score);
      if (availableSort.key === "last") return w.last;
      if (availableSort.key === "first") return w.first;
      if (availableSort.key === "team") return teamSymbol(w.teamId);
      if (availableSort.key === "girl") return w.isGirl ? 0 : 1;
      if (availableSort.key === "age") return ageYears(w.birthdate) ?? null;
      if (availableSort.key === "weight") return w.weight;
      if (availableSort.key === "exp") return w.experienceYears;
      if (availableSort.key === "skill") return w.skill;
      if (availableSort.key === "matches") return getMatchCount(w.id);
      return "";
    };
    return sortValueCompare(getValue(a), getValue(b), availableSort.dir);
  });
  const availableDisplay = availableSorted.slice(0, 20);
  // Preserve stored red/green ordering for checkpoint diffs.
  const getCheckpointBoutOrder = useCallback((b: { redId: string; greenId: string; redTeam?: string; greenTeam?: string }) => {
    return { leftId: b.redId, rightId: b.greenId, leftTeam: b.redTeam, rightTeam: b.greenTeam };
  }, []);
  // Color for pairing score deltas (good/bad).
  const deltaColor = (value: number) => {
    if (value < 0) return "#b00020";
    if (value > 0) return "#1b5e20";
    return undefined;
  };
  // Delete meet setup + pairings and return to initial setup state.
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

  // Add a bout and refresh candidates/metadata.
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

  // Update attendance status and refresh dependent views.
  async function updateWrestlerStatus(wrestlerId: string, status: AttendanceStatus | null) {
    const res = await fetch(`/api/meets/${meetId}/wrestlers/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrestlerId, status }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error ?? `Unable to update attendance (${res.status}).`);
    }
    await refreshAfterAttendanceChange();
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

  // Apply attendance change from the right-click context menu.
  async function handlePairingContextStatus(status: AttendanceStatus | null) {
    if (!canEdit) {
      setPairingContext(null);
      return;
    }
    if (!pairingContext) return;
    const currentStatus = pairingContext.wrestler.status ?? null;
    const nextStatus =
      (status === "LATE" || status === "EARLY") && currentStatus === status
        ? null
        : status;
    try {
      await updateWrestlerStatus(pairingContext.wrestler.id, nextStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update attendance.";
      window.alert(message);
    }
    setPairingContext(null);
  }

  // Remove a bout and refresh candidates/metadata.
  async function removeBout(boutId: string) {
    if (!canEdit) return;
    const res = await fetch(`/api/bouts/${boutId}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = payload?.error ?? `Unable to remove match (${res.status}).`;
      window.alert(message);
      return;
    }
    setBouts(prev => prev.filter(b => b.id !== boutId));
    if (payload?.rejectedPair) {
      const row = payload.rejectedPair;
      if (typeof row.pairKey === "string") {
        const a = row.wrestlerA ? `${row.wrestlerA.first} ${row.wrestlerA.last}`.trim() : "Wrestler";
        const b = row.wrestlerB ? `${row.wrestlerB.first} ${row.wrestlerB.last}`.trim() : "Wrestler";
        const by = row.createdBy?.username ?? "unknown user";
        const at = row.createdAt ? new Date(row.createdAt).toLocaleString() : "unknown time";
        setRejectedPairs(prev => {
          const next = new Map(prev);
          next.set(row.pairKey, {
            a: { name: a, teamId: row.wrestlerA?.teamId ?? null },
            b: { name: b, teamId: row.wrestlerB?.teamId ?? null },
            by,
            at,
            byTeamId: row.createdBy?.teamId ?? null,
            byTeamColor: row.createdBy?.team?.color ?? null,
          });
          return next;
        });
      }
    }
    setCandidateRefreshVersion(prev => prev + 1);
    await loadActivity();
    if (target) await loadCandidates(target.id);
  }

  async function ensureMeetLock() {
    const ok = await acquireLock();
    if (!ok) {
      triggerNoticeFlash();
      return false;
    }
    return true;
  }

  // Change meet status while ensuring lock ownership.
  async function updateMeetStatus(nextStatus: MeetPhase) {
    if (!canChangeStatus) return false;
    if (!(await ensureMeetLock())) return false;
    const res = await fetch(`/api/meets/${meetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      if (nextStatus === "READY_FOR_CHECKIN" && payload?.checklist) {
        setReadyForCheckinChecklist(payload.checklist as ReadyForCheckinChecklist);
        setShowReadyForCheckinModal(true);
        setReadyForCheckinError(payload?.error ?? null);
        return false;
      }
      const message = payload?.error ?? `Unable to update status (${res.status}).`;
      window.alert(message);
      return false;
    }
    await load();
    await loadCheckpoints();
    await loadActivity();
    return true;
  }

  async function confirmReopenAsDraft() {
    const confirmed = window.confirm(
      "Are you sure you want to reopen this meet as Draft? This will discard all scratches and new matches added to accommodate them."
    );
    if (!confirmed) return false;
    return updateMeetStatus("DRAFT");
  }

  async function confirmReopenAttendance() {
    const confirmed = window.confirm(
      "Are you sure you want to reopen attendance? Any attendance changes made since the close will be lost."
    );
    if (!confirmed) return false;
    return updateMeetStatus("ATTENDANCE");
  }

  async function confirmCloseAttendance() {
    if (attendanceDeadline) {
      const deadline = new Date(attendanceDeadline);
      if (!Number.isNaN(deadline.getTime()) && deadline.getTime() > Date.now()) {
        setShowCloseAttendanceWarningModal(true);
        return false;
      }
    }
    return updateMeetStatus("DRAFT");
  }

  function openPublishWarning() {
    setShowPublishWarningModal(true);
  }

  async function openReadyForCheckinChecklist(targetStatus: "READY_FOR_CHECKIN" | "PUBLISHED" = "READY_FOR_CHECKIN") {
    setReadyForCheckinTargetStatus(targetStatus);
    setShowReadyForCheckinModal(true);
    setReadyForCheckinLoading(true);
    setReadyForCheckinError(null);
    setReadyForCheckinChecklist(null);
    try {
      const res = await fetch(`/api/meets/${meetId}/ready-for-checkin`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to load checklist (${res.status}).`);
      }
      const payload = await res.json().catch(() => null);
      setReadyForCheckinChecklist(payload as ReadyForCheckinChecklist);
    } catch (err) {
      setReadyForCheckinChecklist(null);
      setReadyForCheckinError(err instanceof Error ? err.message : "Unable to load checklist.");
    } finally {
      setReadyForCheckinLoading(false);
    }
  }

  async function confirmReadyForCheckin() {
    setReadyForCheckinSubmitting(true);
    try {
      const ok = await updateMeetStatus(readyForCheckinTargetStatus);
      if (ok) {
        setShowReadyForCheckinModal(false);
        setReadyForCheckinChecklist(null);
        setReadyForCheckinError(null);
      }
    } finally {
      setReadyForCheckinSubmitting(false);
    }
  }

  async function runReadyForCheckinAction(action: NonNullable<ReadyForCheckinChecklistItem["action"]>) {
    if (!(await ensureMeetLock())) return;
    setReadyForCheckinActionId(action);
    setReadyForCheckinError(null);
    try {
      const res = action === "sync-volunteer-mats"
        ? await fetch(`/api/meets/${meetId}/mats/people-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        : await fetch(`/api/meets/${meetId}/ready-for-checkin/fix-rest-conflicts`, {
            method: "POST",
          });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Unable to run checklist fix (${res.status}).`);
      }
      await load();
      await refreshAfterMatAssignments();
      await openReadyForCheckinChecklist(readyForCheckinTargetStatus);
    } catch (err) {
      setReadyForCheckinError(err instanceof Error ? err.message : "Unable to run checklist fix.");
    } finally {
      setReadyForCheckinActionId(null);
    }
  }

  // Persist meet name edits with debounce protection.
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

  // Submit a new comment and refresh activity feed.
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
          --meet-side-pad: 22px;
          --tab-side-gap: 4px;
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px var(--meet-side-pad) 40px;
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
        .nav-btn.primary {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .nav-btn.primary:hover {
          background: color-mix(in srgb, var(--accent) 85%, #000 15%);
          border-color: color-mix(in srgb, var(--accent) 85%, #000 15%);
          color: #fff;
        }
        .nav-btn.secondary {
          background: #fff;
          border-color: var(--line);
          color: var(--ink);
        }
        .nav-btn.secondary:hover {
          background: #f7f9fb;
          border-color: var(--line);
          color: var(--ink);
        }
        .nav-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
          color: var(--muted);
          border-color: var(--line);
          background: transparent;
        }
        .checkpoint-actions .checkpoint-changes-btn:disabled {
          background: #1f7a3a !important;
          border-color: #1f7a3a !important;
          color: #ffffff !important;
          opacity: 0.6;
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
          margin-left: calc(var(--tab-side-gap) - var(--meet-side-pad));
          margin-right: calc(var(--tab-side-gap) - var(--meet-side-pad));
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
          margin-left: calc(var(--tab-side-gap) - var(--meet-side-pad));
          margin-right: calc(var(--tab-side-gap) - var(--meet-side-pad));
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
          font-weight: 700;
          font-size: 15px;
          color: var(--ink);
        }
        .meet-home-info .home-coordinator {
          font-weight: 700;
          font-size: 15px;
          color: var(--ink);
        }
        .meet-home-info .home-coordinator-btn {
          padding: 4px 8px;
          font-size: 12px;
          letter-spacing: 0.2px;
          text-transform: none;
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
        .meet-status-label {
          font-size: 12px;
          color: #5b6472;
        }
        .meet-status-btn {
          min-width: 120px;
          text-align: center;
        }
        .checkpoint-btn {
          min-width: 120px;
          text-align: center;
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
        .change-log-scroll {
          overflow-x: hidden;
        }
        .comments-scroll {
          overflow-x: hidden;
        }
        .panel-scroll.fill {
          flex: 1;
          max-height: none;
          min-height: 0;
        }
        .change-log-row {
          margin: 2px 0;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .comments-row {
          margin: 2px 0;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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
          .match-row-hover:has(td[data-no-row-hover]:hover) {
            box-shadow: none;
            background: transparent;
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
          overflow-x: visible;
        }
        .current-matches-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
          .pairings-table-wrapper:focus {
            outline: none;
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
        @media (max-width: 980px) {
          .pairings-main-card {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .pairings-table-wrapper,
          .additional-matches-wrapper {
            max-width: 100%;
          }
          .pairings-side-card {
            overflow-x: auto;
          }
          .pairings-table-wrapper {
            width: max-content;
            min-width: 100%;
            max-width: none;
            display: inline-block;
            overflow-x: visible;
          }
          .pairings-table {
            width: max-content;
            min-width: 100%;
            max-width: none;
            table-layout: auto;
            overflow-x: visible;
          }
          .current-matches-scroll .pairings-table {
            min-width: 820px;
          }
          .attendance-table {
            width: max-content;
            min-width: 640px;
            max-width: none;
            table-layout: auto;
          }
          .pairings-table th.pairings-name-cell,
          .pairings-table td.pairings-name-cell {
            width: 55px;
            max-width: 55px;
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
          flex-wrap: nowrap;
          overflow: visible;
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
          flex: 0 0 auto;
        }
        .pairing-tab .tab-full {
          display: none;
        }
        .pairing-tab .tab-symbol {
          display: inline;
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
          z-index: 2000;
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
        .modal-card.ready-checkin-modal {
          width: min(760px, 94vw);
        }
        .modal-card.edit-access-modal {
          width: min(1080px, 96vw);
          max-height: 86vh;
          overflow-y: auto;
          gap: 12px;
        }
        .edit-access-intro {
          font-size: 15px;
          color: var(--ink);
        }
        .edit-access-warning {
          font-size: 13px;
          color: #7d5a00;
          background: #fff8e6;
          border: 1px solid #f0d9a6;
          border-radius: 8px;
          padding: 8px 10px;
        }
        .edit-access-error {
          color: #b00020;
          font-size: 13px;
        }
        .edit-access-empty {
          font-size: 14px;
          color: var(--muted);
        }
        .edit-access-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 12px;
          align-items: start;
        }
        .edit-access-team-card {
          border: 1px solid #d8d8d8;
          border-radius: 10px;
          padding: 10px;
          background: #fff;
          display: grid;
          gap: 8px;
          min-width: 0;
        }
        .edit-access-team-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .edit-access-team-title {
          font-weight: 700;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }
        .edit-access-team-actions {
          display: flex;
          gap: 6px;
          flex-wrap: nowrap;
          justify-content: flex-end;
          flex: 0 0 auto;
        }
        .edit-access-team-actions .nav-btn {
          padding: 5px 10px;
          font-size: 12px;
          letter-spacing: 0.2px;
          text-transform: none;
        }
        .edit-access-coach-list {
          display: grid;
          gap: 6px;
        }
        .edit-access-coach-list.scrollable {
          max-height: 148px;
          overflow-y: auto;
          padding-right: 4px;
          scrollbar-gutter: stable;
          align-content: start;
        }
        .edit-access-coach-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .edit-access-coach-meta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .edit-access-coach-name {
          overflow-wrap: anywhere;
        }
        .edit-access-head-chip {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.2px;
          border-width: 1px;
          border-style: solid;
          border-radius: 999px;
          padding: 1px 6px;
          line-height: 1.2;
          white-space: nowrap;
          text-transform: none;
        }
        .edit-access-footer {
          border-top: 1px solid var(--line);
          padding-top: 10px;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          align-items: center;
          flex-wrap: wrap;
        }
        @media (max-width: 720px) {
          .edit-access-grid {
            grid-template-columns: 1fr;
          }
          .edit-access-team-actions .nav-btn {
            padding: 5px 8px;
          }
          .edit-access-footer {
            flex-direction: column;
            align-items: stretch;
          }
          .edit-access-footer > .nav-btn {
            width: 100%;
          }
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
          background: var(--accent) !important;
          border-color: var(--accent) !important;
          color: #ffffff !important;
        }
        .checkpoint-apply-btn:hover:not(:disabled) {
          background: #1870c7 !important;
          border-color: #1870c7 !important;
          color: #ffffff !important;
        }
        .checkpoint-actions .checkpoint-apply-btn:disabled {
          background: var(--accent) !important;
          border-color: var(--accent) !important;
          color: #ffffff !important;
          opacity: 0.6;
        }
        .checkpoint-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 320px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .checkpoint-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .checkpoint-footer-actions {
          display: flex;
          gap: 8px;
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
          background: #1f7a3a !important;
          border-color: #1f7a3a !important;
          color: #ffffff !important;
        }
        .checkpoint-changes-btn:hover:not(:disabled) {
          background: #18612e !important;
          border-color: #18612e !important;
          color: #ffffff !important;
        }
        .checkpoint-changes-btn:disabled {
          background: #1f7a3a;
          border-color: #1f7a3a;
          color: #ffffff;
          opacity: 0.6;
        }
        .checkpoint-empty {
          font-size: 13px;
          color: var(--muted);
        }
        .ready-checkin-summary {
          font-size: 13px;
          color: #5b6472;
        }
        .ready-checkin-error {
          color: #b00020;
          font-size: 13px;
        }
        .ready-checkin-list {
          display: grid;
          gap: 10px;
          margin-top: 4px;
        }
        .ready-checkin-item {
          border: 1px solid #d8dee7;
          border-radius: 10px;
          padding: 12px 14px;
          background: #ffffff;
        }
        .ready-checkin-item.error {
          border-color: #e8c3c3;
          background: #fff7f7;
        }
        .ready-checkin-item.warning {
          border-color: #e9ddb2;
          background: #fffbee;
        }
        .ready-checkin-item.ok {
          border-color: #cfe5d1;
          background: #f4fbf5;
        }
        .ready-checkin-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-weight: 700;
          color: #223041;
        }
        .ready-checkin-item-state {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ready-checkin-item-detail {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.4;
          color: #4b5563;
        }
        .ready-checkin-item-actions {
          margin-top: 10px;
          display: flex;
          justify-content: flex-end;
        }
        .ready-checkin-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
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
        .auto-pairings-controls {
          display: grid;
          gap: 8px;
          margin-top: 8px;
        }
        .auto-pairings-controls .control-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }
        .auto-pairings-controls label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }
        .auto-pairings-controls input[type="number"] {
          width: 64px;
          padding: 4px 6px;
          border-radius: 6px;
          border: 1px solid var(--line);
          font-size: 13px;
        }
        .modal-card.attendance-modal .modal-actions {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--line);
          background: #ffffff;
        }
        @media (max-width: 720px) {
          .change-log-scroll {
            overflow-x: auto;
            padding-bottom: 6px;
          }
          .change-log-row {
            overflow: visible;
            text-overflow: clip;
            width: max-content;
          }
          .comments-scroll {
            overflow-x: auto;
            padding-bottom: 6px;
          }
          .comments-row {
            overflow: visible;
            text-overflow: clip;
            width: max-content;
          }
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
          <div className="meet-heading-name-row">
            {!isEditingName && !isPublished && (
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
            {!isEditingName && isPublished && (
              <div className="meet-name-btn" style={{ cursor: "default" }}>
                {meetName || "this meet"}
              </div>
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
                {homeTeam && (
                  <>
                    <span className="home-label">Home team:</span>
                    <span className="home-team-name">
                      {homeTeam.name}
                      {homeTeam.symbol ? ` (${homeTeam.symbol})` : ""}
                    </span>
                  </>
                )}
                <span className="home-label">Meet coordinator:</span>
                <span className="home-coordinator">{topMeetCoordinatorDisplay ?? "Not assigned"}</span>
                {canManageLockAccess && lockAccessLoaded && (
                  <button
                    type="button"
                    className="nav-btn secondary home-coordinator-btn"
                    onClick={() => {
                      setLockAccessError(null);
                      setShowEditAccessModal(true);
                    }}
                  >
                    Coordinator
                  </button>
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
            <span className="meet-status-label">
              Status: <b>{meetPhaseLabel(meetStatus)}</b>
            </span>
            {lastUpdatedAt && (
              <span className="meet-last-updated">
                Last edited {new Date(lastUpdatedAt).toLocaleString()} by {lastUpdatedBy ?? "unknown"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {meetStatus === "ATTENDANCE" && canChangeStatus && (
              <button
                type="button"
                className="nav-btn primary meet-status-btn"
                onClick={() => void confirmCloseAttendance()}
                title="Close parent attendance entry and move this meet into Draft."
              >
                Close Attendance
              </button>
            )}
            {meetStatus === "DRAFT" && canChangeStatus && (
              <>
                <button
                  type="button"
                  className="nav-btn primary meet-status-btn"
                  onClick={() => void openReadyForCheckinChecklist()}
                  title="Run the ready-for-check-in checklist, then save an automatic checkpoint."
                >
                  Ready for Meet day
                </button>
                {canReopenAttendance && (
                  <button
                    type="button"
                    className="nav-btn secondary meet-status-btn"
                    onClick={() => void confirmReopenAttendance()}
                    title="Reopen parent attendance entry so coaches can continue collecting responses."
                  >
                    Reopen Attendance
                  </button>
                )}
              </>
            )}
            {meetStatus === "READY_FOR_CHECKIN" && canChangeStatus && (
              <>
                <button
                  type="button"
                  className="nav-btn primary meet-status-btn"
                  onClick={openPublishWarning}
                  title="Publish this meet to lock pairings and show schedules to families."
                >
                  Publish
                </button>
                <button
                  type="button"
                  className="nav-btn secondary meet-status-btn"
                  onClick={() => void confirmReopenAsDraft()}
                  title="Reopen this meet as Draft so coaches can continue working on pairings."
                >
                  Reopen as Draft
                </button>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {isEditablePhase && lockState.status !== "acquired" && !lockAccessDenied && (
              <button
                type="button"
                className="nav-btn secondary"
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
            {isEditablePhase && wantsEdit && lockState.status === "acquired" && (
              <button
                type="button"
                className="nav-btn secondary"
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
            <button
              type="button"
              className="nav-btn primary checkpoint-btn"
              onClick={() => {
                setCheckpointError(null);
                setShowCheckpointModal(true);
                if (!checkpointsLoaded) {
                  void loadCheckpoints();
                }
              }}
            >
              Checkpoints
            </button>
          </div>
        </div>
      </div>
      {isEditablePhase && lockState.status !== "acquired" && !lockAccessDenied && (
        <div className={`notice${flashNotice ? " flash" : ""}`} style={{ marginTop: 10 }}>
          {"Read-only mode. Click Start Editing to make changes."}
          {lockState.lockedByUsername ? (
            lockState.lockedByUsername === currentUsername
              ? " Currently locked by you (another tab or device may be refreshing the lock)."
              : ` Currently locked by ${lockState.lockedByUsername}.`
          ) : ""}
        </div>
      )}
      {isEditablePhase && lockAccessDenied && !lockActionError && (
        <div className="notice" style={{ marginTop: 10 }}>
          You do not have edit access yet. Meet Coordinator {coordinatorDisplay ? `${coordinatorDisplay} ` : ""}has not granted you edit access.
        </div>
      )}
      {lockActionError && (
        <div className="notice" style={{ marginTop: 10 }}>
          {lockActionError}
        </div>
      )}
      {lockAccessError && !showEditAccessModal && (
        <div className="notice" style={{ marginTop: 10 }}>
          {lockAccessError}
        </div>
      )}
      <div className="tab-bar">
          {[
            ...((meetStatus === "ATTENDANCE" || meetStatus === "DRAFT")
              ? [{ key: "attendance", label: "Attendance" } as const]
              : []),
            ...(meetStatus !== "ATTENDANCE" ? [{ key: "pairings", label: "Pairings" } as const] : []),
            ...(meetStatus !== "ATTENDANCE" ? [{ key: "matboard", label: "Mat Assignments" } as const] : []),
            ...(canShowVolunteers ? [{ key: "volunteers", label: "Volunteers" } as const] : []),
            ...(canViewScratches ? [{ key: "scratches", label: "Scratches" } as const] : []),
            ...(canViewPublishedSheets ? [
              { key: "wallMat", label: "Mat Sheets" },
              { key: "wallTeam", label: "Team Sheets" },
              { key: "scoring", label: "Scoring Sheets" },
            ] : []),
            ...(canViewCheckinSheet ? [{ key: "scratch", label: "Check-in Sheets" }] : []),
          ].map(tab => (
          <button
            key={tab.key}
            className={`tab-button${activeTab === tab.key ? " active" : ""}`}
            onClick={() => {
              setActiveTab(tab.key as typeof activeTab);
              if (tab.key === "wallMat" || tab.key === "wallTeam" || tab.key === "scratch" || tab.key === "scoring") {
                setWallRefreshIndex(idx => idx + 1);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-body">
        {activeTab === "attendance" && (
          <section>
            <AttendanceTab
              meetId={meetId}
              teams={teams}
              wrestlers={wrestlers}
              homeTeamId={homeTeamId}
              attendanceDeadline={attendanceDeadline}
              showRefresh={meetStatus === "ATTENDANCE"}
              showNoReplyColumn={meetStatus !== "DRAFT"}
              readOnly={meetStatus === "ATTENDANCE"}
              onRefresh={load}
            />
          </section>
        )}

        {activeTab === "pairings" && (
          <div className={`pairings-pane${canEdit ? "" : " readonly"}`}>
          {authMsg && (
            <div className="notice">
              {authMsg}
            </div>
          )}


      {isPublished && (
        <div className="notice" style={{ marginTop: 16 }}>
          Meet has been published, so matches may not be changed.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: 16, marginTop: 0 }}>
        <div className="pairings-main-card" style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: isNarrowScreen ? "flex-start" : "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "nowrap",
                flexDirection: isNarrowScreen ? "column" : "row",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                {pairingsHeaderTeam && (
                  <div
                    style={{
                      fontWeight: 700,
                      color: pairingsHeaderColor,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: isNarrowScreen ? 140 : "100%",
                      minWidth: 0,
                      flex: "1 1 auto",
                    }}
                    title={pairingsHeaderTeam.name}
                  >
                    {pairingsHeaderTeam.name}
                  </div>
                )}
              </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "nowrap",
                alignItems: "center",
                flex: "0 0 auto",
                alignSelf: isNarrowScreen ? "stretch" : "auto",
              }}
            >
              <button
                type="button"
                className="nav-btn"
                onClick={() => {
                  setClearAutoPairingsBeforeRun(false);
                  setAllowRejectedMatchups(false);
                  setShowAutoPairingsConfirm(true);
                }}
                disabled={!canEdit || autoPairingsLoading}
              >
                {autoPairingsLoading ? "Running..." : "Run Auto Pairings"}
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
                title={formatTeamName(team)}
              >
                <span className="tab-full">{formatTeamName(team)}</span>
                <span className="tab-symbol">{team.symbol ?? team.name}</span>
              </button>
            );
            })}
          </div>
        <div
          className="pairings-table-wrapper"
          ref={pairingsTableWrapperRef}
          tabIndex={0}
          onKeyDown={handlePairingsKeyDown}
        >
            <table className="pairings-table" cellPadding={4} style={{ borderCollapse: "collapse" }}>
              <colgroup>
                <col style={{ width: pairingsColWidthsForView[0] }} />
                <col style={{ width: pairingsColWidthsForView[1] }} />
                <col style={{ width: pairingsColWidthsForView[2] }} />
                <col style={{ width: pairingsColWidthsForView[3] }} />
                <col style={{ width: pairingsColWidthsForView[4] }} />
                <col style={{ width: pairingsColWidthsForView[5] }} />
                <col style={{ width: pairingsColWidthsForView[6] }} />
                <col style={{ width: pairingsColWidthsForView[7] }} />
              </colgroup>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                {[
                  { label: "Last", key: "last" },
                  { label: "First", key: "first" },
                  { label: "Girl", key: "girl" },
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
                      onTouchStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const touch = e.touches[0];
                        resizeRef.current = {
                          kind: "pairings",
                          index,
                          startX: touch.clientX,
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
                    data-pairing-id={w.id}
                    className={selectedPairingId === w.id ? "selected" : undefined}
                    onMouseMove={(event) => handleMatchesHover(event, w.id)}
                    onMouseLeave={hideMatchesTooltip}
                    onClick={() => {
                      setSelectedPairingId(w.id);
                      setTarget(w);
                      pairingsTableWrapperRef.current?.focus();
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedPairingId(w.id);
                      setTarget(w);
                      setPairingContext({ x: event.clientX, y: event.clientY, wrestler: w, mode: "status" });
                    }}
                  style={{
                    borderTop: "1px solid #eee",
                    backgroundColor: selectedPairingId === w.id ? "#f0f0f0" : undefined,
                    cursor: "pointer",
                  }}
                >
                    <td
                      className={`pairings-name-cell${statusClass}`}
                      style={{ color: teamTextColor(w.teamId) }}
                      data-tooltip-skip="true"
                    >
                      {w.last}
                    </td>
                    <td
                      className={`pairings-name-cell${statusClass}`}
                      style={{ color: teamTextColor(w.teamId) }}
                      data-tooltip-skip="true"
                    >
                      {w.first}
                    </td>
                    <td style={{ color: sexColor(w.isGirl) }}>{w.isGirl ? "Yes" : "No"}</td>
                    <td style={{ color: sexColor(w.isGirl) }}>{ageYears(w.birthdate)?.toFixed(1) ?? ""}</td>
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
                  <td colSpan={8} style={{ color: "#666" }}>No attending wrestlers.</td>
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
                    ({teamSymbolById(target.teamId)})
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
                   <span>{target.isGirl ? <span style={{ color: sexColor(true) }}>Girl</span> : ""}</span>
                   <span>Age: <span style={{ color: sexColor(target.isGirl) }}>{targetAge ? `${targetAge}` : "—"}</span></span>
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
                    <div className="current-matches-scroll">
                    <table className="pairings-table" cellPadding={4} style={{ borderCollapse: "collapse" }}>
                    <colgroup>
                      {currentColumnWidthsForView.map((w, idx) => (
                        <col key={`current-col-${idx}`} style={{ width: w }} />
                      ))}
                    </colgroup>
                      <thead>
                        <tr>
                          {[
                            { label: "Last", key: "last" },
                            { label: "First", key: "first" },
                            { label: "Team", key: "team" },
                            { label: "Girl", key: "girl" },
                            { label: "Age", key: "age" },
                            { label: "Weight", key: "weight" },
                            { label: "Exp", key: "exp" },
                            { label: "Skill", key: "skill" },
                            { label: "Δ", key: "score" },
                            { label: "Matches", key: "matches" },
                            { label: "Bout #", key: "bout" },
                            { label: "Added By", key: "source" },
                            ].map((col, index) => (
                          <th
                            key={col.label}
                            align={col.key === "score" ? "center" : "left"}
                            className="pairings-th"
                            title={col.key === "score" ? "Weight percentage difference, adjusted for age, exp, and skill." : undefined}
                          >
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
                              onTouchStart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const touch = e.touches[0];
                                resizeRef.current = {
                                  kind: "current",
                                  index,
                                  startX: touch.clientX,
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
                                <td colSpan={12} style={{ color: "#666" }}>None</td>
                              </tr>
                            )}
                        {currentSorted.map(({ bout, opponentId, opponent, signedScore }) => {
                          const opponentColor = opponent ? teamTextColor(opponent.teamId) : undefined;
                          const manualCoachId = bout.source ?? null;
                          const manualCoachUsername = bout.sourceUser?.username ?? null;
                          const manualCoachName = bout.sourceUser?.name ?? manualCoachUsername ?? "Coach";
                          const manualCoachLabel = manualCoachUsername ?? bout.sourceUser?.name ?? "Coach";
                          const manualCoachBy = manualCoachUsername ?? manualCoachName;
                          const manualCoachTeamId = bout.sourceUser?.teamId ?? null;
                          const manualCoachColor =
                            bout.sourceUser?.teamColor ?? (manualCoachTeamId ? teamColor(manualCoachTeamId) : null);
                          const manualCoachText = manualCoachColor ? contrastText(manualCoachColor) : "#1f5e8a";
                          const manualCoachBorder = manualCoachColor
                            ? darkenHex(manualCoachColor, 0.2)
                            : "#c6def5";
                          const manualCoachAt = bout.createdAt ? new Date(bout.createdAt).toLocaleString() : "unknown time";
                          const autoAt = bout.createdAt ? new Date(bout.createdAt).toLocaleString() : "unknown time";
                          const red = wMap[bout.redId];
                          const green = wMap[bout.greenId];
                          const manualDetails = {
                            left: { name: red ? `${red.first} ${red.last}`.trim() : bout.redId, teamId: red?.teamId ?? null },
                            right: { name: green ? `${green.first} ${green.last}`.trim() : bout.greenId, teamId: green?.teamId ?? null },
                            by: manualCoachBy,
                            at: manualCoachAt,
                          };
                         return (
                                <tr
                                  key={bout.id}
                                  className="match-row-hover"
                                  onMouseMove={(event) => handleMatchesHover(event, opponentId)}
                                  onMouseLeave={hideMatchesTooltip}
                                  onClick={() => {
                                    if (!canEdit) return;
                                    void removeBout(bout.id);
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (!opponent) return;
                                    setPairingContext({ x: event.clientX, y: event.clientY, wrestler: opponent, mode: "showMatches" });
                                  }}
                                  style={{ borderTop: "1px solid #eee", cursor: canEdit ? "pointer" : "default" }}
                                >
                                  <td style={opponentColor ? { color: opponentColor } : undefined} data-tooltip-skip="true">{opponent?.last ?? ""}</td>
                                  <td style={opponentColor ? { color: opponentColor } : undefined} data-tooltip-skip="true">{opponent?.first ?? ""}</td>
                              <td>
                                {opponent && (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ width: 10, height: 10, background: teamColor(opponent.teamId), display: "inline-block" }} />
                                    {teamSymbol(opponent.teamId)}
                                  </span>
                                )}
                              </td>
                            <td align="left" style={{ color: sexColor(opponent?.isGirl) }}>{opponent?.isGirl ? "Yes" : "No"}</td>
                            <td align="left" style={{ color: sexColor(opponent?.isGirl) }}>{ageYears(opponent?.birthdate)?.toFixed(1) ?? ""}</td>
                            <td align="left">{opponent?.weight ?? ""}</td>
                            <td align="left">{opponent?.experienceYears ?? ""}</td>
                            <td align="left">{opponent?.skill ?? ""}</td>
                              <td
                                align="left"
                                style={Number.isFinite(signedScore) ? { color: deltaColor(signedScore) } : undefined}
                              >
                                {Number.isFinite(signedScore) ? signedScore.toFixed(2) : ""}
                              </td>
                              <td align="left">
                                {getMatchCount(opponentId)}
                              </td>
                              <td align="left">{boutNumber(bout.mat, bout.order)}</td>
                              <td
                                align="left"
                                data-no-row-hover="true"
                                data-tooltip-skip="true"
                                style={!manualCoachId ? { cursor: "pointer" } : { cursor: "pointer" }}
                                onMouseMove={(event) => {
                                  if (manualCoachId) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  showAutoTooltip(event, autoAt);
                                }}
                                onMouseLeave={(event) => {
                                  if (manualCoachId) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  hideMatchesTooltip();
                                }}
                              >
                                {manualCoachId ? (
                                  <span
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                    onMouseMove={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      showManualTooltip(event, manualDetails);
                                    }}
                                    onMouseLeave={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      hideMatchesTooltip();
                                    }}
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: "0.2px",
                                      color: manualCoachText,
                                      background: manualCoachColor ?? "#e7f0fb",
                                      border: `1px solid ${manualCoachBorder}`,
                                      padding: "1px 6px",
                                      borderRadius: 999,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      maxWidth: 140,
                                      justifyContent: "center",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {manualCoachLabel}
                                  </span>
                                ) : (
                                  <span
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                    onMouseMove={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      showAutoTooltip(event, autoAt);
                                    }}
                                    onMouseLeave={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      hideMatchesTooltip();
                                    }}
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: "0.4px",
                                      textTransform: "uppercase",
                                      color: "#6a7483",
                                      background: "#f7f9fc",
                                      border: "1px solid #e4e9f2",
                                      padding: "1px 6px",
                                      borderRadius: 999,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Auto
                                  </span>
                                )}
                              </td>
                               </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                </div>
                    <h3 className="pairings-heading" style={{ margin: "10px 0 6px" }}>
                      Possible additional matches:
                    </h3>
                  <div className="pairings-table-wrapper additional-matches-wrapper">
                  <table className="pairings-table" cellPadding={4} style={{ borderCollapse: "collapse" }}>
                    <colgroup>
                      {availableColumnWidthsForView.map((w, idx) => (
                        <col key={`available-col-${idx}`} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {[
                          { label: "Last", key: "last" },
                          { label: "First", key: "first" },
                          { label: "Team", key: "team" },
                          { label: "Girl", key: "girl" },
                          { label: "Age", key: "age" },
                          { label: "Weight", key: "weight" },
                          { label: "Exp", key: "exp" },
                          { label: "Skill", key: "skill" },
                          { label: "Δ", key: "score" },
                          { label: "Matches", key: "matches" },
                        ].map((col, index) => (
                          <th
                            key={col.label}
                            align={col.key === "score" ? "center" : "left"}
                            className="pairings-th sortable-th"
                            onClick={() => toggleSort(setAvailableSort, col.key)}
                            title={col.key === "score" ? "Weight percentage difference, adjusted for age, exp, and skill." : undefined}
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
                              onTouchStart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const touch = e.touches[0];
                                resizeRef.current = {
                                  kind: "available",
                                  index,
                                  startX: touch.clientX,
                                  startWidth: availableColumnWidths[index],
                                };
                              }}
                            />
                          </th>
                        ))}
                        <th className="pairings-th" align="left">Rejected By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableDisplay.map(({ opponent: o, score }) => {
                        const matchColor = teamTextColor(o.teamId);
                        const rejectedInfo = rejectedPairs.get(pairKey(target.id, o.id));
                        const rejected = Boolean(rejectedInfo);
                        const rejectedBaseColor = rejected
                          ? (rejectedInfo?.byTeamColor ?? (rejectedInfo?.byTeamId ? teamColor(rejectedInfo.byTeamId) : null))
                          : null;
                        const rejectedBadgeColor = rejectedBaseColor;
                        const rejectedBadgeText = rejectedBadgeColor ? contrastText(rejectedBadgeColor) : "#8a1c1c";
                        const rejectedBadgeBorder = rejectedBadgeColor ? darkenHex(rejectedBadgeColor, 0.2) : "#f4c7c3";
                        return (
                          <tr
                            key={o.id}
                            className="match-row-hover"
                            onMouseMove={(event) => handleMatchesHover(event, o.id)}
                            onMouseLeave={hideMatchesTooltip}
                            onClick={() => {
                              if (!canEdit) return;
                              void addMatch(target.id, o.id);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setPairingContext({ x: event.clientX, y: event.clientY, wrestler: o, mode: "showMatches" });
                            }}
                            style={{ borderTop: "1px solid #eee", cursor: canEdit ? "pointer" : "default" }}
                          >
                            <td style={{ color: matchColor }} data-tooltip-skip="true">{o.last}</td>
                            <td style={{ color: matchColor }} data-tooltip-skip="true">{o.first}</td>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 10, height: 10, background: teamColor(o.teamId), display: "inline-block" }} />
                                {teamSymbol(o.teamId)}
                              </span>
                            </td>
                            <td align="left" style={{ color: sexColor(o.isGirl) }}>{o.isGirl ? "Yes" : "No"}</td>
                            <td align="left" style={{ color: sexColor(o.isGirl) }}>{ageYears(o.birthdate)?.toFixed(1) ?? ""}</td>
                            <td align="left">{o.weight}</td>
                            <td align="left">{o.experienceYears}</td>
                            <td align="left">{o.skill}</td>
                              <td
                                align="left"
                                style={Number.isFinite(score) ? { color: deltaColor(score) } : undefined}
                              >
                                {Number.isFinite(score) ? score.toFixed(2) : ""}
                              </td>
                            <td align="left">{getMatchCount(o.id)}</td>
                            <td
                              align="left"
                              data-tooltip-skip="true"
                              data-no-row-hover="true"
                              style={rejected ? { cursor: "pointer" } : undefined}
                              onMouseEnter={(event) => {
                                if (!rejectedInfo) return;
                                event.stopPropagation();
                                showRejectedTooltip(event, {
                                  left: rejectedInfo.b,
                                  right: rejectedInfo.a,
                                  by: rejectedInfo.by,
                                  at: rejectedInfo.at,
                                });
                              }}
                              onMouseMove={(event) => {
                                if (!rejectedInfo) return;
                                event.stopPropagation();
                                showRejectedTooltip(event, {
                                  left: rejectedInfo.b,
                                  right: rejectedInfo.a,
                                  by: rejectedInfo.by,
                                  at: rejectedInfo.at,
                                });
                              }}
                              onMouseLeave={(event) => {
                                if (!rejectedInfo) return;
                                event.stopPropagation();
                                hideMatchesTooltip();
                              }}
                            >
                              {rejected && (
                                <span
                                  onMouseDown={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: "0.2px",
                                    color: rejectedBadgeText,
                                    background: rejectedBadgeColor ?? "#fdecea",
                                    border: `1px solid ${rejectedBadgeBorder}`,
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    maxWidth: 140,
                                    justifyContent: "center",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    cursor: "pointer",
                                  }}
                                >
                                  {rejectedInfo?.by ?? "Rejected"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {availableDisplay.length === 0 && (
                        <tr>
                          <td colSpan={11}>
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
                      <label><input type="checkbox" checked={settings.girlsWrestleGirls} onChange={async e => {
                        const girlsWrestleGirls = e.target.checked;
                        setSettings(s => ({ ...s, girlsWrestleGirls }));
                      }} /> Girls wrestle girls</label>
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
          <span style={{ fontSize: 17, fontWeight: 600, color: "#2f3237", alignSelf: "center" }}>
            Total matches: {bouts.length}
          </span>
          {autoPairingsSummary && (
            <span style={{ fontSize: 13, color: "#4b5563", alignSelf: "center" }}>
              {autoPairingsSummary}
            </span>
          )}
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
            <div className="panel-scroll fill comments-scroll" style={{ display: "block", marginTop: 12, fontSize: 13 }}>
              {comments.map(comment => (
                <div key={comment.id} className="comments-row">
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
            <div className="panel-scroll fill change-log-scroll" style={{ display: "block", fontSize: 13 }}>
              {changes.map(change => (
                <div key={change.id} className="change-log-row">
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
          <div
            className="modal-backdrop"
            onClick={() => {
              setShowAutoPairingsConfirm(false);
            }}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Run Auto Pairings</h3>
              <div style={{ fontSize: 13, color: "#5b6472" }}>
                Generate new pairings for this meet.
              </div>
              <div className="auto-pairings-controls">
                <div className="control-row">
                  <label>
                    Target matches per
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={autoMatchesPerWrestler ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "") {
                          setAutoMatchesPerWrestler(null);
                          return;
                        }
                        const parsed = Number.parseInt(value, 10);
                        if (Number.isNaN(parsed)) return;
                        const next = Math.min(5, Math.max(1, parsed));
                        setAutoMatchesPerWrestler(next);
                        setPruneTargetMatches((prev) => {
                          if (prev !== null && prev < next) return next;
                          return prev;
                        });
                      }}
                    />
                  </label>
                  <label>
                    Max matches per
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={autoMaxMatchesPerWrestler ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "") {
                          setAutoMaxMatchesPerWrestler(null);
                          return;
                        }
                        const parsed = Number.parseInt(value, 10);
                        if (Number.isNaN(parsed)) return;
                        setAutoMaxMatchesPerWrestler(Math.min(5, Math.max(1, parsed)));
                      }}
                    />
                  </label>
                </div>
                  <div className="control-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.firstYearOnlyWithFirstYear}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSettings((s) => ({ ...s, firstYearOnlyWithFirstYear: checked }));
                        }}
                      />
                      First-year only rule
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.girlsWrestleGirls}
                        onChange={(e) => {
                          const girlsWrestleGirls = e.target.checked;
                          setSettings((s) => ({ ...s, girlsWrestleGirls }));
                        }}
                      />
                      Girls wrestle girls
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.allowSameTeamMatches}
                        onChange={(e) => {
                          const allowSameTeamMatches = e.target.checked;
                          setSettings((s) => ({ ...s, allowSameTeamMatches }));
                        }}
                      />
                      Include same team
                    </label>
                  </div>
                </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={clearAutoPairingsBeforeRun}
                  onChange={(e) => setClearAutoPairingsBeforeRun(e.target.checked)}
                />
                Clear all existing bouts before generating
              </label>
              {rejectedPairs.size > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={allowRejectedMatchups}
                    onChange={(e) => setAllowRejectedMatchups(e.target.checked)}
                  />
                  Allow previously rejected matchups
                </label>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0, fontSize: 13 }}>
                Remove all bouts where both wrestlers have more than
                <input
                  type="number"
                  min={pruneTargetMin}
                  max={5}
                  value={pruneTargetDisplay}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      setPruneTargetMatches(null);
                      return;
                    }
                    const parsed = Number.parseInt(value, 10);
                    if (Number.isNaN(parsed)) return;
                    setPruneTargetMatches(Math.max(pruneTargetMin, Math.min(5, parsed)));
                  }}
                  style={{ width: 64 }}
                />
                matches
              </label>
              <div className="modal-actions">
                <button
                  className="nav-btn"
                  type="button"
                  onClick={() => {
                    setShowAutoPairingsConfirm(false);
                  }}
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
        const menuWidth = pairingMenuSize.width;
        const menuHeight = pairingMenuSize.height;
        const viewportPadding = 8;
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
        const left = viewportWidth
          ? Math.max(viewportPadding, Math.min(pairingContext.x, viewportWidth - menuWidth - viewportPadding))
          : pairingContext.x;
        const top = viewportHeight
          ? Math.max(viewportPadding, Math.min(pairingContext.y, viewportHeight - menuHeight - viewportPadding))
          : pairingContext.y;
        const fullName = `${pairingContext.wrestler.first} ${pairingContext.wrestler.last}`;
        const currentStatus = pairingContext.wrestler.status ?? null;
        const isShowMatches = pairingContext.mode === "showMatches";
        return (
          <>
            <div className="pairings-context-backdrop" onMouseDown={() => setPairingContext(null)} />
            <div
              className={`pairings-context-menu${!isShowMatches && !canEdit ? " readonly" : ""}`}
              ref={pairingMenuRef}
              style={{ left, top }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="pairings-context-title">{fullName}</div>
              {isShowMatches && (
                <button
                  className="pairings-context-item"
                  onClick={() => {
                    showMatchesForWrestler(pairingContext.wrestler);
                    setPairingContext(null);
                  }}
                >
                  Switch to {fullName}
                </button>
              )}
              {!isShowMatches && (
                <>
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
                </>
              )}
            </div>
          </>
        );
      })()}
      {matchesTooltip && (() => {
        const tooltipWidth = 320;
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
        const left = viewportWidth ? Math.min(matchesTooltip.x + 14, viewportWidth - tooltipWidth - 8) : matchesTooltip.x;
        const top = viewportHeight ? Math.min(matchesTooltip.y + 14, viewportHeight - 200) : matchesTooltip.y;

        if (matchesTooltip.mode === "rejected") {
          const leftSymbol = matchesTooltip.left.teamId
            ? (teams.find(t => t.id === matchesTooltip.left.teamId)?.symbol ?? "")
            : "";
          const rightSymbol = matchesTooltip.right.teamId
            ? (teams.find(t => t.id === matchesTooltip.right.teamId)?.symbol ?? "")
            : "";
          const leftLabel = leftSymbol
            ? `${matchesTooltip.left.name} (${leftSymbol})`
            : matchesTooltip.left.name;
          const rightLabel = rightSymbol
            ? `${matchesTooltip.right.name} (${rightSymbol})`
            : matchesTooltip.right.name;
          const leftColor = matchesTooltip.left.teamId
            ? teamTextColor(matchesTooltip.left.teamId)
            : "#222";
          const rightColor = matchesTooltip.right.teamId
            ? teamTextColor(matchesTooltip.right.teamId)
            : "#222";
          return (
            <div
              style={{
                position: "fixed",
                left,
                top,
                width: tooltipWidth,
                zIndex: 1000,
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                padding: "10px 12px",
                pointerEvents: "none",
                fontSize: 13,
              }}
              aria-hidden="true"
            >
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#8a1c1c" }}>
                Rejected by {matchesTooltip.by} on {matchesTooltip.at}
              </div>
              <div style={{ color: "#444" }}>
                <span style={{ color: leftColor, fontWeight: 700 }}>{leftLabel}</span>
                <span style={{ margin: "0 6px" }}>vs</span>
                <span style={{ color: rightColor, fontWeight: 700 }}>{rightLabel}</span>
              </div>
              <div style={{ color: "#444", marginTop: 4 }}>
                This matchup will not be used for future auto pairings.
              </div>
            </div>
          );
        }

        if (matchesTooltip.mode === "manual") {
          const leftSymbol = matchesTooltip.left.teamId
            ? (teams.find(t => t.id === matchesTooltip.left.teamId)?.symbol ?? "")
            : "";
          const rightSymbol = matchesTooltip.right.teamId
            ? (teams.find(t => t.id === matchesTooltip.right.teamId)?.symbol ?? "")
            : "";
          const leftLabel = leftSymbol
            ? `${matchesTooltip.left.name} (${leftSymbol})`
            : matchesTooltip.left.name;
          const rightLabel = rightSymbol
            ? `${matchesTooltip.right.name} (${rightSymbol})`
            : matchesTooltip.right.name;
          const leftColor = matchesTooltip.left.teamId
            ? teamTextColor(matchesTooltip.left.teamId)
            : "#222";
          const rightColor = matchesTooltip.right.teamId
            ? teamTextColor(matchesTooltip.right.teamId)
            : "#222";
          return (
            <div
              style={{
                position: "fixed",
                left,
                top,
                width: tooltipWidth,
                zIndex: 1000,
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                padding: "10px 12px",
                pointerEvents: "none",
                fontSize: 13,
              }}
              aria-hidden="true"
            >
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#1f5e8a" }}>
                Added by {matchesTooltip.by} on {matchesTooltip.at}
              </div>
              <div style={{ color: "#444" }}>
                <span style={{ color: leftColor, fontWeight: 700 }}>{leftLabel}</span>
                <span style={{ margin: "0 6px" }}>vs</span>
                <span style={{ color: rightColor, fontWeight: 700 }}>{rightLabel}</span>
              </div>
            </div>
          );
        }

        if (matchesTooltip.mode === "auto") {
          return (
            <div
              style={{
                position: "fixed",
                left,
                top,
                width: tooltipWidth,
                zIndex: 1000,
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                padding: "10px 12px",
                pointerEvents: "none",
                fontSize: 13,
              }}
              aria-hidden="true"
            >
              <div style={{ fontWeight: 800, color: "#4a5568" }}>
                Automatically generated on {matchesTooltip.at}
              </div>
            </div>
          );
        }

        const tooltipWrestler = wMap[matchesTooltip.wrestlerId] ?? null;
        const fullName = tooltipWrestler ? `${tooltipWrestler.first} ${tooltipWrestler.last}`.trim() : matchesTooltip.wrestlerId;
        const titleTeam = tooltipWrestler ? teamSymbolById(tooltipWrestler.teamId) : "";
        const titleColor = tooltipWrestler ? teamTextColor(tooltipWrestler.teamId) : "#222";
        const rows = (boutsByWrestlerId.get(matchesTooltip.wrestlerId) ?? [])
          .slice()
          .sort((a, b) => {
            const matA = a.bout.mat ?? 9999;
            const matB = b.bout.mat ?? 9999;
            if (matA !== matB) return matA - matB;
            const orderA = a.bout.order ?? 9999;
            const orderB = b.bout.order ?? 9999;
            if (orderA !== orderB) return orderA - orderB;
            return a.bout.id.localeCompare(b.bout.id);
          });

        return (
          <div
            style={{
              position: "fixed",
              left,
              top,
              width: tooltipWidth,
              zIndex: 1000,
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
              padding: "10px 12px",
              pointerEvents: "none",
              fontSize: 13,
            }}
            aria-hidden="true"
          >
            <div style={{ fontWeight: 800, marginBottom: 6, color: titleColor }}>
              Current matches for {fullName}{titleTeam ? ` (${titleTeam})` : ""}
            </div>
            {rows.length === 0 ? (
              <div style={{ color: "#666" }}>No matches.</div>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                {rows.map(({ bout, opponentId }) => {
                  const opp = wMap[opponentId];
                  const oppName = opp ? `${opp.first} ${opp.last}`.trim() : opponentId;
                  const team = opp ? teamSymbol(opp.teamId) : "";
                  const label = team ? `${oppName} (${team})` : oppName;
                  const opponentColor = opp ? teamTextColor(opp.teamId) : "#333";
                  const num = boutNumber(bout.mat, bout.order);
                  const oppMatchCount = getMatchCount(opponentId);
                  return (
                    <div key={`${matchesTooltip.wrestlerId}-${bout.id}-${opponentId}`}>
                      <span style={{ fontWeight: 700, marginRight: 8 }}>{num}</span>
                      <span style={{ color: opponentColor }}>{label}</span>
                      <span style={{ marginLeft: 8, color: "#666", fontSize: 12 }}>
                        ({oppMatchCount})
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
          </div>
        )}

        {activeTab === "matboard" && (
          <section>
            {isPublished && (
              <div className="notice">
                Meet has been published, so matches may not be changed.
              </div>
            )}
            <MatBoardTab
              meetId={meetId}
              onMatAssignmentsChange={refreshAfterMatAssignments}
              meetStatus={meetStatus}
              lockState={lockState}
              refreshIndex={matRefreshIndex}
            />
          </section>
        )}

        {activeTab === "wallMat" && canViewPublishedSheets && (
          <section className="wall-chart-section">
            <WallChartTab meetId={meetId} refreshIndex={wallRefreshIndex} chartType="mat" />
          </section>
        )}

        {activeTab === "volunteers" && canShowVolunteers && (
          <section>
            {isPublished && (
              <div className="notice">
                Meet has been published, so volunteer mat assignments may not be changed.
              </div>
            )}
            <VolunteersTab
              meetId={meetId}
              canEdit={canEdit}
              onSaved={refreshAfterMatAssignments}
            />
          </section>
        )}

        {activeTab === "wallTeam" && canViewPublishedSheets && (
          <section className="wall-chart-section">
            <WallChartTab meetId={meetId} refreshIndex={wallRefreshIndex} chartType="team" />
          </section>
        )}

        {activeTab === "scratch" && canViewCheckinSheet && (
          <section className="wall-chart-section">
            <ScratchSheetTab meetId={meetId} refreshIndex={wallRefreshIndex} />
          </section>
        )}

        {activeTab === "scratches" && canViewScratches && (
          <ScratchesTab
            meetId={meetId}
            teams={teams}
            wrestlers={wrestlers}
            bouts={bouts}
            homeTeamId={homeTeamId}
            checkpoints={checkpoints}
            targetMatchesPerWrestler={matchesPerWrestler ?? savedMatchesPerWrestler}
            canManage={canManageScratches}
            onRefresh={async () => {
              await load();
              await loadActivity();
            }}
          />
        )}

        {activeTab === "scoring" && canViewPublishedSheets && (
          <section className="wall-chart-section">
            <ScoringSheetTab meetId={meetId} refreshIndex={wallRefreshIndex} />
          </section>
        )}
      </div>
      {showEditAccessModal && canManageLockAccess && lockAccessLoaded && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={handleEditAccessDone}>
            <div className="modal-card edit-access-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Grant Edit Access</h3>
              <div className="edit-access-intro">
                Select which coaches can edit the meet. The Meet Coordinator always keeps access.
              </div>
              {!coordinatorAssigned && (
                <div className="edit-access-warning">
                  Assign a head coach to the home team before managing edit access.
                </div>
              )}
              {lockAccessError && (
                <div className="edit-access-error">
                  {lockAccessError}
                </div>
              )}
              {lockAccessByTeam.length === 0 ? (
                <div className="edit-access-empty">No other coaches are eligible for this meet.</div>
              ) : (
                <div className="edit-access-grid">
                  {lockAccessByTeam.map((teamGroup) => {
                    const total = teamGroup.coaches.length;
                    const selected = teamGroup.coaches.reduce(
                      (count, coach) => count + (lockAccessDraftIds.has(coach.id) ? 1 : 0),
                      0,
                    );
                    const allSelected = total > 0 && selected === total;
                    const anySelected = selected > 0;
                    const teamColor = adjustTeamTextColor(teamGroup.color);
                    return (
                      <div key={teamGroup.key} className="edit-access-team-card">
                        <div className="edit-access-team-header">
                          <div className="edit-access-team-title" style={{ color: teamColor }}>{teamGroup.title}</div>
                          <div className="edit-access-team-actions">
                            <button
                              type="button"
                              className="nav-btn secondary"
                              onClick={() => {
                                setLockAccessDraftIds((prev) => {
                                  const next = new Set(prev);
                                  for (const coach of teamGroup.coaches) {
                                    next.add(coach.id);
                                  }
                                  return next;
                                });
                              }}
                              disabled={lockAccessSaving || !coordinatorAssigned || allSelected}
                            >
                              All
                            </button>
                            <button
                              type="button"
                              className="nav-btn secondary"
                              onClick={() => {
                                setLockAccessDraftIds((prev) => {
                                  const next = new Set(prev);
                                  for (const coach of teamGroup.coaches) {
                                    next.delete(coach.id);
                                  }
                                  return next;
                                });
                              }}
                              disabled={lockAccessSaving || !coordinatorAssigned || !anySelected}
                            >
                              None
                            </button>
                          </div>
                        </div>
                        <div className={`edit-access-coach-list${teamGroup.coaches.length > 4 ? " scrollable" : ""}`}>
                          {teamGroup.coaches.map((coach) => {
                            const checked = lockAccessDraftIds.has(coach.id);
                            const nameLabel = coach.name?.trim()
                              ? `${coach.name} (@${coach.username})`
                              : `@${coach.username}`;
                            return (
                              <label key={coach.id} className="edit-access-coach-row">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const nextChecked = e.target.checked;
                                    setLockAccessDraftIds((prev) => {
                                      const next = new Set(prev);
                                      if (nextChecked) {
                                        next.add(coach.id);
                                      } else {
                                        next.delete(coach.id);
                                      }
                                      return next;
                                    });
                                  }}
                                  disabled={lockAccessSaving || !coordinatorAssigned}
                                />
                                <span className="edit-access-coach-meta" style={{ color: teamColor }}>
                                  <span className="edit-access-coach-name">{nameLabel}</span>
                                  {coach.isHeadCoach && (
                                    <span
                                      className="edit-access-head-chip"
                                      style={{ borderColor: teamColor, color: teamColor }}
                                    >
                                      Head Coach
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="edit-access-footer">
                <button
                  type="button"
                  className="nav-btn secondary"
                  onClick={() => {
                    setLockAccessDraftIds(new Set(lockAccessCoaches.map((coach) => coach.id)));
                  }}
                  disabled={lockAccessSaving || !coordinatorAssigned || lockAccessCoaches.length === 0 || allEligibleSelected}
                >
                  Everyone
                </button>
                <button
                  type="button"
                  className="nav-btn secondary"
                  onClick={() => setLockAccessDraftIds(new Set())}
                  disabled={lockAccessSaving || lockAccessDraftIds.size === 0 || !coordinatorAssigned}
                >
                  Only me
                </button>
                <button type="button" className="nav-btn" onClick={handleEditAccessDone}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {showReadyForCheckinModal && (
        <ModalPortal>
          <div
            className="modal-backdrop"
            onClick={() => {
              if (readyForCheckinSubmitting || readyForCheckinActionId) return;
              setShowReadyForCheckinModal(false);
            }}
          >
            <div className="modal-card ready-checkin-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>
                {readyForCheckinTargetStatus === "PUBLISHED" ? "Publish Checklist" : "Check-in Checklist"}
              </h3>
              <div className="ready-checkin-summary">
                {readyForCheckinTargetStatus === "PUBLISHED"
                  ? "Review these checks before publishing the meet."
                  : "Review these checks before moving the meet out of Draft."}
              </div>
              {readyForCheckinError && (
                <div className="ready-checkin-error">{readyForCheckinError}</div>
              )}
              {readyForCheckinLoading && (
                <div className="ready-checkin-summary">Loading checklist...</div>
              )}
              {!readyForCheckinLoading && readyForCheckinChecklist && (
                <>
                  <div className="ready-checkin-list">
                    {readyForCheckinChecklist.items.map((item) => {
                      const itemClass = item.ok ? "ok" : item.severity;
                      const stateLabel = item.ok ? "OK" : item.severity === "warning" ? "Warning" : "Fix";
                      return (
                        <div key={item.id} className={`ready-checkin-item ${itemClass}`}>
                          <div className="ready-checkin-item-header">
                            <span>{item.label}</span>
                            <span className="ready-checkin-item-state">{stateLabel}</span>
                          </div>
                          <div className="ready-checkin-item-detail">{item.detail}</div>
                          {!item.ok && item.action && item.actionLabel && (
                            <div className="ready-checkin-item-actions">
                              <button
                                type="button"
                                className="nav-btn secondary"
                                onClick={() => void runReadyForCheckinAction(item.action!)}
                                disabled={Boolean(readyForCheckinActionId) || readyForCheckinSubmitting}
                              >
                                {readyForCheckinActionId === item.action ? "Fixing..." : item.actionLabel}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="ready-checkin-summary">
                    {readyForCheckinChecklist.ok
                      ? (readyForCheckinTargetStatus === "PUBLISHED"
                        ? "All blocking checks passed. You can publish the meet."
                        : "All blocking checks passed. You can mark the meet ready for check-in.")
                      : (readyForCheckinTargetStatus === "PUBLISHED"
                        ? "Fix the failed checklist items before publishing the meet."
                        : "Fix the failed checklist items before moving the meet to Check-in.")}
                  </div>
                </>
              )}
              <div className="ready-checkin-footer">
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => setShowReadyForCheckinModal(false)}
                  disabled={readyForCheckinSubmitting || Boolean(readyForCheckinActionId)}
                >
                  Close
                </button>
                {readyForCheckinChecklist?.ok && (
                  <button
                    type="button"
                    className="nav-btn primary"
                    onClick={() => void confirmReadyForCheckin()}
                    disabled={readyForCheckinSubmitting || Boolean(readyForCheckinActionId)}
                  >
                    {readyForCheckinSubmitting
                      ? (readyForCheckinTargetStatus === "PUBLISHED" ? "Publishing..." : "Saving...")
                      : (readyForCheckinTargetStatus === "PUBLISHED" ? "Publish" : "Mark ready for meet day")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {showPublishWarningModal && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowPublishWarningModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Publish Meet</h3>
              <div>
                Publishing is permanent. After this step, all changes must be done on paper.
              </div>
              <div className="ready-checkin-summary">
                Continue only when pairings, mat assignments, and sheets are final.
              </div>
              <div className="ready-checkin-footer">
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => setShowPublishWarningModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="nav-btn primary"
                  onClick={() => {
                    setShowPublishWarningModal(false);
                    void openReadyForCheckinChecklist("PUBLISHED");
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {showCloseAttendanceWarningModal && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowCloseAttendanceWarningModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Close Attendance Early?</h3>
              <div>
                Attendance has not reached its deadline yet.
              </div>
              <div className="ready-checkin-summary">
                {attendanceDeadline
                  ? `The attendance deadline is ${new Date(attendanceDeadline).toLocaleString()}.`
                  : "The attendance deadline has not passed yet."}
              </div>
              <div className="ready-checkin-footer">
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => setShowCloseAttendanceWarningModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="nav-btn primary"
                  onClick={() => {
                    setShowCloseAttendanceWarningModal(false);
                    void updateMeetStatus("DRAFT");
                  }}
                >
                  Close Attendance
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {showCheckpointModal && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowCheckpointModal(false)}>
            <div className="modal-card checkpoint-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0 }}>Manage Checkpoints of the current state of the meet</h3>
              <CheckpointSaveRow onSave={saveCheckpointByName} />
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
                      {canShowCheckpointApply && (
                        <button
                          className="nav-btn checkpoint-apply-btn"
                          type="button"
                          onClick={() => applyCheckpoint(cp.id, cp.name)}
                          disabled={checkpointApplyingId === cp.id}
                          title={`Revert the meet to [${cp.name}] (loses all changes made after this checkpoint was saved).`}
                        >
                          {checkpointApplyingId === cp.id ? "Applying..." : "Apply"}
                        </button>
                      )}
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
              <div className="checkpoint-footer">
                <button
                  className="nav-btn"
                  type="button"
                  onClick={exportMeet}
                  disabled={!meetLoaded || exportingMeet}
                  title="Export a zip file for use with desktop Pairings program"
                >
                  {exportingMeet ? "Exporting..." : "Export to .wrs"}
                </button>
                <div className="checkpoint-footer-actions">
                  <button className="nav-btn" onClick={() => setShowCheckpointModal(false)}>Close</button>
                </div>
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
                              style={{ color: teamTextColor(wMap[entry.wrestlerId]?.teamId ?? "") }}
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
                        {checkpointDiff.boutsAdded.map((b, idx) => {
                          const { leftId, rightId, leftTeam, rightTeam } = getCheckpointBoutOrder(b);
                          const left = wMap[leftId];
                          const right = wMap[rightId];
                          return (
                            <tr key={`${b.redId}-${b.greenId}-${idx}`}>
                              <td>
                                <span style={{ color: teamTextColor(left?.teamId ?? "") }}>
                                  {left?.first ?? "Unknown"} {left?.last ?? leftId}
                                  {leftTeam ? ` (${leftTeam})` : ""}
                                </span>
                                <span className="diff-vs-inline"> v </span>
                                <span style={{ color: teamTextColor(right?.teamId ?? "") }}>
                                  {right?.first ?? "Unknown"} {right?.last ?? rightId}
                                  {rightTeam ? ` (${rightTeam})` : ""}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
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
                        {checkpointDiff.boutsRemoved.map((b, idx) => {
                          const { leftId, rightId, leftTeam, rightTeam } = getCheckpointBoutOrder(b);
                          const left = wMap[leftId];
                          const right = wMap[rightId];
                          return (
                            <tr key={`${b.redId}-${b.greenId}-${idx}`}>
                              <td>
                                <span style={{ color: teamTextColor(left?.teamId ?? "") }}>
                                  {left?.first ?? "Unknown"} {left?.last ?? leftId}
                                  {leftTeam ? ` (${leftTeam})` : ""}
                                </span>
                                <span className="diff-vs-inline"> v </span>
                                <span style={{ color: teamTextColor(right?.teamId ?? "") }}>
                                  {right?.first ?? "Unknown"} {right?.last ?? rightId}
                                  {rightTeam ? ` (${rightTeam})` : ""}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
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

    </main>
  );
}

