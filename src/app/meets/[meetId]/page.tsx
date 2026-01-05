"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

type Team = { id: string; name: string; symbol?: string; color?: string };
type Wrestler = {
  id: string;
  teamId: string;
  first: string;
  last: string;
  weight: number;
  experienceYears: number;
  skill: number;
  birthdate?: string;
  status?: "LATE" | "EARLY" | "ABSENT" | null;
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

type LockState = {
  status: "loading" | "acquired" | "locked";
  lockedByUsername?: string | null;
  lockExpiresAt?: string | null;
};

export default function MeetDetail({ params }: { params: { meetId: string } }) {
  const meetId = params.meetId;

  const [teams, setTeams] = useState<Team[]>([]);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler>>({});

  const [msg, setMsg] = useState("");
  const [matMsg, setMatMsg] = useState("");
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const lockStatusRef = useRef<LockState["status"]>("loading");

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

  function updateLockState(next: LockState) {
    lockStatusRef.current = next.status;
    setLockState(next);
  }

  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.ok) {
      const json = await res.json();
      updateLockState({
        status: "acquired",
        lockExpiresAt: json.lockExpiresAt ?? null,
      });
      return;
    }

    if (res.status === 409) {
      const json = await res.json();
      updateLockState({
        status: "locked",
        lockedByUsername: json.lockedByUsername ?? "another user",
        lockExpiresAt: json.lockExpiresAt ?? null,
      });
      return;
    }

    updateLockState({ status: "locked", lockedByUsername: "unknown user" });
  }

  function releaseLock() {
    fetch(`/api/meets/${meetId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
  }

  function teamName(id: string) {
    const team = teams.find(t => t.id === id);
    return team?.symbol || team?.name || id;
  }
  function teamColor(id: string) {
    return teams.find(t => t.id === id)?.color ?? "#000000";
  }
  function statusBg(status?: Wrestler["status"]) {
    if (status === "EARLY") return "#f3eadf";
    if (status === "LATE") return "#e6f6ea";
    if (status === "ABSENT") return "#f0f0f0";
    return "";
  }
  function wName(id: string) {
    const w = wMap[id];
    if (!w) return id;
    const color = teamColor(w.teamId);
    return (
      <span style={{ color }}>
        {w.first} {w.last} ({w.weight}) — {teamName(w.teamId)}
        {w.status === "LATE" ? " (Arrive Late)" : ""}
        {w.status === "EARLY" ? " (Leave Early)" : ""}
        {w.status === "ABSENT" ? " (Not attending)" : ""}
      </span>
    );
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
  useEffect(() => {
    acquireLock();
    const interval = setInterval(() => {
      if (lockStatusRef.current === "acquired") {
        acquireLock();
      }
    }, 60_000);
    const onBeforeUnload = () => releaseLock();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseLock();
    };
  }, [meetId]);

  const canEdit = lockState.status === "acquired";

  const matchedIds = new Set<string>();
  for (const b of bouts) { matchedIds.add(b.redId); matchedIds.add(b.greenId); }
  const unmatched = wrestlers
    .filter(w => !matchedIds.has(w.id) && w.status !== "ABSENT")
    .sort((a, b) => a.weight - b.weight);

  const conflictBoutIds = (() => {
    const gap = 6;
    const byWrestler = new Map<string, { boutId: string; order: number }[]>();
    for (const b of bouts) {
      if (!b.order) continue;
      for (const wid of [b.redId, b.greenId]) {
        const list = byWrestler.get(wid) ?? [];
        list.push({ boutId: b.id, order: b.order });
        byWrestler.set(wid, list);
      }
    }
    const conflicts = new Set<string>();
    for (const list of byWrestler.values()) {
      list.sort((a, b) => a.order - b.order);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const diff = list[j].order - list[i].order;
          if (diff > gap) break;
          conflicts.add(list[i].boutId);
          conflicts.add(list[j].boutId);
        }
      }
    }
    return conflicts;
  })();

  async function generate() {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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

  async function updateWrestlerStatus(wrestlerId: string, status: "LATE" | "EARLY" | "ABSENT" | null) {
    await fetch(`/api/meets/${meetId}/wrestlers/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrestlerId, status }),
    });
    await load();
    if (status === "ABSENT") {
      setTarget(null);
      setCandidates([]);
    } else if (target?.id === wrestlerId) {
      await loadCandidates(wrestlerId);
    }
  }

  async function forceMatch(redId: string, greenId: string) {
    if (!canEdit) return;
    await fetch(`/api/meets/${meetId}/pairings/force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redId, greenId }),
    });
    await load();
    await loadCandidates(redId);
  }

  async function excludePair(aId: string, bId: string) {
    if (!canEdit) return;
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

      {lockState.status === "locked" && (
        <div style={{ border: "1px solid #e8c3c3", background: "#fff3f3", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          Editing locked by {lockState.lockedByUsername ?? "another user"}. Try again when they are done.
          <button onClick={acquireLock} style={{ marginLeft: 10 }}>Try again</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label>Max age gap (days): <input type="number" value={settings.maxAgeGapDays} onChange={e => setSettings(s => ({ ...s, maxAgeGapDays: Number(e.target.value) }))} /></label>
        <label>Max weight diff (%): <input type="number" value={settings.maxWeightDiffPct} onChange={e => setSettings(s => ({ ...s, maxWeightDiffPct: Number(e.target.value) }))} /></label>
        <label><input type="checkbox" checked={settings.firstYearOnlyWithFirstYear} onChange={e => setSettings(s => ({ ...s, firstYearOnlyWithFirstYear: e.target.checked }))} /> First-year only with first-year</label>
        <label><input type="checkbox" checked={settings.allowSameTeamMatches} onChange={e => setSettings(s => ({ ...s, allowSameTeamMatches: e.target.checked }))} /> Same-team fallback</label>
        <label><input type="checkbox" checked={settings.balanceTeamPairs} onChange={e => setSettings(s => ({ ...s, balanceTeamPairs: e.target.checked }))} /> Balance team pairings</label>
        <label>Penalty: <input type="number" step="0.05" value={settings.balancePenalty} onChange={e => setSettings(s => ({ ...s, balancePenalty: Number(e.target.value) }))} style={{ width: 70 }} /></label>
        <button onClick={generate} disabled={!canEdit}>Generate Pairings</button>
        {msg && <span>{msg}</span>}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 12 }}>
        <span>Legend:</span>
        <span style={{ background: "#ffd6df", padding: "2px 6px", borderRadius: 6 }}>Conflict</span>
        <span style={{ background: "#e6f6ea", padding: "2px 6px", borderRadius: 6 }}>Arrive Late</span>
        <span style={{ background: "#f3eadf", padding: "2px 6px", borderRadius: 6 }}>Leave Early</span>
        <span style={{ background: "#f0f0f0", padding: "2px 6px", borderRadius: 6 }}>Not attending</span>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label>Mats: <input type="number" min={1} max={10} value={matSettings.numMats} onChange={e => setMatSettings(s => ({ ...s, numMats: Number(e.target.value) }))} style={{ width: 60 }} /></label>
        <label>Min rest: <input type="number" min={0} max={20} value={matSettings.minRestBouts} onChange={e => setMatSettings(s => ({ ...s, minRestBouts: Number(e.target.value) }))} style={{ width: 60 }} /></label>
        <label>Rest penalty: <input type="number" min={0} max={1000} value={matSettings.restPenalty} onChange={e => setMatSettings(s => ({ ...s, restPenalty: Number(e.target.value) }))} style={{ width: 70 }} /></label>
        <button onClick={assignMats} disabled={!canEdit}>Assign Mats</button>
        {matMsg && <span>{matMsg}</span>}
      </div>

      <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Mat</th><th align="left">Order</th><th align="left">Red</th><th align="left">Green</th><th align="left">Score</th><th align="left">Lock</th>
          </tr>
        </thead>
        <tbody>
          {bouts.map(b => {
            const red = wMap[b.redId];
            const green = wMap[b.greenId];
            const hasLate = red?.status === "LATE" || green?.status === "LATE";
            const hasEarly = red?.status === "EARLY" || green?.status === "EARLY";
            const hasAbsent = red?.status === "ABSENT" || green?.status === "ABSENT";
            const rowBg = hasAbsent
              ? "#f0f0f0"
              : hasEarly
                ? "#f3eadf"
                : hasLate
                  ? "#e6f6ea"
                  : conflictBoutIds.has(b.id)
                    ? "#ffd6df"
                    : undefined;
            return (
              <tr key={b.id} style={{ borderTop: "1px solid #ddd", background: rowBg }}>
              <td>{b.mat ?? ""}</td>
              <td>{b.order ?? ""}</td>
              <td><button onClick={() => loadCandidates(b.redId)} style={{ textAlign: "left" }}>{wName(b.redId)}</button></td>
              <td><button onClick={() => loadCandidates(b.greenId)} style={{ textAlign: "left" }}>{wName(b.greenId)}</button></td>
              <td>{b.score.toFixed(3)}</td>
              <td><button onClick={() => setLock(b.id, !b.locked)} disabled={!canEdit}>{b.locked ? "Unlock" : "Lock"}</button></td>
            </tr>
          )})}
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
                <span style={{ color: teamColor(target.teamId) }}>
                  <b>{target.first} {target.last}</b>
                </span>{" "}
                ({target.weight}) — {teamName(target.teamId)} — exp {target.experienceYears}, skill {target.skill}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <button onClick={() => updateWrestlerStatus(target.id, "LATE")} disabled={!canEdit || target.status === "LATE"}>
                  Arrive Late
                </button>
                <button onClick={() => updateWrestlerStatus(target.id, "EARLY")} disabled={!canEdit || target.status === "EARLY"}>
                  Leave Early
                </button>
                <button onClick={() => updateWrestlerStatus(target.id, "ABSENT")} disabled={!canEdit || target.status === "ABSENT"}>
                  Not Attending
                </button>
                <button onClick={() => updateWrestlerStatus(target.id, null)} disabled={!canEdit || !target.status}>
                  Clear Status
                </button>
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
                        <td>
                          <span style={{ color: teamColor(o.teamId) }}>
                            {o.first} {o.last} ({o.weight}) — {teamName(o.teamId)}
                          </span>
                        </td>
                        <td align="right">{Number(c.score).toFixed(3)}</td>
                        <td align="right">{Number(d.wDiff).toFixed(1)}</td>
                        <td align="right">{Number(d.wPct).toFixed(1)}%</td>
                        <td align="right">{d.ageGapDays}</td>
                        <td align="right">{d.expGap}</td>
                        <td align="right">{d.skillGap}</td>
                        <td>
                          <button onClick={() => forceMatch(target.id, o.id)} disabled={!canEdit}>Force</button>{" "}
                          <button onClick={() => excludePair(target.id, o.id)} disabled={!canEdit}>Exclude</button>
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
