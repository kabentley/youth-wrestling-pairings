"use client";

import { useEffect, useMemo, useState } from "react";

import { DEFAULT_MAT_RULES } from "@/lib/matRules";

type VolunteerRole = "COACH" | "TABLE_WORKER" | "PARENT";

type KidBout = {
  id: string;
  mat: number | null;
  order: number | null;
  boutNumber: string | null;
};

type KidAssignment = {
  id: string;
  name: string;
  bouts: KidBout[];
};

type TeamSummary = {
  id: string;
  name: string;
  symbol?: string | null;
};

type MeetSummary = {
  id: string;
  numMats: number;
  homeTeamId?: string | null;
  teams: TeamSummary[];
};

type Volunteer = {
  id: string;
  displayName: string;
  role: VolunteerRole;
  teamId?: string | null;
  matNumber?: number | null;
  kids: KidAssignment[];
};

type VolunteersPayload = {
  meet: MeetSummary;
  volunteers: Volunteer[];
};

type MatRulesPayload = {
  rules?: Array<{
    matIndex?: number;
    color?: string | null;
  }>;
};

function roleLabel(role: VolunteerRole) {
  if (role === "COACH") return "Coach";
  if (role === "TABLE_WORKER") return "Table Worker";
  return "Parent";
}

function roleRank(role: VolunteerRole) {
  if (role === "COACH") return 0;
  if (role === "TABLE_WORKER") return 1;
  return 2;
}

function normalizeFuzzyText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzyMatch(value: string, query: string) {
  const needle = normalizeFuzzyText(query);
  if (!needle) return true;
  const haystack = normalizeFuzzyText(value);
  if (!haystack) return false;
  if (haystack.includes(needle)) return true;
  let needleIndex = 0;
  for (let i = 0; i < haystack.length && needleIndex < needle.length; i += 1) {
    if (haystack[i] === needle[needleIndex]) needleIndex += 1;
  }
  return needleIndex === needle.length;
}

function canBeInUnassignedPool(volunteer: Volunteer, homeTeamId: string | null) {
  const isHomeTeam = homeTeamId ? volunteer.teamId === homeTeamId : true;
  if (!isHomeTeam) return false;
  return true;
}

