"use client";

import { useEffect, useRef, useState } from "react";

import ColorPicker from "@/components/ColorPicker";

type TeamRow = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  address?: string | null;
  hasLogo?: boolean;
  headCoachId?: string | null;
  headCoach?: { id: string; username: string } | null;
  coaches: { id: string; username: string }[];
};

export default function LeagueSection() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [msg, setMsg] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [leagueHasLogo, setLeagueHasLogo] = useState(false);
  const [leagueWebsite, setLeagueWebsite] = useState("");
  const [colorEdits, setColorEdits] = useState<Record<string, string>>({});
  const [teamNameEdits, setTeamNameEdits] = useState<Record<string, string | undefined>>({});
  const [teamSymbolEdits, setTeamSymbolEdits] = useState<Record<string, string | undefined>>({});
  const [teamHeadCoachEdits, setTeamHeadCoachEdits] = useState<Record<string, string | undefined>>({});
  const [leagueLogoVersion, setLeagueLogoVersion] = useState(0);
  const [teamLogoVersions, setTeamLogoVersions] = useState<Record<string, number>>({});
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importConfirm, setImportConfirm] = useState("");
  const [importError, setImportError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const detailTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const colorTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const leagueTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  async function load() {
    const [tRes, lRes] = await Promise.all([fetch("/api/teams"), fetch("/api/league")]);
    if (tRes.ok) setTeams(await tRes.json());
    if (lRes.ok) {
      const league = await lRes.json();
      setLeagueName(league.name ?? "");
      setLeagueHasLogo(Boolean(league.hasLogo));
      setLeagueWebsite(league.website ?? "");
    }
  }

  async function addTeam() {
    setMsg("");
    if (!name.trim() || !symbol.trim()) return;
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, symbol }),
    });
    if (!res.ok) {
      setMsg("Unable to add team.");
      return;
    }
    setName("");
    setSymbol("");
    await load();
  }

  async function removeTeam(teamId: string) {
    setMsg("");
    const ok = confirm("Delete this team and all related data?");
    if (!ok) return;
    const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg("Unable to delete team.");
      return;
    }
    await load();
  }

  async function uploadLogo(teamId: string, file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/teams/${teamId}/logo`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = (json as { error?: string }).error;
      setMsg(error ?? "Logo upload failed.");
      return;
    }
    setTeamLogoVersions((prev) => ({ ...prev, [teamId]: Date.now() }));
    await load();
  }

  async function updateTeamColor(teamId: string, color: string) {
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (!res.ok) {
      setMsg("Unable to update team color.");
      return;
    }
    await load();
  }

  async function updateTeamDetails(teamId: string, name: string, symbol: string, headCoachId: string | null) {
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, symbol, headCoachId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = (json as { error?: string }).error;
      setMsg(error ?? "Unable to update team.");
      return;
    }
    setTeamNameEdits((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setTeamSymbolEdits((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setTeamHeadCoachEdits((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    await load();
  }

  function getTeamName(team: TeamRow) {
    return teamNameEdits[team.id] ?? team.name;
  }

  function getTeamSymbol(team: TeamRow) {
    return teamSymbolEdits[team.id] ?? team.symbol;
  }

  function getTeamHeadCoachId(team: TeamRow) {
    return teamHeadCoachEdits[team.id] ?? team.headCoachId ?? "";
  }

function normalizeHeadCoachId(value: string | null | undefined) {
    if (!value) return "";
    return value.trim();
  }

  async function saveLeague(nextName = leagueName, nextWebsite = leagueWebsite) {
    const res = await fetch("/api/league", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName, website: nextWebsite }),
    });
    if (!res.ok) {
      setMsg("Unable to save league.");
      return;
    }
    await load();
  }

  async function uploadLeagueLogo(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/league/logo", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = (json as { error?: string }).error;
      setMsg(error ?? "League logo upload failed.");
      return;
    }
    setLeagueLogoVersion(Date.now());
    await load();
  }

  function scheduleTeamDetailsSave(teamId: string, name: string, symbol: string, headCoachId: string | null) {
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim();
    if (cleanName.length < 2 || cleanSymbol.length < 2 || cleanSymbol.length > 4) return;
    const existingDetailTimer = detailTimers.current[teamId];
    if (existingDetailTimer) clearTimeout(existingDetailTimer);
    detailTimers.current[teamId] = setTimeout(() => {
      void updateTeamDetails(teamId, cleanName, cleanSymbol, headCoachId);
    }, 500);
  }

  function scheduleColorSave(teamId: string, color: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    const existingColorTimer = colorTimers.current[teamId];
    if (existingColorTimer) clearTimeout(existingColorTimer);
    colorTimers.current[teamId] = setTimeout(() => {
      void updateTeamColor(teamId, color);
    }, 300);
  }

  function scheduleLeagueSave(nextName: string, nextWebsite: string) {
    const existingLeagueTimer = leagueTimers.current.league;
    if (existingLeagueTimer) clearTimeout(existingLeagueTimer);
    leagueTimers.current.league = setTimeout(() => {
      void saveLeague(nextName, nextWebsite);
    }, 500);
  }

  function setTeamColor(teamId: string, color: string) {
    setColorEdits((prev) => ({ ...prev, [teamId]: color }));
    scheduleColorSave(teamId, color);
  }

  function closeResetModal() {
    setShowResetModal(false);
    setResetConfirm("");
    setResetError("");
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportConfirm("");
    setImportError("");
    setImportFile(null);
  }

  async function confirmYearlyReset() {
    if (resetConfirm.trim().toUpperCase() !== "RESET") {
      setResetError('Type "RESET" to confirm.');
      return;
    }
    setIsResetting(true);
    setResetError("");
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const error = (json as { error?: string }).error;
        throw new Error(error ?? "Unable to reset league data.");
      }
      await load();
      setMsg("League data cleared for the new year.");
      closeResetModal();
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Unable to reset league data.");
    } finally {
      setIsResetting(false);
    }
  }

  async function exportTeamsAndRosters() {
    setMsg("");
    setIsExporting(true);
    try {
      const res = await fetch("/api/admin/export/teams");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to export teams.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const safeLeague = (leagueName || "league").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 48);
      anchor.href = url;
      anchor.download = `${safeLeague}_${stamp}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to export teams.");
    } finally {
      setIsExporting(false);
    }
  }

  async function importTeamsAndRosters(file: File | null) {
    if (!file) {
      setImportError("Choose a zip file to import.");
      return;
    }
    setMsg("");
    setIsImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/import/teams", { method: "POST", body: form });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to import teams.");
      }
      await load();
      setMsg("Import complete.");
      closeImportModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import teams.";
      setImportError(message);
      setMsg(message);
    } finally {
      setIsImporting(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!showResetModal) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isResetting) {
        closeResetModal();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [showResetModal, isResetting]);

  return (
    <>
      <div className="admin-card">
        <h3>League</h3>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-name">
              League Name
            </label>
            <input
              id="league-name"
              value={leagueName}
              onChange={(e) => {
                const next = e.target.value;
                setLeagueName(next);
                scheduleLeagueSave(next, leagueWebsite);
              }}
              placeholder="League name"
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-website">
              League Website
            </label>
            <input
              id="league-website"
              value={leagueWebsite}
              onChange={(e) => {
                const next = e.target.value;
                setLeagueWebsite(next);
                scheduleLeagueSave(leagueName, next);
              }}
              placeholder="https://league.example.com"
            />
          </div>
          <div className="admin-field admin-row-tight">
            <span className="admin-label">League Logo</span>
            <div className="logo-row" style={{ alignItems: "center", gap: 12 }}>
              <div className="logo-cell" style={{ marginRight: "auto" }}>
                <input
                  id="league-logo-file"
                  className="file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => {
                    void uploadLeagueLogo(e.target.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                />
                <label className="logo-button" htmlFor="league-logo-file">
                  {leagueHasLogo ? (
                    <img src={`/api/league/logo/file?v=${leagueLogoVersion}`} alt="League logo" className="admin-logo" />
                  ) : (
                    <span className="admin-muted">Set Logo</span>
                  )}
                </label>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                className="admin-btn"
                onClick={exportTeamsAndRosters}
                disabled={isExporting}
              >
                {isExporting ? "Exporting..." : "Export Teams + Rosters"}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={() => {
                  setShowImportModal(true);
                  setImportConfirm("");
                  setImportError("");
                  setImportFile(null);
                }}
              >
                Import Teams + Rosters
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={() => {
                  setShowResetModal(true);
                  setResetConfirm("");
                  setResetError("");
                }}
              >
                Reset For New Year
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h3>Teams</h3>
        <div className="admin-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol (2-4)" className="admin-input-sm" />
          <button className="admin-btn" onClick={addTeam}>
            Add Team
          </button>
        </div>
        {msg && <div className="admin-error">{msg}</div>}

        <div className="admin-table">
          <table cellPadding={6}>
            <thead>
              <tr>
                <th>Logo</th>
                <th>Symbol</th>
                <th>Team</th>
                <th>Color</th>
                <th>Head Coach</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="logo-cell">
                      <input
                        id={`team-logo-file-${t.id}`}
                        className="file-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => {
                          void uploadLogo(t.id, e.target.files?.[0] ?? null);
                          e.currentTarget.value = "";
                        }}
                      />
                      <label className="logo-button" htmlFor={`team-logo-file-${t.id}`}>
                        {t.hasLogo ? (
                          <img
                            src={`/api/teams/${t.id}/logo/file?v=${teamLogoVersions[t.id] ?? 0}`}
                            alt={`${t.name} logo`}
                            className="admin-team-logo"
                          />
                        ) : (
                          <span className="admin-muted">Set Logo</span>
                        )}
                      </label>
                    </div>
                  </td>
                  <td>
                    <input
                      value={getTeamSymbol(t)}
                      onChange={(e) => {
                        const nextSymbol = e.target.value;
                        setTeamSymbolEdits((prev) => ({ ...prev, [t.id]: nextSymbol }));
                        scheduleTeamDetailsSave(
                          t.id,
                          getTeamName(t),
                          nextSymbol,
                          normalizeHeadCoachId(getTeamHeadCoachId(t)),
                        );
                      }}
                      className="admin-input-sm"
                    />
                  </td>
                  <td>
                    <input
                      value={getTeamName(t)}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        setTeamNameEdits((prev) => ({ ...prev, [t.id]: nextName }));
                        scheduleTeamDetailsSave(
                          t.id,
                          nextName,
                          getTeamSymbol(t),
                          normalizeHeadCoachId(getTeamHeadCoachId(t)),
                        );
                      }}
                    />
                  </td>
                  <td>
                    <div className="color-cell">
                      <ColorPicker
                        value={colorEdits[t.id] ?? t.color}
                        onChange={(next) => setTeamColor(t.id, next)}
                        idPrefix={`team-color-${t.id}`}
                        buttonClassName="color-swatch"
                        buttonStyle={{ backgroundColor: colorEdits[t.id] ?? t.color }}
                        buttonAriaLabel={`Choose color for ${t.name}`}
                        showNativeColorInput
                      />
                    </div>
                  </td>
              <td>
                <select
                  value={getTeamHeadCoachId(t)}
                  onChange={(e) => {
                    const nextHeadCoachId = e.target.value;
                    setTeamHeadCoachEdits((prev) => ({ ...prev, [t.id]: nextHeadCoachId }));
                    scheduleTeamDetailsSave(
                      t.id,
                      getTeamName(t),
                      getTeamSymbol(t),
                      normalizeHeadCoachId(nextHeadCoachId),
                    );
                  }}
                >
                  <option value="">Select head coach</option>
                  {t.coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.username}
                    </option>
                  ))}
                  {t.headCoach && !t.coaches.some((coach) => coach.id === t.headCoach?.id) && (
                    <option value={t.headCoach.id}>{t.headCoach.username}</option>
                  )}
                </select>
                {!t.coaches.length && (
                  <div className="admin-muted" style={{ marginTop: 4 }}>
                    No coaches assigned yet.
                  </div>
                )}
              </td>
                  <td className="admin-actions">
                    <button className="admin-btn admin-btn-danger" onClick={() => removeTeam(t.id)}>
                      Delete Team
                    </button>
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr>
                  <td colSpan={6}>No teams yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showResetModal && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={() => {
            if (isResetting) return;
            closeResetModal();
          }}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="reset-title">Reset For New Year</h4>
            <p className="reset-message">
              This will permanently delete every meet and clear all team rosters.
            </p>
            <p className="reset-message">
              Type{" "}
              <span className="reset-confirm-term">
                RESET
              </span>{" "}
              to confirm.
            </p>
            <input
              className="reset-confirm-input"
              placeholder="Type RESET to confirm"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              disabled={isResetting}
            />
            {resetError && <div className="reset-error">{resetError}</div>}
            <div className="reset-actions">
              <button type="button" className="admin-btn admin-btn-ghost" onClick={closeResetModal} disabled={isResetting}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={confirmYearlyReset}
                disabled={isResetting || resetConfirm.trim().toUpperCase() !== "RESET"}
              >
                {isResetting ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showImportModal && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={() => {
            if (isImporting) return;
            closeImportModal();
          }}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="import-title">Import Teams + Rosters</h4>
            <p className="reset-message">
              This will clear all existing rosters before importing the zip.
            </p>
            <p className="reset-message">
              Type{" "}
              <span className="reset-confirm-term">
                IMPORT
              </span>{" "}
              to confirm.
            </p>
            <input
              className="reset-confirm-input"
              placeholder="Type IMPORT to confirm"
              value={importConfirm}
              onChange={(e) => setImportConfirm(e.target.value)}
              disabled={isImporting}
            />
            <input
              className="reset-confirm-input"
              type="file"
              accept=".zip"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              disabled={isImporting}
            />
            {importError && <div className="reset-error">{importError}</div>}
            <div className="reset-actions">
              <button type="button" className="admin-btn admin-btn-ghost" onClick={closeImportModal} disabled={isImporting}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={() => void importTeamsAndRosters(importFile)}
                disabled={isImporting || importConfirm.trim().toUpperCase() !== "IMPORT"}
              >
                {isImporting ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
