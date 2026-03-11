"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { DEFAULT_MAT_RULES } from "@/lib/matRules";

type VolunteerRole = "COACH" | "TABLE_WORKER" | "PARENT";


type KidBout = {
  id: string;
  mat: number | null;
  order: number | null;
  boutNumber: string | null;
};

type KidAssignment = {
  id: string;
  name: string;
  bouts: KidBout[];
};

type TeamSummary = {
  id: string;
  name: string;
  symbol?: string | null;
};

type MeetSummary = {
  id: string;
  numMats: number;
  homeTeamId?: string | null;
  teams: TeamSummary[];
};

type Volunteer = {
  id: string;
  displayName: string;
  role: VolunteerRole;
  teamId?: string | null;
  matNumber?: number | null;
  kids: KidAssignment[];
};

type VolunteersPayload = {
  meet: MeetSummary;
  volunteers: Volunteer[];
};

type MatRulesPayload = {
  rules?: Array<{
    matIndex?: number;
    color?: string | null;
  }>;
};

const VOLUNTEERS_FONT_SIZE_STORAGE_KEY = "volunteersTableFontSize";
const DEFAULT_VOLUNTEERS_FONT_SIZE = 13;
const MIN_VOLUNTEERS_FONT_SIZE = 10;
const MAX_VOLUNTEERS_FONT_SIZE = 22;

function clampVolunteersFontSize(value: number) {
  return Math.max(MIN_VOLUNTEERS_FONT_SIZE, Math.min(MAX_VOLUNTEERS_FONT_SIZE, Math.round(value)));
}

function readStoredVolunteersFontSize() {
  if (typeof window === "undefined") return DEFAULT_VOLUNTEERS_FONT_SIZE;
  const stored = window.localStorage.getItem(VOLUNTEERS_FONT_SIZE_STORAGE_KEY);
  if (!stored) return DEFAULT_VOLUNTEERS_FONT_SIZE;
  const parsed = Number(stored);
  return Number.isFinite(parsed)
    ? clampVolunteersFontSize(parsed)
    : DEFAULT_VOLUNTEERS_FONT_SIZE;
}

function roleLabel(role: VolunteerRole) {
  if (role === "COACH") return "Coach";
  if (role === "TABLE_WORKER") return "Table Worker";
  return "Parent";
}

function roleRank(role: VolunteerRole) {
  if (role === "COACH") return 0;
  if (role === "TABLE_WORKER") return 1;
  return 2;
}

function normalizeFuzzyText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzyMatch(value: string, query: string) {
  const needle = normalizeFuzzyText(query);
  if (!needle) return true;
  const haystack = normalizeFuzzyText(value);
  if (!haystack) return false;
  if (haystack.includes(needle)) return true;
  let needleIndex = 0;
  for (let i = 0; i < haystack.length && needleIndex < needle.length; i += 1) {
    if (haystack[i] === needle[needleIndex]) needleIndex += 1;
  }
  return needleIndex === needle.length;
}

function canBeInUnassignedPool(volunteer: Volunteer, homeTeamId: string | null) {
  const isHomeTeam = homeTeamId ? volunteer.teamId === homeTeamId : true;
  if (!isHomeTeam) return false;
  return true;
}

function setVolunteerDragImage(event: React.DragEvent<HTMLDivElement>) {
  const source = event.currentTarget;
  const rect = source.getBoundingClientRect();
  const preview = source.cloneNode(true) as HTMLDivElement;
  preview.style.position = "fixed";
  preview.style.top = "-10000px";
  preview.style.left = "-10000px";
  preview.style.width = `${rect.width}px`;
  preview.style.maxWidth = `${rect.width}px`;
  preview.style.margin = "0";
  preview.style.pointerEvents = "none";
  preview.style.boxSizing = "border-box";
  preview.style.zIndex = "9999";
  document.body.appendChild(preview);
  const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  event.dataTransfer.setDragImage(preview, offsetX, offsetY);
  setTimeout(() => {
    preview.remove();
  }, 0);
}

