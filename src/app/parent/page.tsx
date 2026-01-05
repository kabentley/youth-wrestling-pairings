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

type Meet = { id: string; name: string; date: string; location?: string | null };

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

export default function ParentPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [meets, setMeets] = useState<Meet[]>([]);
  const [meetId, setMeetId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const [cRes, mRes] = await Promise.all([
      fetch("/api/parent/children"),
      fetch("/api/meets"),
    ]);
    setChildren(await cRes.json());
    setMeets(await mRes.json());
  }

  async function loadMatches(id: string) {
    if (!id) {
      setMatches([]);
      return;
    }
    const res = await fetch(`/api/parent/meets/${id}/matches`);
    const json = await res.json();
    setMatches(json.matches ?? []);
  }

  async function findWrestlers() {
    setMsg("");
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/wrestlers/search?q=${encodeURIComponent(search.trim())}`);
    const json = await res.json();
    setResults(json ?? []);
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
  useEffect(() => { void loadMatches(meetId); }, [meetId]);

  const matchesByChild = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const list = map.get(m.childId) ?? [];
      list.push(m);
      map.set(m.childId, list);
    }
    return map;
  }, [matches]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <a href="/">Home</a>
        <a href="/teams">Teams</a>
        <a href="/meets">Meets</a>
        <button onClick={async () => { await signOut({ redirect: false }); window.location.href = "/auth/signin"; }}>Sign out</button>
      </div>

      <h2>My Children</h2>

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
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8 }}>
            {results.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0" }}>
                <div>
                  <b style={{ color: r.teamColor ?? "#000000" }}>{r.first} {r.last}</b>{" "}
                  — {r.teamSymbol ?? r.teamName} ({new Date(r.birthdate).toISOString().slice(0, 10)})
                </div>
                <button onClick={() => addChild(r.id)}>Add</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 20 }}>Linked Children</h3>
      {children.length === 0 && <div>No children linked yet.</div>}
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
                <td><span style={{ color: c.teamColor ?? "#000000" }}>{c.first} {c.last}</span></td>
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

      <h2 style={{ marginTop: 24 }}>Meet Matches</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Meet:
          <select value={meetId} onChange={(e) => setMeetId(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">Select a meet</option>
            {meets.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({new Date(m.date).toISOString().slice(0, 10)})</option>
            ))}
          </select>
        </label>
      </div>

      {meetId && children.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {children.map(child => {
            const list = matchesByChild.get(child.id) ?? [];
            return (
              <div key={child.id} style={{ marginBottom: 12, border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                <h3 style={{ marginTop: 0 }}>{child.first} {child.last}</h3>
                {list.length === 0 && <div>No matches for this meet.</div>}
                {list.length > 0 && (
                  <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th align="left">Mat</th>
                        <th align="left">Order</th>
                        <th align="left">Opponent</th>
                        <th align="left">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(match => (
                        <tr key={match.boutId} style={{ borderTop: "1px solid #ddd" }}>
                          <td>{match.mat ?? ""}</td>
                          <td>{match.order ?? ""}</td>
                          <td>
                            <span style={{ color: match.opponentTeamColor ?? "#000000" }}>
                              {match.opponentName}
                            </span>{" "}
                            — {match.opponentTeam}
                          </td>
                          <td>
                            {match.result.type ? `${match.result.type} ${match.result.score ?? ""}`.trim() : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
