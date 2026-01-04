"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Team = { id: string; name: string };
type Wrestler = {
  id: string;
  teamId: string;
  first: string;
  last: string;
  weight: number;
  experienceYears: number;
  skill: number;
  birthdate?: string;
};
type Bout = {
  id: string;
  redId: string;
  greenId: string;
  type: string;
  score: number;
  notes?: string | null;
  locked: boolean;
  mat?: number | null;
  order?: number | null;
};

export default function MeetDetail({ params }: { params: { meetId: string } }) {
  const meetId = params.meetId;

  const [teams, setTeams] = useState<Team[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler>>({});

  const [msg, setMsg] = useState("");
  const [matMsg, setMatMsg] = useState("");

  const [settings, setSettings] = useState({
    maxAgeGapDays: 365,
    maxWeightDiffPct: 12,
    firstYearOnlyWithFirstYear: true,
    allowSameTeamMatches: false,
    balanceTeamPairs: true,
    balancePenalty: 0.25,
  });

  const [matSettings, setMatSettings] = useState({
    numMats: 4,
    minRestBouts: 2,
    restPenalty: 10,
  });

  const [target, setTarget] = useState<Wrestler | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);

  function teamName(id: string) {
    return teams.find(t => t.id === id)?.name ?? id;
  }
  function wName(id: string) {
    const w = wMap[id];
    return w ? `${w.first} ${w.last} (${w.weight}) — ${teamName(w.teamId)}` : id;
  }

  async function load() {
    const [bRes, wRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/pairings`),
      fetch(`/api/meets/${meetId}/wrestlers`),
    ]);

    const bJson: Bout[] = await bRes.json();
    const wJson = await wRes.json();

    setBouts(bJson);
    setTeams(wJson.teams);
    setWrestlers(wJson.wrestlers);

    const map: Record<string, Wrestler> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);

    const maxMat = Math.max(0, ...bJson.map(b => b.mat ?? 0));
    if (maxMat > 0) setMatSettings(s => ({ ...s, numMats: maxMat }));
  }

  useEffect(() => { load(); }, [meetId]);

  const matchedIds = new Set<string>();
  for (const b of bouts) { matchedIds.add(b.redId); matchedIds.add(b.greenId); }
  const unmatched = wrestlers.filter(w => !matchedIds.has(w.id)).sort((a, b) => a.weight - b.weight);

  async function generate() {
    setMsg("Generating...");
    const res = await fetch(`/api/meets/${meetId}/pairings/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxAgeGapDays: Number(settings.maxAgeGapDays),
        maxWeightDiffPct: Number(settings.maxWeightDiffPct),
        firstYearOnlyWithFirstYear: Boolean(settings.firstYearOnlyWithFirstYear),
        allowSameTeamMatches: Boolean(settings.allowSameTeamMatches),
        balanceTeamPairs: Boolean(settings.balanceTeamPairs),
        balancePenalty: Number(settings.balancePenalty),
      }),
    });
    const json = await res.json();
    setMsg(`Created ${json.created} bouts (locked kept: ${json.locked})`);
    await load();
    setTimeout(() => setMsg(""), 1500);
  }

  async function assignMats() {
    setMatMsg("Assigning mats...");
    const res = await fetch(`/api/meets/${meetId}/mats/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matSettings),
    });
    const json = await res.json();
    setMatMsg(`Assigned ${json.assigned} bouts across ${json.numMats} mats`);
    await load();
    setTimeout(() => setMatMsg(""), 1500);
  }

  async function setLock(boutId: string, locked: boolean) {
    await fetch(`/api/bouts/${boutId}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked }),
    });
    await load();
  }

  async function loadCandidates(wrestlerId: string) {
    const qs = new URLSearchParams({
      wrestlerId,
      limit: "20",
      maxAgeGapDays: String(settings.maxAgeGapDays),
      maxWeightDiffPct: String(settings.maxWeightDiffPct),
      firstYearOnlyWithFirstYear: String(settings.firstYearOnlyWithFirstYear),
      allowSameTeamMatches: String(settings.allowSameTeamMatches),
    });

    const res = await fetch(`/api/meets/${meetId}/candidates?${qs.toString()}`);
    const json = await res.json();
    setTarget(json.target);
    setCandidates(json.candidates || []);
  }

  async function forceMatch(redId: string, greenId: string) {
    await fetch(`/api/meets/${meetId}/pairings/force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redId, greenId }),
    });
    await load();
    await loadCandidates(redId);
  }

  async function excludePair(aId: string, bId: string) {
    await fetch(`/api/meets/${meetId}/exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aId, bId }),
    });
    await loadCandidates(aId);
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
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <a href="/meets">← Meets</a>
        <a href={`/meets/${meetId}/matboard`} target="_blank" rel="noreferrer">Mat Board</a>
        <a href={`/meets/${meetId}/print`} target="_blank" rel="noreferrer">Print</a>
        <a href={`/meets/${meetId}/wall`} target="_blank" rel="noreferrer">Wall Chart</a>
      </div>

      <h2>Meet Pairings</h2>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label>Max age gap (days): <input type="number" value={settings.maxAgeGapDays} onChange={e => setSettings(s => ({ ...s, maxAgeGapDays: Number(e.target.value) }))} /></label>
        <label>Max weight diff (%): <input type="number" value={settings.maxWeightDiffPct} onChange={e => setSettings(s => ({ ...s, maxWeightDiffPct: Number(e.target.value) }))} /></label>
        <label><input type="checkbox" checked={settings.firstYearOnlyWithFirstYear} onChange={e => setSettings(s => ({ ...s, firstYearOnlyWithFirstYear: e.target.checked }))} /> First-year only with first-year</label>
        <label><input type="checkbox" checked={settings.allowSameTeamMatches} onChange={e => setSettings(s => ({ ...s, allowSameTeamMatches: e.target.checked }))} /> Same-team fallback</label>
        <label><input type="checkbox" checked={settings.balanceTeamPairs} onChange={e => setSettings(s => ({ ...s, balanceTeamPairs: e.target.checked }))} /> Balance team pairings</label>
        <label>Penalty: <input type="number" step="0.05" value={settings.balancePenalty} onChange={e => setSettings(s => ({ ...s, balancePenalty: Number(e.target.value) }))} style={{ width: 70 }} /></label>
        <button onClick={generate}>Generate Pairings</button>
        {msg && <span>{msg}</span>}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label>Mats: <input type="number" min={1} max={10} value={matSettings.numMats} onChange={e => setMatSettings(s => ({ ...s, numMats: Number(e.target.value) }))} style={{ width: 60 }} /></label>
        <label>Min rest: <input type="number" min={0} max={20} value={matSettings.minRestBouts} onChange={e => setMatSettings(s => ({ ...s, minRestBouts: Number(e.target.value) }))} style={{ width: 60 }} /></label>
        <label>Rest penalty: <input type="number" min={0} max={1000} value={matSettings.restPenalty} onChange={e => setMatSettings(s => ({ ...s, restPenalty: Number(e.target.value) }))} style={{ width: 70 }} /></label>
        <button onClick={assignMats}>Assign Mats</button>
        {matMsg && <span>{matMsg}</span>}
      </div>

      <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Mat</th><th align="left">Order</th><th align="left">Red</th><th align="left">Green</th><th align="left">Score</th><th align="left">Lock</th>
          </tr>
        </thead>
        <tbody>
          {bouts.map(b => (
            <tr key={b.id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{b.mat ?? ""}</td>
              <td>{b.order ?? ""}</td>
              <td><button onClick={() => loadCandidates(b.redId)} style={{ textAlign: "left" }}>{wName(b.redId)}</button></td>
              <td><button onClick={() => loadCandidates(b.greenId)} style={{ textAlign: "left" }}>{wName(b.greenId)}</button></td>
              <td>{b.score.toFixed(3)}</td>
              <td><button onClick={() => setLock(b.id, !b.locked)}>{b.locked ? "Unlock" : "Lock"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ flex: 2 }}>
          <h3>Unmatched</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unmatched.map(w => (
              <button key={w.id} onClick={() => loadCandidates(w.id)}>
                {w.first} {w.last} ({w.weight}) — {teamName(w.teamId)}
              </button>
            ))}
            {unmatched.length === 0 && <div>None</div>}
          </div>
        </div>

        <div style={{ flex: 3, border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
          <h3>Candidates</h3>
          {!target && <div>Select a wrestler (from Unmatched or a bout) to see opponent options.</div>}

          {target && (
            <>
              <div style={{ marginBottom: 10 }}>
                <b>{target.first} {target.last}</b> ({target.weight}) — {teamName(target.teamId)} — exp {target.experienceYears}, skill {target.skill}
              </div>

              <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th align="left">Opponent</th>
                    <th align="right">Score</th>
                    <th align="right">Wt Δ</th>
                    <th align="right">Wt %</th>
                    <th align="right">Age Δ(d)</th>
                    <th align="right">Exp Δ</th>
                    <th align="right">Skill Δ</th>
                    <th align="left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c: any) => {
                    const o = c.opponent as Wrestler;
                    const d = c.details;
                    return (
                      <tr key={o.id} style={{ borderTop: "1px solid #eee" }}>
                        <td>{o.first} {o.last} ({o.weight}) — {teamName(o.teamId)}</td>
                        <td align="right">{Number(c.score).toFixed(3)}</td>
                        <td align="right">{Number(d.wDiff).toFixed(1)}</td>
                        <td align="right">{Number(d.wPct).toFixed(1)}%</td>
                        <td align="right">{d.ageGapDays}</td>
                        <td align="right">{d.expGap}</td>
                        <td align="right">{d.skillGap}</td>
                        <td>
                          <button onClick={() => forceMatch(target.id, o.id)}>Force</button>{" "}
                          <button onClick={() => excludePair(target.id, o.id)}>Exclude</button>
                        </td>
                      </tr>
                    );
                  })}
                  {target && candidates.length === 0 && (
                    <tr><td colSpan={8}>No candidates meet the current limits.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
