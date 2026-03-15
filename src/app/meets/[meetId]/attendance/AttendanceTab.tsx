"use client";

import { useEffect, useRef, useState } from "react";

import { adjustTeamTextColor } from "@/lib/contrastText";
import { formatTeamName } from "@/lib/formatTeamName";

type Team = {
  id: string;
  name: string;
  symbol?: string | null;
  color?: string | null;
};

type AttendanceStatus = "COMING" | "NOT_COMING" | "LATE" | "EARLY" | "ABSENT" | null;

type Wrestler = {
  id: string;
  teamId: string;
  first: string;
  last: string;
  status?: AttendanceStatus;
  parentResponseStatus?: AttendanceStatus;
  statusChangedByUsername?: string | null;
  statusChangedByRole?: string | null;
  statusChangedSource?: string | null;
  statusChangedAt?: string | null;
};

type AttendanceTabProps = {
  meetId: string;
  teams: Team[];
  wrestlers: Wrestler[];
  homeTeamId: string | null;
  attendanceDeadline?: string | null;
  showRefresh?: boolean;
  showNoReplyColumn?: boolean;
  showScratchedColumn?: boolean;
  disableAllComing?: boolean;
  showStatusAttribution?: boolean;
  showParentEntryNotice?: boolean;
  showParentResponseDetails?: boolean;
  editableTeamId?: string | null;
  lockRequired?: boolean;
  readOnly?: boolean;
  onEnsureLock?: (force?: boolean) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
};

type AttributionTooltip = {
  message: string;
  x: number;
  y: number;
};

