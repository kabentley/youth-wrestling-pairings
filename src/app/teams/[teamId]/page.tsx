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
  active: boolean;
};
type MatRule = {
  matIndex: number;
  color: string;
  minExperience: number;
  maxExperience: number;
  minAge: number;
  maxAge: number;
};

export default function TeamDetail({ params }: { params: { teamId: string } }) {
  const { teamId } = params;
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [showInactive, setShowInactive] = useState(true);
  const [matRules, setMatRules] = useState<MatRule[]>([]);
  const [homeTeamPreferSameMat, setHomeTeamPreferSameMat] = useState(false);
  const [ruleMsg, setRuleMsg] = useState("");
  const [form, setForm] = useState({
    first: "",
    last: "",
    weight: 0,
    birthdate: "2015-01-01",
    experienceYears: 0,
    skill: 3,
  });

  const matColors = ["Red", "Blue", "Green", "Yellow", "Orange", "Black", "White", "Gray", "Brown", "Pink"];
  function defaultMatRule(index: number): MatRule {
    return {
      matIndex: index + 1,
      color: matColors[index] ?? "",
      minExperience: 0,
      maxExperience: 10,
      minAge: 0,
      maxAge: 100,
    };
  }

  async function load() {
    const [wRes, rRes] = await Promise.all([
      fetch(`/api/teams/${teamId}/wrestlers?includeInactive=${showInactive ? "1" : "0"}`),
      fetch(`/api/teams/${teamId}/mat-rules`),
    ]);
    setWrestlers(await wRes.json());
    if (rRes.ok) {
      const json = await rRes.json();
      setHomeTeamPreferSameMat(Boolean(json.homeTeamPreferSameMat));
      const rules: MatRule[] = (json.rules ?? []).map((rule: MatRule, idx: number) => ({
        matIndex: idx + 1,
        color: rule.color ?? "",
        minExperience: Number(rule.minExperience),
        maxExperience: Number(rule.maxExperience),
        minAge: Number(rule.minAge),
        maxAge: Number(rule.maxAge),
      }));
      setMatRules(rules.length > 0 ? rules : Array.from({ length: 4 }, (_, idx) => defaultMatRule(idx)));
    } else if (matRules.length === 0) {
      setMatRules(Array.from({ length: 4 }, (_, idx) => defaultMatRule(idx)));
    }
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

  async function saveMatRules() {
    setRuleMsg("");
    const rules = matRules.map((rule, idx) => ({
      ...rule,
      matIndex: idx + 1,
    }));
    const res = await fetch(`/api/teams/${teamId}/mat-rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeTeamPreferSameMat, rules }),
    });
    if (!res.ok) {
      setRuleMsg("Save failed.");
      return;
    }
    setRuleMsg("Saved.");
    setTimeout(() => setRuleMsg(""), 1500);
  }

  useEffect(() => { load(); }, [teamId, showInactive]);

  async function setWrestlerActive(wrestlerId: string, active: boolean) {
    await fetch(`/api/teams/${teamId}/wrestlers/${wrestlerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    load();
  }

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

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Home Team Mat Rules</h3>

        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Mat</th>
              <th>Color</th>
              <th>Min Exp</th>
              <th>Max Exp</th>
              <th>Min Age</th>
              <th>Max Age</th>
            </tr>
          </thead>
          <tbody>
            {matRules.map((rule, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid #eee" }}>
                <td>{idx + 1}</td>
                <td>
                  <input
                    value={rule.color}
                    onChange={(e) => {
                      const color = e.target.value;
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, color } : r)));
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={rule.minExperience}
                    onChange={(e) => {
                      const minExperience = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, minExperience } : r)));
                    }}
                    style={{ width: 70 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={rule.maxExperience}
                    onChange={(e) => {
                      const maxExperience = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, maxExperience } : r)));
                    }}
                    style={{ width: 70 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={rule.minAge}
                    onChange={(e) => {
                      const minAge = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, minAge } : r)));
                    }}
                    style={{ width: 70 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={rule.maxAge}
                    onChange={(e) => {
                      const maxAge = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, maxAge } : r)));
                    }}
                    style={{ width: 70 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              if (matRules.length >= 10) return;
              setMatRules(rules => [...rules, defaultMatRule(rules.length)]);
            }}
          >
            Add Mat
          </button>
          <button
            onClick={() => {
              if (matRules.length <= 1) return;
              setMatRules(rules => rules.slice(0, rules.length - 1));
            }}
          >
            Remove Last Mat
          </button>
          <label>
            <input
              type="checkbox"
              checked={homeTeamPreferSameMat}
              onChange={(e) => setHomeTeamPreferSameMat(e.target.checked)}
            />{" "}
            Keep home team on the same mat
          </label>
          <button onClick={saveMatRules}>Save Rules</button>
          {ruleMsg && <span>{ruleMsg}</span>}
        </div>
      </div>

      <h3 style={{ marginTop: 20 }}>Active Roster</h3>
      <label style={{ display: "block", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />{" "}
        Show inactive wrestlers
      </label>
      <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Name</th><th align="left">Weight</th><th align="left">Birthdate</th><th align="left">Exp</th><th align="left">Skill</th><th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {wrestlers.filter(w => w.active).map(w => (
            <tr key={w.id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{w.first} {w.last}</td>
              <td>{w.weight}</td>
              <td>{new Date(w.birthdate).toISOString().slice(0,10)}</td>
              <td>{w.experienceYears}</td>
              <td>{w.skill}</td>
              <td>
                <button onClick={() => setWrestlerActive(w.id, false)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showInactive && (
        <>
          <h3 style={{ marginTop: 20 }}>Inactive Wrestlers</h3>
          <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th align="left">Name</th><th align="left">Weight</th><th align="left">Birthdate</th><th align="left">Exp</th><th align="left">Skill</th><th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wrestlers.filter(w => !w.active).map(w => (
                <tr key={w.id} style={{ borderTop: "1px solid #ddd" }}>
                  <td>{w.first} {w.last}</td>
                  <td>{w.weight}</td>
                  <td>{new Date(w.birthdate).toISOString().slice(0,10)}</td>
                  <td>{w.experienceYears}</td>
                  <td>{w.skill}</td>
                  <td>
                    <button onClick={() => setWrestlerActive(w.id, true)}>Reinstate</button>
                  </td>
                </tr>
              ))}
              {wrestlers.filter(w => !w.active).length === 0 && (
                <tr><td colSpan={6}>None</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <p style={{ marginTop: 16 }}><a href="/teams">Back to Teams</a></p>
    </main>
  );
}
