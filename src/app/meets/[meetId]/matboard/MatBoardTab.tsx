"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MAT_RULES } from "@/lib/matRules";

type Team = { id: string; name: string; symbol?: string; color?: string };
type Wrestler = {
  id: string;
  first: string;
  last: string;
  weight: number;
  teamId: string;
  birthdate?: string | null;
  experienceYears?: number | null;
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
  originalMat?: number | null;
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
  meetStatus,
}: {
  meetId: string;
  onMatAssignmentsChange?: () => void;
  meetStatus: "DRAFT" | "PUBLISHED";
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler | undefined>>({});
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [numMats, setNumMats] = useState(0);
  const [conflictGap] = useState(3);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const [msg, setMsg] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [matRuleColors, setMatRuleColors] = useState<Record<number, string | null>>({});
  const [meetSettings, setMeetSettings] = useState<{ numMats: number; homeTeamId?: string | null } | null>(null);
  const [italicizeSingles, setItalicizeSingles] = useState(true);
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
  const canEdit = lockState.status === "acquired" && meetStatus === "DRAFT";

  useEffect(() => {
    void load();
  }, [meetId]);

  useEffect(() => {
    if (!meetSettings) return;
    setNumMats(typeof meetSettings.numMats === "number" ? meetSettings.numMats : 4);
  }, [meetSettings]);

  useEffect(() => {
    let cancelled = false;
    const fetchMatColors = async () => {
      const meetRes = await fetch(`/api/meets/${meetId}`);
      if (!meetRes.ok) {
        if (!cancelled) {
          setMatRuleColors({});
          setMeetSettings(null);
        }
        return;
      }
      const meet = await meetRes.json().catch(() => null);
      if (!cancelled) {
        setMeetSettings({
          numMats: typeof meet?.numMats === "number" ? meet.numMats : 4,
          homeTeamId: meet?.homeTeamId ?? null,
        });
      }
      const homeTeamId = meet?.homeTeamId;
      if (!homeTeamId) {
        if (!cancelled) setMatRuleColors({});
        return;
      }
      const rulesRes = await fetch(`/api/meets/${meetId}/mat-rules`);
      if (!rulesRes.ok) {
        if (!cancelled) setMatRuleColors({});
        return;
      }
      const payload = await rulesRes.json().catch(() => null);
      if (cancelled) return;
      const colors: Record<number, string | null> = {};
      const rules = Array.isArray(payload?.rules) ? payload.rules : [];
      for (const rule of rules) {
        if (typeof rule.matIndex === "number") {
          const suggestedColor = typeof rule.color === "string" ? rule.color.trim() : "";
          colors[rule.matIndex] = suggestedColor || null;
        }
      }
      setMatRuleColors(colors);
    };
    void fetchMatColors();
    return () => {
      cancelled = true;
    };
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
    if ([bRes, wRes].some(r => r.status === 401)) {
      setAuthMsg("Please sign in to view this meet.");
      return;
    }
    if ([bRes, wRes].some(r => r.status === 403)) {
      const forbidden = [bRes, wRes].find(r => r.status === 403);
      const json = await forbidden!.json().catch(() => ({}));
      setAuthMsg(json?.error ?? "You are not authorized to view this meet.");
      return;
    }

    const bJson: Bout[] = await bRes.json();
    setBouts(bJson.map(b => ({ ...b, originalMat: b.originalMat ?? b.mat ?? null })));

    const wJson = await wRes.json();
    setTeams(wJson.teams);
    const map: Record<string, Wrestler> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);

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
      const next = prev.map(x => ({ ...x }));
      const b = next.find(x => x.id === boutId);
      if (!b) return prev;

      const fromMat = b.mat ?? 1;
      if (b.originalMat == null) {
        b.originalMat = fromMat;
      }

      const fromList = next
        .filter(x => (x.mat ?? 1) === fromMat && x.id !== boutId)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

      const toList = next
        .filter(x => (x.mat ?? 1) === toMat && x.id !== boutId)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

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

  function computeConflictSummary(matLists: Bout[][], gap: number) {
    const counts = Array(gap + 1).fill(0);
    if (gap < 0) return counts;
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
    for (const orders of byWrestler.values()) {
      orders.sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        for (let j = i + 1; j < orders.length; j++) {
          const diff = orders[j] - orders[i];
          if (diff > gap) break;
          counts[diff] += 1;
        }
      }
    }
    return counts;
  }

  function compareConflictSummary(a: number[], b: number[]) {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) {
        return a[i] - b[i];
      }
    }
    return a.length - b.length;
  }

  function buildOtherMatOrders(allMats: Bout[][], matIndex: number) {
    const map = new Map<string, Set<number>>();
    allMats.forEach((list, idx) => {
      if (idx === matIndex) return;
      list.forEach((b, pos) => {
        const order = pos + 1;
        for (const id of [b.redId, b.greenId]) {
          if (!map.has(id)) map.set(id, new Set());
          map.get(id)!.add(order);
        }
      });
    });
    return map;
  }

  function hasZeroConflict(bout: Bout, order: number, otherOrders: Map<string, Set<number>>) {
    const check = (id: string) => otherOrders.get(id)?.has(order);
    return Boolean(check(bout.redId) || check(bout.greenId));
  }

  function trySlide(
    list: Bout[],
    idx: number,
    direction: -1 | 1,
    otherOrders: Map<string, Set<number>>,
  ) {
    const target = idx + direction;
    if (target < 0 || target >= list.length) return false;
    const current = list[idx];
    const neighbor = list[target];
    const newCurrentOrder = target + 1;
    const newNeighborOrder = idx + 1;
    if (hasZeroConflict(current, newCurrentOrder, otherOrders)) return false;
    if (hasZeroConflict(neighbor, newNeighborOrder, otherOrders)) return false;
    [list[idx], list[target]] = [list[target], list[idx]];
    return true;
  }

  function resolveZeroGapConflicts(
    list: Bout[],
    allMats: Bout[][],
    matIndex: number,
    gap: number,
  ) {
    const otherOrders = buildOtherMatOrders(allMats, matIndex);
    let changed = true;
    while (changed) {
      changed = false;
      for (let idx = 0; idx < list.length; idx++) {
        const order = idx + 1;
        if (!hasZeroConflict(list[idx], order, otherOrders)) continue;
        if (trySlide(list, idx, -1, otherOrders) || trySlide(list, idx, 1, otherOrders)) {
          changed = true;
          break;
        }
      }
    }
    return list;
  }

  function reorderBoutsForMat(list: Bout[], allMats: Bout[][], matIndex: number, gap: number) {
    const base = list.slice();
    if (gap <= 0) return base;

    function scoreCandidate(candidate: Bout[]) {
      const matsCopy = allMats.map(m => m.slice());
      if (matIndex >= 0) matsCopy[matIndex] = candidate;
      return computeConflictSummary(matsCopy, gap);
    }

    let best = base.slice();
    let bestScore = scoreCandidate(best);
    const attempts = Math.max(25, closestPowerOfTwo(base.length * 4));
    for (let iter = 0; iter < attempts; iter++) {
      if (best.length < 2) break;
      const next = best.slice();
      const idx = Math.floor(Math.random() * (next.length - 1));
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      const score = scoreCandidate(next);
      const delta = compareConflictSummary(score, bestScore);
      const accept = delta < 0 || Math.random() < 0.05;
      if (accept) {
        best = next;
        bestScore = score;
      }
    }
    const resolved = resolveZeroGapConflicts(best, allMats, matIndex, gap);
    allMats[matIndex] = resolved.slice();
    return resolved;
  }

  function closestPowerOfTwo(value: number) {
    let power = 1;
    while (power < value) power <<= 1;
    return power;
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
      const ordered = reorderBoutsForMat(targetList, matLists, matIndex, conflictGap);
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

  const parseHexColor = (hex: string) => {
    const clean = hex.replace("#", "");
    const normalized = clean.length === 3
      ? clean
          .split("")
          .map(ch => ch + ch)
          .join("")
      : clean;
    const num = parseInt(normalized.slice(0, 6), 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return { r, g, b };
  };
  const hexToRGBA = (hex: string, alpha: number) => {
    const { r, g, b } = parseHexColor(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  const toHSL = (r: number, g: number, b: number) => {
    const rp = r / 255;
    const gp = g / 255;
    const bp = b / 255;
    const max = Math.max(rp, gp, bp);
    const min = Math.min(rp, gp, bp);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rp) h = ((gp - bp) / d + (gp < bp ? 6 : 0)) * 60;
      else if (max === gp) h = ((bp - rp) / d + 2) * 60;
      else h = ((rp - gp) / d + 4) * 60;
    }
    return { h, s, l };
  };
  const hslToRgb = ({ h, s, l }: { h: number; s: number; l: number }) => {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 360;
      if (t >= 360) t -= 360;
      if (t < 60) return p + (q - p) * t / 60;
      if (t < 180) return q;
      if (t < 240) return p + (q - p) * (240 - t) / 60;
      return p;
    };
    let r: number;
    let g: number;
    let b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 120);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 120);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  };
  const mixWithWhite = (hex: string, weight = 0.85) => {
    const { r, g, b } = parseHexColor(hex);
    const mix = (channel: number) => Math.round(channel + (255 - channel) * weight);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  };
  const getDefaultMatColor = (matIndex: number) => {
    const preset = DEFAULT_MAT_RULES[(matIndex - 1) % DEFAULT_MAT_RULES.length];
    return preset?.color ?? "#f2f2f2";
  };
  const getMatColor = (matIndex: number) => {
    if (!matIndex || matIndex < 1) return "#f2f2f2";
    const stored = matRuleColors[matIndex];
    if (stored && stored.trim()) return stored.trim();
    return getDefaultMatColor(matIndex);
  };
  const getMatNumberBackground = (color?: string | null) => {
    if (!color) return "#f2f2f2";
    if (color.startsWith("#")) {
      return mixWithWhite(color);
    }
    return color;
  };

  return (
    <section className="matboard-tab">
      <style>{`
        .matboard-tab {
          background: #fff;
          border-radius: 10px;
          padding: 8px;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
          z-index: 0;
          font-size: 13px;
        }
        .matboard-tab h3 {
          margin: 0;
          font-family: "Oswald", Arial, sans-serif;
          letter-spacing: 0.5px;
          font-size: 20px;
        }
        .matboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .matboard-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .matboard-italic-control {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: #5a6673;
          font-weight: 600;
        }
        .matboard-legend {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
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
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
        }
        .mat-card {
          border: 1px solid #dfe3e8;
          border-radius: 10px;
          padding: 4px;
          min-height: 140px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: #fdfefe;
        }
        .mat-card h4 {
          margin: 0;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 16px;
        }
        .mat-number {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .mat-color-indicator {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          border: 1px solid #ccd1da;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
        }
        .bout {
          border: 1px solid #eee;
          border-radius: 6px;
          padding: 0;
          background: #fff;
          cursor: grab;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .bout.dragging {
          opacity: 1;
          box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
          border-color: #c3c9d5;
          transform: translateY(-1px);
        }
        .bout-row {
          display: grid;
          grid-template-columns: max-content 1fr 1fr;
          gap: 0;
          font-size: 11px;
          opacity: 0.9;
          align-items: center;
          padding: 0;
        }
        .bout-row span.number {
          font-size: 12px;
          font-weight: 700;
          color: #1d232b;
          text-align: center;
          border: 2px solid transparent;
          border-radius: 6px;
          padding: 1px 0;
          margin-right: 6px;
          min-width: 34px;
        }
        .bout-row span {
          display: block;
        }
        .bout-row span[data-role="wrestler"] {
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          border-radius: 4px;
          padding: 1px 3px;
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
        @media (max-width: 700px) {
        .mat-grid {
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        .mat-card {
          min-height: 120px;
          padding: 3px;
        }
        .bout-row {
          grid-template-columns: max-content 1fr 1fr;
          font-size: 10px;
          gap: 0;
          padding: 0;
        }
        .bout-row span.number {
          min-width: 24px;
        }
      }
      `}</style>
        <div className="matboard-header">
          <div className="matboard-header-left">
            <h3>Mat Assignments</h3>
            <label className="matboard-italic-control">
              <input
                type="checkbox"
                checked={italicizeSingles}
                onChange={e => setItalicizeSingles(e.target.checked)}
              />
              <span>
                Show wrestlers with only one match in <em>italics</em>
              </span>
            </label>
          </div>
          <div className="matboard-legend">
          <span style={{ fontWeight: 600 }}>Legend:</span>
          <span style={{ background: "#ffd6df", padding: "2px 6px", borderRadius: 6 }}>Conflict</span>
          <span style={{ background: "#dff1ff", padding: "2px 6px", borderRadius: 6 }}>Arrive Late</span>
          <span style={{ background: "#f3eadf", padding: "2px 6px", borderRadius: 6 }}>Leave Early</span>
        </div>
        {msg && <span style={{ fontSize: 13, fontWeight: 600 }}>{msg}</span>}
      </div>
      <div className="toolbar" style={{ alignItems: "flex-start" }}></div>
      {authMsg && <div className="notice">{authMsg}</div>}
      {lockState.status === "locked" && (
        <div className="lock-notice">
          Editing locked by {lockState.lockedByUsername ?? "another user"}.
        </div>
      )}
      <div className="mat-grid">
        {Array.from({ length: numMats }, (_, idx) => idx + 1).map(matNum => {
          const list = mats[keyMat(matNum)] ?? [];
          const matColor = getMatColor(matNum);
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
                <span className="mat-number">
                  Mat {matNum}
                  <span
                    className="mat-color-indicator"
                    style={{ backgroundColor: matColor }}
                    aria-hidden="true"
                  />
                </span>
                <button
                  className="nav-btn reorder-inline-btn"
                  onClick={() => reorderMat(matNum)}
                  disabled={!canEdit}
                  style={{ fontSize: 12, padding: "0px 8px" }}
                >
                  Reorder
                </button>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{list.length} bouts</span>
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {list.map((b, index) => {
      const { rTxt, gTxt, rColor, gColor, rStatus, gStatus } = boutLabel(b);
      const getSeverity = (wrestlerId: string) => conflictSeverity.get(`${b.id}-${wrestlerId}`);
      const severityRed = getSeverity(b.redId);
      const severityGreen = getSeverity(b.greenId);
      const singleMatchRed = italicizeSingles && (matchCounts.get(b.redId) ?? 0) === 1;
      const singleMatchGreen = italicizeSingles && (matchCounts.get(b.greenId) ?? 0) === 1;
      const conflictOpacity = (value?: number) => {
        if (value === undefined) return undefined;
                    if (value <= 0) return 0.45;
                    const maxGap = Math.max(1, conflictGap);
                    const ratio = Math.max(0, Math.min(1, (maxGap - value) / maxGap));
                    return 0.25 + 0.15 * ratio;
                  };
                  const conflictBgRed =
                    severityRed !== undefined ? `rgba(255,138,160,${conflictOpacity(severityRed)})` : undefined;
                  const conflictBgGreen =
                    severityGreen !== undefined ? `rgba(255,138,160,${conflictOpacity(severityGreen)})` : undefined;
                  const statusBgRed = rStatus === "EARLY" ? "#f3eadf" : rStatus === "LATE" ? "#dff1ff" : undefined;
      const statusBgGreen = gStatus === "EARLY" ? "#f3eadf" : gStatus === "LATE" ? "#dff1ff" : undefined;
      const isRedHighlighted = highlightWrestlerId === b.redId;
      const isGreenHighlighted = highlightWrestlerId === b.greenId;
      const originalMatColor =
        b.originalMat != null && b.originalMat !== matNum
          ? getMatColor(b.originalMat)
          : matColor;
      const homeTeamId = meetSettings?.homeTeamId ?? null;
      const isHomeRed = homeTeamId ? wMap[b.redId]?.teamId === homeTeamId : false;
      const isHomeGreen = homeTeamId ? wMap[b.greenId]?.teamId === homeTeamId : false;
      const entries = [
        {
          id: b.redId,
          label: rTxt,
          color: rColor,
          statusBg: statusBgRed,
          conflictBg: conflictBgRed,
          singleMatch: singleMatchRed,
          highlight: isRedHighlighted,
        },
        {
          id: b.greenId,
          label: gTxt,
          color: gColor,
          statusBg: statusBgGreen,
          conflictBg: conflictBgGreen,
          singleMatch: singleMatchGreen,
          highlight: isGreenHighlighted,
        },
      ];
      const ordered = (() => {
        if (homeTeamId) {
          if (isHomeGreen && !isHomeRed) return [entries[1], entries[0]];
          return entries;
        }
        return entries;
      })();
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
                          <span
                            className={`number${b.originalMat != null && b.originalMat !== matNum ? " moved" : ""}`}
                          style={{
                            backgroundColor: getMatNumberBackground(originalMatColor),
                            borderColor:
                              b.originalMat != null && b.originalMat !== matNum ? originalMatColor : "transparent",
                          }}
                        >
                          {formatBoutNumber(matNum, b.order, index + 1)}
                          </span>
                        {ordered.map(entry => (
                          <span
                            key={entry.id}
                            data-role="wrestler"
                            className={[
                              entry.highlight ? "highlight" : "",
                              entry.singleMatch ? "single-match" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={{
                              color: entry.color || undefined,
                              background:
                                entry.statusBg ??
                                entry.conflictBg ??
                                undefined,
                            }}
                            onMouseEnter={() => setHighlightWrestlerId(entry.id)}
                            onMouseLeave={() => setHighlightWrestlerId(null)}
                          >
                            {entry.label}
                          </span>
                        ))}
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
