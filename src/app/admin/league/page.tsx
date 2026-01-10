"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
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

export default function AdminLeaguePage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [leagueHasLogo, setLeagueHasLogo] = useState(false);
  const [leagueWebsite, setLeagueWebsite] = useState("");
  const [colorEdits, setColorEdits] = useState<Record<string, string>>({});
  const [teamNameEdits, setTeamNameEdits] = useState<Record<string, string>>({});
  const [teamSymbolEdits, setTeamSymbolEdits] = useState<Record<string, string>>({});
  const [teamHeadCoachEdits, setTeamHeadCoachEdits] = useState<Record<string, string>>({});
  const [leagueLogoVersion, setLeagueLogoVersion] = useState(0);
  const [teamLogoVersions, setTeamLogoVersions] = useState<Record<string, number>>({});
  const detailTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const colorTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const leagueTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
  ];

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
      body: JSON.stringify({ name, symbol, address }),
    });
    if (!res.ok) {
      setMsg("Unable to add team.");
      return;
    }
    setName("");
    setSymbol("");
    setAddress("");
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
      setMsg(json?.error ?? "Logo upload failed.");
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
      setMsg(json?.error ?? "Unable to update team.");
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
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
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
      setMsg(json?.error ?? "League logo upload failed.");
      return;
    }
    setLeagueLogoVersion(Date.now());
    await load();
  }

  function scheduleTeamDetailsSave(teamId: string, name: string, symbol: string, headCoachId: string | null) {
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim();
    if (cleanName.length < 2 || cleanSymbol.length < 2 || cleanSymbol.length > 4) return;
    if (detailTimers.current[teamId]) clearTimeout(detailTimers.current[teamId]);
    detailTimers.current[teamId] = setTimeout(() => {
      void updateTeamDetails(teamId, cleanName, cleanSymbol, headCoachId);
    }, 500);
  }

  function scheduleColorSave(teamId: string, color: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    if (colorTimers.current[teamId]) clearTimeout(colorTimers.current[teamId]);
    colorTimers.current[teamId] = setTimeout(() => {
      void updateTeamColor(teamId, color);
    }, 300);
  }

  function scheduleLeagueSave(nextName: string, nextWebsite: string) {
    if (leagueTimers.current.league) clearTimeout(leagueTimers.current.league);
    leagueTimers.current.league = setTimeout(() => {
      void saveLeague(nextName, nextWebsite);
    }, 500);
  }

  function setTeamColor(teamId: string, color: string) {
    setColorEdits((prev) => ({ ...prev, [teamId]: color }));
    scheduleColorSave(teamId, color);
  }

  useEffect(() => { void load(); }, []);
  if (!session) {
    return (
      <main className="admin">
        <style>{adminStyles}</style>
        <div className="admin-shell">
          <h1 className="admin-title">League Setup</h1>
          <div className="admin-card">
            <p>You must sign in.</p>
            <a className="admin-link" href="/auth/signin">Sign in</a>
          </div>
        </div>
      </main>
    );
  }

  if (role !== "ADMIN") {
    return (
      <main className="admin">
        <style>{adminStyles}</style>
        <div className="admin-shell">
          <h1 className="admin-title">League Setup</h1>
          <div className="admin-card">
            <p>Access denied.</p>
            <a className="admin-link" href="/">Back</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin">
      <style>{adminStyles}</style>
      <div className="admin-shell">
        <AppHeader links={headerLinks} />
        <div className="admin-header">
          <h1 className="admin-title">League Setup</h1>
        </div>
        <div className="admin-nav">
          <a className="admin-link" href="/admin/users">Users</a>
          <span className="admin-link admin-link-active" aria-current="page">League & Teams</span>
        </div>
        <div className="admin-card">
          <h3>League</h3>
          <div className="admin-row">
            <label className="admin-label" htmlFor="league-name">League Name</label>
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
          <div className="admin-row">
            <label className="admin-label" htmlFor="league-website">League Website</label>
            <input
              id="league-website"
              value={leagueWebsite}
              onChange={(e) => {
                const next = e.target.value;
                setLeagueWebsite(next);
                scheduleLeagueSave(leagueName, next);
              }}
              placeholder="https://league.example.com"
              style={{ minWidth: 360 }}
            />
          </div>
          <div className="admin-row admin-row-tight">
            <div className="logo-cell">
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
          </div>
        </div>

        <div className="admin-card">
          <h3>Teams</h3>
          <div className="admin-row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol (2-4)" className="admin-input-sm" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" style={{ minWidth: 260 }} />
            <button className="admin-btn" onClick={addTeam}>Add Team</button>
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
                {teams.map(t => (
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
                            <img src={`/api/teams/${t.id}/logo/file?v=${teamLogoVersions[t.id] ?? 0}`} alt={`${t.name} logo`} className="admin-team-logo" />
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
                        {t.headCoach && !t.coaches.some(coach => coach.id === t.headCoach?.id) && (
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
                      <button className="admin-btn admin-btn-danger" onClick={() => removeTeam(t.id)}>Delete Team</button>
                    </td>
                  </tr>
                ))}
                {teams.length === 0 && (
                  <tr><td colSpan={6}>No teams yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="admin-footer"></p>
      </div>
    </main>
  );
}

const adminStyles = `
  @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
  :root {
    --bg: #eef1f4;
    --card: #ffffff;
    --ink: #1d232b;
    --muted: #5a6673;
    --accent: #1e88e5;
    --line: #d5dbe2;
    --danger: #c62828;
  }
  .admin {
    min-height: 100vh;
    background: var(--bg);
    color: var(--ink);
    font-family: "Source Sans 3", Arial, sans-serif;
    padding: 28px 18px 40px;
  }
  .admin-shell {
    max-width: 1100px;
    margin: 0 auto;
  }
  .admin-title {
    font-family: "Oswald", Arial, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin: 0;
  }
  .admin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .admin-nav {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .admin-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 18px;
  }
  .admin-card h3 {
    margin-top: 0;
  }
  .admin-label {
    font-size: 12px;
    color: var(--muted);
  }
  .admin-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .admin-row-tight {
    margin-top: 10px;
  }
  .admin input,
  .admin select {
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 14px;
  }
  .admin input[type="file"] {
    padding: 6px;
  }
  .color-cell {
    position: relative;
  }
  .logo-cell {
    position: relative;
  }
  .logo-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--line);
    border-radius: 6px;
    padding: 6px;
    background: #f7f9fb;
    cursor: pointer;
  }
  .file-input {
    display: none;
  }
  .logo-popover {
    position: absolute;
    z-index: 20;
    top: 30px;
    left: 0;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
    min-width: 200px;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
    display: grid;
    gap: 8px;
  }
  .color-actions {
    display: flex;
    gap: 8px;
  }
  .color-input {
    width: 44px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: transparent;
  }
  .admin-input-sm {
    width: 120px;
  }
  .admin-btn {
    border: 0;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
  }
  .admin-btn-ghost {
    background: #f2f5f8;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .admin-btn-danger {
    background: var(--danger);
  }
  .admin-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .admin-link-active {
    color: var(--ink);
    background: #f2f5f8;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 10px;
  }
  .admin-error {
    color: #b00020;
    margin: 10px 0;
  }
  .admin-table {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: visible;
    background: #fff;
    margin-top: 12px;
  }
  .admin table {
    width: 100%;
    border-collapse: collapse;
  }
  .admin thead {
    background: #f7f9fb;
    text-align: left;
  }
  .admin th,
  .admin td {
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }
  .admin tbody tr:last-child td {
    border-bottom: 0;
  }
  .admin-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .admin-logo {
    width: 64px;
    height: 64px;
    object-fit: contain;
  }
  .admin-team-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
  .admin-muted {
    font-size: 12px;
    color: var(--muted);
  }
  .admin-footer {
    margin-top: 12px;
  }
  @media (max-width: 900px) {
    .admin-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
`;
