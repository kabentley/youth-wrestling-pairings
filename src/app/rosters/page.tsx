"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

import AppHeader from "@/components/AppHeader";

type Team = { id: string; name: string; symbol: string; color: string; hasLogo?: boolean };
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
type EditableWrestler = {
  id: string;
  first: string;
  last: string;
  weight: string;
  birthdate: string;
  experienceYears: string;
  skill: string;
  active: boolean;
  isNew?: boolean;
};
type ViewerColumnKey = "last" | "first" | "age" | "weight" | "experienceYears" | "skill" | "active";
type ViewerColumn = { key: ViewerColumnKey; label: string; width: number };

function parseCsv(text: string) {
  // Basic CSV parser that supports commas and quoted values.
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;

  function pushCell() {
    row.push(cur);
    cur = "";
  }
  function pushRow() {
    // ignore completely empty trailing row
    if (row.length === 1 && row[0].trim() === "") { row = []; return; }
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') { // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      pushCell();
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushCell();
      pushRow();
    } else {
      cur += ch;
    }
  }
  pushCell();
  if (row.length) pushRow();

  if (rows.length === 0) return { headers: [], data: [] as Record<string, string>[] };

  const firstRow = rows[0].map(h => h.trim());
  const requiredHeaders = ["first", "last", "weight", "birthdate", "experienceYears", "skill"];
  const headerTokens = firstRow.map(h => h.toLowerCase());
  const hasHeader = headerTokens.some(h => requiredHeaders.includes(h));
  const headers = hasHeader ? firstRow : requiredHeaders;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const data = dataRows.filter(r => r.some(c => c.trim() !== "")).map(r => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = (r[j] ?? "").trim();
    return obj;
  });

  return { headers, data };
}

