"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type TeamRow = { id: string; name: string; symbol: string; color: string; hasLogo?: boolean };

export default function AdminLeaguePage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [msg, setMsg] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [leagueHasLogo, setLeagueHasLogo] = useState(false);

  async function load() {
    const [tRes, lRes] = await Promise.all([fetch("/api/teams"), fetch("/api/league")]);
    if (tRes.ok) setTeams(await tRes.json());
    if (lRes.ok) {
      const league = await lRes.json();
      setLeagueName(league.name ?? "");
      setLeagueHasLogo(Boolean(league.hasLogo));
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
      setMsg("Logo upload failed.");
      return;
    }
    await load();
  }

  async function clearLogo(teamId: string) {
    const res = await fetch(`/api/teams/${teamId}/logo`, { method: "DELETE" });
    if (!res.ok) {
      setMsg("Unable to clear logo.");
      return;
    }
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

  async function saveLeague() {
    const res = await fetch("/api/league", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: leagueName }),
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
      setMsg("League logo upload failed.");
      return;
    }
    await load();
  }

  async function clearLeagueLogo() {
    const res = await fetch("/api/league/logo", { method: "DELETE" });
    if (!res.ok) {
      setMsg("Unable to clear league logo.");
      return;
    }
    await load();
  }

  useEffect(() => { void load(); }, []);

  if (!session) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>League Setup</h2>
        <p>You must sign in.</p>
        <a href="/auth/signin">Sign in</a>
      </main>
    );
  }

  if (role !== "ADMIN") {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>League Setup</h2>
        <p>Access denied.</p>
        <a href="/">Back</a>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>League Setup</h2>
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>League</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            placeholder="League name"
          />
          <button onClick={saveLeague}>Save</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
          {leagueHasLogo ? (
            <img src="/api/league/logo/file" alt="League logo" style={{ width: 64, height: 64, objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 12, opacity: 0.7 }}>No logo</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => uploadLeagueLogo(e.target.files?.[0] ?? null)}
          />
          <button onClick={clearLeagueLogo} disabled={!leagueHasLogo}>Clear Logo</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol (2-4)" style={{ width: 120 }} />
        <button onClick={addTeam}>Add Team</button>
      </div>
      {msg && <div style={{ color: "crimson", marginBottom: 8 }}>{msg}</div>}

      <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Logo</th>
            <th>Symbol</th>
            <th>Team</th>
            <th>Color</th>
            <th>Upload Logo</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {teams.map(t => (
            <tr key={t.id} style={{ borderTop: "1px solid #eee" }}>
              <td>
                {t.hasLogo ? (
                  <img src={`/api/teams/${t.id}/logo/file`} alt={`${t.name} logo`} style={{ width: 36, height: 36, objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>None</span>
                )}
              </td>
              <td>{t.symbol}</td>
              <td>{t.name}</td>
              <td>
                <input
                  type="color"
                  value={t.color}
                  onChange={(e) => updateTeamColor(t.id, e.target.value)}
                />
              </td>
              <td>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => uploadLogo(t.id, e.target.files?.[0] ?? null)}
                />
              </td>
              <td style={{ display: "flex", gap: 8 }}>
                <button onClick={() => clearLogo(t.id)} disabled={!t.hasLogo}>Clear Logo</button>
                <button onClick={() => removeTeam(t.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {teams.length === 0 && (
            <tr><td colSpan={4}>No teams yet.</td></tr>
          )}
        </tbody>
      </table>

      <p style={{ marginTop: 16 }}><a href="/admin">Back to Admin</a></p>
    </main>
  );
}
