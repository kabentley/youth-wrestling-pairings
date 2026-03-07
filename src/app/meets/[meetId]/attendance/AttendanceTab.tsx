"use client";

import { useState } from "react";

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
  onRefresh: () => Promise<void>;
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

export default function AttendanceTab({
  meetId,
  teams,
  wrestlers,
  homeTeamId,
  attendanceDeadline = null,
  showRefresh = false,
  showNoReplyColumn = true,
  readOnly = false,
  onRefresh,
}: AttendanceTabProps) {
  const isDev = process.env.NODE_ENV !== "production";
  const orderedTeams = homeTeamId
    ? [teams.find(t => t.id === homeTeamId), ...teams.filter(t => t.id !== homeTeamId)].filter((team): team is Team => Boolean(team))
    : teams;
  const [activeTeamId, setActiveTeamId] = useState<string | null>(orderedTeams[0]?.id || null);
  const [draggedWrestler, setDraggedWrestler] = useState<Wrestler | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkUpdatingColumn, setBulkUpdatingColumn] = useState<string | null>(null);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({
    coming: "",
    "not-coming": "",
    "no-reply": "",
  });

  const activeTeam = teams.find(t => t.id === activeTeamId);
  const teamWrestlers = wrestlers.filter(w => w.teamId === activeTeamId);
  const attendanceDeadlineLabel = (() => {
    if (!attendanceDeadline) return null;
    const deadline = new Date(attendanceDeadline);
    if (Number.isNaN(deadline.getTime())) return null;
    return deadline.toLocaleString();
  })();

  const coming = teamWrestlers.filter(w => w.status === "COMING" || w.status === "LATE" || w.status === "EARLY");
  const notComing = teamWrestlers.filter(w => w.status === "NOT_COMING" || w.status === "ABSENT");
  const noReply = teamWrestlers.filter(w => w.status == null);
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
      panelBackground: "#fff7f7",
      itemBackground: "#f7e6e6",
      itemBorder: "#e0c5c5",
    },
    ...(showNoReplyColumn
      ? [{
          key: "no-reply",
          label: "No Reply",
          wrestlers: noReply,
          dropStatus: null,
          clickStatus: "COMING",
          panelBackground: "#f7f8fa",
          itemBackground: "#f0f0f0",
          itemBorder: "#d7dbe1",
        }]
      : []),
  ];

  const updateStatus = async (wrestlerId: string, status: "COMING" | "NOT_COMING" | "LATE" | "EARLY" | null) => {
    const response = await fetch(`/api/meets/${meetId}/wrestlers/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrestlerId, status }),
    });
    if (response.ok) {
      await onRefresh();
    } else {
      alert("Failed to update status");
    }
  };

  const handleDrop = async (e: React.DragEvent, newStatus: "COMING" | "NOT_COMING" | null) => {
    e.preventDefault();
    if (readOnly) return;
    if (!draggedWrestler) return;
    await updateStatus(draggedWrestler.id, newStatus);
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
    await updateStatus(wrestler.id, updatedStatus);
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
      const response = await fetch(`/api/meets/${meetId}/wrestlers/status/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: wrestlerIds.map((wrestlerId) => ({ wrestlerId, status })),
        }),
      });
      if (!response.ok) {
        alert("Failed to update attendance");
        return;
      }
      await onRefresh();
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
                  onClick={() => setActiveTeamId(team.id)}
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
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: columns.length === 3 ? "420px 280px 340px" : "420px 280px",
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
                        onClick={readOnly ? undefined : () => void updateStatus(w.id, column.clickStatus)}
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
                                void toggleComingStatus(w, "NOT_COMING");
                              }}
                              style={{
                                border: "1px solid #d0b2b2",
                                borderRadius: 4,
                                background: "#fff7f7",
                                color: "#7a3d3d",
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "1px 6px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                              title="Mark Not Coming"
                            >
                              Not Coming
                            </button>
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
                        {!readOnly && column.key === "no-reply" && (
                          <div style={{ display: "flex", gap: 6, flex: "0 0 auto", whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void updateStatus(w.id, "COMING");
                              }}
                              style={{
                                border: "1px solid #bcd8c1",
                                borderRadius: 4,
                                background: "#e6f6ea",
                                color: "#1d5b2a",
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "1px 6px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                              title="Mark Coming"
                            >
                              Coming
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void updateStatus(w.id, "NOT_COMING");
                              }}
                              style={{
                                border: "1px solid #d0b2b2",
                                borderRadius: 4,
                                background: "#fff7f7",
                                color: "#7a3d3d",
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "1px 6px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                              title="Mark Not Coming"
                            >
                              Not Coming
                            </button>
                          </div>
                        )}
                        {!readOnly && column.key === "not-coming" && (
                          <div style={{ display: "flex", gap: 6, flex: "0 0 auto", whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void updateStatus(w.id, "COMING");
                              }}
                              style={{
                                border: "1px solid #bcd8c1",
                                borderRadius: 4,
                                background: "#e6f6ea",
                                color: "#1d5b2a",
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "1px 6px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                              title="Mark Coming"
                            >
                              Coming
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