export default function RostersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teamQueryParam = searchParams.get("team");
  const role = (session?.user as any)?.role as string | undefined;
  const sessionTeamId = (session?.user as any)?.teamId as string | undefined;
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [roster, setRoster] = useState<Wrestler[]>([]);
  const [rosterMsg, setRosterMsg] = useState("");
  const [editableRows, setEditableRows] = useState<EditableWrestler[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [spreadsheetColWidths, setSpreadsheetColWidths] = useState<number[]>([130, 110, 120, 70, 80, 80, 90, 90, 90]);
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, Set<keyof EditableWrestler>>>({});
  const rosterResizeRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);
  const originalRowsRef = useRef<Record<string, EditableWrestler>>({});
  const [showInactive, setShowInactive] = useState(false);
  const hasDirtyChanges = dirtyRowIds.size > 0;
  const hasFieldValidationErrors = useMemo(
    () => [...dirtyRowIds].some(rowId => (fieldErrors[rowId].size) > 0),
    [dirtyRowIds, fieldErrors],
  );
  // Import state
  const [importTeamId, setImportTeamId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string,string>[] } | null>(null);
  const [importMsg, setImportMsg] = useState<string>("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const headerTeamButtonRef = useRef<HTMLButtonElement | null>(null);
  const teamSelectRef = useRef<HTMLDivElement | null>(null);
  const daysPerYear = 365;
  useEffect(() => {
    if (!showTeamSelector) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !teamSelectRef.current?.contains(target) &&
        !headerTeamButtonRef.current?.contains(target)
      ) {
        setShowTeamSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTeamSelector]);
  const importTeamLabel = useMemo(() => {
    const team = teams.find(t => t.id === importTeamId);
    if (!team) return "no team selected";
    return `${team.name} (${team.symbol})`;
  }, [importTeamId, teams]);
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
      { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
      { href: "/parent", label: "My Wrestlers" },
      { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
      { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
    ];

  const redirectToLogin = () => {
    const callbackUrl = pathname ?? "/rosters";
    router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  };

  const handleUnauthorized = (res: Response) => {
    if (res.status === 401) {
      if (status !== "authenticated") {
        redirectToLogin();
      }
      return true;
    }
    return false;
  };

  const selectTeam = (teamId: string) => {
    if (hasDirtyChanges) {
      setRosterMsg("Save or discard your edits before switching teams.");
      setShowTeamSelector(false);
      return;
    }
    setSelectedTeamId(teamId);
    setImportTeamId(teamId);
    setShowTeamSelector(false);
  };

  async function load() {
    const [tRes, lRes] = await Promise.all([fetch("/api/teams"), fetch("/api/league")]);
    if (handleUnauthorized(tRes)) return;
    if (handleUnauthorized(lRes)) return;
    if (tRes.ok) setTeams(await tRes.json());
    if (lRes.ok) {
      const league = await lRes.json();
      setLeagueName(String(league.name ?? "").trim());
    }
  }

  function ageYears(birthdate: string) {
    const bDate = new Date(birthdate);
    if (Number.isNaN(bDate.getTime())) return null;
    const now = new Date();
    const days = Math.floor((now.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
    return days / daysPerYear;
  }

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      redirectToLogin();
      return;
    }
    void load();
  }, [status]);
  useEffect(() => {
    if ((role === "COACH" || role === "PARENT" || role === "TABLE_WORKER") && sessionTeamId && !selectedTeamId) {
      setSelectedTeamId(sessionTeamId);
      setImportTeamId(sessionTeamId);
    }
  }, [role, sessionTeamId, selectedTeamId]);

  useEffect(() => {
    if (!teamQueryParam) return;
    if (hasDirtyChanges) return;
    if (selectedTeamId === teamQueryParam) return;
    if (!teams.some(t => t.id === teamQueryParam)) return;
    setSelectedTeamId(teamQueryParam);
    setImportTeamId(teamQueryParam);
    setShowTeamSelector(false);
  }, [teamQueryParam, teams, selectedTeamId, hasDirtyChanges]);

  useEffect(() => {
    if (!showImportModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowImportModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [showImportModal]);

  async function onChooseFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setImportMsg("");

    if (!f) return;
    const text = await f.text();
    const parsed = parseCsv(text);

    setPreview({ headers: parsed.headers, rows: parsed.data.slice(0, 8) });
  }

  function normalizeRow(r: Record<string, string>) {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = r[k];
        if (typeof v === "string" && v.trim() !== "") return v.trim();
      }
      return "";
    };

    const first = get("first", "First", "FIRST");
    const last = get("last", "Last", "LAST");
    const weightStr = get("weight", "Weight", "WEIGHT", "wt", "Wt");
    let birthdate = get("birthdate", "Birthdate", "DOB", "dob", "DateOfBirth", "dateOfBirth");
    const expStr = get("experienceYears", "ExperienceYears", "experience", "Experience", "expYears", "ExpYears");
    const skillStr = get("skill", "Skill", "SKILL");

    const weight = Number(weightStr);
    const experienceYears = expStr ? Number(expStr) : Number.NaN;
    const skill = skillStr ? Number(skillStr) : Number.NaN;

    if (birthdate) {
      const match = birthdate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        const mm = match[1].padStart(2, "0");
        const dd = match[2].padStart(2, "0");
        const yyyy = match[3];
        birthdate = `${yyyy}-${mm}-${dd}`;
      }
    }

    return { first, last, weight, birthdate, experienceYears, skill };
  }

  async function importCsv() {
    setImportMsg("");

    if (!file) { setImportMsg("Choose a CSV file first."); return; }
    const teamId = importTeamId || undefined;

    if (!teamId) {
      setImportMsg("Select an existing team.");
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);

    if (parsed.headers.length === 0) {
      setImportMsg("CSV looks empty.");
      return;
    }

    const normalized = parsed.data.map(normalizeRow);
    const missingRequired = normalized.some(w => !Number.isFinite(w.experienceYears) || !Number.isFinite(w.skill));
    if (missingRequired) {
      setImportMsg("ExperienceYears and Skill are required for every row.");
      return;
    }

    // Convert rows -> API payload
    const wrestlers = normalized
      .filter(w => w.first && w.last && Number.isFinite(w.weight) && w.weight > 0 && w.birthdate)
      .map(w => ({
        first: w.first,
        last: w.last,
        weight: Number(w.weight),
        birthdate: w.birthdate,
        experienceYears: Math.max(0, Math.floor(w.experienceYears)),
        skill: Math.min(5, Math.max(0, Math.floor(w.skill))),
      }));

    if (wrestlers.length === 0) {
      setImportMsg("No valid wrestler rows found. Expected columns: first,last,weight,birthdate,experienceYears,skill.");
      return;
    }

    setImportMsg("Importing...");
    const payload: Record<string, unknown> = { teamId, wrestlers };
    const res = await fetch("/api/teams/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (handleUnauthorized(res)) return;

    if (!res.ok) {
      const txt = await res.text();
      setImportMsg(`Import failed: ${txt}`);
      return;
    }

    const json = await res.json();
    setImportMsg(`Imported ${json.created} wrestlers.`);
    setFile(null);
    setPreview(null);
    await load();
    await loadRoster(teamId);
    setShowImportModal(false);
    setTimeout(() => setImportMsg(""), 2000);
  }

  async function loadRoster(teamId: string) {
    setRosterMsg("");
    if (!teamId) {
      setRoster([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("includeInactive", "1");
    const res = await fetch(`/api/teams/${teamId}/wrestlers?${params}`);
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      setRosterMsg("Unable to load roster.");
      setRoster([]);
      return;
    }
    setRoster(await res.json());
  }

  useEffect(() => {
    if (!selectedTeamId) {
      setRoster([]);
      return;
    }
    void loadRoster(selectedTeamId);
  }, [selectedTeamId]);

  const updateDirtyState = (rowId: string, dirty: boolean) => {
    setDirtyRowIds(prev => {
      const next = new Set(prev);
      if (dirty) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  };

  const isRowDirty = (row: EditableWrestler) => {
    if (row.isNew) {
      return Boolean(
        row.first.trim() ||
        row.last.trim() ||
        row.weight.trim() ||
        row.birthdate ||
        row.experienceYears.trim() ||
        row.skill.trim()
      );
    }
    const original = originalRowsRef.current[row.id];
    if (!original) return true;
    return (
      row.first !== original.first ||
      row.last !== original.last ||
      row.birthdate !== original.birthdate ||
      row.weight !== original.weight ||
      row.experienceYears !== original.experienceYears ||
      row.skill !== original.skill ||
      row.active !== original.active
    );
  };

  const markRowDirtyState = (row: EditableWrestler) => {
    updateDirtyState(row.id, isRowDirty(row));
  };

  const setRowFieldErrors = (rowId: string, errors: Set<keyof EditableWrestler>) => {
    setFieldErrors(prev => {
      const next = { ...prev };
      if (errors.size === 0) {
        delete next[rowId];
      } else {
        next[rowId] = errors;
      }
      return next;
    });
  };

  const hasFieldError = (rowId: string, field: keyof EditableWrestler) => {
    return fieldErrors[rowId]?.has(field) ?? false;
  };

  const validateRow = (row: EditableWrestler) => {
    const errors = new Set<keyof EditableWrestler>();
    if (!row.first.trim()) errors.add("first");
    if (!row.last.trim()) errors.add("last");
    const weight = Number(row.weight);
    if (!Number.isFinite(weight) || weight < 35 || weight > 300) errors.add("weight");
    if (!row.birthdate) {
      errors.add("birthdate");
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birthdate)) {
      errors.add("birthdate");
    } else {
      const age = ageYears(row.birthdate);
      if (typeof age !== "number" || age < 3 || age > 20) {
        errors.add("birthdate");
      }
    }
    const exp = Number(row.experienceYears);
    if (!Number.isFinite(exp) || exp < 0) errors.add("experienceYears");
    const skill = Number(row.skill);
    if (!Number.isFinite(skill) || skill < 0 || skill > 5) errors.add("skill");

    setRowFieldErrors(row.id, errors);
    return errors.size === 0;
  };

  const persistRow = async (row: EditableWrestler) => {
    if (!selectedTeamId) return false;
    if (!validateRow(row)) return false;
    const payload = {
      first: row.first.trim(),
      last: row.last.trim(),
      weight: Number(row.weight),
      birthdate: row.birthdate,
      experienceYears: Math.floor(Number(row.experienceYears)),
      skill: Math.floor(Number(row.skill)),
      active: row.active,
    };
    if (row.isNew) {
      const res = await fetch(`/api/teams/${selectedTeamId}/wrestlers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (handleUnauthorized(res)) return false;
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as { error?: string }));
        setRosterMsg(json?.error ?? "Unable to add wrestler.");
        return false;
      }
      return true;
    }
    const res = await fetch(`/api/teams/${selectedTeamId}/wrestlers/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (handleUnauthorized(res)) return false;
    if (!res.ok) {
      const json = await res.json().catch(() => ({} as { error?: string }));
      setRosterMsg(json?.error ?? "Unable to update wrestler.");
      return false;
    }
    return true;
  };

  const saveAllChanges = async () => {
    if (!selectedTeamId || dirtyRowIds.size === 0) return;
    if (hasFieldValidationErrors) {
      setRosterMsg("Please fix highlighted fields.");
      return;
    }
    setSavingAll(true);
    try {
      const rowsToSave = editableRows.filter(row => dirtyRowIds.has(row.id));
      for (const row of rowsToSave) {
        const ok = await persistRow(row);
        if (!ok) return;
      }
      await loadRoster(selectedTeamId);
      setDirtyRowIds(new Set());
      setRosterMsg("Roster saved.");
    } finally {
      setSavingAll(false);
    }
  };

  const cancelChanges = async () => {
    if (!selectedTeamId) return;
    setDirtyRowIds(new Set());
    setFieldErrors({});
    setRosterMsg("Changes discarded.");
    await loadRoster(selectedTeamId);
  };

  const handleFieldChange = (rowId: string, field: keyof EditableWrestler, value: string | boolean) => {
    setRosterMsg("");
    setEditableRows(rows =>
      rows.map(r => {
        if (r.id !== rowId) return r;
        const updated = { ...r, [field]: value };
        markRowDirtyState(updated);
        validateRow(updated);
        return updated;
      }),
    );
  };
  const rosterSheetColumns = [
    { key: "last", label: "Last" },
    { key: "first", label: "First" },
    { key: "birthdate", label: "Birthday" },
    { key: "age", label: "Age" },
    { key: "weight", label: "Weight" },
    { key: "experienceYears", label: "Exp" },
    { key: "skill", label: "Skill" },
    { key: "active", label: "Status" },
  ];

  const renderColGroup = () => (
    <colgroup>
      {spreadsheetColWidths.map((width, idx) => (
        <col key={`spreadsheet-col-${idx}`} style={{ width }} />
      ))}
    </colgroup>
  );

  const renderSortArrow = (key: string) => {
    if (sortConfig.key !== key) return null;
    return <span className="sort-arrow">{sortConfig.dir === "asc" ? "▲" : "▼"}</span>;
  };

  const handleSortColumn = (key: string) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  };

  const getSortValue = (row: EditableWrestler, key: string) => {
    switch (key) {
      case "last":
        return row.last.toLowerCase();
      case "first":
        return row.first.toLowerCase();
      case "birthdate":
        return row.birthdate || "";
      case "age":
        return row.birthdate ? ageYears(row.birthdate) ?? 0 : 0;
      case "weight":
        return Number(row.weight);
      case "experienceYears":
        return Number(row.experienceYears);
      case "skill":
        return Number(row.skill);
      case "active":
        return row.active ? "Active" : "Inactive";
      default:
        return row.last.toLowerCase();
    }
  };

  const isCoachEditingOwnTeam = role === "COACH" && selectedTeamId && sessionTeamId && selectedTeamId === sessionTeamId;
  const canEditRoster = role === "ADMIN" || isCoachEditingOwnTeam;
  const hideSkillAndStatus = role === "PARENT" || role === "TABLE_WORKER";
  const allowInactiveView = !hideSkillAndStatus;
  const newRows = editableRows.filter(r => r.isNew);
  const savedEditableRows = editableRows.filter(r => !r.isNew);
  const includeInactiveRows = allowInactiveView && showInactive;
  const filteredEditableRows = savedEditableRows.filter(row => includeInactiveRows || row.active);

  const sortedEditableRows = useMemo(() => {
    const rows = [...filteredEditableRows];
    rows.sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortConfig.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return 0;
    });
    return rows;
  }, [filteredEditableRows, sortConfig]);

  useEffect(() => {
    const rows: EditableWrestler[] = roster.map(w => ({
      id: w.id,
      first: w.first,
      last: w.last,
      weight: String(w.weight),
      birthdate: w.birthdate.slice(0, 10),
      experienceYears: String(w.experienceYears),
      skill: String(w.skill),
      active: w.active,
    }));
    const originals: Record<string, EditableWrestler> = {};
    rows.forEach(r => {
      originals[r.id] = r;
    });
    originalRowsRef.current = originals;
    setDirtyRowIds(new Set());
    setEditableRows([createEmptyRow("new"), ...rows]);
    setFieldErrors({});
  }, [roster]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!rosterResizeRef.current) return;
      const { index, startX, startWidth } = rosterResizeRef.current;
      const nextWidth = Math.max(60, startWidth + (e.clientX - startX));
      setSpreadsheetColWidths(widths => widths.map((w, idx) => (idx === index ? nextWidth : w)));
    }
    function onMouseUp() {
      rosterResizeRef.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleColMouseDown = (index: number, e: ReactMouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    rosterResizeRef.current = {
      index,
      startX: e.clientX,
      startWidth: spreadsheetColWidths[index],
    };
  };

  const getAgeLabel = (birthdate: string) => {
    if (!birthdate) return "";
    const yrs = ageYears(birthdate);
    return typeof yrs === "number" ? yrs.toFixed(1) : "";
  };

  const rosterViewerColumns: ViewerColumn[] = [
    { key: "last", label: "Last", width: 120 },
    { key: "first", label: "First", width: 120 },
    { key: "age", label: "Age", width: 120 },
    { key: "weight", label: "Weight", width: 90 },
    { key: "experienceYears", label: "Exp", width: 90 },
    { key: "skill", label: "Skill", width: 110 },
    { key: "active", label: "Status", width: 110 },
  ];
  const spectatorColumns = hideSkillAndStatus
    ? rosterViewerColumns.filter(col => col.key !== "skill" && col.key !== "active")
    : rosterViewerColumns;
  const renderSpectatorCell = (key: ViewerColumnKey, wrestler: Wrestler) => {
    switch (key) {
      case "last":
        return wrestler.last;
      case "first":
        return wrestler.first;
      case "age":
        return ageYears(wrestler.birthdate)?.toFixed(1) ?? "";
      case "weight":
        return wrestler.weight;
      case "experienceYears":
        return wrestler.experienceYears;
      case "skill":
        return wrestler.skill;
      case "active":
        return wrestler.active ? "Active" : "Inactive";
    }
  };
  const currentTeam = teams.find(t => t.id === selectedTeamId);

  useEffect(() => {
    if (!allowInactiveView && showInactive) {
      setShowInactive(false);
    }
  }, [allowInactiveView, showInactive]);

  const createEmptyRow = (id?: string): EditableWrestler => ({
    id: id ?? `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    first: "",
    last: "",
    weight: "",
    birthdate: "",
    experienceYears: "0",
    skill: "0",
    active: true,
    isNew: true,
  });

  const handleNewRowInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>, row: EditableWrestler) => {
    if (event.key !== "Enter" || !row.isNew) return;
    event.preventDefault();
    addEmptyRow();
  };

  const fieldRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());

  const registerFieldRef = (rowId: string, field: keyof EditableWrestler, el: HTMLInputElement | HTMLSelectElement | null) => {
    const key = `${rowId}-${field}`;
    if (el) {
      fieldRefs.current.set(key, el);
    } else {
      fieldRefs.current.delete(key);
    }
  };

  const focusField = (rowId: string, field: keyof EditableWrestler) => {
    const key = `${rowId}-${field}`;
    const target = fieldRefs.current.get(key);
    target?.focus();
  };

  const addEmptyRow = () => {
    setEditableRows(rows => [createEmptyRow(), ...rows]);
  };

  const focusAdjacentRow = (rowId: string, field: keyof EditableWrestler, direction: "up" | "down") => {
    const allRows = [...newRows, ...sortedEditableRows];
    const idx = allRows.findIndex(r => r.id === rowId);
    if (idx === -1) return;
    const nextIdx = direction === "down" ? Math.min(allRows.length - 1, idx + 1) : Math.max(0, idx - 1);
    const nextRow = allRows[nextIdx];
    if (nextRow) {
      focusField(nextRow.id, field);
    }
  };

  const handleInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    row: EditableWrestler,
    field: keyof EditableWrestler,
  ) => {
    handleNewRowInputKeyDown(event as unknown as Event, row);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAdjacentRow(row.id, field, event.key === "ArrowDown" ? "down" : "up");
    }
  };

  const renderEditableRow = (row: EditableWrestler, isNewRow = false) => {
    const ageDisplay = row.birthdate ? getAgeLabel(row.birthdate) : "";
    const lastClass = `spreadsheet-input${hasFieldError(row.id, "last") ? " field-error" : ""}`;
    const firstClass = `spreadsheet-input${hasFieldError(row.id, "first") ? " field-error" : ""}`;
    const birthdateClass = `spreadsheet-input${hasFieldError(row.id, "birthdate") ? " field-error" : ""}`;
    const weightClass = `spreadsheet-input${hasFieldError(row.id, "weight") ? " field-error" : ""}`;
    const expClass = `spreadsheet-input${hasFieldError(row.id, "experienceYears") ? " field-error" : ""}`;
    const skillClass = `spreadsheet-input${hasFieldError(row.id, "skill") ? " field-error" : ""}`;
    const statusClass = `spreadsheet-select${hasFieldError(row.id, "active") ? " field-error" : ""}`;
    const rowDirty = dirtyRowIds.has(row.id);
    const hasErrors = (fieldErrors[row.id]?.size ?? 0) > 0;

    return (
      <tr
        key={row.id}
        className={`spreadsheet-row${isNewRow ? " new-row" : ""}${rowDirty ? " dirty-row" : ""}${row.active ? "" : " inactive-row"}${hasErrors ? " error-row" : ""}`}
      >
        <td>
          <input
            className={lastClass}
            value={row.last}
            onChange={e => handleFieldChange(row.id, "last", e.target.value)}
            placeholder="Last"
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "last", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "last")}
          />
        </td>
        <td>
          <input
            className={firstClass}
            value={row.first}
            onChange={e => handleFieldChange(row.id, "first", e.target.value)}
            placeholder="First"
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "first", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "first")}
          />
        </td>
        <td>
          <input
            type="date"
            className={birthdateClass}
            value={row.birthdate}
            onChange={e => handleFieldChange(row.id, "birthdate", e.target.value)}
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "birthdate", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "birthdate")}
          />
        </td>
        <td>
          <div className="spreadsheet-age">{ageDisplay || "?"}</div>
        </td>
        <td>
          <input
            type="number"
            min={35}
            max={300}
            step={1}
            className={weightClass}
            value={row.weight}
            onChange={e => handleFieldChange(row.id, "weight", e.target.value)}
            placeholder="Weight"
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "weight", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "weight")}
          />
        </td>
        <td>
          <input
            type="number"
            min={0}
            className={expClass}
            value={row.experienceYears}
            onChange={e => handleFieldChange(row.id, "experienceYears", e.target.value)}
            placeholder="Exp"
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "experienceYears", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "experienceYears")}
          />
        </td>
        <td>
          <input
            type="number"
            min={0}
            max={5}
            className={skillClass}
            value={row.skill}
            onChange={e => handleFieldChange(row.id, "skill", e.target.value)}
            placeholder="Skill"
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "skill", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "skill")}
          />
        </td>
        <td>
          <select
            className={statusClass}
            value={row.active ? "active" : "inactive"}
            onChange={e => handleFieldChange(row.id, "active", e.target.value === "active")}
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "active", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "active")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </td>
      </tr>
    );
  };

  const displayRoster = useMemo(() => {
    return [...roster]
      .filter(w => includeInactiveRows || w.active)
      .sort((a, b) => {
        if (a.last === b.last) return a.first.localeCompare(b.first);
        return a.last.localeCompare(b.last);
      });
  }, [roster, includeInactiveRows]);

  const downloadableRoster = useMemo(() => displayRoster.filter(row => row.active), [displayRoster]);

  const downloadRosterCsv = () => {
    if (!selectedTeamId) return;
    if (downloadableRoster.length === 0) return;

    const escape = (value: string | number | boolean) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const rows = displayRoster.map(row => {
      const birthdateValue = row.birthdate ? row.birthdate.split("T")[0] : "";
      return [
        escape(row.last),
        escape(row.first),
        escape(birthdateValue),
        escape(row.weight),
        escape(row.experienceYears),
        escape(row.skill),
      ];
    });

    const csvContent = rows.map(r => r.join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const team = teams.find(t => t.id === selectedTeamId);
    const nameSlug = team ? team.name.replace(/[^a-z0-9]+/gi, "_") : "roster";
    link.href = url;
    link.download = `${nameSlug}_roster.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="teams">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --brand: #0d3b66;
          --accent: #1e88e5;
          --line: #d5dbe2;
        }
        .teams {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 18px 12px 30px;
        }
        .mast {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .title {
          font-family: "Oswald", Arial, sans-serif;
          font-size: clamp(26px, 3vw, 38px);
          letter-spacing: 0.5px;
          margin: 0;
          text-transform: uppercase;
        }
        .tagline {
          color: var(--muted);
          font-size: 13px;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
        }
        .nav {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .nav a {
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.5px;
          padding: 8px 10px;
          border: 1px solid transparent;
          border-radius: 6px;
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
        .nav a:hover,
        .nav-btn:hover {
          border-color: var(--line);
          background: #f7f9fb;
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
        }
        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.08);
        }
        .card-title {
          font-family: "Oswald", Arial, sans-serif;
          margin: 0 0 10px;
          text-transform: uppercase;
        }
        .muted {
          color: var(--muted);
          font-size: 12px;
        }
        .row {
          display: flex;
          gap: 4px;
          align-items: center;
          flex-wrap: wrap;
        }
        .input,
        .select {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
          background: #fff;
        }
        .input-sm {
          width: 120px;
        }
        .btn {
          border: 0;
          background: var(--accent);
          color: #fff;
          font-weight: 700;
          padding: 10px 12px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          cursor: pointer;
        }
        .btn-small {
          padding: 4px 10px;
          font-size: 11px;
          text-transform: none;
          letter-spacing: 0.4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 72px;
        }
        .btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .btn-ghost {
          background: #f2f5f8;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .team-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .team-card {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: #fff;
          text-align: left;
          cursor: pointer;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .team-card-active {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(30, 136, 229, 0.15);
        }
        .mast-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mast-logo {
          display: inline-flex;
          width: 78px;
          height: 78px;
          margin-left: 12px;
          vertical-align: middle;
        }
        .league-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 10px;
        }
        .mast .title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .team-selector-wrapper {
          position: relative;
        }
        .team-select-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: 0 20px 30px rgba(0, 0, 0, 0.12);
          min-width: 220px;
          z-index: 5;
        }
        .team-select-logo {
          width: 34px;
          height: 34px;
          object-fit: contain;
          border-radius: 6px;
        }
        .team-select-item .team-symbol {
          min-width: 32px;
          font-weight: 700;
          text-align: center;
        }
        .team-placeholder {
          font-weight: 600;
          color: var(--muted);
          letter-spacing: 0.4px;
        }
        .team-select-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          width: 100%;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          font-weight: 500;
        }
        .team-select-item.active {
          background: #e8f4ff;
        }
        .card-header {
          display: block;
        }
        .header-left {
          display: block;
        }
        .header-main {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .header-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .header-left-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .header-team {
          gap: 12px;
        }
        .header-team-button {
          margin-left: 0;
          border: 1px solid var(--line);
          background: #f7f7f7;
          color: var(--ink);
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          text-transform: none;
        }
        .header-team-button.active {
          background: #e6f6ea;
          border-color: #a5d6a7;
        }
        .header-team .team-logo,
        .header-team .color-dot {
          width: 40px;
          height: 40px;
        }
          .team-head {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            padding: 10px 16px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
            font-weight: 600;
            letter-spacing: 0.4px;
            width: 100%;
            max-width: 280px;
            justify-content: flex-start;
          }
        .team-logo {
          width: 44px;
          height: 44px;
          object-fit: contain;
        }
        .team-meta {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: nowrap;
        }
        .team-symbol {
          font-weight: 700;
          font-size: 18px;
          text-decoration: none;
          white-space: nowrap;
        }
        .team-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .team-link a {
          color: var(--accent);
          font-size: 12px;
          text-decoration: none;
        }
        .color-dot {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid var(--line);
        }
        .divider {
          height: 1px;
          background: var(--line);
          margin: 6px 0 12px;
        }
        .two-col {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          align-items: end;
        }
        .preview-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
        }
        .preview-table th,
        .preview-table td {
          padding: 8px 6px;
          border-bottom: 1px solid var(--line);
          text-align: left;
        }
        .roster-table {
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
        }
        .roster-table table {
          table-layout: auto;
          border-collapse: collapse;
        }
        .roster-table tbody tr:hover {
          background: #f7f9fb;
        }
        .roster-table th,
        .roster-table td {
          padding: 4px 5px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          font-size: 13px;
        }
        .roster-table td:last-child {
          white-space: nowrap;
        }
        .roster-table td:last-child .btn {
          width: auto;
        }
        .roster-th {
          position: relative;
          padding-right: 18px;
          cursor: pointer;
          user-select: none;
        }
        .roster-th:hover {
          color: var(--accent);
          background: #f7f9fb;
        }
        .col-resizer {
          position: absolute;
          right: 2px;
          top: 0;
          width: 10px;
          height: 100%;
          cursor: col-resize;
          user-select: none;
          background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0) 100%);
        }
        @media (max-width: 900px) {
          .mast {
            flex-direction: column;
            align-items: flex-start;
          }
          .grid {
            gap: 14px;
          }
          .team-card {
            gap: 8px;
          }
        }
        @media (max-width: 640px) {
          .card {
            padding: 10px;
          }
          .card-title {
            font-size: 16px;
          }
          .roster-table th,
          .roster-table td {
            padding: 2px 4px;
            font-size: 12px;
          }
          .row {
            gap: 2px;
          }
          .btn {
            padding: 8px 10px;
            font-size: 12px;
          }
        }

        .header-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
        }
        .header-checkbox input {
          margin: 0;
        }
        .roster-wrapper {
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
        }
        .roster-grid {
          display: flex;
          flex-direction: column;
        }
        .static-roster {
          border-bottom: 1px solid var(--line);
          background: #fff;
        }
        .static-roster table {
          border-collapse: collapse;
        }
        .roster-scroll {
          max-height: calc(20 * 40px);
          overflow-y: auto;
          background: #fff;
        }
        .spreadsheet-table {
          border-collapse: collapse;
        }
        .spreadsheet-table th,
        .spreadsheet-table td {
          padding: 2px 4px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          line-height: 1.1;
        }
        .spreadsheet-table th {
          background: #f7f9fb;
          font-weight: 700;
        }
        .sortable-header {
          border: none;
          background: none;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 0;
        }
        .sortable-header.active {
          color: var(--accent);
        }
        .sort-arrow {
          font-size: 13px;
          line-height: 1;
        }
        .col-resizer {
          position: absolute;
          top: 0;
          right: 2px;
          width: 10px;
          height: 100%;
          cursor: col-resize;
        }
        .spreadsheet-input,
        .spreadsheet-select {
          width: 100%;
          padding: 6px 8px;
          border: 0;
          font-size: 13px;
          background: transparent;
          border-radius: 0;
        }
        .spreadsheet-select {
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #111 50%), linear-gradient(135deg, #111 50%, transparent 50%);
          background-position: calc(100% - 16px) calc(50% - 2px), calc(100% - 10px) calc(50% - 2px);
          background-size: 5px 5px, 5px 5px;
          background-repeat: no-repeat;
        }
        .field-error {
          box-shadow: inset 0 0 0 1px #b71c1c;
          background: rgba(183, 28, 28, 0.08);
        }
        .spreadsheet-input:focus,
        .spreadsheet-select:focus {
          outline: none;
          box-shadow: inset 0 -1px 0 0 var(--accent);
        }
        .spreadsheet-row.new-row {
          background: #f8fff5;
        }
        .spreadsheet-row.inactive-row {
          opacity: 0.65;
        }
        .spreadsheet-row.inactive-row td {
          text-decoration: line-through;
        }
        .spreadsheet-row.inactive-row td input,
        .spreadsheet-row.inactive-row td select {
          text-decoration: line-through;
        }
        .spreadsheet-row.dirty-row {
          background: rgba(30, 136, 229, 0.07);
        }
        .spreadsheet-age {
          padding: 6px 8px;
          color: var(--muted);
        }
        .full-row-placeholder {
          text-align: center;
          color: var(--muted);
        }
        .error-msg-placeholder {
          min-height: 24px;
        }
        .import-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          z-index: 20;
        }
        .import-modal {
          background: #fff;
          border-radius: 10px;
          max-width: 520px;
          width: 100%;
          padding: 16px;
          box-shadow: 0 24px 40px rgba(0,0,0,0.25);
          position: relative;
        }
        .import-modal-header {
          margin-bottom: 12px;
        }
        .import-modal-body {
          max-height: 60vh;
          overflow: auto;
        }
        .import-modal-footer {
          display: flex;
          justify-content: flex-end;
          margin-top: 14px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .import-preview table {
          width: 100%;
          border-collapse: collapse;
        }
        .import-preview th,
        .import-preview td {
          padding: 6px 6px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          font-size: 13px;
        }
        @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          50% { transform: translateX(2px); }
          75% { transform: translateX(-2px); }
          100% { transform: translateX(0); }
        }

      `}</style>
      <AppHeader links={headerLinks} />
      <header className="mast">
        <div className="mast-title">
          <h1 className="title">
            <span>Team Rosters for {leagueName || "League Directory"}</span>
            <span className="mast-logo">
              <img
                src="/api/league/logo/file"
                alt={`${leagueName || "League"} logo`}
                className="league-logo"
              />
            </span>
          </h1>
          <div className="tagline">League Directory</div>
        </div>
      </header>

      <div className="grid">

        <section className="card">
          <div className="card-header">
            <div className="header-left">
              <div className="header-main">
                <div className="header-title-group">
                  <h2 className="card-title">Roster for:</h2>
                  <div className="team-selector-wrapper">
                    <button
                      type="button"
                      className="team-head header-team"
                      ref={headerTeamButtonRef}
                      onClick={e => {
                        e.stopPropagation();
                        setShowTeamSelector(prev => !prev);
                      }}
                      aria-expanded={showTeamSelector}
                      disabled={teams.length === 0 || hasDirtyChanges}
                    >
                      {currentTeam ? (
                        <>
                          {currentTeam.hasLogo ? (
                            <img
                              src={`/api/teams/${currentTeam.id}/logo/file`}
                              alt={`${currentTeam.name} logo`}
                              className="team-logo"
                            />
                          ) : (
                            <div className="color-dot" style={{ backgroundColor: currentTeam.color }} />
                          )}
                          <div className="team-meta">
                            <span className="team-symbol" style={{ color: currentTeam.color }}>{currentTeam.symbol}</span>
                            <div className="team-name">{currentTeam.name}</div>
                          </div>
                        </>
                      ) : (
                        <span className="team-placeholder">Select a team</span>
                      )}
                    </button>
                    {showTeamSelector && teams.length > 0 && (
                      <div className="team-select-menu" ref={teamSelectRef}>
                        {teams.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            className={`team-select-item ${selectedTeamId === t.id ? "active" : ""}`}
                            onClick={() => selectTeam(t.id)}
                          >
                            {t.hasLogo && (
                              <img
                                src={`/api/teams/${t.id}/logo/file`}
                                alt={`${t.name} logo`}
                                className="team-select-logo"
                              />
                            )}
                            <span className="team-symbol" style={{ color: t.color }}>
                              {t.symbol}
                            </span>
                            <span className="team-name">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="header-left-controls">
                  {allowInactiveView && (
                    <label className="header-checkbox">
                      <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={e => setShowInactive(e.target.checked)}
                      />
                      <span>{showInactive ? "Showing Inactive" : "Show Inactive"}</span>
                    </label>
                  )}
                  {canEditRoster && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small header-cancel"
                        onClick={cancelChanges}
                        disabled={!hasDirtyChanges || savingAll}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-small header-save"
                        onClick={saveAllChanges}
                        disabled={!hasDirtyChanges || savingAll || hasFieldValidationErrors}
                      >
                        {savingAll ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small header-import"
                        onClick={() => setShowImportModal(true)}
                        disabled={hasDirtyChanges || !selectedTeamId}
                      >
                        Import Roster
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small header-download"
                        onClick={downloadRosterCsv}
                        disabled={!selectedTeamId || displayRoster.length === 0 || hasDirtyChanges}
                      >
                        Download Roster
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          {selectedTeamId ? (
            <>
              <div className="error-msg-placeholder">
                {hasFieldValidationErrors ? (
                  <div className="error-msg">Please fix highlighted fields.</div>
                ) : rosterMsg ? (
                  <div className="error-msg">{rosterMsg}</div>
                ) : (
                  <span aria-hidden="true">&nbsp;</span>
                )}
              </div>
              <div className="roster-wrapper">
                {canEditRoster ? (
                  <div className="roster-grid">
                    <div className="static-roster">
                      <table className="spreadsheet-table">
                        {renderColGroup()}
                        <thead>
                          <tr>
                            {rosterSheetColumns.map((col, idx) => (
                              <th key={col.key}>
                                <button
                                  type="button"
                                  className={`sortable-header${sortConfig.key === col.key ? " active" : ""}`}
                                  onClick={() => handleSortColumn(col.key)}
                                >
                                  {col.label}
                                  {renderSortArrow(col.key)}
                                </button>
                                <span
                                  className="col-resizer"
                                  onMouseDown={e => handleColMouseDown(idx, e)}
                                />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {newRows.length === 0 ? (
                            <tr>
                              <td className="full-row-placeholder" colSpan={rosterSheetColumns.length}>
                                Loading roster...
                              </td>
                            </tr>
                          ) : (
                            newRows.map(row => renderEditableRow(row, true))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="roster-scroll">
                      <table className="spreadsheet-table">
                        {renderColGroup()}
                        <tbody>
                          {sortedEditableRows.length === 0 ? (
                            <tr>
                              <td className="full-row-placeholder" colSpan={rosterSheetColumns.length}>
                                No wrestlers yet.
                              </td>
                            </tr>
                          ) : (
                            sortedEditableRows.map(row => renderEditableRow(row))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="roster-table">
                    <table>
                      <colgroup>
                        {spectatorColumns.map(col => (
                          <col key={col.key} style={{ width: col.width }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          {spectatorColumns.map(col => (
                            <th key={col.key}>{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayRoster.map(w => (
                          <tr key={w.id} className={w.active ? "" : "inactive-row"}>
                            {spectatorColumns.map(col => (
                              <td key={col.key}>{renderSpectatorCell(col.key, w)}</td>
                            ))}
                          </tr>
                        ))}
                        {displayRoster.length === 0 && (
                          <tr>
                            <td colSpan={spectatorColumns.length}>No wrestlers yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="muted">Select a team above to view its roster.</div>
          )}

        </section>
      </div>
      {canEditRoster && showImportModal && (
        <div
          className="import-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
          onClick={() => setShowImportModal(false)}
        >
          <div className="import-modal" onClick={event => event.stopPropagation()}>
            <div className="import-modal-header">
              <h3 id="import-title">
                Import roster for <strong>{importTeamLabel}</strong>
              </h3>
            </div>
            <div className="import-modal-body">
              <label className="muted">CSV file</label>
              <input
                className="input"
                type="file"
                accept=".csv,text/csv"
                onChange={e => onChooseFile(e.target.files?.[0] ?? null)}
              />
              <div className="muted" style={{ marginTop: 6 }}>
                Required columns: <b>first,last,weight,birthdate (YYYY-MM-DD),experienceYears,skill</b>.
              </div>
              {importMsg && <div className="muted" style={{ marginTop: 8 }}>{importMsg}</div>}
              {preview && (
                <div className="import-preview">
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Preview (first {preview.rows.length} rows). Headers: {preview.headers.join(", ")}
                  </div>
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {preview.headers.slice(0, 8).map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i}>
                          {preview.headers.slice(0, 8).map(h => (
                            <td key={h}>{r[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <details style={{ marginTop: 12 }}>
                <summary>Example CSV</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>{`first,last,weight,birthdate,experienceYears,skill
Ben,Askren,52,2015-03-11,1,3
John,Smith,55,2014-11-02,0,2
`}</pre>
              </details>
            </div>
            <div className="import-modal-footer">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setShowImportModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                onClick={importCsv}
                disabled={!file || !importTeamId}
              >
                Import / Update CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
