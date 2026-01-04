"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Wrestler = {
  id: string;
  first: string;
  last: string;
  weight: number;
  birthdate: string;
  experienceYears: number;
  skill: number;
};

export default function TeamDetail({ params }: { params: { teamId: string } }) {
  const { teamId } = params;
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [form, setForm] = useState({
    first: "",
    last: "",
    weight: 0,
    birthdate: "2015-01-01",
    experienceYears: 0,
    skill: 3,
  });

  async function load() {
    const res = await fetch(`/api/teams/${teamId}/wrestlers`);
    setWrestlers(await res.json());
  }

  async function add() {
    if (!form.first.trim() || !form.last.trim()) return;
    await fetch(`/api/teams/${teamId}/wrestlers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        weight: Number(form.weight),
        experienceYears: Number(form.experienceYears),
        skill: Number(form.skill),
      }),
    });
    setForm({ ...form, first: "", last: "" });
    load();
  }

  useEffect(() => { load(); }, [teamId]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <a href="/">Home</a>
        <a href="/teams">Teams</a>
        <a href="/meets">Meets</a>
        <a href="/auth/mfa">MFA</a>
        <button onClick={() => signOut({ callbackUrl: "/auth/signin" })}>Sign out</button>
      </div>
      <h2>Team Wrestlers</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="First" value={form.first} onChange={e => setForm({ ...form, first: e.target.value })} />
        <input placeholder="Last" value={form.last} onChange={e => setForm({ ...form, last: e.target.value })} />
        <input type="number" placeholder="Weight" value={form.weight} onChange={e => setForm({ ...form, weight: Number(e.target.value) })} />
        <input type="date" value={form.birthdate} onChange={e => setForm({ ...form, birthdate: e.target.value })} />
        <input type="number" placeholder="Exp" value={form.experienceYears} onChange={e => setForm({ ...form, experienceYears: Number(e.target.value) })} />
        <input
          type="number"
          placeholder="Skill 0-5"
          value={form.skill}
          min={0}
          max={5}
          onChange={e => setForm({ ...form, skill: Number(e.target.value) })}
        />
      </div>

      <button onClick={add}>Add Wrestler</button>

      <h3 style={{ marginTop: 20 }}>Roster</h3>
      <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Name</th><th align="left">Weight</th><th align="left">Birthdate</th><th align="left">Exp</th><th align="left">Skill</th>
          </tr>
        </thead>
        <tbody>
          {wrestlers.map(w => (
            <tr key={w.id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{w.first} {w.last}</td>
              <td>{w.weight}</td>
              <td>{new Date(w.birthdate).toISOString().slice(0,10)}</td>
              <td>{w.experienceYears}</td>
              <td>{w.skill}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 16 }}><a href="/teams">Back to Teams</a></p>
    </main>
  );
}