export default function VolunteersTab({
  meetId,
  canEdit,
  hideReadonlyEditNotice = false,
  onSaved,
}: {
  meetId: string;
  canEdit: boolean;
  hideReadonlyEditNotice?: boolean;
  onSaved?: () => void;
}) {
  const [payload, setPayload] = useState<VolunteersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragVolunteerId, setDragVolunteerId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    volunteerId: string;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingBouts, setUpdatingBouts] = useState(false);
  const [dirtyMats, setDirtyMats] = useState<number[]>([]);
  const [poolSearch, setPoolSearch] = useState("");
  const [matColors, setMatColors] = useState<Record<number, string>>({});
  const [pendingMovedCount, setPendingMovedCount] = useState<number | null>(null);
  const [movingVolunteerId, setMovingVolunteerId] = useState<string | null>(null);
  const [volunteersFontSize, setVolunteersFontSize] = useState(DEFAULT_VOLUNTEERS_FONT_SIZE);
  const [volunteersFontSizeReady, setVolunteersFontSizeReady] = useState(false);
  const [volunteersFontSizeOpen, setVolunteersFontSizeOpen] = useState(false);
  const [volunteersFontSizeSliding, setVolunteersFontSizeSliding] = useState(false);
  const volunteersFontSizeControlRef = useRef<HTMLDivElement | null>(null);
  const volunteersFontSizeInputRef = useRef<HTMLInputElement | null>(null);
  const dragVolunteerIdRef = useRef<string | null>(null);
  const dragImageRef = useRef<HTMLImageElement | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setDirtyMats([]);
    setPendingMovedCount(null);
    Promise.all([
      fetch(`/api/meets/${meetId}/volunteers`),
      fetch(`/api/meets/${meetId}/mat-rules`).catch(() => null),
    ])
      .then(async ([volunteersRes, matRulesRes]) => {
        if (!volunteersRes.ok) {
          const json = await volunteersRes.json().catch(() => null);
          throw new Error(json?.error ?? "Unable to load volunteers.");
        }
        const volunteersJson = await volunteersRes.json() as VolunteersPayload;
        let matRulesJson: MatRulesPayload | null = null;
        if (matRulesRes?.ok) {
          matRulesJson = await matRulesRes.json().catch(() => null);
        }
        if (!mounted) return;
        setPayload(volunteersJson);
        if (canEdit) {
          void refreshDirtyMats();
        }
        const colorMap: Record<number, string> = {};
        for (const rule of matRulesJson?.rules ?? []) {
          const matIndex = rule.matIndex;
          const color = rule.color?.trim();
          if (typeof matIndex !== "number") continue;
          if (!color) continue;
          colorMap[matIndex] = color;
        }
        setMatColors(colorMap);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load volunteers.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [meetId, canEdit]);
  useLayoutEffect(() => {
    setVolunteersFontSize(readStoredVolunteersFontSize());
    setVolunteersFontSizeReady(true);
  }, []);
  useEffect(() => {
    if (!volunteersFontSizeOpen) return;
    volunteersFontSizeInputRef.current?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (volunteersFontSizeControlRef.current?.contains(target)) return;
      setVolunteersFontSizeOpen(false);
      setVolunteersFontSizeSliding(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [volunteersFontSizeOpen]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!volunteersFontSizeReady) return;
    window.localStorage.setItem(VOLUNTEERS_FONT_SIZE_STORAGE_KEY, String(volunteersFontSize));
  }, [volunteersFontSize, volunteersFontSizeReady]);
  useEffect(() => {
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    dragImageRef.current = img;
  }, []);
  useEffect(() => {
    return () => {
      if (dragPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(dragPreviewFrameRef.current);
      }
    };
  }, []);

  const volunteers = payload?.volunteers ?? [];
  const meet = payload?.meet ?? null;
  const numMats = Math.max(1, Math.min(8, meet?.numMats ?? 4));
  const homeTeamId = meet?.homeTeamId ?? null;
  const matSwatchColor = (matNumber: number) => {
    const configured = matColors[matNumber];
    if (configured && configured.trim().length > 0) return configured;
    const preset = DEFAULT_MAT_RULES[(matNumber - 1) % DEFAULT_MAT_RULES.length];
    return preset.color ?? "#f2f2f2";
  };

  async function refreshVolunteersPayload() {
    const volunteersRes = await fetch(`/api/meets/${meetId}/volunteers`);
    if (!volunteersRes.ok) return false;
    const refreshed = await volunteersRes.json() as VolunteersPayload;
    setPayload(refreshed);
    return true;
  }

  function countWrongBoutsForVolunteer(volunteer: Volunteer) {
    const volunteerMat = volunteer.matNumber;
    if (volunteerMat === null || volunteerMat === undefined) return 0;
    let wrongCount = 0;
    for (const kid of volunteer.kids) {
      for (const bout of kid.bouts) {
        if (bout.mat !== volunteerMat) {
          wrongCount += 1;
        }
      }
    }
    return wrongCount;
  }

  async function refreshDirtyMats() {
    if (!canEdit) {
      setDirtyMats([]);
      setPendingMovedCount(null);
      return;
    }
    const fallbackDirty = Array.from({ length: numMats }, (_, idx) => idx + 1);
    try {
      const res = await fetch(`/api/meets/${meetId}/mats/people-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDirtyMats(fallbackDirty);
        setPendingMovedCount(null);
        return;
      }
      const affectedMats = (json as { affectedMats?: unknown } | null)?.affectedMats;
      const nextDirty: number[] = Array.isArray(affectedMats)
        ? affectedMats.filter((mat): mat is number => typeof mat === "number")
        : [];
      setDirtyMats(nextDirty.sort((a, b) => a - b));
      const moved = typeof (json as { moved?: unknown } | null)?.moved === "number"
        ? (json as { moved: number }).moved
        : null;
      setPendingMovedCount(moved);
    } catch {
      setDirtyMats(fallbackDirty);
      setPendingMovedCount(null);
    }
  }

  const setVolunteerMat = (volunteerId: string, matNumber: number | null) => {
    if (!payload) return;
    const next = payload.volunteers.map((volunteer) => {
      if (volunteer.id !== volunteerId) return volunteer;
      const nextMat = matNumber ?? null;
      const currentMat = volunteer.matNumber ?? null;
      if (currentMat === nextMat) return volunteer;
      return { ...volunteer, matNumber: nextMat };
    });
    const changed = next.some((volunteer, index) => volunteer !== payload.volunteers[index]);
    if (!changed) return;
    setPayload({ ...payload, volunteers: next });
    void saveAssignments(next);
  };

  const sortedPool = useMemo(() => {
    return volunteers
      .filter((volunteer) => {
        if ((volunteer.matNumber ?? null) !== null) return false;
        return canBeInUnassignedPool(volunteer, homeTeamId);
      })
      .slice()
      .sort((a, b) => {
        const roleCmp = roleRank(a.role) - roleRank(b.role);
        if (roleCmp !== 0) return roleCmp;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [volunteers, homeTeamId]);

  const filteredPool = useMemo(() => {
    const query = poolSearch.trim();
    if (!query) return sortedPool;
    return sortedPool.filter((volunteer) => {
      const searchable = [
        volunteer.displayName,
        roleLabel(volunteer.role),
        volunteer.kids.map((kid) => kid.name).join(" "),
      ].join(" ");
      return fuzzyMatch(searchable, query);
    });
  }, [sortedPool, poolSearch]);

  const volunteersByMat = useMemo(() => {
    const map = new Map<number, Volunteer[]>();
    for (let mat = 1; mat <= numMats; mat += 1) map.set(mat, []);
    for (const volunteer of volunteers) {
      const mat = volunteer.matNumber ?? null;
      if (!mat || mat < 1 || mat > numMats) continue;
      map.get(mat)?.push(volunteer);
    }
    for (const mat of map.keys()) {
      const sorted = (map.get(mat) ?? []).slice().sort((a, b) => {
        const aHome = a.teamId && homeTeamId ? a.teamId === homeTeamId : false;
        const bHome = b.teamId && homeTeamId ? b.teamId === homeTeamId : false;
        if (aHome !== bHome) return aHome ? -1 : 1;
        const roleCmp = roleRank(a.role) - roleRank(b.role);
        if (roleCmp !== 0) return roleCmp;
        return a.displayName.localeCompare(b.displayName);
      });
      map.set(mat, sorted);
    }
    return map;
  }, [volunteers, numMats, homeTeamId]);
  const kidAssignedMatsById = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const volunteer of volunteers) {
      const volunteerMat = volunteer.matNumber ?? null;
      if (volunteerMat === null) continue;
      for (const kid of volunteer.kids) {
        const mats = map.get(kid.id) ?? new Set<number>();
        mats.add(volunteerMat);
        map.set(kid.id, mats);
      }
    }
    return map;
  }, [volunteers]);
  const kidParentAssignmentsById = useMemo(() => {
    const map = new Map<string, Array<{ volunteerId: string; volunteerName: string; mat: number }>>();
    for (const volunteer of volunteers) {
      const volunteerMat = volunteer.matNumber ?? null;
      if (volunteerMat === null) continue;
      for (const kid of volunteer.kids) {
        const rows = map.get(kid.id) ?? [];
        rows.push({ volunteerId: volunteer.id, volunteerName: volunteer.displayName, mat: volunteerMat });
        map.set(kid.id, rows);
      }
    }
    return map;
  }, [volunteers]);
  const noMatUpdatesNeeded = dirtyMats.length === 0;
  const matchesToMove = pendingMovedCount ?? 0;
  const volunteersFontSliderPercent =
    ((volunteersFontSize - MIN_VOLUNTEERS_FONT_SIZE)
      / (MAX_VOLUNTEERS_FONT_SIZE - MIN_VOLUNTEERS_FONT_SIZE))
    * 100;
  const volunteersFontStyle = {
    "--volunteers-title-font-size": `${volunteersFontSize + 1}px`,
    "--volunteers-line-font-size": `${volunteersFontSize}px`,
    "--volunteers-kid-font-size": `${Math.max(10, volunteersFontSize - 1)}px`,
    "--volunteers-bout-font-size": `${Math.max(10, volunteersFontSize - 2)}px`,
  } as CSSProperties;
  const updateButtonDisabled = saving || updatingBouts || Boolean(movingVolunteerId) || matchesToMove <= 0;
  const updateButtonTooltip =
    matchesToMove <= 0
      ? "No matches to move."
      : noMatUpdatesNeeded
        ? "No detected mat updates yet."
        : undefined;
  const dragPreviewVolunteer = dragPreview
    ? volunteers.find((volunteer) => volunteer.id === dragPreview.volunteerId) ?? null
    : null;

  const clearVolunteerDrag = () => {
    dragVolunteerIdRef.current = null;
    setDragVolunteerId(null);
    setDragPreview(null);
  };

  const handleVolunteerDragPreviewMove = (event: React.DragEvent<HTMLElement>) => {
    if (!dragVolunteerIdRef.current) return;
    if (event.clientX === 0 && event.clientY === 0) return;
    if (dragPreviewFrameRef.current !== null) return;
    const clientX = event.clientX;
    const clientY = event.clientY;
    dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
      dragPreviewFrameRef.current = null;
      const volunteerId = dragVolunteerIdRef.current;
      if (!volunteerId) return;
      setDragPreview((current) => (
        current?.volunteerId === volunteerId
          ? { ...current, x: clientX, y: clientY }
          : current
      ));
    });
  };

  const onDropToMat = (matNumber: number) => {
    const activeVolunteerId = dragVolunteerIdRef.current ?? dragVolunteerId;
    if (!canEdit || !activeVolunteerId || saving || updatingBouts) return;
    setVolunteerMat(activeVolunteerId, matNumber);
    clearVolunteerDrag();
  };

  const onDropToPool = () => {
    const activeVolunteerId = dragVolunteerIdRef.current ?? dragVolunteerId;
    if (!canEdit || !activeVolunteerId || saving || updatingBouts) return;
    const dragged = volunteers.find((volunteer) => volunteer.id === activeVolunteerId);
    if (!dragged || !canBeInUnassignedPool(dragged, homeTeamId)) {
      clearVolunteerDrag();
      return;
    }
    setVolunteerMat(activeVolunteerId, null);
    clearVolunteerDrag();
  };

  async function saveAssignments(volunteersToSave?: Volunteer[]) {
    if (!canEdit || saving) return;
    const sourceVolunteers = volunteersToSave ?? payload?.volunteers;
    if (!sourceVolunteers) return;
    setSaving(true);
    try {
      const assignments = sourceVolunteers.map((volunteer) => ({
        userId: volunteer.id,
        matNumber: volunteer.matNumber ?? null,
      }));
      const res = await fetch(`/api/meets/${meetId}/volunteers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: string } | null)?.error ?? "Unable to save volunteer mat assignments.";
        window.alert(message);
        return;
      }
      void refreshDirtyMats();
    } catch {
      window.alert("Unable to save volunteer mat assignments.");
    } finally {
      setSaving(false);
    }
  }

  async function updateBoutMats() {
    if (!canEdit || saving || updatingBouts || !payload) return;
    setUpdatingBouts(true);
    try {
      const res = await fetch(`/api/meets/${meetId}/mats/people-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dirtyMats.length > 0 ? { matsToReorder: dirtyMats } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: string } | null)?.error ?? "Unable to move matches to volunteer mats.";
        window.alert(message);
        return;
      }
      void refreshDirtyMats();
      await refreshVolunteersPayload();
      onSaved?.();
    } catch {
      window.alert("Unable to move matches to volunteer mats.");
    } finally {
      setUpdatingBouts(false);
    }
  }

  async function moveVolunteerKids(volunteer: Volunteer) {
    if (!canEdit || saving || updatingBouts || movingVolunteerId) return;
    if (volunteer.matNumber === null || volunteer.matNumber === undefined) return;
    const wrongCount = countWrongBoutsForVolunteer(volunteer);
    if (wrongCount === 0) {
      return;
    }
    setMovingVolunteerId(volunteer.id);
    try {
      const res = await fetch(`/api/meets/${meetId}/volunteers/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteerId: volunteer.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: string } | null)?.error ?? "Unable to move this volunteer's kids matches.";
        window.alert(message);
        return;
      }
      await refreshVolunteersPayload();
      void refreshDirtyMats();
      onSaved?.();
    } catch {
      window.alert("Unable to move this volunteer's kids matches.");
    } finally {
      setMovingVolunteerId(null);
    }
  }

  const styles = `
    .volunteers-tab {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .volunteers-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
      padding-left: 8px;
    }
    .volunteers-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .volunteers-help-note {
      font-size: 14px;
      font-weight: 600;
      color: #4f6073;
      flex: 1 1 320px;
      line-height: 1.35;
    }
    .volunteers-btn-wrap {
      display: inline-flex;
    }
    .volunteers-btn {
      border: 1px solid #0b5ecf;
      border-radius: 6px;
      background: #1f78ff;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      cursor: pointer;
    }
    .volunteers-btn:disabled {
      border-color: #cfdae7;
      background: #fff;
      color: #8a97a8;
      opacity: 1;
      cursor: not-allowed;
    }
    .volunteers-grid {
      display: grid;
      grid-template-columns: 3fr 1.3fr;
      gap: 10px;
      min-height: 420px;
    }
    .volunteers-mat-grid {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(${numMats}, minmax(220px, 1fr));
      align-items: start;
    }
    .volunteers-mat-card,
    .volunteers-pool {
      border: 1px solid #dfe3e8;
      border-radius: 10px;
      background: #fff;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 240px;
    }
    .volunteers-pool {
      max-height: calc(100vh - 220px);
      overflow: hidden;
    }
    .volunteers-mat-title,
    .volunteers-pool-title {
      font-weight: 700;
      font-size: var(--volunteers-title-font-size, 14px);
      color: #203040;
    }
    .volunteers-mat-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .volunteers-mat-swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1px solid #c7cfdb;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
      flex: 0 0 auto;
    }
    .volunteers-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .volunteers-pool .volunteers-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: auto;
      max-width: 100vw;
    }
    .volunteers-pool-search {
      width: 100%;
      border: 1px solid #cfd8e3;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 12px;
      color: #243444;
      background: #fff;
    }
    .volunteer-chip {
      border: 1px solid #d5dbe2;
      border-radius: 8px;
      background: #f8fafd;
      padding: 6px 8px;
      cursor: grab;
      user-select: none;
    }
    .volunteer-chip.dragging {
      opacity: 0.35;
      border-style: dashed;
      border-color: #8a93a1;
      background: #f7f9fc;
      box-shadow: 0 0 0 2px rgba(63, 83, 111, 0.14);
      cursor: grabbing;
    }
    .volunteer-chip.clickable-move {
      cursor: pointer;
    }
    .volunteer-chip:active {
      cursor: grabbing;
    }
    .volunteer-line-1 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: var(--volunteers-line-font-size, 13px);
      font-weight: 700;
      color: #1f2f41;
    }
    .volunteer-line-2 {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 2px;
      font-size: var(--volunteers-line-font-size, 13px);
      color: #59687a;
      line-height: 1.25;
      white-space: normal;
      word-break: break-word;
    }
    .volunteer-kids-bouts {
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .volunteer-kid-row {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 4px;
      font-size: var(--volunteers-kid-font-size, 12px);
      line-height: 1.25;
      color: #4f6073;
    }
    .volunteer-kid-name {
      font-weight: 400;
      color: #2d3c4d;
      margin-right: 2px;
    }
    .volunteer-bout-chip {
      display: inline-flex;
      align-items: center;
      border: 1px solid #cfd8e3;
      border-radius: 999px;
      padding: 1px 7px;
      background: #ffffff;
      color: #233446;
      font-size: var(--volunteers-bout-font-size, 11px);
      font-weight: 600;
    }
    .volunteer-bout-chip.wrong-mat {
      border-color: #d32f2f;
      background: #fdecec;
      color: #a31919;
    }
    .volunteer-bout-chip.conflict-mat {
      border-color: #d7a100;
      background: #fff6d6;
      color: #8a6200;
    }
    .volunteer-bout-chip.unassigned {
      border-color: #d8e0ea;
      background: #f5f7fa;
      color: #708193;
    }
    .volunteers-drag-preview {
      position: fixed;
      z-index: 2000;
      pointer-events: none;
    }
    .volunteers-drag-preview-card {
      border: 1px solid #cbd3de;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.82);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
      padding: 6px 8px;
      overflow: hidden;
    }
    @media (max-width: 1100px) {
      .volunteers-grid {
        grid-template-columns: 1fr;
      }
      .volunteers-mat-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
    }
  `;

  if (loading) return <p>Loading volunteers...</p>;
  if (error) return <div className="notice">{error}</div>;
  if (!payload) return null;

  return (
    <div
      className="volunteers-tab"
      onDragOverCapture={handleVolunteerDragPreviewMove}
      style={volunteersFontStyle}
    >
      <style>{styles}</style>
      <div className="volunteers-toolbar">
        {canEdit && (
          <div className="volunteers-actions">
            <span className="volunteers-btn-wrap" title={updateButtonTooltip}>
              <button
                type="button"
                className="volunteers-btn"
                onClick={() => void updateBoutMats()}
                disabled={updateButtonDisabled}
              >
                {updatingBouts ? "Updating..." : "Move all"}
              </button>
            </span>
          </div>
        )}
        <div className="volunteers-help-note">
          {canEdit && "Drag volunteers to assign mats. On iPad, long-press and drag a card. Click on cards to move their kids' bouts to their mat. "}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Badge colors:</span>
            <span>red = wrong mat, yellow = parents on different mats.</span>
            <span
              ref={volunteersFontSizeControlRef}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                color: "#4b5563",
              }}
            >
              <button
                type="button"
                className="volunteers-btn"
                onClick={() => {
                  setVolunteersFontSizeOpen(open => !open);
                  setVolunteersFontSizeSliding(false);
                }}
                aria-label="Adjust volunteers font size"
                aria-expanded={volunteersFontSizeOpen}
                title="Adjust the volunteers font size"
                style={{
                  borderColor: "#d5dbe2",
                  background: "#fff",
                  color: "#1d232b",
                  padding: "6px 8px",
                  lineHeight: 1,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ display: "inline-flex", alignItems: "baseline", gap: 1, lineHeight: 1 }}
                >
                  <span style={{ fontSize: 18 }}>A</span>
                  <span style={{ fontSize: 13 }}>A</span>
                </span>
              </button>
              {volunteersFontSizeOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 40,
                    width: 220,
                    padding: "10px 12px",
                    border: "1px solid #d5dbe2",
                    borderRadius: 10,
                    background: "#ffffff",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.16)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#4b5563", marginBottom: 8 }}>
                    Change font size
                  </div>
                  <div style={{ position: "relative", overflow: "visible" }}>
                    {volunteersFontSizeSliding && (
                      <span
                        style={{
                          position: "absolute",
                          left: `calc(${volunteersFontSliderPercent}% - 2px)`,
                          top: -18,
                          transform: "translateX(-50%)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#1f2937",
                          background: "#ffffff",
                          padding: "1px 6px",
                          borderRadius: 999,
                          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.18)",
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {volunteersFontSize}px
                      </span>
                    )}
                    <input
                      ref={volunteersFontSizeInputRef}
                      type="range"
                      min={MIN_VOLUNTEERS_FONT_SIZE}
                      max={MAX_VOLUNTEERS_FONT_SIZE}
                      step={1}
                      value={volunteersFontSize}
                      onChange={event => setVolunteersFontSize(clampVolunteersFontSize(Number(event.target.value)))}
                      onPointerDown={() => setVolunteersFontSizeSliding(true)}
                      onPointerUp={() => {
                        setVolunteersFontSizeSliding(false);
                        setVolunteersFontSizeOpen(false);
                      }}
                      onPointerCancel={() => {
                        setVolunteersFontSizeSliding(false);
                        setVolunteersFontSizeOpen(false);
                      }}
                      onBlur={() => {
                        setVolunteersFontSizeSliding(false);
                        setVolunteersFontSizeOpen(false);
                      }}
                      onKeyDown={event => {
                        if (event.key === "Escape") {
                          setVolunteersFontSizeSliding(false);
                          setVolunteersFontSizeOpen(false);
                        }
                      }}
                      aria-label="Adjust volunteers font size"
                      style={{ width: "100%", margin: 0 }}
                    />
                  </div>
                </div>
              )}
            </span>
          </span>
        </div>
      </div>
      {!canEdit && !hideReadonlyEditNotice && (
        <div className="notice">Read-only mode. Start editing to update volunteer mat assignments.</div>
      )}

      <div className="volunteers-grid">
        <div className="volunteers-mat-grid">
          {Array.from({ length: numMats }, (_, idx) => idx + 1).map((matNumber) => {
            const list = volunteersByMat.get(matNumber) ?? [];
            return (
              <div
                key={`volunteer-mat-${matNumber}`}
                className="volunteers-mat-card"
                onDragOver={(event) => {
                  if (!canEdit || saving || updatingBouts) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropToMat(matNumber);
                }}
              >
                <div className="volunteers-mat-title">
                  <span>Mat {matNumber}</span>
                  <span
                    className="volunteers-mat-swatch"
                    style={{ backgroundColor: matSwatchColor(matNumber) }}
                    aria-hidden="true"
                  />
                </div>
                <div className="volunteers-list">
                  {list.map((volunteer) => {
                    const wrongCount = countWrongBoutsForVolunteer(volunteer);
                    const canClickMove =
                      canEdit &&
                      !saving &&
                      !updatingBouts &&
                      !movingVolunteerId &&
                      volunteer.matNumber !== null &&
                      wrongCount > 0;
                    return (
                    <div
                      key={volunteer.id}
                      className={`volunteer-chip${dragVolunteerId === volunteer.id ? " dragging" : ""}${canClickMove ? " clickable-move" : ""}`}
                      draggable={canEdit && !saving && !updatingBouts}
                      onDragStart={(event) => {
                        if (!canEdit) return;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", volunteer.id);
                        if (dragImageRef.current) {
                          event.dataTransfer.setDragImage(dragImageRef.current, 0, 0);
                        } else {
                          setVolunteerDragImage(event);
                        }
                        const rect = event.currentTarget.getBoundingClientRect();
                        const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                        const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
                        dragVolunteerIdRef.current = volunteer.id;
                        setDragVolunteerId(volunteer.id);
                        setDragPreview({
                          volunteerId: volunteer.id,
                          x: event.clientX,
                          y: event.clientY,
                          offsetX,
                          offsetY,
                          width: rect.width,
                        });
                      }}
                      onDragEnd={clearVolunteerDrag}
                      onClick={() => {
                        if (!canClickMove) return;
                        void moveVolunteerKids(volunteer);
                      }}
                      title={canClickMove ? `Move ${wrongCount} mismatched bout${wrongCount === 1 ? "" : "s"} for this volunteer's kids` : undefined}
                    >
                      <div className="volunteer-line-1">
                        <span>{volunteer.displayName}</span>
                        <span>{roleLabel(volunteer.role)}</span>
                      </div>
                      {volunteer.kids.length > 0 && (
                        <div className="volunteer-kids-bouts">
                          {volunteer.kids.map((kid) => (
                            <div key={kid.id} className="volunteer-kid-row">
                              <span className="volunteer-kid-name">{kid.name}</span>
                              {kid.bouts.length === 0 ? (
                                <span className="volunteer-bout-chip unassigned">no bouts</span>
                              ) : (
                                kid.bouts.map((bout) => {
                                  const wrongMat =
                                    volunteer.matNumber !== null &&
                                    bout.mat !== null &&
                                    bout.mat !== volunteer.matNumber;
                                  const kidAssignedMats = kidAssignedMatsById.get(kid.id);
                                  const hasMultiParentMatConflict = (kidAssignedMats?.size ?? 0) > 1;
                                  const conflictMat = wrongMat && hasMultiParentMatConflict;
                                  const parentAssignments = kidParentAssignmentsById.get(kid.id) ?? [];
                                  const otherParent = parentAssignments.find(
                                    (entry) => entry.volunteerId !== volunteer.id && entry.mat !== volunteer.matNumber,
                                  ) ?? parentAssignments.find((entry) => entry.volunteerId !== volunteer.id);
                                  return (
                                    <span
                                      key={`${kid.id}-${bout.id}`}
                                      className={`volunteer-bout-chip${conflictMat ? " conflict-mat" : wrongMat ? " wrong-mat" : bout.mat === null ? " unassigned" : ""}`}
                                      title={
                                        conflictMat
                                          ? `${kid.name} has parents on different mats. ${otherParent ? `${otherParent.volunteerName} is on mat ${otherParent.mat}.` : ""}`.trim()
                                          : wrongMat
                                            ? `Assigned to Mat ${bout.mat}, volunteer is on Mat ${volunteer.matNumber}.`
                                            : undefined
                                      }
                                    >
                                      {bout.boutNumber ?? "Unassigned"}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="volunteers-pool"
          onDragOver={(event) => {
            const activeVolunteerId = dragVolunteerIdRef.current ?? dragVolunteerId;
            if (!canEdit || saving || updatingBouts || !activeVolunteerId) return;
            const dragged = volunteers.find((volunteer) => volunteer.id === activeVolunteerId);
            if (!dragged || !canBeInUnassignedPool(dragged, homeTeamId)) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDropToPool();
          }}
        >
          <div className="volunteers-pool-title">Unassigned</div>
          <input
            type="text"
            className="volunteers-pool-search"
            value={poolSearch}
            onChange={(event) => setPoolSearch(event.target.value)}
            placeholder="Search"
          />
          <div className="volunteers-list">
            {sortedPool.length === 0 && (
              <div style={{ color: "#748396", fontSize: 12 }}>No unassigned volunteers.</div>
            )}
            {sortedPool.length > 0 && filteredPool.length === 0 && (
              <div style={{ color: "#748396", fontSize: 12 }}>No matches.</div>
            )}
            {filteredPool.map((volunteer) => (
              <div
                key={`pool-${volunteer.id}`}
                className={`volunteer-chip${dragVolunteerId === volunteer.id ? " dragging" : ""}`}
                draggable={canEdit && !saving && !updatingBouts}
                onDragStart={(event) => {
                  if (!canEdit) return;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", volunteer.id);
                  if (dragImageRef.current) {
                    event.dataTransfer.setDragImage(dragImageRef.current, 0, 0);
                  } else {
                    setVolunteerDragImage(event);
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                  const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
                  dragVolunteerIdRef.current = volunteer.id;
                  setDragVolunteerId(volunteer.id);
                  setDragPreview({
                    volunteerId: volunteer.id,
                    x: event.clientX,
                    y: event.clientY,
                    offsetX,
                    offsetY,
                    width: rect.width,
                  });
                }}
                onDragEnd={clearVolunteerDrag}
              >
                <div className="volunteer-line-1">
                  <span>{volunteer.displayName}</span>
                  <span>{roleLabel(volunteer.role)}</span>
                </div>
                {volunteer.kids.length > 0 && (
                  <div className="volunteer-kids-bouts">
                    {volunteer.kids.map((kid) => (
                      <div key={kid.id} className="volunteer-kid-row">
                        <span className="volunteer-kid-name">{kid.name}</span>
                        {kid.bouts.length === 0 ? (
                          <span className="volunteer-bout-chip unassigned">no bouts</span>
                        ) : (
                          kid.bouts.map((bout) => (
                            <span
                              key={`${kid.id}-${bout.id}`}
                              className={`volunteer-bout-chip${bout.mat === null ? " unassigned" : ""}`}
                            >
                              {bout.boutNumber ?? "Unassigned"}
                            </span>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {dragPreview && dragPreviewVolunteer && (
        <div
          className="volunteers-drag-preview"
          style={{ left: dragPreview.x - dragPreview.offsetX, top: dragPreview.y - dragPreview.offsetY }}
        >
          <div className="volunteers-drag-preview-card" style={{ width: dragPreview.width }}>
            <div className="volunteer-line-1">
              <span>{dragPreviewVolunteer.displayName}</span>
              <span>{roleLabel(dragPreviewVolunteer.role)}</span>
            </div>
            {dragPreviewVolunteer.kids.length > 0 && (
              <div className="volunteer-kids-bouts">
                {dragPreviewVolunteer.kids.map((kid) => (
                  <div key={`drag-preview-${kid.id}`} className="volunteer-kid-row">
                    <span className="volunteer-kid-name">{kid.name}</span>
                    {kid.bouts.length === 0 ? (
                      <span className="volunteer-bout-chip unassigned">no bouts</span>
                    ) : (
                      kid.bouts.map((bout) => (
                        <span
                          key={`drag-preview-${kid.id}-${bout.id}`}
                          className={`volunteer-bout-chip${bout.mat === null ? " unassigned" : ""}`}
                        >
                          {bout.boutNumber ?? "Unassigned"}
                        </span>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
