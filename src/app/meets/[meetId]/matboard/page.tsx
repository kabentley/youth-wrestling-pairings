"use client";

import { useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string };
type Wrestler = { id: string; first: string; last: string; weight: number; teamId: string };
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

function keyMat(m: number) { return String(m); }

export default function MatBoard({ params }: { params: { meetId: string } }) {
  const meetId = params.meetId;

  const [teams, setTeams] = useState<Team[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler>>({});
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [numMats, setNumMats] = useState(4);
  const [msg, setMsg] = useState("");

  const [dragging, setDragging] = useState<{ boutId: string; fromMat: number } | null>(null);

  async function load() {
    const [bRes, wRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/pairings`),
      fetch(`/api/meets/${meetId}/wrestlers`),
    ]);

    const bJson: Bout[] = await bRes.json();
    setBouts(bJson);

    const wJson = await wRes.json();
    setTeams(wJson.teams);
    const map: Record<string, Wrestler> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);

    const maxMat = Math.max(0, ...bJson.map(b => b.mat ?? 0));
    setNumMats(maxMat > 0 ? maxMat : 4);
  }

  useEffect(() => { load(); }, [meetId]);

  function teamName(teamId: string) {
    return teams.find(t => t.id === teamId)?.name ?? teamId;
  }

  const mats = useMemo(() => {
    const out: Record<string, Bout[]> = {};
    for (let m = 1; m <= numMats; m++) out[keyMat(m)] = [];

    for (const b of bouts) {
      const m = b.mat ?? 1;
      const k = keyMat(Math.min(Math.max(1, m), numMats));
      out[k] ??= [];
      out[k].push(b);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    return out;
  }, [bouts, numMats]);

  function moveBout(boutId: string, toMat: number, toIndex: number) {
    setBouts(prev => {
      const b = prev.find(x => x.id === boutId);
      if (!b) return prev;

      const fromMat = (b.mat ?? 1);
      const next = prev.map(x => ({ ...x }));

      const fromList = next
        .filter(x => (x.mat ?? 1) === fromMat)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .filter(x => x.id !== boutId);

      const toList = next
        .filter(x => (x.mat ?? 1) === toMat)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .filter(x => x.id !== boutId);

      toList.splice(Math.max(0, Math.min(toIndex, toList.length)), 0, { ...b, mat: toMat });

      const updated = new Map<string, { mat: number; order: number }>();
      fromList.forEach((x, i) => updated.set(x.id, { mat: fromMat, order: i + 1 }));
      toList.forEach((x, i) => updated.set(x.id, { mat: toMat, order: i + 1 }));

      return next.map(x => {
        const u = updated.get(x.id);
        if (!u) return x;
        return { ...x, mat: u.mat, order: u.order };
      });
    });
  }

  async function save() {
    setMsg("Saving...");
    const payload: Record<string, string[]> = {};
    for (let m = 1; m <= numMats; m++) payload[keyMat(m)] = [];

    const grouped: Record<string, Bout[]> = {};
    for (const b of bouts) {
      const m = b.mat ?? 1;
      const k = keyMat(m);
      grouped[k] ??= [];
      grouped[k].push(b);
    }
    for (const k of Object.keys(payload)) {
      const list = (grouped[k] ?? []).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      payload[k] = list.map(x => x.id);
    }

    await fetch(`/api/meets/${meetId}/bouts/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mats: payload }),
    });

    setMsg("Saved.");
    await load();
    setTimeout(() => setMsg(""), 1200);
  }

  function boutLabel(b: Bout) {
    const r = wMap[b.redId];
    const g = wMap[b.greenId];
    const rTxt = r ? `${r.first} ${r.last} (${r.weight}) — ${teamName(r.teamId)}` : b.redId;
    const gTxt = g ? `${g.first} ${g.last} (${g.weight}) — ${teamName(g.teamId)}` : b.greenId;
    return { rTxt, gTxt };
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <a href={`/meets/${meetId}`}>← Back</a>
        <a href={`/meets/${meetId}/wall`} target="_blank" rel="noreferrer">Wall Chart</a>
        <button onClick={save}>Save Order</button>
        {msg && <span>{msg}</span>}
        <label style={{ marginLeft: 12 }}>
          Mats:
          <input type="number" min={1} max={10} value={numMats}
            onChange={e => setNumMats(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${numMats}, minmax(260px, 1fr))`, gap: 12, marginTop: 12 }}>
        {Array.from({ length: numMats }, (_, idx) => idx + 1).map(matNum => {
          const list = mats[keyMat(matNum)] ?? [];
          return (
            <div key={matNum}
              style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10, minHeight: 240 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragging) return;
                moveBout(dragging.boutId, matNum, list.length);
                setDragging(null);
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 style={{ margin: 0 }}>Mat {matNum}</h3>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{list.length} bouts</span>
              </div>

              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {list.map((b, i) => {
                  const { rTxt, gTxt } = boutLabel(b);
                  return (
                    <div key={b.id} draggable
                      onDragStart={() => setDragging({ boutId: b.id, fromMat: matNum })}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!dragging) return;
                        moveBout(dragging.boutId, matNum, i);
                        setDragging(null);
                      }}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 10,
                        padding: 10,
                        background: "#fff",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                        cursor: "grab",
                      }}
                      title="Drag to reorder or move to another mat"
                    >
                      <div style={{ fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                        <span>Bout {b.order ?? i + 1}</span>
                        <span>{b.locked ? "LOCKED" : ""}</span>
                      </div>
                      <div style={{ fontWeight: 600, marginTop: 4 }}>{rTxt}</div>
                      <div style={{ marginTop: 2 }}>{gTxt}</div>
                      {b.notes && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{b.notes}</div>}
                    </div>
                  );
                })}

                {list.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.7, padding: 10, border: "1px dashed #ddd", borderRadius: 10 }}>
                    Drop bouts here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
