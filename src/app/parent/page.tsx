"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Child = {
  id: string;
  guid: string;
  first: string;
  last: string;
  teamId: string;
  teamName: string;
  teamSymbol?: string;
  teamColor?: string;
  active?: boolean;
  birthdate?: string;
  weight?: number;
  experienceYears?: number;
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
  role: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
  team: string | null;
};

export default function ParentPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [meetGroups, setMeetGroups] = useState<MeetGroup[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [msg, setMsg] = useState("");
  const searchTimerRef = useRef<number | null>(null);

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

  async function findWrestlers(query?: string) {
    setMsg("");
    const term = (query ?? search).trim();
    if (!term) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/wrestlers/search?q=${encodeURIComponent(term)}`);
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

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    if (!search.trim()) {
      setResults([]);
      setMsg("");
      return;
    }
    searchTimerRef.current = window.setTimeout(() => {
      void findWrestlers(search);
    }, 250);
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const childMap = useMemo(() => new Map(children.map(c => [c.id, c])), [children]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const upcomingMeets = meetGroups.filter(g => new Date(g.meet.date) >= today);
  const pastMeets = meetGroups.filter(g => new Date(g.meet.date) < today);
  const daysPerYear = 365;


  function nameChip(label: string, team: string | undefined, color?: string) {
    const teamLabel = team ? ` (${team})` : "";
    return (
      <span style={{ color: "#111111", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15 }}>
        <span>{label}{teamLabel}</span>
        <span style={{ width: 12, height: 12, background: color ?? "#000000", display: "inline-block" }} />
      </span>
    );
  }

  function ageYears(birthdate?: string) {
    if (!birthdate) return null;
    const bDate = new Date(birthdate);
    if (Number.isNaN(bDate.getTime())) return null;
    const days = Math.floor((today.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
    return days / daysPerYear;
  }

  function boutNumber(mat?: number | null, order?: number | null) {
    if (!mat || !order) return "";
    const suffix = String(order).padStart(2, "0");
    return `${mat}${suffix}`;
  }
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    // Current page
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

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
      <AppHeader links={headerLinks} />

      <h2>My Wrestlers</h2>

      <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Search by name (example: Sam Smith)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={() => findWrestlers(search)}>Search</button>
        </div>
        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
        {results.length > 0 && (
          <div className="panel">
            {results.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0" }}>
                <div>
                  {nameChip(`${r.first} ${r.last}`, r.teamSymbol ?? r.teamName, r.teamColor ?? "#000000")}{" "}
                  — {new Date(r.birthdate).toISOString().slice(0, 10)}
                </div>
                <button onClick={() => addChild(r.id)}>Add</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {children.length === 0 && <div>No wrestlers linked yet.</div>}
      {children.length > 0 && (
        <table cellPadding={10} style={{ borderCollapse: "collapse"}}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="right">Age</th>
              <th align="right">Wt</th>
              <th align="right">Exp</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {children.map(c => (
              <tr key={c.id} style={{ borderTop: "1px solid #ddd" }}>
                <td>{nameChip(`${c.first} ${c.last}`, c.teamSymbol ?? c.teamName, c.teamColor ?? "#000000")}</td>
                <td align="right">{ageYears(c.birthdate)?.toFixed(1) ?? ""}</td>
                <td align="right">{c.weight ?? ""}</td>
                <td align="right">{c.experienceYears ?? ""}</td>
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{group.meet.name}</h3>
          </div>
          <div className="muted" style={{ marginBottom: 8 }}>
            {new Date(group.meet.date).toISOString().slice(0, 10)}{" "}
            {group.meet.location ? `• ${group.meet.location}` : "• Location TBD"}
          </div>
          {group.matches.length === 0 && <div>No scheduled matches yet.</div>}
          {group.matches.length > 0 && (
            <table cellPadding={10} style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">Wrestler</th>
                  <th align="left">Bout #</th>
                  <th align="left">Opponent</th>
                </tr>
              </thead>
              <tbody>
                {group.matches.map(match => {
                  const child = childMap.get(match.childId);
                  return (
                    <tr key={match.boutId} style={{ borderTop: "1px solid #ddd" }}>
                      <td>
                        {nameChip(
                          `${child?.first ?? ""} ${child?.last ?? ""}`.trim(),
                          child?.teamSymbol ?? child?.teamName,
                          child?.teamColor ?? "#000000"
                        )}
                      </td>
                      <td>{boutNumber(match.mat, match.order)}</td>
                      <td>
                        {nameChip(match.opponentName, match.opponentTeam, match.opponentTeamColor ?? "#000000")}
                      </td>
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
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
                  <th align="left">Bout #</th>
                  <th align="left">Opponent</th>
                </tr>
              </thead>
              <tbody>
                {group.matches.map(match => {
                  const child = childMap.get(match.childId);
                  return (
                    <tr key={match.boutId} style={{ borderTop: "1px solid #ddd" }}>
                      <td>
                        {nameChip(
                          `${child?.first ?? ""} ${child?.last ?? ""}`.trim(),
                          child?.teamSymbol ?? child?.teamName,
                          child?.teamColor ?? "#000000"
                        )}
                      </td>
                      <td>{boutNumber(match.mat, match.order)}</td>
                      <td>
                        {nameChip(match.opponentName, match.opponentTeam, match.opponentTeamColor ?? "#000000")}
                      </td>
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
