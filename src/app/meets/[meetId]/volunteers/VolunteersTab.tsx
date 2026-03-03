"use client";

import { useEffect, useMemo, useState } from "react";

import { DEFAULT_MAT_RULES } from "@/lib/matRules";

type VolunteerRole = "COACH" | "TABLE_WORKER" | "PARENT";

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
  kids: string[];
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
  const [msg, setMsg] = useState<string>("");
  const [matColors, setMatColors] = useState<Record<number, string>>({});

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setMsg("");
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
  }, [meetId]);

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
    void saveAndSync(next);
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

  const onDropToMat = (matNumber: number) => {
    if (!canEdit || !dragVolunteerId || saving) return;
    setVolunteerMat(dragVolunteerId, matNumber);
    setDragVolunteerId(null);
  };

  const onDropToPool = () => {
    if (!canEdit || !dragVolunteerId || saving) return;
    const dragged = volunteers.find((volunteer) => volunteer.id === dragVolunteerId);
    if (!dragged || !canBeInUnassignedPool(dragged, homeTeamId)) {
      setDragVolunteerId(null);
      return;
    }
    setVolunteerMat(dragVolunteerId, null);
    setDragVolunteerId(null);
  };

  async function saveAndSync(volunteersToSave?: Volunteer[]) {
    if (!canEdit || saving) return;
    const sourceVolunteers = volunteersToSave ?? payload?.volunteers;
    if (!sourceVolunteers) return;
    setSaving(true);
    setMsg("Saving and syncing...");
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
        setMsg(json?.error ?? "Unable to save volunteer assignments.");
        return;
      }
      const moved = typeof json?.sync?.moved === "number" ? json.sync.moved : 0;
      const assigned = typeof json?.sync?.newlyAssigned === "number" ? json.sync.newlyAssigned : 0;
      const cleared = typeof json?.sync?.cleared === "number" ? json.sync.cleared : 0;
      setMsg(`Saved. Synced staff mats: moved ${moved}, assigned ${assigned}, cleared ${cleared}.`);
      onSaved?.();
      setTimeout(() => setMsg(""), 1800);
    } catch {
      setMsg("Unable to save volunteer assignments.");
    } finally {
      setSaving(false);
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
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
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
    .volunteer-chip {
      border: 1px solid #d5dbe2;
      border-radius: 8px;
      background: #f8fafd;
      padding: 6px 8px;
      cursor: grab;
      user-select: none;
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
        <div style={{ fontSize: 13, color: "#4a586a" }}>
          Drag volunteers between mats. Home-team coaches, table workers, and parents can be moved to the Unassigned parents panel. Changes save automatically.
        </div>
      </div>
      {!canEdit && (
        <div className="notice">Read-only mode. Start editing to update volunteer mat assignments.</div>
      )}
      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith("Unable") ? "#b00020" : "#355a2b" }}>
          {msg}
        </div>
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
                  if (!canEdit || saving) return;
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
                  {list.map((volunteer) => (
                    <div
                      key={volunteer.id}
                      className="volunteer-chip"
                      draggable={canEdit && !saving}
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
                      <div className="volunteer-line-2">
                        <span>
                          {volunteer.kids.length > 0 ? volunteer.kids.join(", ") : "none"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="volunteers-pool"
          onDragOver={(event) => {
            if (!canEdit || saving || !dragVolunteerId) return;
            const dragged = volunteers.find((volunteer) => volunteer.id === dragVolunteerId);
            if (!dragged || !canBeInUnassignedPool(dragged, homeTeamId)) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDropToPool();
          }}
        >
          <div className="volunteers-pool-title">Unassigned parents</div>
          <div className="volunteers-list">
            {sortedPool.length === 0 && (
              <div style={{ color: "#748396", fontSize: 12 }}>No unassigned volunteers.</div>
            )}
            {sortedPool.map((volunteer) => (
              <div
                key={`pool-${volunteer.id}`}
                className="volunteer-chip"
                draggable={canEdit && !saving}
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
                <div className="volunteer-line-2">
                  <span>
                    {volunteer.kids.length > 0 ? volunteer.kids.join(", ") : "none"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
