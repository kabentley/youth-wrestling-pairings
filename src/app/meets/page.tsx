"use client";
import { useEffect, useState } from "react";

type Team = { id: string; name: string };
type Meet = { id: string; name: string; date: string; location?: string | null; meetTeams: { team: Team }[] };

export default function MeetsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [meets, setMeets] = useState<Meet[]>([]);
  const [name, setName] = useState("");
  const [date, setDate] = useState("2026-01-15");
  const [location, setLocation] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);

  async function load() {
    const [t, m] = await Promise.all([fetch("/api/teams"), fetch("/api/meets")]);
    setTeams(await t.json());
    setMeets(await m.json());
  }

  function toggleTeam(id: string) {
    setTeamIds(prev => {
      const has = prev.includes(id);
      if (has) return prev.filter(x => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  async function addMeet() {
    await fetch("/api/meets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, date, location, teamIds }),
    });
    setName("");
    setLocation("");
    setTeamIds([]);
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <a href="/">Home</a>
        <a href="/auth/mfa">MFA</a>
        <button onClick={() => signOut({ callbackUrl: "/auth/signin" })}>Sign out</button>
      </div>
      <h2>Meets</h2>

      <div style={{ display: "grid", gap: 8, maxWidth: 760 }}>
        <input placeholder="Meet name" value={name} onChange={e => setName(e.target.value)} />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} />

        <div style={{ border: "1px solid #ddd", padding: 10, borderRadius: 8 }}>
          <div style={{ marginBottom: 6 }}><b>Select teams (2–4)</b></div>
          {teams.map(t => (
            <label key={t.id} style={{ display: "block" }}>
              <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} /> {t.name}
            </label>
          ))}
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            Selected: {teamIds.length} (max 4)
          </div>
        </div>

        <button onClick={addMeet} disabled={teamIds.length < 2 || teamIds.length > 4 || name.trim().length < 2}>
          Create Meet
        </button>
      </div>

      <h3 style={{ marginTop: 20 }}>Existing Meets</h3>
      <ul>
        {meets.map(m => (
          <li key={m.id}>
            <a href={`/meets/${m.id}`}>{m.name}</a>{" "}
            — {new Date(m.date).toISOString().slice(0,10)}
            {m.location ? ` — ${m.location}` : ""} —{" "}
            {m.meetTeams.map(mt => mt.team.name).join(", ")}
          </li>
        ))}
      </ul>

      <p style={{ marginTop: 16 }}><a href="/">Back</a></p>
    </main>
  );
}
