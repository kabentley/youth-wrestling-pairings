"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type Child = {
  id: string;
  guid: string;
  first: string;
  last: string;
  teamId: string;
  teamName: string;
  teamSymbol?: string;
  teamColor?: string;
  active: boolean;
};

type Match = {
  boutId: string;
  childId: string;
  corner: "red" | "green";
  opponentId: string;
  opponentName: string;
  opponentTeam: string;
  opponentTeamColor?: string;
  mat: number | null;
  order: number | null;
  result: {
    winnerId: string | null;
    type: string | null;
    score: string | null;
    period: number | null;
    time: string | null;
  };
};

type MeetGroup = {
  meet: { id: string; name: string; date: string; location?: string | null };
  matches: Match[];
};

type SearchResult = {
  id: string;
  guid: string;
  first: string;
  last: string;
  teamId: string;
  teamName: string;
  teamSymbol?: string;
  teamColor?: string;
  birthdate: string;
};

type Profile = {
  username: string;
  name: string | null;
  team: string | null;
};

export default function ParentPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [meetGroups, setMeetGroups] = useState<MeetGroup[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const [profileRes, matchesRes] = await Promise.all([
      fetch("/api/parent/profile"),
      fetch("/api/parent/matches"),
    ]);
    const profileJson = await profileRes.json().catch(() => null);
    const matchesJson = await matchesRes.json().catch(() => null);
    setProfile(profileRes.ok ? profileJson : null);
    setChildren(matchesJson?.children ?? []);
    setMeetGroups(matchesJson?.meets ?? []);
  }

  async function findWrestlers() {
    setMsg("");
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/wrestlers/search?q=${encodeURIComponent(search.trim())}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg(json?.error ?? "Unable to search wrestlers.");
      setResults([]);
      return;
    }
    const json = await res.json();
    setResults(Array.isArray(json) ? json : []);
  }

  async function addChild(wrestlerId: string) {
    const res = await fetch("/api/parent/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrestlerId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg(json?.error ?? "Unable to add child.");
      return;
    }
    setMsg("Added.");
    setSearch("");
    setResults([]);
    await load();
  }

  async function removeChild(wrestlerId: string) {
    await fetch("/api/parent/children", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrestlerId }),
    });
    await load();
  }

  useEffect(() => { void load(); }, []);

  const childMap = useMemo(() => new Map(children.map(c => [c.id, c])), [children]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const upcomingMeets = meetGroups.filter(g => new Date(g.meet.date) >= today);
  const pastMeets = meetGroups.filter(g => new Date(g.meet.date) < today);

  function formatResult(result: Match["result"]) {
    if (!result.type) return "";
    const score = result.score ? ` ${result.score}` : "";
    return `${result.type}${score}`.trim();
  }

  return (
    <main className="parent">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --accent: #1e88e5;
          --line: #d5dbe2;
        }
        .parent {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .parent a {
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
        }
        .parent a:hover {
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
        h2, h3 {
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .panel {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px;
          background: var(--card);
          box-shadow: 0 6px 16px rgba(0,0,0,0.06);
        }
        .muted {
          color: var(--muted);
        }
        input, select, textarea, button {
          font-family: inherit;
        }
        input, select, textarea {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 8px;
        }
      `}</style>
      <div className="topbar">
        <div className="nav">
          <a href="/">Home</a>
          <a href="/teams">Teams</a>
          <a href="/meets">Meets</a>
        </div>
        <button
          className="nav-btn"
          onClick={async () => {
            await signOut({ redirect: false });
            window.location.href = "/auth/signin";
          }}
        >
          Sign out
        </button>
      </div>

      <h2>My Wrestlers</h2>
      {profile && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div><b>Username:</b> {profile.username}</div>
          <div><b>Name:</b> {profile.name ?? "Not set"}</div>
          <div><b>Team:</b> {profile.team ?? "Not assigned"}</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Search by name (example: Sam Smith)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={findWrestlers}>Search</button>
        </div>
        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
        {results.length > 0 && (
          <div className="panel">
            {results.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0" }}>
                <div>
                  <b style={{ color: r.teamColor ?? "#000000" }}>{r.first} {r.last} ({r.teamSymbol ?? r.teamName})</b>{" "}
                  — {new Date(r.birthdate).toISOString().slice(0, 10)}
                </div>
                <button onClick={() => addChild(r.id)}>Add</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 20 }}>My Wrestlers</h3>
      {children.length === 0 && <div>No wrestlers linked yet.</div>}
      {children.length > 0 && (
        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">Team</th>
              <th align="left">Status</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {children.map(c => (
              <tr key={c.id} style={{ borderTop: "1px solid #ddd" }}>
                <td><span style={{ color: c.teamColor ?? "#000000" }}>{c.first} {c.last} ({c.teamSymbol ?? c.teamName})</span></td>
                <td>{c.teamSymbol ?? c.teamName}</td>
                <td>{c.active ? "Active" : "Inactive"}</td>
                <td>
                  <button onClick={() => removeChild(c.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 24 }}>Upcoming Meets</h2>
      {upcomingMeets.length === 0 && <div>No upcoming meets yet.</div>}
      {upcomingMeets.map(group => (
        <div key={group.meet.id} className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{group.meet.name}</h3>
            <a href={`/parent/meets/${group.meet.id}`}>Meet Details</a>
          </div>
          <div className="muted" style={{ marginBottom: 8 }}>
            {new Date(group.meet.date).toISOString().slice(0, 10)}{" "}
            {group.meet.location ? `• ${group.meet.location}` : "• Location TBD"}
          </div>
          {group.matches.length === 0 && <div>No scheduled matches yet.</div>}
          {group.matches.length > 0 && (
            <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th align="left">Wrestler</th>
                  <th align="left">Mat</th>
                  <th align="left">Bout</th>
                  <th align="left">Opponent</th>
                  <th align="left">Result</th>
                </tr>
              </thead>
              <tbody>
                {group.matches.map(match => {
                  const child = childMap.get(match.childId);
                  return (
                    <tr key={match.boutId} style={{ borderTop: "1px solid #ddd" }}>
                      <td>
                        <span style={{ color: child?.teamColor ?? "#000000" }}>
                          {child?.first} {child?.last} ({child?.teamSymbol ?? child?.teamName})
                        </span>
                      </td>
                      <td>{match.mat ?? ""}</td>
                      <td>{match.order ?? ""}</td>
                      <td>
                        <span style={{ color: match.opponentTeamColor ?? "#000000" }}>
                          {match.opponentName} ({match.opponentTeam})
                        </span>
                      </td>
                      <td>{formatResult(match.result)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <h2 style={{ marginTop: 24 }}>Match History</h2>
      {pastMeets.length === 0 && <div>No past meets yet.</div>}
      {pastMeets.map(group => (
        <div key={group.meet.id} className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{group.meet.name}</h3>
            <a href={`/parent/meets/${group.meet.id}`}>Meet Details</a>
          </div>
          <div className="muted" style={{ marginBottom: 8 }}>
            {new Date(group.meet.date).toISOString().slice(0, 10)}{" "}
            {group.meet.location ? `• ${group.meet.location}` : "• Location TBD"}
          </div>
          {group.matches.length === 0 && <div>No matches recorded.</div>}
          {group.matches.length > 0 && (
            <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th align="left">Wrestler</th>
                  <th align="left">Mat</th>
                  <th align="left">Bout</th>
                  <th align="left">Opponent</th>
                  <th align="left">Result</th>
                </tr>
              </thead>
              <tbody>
                {group.matches.map(match => {
                  const child = childMap.get(match.childId);
                  return (
                    <tr key={match.boutId} style={{ borderTop: "1px solid #ddd" }}>
                      <td>
                        <span style={{ color: child?.teamColor ?? "#000000" }}>
                          {child?.first} {child?.last} ({child?.teamSymbol ?? child?.teamName})
                        </span>
                      </td>
                      <td>{match.mat ?? ""}</td>
                      <td>{match.order ?? ""}</td>
                      <td>
                        <span style={{ color: match.opponentTeamColor ?? "#000000" }}>
                          {match.opponentName} ({match.opponentTeam})
                        </span>
                      </td>
                      <td>{formatResult(match.result)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </main>
  );
}
