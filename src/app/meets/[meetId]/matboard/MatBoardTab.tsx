"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Team = { id: string; name: string; symbol?: string; color?: string };
type Wrestler = {
  id: string;
  first: string;
  last: string;
  weight: number;
  teamId: string;
  status?: "LATE" | "EARLY" | "NOT_COMING" | "ABSENT" | null;
};
type Bout = {
  id: string;
  redId: string;
  greenId: string;
  type: string;
  score: number;
  mat?: number | null;
  order?: number | null;
};
type LockState = {
  status: "loading" | "acquired" | "locked";
  lockedByUsername?: string | null;
  lockExpiresAt?: string | null;
};

const keyMat = (m: number) => String(m);

export default function MatBoardTab({
  meetId,
  onMatAssignmentsChange,
}: {
  meetId: string;
  onMatAssignmentsChange?: () => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler | undefined>>({});
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [numMats, setNumMats] = useState(4);
  const [conflictGap, setConflictGap] = useState(3);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const [msg, setMsg] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const lockStatusRef = useRef<LockState["status"]>("loading");
  const [highlightWrestlerId, setHighlightWrestlerId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [dragging, setDragging] = useState<{ boutId: string; fromMat: number } | null>(null);
  const draggingRef = useRef<{ boutId: string; fromMat: number } | null>(null);
  const dropIndexRef = useRef<{ mat: number; index: number } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSavingRef = useRef(false);
  const saveOrderRef = useRef<((opts?: { silent?: boolean; keepalive?: boolean }) => Promise<void>) | null>(null);

  const canEdit = lockState.status === "acquired";

  useEffect(() => {
    void load();
  }, [meetId]);

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
        void saveOrderRef.current?.({ silent: true, keepalive: true });
      }
    };
    window.addEventListener("pagehide", saveOnExit);
    return () => {
      saveOnExit();
      window.removeEventListener("pagehide", saveOnExit);
    };
  }, [canEdit]);

  useEffect(() => {
    if (!dirty || !canEdit) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (autoSavingRef.current) return;
    const timer = setTimeout(async () => {
      autoSavingRef.current = true;
      try {
        await saveOrderRef.current?.({ silent: true });
      } finally {
        autoSavingRef.current = false;
      }
    }, 1000);
    autoSaveTimerRef.current = timer;
    return () => {
      if (autoSaveTimerRef.current === timer) {
        clearTimeout(timer);
        autoSaveTimerRef.current = null;
      }
    };
  }, [dirty, canEdit]);

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
    const map: Record<string, Wrestler> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);

    const maxMat = Math.max(0, ...bJson.map(b => b.mat ?? 0));
    setNumMats(maxMat > 0 ? maxMat : 4);
    setDirty(false);
    dirtyRef.current = false;
  }

  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      lockStatusRef.current = "acquired";
      setLockState({ status: "acquired", lockExpiresAt: data.lockExpiresAt });
    } else if (res.status === 409) {
      const data = await res.json();
      lockStatusRef.current = "locked";
      setLockState({ status: "locked", lockedByUsername: data.lockedByUsername });
    } else if (res.status === 401 || res.status === 403) {
      const json = await res.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to edit meets.");
    }
  }

  function releaseLock() {
    fetch(`/api/meets/${meetId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
  }

  const mats = useMemo(() => {
    const out: Record<string, Bout[]> = {};
    for (let m = 1; m <= numMats; m++) out[keyMat(m)] = [];

    for (const b of bouts) {
      const r = wMap[b.redId];
      const g = wMap[b.greenId];
      if (
        r?.status === "NOT_COMING" ||
        r?.status === "ABSENT" ||
        g?.status === "NOT_COMING" ||
        g?.status === "ABSENT"
      )
        continue;
      const m = b.mat ?? 1;
      const k = keyMat(Math.min(Math.max(1, m), numMats));
      out[k] ??= [];
      out[k].push(b);
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    }
    return out;
  }, [bouts, numMats, wMap]);

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

  const conflictSeverity = useMemo(() => {
    if (conflictGap <= 0) return new Map<string, number>();
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

    const severity = new Map<string, number>();
    for (const [wrestlerId, list] of byWrestler.entries()) {
      list.sort((a, b) => a.order - b.order);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const gap = list[j].order - list[i].order;
          if (gap > conflictGap) break;
          const key = (boutId: string) => `${boutId}-${wrestlerId}`;
          const update = (boutId: string) => {
            const mapKey = key(boutId);
            const current = severity.get(mapKey);
            severity.set(mapKey, current === undefined ? gap : Math.min(current, gap));
          };
          update(list[i].boutId);
          update(list[j].boutId);
        }
      }
    }
    return severity;
  }, [mats, conflictGap]);

  function moveBout(boutId: string, toMat: number, toIndex: number) {
    setBouts(prev => {
      const b = prev.find(x => x.id === boutId);
      if (!b) return prev;

      const fromMat = b.mat ?? 1;
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

  function reorderMat(matNum: number) {
    if (!canEdit) return;
    setBouts(prev => {
      const next = prev.map(b => ({ ...b }));
      const byMat = new Map<number, Bout[]>();
      for (const b of next) {
        const m = b.mat ?? 1;
        byMat.set(m, [...(byMat.get(m) ?? []), b]);
      }
      const matKeys = Array.from({ length: numMats }, (_, i) => i + 1);
      const matLists = matKeys.map(key => byMat.get(key) ?? []);
      const matIndex = matKeys.indexOf(matNum);
      if (matIndex === -1) return next;
      const targetList = matLists[matIndex];
      const ordered = reorderBoutsForMat(targetList, [targetList], 0, conflictGap);
      const updated = new Map<string, { mat: number; order: number }>();
      ordered.forEach((bout, idx) => {
        updated.set(bout.id, { mat: matNum, order: idx + 1 });
      });
      return next.map(x => {
        const u = updated.get(x.id);
        if (!u) return x;
        return { ...x, mat: u.mat, order: u.order };
      });
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

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    autoSavingRef.current = false;

    setDirty(false);
    dirtyRef.current = false;
    if (!silent) {
      setMsg("Saved.");
      await load();
      setTimeout(() => setMsg(""), 1200);
    }
    onMatAssignmentsChange?.();
  }

  async function save() {
    await saveOrder();
  }

  useEffect(() => {
    saveOrderRef.current = saveOrder;
  });

  function teamName(teamId: string) {
    const team = teams.find(t => t.id === teamId);
    return team?.symbol ?? team?.name ?? teamId;
  }

  function teamColor(teamId: string) {
    return teams.find(t => t.id === teamId)?.color ?? "#000000";
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

  const formatBoutNumber = (matNum: number, order?: number | null, fallback?: number) => {
    const ordValue = order ?? fallback ?? 0;
    const ordStr = String(ordValue);
    const paddedOrder = ordStr.length >= 2 ? ordStr : ordStr.padStart(2, "0");
    return `${matNum}${paddedOrder}`;
  };

  return (
    <section className="matboard-tab">
      <style>{`
        .matboard-tab {
          background: #fff;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .matboard-tab h3 {
          margin: 0;
          font-family: "Oswald", Arial, sans-serif;
          letter-spacing: 0.5px;
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .nav-btn {
          color: #1d232b;
          background: transparent;
          border: 1px solid #d5dbe2;
          border-radius: 6px;
          padding: 8px 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          cursor: pointer;
        }
        .nav-btn[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .toolbar label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }
        .toolbar input {
          width: 64px;
          padding: 4px 6px;
          border: 1px solid #d5dbe2;
          border-radius: 4px;
        }
        .notice {
          border: 1px solid #e8c3c3;
          background: #fff3f3;
          padding: 10px;
          border-radius: 8px;
          color: #b00020;
        }
        .lock-notice {
          border: 1px solid #ccdff2;
          background: #eef3fb;
          padding: 10px;
          border-radius: 8px;
          color: #0d3b66;
        }
        .mat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
        }
        .mat-card {
          border: 1px solid #dfe3e8;
          border-radius: 10px;
          padding: 10px;
          min-height: 200px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #fdfefe;
        }
        .mat-card h4 {
          margin: 0;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 16px;
        }
        .bout {
          border: 1px solid #eee;
          border-radius: 8px;
          padding: 10px;
          background: #fff;
          cursor: grab;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .bout.dragging {
          opacity: 0.6;
        }
        .bout-row {
          display: grid;
          grid-template-columns: 54px 1fr 1fr;
          gap: 10px;
          font-size: 14px;
          opacity: 0.9;
          align-items: center;
        }
        .bout-row span.number {
          font-size: 18px;
          font-weight: 700;
          color: #1d232b;
          text-align: center;
        }
        .bout-row span {
          display: block;
        }
        .bout-row span[data-role="wrestler"] {
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          border-radius: 4px;
          padding: 2px 4px;
        }
        .bout-row span.single-match {
          font-style: italic;
        }
        .bout-row span[data-role="wrestler"].highlight {
          outline: 2px solid #111;
        }
        .empty-slot {
          font-size: 12px;
          opacity: 0.7;
          padding: 10px;
          border: 1px dashed #ddd;
          border-radius: 10px;
        }
        .conflict {
          background: #ffd6df;
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3>Mat Assignments</h3>
        {msg && <span style={{ fontSize: 13, fontWeight: 600 }}>{msg}</span>}
      </div>
      <div className="toolbar">
        <label>
          Mats:
          <input
            type="number"
            min={1}
            max={10}
            value={numMats}
            onChange={e => setNumMats(Number(e.target.value))}
          />
        </label>
        <label>
          Conflict gap:
          <input
            type="number"
            min={0}
            max={20}
            value={conflictGap}
            onChange={e => setConflictGap(Number(e.target.value))}
          />
        </label>
        <span style={{ fontSize: 14, color: "#5a6673", fontWeight: 600 }}>
          Pink = too close · Wrestlers with only one match appear in italics.
        </span>
      </div>
      {authMsg && <div className="notice">{authMsg}</div>}
      {lockState.status === "locked" && (
        <div className="lock-notice">
          Editing locked by {lockState.lockedByUsername ?? "another user"}.
        </div>
      )}
      <div className="mat-grid">
        {Array.from({ length: numMats }, (_, idx) => idx + 1).map(matNum => {
          const list = mats[keyMat(matNum)] ?? [];
          const conflictCount = list.reduce((count, b) => {
            const redSeverity = conflictSeverity.get(`${b.id}-${b.redId}`);
            const greenSeverity = conflictSeverity.get(`${b.id}-${b.greenId}`);
            return count + (redSeverity !== undefined || greenSeverity !== undefined ? 1 : 0);
          }, 0);
          return (
            <div
              key={matNum}
              className="mat-card"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const active = draggingRef.current;
                if (!active || !canEdit) return;
                const dropIndex = dropIndexRef.current?.mat === matNum ? dropIndexRef.current.index : list.length;
                moveBout(active.boutId, matNum, dropIndex);
                setDragging(null);
                draggingRef.current = null;
                dropIndexRef.current = null;
              }}
            >
              <h4>
                <span>Mat {matNum}</span>
                <button
                  className="nav-btn reorder-inline-btn"
                  onClick={() => reorderMat(matNum)}
                  disabled={!canEdit}
                  style={{ fontSize: 12, padding: "4px 8px" }}
                >
                  Reorder
                </button>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{list.length} bouts</span>
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {list.map((b, index) => {
                  const { rTxt, gTxt, rColor, gColor, rStatus, gStatus } = boutLabel(b);
                  const getSeverity = (wrestlerId: string) => conflictSeverity.get(`${b.id}-${wrestlerId}`);
                  const severityRed = getSeverity(b.redId);
                  const severityGreen = getSeverity(b.greenId);
                  const singleMatchRed = (matchCounts.get(b.redId) ?? 0) === 1;
                  const singleMatchGreen = (matchCounts.get(b.greenId) ?? 0) === 1;
                  const normalized = (value?: number) =>
                    value === undefined
                      ? 0
                      : conflictGap > 1
                        ? Math.max(0, Math.min(1, (conflictGap - value) / (conflictGap - 1)))
                        : 1;
                  const conflictBgRed =
                    severityRed !== undefined ? `rgba(255,138,160,${0.2 + 0.25 * normalized(severityRed)})` : undefined;
                  const conflictBgGreen =
                    severityGreen !== undefined ? `rgba(255,138,160,${0.2 + 0.25 * normalized(severityGreen)})` : undefined;
                  const isRedHighlighted = highlightWrestlerId === b.redId;
                  const isGreenHighlighted = highlightWrestlerId === b.greenId;
                  return (
                    <div
                      key={b.id}
                      className={`bout${dragging?.boutId === b.id ? " dragging" : ""}`}
                      draggable={canEdit}
                      onDragStart={e => {
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
                      onDragOver={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropIndexRef.current = { mat: matNum, index };
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const active = draggingRef.current;
                        if (!active || !canEdit) return;
                        moveBout(active.boutId, matNum, index);
                        setDragging(null);
                        draggingRef.current = null;
                        dropIndexRef.current = null;
                      }}
                    >
                      <div className="bout-row">
                          <span className="number">{formatBoutNumber(matNum, b.order, index + 1)}</span>
                        <span
                          data-role="wrestler"
                          className={[
                            isRedHighlighted ? "highlight" : "",
                            singleMatchRed ? "single-match" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            color: rColor || undefined,
                            background:
                              conflictBgRed ??
                              (rStatus === "EARLY"
                                ? "#f3eadf"
                                : rStatus === "LATE"
                                  ? "#e6f6ea"
                                  : undefined),
                          }}
                          onMouseEnter={() => setHighlightWrestlerId(b.redId)}
                          onMouseLeave={() => setHighlightWrestlerId(null)}
                        >
                          {rTxt}
                        </span>
                        <span
                          data-role="wrestler"
                          className={[
                            isGreenHighlighted ? "highlight" : "",
                            singleMatchGreen ? "single-match" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            color: gColor || undefined,
                            background:
                              conflictBgGreen ??
                              (gStatus === "EARLY"
                                ? "#f3eadf"
                                : gStatus === "LATE"
                                  ? "#e6f6ea"
                                  : undefined),
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
                {list.length === 0 && <div className="empty-slot">Drop bouts here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