export default function VolunteersTab({
  meetId,
  canEdit,
  onSaved,
}: {
  meetId: string;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [payload, setPayload] = useState<VolunteersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragVolunteerId, setDragVolunteerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingBouts, setUpdatingBouts] = useState(false);
  const [dirtyMats, setDirtyMats] = useState<number[]>([]);
  const [poolSearch, setPoolSearch] = useState("");
  const [matColors, setMatColors] = useState<Record<number, string>>({});
  const [pendingMovedCount, setPendingMovedCount] = useState<number | null>(null);
  const [movingVolunteerId, setMovingVolunteerId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setDirtyMats([]);
    setPendingMovedCount(null);
    Promise.all([
      fetch(`/api/meets/${meetId}/volunteers`),
      fetch(`/api/meets/${meetId}/mat-rules`).catch(() => null),
    ])
      .then(async ([volunteersRes, matRulesRes]) => {
        if (!volunteersRes.ok) {
          const json = await volunteersRes.json().catch(() => null);
          throw new Error(json?.error ?? "Unable to load volunteers.");
        }
        const volunteersJson = await volunteersRes.json() as VolunteersPayload;
        let matRulesJson: MatRulesPayload | null = null;
        if (matRulesRes?.ok) {
          matRulesJson = await matRulesRes.json().catch(() => null);
        }
        if (!mounted) return;
        setPayload(volunteersJson);
        if (canEdit) {
          void refreshDirtyMats();
        }
        const colorMap: Record<number, string> = {};
        for (const rule of matRulesJson?.rules ?? []) {
          const matIndex = rule.matIndex;
          const color = rule.color?.trim();
          if (typeof matIndex !== "number") continue;
          if (!color) continue;
          colorMap[matIndex] = color;
        }
        setMatColors(colorMap);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load volunteers.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [meetId, canEdit]);

  const volunteers = payload?.volunteers ?? [];
  const meet = payload?.meet ?? null;
  const numMats = Math.max(1, Math.min(6, meet?.numMats ?? 4));
  const homeTeamId = meet?.homeTeamId ?? null;
  const matSwatchColor = (matNumber: number) => {
    const configured = matColors[matNumber];
    if (configured && configured.trim().length > 0) return configured;
    const preset = DEFAULT_MAT_RULES[(matNumber - 1) % DEFAULT_MAT_RULES.length];
    return preset.color ?? "#f2f2f2";
  };

  async function refreshVolunteersPayload() {
    const volunteersRes = await fetch(`/api/meets/${meetId}/volunteers`);
    if (!volunteersRes.ok) return false;
    const refreshed = await volunteersRes.json() as VolunteersPayload;
    setPayload(refreshed);
    return true;
  }

  function countWrongBoutsForVolunteer(volunteer: Volunteer) {
    const volunteerMat = volunteer.matNumber;
    if (volunteerMat === null || volunteerMat === undefined) return 0;
    let wrongCount = 0;
    for (const kid of volunteer.kids) {
      for (const bout of kid.bouts) {
        if (bout.mat !== volunteerMat) {
          wrongCount += 1;
        }
      }
    }
    return wrongCount;
  }

  async function refreshDirtyMats() {
    if (!canEdit) {
      setDirtyMats([]);
      setPendingMovedCount(null);
      return;
    }
    const fallbackDirty = Array.from({ length: numMats }, (_, idx) => idx + 1);
    try {
      const res = await fetch(`/api/meets/${meetId}/mats/people-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDirtyMats(fallbackDirty);
        setPendingMovedCount(null);
        return;
      }
      const affectedMats = (json as { affectedMats?: unknown } | null)?.affectedMats;
      const nextDirty: number[] = Array.isArray(affectedMats)
        ? affectedMats.filter((mat): mat is number => typeof mat === "number")
        : [];
      setDirtyMats(nextDirty.sort((a, b) => a - b));
      const moved = typeof (json as { moved?: unknown } | null)?.moved === "number"
        ? (json as { moved: number }).moved
        : null;
      setPendingMovedCount(moved);
    } catch {
      setDirtyMats(fallbackDirty);
      setPendingMovedCount(null);
    }
  }

  const setVolunteerMat = (volunteerId: string, matNumber: number | null) => {
    if (!payload) return;
    const next = payload.volunteers.map((volunteer) => {
      if (volunteer.id !== volunteerId) return volunteer;
      const nextMat = matNumber ?? null;
      const currentMat = volunteer.matNumber ?? null;
      if (currentMat === nextMat) return volunteer;
      return { ...volunteer, matNumber: nextMat };
    });
    const changed = next.some((volunteer, index) => volunteer !== payload.volunteers[index]);
    if (!changed) return;
    setPayload({ ...payload, volunteers: next });
    void saveAssignments(next);
  };

  const sortedPool = useMemo(() => {
    return volunteers
      .filter((volunteer) => {
        if ((volunteer.matNumber ?? null) !== null) return false;
        return canBeInUnassignedPool(volunteer, homeTeamId);
      })
      .slice()
      .sort((a, b) => {
        const roleCmp = roleRank(a.role) - roleRank(b.role);
        if (roleCmp !== 0) return roleCmp;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [volunteers, homeTeamId]);

  const filteredPool = useMemo(() => {
    const query = poolSearch.trim();
    if (!query) return sortedPool;
    return sortedPool.filter((volunteer) => {
      const searchable = [
        volunteer.displayName,
        roleLabel(volunteer.role),
        volunteer.kids.map((kid) => kid.name).join(" "),
      ].join(" ");
      return fuzzyMatch(searchable, query);
    });
  }, [sortedPool, poolSearch]);

  const volunteersByMat = useMemo(() => {
    const map = new Map<number, Volunteer[]>();
    for (let mat = 1; mat <= numMats; mat += 1) map.set(mat, []);
    for (const volunteer of volunteers) {
      const mat = volunteer.matNumber ?? null;
      if (!mat || mat < 1 || mat > numMats) continue;
      map.get(mat)?.push(volunteer);
    }
    for (const mat of map.keys()) {
      const sorted = (map.get(mat) ?? []).slice().sort((a, b) => {
        const aHome = a.teamId && homeTeamId ? a.teamId === homeTeamId : false;
        const bHome = b.teamId && homeTeamId ? b.teamId === homeTeamId : false;
        if (aHome !== bHome) return aHome ? -1 : 1;
        const roleCmp = roleRank(a.role) - roleRank(b.role);
        if (roleCmp !== 0) return roleCmp;
        return a.displayName.localeCompare(b.displayName);
      });
      map.set(mat, sorted);
    }
    return map;
  }, [volunteers, numMats, homeTeamId]);
  const kidAssignedMatsById = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const volunteer of volunteers) {
      const volunteerMat = volunteer.matNumber ?? null;
      if (volunteerMat === null) continue;
      for (const kid of volunteer.kids) {
        const mats = map.get(kid.id) ?? new Set<number>();
        mats.add(volunteerMat);
        map.set(kid.id, mats);
      }
    }
    return map;
  }, [volunteers]);
  const kidParentAssignmentsById = useMemo(() => {
    const map = new Map<string, Array<{ volunteerId: string; volunteerName: string; mat: number }>>();
    for (const volunteer of volunteers) {
      const volunteerMat = volunteer.matNumber ?? null;
      if (volunteerMat === null) continue;
      for (const kid of volunteer.kids) {
        const rows = map.get(kid.id) ?? [];
        rows.push({ volunteerId: volunteer.id, volunteerName: volunteer.displayName, mat: volunteerMat });
        map.set(kid.id, rows);
      }
    }
    return map;
  }, [volunteers]);
  const noMatUpdatesNeeded = dirtyMats.length === 0;
  const matchesToMove = pendingMovedCount ?? 0;
  const updateButtonDisabled = saving || updatingBouts || Boolean(movingVolunteerId) || matchesToMove <= 0;
  const updateButtonTooltip =
    matchesToMove <= 0
      ? "No matches to move."
      : noMatUpdatesNeeded
        ? "No detected mat updates yet."
        : undefined;

  const onDropToMat = (matNumber: number) => {
    if (!canEdit || !dragVolunteerId || saving || updatingBouts) return;
    setVolunteerMat(dragVolunteerId, matNumber);
    setDragVolunteerId(null);
  };

  const onDropToPool = () => {
    if (!canEdit || !dragVolunteerId || saving || updatingBouts) return;
    const dragged = volunteers.find((volunteer) => volunteer.id === dragVolunteerId);
    if (!dragged || !canBeInUnassignedPool(dragged, homeTeamId)) {
      setDragVolunteerId(null);
      return;
    }
    setVolunteerMat(dragVolunteerId, null);
    setDragVolunteerId(null);
  };

  async function saveAssignments(volunteersToSave?: Volunteer[]) {
    if (!canEdit || saving) return;
    const sourceVolunteers = volunteersToSave ?? payload?.volunteers;
    if (!sourceVolunteers) return;
    setSaving(true);
    try {
      const assignments = sourceVolunteers.map((volunteer) => ({
        userId: volunteer.id,
        matNumber: volunteer.matNumber ?? null,
      }));
      const res = await fetch(`/api/meets/${meetId}/volunteers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: string } | null)?.error ?? "Unable to save volunteer mat assignments.";
        window.alert(message);
        return;
      }
      void refreshDirtyMats();
    } catch {
      window.alert("Unable to save volunteer mat assignments.");
    } finally {
      setSaving(false);
    }
  }

  async function updateBoutMats() {
    if (!canEdit || saving || updatingBouts || !payload) return;
    setUpdatingBouts(true);
    try {
      const res = await fetch(`/api/meets/${meetId}/mats/people-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dirtyMats.length > 0 ? { matsToReorder: dirtyMats } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: string } | null)?.error ?? "Unable to move matches to volunteer mats.";
        window.alert(message);
        return;
      }
      void refreshDirtyMats();
      await refreshVolunteersPayload();
      onSaved?.();
    } catch {
      window.alert("Unable to move matches to volunteer mats.");
    } finally {
      setUpdatingBouts(false);
    }
  }

  async function moveVolunteerKids(volunteer: Volunteer) {
    if (!canEdit || saving || updatingBouts || movingVolunteerId) return;
    if (volunteer.matNumber === null || volunteer.matNumber === undefined) return;
    const wrongCount = countWrongBoutsForVolunteer(volunteer);
    if (wrongCount === 0) {
      return;
    }
    setMovingVolunteerId(volunteer.id);
    try {
      const res = await fetch(`/api/meets/${meetId}/volunteers/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteerId: volunteer.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: string } | null)?.error ?? "Unable to move this volunteer's kids matches.";
        window.alert(message);
        return;
      }
      await refreshVolunteersPayload();
      void refreshDirtyMats();
      onSaved?.();
    } catch {
      window.alert("Unable to move this volunteer's kids matches.");
    } finally {
      setMovingVolunteerId(null);
    }
  }

  const styles = `
    .volunteers-tab {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .volunteers-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
      padding-left: 8px;
    }
    .volunteers-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .volunteers-help-note {
      font-size: 14px;
      font-weight: 600;
      color: #4f6073;
      flex: 1 1 320px;
      line-height: 1.35;
    }
    .volunteers-btn-wrap {
      display: inline-flex;
    }
    .volunteers-btn {
      border: 1px solid #0b5ecf;
      border-radius: 6px;
      background: #1f78ff;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      cursor: pointer;
    }
    .volunteers-btn:disabled {
      border-color: #cfdae7;
      background: #fff;
      color: #8a97a8;
      opacity: 1;
      cursor: not-allowed;
    }
    .volunteers-grid {
      display: grid;
      grid-template-columns: 3fr 1.3fr;
      gap: 10px;
      min-height: 420px;
    }
    .volunteers-mat-grid {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(${numMats}, minmax(220px, 1fr));
      align-items: start;
    }
    .volunteers-mat-card,
    .volunteers-pool {
      border: 1px solid #dfe3e8;
      border-radius: 10px;
      background: #fff;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 240px;
    }
    .volunteers-pool {
      max-height: calc(100vh - 220px);
      overflow: hidden;
    }
    .volunteers-mat-title,
    .volunteers-pool-title {
      font-weight: 700;
      font-size: 14px;
      color: #203040;
    }
    .volunteers-mat-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .volunteers-mat-swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1px solid #c7cfdb;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
      flex: 0 0 auto;
    }
    .volunteers-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .volunteers-pool .volunteers-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: auto;
      max-width: 100vw;
    }
    .volunteers-pool-search {
      width: 100%;
      border: 1px solid #cfd8e3;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 12px;
      color: #243444;
      background: #fff;
    }
    .volunteer-chip {
      border: 1px solid #d5dbe2;
      border-radius: 8px;
      background: #f8fafd;
      padding: 6px 8px;
      cursor: grab;
      user-select: none;
    }
    .volunteer-chip.clickable-move {
      cursor: pointer;
    }
    .volunteer-chip:active {
      cursor: grabbing;
    }
    .volunteer-line-1 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #1f2f41;
    }
    .volunteer-line-2 {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 2px;
      font-size: 13px;
      color: #59687a;
      line-height: 1.25;
      white-space: normal;
      word-break: break-word;
    }
    .volunteer-kids-bouts {
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .volunteer-kid-row {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 4px;
      font-size: 12px;
      line-height: 1.25;
      color: #4f6073;
    }
    .volunteer-kid-name {
      font-weight: 400;
      color: #2d3c4d;
      margin-right: 2px;
    }
    .volunteer-bout-chip {
      display: inline-flex;
      align-items: center;
      border: 1px solid #cfd8e3;
      border-radius: 999px;
      padding: 1px 7px;
      background: #ffffff;
      color: #233446;
      font-size: 11px;
      font-weight: 600;
    }
    .volunteer-bout-chip.wrong-mat {
      border-color: #d32f2f;
      background: #fdecec;
      color: #a31919;
    }
    .volunteer-bout-chip.conflict-mat {
      border-color: #d7a100;
      background: #fff6d6;
      color: #8a6200;
    }
    .volunteer-bout-chip.unassigned {
      border-color: #d8e0ea;
      background: #f5f7fa;
      color: #708193;
    }
    @media (max-width: 1100px) {
      .volunteers-grid {
        grid-template-columns: 1fr;
      }
      .volunteers-mat-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
    }
  `;

  if (loading) return <p>Loading volunteers...</p>;
  if (error) return <div className="notice">{error}</div>;
  if (!payload) return null;

  return (
    <div className="volunteers-tab">
      <style>{styles}</style>
      <div className="volunteers-toolbar">
        {canEdit && (
          <div className="volunteers-actions">
            <span className="volunteers-btn-wrap" title={updateButtonTooltip}>
              <button
                type="button"
                className="volunteers-btn"
                onClick={() => void updateBoutMats()}
                disabled={updateButtonDisabled}
              >
                {updatingBouts ? "Updating..." : "Move all"}
              </button>
            </span>
          </div>
        )}
        <div className="volunteers-help-note">
          {canEdit
            ? "Drag volunteers to assign mats. Click on cards to move their kids' bouts to their mat. Badge colors: red = wrong mat, yellow = parents on different mats."
            : "Badge colors: red = wrong mat, yellow = parents on different mats."}
        </div>
      </div>
      {!canEdit && (
        <div className="notice">Read-only mode. Start editing to update volunteer mat assignments.</div>
      )}

      <div className="volunteers-grid">
        <div className="volunteers-mat-grid">
          {Array.from({ length: numMats }, (_, idx) => idx + 1).map((matNumber) => {
            const list = volunteersByMat.get(matNumber) ?? [];
            return (
              <div
                key={`volunteer-mat-${matNumber}`}
                className="volunteers-mat-card"
                onDragOver={(event) => {
                  if (!canEdit || saving || updatingBouts) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropToMat(matNumber);
                }}
              >
                <div className="volunteers-mat-title">
                  <span>Mat {matNumber}</span>
                  <span
                    className="volunteers-mat-swatch"
                    style={{ backgroundColor: matSwatchColor(matNumber) }}
                    aria-hidden="true"
                  />
                </div>
                <div className="volunteers-list">
                  {list.map((volunteer) => {
                    const wrongCount = countWrongBoutsForVolunteer(volunteer);
                    const canClickMove =
                      canEdit &&
                      !saving &&
                      !updatingBouts &&
                      !movingVolunteerId &&
                      volunteer.matNumber !== null &&
                      wrongCount > 0;
                    return (
                    <div
                      key={volunteer.id}
                      className={`volunteer-chip${canClickMove ? " clickable-move" : ""}`}
                      draggable={canEdit && !saving && !updatingBouts}
                      onDragStart={(event) => {
                        if (!canEdit) return;
                        event.dataTransfer.effectAllowed = "move";
                        setDragVolunteerId(volunteer.id);
                      }}
                      onDragEnd={() => setDragVolunteerId(null)}
                      onClick={() => {
                        if (!canClickMove) return;
                        void moveVolunteerKids(volunteer);
                      }}
                      title={canClickMove ? `Move ${wrongCount} mismatched bout${wrongCount === 1 ? "" : "s"} for this volunteer's kids` : undefined}
                    >
                      <div className="volunteer-line-1">
                        <span>{volunteer.displayName}</span>
                        <span>{roleLabel(volunteer.role)}</span>
                      </div>
                      {volunteer.kids.length > 0 && (
                        <div className="volunteer-kids-bouts">
                          {volunteer.kids.map((kid) => (
                            <div key={kid.id} className="volunteer-kid-row">
                              <span className="volunteer-kid-name">{kid.name}</span>
                              {kid.bouts.length === 0 ? (
                                <span className="volunteer-bout-chip unassigned">none</span>
                              ) : (
                                kid.bouts.map((bout) => {
                                  const wrongMat =
                                    volunteer.matNumber !== null &&
                                    bout.mat !== null &&
                                    bout.mat !== volunteer.matNumber;
                                  const kidAssignedMats = kidAssignedMatsById.get(kid.id);
                                  const hasMultiParentMatConflict = (kidAssignedMats?.size ?? 0) > 1;
                                  const conflictMat = wrongMat && hasMultiParentMatConflict;
                                  const parentAssignments = kidParentAssignmentsById.get(kid.id) ?? [];
                                  const otherParent = parentAssignments.find(
                                    (entry) => entry.volunteerId !== volunteer.id && entry.mat !== volunteer.matNumber,
                                  ) ?? parentAssignments.find((entry) => entry.volunteerId !== volunteer.id);
                                  return (
                                    <span
                                      key={`${kid.id}-${bout.id}`}
                                      className={`volunteer-bout-chip${conflictMat ? " conflict-mat" : wrongMat ? " wrong-mat" : bout.mat === null ? " unassigned" : ""}`}
                                      title={
                                        conflictMat
                                          ? `${kid.name} has parents on different mats. ${otherParent ? `${otherParent.volunteerName} is on mat ${otherParent.mat}.` : ""}`.trim()
                                          : wrongMat
                                            ? `Assigned to Mat ${bout.mat}, volunteer is on Mat ${volunteer.matNumber}.`
                                            : undefined
                                      }
                                    >
                                      {bout.boutNumber ?? "Unassigned"}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="volunteers-pool"
          onDragOver={(event) => {
            if (!canEdit || saving || updatingBouts || !dragVolunteerId) return;
            const dragged = volunteers.find((volunteer) => volunteer.id === dragVolunteerId);
            if (!dragged || !canBeInUnassignedPool(dragged, homeTeamId)) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDropToPool();
          }}
        >
          <div className="volunteers-pool-title">Unassigned</div>
          <input
            type="text"
            className="volunteers-pool-search"
            value={poolSearch}
            onChange={(event) => setPoolSearch(event.target.value)}
            placeholder="Search"
          />
          <div className="volunteers-list">
            {sortedPool.length === 0 && (
              <div style={{ color: "#748396", fontSize: 12 }}>No unassigned volunteers.</div>
            )}
            {sortedPool.length > 0 && filteredPool.length === 0 && (
              <div style={{ color: "#748396", fontSize: 12 }}>No matches.</div>
            )}
            {filteredPool.map((volunteer) => (
              <div
                key={`pool-${volunteer.id}`}
                className="volunteer-chip"
                draggable={canEdit && !saving && !updatingBouts}
                onDragStart={(event) => {
                  if (!canEdit) return;
                  event.dataTransfer.effectAllowed = "move";
                  setDragVolunteerId(volunteer.id);
                }}
                onDragEnd={() => setDragVolunteerId(null)}
              >
                <div className="volunteer-line-1">
                  <span>{volunteer.displayName}</span>
                  <span>{roleLabel(volunteer.role)}</span>
                </div>
                {volunteer.kids.length > 0 && (
                  <div className="volunteer-kids-bouts">
                    {volunteer.kids.map((kid) => (
                      <div key={kid.id} className="volunteer-kid-row">
                        <span className="volunteer-kid-name">{kid.name}</span>
                        {kid.bouts.length === 0 ? (
                          <span className="volunteer-bout-chip unassigned">none</span>
                        ) : (
                          kid.bouts.map((bout) => (
                            <span
                              key={`${kid.id}-${bout.id}`}
                              className={`volunteer-bout-chip${bout.mat === null ? " unassigned" : ""}`}
                            >
                              {bout.boutNumber ?? "Unassigned"}
                            </span>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
