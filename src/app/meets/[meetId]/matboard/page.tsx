"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Team = { id: string; name: string; symbol?: string; color?: string };
type Wrestler = { id: string; first: string; last: string; weight: number; teamId: string; status?: "LATE" | "EARLY" | "NOT_COMING" | "ABSENT" | null };
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
  const [authMsg, setAuthMsg] = useState("");
  const [conflictGap, setConflictGap] = useState(3);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const lockStatusRef = useRef<LockState["status"]>("loading");
  const [highlightWrestlerId, setHighlightWrestlerId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  const [dragging, setDragging] = useState<{ boutId: string; fromMat: number } | null>(null);
  const draggingRef = useRef<{ boutId: string; fromMat: number } | null>(null);
  const dropIndexRef = useRef<{ mat: number; index: number } | null>(null);

  function updateLockState(next: LockState) {
    lockStatusRef.current = next.status;
    setLockState(next);
  }

  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.status === 401) {
      setAuthMsg("Please sign in to edit this meet.");
      return;
    }
    if (res.status === 403) {
      const json = await res.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to edit this meet.");
      return;
    }
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
    if (bRes.status === 401 || wRes.status === 401) {
      setAuthMsg("Please sign in to view this meet.");
      return;
    }
    if (bRes.status === 403 || wRes.status === 403) {
      const json = await bRes.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to view this meet.");
      return;
    }

    const bJson: Bout[] = await bRes.json();
    setBouts(bJson);

    const wJson = await wRes.json();
    setTeams(wJson.teams);
    const map: Record<string, Wrestler | undefined> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);

    const maxMat = Math.max(0, ...bJson.map(b => b.mat ?? 0));
    setNumMats(maxMat > 0 ? maxMat : 4);
    setDirty(false);
    dirtyRef.current = false;
  }

  const canEdit = lockState.status === "acquired";

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

  useEffect(() => {
    const saveOnExit = () => {
      if (dirtyRef.current && canEdit) {
        void saveOrder({ silent: true, keepalive: true });
      }
    };
    window.addEventListener("pagehide", saveOnExit);
    return () => {
      saveOnExit();
      window.removeEventListener("pagehide", saveOnExit);
    };
  }, [canEdit, meetId]);

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
      if (r?.status === "NOT_COMING" || r?.status === "ABSENT" || g?.status === "NOT_COMING" || g?.status === "ABSENT") continue;
      const m = b.mat ?? 1;
      const k = keyMat(Math.min(Math.max(1, m), numMats));
      out[k] ??= [];
      out[k].push(b);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    return out;
  }, [bouts, numMats]);

  const matchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const list of Object.values(mats)) {
      for (const bout of list) {
        counts.set(bout.redId, (counts.get(bout.redId) ?? 0) + 1);
        counts.set(bout.greenId, (counts.get(bout.greenId) ?? 0) + 1);
      }
    }
    return counts;
  }, [mats]);

  const conflictByWrestler = useMemo(() => {
    if (conflictGap <= 0) return new Map<string, Set<string>>();
    const byWrestler = new Map<string, { boutId: string; order: number }[]>();
    const matLists = Object.values(mats);
    for (const list of matLists) {
      list.forEach((b, idx) => {
        const o = idx + 1;
        for (const wid of [b.redId, b.greenId]) {
          const entries = byWrestler.get(wid) ?? [];
          entries.push({ boutId: b.id, order: o });
          byWrestler.set(wid, entries);
        }
      });
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
  }, [mats, conflictGap]);

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
    setDirty(true);
    dirtyRef.current = true;
  }

  function computeConflictCount(matLists: Bout[][], gap: number) {
    if (gap <= 0) return 0;
    const byWrestler = new Map<string, number[]>();
    for (const list of matLists) {
      list.forEach((b, idx) => {
        const o = idx + 1;
        const red = byWrestler.get(b.redId) ?? [];
        red.push(o);
        byWrestler.set(b.redId, red);
        const green = byWrestler.get(b.greenId) ?? [];
        green.push(o);
        byWrestler.set(b.greenId, green);
      });
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

  function reorderBoutsForMat(list: Bout[], allMats: Bout[][], matIndex: number, gap: number) {
    const base = list.slice();
    if (gap <= 0) return base;

    function scoreCandidate(candidate: Bout[]) {
      const matsCopy = allMats.map(m => m.slice());
      if (matIndex >= 0) matsCopy[matIndex] = candidate;
      return computeConflictCount(matsCopy, gap);
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
      const matLists = Array.from(byMat.values());
      const matEntries = Array.from(byMat.entries());
      for (let idx = 0; idx < matEntries.length; idx++) {
        const [m, list] = matEntries[idx];
        const ordered = reorderBoutsForMat(list, matLists, idx, conflictGap);
        ordered.forEach((b, idx) => {
          b.mat = m;
          b.order = idx + 1;
        });
      }
      return next;
    });
    setDirty(true);
    dirtyRef.current = true;
  }

  async function saveOrder(opts?: { silent?: boolean; keepalive?: boolean }) {
    if (!canEdit) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setMsg("Saving...");
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
      keepalive: Boolean(opts?.keepalive),
    });

    setDirty(false);
    dirtyRef.current = false;
    if (!silent) {
      setMsg("Saved.");
      await load();
      setTimeout(() => setMsg(""), 1200);
    }
  }

  async function save() {
    await saveOrder();
  }

  function boutLabel(b: Bout) {
    const r = wMap[b.redId];
    const g = wMap[b.greenId];
    const rTxt = r ? `${r.first} ${r.last} (${teamName(r.teamId)})` : b.redId;
    const gTxt = g ? `${g.first} ${g.last} (${teamName(g.teamId)})` : b.greenId;
    const rColor = r ? teamColor(r.teamId) : "";
    const gColor = g ? teamColor(g.teamId) : "";
    return { rTxt, gTxt, rColor, gColor, rStatus: r?.status ?? null, gStatus: g?.status ?? null };
  }

  return (
    <main className="matboard">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --accent: #1e88e5;
          --line: #d5dbe2;
          --warn: #b00020;
        }
        .matboard {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .matboard a {
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
        }
        .matboard a:hover {
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
        .subnav {
          display: flex;
          gap: 14px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .subnav a {
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid transparent;
        }
        .subnav a:hover {
          border-color: var(--line);
          background: #f7f9fb;
        }
        .notice {
          border: 1px solid #e8c3c3;
          background: #fff3f3;
          padding: 10px;
          border-radius: 8px;
          margin-top: 12px;
          color: var(--warn);
        }
        .toolbar {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .toolbar label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .toolbar input {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 8px;
        }
        .wrestler-name.single-match {
          font-style: italic;
        }
        h2 {
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      `}</style>
      <AppHeader links={headerLinks} />
      <div className="subnav">
        <a href={`/meets/${meetId}`}>Meet Pairings</a>
        <a href={`/meets/${meetId}#wall`} rel="noreferrer">
          Wall Charts
        </a>
      </div>

      <h2>Mat Assignments</h2>
      <div className="toolbar">
        <button className="nav-btn" onClick={autoReorder} disabled={!canEdit}>Auto Reorder</button>
        <button className="nav-btn" onClick={save} disabled={!canEdit}>Save Order</button>
        {msg && <span>{msg}</span>}
        <label>
          Mats:
          <input
            type="number"
            min={1}
            max={10}
            value={numMats}
            onChange={e => setNumMats(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </label>
        <label>
          Conflict gap:
          <input
            type="number"
            min={0}
            max={20}
            value={conflictGap}
            onChange={(e) => setConflictGap(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </label>
        <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>
          Pink = too close · Wrestlers with only one match appear in italics.
        </span>
      </div>

      {authMsg && (
        <div className="notice">
          {authMsg}
        </div>
      )}

      {lockState.status === "locked" && (
        <div className="notice">
          Editing locked by {lockState.lockedByUsername ?? "another user"}. Try again when they are done.
          <button className="nav-btn" onClick={acquireLock} style={{ marginLeft: 10 }}>Try again</button>
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
                const active = draggingRef.current;
                if (!active || !canEdit) return;
                const dropIndex = dropIndexRef.current?.mat === matNum
                  ? dropIndexRef.current.index
                  : list.length;
                moveBout(active.boutId, matNum, dropIndex);
                setDragging(null);
                draggingRef.current = null;
                dropIndexRef.current = null;
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
                      onDragStart={(e) => {
                        if (!canEdit) return;
                        const target = e.target as HTMLElement | null;
                        if (target?.dataset?.role === "wrestler") {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", b.id);
                        const next = { boutId: b.id, fromMat: matNum };
                        draggingRef.current = next;
                        setDragging(next);
                      }}
                      onDragEnd={() => {
                        draggingRef.current = null;
                        setDragging(null);
                        dropIndexRef.current = null;
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropIndexRef.current = { mat: matNum, index: i };
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const active = draggingRef.current;
                        if (!active || !canEdit) return;
                        moveBout(active.boutId, matNum, i);
                        setDragging(null);
                        draggingRef.current = null;
                        dropIndexRef.current = null;
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
                        <span>{i + 1}</span>
                        <span
                          className={`wrestler-name${(matchCounts.get(b.redId) ?? 0) === 1 ? " single-match" : ""}`}
                          data-role="wrestler"
                          style={{
                            fontStyle: (matchCounts.get(b.redId) ?? 0) === 1 ? "italic" : undefined,
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
                          onMouseEnter={() => setHighlightWrestlerId(b.redId)}
                          onMouseLeave={() => setHighlightWrestlerId(null)}
                        >
                          {rTxt}
                        </span>
                        <span
                          className={`wrestler-name${(matchCounts.get(b.greenId) ?? 0) === 1 ? " single-match" : ""}`}
                          data-role="wrestler"
                          style={{
                            fontStyle: (matchCounts.get(b.greenId) ?? 0) === 1 ? "italic" : undefined,
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
                          onMouseEnter={() => setHighlightWrestlerId(b.greenId)}
                          onMouseLeave={() => setHighlightWrestlerId(null)}
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
