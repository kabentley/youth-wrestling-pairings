"use client";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

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
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const sessionTeamId = (session?.user as any)?.teamId as string | undefined;
  const canEdit = role === "ADMIN" || (role === "COACH" && sessionTeamId === teamId);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [team, setTeam] = useState<{ name: string; symbol?: string; color?: string; hasLogo?: boolean } | null>(null);
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
    const [wRes, rRes, tRes] = await Promise.all([
      fetch(`/api/teams/${teamId}/wrestlers?includeInactive=${showInactive ? "1" : "0"}`),
      fetch(`/api/teams/${teamId}/mat-rules`),
      fetch(`/api/teams/${teamId}`),
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
    if (tRes.ok) setTeam(await tRes.json());
  }

  async function add() {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {team?.hasLogo ? (
          <img src={`/api/teams/${teamId}/logo/file`} alt={`${team.name} logo`} style={{ width: 56, height: 56, objectFit: "contain" }} />
        ) : null}
        <h2 style={{ margin: 0 }}>
          {team?.symbol ? `${team.symbol} — ${team.name}` : (team?.name ?? "Team")}
        </h2>
      </div>

      {!canEdit && (
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          You can view this roster but cannot edit it.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="First" value={form.first} onChange={e => setForm({ ...form, first: e.target.value })} disabled={!canEdit} />
        <input placeholder="Last" value={form.last} onChange={e => setForm({ ...form, last: e.target.value })} disabled={!canEdit} />
        <input type="number" placeholder="Weight" value={form.weight} onChange={e => setForm({ ...form, weight: Number(e.target.value) })} disabled={!canEdit} />
        <input type="date" value={form.birthdate} onChange={e => setForm({ ...form, birthdate: e.target.value })} disabled={!canEdit} />
        <input type="number" placeholder="Exp" value={form.experienceYears} onChange={e => setForm({ ...form, experienceYears: Number(e.target.value) })} disabled={!canEdit} />
        <input
          type="number"
          placeholder="Skill 0-5"
          value={form.skill}
          min={0}
          max={5}
          onChange={e => setForm({ ...form, skill: Number(e.target.value) })}
          disabled={!canEdit}
        />
      </div>

      <button onClick={add} disabled={!canEdit}>Add Wrestler</button>

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
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
            disabled={!canEdit}
          >
            Add Mat
          </button>
          <button
            onClick={() => {
              if (matRules.length <= 1) return;
              setMatRules(rules => rules.slice(0, rules.length - 1));
            }}
            disabled={!canEdit}
          >
            Remove Last Mat
          </button>
          <label>
            <input
              type="checkbox"
              checked={homeTeamPreferSameMat}
              onChange={(e) => setHomeTeamPreferSameMat(e.target.checked)}
              disabled={!canEdit}
            />{" "}
            Keep home team on the same mat
          </label>
          <button onClick={saveMatRules} disabled={!canEdit}>Save Rules</button>
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
              <td style={{ color: team?.color ?? "#000000" }}>{w.first} {w.last}</td>
              <td>{w.weight}</td>
              <td>{new Date(w.birthdate).toISOString().slice(0,10)}</td>
              <td>{w.experienceYears}</td>
              <td>{w.skill}</td>
              <td>
                <button onClick={() => setWrestlerActive(w.id, false)} disabled={!canEdit}>Remove</button>
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
              <td style={{ color: team?.color ?? "#000000" }}>{w.first} {w.last}</td>
                  <td>{w.weight}</td>
                  <td>{new Date(w.birthdate).toISOString().slice(0,10)}</td>
                  <td>{w.experienceYears}</td>
              <td>{w.skill}</td>
              <td>
                <button onClick={() => setWrestlerActive(w.id, true)} disabled={!canEdit}>Reinstate</button>
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