function contrastText(color?: string | null) {
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

function sortRosterRows(rows: Wrestler[]) {
  return [...rows].sort((a, b) => {
    const lastCompare = a.last.localeCompare(b.last, undefined, { sensitivity: "base" });
    if (lastCompare !== 0) return lastCompare;
    return a.first.localeCompare(b.first, undefined, { sensitivity: "base" });
  });
}

function formatAttendanceLabel(status: AttendanceStatus) {
  if (status === "NOT_COMING") return "Not Coming";
  if (status === "COMING") return "Coming";
  if (status === "LATE") return "Late";
  if (status === "EARLY") return "Early";
  if (status === "ABSENT") return "Scratched";
  return "No Reply";
}

function hasParentResponseMismatch(wrestler: Wrestler) {
  return wrestler.parentResponseStatus !== null &&
    wrestler.parentResponseStatus !== undefined &&
    wrestler.status !== null &&
    wrestler.status !== undefined &&
    wrestler.parentResponseStatus !== wrestler.status;
}

function isAttendingStatus(status: AttendanceStatus) {
  return status === "COMING" || status === "LATE" || status === "EARLY";
}

function withEffectiveStatus(
  wrestler: Wrestler,
  pendingStatusChanges: Map<string, "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null>,
) {
  return {
    ...wrestler,
    status: pendingStatusChanges.get(wrestler.id) ?? wrestler.status ?? null,
  };
}

function formatStatusAttribution(wrestler: Wrestler) {
  if (!wrestler.statusChangedByUsername || !wrestler.statusChangedAt) return null;
  const changedAt = new Date(wrestler.statusChangedAt);
  if (Number.isNaN(changedAt.getTime())) return null;
  const sourceLabel = wrestler.statusChangedSource === "PARENT"
    ? "Parent"
    : wrestler.statusChangedSource === "CHECKIN"
      ? "Check-in"
      : wrestler.statusChangedSource === "SYSTEM"
        ? "System"
        : wrestler.statusChangedByRole === "ADMIN"
          ? "Admin"
          : "Coach";
  return `${sourceLabel}: ${wrestler.statusChangedByUsername} on ${changedAt.toLocaleString()}`;
}

function formatParentResponseInfo(wrestler: Wrestler) {
  if (
    wrestler.statusChangedSource !== "PARENT" ||
    !wrestler.parentResponseStatus ||
    !wrestler.statusChangedByUsername ||
    !wrestler.statusChangedAt
  ) {
    return null;
  }
  const changedAt = new Date(wrestler.statusChangedAt);
  if (Number.isNaN(changedAt.getTime())) return null;
  const responseLabel = formatAttendanceLabel(wrestler.parentResponseStatus);
  return `${wrestler.statusChangedByUsername} marked ${responseLabel} on ${changedAt.toLocaleString()}`;
}

function formatParentResponseLabel(wrestler: Wrestler) {
  if (wrestler.parentResponseStatus === null || wrestler.parentResponseStatus === undefined) return null;
  if (wrestler.statusChangedByUsername) {
    if (hasParentResponseMismatch(wrestler)) {
      return `(${wrestler.statusChangedByUsername}: ${formatAttendanceLabel(wrestler.parentResponseStatus)})`;
    }
    return `(${wrestler.statusChangedByUsername})`;
  }
  if (hasParentResponseMismatch(wrestler)) {
    return `(Parent: ${formatAttendanceLabel(wrestler.parentResponseStatus)})`;
  }
  return `(Parent)`;
}

export default function AttendanceTab({
  meetId,
  teams,
  wrestlers,
  homeTeamId,
  attendanceDeadline = null,
  showRefresh = false,
  showNoReplyColumn = true,
  showScratchedColumn = false,
  disableAllComing = false,
  showStatusAttribution = false,
  showParentEntryNotice = false,
  showParentResponseDetails = false,
  editableTeamId = null,
  lockRequired = true,
  readOnly = false,
  onEnsureLock,
  onRefresh,
  onRegisterSaveHandler,
}: AttendanceTabProps) {
  const orderedTeams = homeTeamId
    ? [teams.find(t => t.id === homeTeamId), ...teams.filter(t => t.id !== homeTeamId)].filter((team): team is Team => Boolean(team))
    : teams;
  const [activeTeamId, setActiveTeamId] = useState<string | null>(orderedTeams[0]?.id || null);
  const [draggedWrestler, setDraggedWrestler] = useState<Wrestler | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkUpdatingColumn, setBulkUpdatingColumn] = useState<string | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [pendingStatusChanges, setPendingStatusChanges] = useState<Map<string, "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null>>(new Map());
  const [attributionTooltip, setAttributionTooltip] = useState<AttributionTooltip | null>(null);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({
    coming: "",
    "not-coming": "",
    "no-reply": "",
  });
  const pendingStatusChangesRef = useRef(pendingStatusChanges);
  const savingRef = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const savePendingChangesRef = useRef<(opts?: { silent?: boolean; keepalive?: boolean }) => Promise<boolean>>(async () => true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendingStatusChangesRef.current = pendingStatusChanges;
  }, [pendingStatusChanges]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateTouchInteraction = () => setIsTouchInteraction(mediaQuery.matches);
    updateTouchInteraction();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateTouchInteraction);
      return () => mediaQuery.removeEventListener("change", updateTouchInteraction);
    }
    mediaQuery.addListener(updateTouchInteraction);
    return () => mediaQuery.removeListener(updateTouchInteraction);
  }, []);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!attributionTooltip) return;
    const hideTooltip = () => setAttributionTooltip(null);
    document.addEventListener("pointerdown", hideTooltip);
    document.addEventListener("touchstart", hideTooltip);
    return () => {
      document.removeEventListener("pointerdown", hideTooltip);
      document.removeEventListener("touchstart", hideTooltip);
    };
  }, [attributionTooltip]);

  useEffect(() => {
    setPendingStatusChanges((current) => {
      if (current.size === 0) return current;
      const wrestlerStatusById = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler.status ?? null]));
      const next = new Map(current);
      for (const [wrestlerId, pendingStatus] of current.entries()) {
        if (wrestlerStatusById.get(wrestlerId) === pendingStatus) {
          next.delete(wrestlerId);
        }
      }
      pendingStatusChangesRef.current = next;
      return next;
    });
  }, [wrestlers]);

  const activeTeam = teams.find(t => t.id === activeTeamId);
  const canEditActiveTeam = !readOnly && (!editableTeamId || activeTeamId === editableTeamId);
  const showTouchMoveButtons = canEditActiveTeam && isTouchInteraction;
  const effectiveWrestlers = wrestlers.map((wrestler) => withEffectiveStatus(wrestler, pendingStatusChanges));
  const teamWrestlers = wrestlers
    .filter(w => w.teamId === activeTeamId)
    .map((wrestler) => withEffectiveStatus(wrestler, pendingStatusChanges));
  const totalAttending = effectiveWrestlers.filter((wrestler) => isAttendingStatus(wrestler.status ?? null)).length;
  const attendingByTeam = new Map<string, number>();
  for (const wrestler of effectiveWrestlers) {
    if (!isAttendingStatus(wrestler.status ?? null)) continue;
    attendingByTeam.set(wrestler.teamId, (attendingByTeam.get(wrestler.teamId) ?? 0) + 1);
  }
  const attendanceDeadlineLabel = (() => {
    if (!attendanceDeadline) return null;
    const deadline = new Date(attendanceDeadline);
    if (Number.isNaN(deadline.getTime())) return null;
    return deadline.toLocaleString();
  })();

  const coming = sortRosterRows(teamWrestlers.filter(w => w.status === "COMING" || w.status === "LATE" || w.status === "EARLY"));
  const scratched = sortRosterRows(teamWrestlers.filter(w => w.status === "ABSENT"));
  const notComing = sortRosterRows(
    teamWrestlers.filter(
      w => w.status === "NOT_COMING" || (!showNoReplyColumn && w.status == null),
    ),
  );
  const noReply = sortRosterRows(teamWrestlers.filter(w => w.status == null));
  const shouldShowNoReplyColumn = showNoReplyColumn && noReply.length > 0;
  const columns: Array<{
    key: string;
    label: string;
    wrestlers: Wrestler[];
    dropStatus: "COMING" | "NOT_COMING" | null;
    clickStatus: "COMING" | "NOT_COMING" | null;
    panelBackground: string;
    itemBackground: string;
    itemBorder: string;
  }> = [
    {
      key: "coming",
      label: "Coming",
      wrestlers: coming,
      dropStatus: "COMING",
      clickStatus: "NOT_COMING",
      panelBackground: "#f6fbf6",
      itemBackground: "#e6f7e6",
      itemBorder: "#c7ddc7",
    },
    {
      key: "not-coming",
      label: "Not Coming",
      wrestlers: notComing,
      dropStatus: "NOT_COMING",
      clickStatus: "COMING",
      panelBackground: "#f4f5f7",
      itemBackground: "#eceef1",
      itemBorder: "#cfd5dc",
    },
  ];
  if (showScratchedColumn) {
    columns.push({
      key: "scratched",
      label: "Scratched",
      wrestlers: scratched,
      dropStatus: "NOT_COMING",
      clickStatus: "COMING",
      panelBackground: "#f8f1f1",
      itemBackground: "#f4e6e6",
      itemBorder: "#dfc1c1",
    });
  }
  if (shouldShowNoReplyColumn) {
    columns.push({
      key: "no-reply",
      label: "No Reply",
      wrestlers: noReply,
      dropStatus: null,
      clickStatus: "COMING",
      panelBackground: "#f7f8fa",
      itemBackground: "#f0f0f0",
      itemBorder: "#d7dbe1",
    });
  }

  const runManagedAttendanceRequest = async (makeRequest: () => Promise<Response>, fallbackError: string) => {
    if (lockRequired && onEnsureLock) {
      const hasLock = await onEnsureLock();
      if (!hasLock) throw new Error("Meet lock required");
    }
    let response = await makeRequest();
    let payload = response.ok ? null : await response.clone().json().catch(() => null);
    if (!response.ok && payload?.error === "Meet lock required" && lockRequired && onEnsureLock) {
      const hasLock = await onEnsureLock(true);
      if (!hasLock) throw new Error("Meet lock required");
      response = await makeRequest();
      payload = response.ok ? null : await response.clone().json().catch(() => null);
    }
    if (!response.ok) {
      throw new Error(payload?.error ?? fallbackError);
    }
    return response;
  };

  const queueStatusChange = (wrestlerId: string, status: "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null) => {
    const wrestler = wrestlers.find((entry) => entry.id === wrestlerId);
    const persistedStatus = wrestler?.status ?? null;
    setPendingStatusChanges((current) => {
      const next = new Map(current);
      if (status === persistedStatus) {
        next.delete(wrestlerId);
      } else {
        next.set(wrestlerId, status);
      }
      pendingStatusChangesRef.current = next;
      return next;
    });
  };

  const getQuickStatusActions = (columnKey: string) => {
    if (columnKey === "coming") {
      return [
        { label: "Not Coming", status: "NOT_COMING" as const },
        ...(shouldShowNoReplyColumn ? [{ label: "No Reply", status: null }] : []),
      ];
    }
    if (columnKey === "not-coming") {
      return [
        { label: "Coming", status: "COMING" as const },
        ...(shouldShowNoReplyColumn ? [{ label: "No Reply", status: null }] : []),
      ];
    }
    return [
      { label: "Coming", status: "COMING" as const },
      { label: "Not Coming", status: "NOT_COMING" as const },
    ];
  };

  const savePendingChanges = async (opts?: { silent?: boolean; keepalive?: boolean }) => {
    const changes = [...pendingStatusChangesRef.current.entries()].map(([wrestlerId, status]) => ({ wrestlerId, status }));
    if (changes.length === 0) return true;
    if (savingRef.current) return false;
    setSaving(true);
    savingRef.current = true;
    try {
      await runManagedAttendanceRequest(
        () => fetch(`/api/meets/${meetId}/wrestlers/status/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes }),
          keepalive: Boolean(opts?.keepalive),
        }),
        "Failed to update attendance",
      );
      await onRefresh();
      return true;
    } catch (error) {
      if (!opts?.silent) {
        alert(error instanceof Error ? error.message : "Failed to update attendance");
      }
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  useEffect(() => {
    savePendingChangesRef.current = savePendingChanges;
  });

  const switchActiveTeam = async (teamId: string) => {
    if (teamId === activeTeamId) return;
    if (!readOnly && pendingStatusChangesRef.current.size > 0) {
      const ok = await savePendingChangesRef.current();
      if (!ok) return;
    }
    setActiveTeamId(teamId);
  };

  useEffect(() => {
    if (!onRegisterSaveHandler) return undefined;
    const handler = () => savePendingChangesRef.current();
    onRegisterSaveHandler(handler);
    return () => onRegisterSaveHandler(null);
  }, [onRegisterSaveHandler]);

  useEffect(() => {
    if (readOnly || pendingStatusChanges.size === 0) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (savingRef.current) return;
    const timer = setTimeout(() => {
      autoSaveTimerRef.current = null;
      if (pendingStatusChangesRef.current.size === 0 || savingRef.current) return;
      void savePendingChangesRef.current({ silent: true });
    }, 2000);
    autoSaveTimerRef.current = timer;
    return () => {
      if (autoSaveTimerRef.current === timer) {
        clearTimeout(timer);
        autoSaveTimerRef.current = null;
      }
    };
  }, [pendingStatusChanges, readOnly]);

  useEffect(() => {
    if (readOnly) return undefined;
    const autoSave = () => {
      if (pendingStatusChangesRef.current.size === 0 || savingRef.current) return;
      void savePendingChangesRef.current({ silent: true, keepalive: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") autoSave();
    };
    window.addEventListener("blur", autoSave);
    window.addEventListener("pagehide", autoSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      autoSave();
      window.removeEventListener("blur", autoSave);
      window.removeEventListener("pagehide", autoSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [readOnly]);

  const handleDrop = async (e: React.DragEvent, newStatus: "COMING" | "NOT_COMING" | null) => {
    e.preventDefault();
    if (!canEditActiveTeam) return;
    if (!draggedWrestler) return;
    queueStatusChange(draggedWrestler.id, newStatus);
    setDraggedWrestler(null);
  };

  const handleDragStart = (wrestler: Wrestler) => {
    if (!canEditActiveTeam) return;
    setDraggedWrestler(wrestler);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const toggleComingStatus = async (wrestler: Wrestler, nextStatus: "NOT_COMING" | "LATE" | "EARLY") => {
    if (!canEditActiveTeam) return;
    const updatedStatus = wrestler.status === nextStatus ? "COMING" : nextStatus;
    queueStatusChange(wrestler.id, updatedStatus);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (savingRef.current || refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      void onRefreshRef.current()
        .catch(() => {})
        .finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const bulkUpdateStatus = async (
    wrestlerIds: string[],
    status: "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null,
    columnKey: string,
  ) => {
    if (wrestlerIds.length === 0) return;
    setBulkUpdatingColumn(columnKey);
    try {
      setPendingStatusChanges((current) => {
        const next = new Map(current);
        for (const wrestlerId of wrestlerIds) {
          const wrestler = wrestlers.find((entry) => entry.id === wrestlerId);
          const persistedStatus = wrestler?.status ?? null;
          if (status === persistedStatus) {
            next.delete(wrestlerId);
          } else {
            next.set(wrestlerId, status);
          }
        }
        pendingStatusChangesRef.current = next;
        return next;
      });
    } finally {
      setBulkUpdatingColumn(null);
    }
  };

  const fuzzyMatches = (value: string, query: string) => {
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
  };

  return (
    <div>
      {showParentEntryNotice && (
        <div className="notice" style={{ marginBottom: 12 }}>
          This page shows what parents have entered for their kids so far. After the attendance deadline{attendanceDeadlineLabel ? ` (${attendanceDeadlineLabel})` : ""}, only coaches will be able to make changes.
        </div>
      )}
      {activeTeam && (
        <div className="pairings-main-card" style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10, fontSize: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
              <div
                className="pairings-heading"
                style={{
                  fontWeight: 700,
                  color: activeTeam.color ? adjustTeamTextColor(activeTeam.color) : undefined,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                  flex: "1 1 auto",
                }}
                title={activeTeam.name}
              >
                {activeTeam.name}
              </div>
            </div>
          </div>
          <div className="pairings-tab-bar" style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            {orderedTeams.map(team => {
              const isActive = activeTeamId === team.id;
              const activeTextColor = contrastText(team.color);
              const textColor = team.color ? adjustTeamTextColor(team.color) : undefined;
              return (
                <button
                  key={team.id}
                  onClick={() => {
                    void switchActiveTeam(team.id);
                  }}
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
                  title={formatTeamName(team)}
                >
                  <span className="tab-full">{formatTeamName(team)}</span>
                  <span className="tab-symbol">{team.symbol ?? team.name}</span>
                </button>
              );
            })}
            {showRefresh && (
              <div style={{ display: "flex", alignItems: "center", paddingLeft: 40, transform: "translateY(-6px)" }}>
                <button
                  type="button"
                  className="nav-btn secondary"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 10,
              marginBottom: showTouchMoveButtons ? 4 : 0,
              fontSize: 12,
            }}
          >
            <div
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: "#eef6ff",
                border: "1px solid #c9ddf5",
                fontWeight: 700,
                color: "#23415f",
              }}
            >
              Total Attending: {totalAttending}
            </div>
            {orderedTeams.map((team) => (
              <div
                key={`${team.id}-attending-total`}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: team.color ? `${team.color}18` : "#f4f5f7",
                  border: `1px solid ${team.color ?? "#d1d5db"}`,
                  color: team.color ? adjustTeamTextColor(team.color) : "#374151",
                  fontWeight: 600,
                }}
              >
                {(team.symbol ?? team.name)}: {attendingByTeam.get(team.id) ?? 0}
              </div>
            ))}
          </div>
          {showTouchMoveButtons && (
            <div style={{ marginTop: 4, fontSize: 12, color: "#5f6b79" }}>
              Touch: use the row buttons to move wrestlers between columns.
            </div>
          )}
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: columns.map((column) => column.key === "no-reply" ? "340px" : "360px").join(" "),
                gap: 8,
                width: "fit-content",
                alignItems: "start",
              }}
            >
              {columns.map((column) => (
                <div key={column.key} style={{ minWidth: 0 }}>
                  {(() => {
                    const searchValue = columnSearch[column.key] ?? "";
                    const filteredWrestlers = column.wrestlers.filter((wrestler) =>
                      fuzzyMatches(`${wrestler.first} ${wrestler.last}`, searchValue),
                    );
                    return (
                      <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <h3 className="pairings-heading" style={{ margin: 0, fontSize: 14 }}>
                      {column.label} ({column.wrestlers.length})
                    </h3>
                    {!showStatusAttribution && column.key === "no-reply" && (
                      <button
                        type="button"
                        className="nav-btn secondary"
                        onClick={() => {
                          if (!canEditActiveTeam || disableAllComing) return;
                          void bulkUpdateStatus(
                            filteredWrestlers.map((wrestler) => wrestler.id),
                            "COMING",
                            column.key,
                          );
                        }}
                        disabled={disableAllComing || !canEditActiveTeam || filteredWrestlers.length === 0 || bulkUpdatingColumn === column.key}
                        style={{ padding: "3px 8px", fontSize: 11, minHeight: "auto" }}
                        title={
                          disableAllComing
                            ? "All Coming is only available during Draft."
                            : canEditActiveTeam
                              ? "Mark all visible no-reply wrestlers coming"
                              : undefined
                        }
                      >
                        {bulkUpdatingColumn === column.key ? "Saving..." : "All Coming"}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setColumnSearch((current) => ({ ...current, [column.key]: nextValue }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      event.preventDefault();
                      setColumnSearch((current) => ({ ...current, [column.key]: "" }));
                    }}
                    placeholder="Search"
                    aria-label={`${column.label} search`}
                    style={{ width: "100%", marginBottom: 4, padding: "3px 6px", fontSize: 13 }}
                  />
                  <div
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: 4,
                      height: "max(260px, calc(100dvh - 300px))",
                      overflowY: "auto",
                      background: column.panelBackground,
                    }}
                    onDrop={canEditActiveTeam ? (e) => void handleDrop(e, column.dropStatus) : undefined}
                    onDragOver={canEditActiveTeam ? handleDragOver : undefined}
                  >
                    {filteredWrestlers.map(w => (
                      (() => {
                        const isLate = w.status === "LATE";
                        const isEarly = w.status === "EARLY";
                        const attribution = !pendingStatusChanges.has(w.id)
                          ? formatStatusAttribution(w)
                          : null;
                        const parentResponseInfo = !pendingStatusChanges.has(w.id)
                          ? formatParentResponseInfo(w)
                          : null;
                        const hasParentResponse = showParentResponseDetails &&
                          w.parentResponseStatus !== null &&
                          w.parentResponseStatus !== undefined;
                        const hasParentMismatch = showParentResponseDetails &&
                          !pendingStatusChanges.has(w.id) &&
                          hasParentResponseMismatch(w);
                        const parentResponseLabel = showParentResponseDetails &&
                          !pendingStatusChanges.has(w.id)
                          ? formatParentResponseLabel(w)
                          : null;
                        const tooltipMessage = parentResponseInfo;
                        const hadExplicitResponse =
                          w.status === "NOT_COMING" || w.status === "ABSENT";
                        const emphasizeNotComingResponse =
                          column.key === "not-coming" && !showNoReplyColumn && hadExplicitResponse;
                        const rowBackground = isLate
                          ? "#dff1ff"
                          : isEarly
                            ? "#f3eadf"
                            : column.itemBackground;
                        const rowBorder = isLate
                          ? "#b6defc"
                          : isEarly
                            ? "#e2c8ad"
                            : column.itemBorder;
                        const noReplyStatusActions = canEditActiveTeam && column.key === "no-reply"
                          ? getQuickStatusActions(column.key)
                          : [];
                        return (
                      <div
                        key={w.id}
                        draggable={canEditActiveTeam}
                        onDragStart={() => handleDragStart(w)}
                        onClick={canEditActiveTeam ? () => queueStatusChange(w.id, column.clickStatus) : undefined}
                        style={{
                          padding: "3px 4px",
                          margin: "0 0 4px",
                          background: rowBackground,
                          border: `1px solid ${rowBorder}`,
                          borderRadius: 4,
                          cursor: canEditActiveTeam ? "pointer" : "default",
                          fontSize: 14,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div
                            style={{ minWidth: 0, flex: "1 1 auto" }}
                            onMouseMove={tooltipMessage ? (event) => {
                              setAttributionTooltip({
                                message: tooltipMessage,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            } : undefined}
                            onMouseLeave={tooltipMessage ? () => setAttributionTooltip(null) : undefined}
                          >
                            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              <span style={{ fontWeight: emphasizeNotComingResponse || hasParentResponse || parentResponseLabel || hasParentMismatch ? 700 : undefined }}>
                                {w.first} {w.last}
                              </span>
                              {parentResponseLabel && (
                                <span style={{ marginLeft: 6, color: hasParentMismatch ? "#9a3412" : "#5f6b79" }}>
                                  {parentResponseLabel}
                                </span>
                              )}
                            </div>
                            {showStatusAttribution && attribution && (
                              <div
                                style={{
                                  marginTop: 1,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  fontSize: 11,
                                  color: "#5f6b79",
                                }}
                                title={attribution}
                              >
                                {attribution}
                              </div>
                            )}
                          </div>
                          <div
                            style={{ display: "flex", gap: 6, fontSize: 12, flex: "0 0 auto", whiteSpace: "nowrap", alignItems: "center" }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {noReplyStatusActions.map((action) => (
                              <button
                                key={`${w.id}-${action.label}`}
                                type="button"
                                onClick={() => queueStatusChange(w.id, action.status)}
                                style={{
                                  border: "1px solid #cfd5dc",
                                  borderRadius: 999,
                                  background: "#ffffff",
                                  color: "#334155",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {action.label}
                              </button>
                            ))}
                            {canEditActiveTeam && column.key === "coming" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void toggleComingStatus(w, "LATE");
                                  }}
                                  style={{
                                    border: "1px solid #b6defc",
                                    borderRadius: 4,
                                    background: w.status === "LATE" ? "#dff1ff" : "#f6fbff",
                                    color: "#275f84",
                                    fontSize: 11,
                                    fontWeight: w.status === "LATE" ? 800 : 600,
                                    padding: "1px 6px",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                  title="Toggle Late"
                                >
                                  Late
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void toggleComingStatus(w, "EARLY");
                                  }}
                                  style={{
                                    border: "1px solid #e2c8ad",
                                    borderRadius: 4,
                                    background: w.status === "EARLY" ? "#f3eadf" : "#fbf7f1",
                                    color: "#7a5d36",
                                    fontSize: 11,
                                    fontWeight: w.status === "EARLY" ? 800 : 600,
                                    padding: "1px 6px",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                  title="Toggle Early"
                                >
                                  Early
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                        );
                      })()
                    ))}
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {attributionTooltip && (() => {
        const tooltipWidth = 320;
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
        const left = viewportWidth ? Math.min(attributionTooltip.x + 14, viewportWidth - tooltipWidth - 8) : attributionTooltip.x;
        const top = viewportHeight ? Math.min(attributionTooltip.y + 14, viewportHeight - 120) : attributionTooltip.y;
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
              {attributionTooltip.message}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
