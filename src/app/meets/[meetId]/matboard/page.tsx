"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";

type Team = { id: string; name: string; symbol?: string; color?: string };
type Wrestler = { id: string; first: string; last: string; weight: number; teamId: string; status?: "LATE" | "EARLY" | "ABSENT" | null };
type Bout = {
  id: string;
  redId: string;
  greenId: string;
  type: string;
  score: number;
  notes?: string | null;
  mat?: number | null;
  order?: number | null;
};

type LockState = {
  status: "loading" | "acquired" | "locked";
  lockedByUsername?: string | null;
  lockExpiresAt?: string | null;
};

function keyMat(m: number) { return String(m); }

export default function MatBoard({ params }: { params: Promise<{ meetId: string }> }) {
  const { meetId } = use(params);

  const [teams, setTeams] = useState<Team[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler | undefined>>({});
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [numMats, setNumMats] = useState(4);
  const [msg, setMsg] = useState("");
  const [conflictGap, setConflictGap] = useState(6);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const lockStatusRef = useRef<LockState["status"]>("loading");
  const [highlightWrestlerId, setHighlightWrestlerId] = useState<string | null>(null);

  const [dragging, setDragging] = useState<{ boutId: string; fromMat: number } | null>(null);

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

  async function load() {
    const [bRes, wRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/pairings`),
      fetch(`/api/meets/${meetId}/wrestlers`),
    ]);

    const bJson: Bout[] = await bRes.json();
    setBouts(bJson);

    const wJson = await wRes.json();
    setTeams(wJson.teams);
    const map: Record<string, Wrestler | undefined> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);

    const maxMat = Math.max(0, ...bJson.map(b => b.mat ?? 0));
    setNumMats(maxMat > 0 ? maxMat : 4);
  }

  useEffect(() => { void load(); }, [meetId]);
  useEffect(() => {
    void acquireLock();
    const interval = setInterval(() => {
      if (lockStatusRef.current === "acquired") {
        void acquireLock();
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

  function teamName(teamId: string) {
    const team = teams.find(t => t.id === teamId);
    return team?.symbol ?? team?.name ?? teamId;
  }
  function teamColor(teamId: string) {
    return teams.find(t => t.id === teamId)?.color ?? "#000000";
  }

  const mats = useMemo(() => {
    const out: Record<string, Bout[]> = {};
    for (let m = 1; m <= numMats; m++) out[keyMat(m)] = [];

    for (const b of bouts) {
      const r = wMap[b.redId];
      const g = wMap[b.greenId];
      if (r?.status === "ABSENT" || g?.status === "ABSENT") continue;
      const m = b.mat ?? 1;
      const k = keyMat(Math.min(Math.max(1, m), numMats));
      out[k] ??= [];
      out[k].push(b);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    return out;
  }, [bouts, numMats]);

  const conflictByWrestler = useMemo(() => {
    if (conflictGap <= 0) return new Map<string, Set<string>>();
    const byWrestler = new Map<string, { boutId: string; order: number }[]>();
    for (const b of bouts) {
      if (!b.order) continue;
      const o = b.order;
      for (const wid of [b.redId, b.greenId]) {
        const list = byWrestler.get(wid) ?? [];
        list.push({ boutId: b.id, order: o });
        byWrestler.set(wid, list);
      }
    }

    const conflicts = new Map<string, Set<string>>();
    for (const [wrestlerId, list] of byWrestler.entries()) {
      list.sort((a, b) => a.order - b.order);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const gap = list[j].order - list[i].order;
          if (gap > conflictGap) break;
          const set = conflicts.get(wrestlerId) ?? new Set<string>();
          set.add(list[i].boutId);
          set.add(list[j].boutId);
          conflicts.set(wrestlerId, set);
        }
      }
    }
    return conflicts;
  }, [bouts, conflictGap]);

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

  function computeConflictCount(list: Bout[], gap: number) {
    if (gap <= 0) return 0;
    const byWrestler = new Map<string, number[]>();
    for (const b of list) {
      if (b.order == null) continue;
      const o = b.order;
      const red = byWrestler.get(b.redId) ?? [];
      red.push(o);
      byWrestler.set(b.redId, red);
      const green = byWrestler.get(b.greenId) ?? [];
      green.push(o);
      byWrestler.set(b.greenId, green);
    }
    let conflicts = 0;
    for (const orders of byWrestler.values()) {
      orders.sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        for (let j = i + 1; j < orders.length; j++) {
          const diff = orders[j] - orders[i];
          if (diff > gap) break;
          conflicts += 1;
        }
      }
    }
    return conflicts;
  }

  function reorderBoutsForMat(list: Bout[], allBouts: Bout[], gap: number) {
    const base = list.slice().sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    if (gap <= 0) return base;
    const originalOrders = new Map(base.map(b => [b.id, b.order ?? null]));

    function scoreCandidate(candidate: Bout[]) {
      candidate.forEach((b, idx) => { b.order = idx + 1; });
      const score = computeConflictCount(allBouts, gap);
      candidate.forEach(b => { b.order = originalOrders.get(b.id) ?? null; });
      return score;
    }

    let best = base;
    let bestScore = scoreCandidate(base);

    for (let i = 0; i < base.length; i++) {
      for (let j = 0; j < base.length; j++) {
        if (i === j) continue;
        const candidate = base.slice();
        const [moved] = candidate.splice(i, 1);
        candidate.splice(j, 0, moved);
        const score = scoreCandidate(candidate);
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    return best;
  }

  function autoReorder() {
    if (!canEdit) return;
    setBouts(prev => {
      const next = prev.map(b => ({ ...b }));
      const byMat = new Map<number, Bout[]>();
      for (const b of next) {
        const m = b.mat ?? 1;
        byMat.set(m, [...(byMat.get(m) ?? []), b]);
      }
      for (const [m, list] of byMat.entries()) {
        const ordered = reorderBoutsForMat(list, next, conflictGap);
        ordered.forEach((b, idx) => {
          b.mat = m;
          b.order = idx + 1;
        });
      }
      return next;
    });
  }

  async function save() {
    if (!canEdit) return;
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
    const rTxt = r ? `${r.first} ${r.last} — ${teamName(r.teamId)}` : b.redId;
    const gTxt = g ? `${g.first} ${g.last} — ${teamName(g.teamId)}` : b.greenId;
    const rColor = r ? teamColor(r.teamId) : "";
    const gColor = g ? teamColor(g.teamId) : "";
    return { rTxt, gTxt, rColor, gColor, rStatus: r?.status ?? null, gStatus: g?.status ?? null };
  }

  function toggleHighlight(wrestlerId: string) {
    setHighlightWrestlerId(prev => (prev === wrestlerId ? null : wrestlerId));
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <a href={`/meets/${meetId}`}>← Back</a>
        <a href={`/meets/${meetId}/wall`} target="_blank" rel="noreferrer">Wall Chart</a>
        <button onClick={autoReorder} disabled={!canEdit}>Auto Reorder</button>
        <button onClick={save} disabled={!canEdit}>Save Order</button>
        {msg && <span>{msg}</span>}
        <label style={{ marginLeft: 12 }}>
          Mats:
          <input type="number" min={1} max={10} value={numMats}
            onChange={e => setNumMats(Number(e.target.value))} style={{ width: 60, marginLeft: 6 }} />
        </label>
        <label>
          Conflict gap:
          <input
            type="number"
            min={0}
            max={20}
            value={conflictGap}
            onChange={(e) => setConflictGap(Number(e.target.value))}
            style={{ width: 60, marginLeft: 6 }}
          />
        </label>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Pink = too close</span>
      </div>

      {lockState.status === "locked" && (
        <div style={{ border: "1px solid #e8c3c3", background: "#fff3f3", padding: 10, borderRadius: 8, marginTop: 12 }}>
          Editing locked by {lockState.lockedByUsername ?? "another user"}. Try again when they are done.
          <button onClick={acquireLock} style={{ marginLeft: 10 }}>Try again</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${numMats}, minmax(260px, 1fr))`, gap: 12, marginTop: 12 }}>
        {Array.from({ length: numMats }, (_, idx) => idx + 1).map(matNum => {
          const list = mats[keyMat(matNum)] ?? [];
          return (
            <div key={matNum}
              style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10, minHeight: 240 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragging || !canEdit) return;
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
                  const { rTxt, gTxt, rColor, gColor, rStatus, gStatus } = boutLabel(b);
                  const redConflict = conflictByWrestler.get(b.redId)?.has(b.id) ?? false;
                  const greenConflict = conflictByWrestler.get(b.greenId)?.has(b.id) ?? false;
                  const isRedHighlighted = highlightWrestlerId === b.redId;
                  const isGreenHighlighted = highlightWrestlerId === b.greenId;
                  return (
                    <div key={b.id} draggable={canEdit}
                      onClick={() => setHighlightWrestlerId(null)}
                      onDragStart={(e) => {
                        if (!canEdit) return;
                        const target = e.target as HTMLElement | null;
                        if (target?.dataset?.role === "wrestler") {
                          e.preventDefault();
                          return;
                        }
                        setDragging({ boutId: b.id, fromMat: matNum });
                      }}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!dragging || !canEdit) return;
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
                      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr", gap: 8, fontSize: 12, opacity: 0.85 }}>
                        <span>{b.order ?? i + 1}</span>
                        <span
                          data-role="wrestler"
                          style={{
                            color: rColor || undefined,
                            background: redConflict
                              ? "#ffd6df"
                              : rStatus === "EARLY"
                                ? "#f3eadf"
                                : rStatus === "LATE"
                                  ? "#e6f6ea"
                                  : undefined,
                            borderRadius: 4,
                            padding: redConflict || isRedHighlighted ? "0 4px" : undefined,
                            outline: isRedHighlighted ? "2px solid #111" : undefined,
                            display: "block",
                            cursor: "pointer",
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); toggleHighlight(b.redId); }}
                        >
                          {rTxt}
                        </span>
                        <span
                          data-role="wrestler"
                          style={{
                            color: gColor || undefined,
                            background: greenConflict
                              ? "#ffd6df"
                              : gStatus === "EARLY"
                                ? "#f3eadf"
                                : gStatus === "LATE"
                                  ? "#e6f6ea"
                                  : undefined,
                            borderRadius: 4,
                            padding: greenConflict || isGreenHighlighted ? "0 4px" : undefined,
                            outline: isGreenHighlighted ? "2px solid #111" : undefined,
                            display: "block",
                            cursor: "pointer",
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); toggleHighlight(b.greenId); }}
                        >
                          {gTxt}
                        </span>
                      </div>
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
