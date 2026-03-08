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

type Wrestler = {
  id: string;
  teamId: string;
  first: string;
  last: string;
  status?: "COMING" | "NOT_COMING" | "LATE" | "EARLY" | "ABSENT" | null;
};

type AttendanceTabProps = {
  meetId: string;
  teams: Team[];
  wrestlers: Wrestler[];
  homeTeamId: string | null;
  attendanceDeadline?: string | null;
  showRefresh?: boolean;
  showNoReplyColumn?: boolean;
  readOnly?: boolean;
  onEnsureLock?: (force?: boolean) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
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

export default function AttendanceTab({
  meetId,
  teams,
  wrestlers,
  homeTeamId,
  attendanceDeadline = null,
  showRefresh = false,
  showNoReplyColumn = true,
  readOnly = false,
  onEnsureLock,
  onRefresh,
  onRegisterSaveHandler,
}: AttendanceTabProps) {
  const isDev = process.env.NODE_ENV !== "production";
  const orderedTeams = homeTeamId
    ? [teams.find(t => t.id === homeTeamId), ...teams.filter(t => t.id !== homeTeamId)].filter((team): team is Team => Boolean(team))
    : teams;
  const [activeTeamId, setActiveTeamId] = useState<string | null>(orderedTeams[0]?.id || null);
  const [draggedWrestler, setDraggedWrestler] = useState<Wrestler | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkUpdatingColumn, setBulkUpdatingColumn] = useState<string | null>(null);
  const [pendingStatusChanges, setPendingStatusChanges] = useState<Map<string, "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null>>(new Map());
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({
    coming: "",
    "not-coming": "",
    "no-reply": "",
  });
  const pendingStatusChangesRef = useRef(pendingStatusChanges);
  const savingRef = useRef(false);
  const savePendingChangesRef = useRef<(opts?: { silent?: boolean; keepalive?: boolean }) => Promise<boolean>>(async () => true);

  useEffect(() => {
    pendingStatusChangesRef.current = pendingStatusChanges;
  }, [pendingStatusChanges]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

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

  const effectiveStatus = (wrestler: Wrestler) => (
    pendingStatusChanges.get(wrestler.id) ?? wrestler.status ?? null
  );

  const activeTeam = teams.find(t => t.id === activeTeamId);
  const teamWrestlers = wrestlers
    .filter(w => w.teamId === activeTeamId)
    .map((wrestler) => ({ ...wrestler, status: effectiveStatus(wrestler) }));
  const attendanceDeadlineLabel = (() => {
    if (!attendanceDeadline) return null;
    const deadline = new Date(attendanceDeadline);
    if (Number.isNaN(deadline.getTime())) return null;
    return deadline.toLocaleString();
  })();

  const coming = sortRosterRows(teamWrestlers.filter(w => w.status === "COMING" || w.status === "LATE" || w.status === "EARLY"));
  const notComing = sortRosterRows(
    teamWrestlers.filter(
      w => w.status === "NOT_COMING" || w.status === "ABSENT" || (!showNoReplyColumn && w.status == null),
    ),
  );
  const noReply = sortRosterRows(teamWrestlers.filter(w => w.status == null));
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
  if (showNoReplyColumn) {
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
    if (onEnsureLock) {
      const hasLock = await onEnsureLock();
      if (!hasLock) throw new Error("Meet lock required");
    }
    let response = await makeRequest();
    let payload = response.ok ? null : await response.clone().json().catch(() => null);
    if (!response.ok && payload?.error === "Meet lock required" && onEnsureLock) {
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
    if (readOnly) return;
    if (!draggedWrestler) return;
    queueStatusChange(draggedWrestler.id, newStatus);
    setDraggedWrestler(null);
  };

  const handleDragStart = (wrestler: Wrestler) => {
    if (readOnly) return;
    setDraggedWrestler(wrestler);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const toggleComingStatus = async (wrestler: Wrestler, nextStatus: "NOT_COMING" | "LATE" | "EARLY") => {
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
      {readOnly && (
        <div className="notice" style={{ marginBottom: 12 }}>
          This page shows what parents have entered for their kids so far. After the attendance deadline{attendanceDeadlineLabel ? ` (${attendanceDeadlineLabel})` : ""}, coaches will be able to make changes.
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
            {!readOnly && (
              <div style={{ display: "flex", alignItems: "center", paddingLeft: 32, transform: "translateY(-6px)" }}>
                <button
                  type="button"
                  className="nav-btn primary"
                  onClick={() => void savePendingChanges()}
                  disabled={pendingStatusChanges.size === 0 || saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
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
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: columns.length === 3 ? "360px 360px 340px" : "360px 360px",
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
                      {column.label}
                    </h3>
                    {!readOnly && isDev && column.key === "not-coming" && (
                      <button
                        type="button"
                        className="nav-btn secondary"
                        onClick={() => {
                          void bulkUpdateStatus(
                            filteredWrestlers.map((wrestler) => wrestler.id),
                            "COMING",
                            column.key,
                          );
                        }}
                        disabled={filteredWrestlers.length === 0 || bulkUpdatingColumn === column.key}
                        style={{ padding: "3px 8px", fontSize: 11, minHeight: "auto" }}
                        title="Mark all visible not-coming wrestlers coming"
                      >
                        {bulkUpdatingColumn === column.key ? "Saving..." : "All Coming"}
                      </button>
                    )}
                    {!readOnly && column.key === "no-reply" && (
                      <button
                        type="button"
                        className="nav-btn secondary"
                        onClick={() => {
                          void bulkUpdateStatus(
                            filteredWrestlers.map((wrestler) => wrestler.id),
                            "COMING",
                            column.key,
                          );
                        }}
                        disabled={filteredWrestlers.length === 0 || bulkUpdatingColumn === column.key}
                        style={{ padding: "3px 8px", fontSize: 11, minHeight: "auto" }}
                        title="Mark all visible no-reply wrestlers coming"
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
                    onDrop={readOnly ? undefined : (e) => void handleDrop(e, column.dropStatus)}
                    onDragOver={readOnly ? undefined : handleDragOver}
                  >
                    {filteredWrestlers.map(w => (
                      (() => {
                        const isLate = w.status === "LATE";
                        const isEarly = w.status === "EARLY";
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
                        return (
                      <div
                        key={w.id}
                        draggable={!readOnly}
                        onDragStart={() => handleDragStart(w)}
                        onClick={readOnly ? undefined : () => queueStatusChange(w.id, column.clickStatus)}
                        style={{
                          padding: "3px 4px",
                          margin: "0 0 4px",
                          background: rowBackground,
                          border: `1px solid ${rowBorder}`,
                          borderRadius: 4,
                          cursor: readOnly ? "default" : "pointer",
                          fontSize: 14,
                        }}
                        title={readOnly
                          ? undefined
                          : (
                          column.clickStatus === "COMING"
                            ? "Click to mark Coming"
                            : column.clickStatus === "NOT_COMING"
                              ? "Click to mark Not Coming"
                              : "Click to clear attendance"
                          )}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {w.first} {w.last}
                          </div>
                        {!readOnly && column.key === "coming" && (
                          <div
                            style={{ display: "flex", gap: 8, fontSize: 12, flex: "0 0 auto", whiteSpace: "nowrap" }}
                            onClick={(event) => event.stopPropagation()}
                          >
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
                          </div>
                        )}
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
    </div>
  );
}
