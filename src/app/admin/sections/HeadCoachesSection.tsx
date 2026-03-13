"use client";

import { useEffect, useState } from "react";

import CreateUserModal from "@/app/admin/components/CreateUserModal";
import { adjustTeamTextColor } from "@/lib/contrastText";

type TeamRow = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  hasLogo: boolean;
  headCoachId: string | null;
  headCoach: {
    id: string;
    username: string;
    name?: string | null;
  } | null;
};

type CoachRow = {
  id: string;
  username: string;
  name?: string | null;
  teamId: string | null;
  teamSymbol: string | null;
  headCoachTeamId: string | null;
  headCoachTeamSymbol: string | null;
};

function formatCoachLabel(coach: CoachRow) {
  const name = coach.name?.trim();
  const base = name ? `${name} (@${coach.username})` : `@${coach.username}`;
  return base;
}

function formatCurrentHeadCoach(team: TeamRow) {
  if (!team.headCoach) return "None";
  const name = team.headCoach.name?.trim();
  return name ? `${name} (@${team.headCoach.username})` : `@${team.headCoach.username}`;
}

export default function HeadCoachesSection() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [selectedCoachByTeam, setSelectedCoachByTeam] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [createUserTeam, setCreateUserTeam] = useState<TeamRow | null>(null);
  const [msg, setMsg] = useState("");

  function applyHeadCoachUpdate(
    teamId: string,
    coachId: string | null,
    headCoach: TeamRow["headCoach"],
  ) {
    setTeams((prev) =>
      prev.map((team) => {
        if (coachId && team.id !== teamId && team.headCoachId === coachId) {
          return { ...team, headCoachId: null, headCoach: null };
        }
        if (team.id !== teamId) return team;
        return {
          ...team,
          headCoachId: coachId,
          headCoach,
        };
      })
    );
    setSelectedCoachByTeam((prev) => {
      const next = { ...prev };
      if (coachId) {
        for (const team of teams) {
          if (team.id !== teamId && team.headCoachId === coachId) {
            next[team.id] = "";
          }
        }
      }
      next[teamId] = coachId ?? "";
      return next;
    });
  }

  async function load(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const res = await fetch("/api/admin/head-coaches");
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(typeof payload?.error === "string" ? payload.error : "Unable to load head coaches.");
        return;
      }
      const nextTeams = Array.isArray(payload?.teams) ? payload.teams as TeamRow[] : [];
      const nextCoaches = Array.isArray(payload?.coaches) ? payload.coaches as CoachRow[] : [];
      setTeams(nextTeams);
      setCoaches(nextCoaches);
      setSelectedCoachByTeam(
        Object.fromEntries(nextTeams.map((team) => [team.id, team.headCoachId ?? ""]))
      );
    } catch {
      setMsg("Unable to load head coaches.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveHeadCoach(teamId: string, coachId: string, previousCoachId: string) {
    setMsg("");
    setSavingTeamId(teamId);
    try {
      const res = await fetch("/api/admin/head-coaches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, coachId: coachId || null }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(typeof payload?.error === "string" ? payload.error : "Unable to update head coach.");
        setSelectedCoachByTeam((prev) => ({ ...prev, [teamId]: previousCoachId }));
        return;
      }
      applyHeadCoachUpdate(teamId, payload?.headCoachId ?? null, payload?.headCoach ?? null);
      setMsg("Head coach updated.");
    } catch {
      setMsg("Unable to update head coach.");
      setSelectedCoachByTeam((prev) => ({ ...prev, [teamId]: previousCoachId }));
    } finally {
      setSavingTeamId(null);
    }
  }

  return (
    <div className="admin-card" style={{ width: "fit-content", maxWidth: "100%" }}>
      <div className="admin-header" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 24 }}>
          <h3 style={{ margin: 0 }}>Head Coaches</h3>
          <span
            style={{
              minWidth: 180,
              color: "#c62828",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {msg}
          </span>
        </div>
      </div>
      <div className="admin-table" style={{ width: "fit-content", maxWidth: "100%" }}>
        <table className="head-coaches-table" cellPadding={0} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 72 }}>Symbol</th>
              <th style={{ width: 72 }}>Logo</th>
              <th>Team</th>
              <th>Current Head Coach</th>
              <th>Assign Head Coach</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Loading...</td>
              </tr>
            ) : (
              <>
                {teams.map((team) => {
                  const selectedCoachId = selectedCoachByTeam[team.id] ?? "";
                  const availableCoaches = coaches.filter((coach) => coach.teamId === team.id);
                  return (
                    <tr key={team.id}>
                      <td
                        style={{
                          width: 72,
                          whiteSpace: "nowrap",
                          textAlign: "center",
                          color: adjustTeamTextColor(team.color),
                          fontWeight: 700,
                        }}
                      >
                        {team.symbol}
                      </td>
                      <td style={{ width: 72 }}>
                        <div className="logo-cell">
                          {team.hasLogo ? (
                            <img
                              src={`/api/teams/${team.id}/logo/file`}
                              alt={`${team.name} logo`}
                              className="admin-team-logo"
                              style={{ width: 32, height: 32 }}
                            />
                          ) : (
                            <span className="admin-muted">No logo</span>
                          )}
                        </div>
                      </td>
                      <td style={{ width: 320, minWidth: 320, maxWidth: 320 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: adjustTeamTextColor(team.color),
                            fontWeight: 700,
                          }}
                          title={team.name}
                        >
                          {team.name}
                        </div>
                      </td>
                      <td style={{ width: 300, minWidth: 300, maxWidth: 300 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={formatCurrentHeadCoach(team)}
                        >
                          {formatCurrentHeadCoach(team)}
                        </div>
                      </td>
                      <td style={{ width: 320, minWidth: 320 }}>
                        <select
                          value={selectedCoachId}
                          onChange={(event) => {
                            const nextCoachId = event.target.value;
                            const previousCoachId = selectedCoachId;
                            setSelectedCoachByTeam((prev) => ({ ...prev, [team.id]: nextCoachId }));
                            void saveHeadCoach(team.id, nextCoachId, previousCoachId);
                          }}
                          disabled={savingTeamId === team.id}
                        >
                          <option value="">None</option>
                          {availableCoaches.map((coach) => (
                            <option key={coach.id} value={coach.id}>
                              {formatCoachLabel(coach)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ verticalAlign: "middle" }}>
                        <div className="admin-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            className="admin-btn admin-btn-ghost teams-action-btn"
                            onClick={() => setCreateUserTeam(team)}
                            disabled={savingTeamId === team.id}
                          >
                            Create Account
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={6}>No teams yet.</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      <CreateUserModal
        isOpen={Boolean(createUserTeam)}
        teams={teams.map((team) => ({ id: team.id, name: team.name, symbol: team.symbol }))}
        defaultTeamId={createUserTeam?.id ?? ""}
        defaultRole="COACH"
        lockTeamSelection
        lockRoleSelection
        onClose={() => setCreateUserTeam(null)}
        onCreated={async (user) => {
          if (!createUserTeam?.id || !user.id) {
            return;
          }
          const res = await fetch("/api/admin/head-coaches", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamId: createUserTeam.id, coachId: user.id }),
          });
          const payload = await res.json().catch(() => null);
          if (!res.ok) {
            setMsg(typeof payload?.error === "string" ? payload.error : "Account created, but head coach assignment failed.");
            setCoaches((prev) => {
              if (prev.some((coach) => coach.id === user.id)) return prev;
              return [
                ...prev,
                {
                  id: user.id,
                  username: user.username ?? "",
                  name: user.name ?? null,
                  teamId: createUserTeam.id,
                  teamSymbol: createUserTeam.symbol,
                  headCoachTeamId: null,
                  headCoachTeamSymbol: null,
                },
              ];
            });
            return;
          }
          setCoaches((prev) => {
            if (prev.some((coach) => coach.id === user.id)) return prev;
            return [
              ...prev,
              {
                id: user.id,
                username: user.username ?? "",
                name: user.name ?? null,
                teamId: createUserTeam.id,
                teamSymbol: createUserTeam.symbol,
                headCoachTeamId: createUserTeam.id,
                headCoachTeamSymbol: createUserTeam.symbol,
              },
            ];
          });
          applyHeadCoachUpdate(createUserTeam.id, payload?.headCoachId ?? user.id, payload?.headCoach ?? null);
          setMsg("Account created and assigned as head coach.");
        }}
      />
      <style jsx>{`
        .head-coaches-table th,
        .head-coaches-table td {
          padding: 4px 6px;
          vertical-align: middle;
          line-height: 1.15;
        }
      `}</style>
    </div>
  );
}
