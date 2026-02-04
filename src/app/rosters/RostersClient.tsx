"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import * as XLSX from "xlsx";

import AppHeader from "@/components/AppHeader";

type Team = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  hasLogo?: boolean;
  headCoach?: { id: string; username: string } | null;
};
type Wrestler = {
  id: string;
  first: string;
  last: string;
  weight: number;
  birthdate: string;
  experienceYears: number;
  skill: number;
  isGirl: boolean;
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
  isGirl: boolean;
  active: boolean;
  isNew?: boolean;
};
type ViewerColumnKey = "last" | "first" | "age" | "sex" | "weight" | "experienceYears" | "skill" | "active";
type ViewerColumn = { key: ViewerColumnKey; label: string; width: number };

// Basic CSV parser that supports commas and quoted values.
function parseCsv(text: string) {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;

  // Flush the current cell into the row buffer.
  function pushCell() {
    row.push(cur);
    cur = "";
  }
  // Flush the current row into the result set.
  function pushRow() {
    // ignore completely empty trailing row
    if (row.length === 1 && row[0].trim() === "") { row = []; return; }
    rows.push(row);
    row = [];
  }

  // Walk the input once, handling quotes, commas, and line breaks.
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

  // Convert rows to objects keyed by header names.
  const data = dataRows.filter(r => r.some(c => c.trim() !== "")).map(r => {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = (r[j] ?? "").trim();
    return obj;
  });

  return { headers, data };
}

// Main roster management UI (edit, import, and read-only views).
export default function RostersClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teamQueryParam = searchParams.get("team");
  const role = (session?.user as any)?.role as string | undefined;
  const sessionTeamId = (session?.user as any)?.teamId as string | undefined;
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const teamPickerRef = useRef<HTMLSelectElement | null>(null);
  const [adminTeamId, setAdminTeamId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Wrestler[]>([]);
  const [rosterMsg, setRosterMsg] = useState("");
  const [editableRows, setEditableRows] = useState<EditableWrestler[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [spreadsheetColWidths, setSpreadsheetColWidths] = useState<number[]>([130, 110, 120, 70, 50, 80, 80, 90, 90, 90]);
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "last", dir: "asc" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, Set<keyof EditableWrestler> | undefined>>({});
  const rosterResizeRef = useRef<{ index: number; nextIndex: number | null; startX: number; startWidth: number; startNextWidth: number } | null>(null);
  const spectatorResizeRef = useRef<{ key: ViewerColumnKey; nextKey: ViewerColumnKey | null; startX: number; startWidth: number; startNextWidth: number } | null>(null);
  const originalRowsRef = useRef<Record<string, EditableWrestler | undefined>>({});
  const [showInactive, setShowInactive] = useState(false);
  const hasDirtyChanges = dirtyRowIds.size > 0;
  const hasFieldValidationErrors = useMemo(
    () => [...dirtyRowIds].some(rowId => (fieldErrors[rowId]?.size ?? 0) > 0),
    [dirtyRowIds, fieldErrors],
  );
  // Import state
  const [importTeamId, setImportTeamId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [importMsg, setImportMsg] = useState<string>("");
  const [importError, setImportError] = useState<string>("");
  const [importErrorFile, setImportErrorFile] = useState<string>("");
  const [importSummary, setImportSummary] = useState<string>("");
  const [showImportErrorModal, setShowImportErrorModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EditableWrestler | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingWrestler, setIsDeletingWrestler] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const rosterControlsRef = useRef<HTMLDivElement | null>(null);
  const [rosterControlsHeight, setRosterControlsHeight] = useState(0);
  const rosterSelectionStorageKey = "rosters:selectedTeamId";
  const daysPerYear = 365;
  // Close delete modal on Escape.
  // Load team list once auth state is known.
  // Rebuild editable rows whenever the server roster changes.
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDeleteModal(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);
  // Adjust editable column widths for narrow screens.
  // Restore last selected team from local storage.
  // Handle column resizing for the editable roster table.
  useEffect(() => {
    const applyEditableWidths = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth <= 900) {
        setSpreadsheetColWidths([70, 70, 100, 60, 60, 60, 60, 70, 70, 70]);
      } else {
        setSpreadsheetColWidths([130, 110, 120, 70, 70, 80, 80, 90, 90, 90]);
      }
    };
    applyEditableWidths();
    window.addEventListener("resize", applyEditableWidths);
    return () => window.removeEventListener("resize", applyEditableWidths);
  }, []);
  // Human-readable label for the import modal.
  const importTeamLabel = useMemo(() => {
    const team = teams.find(t => t.id === importTeamId);
    if (!team) return "no team selected";
    return `${team.name} (${team.symbol})`;
  }, [importTeamId, teams]);
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/admin", label: "Admin", roles: ["ADMIN"] as const },
  ];

  // Redirect to sign-in while preserving the return path.
  const redirectToLogin = () => {
    const callbackUrl = pathname || "/rosters";
    router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  };

  // Handle 401s consistently across data fetches.
  const handleUnauthorized = (res: Response) => {
    if (res.status === 401) {
      if (status !== "authenticated") {
        redirectToLogin();
      }
      return true;
    }
    return false;
  };

  // Switch selected team, guarding against unsaved edits.
  const selectTeam = (teamId: string) => {
    if (hasDirtyChanges) {
      setRosterMsg("Save or discard your edits before switching teams.");
      return;
    }
    setSelectedTeamId(teamId);
    setImportTeamId(teamId);
    setImportSummary("");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(rosterSelectionStorageKey, teamId);
    }
  };

  // Load the team list for the team picker.
  async function load() {
    const tRes = await fetch("/api/teams");
    if (handleUnauthorized(tRes)) return;
    if (tRes.ok) setTeams(await tRes.json());
  }

  // Convert birthdate to decimal years for display.
  function ageYears(birthdate: string) {
    const bDate = new Date(birthdate);
    if (Number.isNaN(bDate.getTime())) return null;
    const now = new Date();
    const days = Math.floor((now.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
    return days / daysPerYear;
  }

  // Accent color for sex labels.
  function sexColor(isGirl?: boolean) {
    if (isGirl === true) return "#d81b60";
    if (isGirl === false) return "#1565c0";
    return undefined;
  }

  // Default to the viewer's team for non-admin roles.
  // Handle column resizing for the read-only roster table.
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      redirectToLogin();
      return;
    }
    void load();
  }, [status]);
  // Admin-only: resolve the admin's team to preselect when needed.
  useEffect(() => {
    if (selectedTeamId || hasDirtyChanges) return;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(rosterSelectionStorageKey);
    if (!stored) return;
    if (!teams.some(t => t.id === stored)) return;
    setSelectedTeamId(stored);
    setImportTeamId(stored);
  }, [selectedTeamId, hasDirtyChanges, teams]);
  // Admin-only: preselect the admin team when no explicit selection exists.
  useEffect(() => {
    if ((role === "COACH" || role === "PARENT" || role === "TABLE_WORKER") && sessionTeamId && !selectedTeamId) {
      setSelectedTeamId(sessionTeamId);
      setImportTeamId(sessionTeamId);
    }
  }, [role, sessionTeamId, selectedTeamId]);
  // Clear import summary when switching teams.
  useEffect(() => {
    if (role !== "ADMIN") return;
    let active = true;
    const loadAdminTeam = () => {
      fetch("/api/me")
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!active) return;
          const teamId = typeof data?.teamId === "string" ? data.teamId : null;
          setAdminTeamId(teamId);
        })
        .catch(() => {
          // ignore
        });
    };
    loadAdminTeam();
    const handleRefresh = () => loadAdminTeam();
    const handleFocus = () => loadAdminTeam();
    window.addEventListener("user:refresh", handleRefresh);
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("user:refresh", handleRefresh);
      window.removeEventListener("focus", handleFocus);
    };
  }, [role]);
  // Allow deep-linking to a team via the query string.
  useEffect(() => {
    if (role !== "ADMIN") return;
    if (!adminTeamId) return;
    if (hasDirtyChanges) return;
    if (selectedTeamId) return;
    setSelectedTeamId(adminTeamId);
    setImportTeamId(adminTeamId);
  }, [role, adminTeamId, selectedTeamId, hasDirtyChanges]);

  // Close import modal on Escape.
  useEffect(() => {
    setImportSummary("");
  }, [selectedTeamId]);

  useEffect(() => {
    if (!teamQueryParam) return;
    if (hasDirtyChanges) return;
    if (selectedTeamId === teamQueryParam) return;
    if (!teams.some(t => t.id === teamQueryParam)) return;
    setSelectedTeamId(teamQueryParam);
    setImportTeamId(teamQueryParam);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(rosterSelectionStorageKey, teamQueryParam);
    }
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

  // Normalize XLSX date values or Date objects to YYYY-MM-DD.
  function normalizeDateValue(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed?.y && parsed.m && parsed.d) {
        const mm = String(parsed.m).padStart(2, "0");
        const dd = String(parsed.d).padStart(2, "0");
        return `${parsed.y}-${mm}-${dd}`;
      }
    }
    return null;
  }

  // Normalize a cell value to a trimmed string (with date coercion for birthdate).
  function normalizeCellValue(key: string, value: unknown) {
    if (value == null) return "";
    if (value instanceof Date || typeof value === "number") {
      if (/birth|dob|dateofbirth/i.test(key)) {
        const normalized = normalizeDateValue(value);
        if (normalized) return normalized;
      }
    }
    return String(value).trim();
  }

  // Parse CSV/XLSX roster files into normalized rows.
  async function parseRosterFile(f: File) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".xlsx")) {
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return { headers: [], data: [] };
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
      // Normalize each XLSX row into string values.
      const data = rawRows.map(row => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          normalized[key] = normalizeCellValue(key, value);
        }
        return normalized;
      });
      return { headers, data };
    }
    const text = await f.text();
    const parsed = parseCsv(text);
    return { headers: parsed.headers, data: parsed.data };
  }

  // Reset import state and build a preview for the chosen file.
  async function onChooseFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setImportMsg("");
    setImportError("");
    setImportErrorFile("");
    setShowImportErrorModal(false);

    if (!f) return;
    try {
      const parsed = await parseRosterFile(f);
      setPreview({ headers: parsed.headers, rows: parsed.data.slice(0, 8) });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unable to read roster file.");
      setImportErrorFile(f.name);
      setShowImportModal(false);
      setShowImportErrorModal(true);
    }
  }

  // Normalize header keys for loose matching.
  function normalizeKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Coerce a gender/sex cell to a boolean if possible.
  function normalizeIsGirl(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (["girl", "g", "female", "f", "true", "yes", "y", "1"].includes(normalized)) return true;
    if (["boy", "b", "male", "m", "false", "no", "n", "0"].includes(normalized)) return false;
    return undefined;
  }

  // Map raw row fields to canonical roster columns.
  function normalizeRow(r: Record<string, string>) {
    // Build a normalized header map for flexible column matching.
    const normalizedMap = Object.entries(r).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[normalizeKey(key)] = value;
      return acc;
    }, {});

    // Helper to read the first non-empty value across possible header aliases.
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const direct = r[k];
        if (typeof direct === "string" && direct.trim() !== "") return direct.trim();
        const normalized = normalizedMap[normalizeKey(k)];
        if (typeof normalized === "string" && normalized.trim() !== "") return normalized.trim();
      }
      return "";
    };

    const first = get("first", "First", "FIRST", "First Name", "firstname");
    const last = get("last", "Last", "LAST", "Last Name", "lastname");
    const weightStr = get("weight", "Weight", "WEIGHT", "wt", "Wt", "Actual Wt", "Actual Wt.", "Actual Weight");
    let birthdate = get(
      "birthdate",
      "Birthdate",
      "DOB",
      "dob",
      "DateOfBirth",
      "dateOfBirth",
      "Date of Birth",
      "Birth Date",
    );
    const expStr = get(
      "experienceYears",
      "ExperienceYears",
      "experience",
      "Experience",
      "expYears",
      "ExpYears",
      "Exp",
      "Experience Years",
    );
    const skillStr = get("skill", "Skill", "SKILL", "Skill Level");
    const sexStr = get("isGirl", "is_girl", "Sex", "sex", "gender", "Gender");

    const weight = Number(weightStr);
    const experienceYears = expStr ? Number(expStr) : 0;
    const skill = skillStr ? Number(skillStr) : 0;
    const isGirl = normalizeIsGirl(sexStr);

    if (birthdate) {
      const match = birthdate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        const mm = match[1].padStart(2, "0");
        const dd = match[2].padStart(2, "0");
        const yyyy = match[3];
        birthdate = `${yyyy}-${mm}-${dd}`;
      }
    }

    return { first, last, weight, birthdate, experienceYears, skill, isGirl };
  }

  // Build a stable key used to compare roster entries.
  function buildRosterKey(first: string, last: string, birthdate: string) {
    return `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}|${birthdate}`;
  }

  // Parse, validate, and import roster rows via the API.
  async function importCsv() {
    setImportMsg("");
    setImportError("");
    setImportErrorFile(file?.name ?? "");
    setShowImportErrorModal(false);

    try {
      if (!file) { setImportMsg("Choose a CSV or XLSX file first."); return; }
      setImportErrorFile(file.name);
      const teamId = importTeamId || undefined;

      if (!teamId) {
        setImportMsg("Select an existing team.");
        return;
      }

      const parsed = await parseRosterFile(file);

      if (parsed.headers.length === 0) {
        setImportMsg("File looks empty.");
        return;
      }

      // Normalize rows into canonical fields.
      const normalized = parsed.data.map(normalizeRow);
      // Identify rows missing required numeric fields for detailed error reporting.
      const skippedRows = normalized
        .map((w, idx) => ({
          row: idx + 2,
          first: w.first,
          last: w.last,
          missingExp: !Number.isFinite(w.experienceYears),
          missingSkill: !Number.isFinite(w.skill),
        }))
        .filter(r => r.missingExp || r.missingSkill);

      // Convert rows -> API payload
      const wrestlers = normalized
        .filter(w =>
          w.first &&
          w.last &&
          Number.isFinite(w.weight) &&
          w.weight > 0 &&
          w.birthdate &&
          Number.isFinite(w.experienceYears) &&
          Number.isFinite(w.skill)
        )
        .map(w => ({
          first: w.first,
          last: w.last,
          weight: Number(w.weight),
          birthdate: w.birthdate,
          experienceYears: Math.max(0, Math.floor(w.experienceYears)),
          skill: Math.min(5, Math.max(0, Math.floor(w.skill))),
          ...(w.isGirl !== undefined ? { isGirl: w.isGirl } : {}),
        }));

      if (wrestlers.length === 0) {
        const preview = skippedRows
          .slice(0, 8)
          .map(r => `${r.row}: ${r.first || "?"} ${r.last || "?"} (missing ${r.missingExp ? "experienceYears" : ""}${r.missingExp && r.missingSkill ? " + " : ""}${r.missingSkill ? "skill" : ""})`)
          .join("\n");
        const suffix = skippedRows.length > 8 ? `\n(and ${skippedRows.length - 8} more)` : "";
        const skippedDetail = skippedRows.length ? `\n\nProblem rows:\n${preview}${suffix}` : "";
        setImportMsg(`No valid wrestler rows found. Expected columns: first,last,weight,birthdate,experienceYears,skill. Optional: isGirl.${skippedDetail}`);
        return;
      }

      if (roster.length > 0) {
        // Estimate how many new wrestlers would be added to avoid accidental imports.
        const existingKeys = new Set(
          roster.map(w => buildRosterKey(w.first, w.last, w.birthdate.slice(0, 10))),
        );
        const estimatedNewCount = wrestlers.filter(w =>
          !existingKeys.has(buildRosterKey(w.first, w.last, w.birthdate)),
        ).length;
        if (estimatedNewCount > 5) {
          const ok = window.confirm(
            `This import will add about ${estimatedNewCount} new wrestlers. Is that expected?`,
          );
          if (!ok) {
            setImportMsg("Import canceled.");
            return;
          }
        }
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
        const detail = txt || res.statusText || "Unknown error";
        setImportError(`Import failed (${res.status}): ${detail}`);
        setShowImportModal(false);
        setShowImportErrorModal(true);
        return;
      }

      const json = await res.json();
      const created = Number(json.created ?? 0);
      const updated = Number(json.updated ?? 0);
      const summary = `Imported ${created} new${created === 1 ? " wrestler" : " wrestlers"}, updated ${updated}${updated === 1 ? " wrestler" : " wrestlers"}.`;
      setImportSummary(summary);

      if (skippedRows.length) {
        const preview = skippedRows
          .slice(0, 8)
          .map(r => `${r.row}: ${r.first || "?"} ${r.last || "?"} (missing ${r.missingExp ? "experienceYears" : ""}${r.missingExp && r.missingSkill ? " + " : ""}${r.missingSkill ? "skill" : ""})`)
          .join("\n");
        const suffix = skippedRows.length > 8 ? `\n(and ${skippedRows.length - 8} more)` : "";
        setImportMsg(summary);
        setImportError(`Skipped ${skippedRows.length} rows:\n${preview}${suffix}`);
        setShowImportModal(false);
        setShowImportErrorModal(true);
      } else {
        setImportMsg(summary);
      }
      setFile(null);
      setPreview(null);
      await load();
      await loadRoster(teamId);
      if (!skippedRows.length) {
        setShowImportModal(false);
      }
      setTimeout(() => setImportMsg(""), 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
      setShowImportModal(false);
      setShowImportErrorModal(true);
    }
  }

  // Load the full roster (including inactive) for the selected team.
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

  // Reload roster whenever the selected team changes.
  useEffect(() => {
    if (!selectedTeamId) {
      setRoster([]);
      return;
    }
    void loadRoster(selectedTeamId);
  }, [selectedTeamId]);

  // Track row dirty state to enable save/cancel actions.
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

  // Compare a row against the original snapshot.
  const isRowDirty = (row: EditableWrestler) => {
      if (row.isNew) {
        return Boolean(
          row.first.trim() ||
          row.last.trim() ||
          row.weight.trim() ||
          row.birthdate.trim() ||
          row.experienceYears.trim() ||
          row.skill.trim() ||
          row.isGirl
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
      row.isGirl !== original.isGirl ||
      row.active !== original.active
    );
  };

  // Recompute dirty state after a row edit.
  const markRowDirtyState = (row: EditableWrestler) => {
    updateDirtyState(row.id, isRowDirty(row));
  };

  // Record validation errors for a specific row.
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

  // Helper to check whether a cell has a validation error.
  const hasFieldError = (rowId: string, field: keyof EditableWrestler) => {
    return fieldErrors[rowId]?.has(field) ?? false;
  };

  // Validate a roster row and return its error set.
  const validateRow = (row: EditableWrestler) => {
    const errors = new Set<keyof EditableWrestler>();
    const first = row.first.trim();
    const last = row.last.trim();
    if (!first) errors.add("first");
    if (!last) errors.add("last");
    const weight = Number(row.weight);
    if (!Number.isFinite(weight) || weight < 30 || weight > 300) errors.add("weight");
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
    if (typeof row.isGirl !== "boolean") errors.add("isGirl");

    setRowFieldErrors(row.id, errors);
    return errors.size === 0;
  };

  // Persist a single row (create or update) after validation.
  const persistRow = async (row: EditableWrestler) => {
    if (!selectedTeamId) return false;
    if (!validateRow(row)) return false;
    const first = row.first.trim();
    const last = row.last.trim();
    const hasOriginal = originalRowsRef.current[row.id] !== undefined;
    const isNewRecord = row.isNew ?? !hasOriginal;
    if (isNewRecord) {
      // Avoid duplicate names within the team.
      const key = `${first.toLowerCase()}|${last.toLowerCase()}`;
      const duplicate = editableRows.some(other => {
        if (other.id === row.id) return false;
        const otherFirst = other.first.trim();
        const otherLast = other.last.trim();
        if (!otherFirst || !otherLast) return false;
        return `${otherFirst.toLowerCase()}|${otherLast.toLowerCase()}` === key;
      });
      if (duplicate) {
        window.alert("A wrestler with that name already exists on this team.");
        return false;
      }
    }
    const payload = {
      first,
      last,
      weight: Number(row.weight),
      birthdate: row.birthdate,
      experienceYears: Math.floor(Number(row.experienceYears)),
      skill: Math.floor(Number(row.skill)),
      isGirl: row.isGirl,
      active: row.active,
    };
    if (isNewRecord) {
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

  // Finalize a new row so it becomes a normal editable row.
  const prepareNewRowForSave = (row: EditableWrestler) => {
    if (!row.isNew) return;
    const first = row.first.trim();
    const last = row.last.trim();
    if (first && last) {
      // Block duplicate names before creating a new row slot.
      const key = `${first.toLowerCase()}|${last.toLowerCase()}`;
      const duplicate = editableRows.some(other => {
        if (other.id === row.id) return false;
        const otherFirst = other.first.trim();
        const otherLast = other.last.trim();
        if (!otherFirst || !otherLast) return false;
        return `${otherFirst.toLowerCase()}|${otherLast.toLowerCase()}` === key;
      });
      if (duplicate) {
        window.alert("A wrestler with that name already exists on this team.");
        return;
      }
    }
    setEditableRows(rows => {
      const mapped = rows.map(r =>
        r.id === row.id ? { ...r, isNew: false } : r,
      );
      return [createEmptyRow(), ...mapped];
    });
    markRowDirtyState({ ...row, isNew: false });
    setRosterMsg("New roster change ready. Save changes to persist.");
  };

  // Show the destructive delete confirmation modal.
  const openDeleteModal = (row: EditableWrestler) => {
    setDeleteError("");
    setDeleteTarget(row);
    setShowDeleteModal(true);
  };

  // Close delete modal and clear target state.
  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
    setDeleteError("");
  };

  // Permanently delete a wrestler and clear their bouts.
  const confirmDeleteWrestler = async () => {
    if (!selectedTeamId || !deleteTarget) return;
    setIsDeletingWrestler(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/teams/${selectedTeamId}/wrestlers/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(json?.error ?? "Unable to delete wrestler.");
      }
      await loadRoster(selectedTeamId);
      setRosterMsg(`${deleteTarget.first} ${deleteTarget.last} removed; bouts cleared.`);
      cancelDelete();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete wrestler.");
    } finally {
      setIsDeletingWrestler(false);
    }
  };

  // Persist all dirty rows (create/update) in one pass.
  const saveAllChanges = async () => {
    if (!selectedTeamId || dirtyRowIds.size === 0) return;
    if (hasFieldValidationErrors) {
      setRosterMsg("Please fix highlighted fields.");
      return;
    }
    setSavingAll(true);
    try {
      const rowsToSave = editableRows.filter(row => dirtyRowIds.has(row.id));
      const hasNewRows = rowsToSave.some(row => row.isNew);
      const updatedRowsById = new Map(rowsToSave.map(row => [row.id, row]));
      // Save each dirty row sequentially to surface server errors.
      for (const row of rowsToSave) {
        const ok = await persistRow(row);
        if (!ok) return;
      }
      if (hasNewRows) {
        await loadRoster(selectedTeamId);
      } else {
        setRoster(prev =>
          prev.map(w => {
            const updated = updatedRowsById.get(w.id);
            if (!updated) return w;
            return {
              ...w,
              first: updated.first.trim(),
              last: updated.last.trim(),
              weight: Number(updated.weight),
              birthdate: updated.birthdate,
              experienceYears: Number(updated.experienceYears),
              skill: Number(updated.skill),
              isGirl: updated.isGirl,
              active: updated.active,
            };
          }),
        );
      }
      setDirtyRowIds(new Set());
      setRosterMsg("Roster saved.");
    } finally {
      setSavingAll(false);
    }
  };

  // Discard local edits and reload from the server.
  const cancelChanges = async () => {
    if (!selectedTeamId) return;
    setDirtyRowIds(new Set());
    setFieldErrors({});
    setRosterMsg("Changes discarded.");
    await loadRoster(selectedTeamId);
  };

  // Update a single editable cell and revalidate the row.
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
  // Columns for the editable spreadsheet-like roster.
  const rosterSheetColumns = [
    { key: "last", label: "Last" },
    { key: "first", label: "First" },
    { key: "birthdate", label: "Birthday" },
    { key: "age", label: "Age" },
    { key: "sex", label: "Girl" },
    { key: "weight", label: "Weight" },
    { key: "experienceYears", label: "Exp" },
    { key: "skill", label: "Skill" },
    { key: "active", label: "Status" },
    { key: "actions", label: "Actions" },
  ];

  const [spectatorColWidths, setSpectatorColWidths] = useState<Record<ViewerColumnKey, number>>(() => ({
    last: 120,
    first: 120,
    age: 70,
    sex: 60,
    weight: 90,
    experienceYears: 90,
    skill: 110,
    active: 110,
  }));
  // Adjust read-only column widths for narrow screens.
  useEffect(() => {
    const applyWidths = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth <= 900) {
        setSpectatorColWidths(widths => ({
          ...widths,
          last: 70,
          first: 70,
          age: 40,
          sex: 45,
          weight: 60,
          experienceYears: 60,
          skill: 70,
          active: 70,
        }));
      } else {
        setSpectatorColWidths(widths => ({
          ...widths,
          last: 120,
          first: 120,
          age: 70,
          sex: 60,
          weight: 90,
          experienceYears: 90,
          skill: 110,
          active: 110,
        }));
      }
    };
    applyWidths();
    window.addEventListener("resize", applyWidths);
    return () => window.removeEventListener("resize", applyWidths);
  }, []);

  // Render column widths for the editable roster table.
  const renderColGroup = () => (
    <colgroup>
      {spreadsheetColWidths.map((width, idx) => (
        <col key={`spreadsheet-col-${idx}`} style={{ width }} />
      ))}
    </colgroup>
  );

  // Render the sort direction indicator for active column.
  const renderSortArrow = (key: string) => {
    if (sortConfig.key !== key) return null;
    return <span className="sort-arrow">{sortConfig.dir === "asc" ? "▲" : "▼"}</span>;
  };

  // Toggle sort direction or switch to a new sort key.
  const handleSortColumn = (key: string) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  };

  // Return a comparable value for sorting editable rows.
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
      case "sex":
        return row.isGirl ? 0 : 1;
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
  // Return a comparable value for sorting read-only rows.
  const getViewerSortValue = (row: Wrestler, key: ViewerColumnKey) => {
    switch (key) {
      case "last":
        return row.last.toLowerCase();
      case "first":
        return row.first.toLowerCase();
      case "age":
        return row.birthdate ? ageYears(row.birthdate) ?? 0 : 0;
      case "sex":
        return row.isGirl ? 0 : 1;
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

  // Sort the editable rows for display.
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
      isGirl: w.isGirl,
      active: w.active,
    }));
    const originals: Record<string, EditableWrestler> = {};
    // Capture a baseline snapshot for dirty comparisons.
    rows.forEach(r => {
      originals[r.id] = r;
    });
    originalRowsRef.current = originals;
    setDirtyRowIds(new Set());
    setEditableRows([createEmptyRow("new"), ...rows]);
    setFieldErrors({});
  }, [roster]);

  useEffect(() => {
    const handleResizeMove = (clientX: number) => {
      if (!rosterResizeRef.current) return;
      const { index, nextIndex, startX, startWidth, startNextWidth } = rosterResizeRef.current;
      if (nextIndex === null) return;
      const delta = clientX - startX;
      const minWidth = 60;
      const maxShrink = Math.max(0, startNextWidth - minWidth);
      const maxGrow = Math.max(0, startWidth - minWidth);
      const clampedDelta = Math.max(-maxGrow, Math.min(maxShrink, delta));
      const nextWidth = startNextWidth - clampedDelta;
      const newWidth = startWidth + clampedDelta;
      setSpreadsheetColWidths(widths =>
        widths.map((w, idx) => {
          if (idx === index) return newWidth;
          if (idx === nextIndex) return nextWidth;
          return w;
        }),
      );
    };
    // Track mouse drag for column resizing.
    function onMouseMove(e: MouseEvent) {
      handleResizeMove(e.clientX);
    }
    // Track touch drag for column resizing.
    function onTouchMove(e: TouchEvent) {
      if (!rosterResizeRef.current) return;
      if (e.touches.length === 0) return;
      e.preventDefault();
      handleResizeMove(e.touches[0].clientX);
    }
    // Clear resize state on drag end.
    function onResizeEnd() {
      rosterResizeRef.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onResizeEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onResizeEnd);
    window.addEventListener("touchcancel", onResizeEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onResizeEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onResizeEnd);
      window.removeEventListener("touchcancel", onResizeEnd);
    };
  }, []);

  useEffect(() => {
    const handleResizeMove = (clientX: number) => {
      if (!spectatorResizeRef.current) return;
      const { key, nextKey, startX, startWidth, startNextWidth } = spectatorResizeRef.current;
      if (!nextKey) return;
      const delta = clientX - startX;
      const minWidth = 60;
      const maxShrink = Math.max(0, startNextWidth - minWidth);
      const maxGrow = Math.max(0, startWidth - minWidth);
      const clampedDelta = Math.max(-maxGrow, Math.min(maxShrink, delta));
      const nextWidth = startNextWidth - clampedDelta;
      const newWidth = startWidth + clampedDelta;
      setSpectatorColWidths(widths => ({ ...widths, [key]: newWidth, [nextKey]: nextWidth }));
    };
    // Track mouse drag for column resizing.
    function onMouseMove(e: MouseEvent) {
      handleResizeMove(e.clientX);
    }
    // Track touch drag for column resizing.
    function onTouchMove(e: TouchEvent) {
      if (!spectatorResizeRef.current) return;
      if (e.touches.length === 0) return;
      e.preventDefault();
      handleResizeMove(e.touches[0].clientX);
    }
    // Clear resize state on drag end.
    function onResizeEnd() {
      spectatorResizeRef.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onResizeEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onResizeEnd);
    window.addEventListener("touchcancel", onResizeEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onResizeEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onResizeEnd);
      window.removeEventListener("touchcancel", onResizeEnd);
    };
  }, []);

  // Normalize pointer position across mouse and touch events.
  const getResizeClientX = (e: ReactMouseEvent<HTMLSpanElement> | ReactTouchEvent<HTMLSpanElement>) => {
    if ("touches" in e) {
      const touch = e.touches[0];
      return touch.clientX;
    }
    return e.clientX;
  };

  // Start column resize drag in the editable table.
  const handleColMouseDown = (index: number, e: ReactMouseEvent<HTMLSpanElement> | ReactTouchEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const nextIndex = index + 1 < spreadsheetColWidths.length ? index + 1 : null;
    if (nextIndex === null) return;
    rosterResizeRef.current = {
      index,
      nextIndex,
      startX: getResizeClientX(e),
      startWidth: spreadsheetColWidths[index],
      startNextWidth: spreadsheetColWidths[nextIndex],
    };
  };

  // Start column resize drag in the read-only table.
  const handleSpectatorColMouseDown = (key: ViewerColumnKey, e: ReactMouseEvent<HTMLSpanElement> | ReactTouchEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const currentIndex = spectatorColumns.findIndex(col => col.key === key);
    const nextKey = currentIndex >= 0 && currentIndex + 1 < spectatorColumns.length ? spectatorColumns[currentIndex + 1].key : null;
    if (!nextKey) return;
    spectatorResizeRef.current = {
      key,
      nextKey,
      startX: getResizeClientX(e),
      startWidth: spectatorColWidths[key],
      startNextWidth: spectatorColWidths[nextKey],
    };
  };

  // Format age with one decimal place for display cells.
  const getAgeLabel = (birthdate: string) => {
    if (!birthdate) return "";
    const yrs = ageYears(birthdate);
    return typeof yrs === "number" ? yrs.toFixed(1) : "";
  };

  // Column definitions for the read-only roster table.
  const rosterViewerColumns: ViewerColumn[] = [
    { key: "last", label: "Last", width: 120 },
    { key: "first", label: "First", width: 120 },
    { key: "age", label: "Age", width: 120 },
    { key: "sex", label: "Girl", width: 80 },
    { key: "weight", label: "Weight", width: 90 },
    { key: "experienceYears", label: "Exp", width: 90 },
    { key: "skill", label: "Skill", width: 110 },
    { key: "active", label: "Status", width: 110 },
  ];
  const spectatorColumns = hideSkillAndStatus
    ? rosterViewerColumns.filter(col => col.key !== "skill" && col.key !== "active")
    : rosterViewerColumns;
  // Render a single cell in the read-only roster table.
  const renderSpectatorCell = (key: ViewerColumnKey, wrestler: Wrestler) => {
    switch (key) {
      case "last":
        return wrestler.last;
      case "first":
        return wrestler.first;
      case "age":
        return (
          <span style={{ color: sexColor(wrestler.isGirl) }}>
            {ageYears(wrestler.birthdate)?.toFixed(1) ?? ""}
          </span>
        );
      case "sex":
        return (
          <div className="spreadsheet-checkbox">
            <input type="checkbox" checked={wrestler.isGirl} readOnly disabled aria-label="Girl" />
          </div>
        );
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
  // Order teams alphabetically, preferring the viewer's team first.
  const orderedTeams = useMemo(() => {
    const preferredTeamId = role === "ADMIN" ? adminTeamId ?? sessionTeamId : sessionTeamId;
    const sorted = [...teams];
    sorted.sort((a, b) => {
      const aSymbol = a.symbol.trim().toLowerCase();
      const bSymbol = b.symbol.trim().toLowerCase();
      if (aSymbol && bSymbol) {
        const symbolCompare = aSymbol.localeCompare(bSymbol);
        if (symbolCompare !== 0) return symbolCompare;
      } else if (aSymbol) {
        return -1;
      } else if (bSymbol) {
        return 1;
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    if (!preferredTeamId) return sorted;
    const mine = sorted.find(t => t.id === preferredTeamId);
    if (!mine) return sorted;
    return [mine, ...sorted.filter(t => t.id !== preferredTeamId)];
  }, [adminTeamId, role, sessionTeamId, teams]);

  // Disable inactive toggle for roles that should not see it.
  useEffect(() => {
    if (!allowInactiveView && showInactive) {
      setShowInactive(false);
    }
  }, [allowInactiveView, showInactive]);

  // Create a new blank editable row for inline entry.
  const createEmptyRow = (id?: string): EditableWrestler => ({
    id: id ?? `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    first: "",
    last: "",
    weight: "",
    birthdate: "",
    experienceYears: "0",
    skill: "0",
    isGirl: false,
    active: true,
    isNew: true,
  });

  // Allow Enter to commit a new row and create another.
  const handleNewRowInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>, row: EditableWrestler) => {
    if (event.key !== "Enter" || !row.isNew || !isRowDirty(row)) return;
    event.preventDefault();
    prepareNewRowForSave(row);
  };

  const fieldRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());

  // Track field refs so keyboard navigation can move focus.
  const registerFieldRef = (rowId: string, field: keyof EditableWrestler, el: HTMLInputElement | HTMLSelectElement | null) => {
    const key = `${rowId}-${field}`;
    if (el) {
      fieldRefs.current.set(key, el);
    } else {
      fieldRefs.current.delete(key);
    }
  };

  // Focus a specific editable cell by row + field.
  const focusField = (rowId: string, field: keyof EditableWrestler) => {
    const key = `${rowId}-${field}`;
    const target = fieldRefs.current.get(key);
    target?.focus();
  };

  // Move focus to the same field on the next/previous row.
  const focusAdjacentRow = (rowId: string, field: keyof EditableWrestler, direction: "up" | "down") => {
    const allRows = [...newRows, ...sortedEditableRows];
    const idx = allRows.findIndex(r => r.id === rowId);
    if (idx === -1) return;
    const nextIdx = direction === "down" ? Math.min(allRows.length - 1, idx + 1) : Math.max(0, idx - 1);
    const nextRow = allRows[nextIdx];
    focusField(nextRow.id, field);
  };

  // Keyboard shortcuts for row navigation and save/cancel.
  const handleInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    row: EditableWrestler,
    field: keyof EditableWrestler,
  ) => {
    handleNewRowInputKeyDown(event, row);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAdjacentRow(row.id, field, event.key === "ArrowDown" ? "down" : "up");
    }
  };

  // Render a single editable roster row.
  const renderEditableRow = (row: EditableWrestler, isNewRow = false) => {
    const ageDisplay = row.birthdate ? getAgeLabel(row.birthdate) : "";
    const lastClass = `spreadsheet-input${hasFieldError(row.id, "last") ? " field-error" : ""}`;
    const firstClass = `spreadsheet-input${hasFieldError(row.id, "first") ? " field-error" : ""}`;
    const birthdateClass = `spreadsheet-input${hasFieldError(row.id, "birthdate") ? " field-error" : ""}`;
    const weightClass = `spreadsheet-input${hasFieldError(row.id, "weight") ? " field-error" : ""}`;
    const expClass = `spreadsheet-input${hasFieldError(row.id, "experienceYears") ? " field-error" : ""}`;
    const skillClass = `spreadsheet-input${hasFieldError(row.id, "skill") ? " field-error" : ""}`;
    const sexClass = `spreadsheet-checkbox${hasFieldError(row.id, "isGirl") ? " field-error" : ""}`;
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
            name={`birthdate-${row.id}`}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-roboform-ignore="true"
            data-rfignore="true"
            disabled={!canEditRoster}
            ref={el => registerFieldRef(row.id, "birthdate", el)}
            onKeyDown={e => handleInputKeyDown(e, row, "birthdate")}
          />
        </td>
        <td>
          <div className="spreadsheet-age" style={{ color: sexColor(row.isGirl) }}>
            {ageDisplay || "?"}
          </div>
        </td>
        <td>
          <div className={sexClass}>
            <input
              type="checkbox"
              checked={row.isGirl}
              onChange={e => handleFieldChange(row.id, "isGirl", e.target.checked)}
              disabled={!canEditRoster}
              ref={el => registerFieldRef(row.id, "isGirl", el)}
              onKeyDown={e => handleInputKeyDown(e, row, "isGirl")}
              aria-label="Girl"
            />
          </div>
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
          {isNewRow ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => prepareNewRowForSave(row)}
              disabled={!rowDirty || hasErrors}
            >
              Add
            </button>
          ) : (
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
          )}
        </td>
        <td className="action-cell">
          {!isNewRow && canEditRoster ? (
            <button
              type="button"
              className="btn btn-ghost btn-small delete-row-btn"
              onClick={() => openDeleteModal(row)}
              disabled={hasDirtyChanges || isDeletingWrestler}
              title={hasDirtyChanges ? "Save or cancel pending changes before deleting" : undefined}
            >
              Delete
            </button>
          ) : (
            <span aria-hidden="true">&nbsp;</span>
          )}
        </td>
      </tr>
    );
  };

  // Build a sorted read-only roster for non-editing viewers.
  const displayRoster = useMemo(() => {
    const viewerSortKey = spectatorColumns.some(col => col.key === sortConfig.key)
      ? (sortConfig.key as ViewerColumnKey)
      : "last";
    const rows = roster.filter(w => includeInactiveRows || w.active);
    rows.sort((a, b) => {
      const aVal = getViewerSortValue(a, viewerSortKey);
      const bVal = getViewerSortValue(b, viewerSortKey);
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortConfig.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return 0;
    });
    return rows;
  }, [roster, includeInactiveRows, sortConfig, spectatorColumns]);

  // Aggregate roster totals for summary display.
  const rosterTotals = useMemo(() => {
    const total = roster.length;
    const inactive = roster.filter(w => !w.active).length;
    const girls = roster.filter(w => w.isGirl).length;
    return { total, inactive, girls };
  }, [roster]);

  // Export only active wrestlers.
  const downloadableRoster = useMemo(() => displayRoster.filter(row => row.active), [displayRoster]);

  // Build and download a CSV export of the active roster.
  const downloadRosterCsv = () => {
    if (!selectedTeamId) return;
    if (downloadableRoster.length === 0) return;

    // Escape commas/quotes for CSV output.
    const escape = (value: string | number | boolean) => {
      const text = String(value);
      if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    // Convert rows to CSV-safe cell arrays.
    const rows = downloadableRoster.map(row => {
      const birthdateValue = row.birthdate ? row.birthdate.split("T")[0] : "";
      return [
        escape(row.first),
        escape(row.last),
        escape(row.weight),
        escape(birthdateValue),
        escape(row.experienceYears),
        escape(row.skill),
        escape(row.isGirl),
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

  // Measure the roster header to pin scrolling content below it.
  useEffect(() => {
    const el = rosterControlsRef.current;
    if (!el) return;
    const updateHeight = () => {
      setRosterControlsHeight(Math.ceil(el.getBoundingClientRect().height));
    };
    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
          height: auto;
          padding: 18px 12px 30px;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        .teams > header {
          flex: 0 0 auto;
        }
        .nav {
          display: flex;
          gap: 24px;
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
          padding: 10px 14px;
          font-weight: 600;
          font-size: 15px;
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
          grid-template-rows: minmax(0, 1fr);
          gap: 18px;
          flex: 1;
          min-height: 0;
          align-items: stretch;
          height: auto;
        }
        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
          min-height: 0;
          max-height: auto;
          height: auto;
        }
        .roster-card {
          width: fit-content;
          max-width: 100%;
          align-self: stretch;
          flex: 1;
          height: calc(100dvh + var(--roster-controls-height, 0px) + var(--roster-extra-height, 40px));
          min-height: calc(100dvh + var(--roster-controls-height, 0px) + var(--roster-extra-height, 40px));
          max-height: none;
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
          padding: 12px 16px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          cursor: pointer;
        }
        .btn-small {
          padding: 6px 12px;
          font-size: 12px;
          text-transform: none;
          letter-spacing: 0.5px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 88px;
        }
        .btn-large {
          padding: 10px 18px;
          font-size: 14px;
          text-transform: none;
          letter-spacing: 0.4px;
          min-width: 120px;
        }
          .roster-summary-bar {
            display: grid;
            grid-template-columns: auto 1fr auto;
            align-items: center;
            gap: 24px;
            margin-bottom: 8px;
            min-height: 44px;
          }
          .roster-summary-bar .header-checkbox {
            justify-self: end;
          }
        .roster-summary {
          font-size: 15px;
          font-weight: 600;
          justify-self: start;
        }
        .roster-action-bar {
          display: inline-flex;
          justify-content: center;
          gap: 14px;
          justify-self: start;
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
          align-items: center;
        }
        .roster-action-bar.visible {
          visibility: visible;
          opacity: 1;
          pointer-events: auto;
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
          gap: 24px;
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
        .team-selector-wrapper {
          position: relative;
        }
        .team-picker {
          min-width: 220px;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid var(--line);
          background: #fff;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
        }
        .team-current-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }
        .team-current-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .team-current-name {
          font-weight: 700;
        }
        .team-current-coach {
          font-size: 14px;
          color: #5b6472;
        }
        .team-current-meta .team-logo {
          width: 56px;
          height: 56px;
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
          gap: 24px;
        }
        .header-left-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .roster-toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin: 0 0 4px;
        }
        .roster-toolbar .error-msg-placeholder {
          min-height: unset;
        }
        .roster-summary-bar .error-msg-placeholder {
          min-height: unset;
          margin-left: 12px;
        }
        .roster-summary-bar .error-msg {
          color: #b00020;
          font-weight: 600;
        }
        .header-team {
          gap: 24px;
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
            overflow: hidden;
          }
        .team-logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
        }
        .team-meta {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: nowrap;
          flex: 1;
          min-width: 0;
        }
        .team-symbol {
          font-weight: 700;
          font-size: 18px;
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .team-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1 1 auto;
          min-width: 0;
          width: 100%;
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
          gap: 24px;
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
          background: #fff;
          display: block;
          width: 100%;
          flex: 1;
          min-height: 0;
          overflow-x: auto;
          overflow-y: auto;
          height: 100%;
        }
        .roster-table table {
          table-layout: auto;
          border-collapse: collapse;
          display: block;
          min-width: 480px;
          width: max-content;
          max-height: none;
          height: auto;
          overflow-y: auto;
        }
        .roster-table tbody tr:hover {
          background: #f7f9fb;
        }
        .roster-table th,
        .roster-table td {
          padding: 0 2px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          line-height: 1.4;
          font-size: 14px;
        }
        .roster-table th {
          background: #f0f4ff;
          font-weight: 600;
        }
        .roster-table tbody tr:nth-child(even) {
          background: #f7f9fb;
        }
        .roster-table td:last-child {
          white-space: nowrap;
        }
        .roster-table td:last-child .btn {
          width: auto;
        }
        .roster-th {
          position: relative;
          padding-right: 14px;
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
          touch-action: none;
          pointer-events: auto;
          z-index: 2;
          background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0) 100%);
        }
        @media (max-width: 900px) {
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
          .roster-card {
            width: 100%;
          }
          .roster-wrapper {
            width: 100%;
            overflow-x: auto;
          }
          .card-title {
            font-size: 16px;
          }
          .header-main {
            flex-direction: column;
            align-items: flex-start;
          }
          .header-title-group {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          .team-picker {
            width: 100%;
          }
          .team-current-meta {
            margin-top: 4px;
          }
          .header-left-controls {
            width: 100%;
          }
          .roster-toolbar {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
          }
          .roster-toolbar .btn {
            width: 100%;
          }
          .roster-summary-bar {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .roster-action-bar {
            flex-wrap: wrap;
            justify-content: flex-start;
          }
          .roster-action-bar .btn {
            width: 100%;
          }
          .roster-table th,
          .roster-table td {
            padding: 2px 4px;
            font-size: 15px;
          }
          .roster-table table,
          .spreadsheet-table {
            min-width: 480px;
          }
          .spreadsheet-table th,
          .spreadsheet-table td,
          .roster-table th,
          .roster-table td {
            max-width: 120px;
          }
          .roster-table th:nth-child(3),
          .roster-table td:nth-child(3),
          .roster-table th:nth-child(4),
          .roster-table td:nth-child(4),
          .roster-table th:nth-child(5),
          .roster-table td:nth-child(5) {
            max-width: 70px;
          }
          .roster-table table {
            table-layout: fixed;
          }
          .roster-table th,
          .roster-table td {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
        .spreadsheet-checkbox {
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }
        .spreadsheet-checkbox input {
          margin: 0;
        }
        .roster-wrapper {
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
          width: fit-content;
          max-width: 100%;
          margin: 0;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          height: calc(100dvh + var(--roster-extra-height, 40px));
        }
        .roster-grid {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          height: auto;
        }
        .static-roster {
          border-bottom: 1px solid var(--line);
          background: #fff;
        }
        .static-roster table {
          border-collapse: collapse;
        }
        .roster-scroll {
          max-height: none;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          background: #fff;
          height: 100%;
        }
        .spreadsheet-table {
          border-collapse: collapse;
          border: 1px solid rgba(29, 56, 162, 0.4);
          box-shadow: 0 2px 12px rgba(29, 56, 162, 0.15);
          background: #fff;
          width: max-content;
        }
        .spreadsheet-table th,
        .spreadsheet-table td {
          padding: 2px 4px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          line-height: 1.15;
          font-size: 14px;
        }
        .spreadsheet-table th,
        .roster-table th {
          position: relative;
        }
        .spreadsheet-table th {
          background: #f7f9fb;
          font-weight: 700;
          position: relative;
        }
        .spreadsheet-table th.action-cell,
        .spreadsheet-table td.action-cell {
          text-align: center;
        }
        .delete-row-btn {
          padding: 4px 10px;
          min-width: 68px;
        }
        .actions-header {
          font-weight: 600;
        }
        .spreadsheet-table tbody tr:hover {
          background: rgba(29, 56, 162, 0.12);
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
          user-select: none;
          touch-action: none;
          pointer-events: auto;
          z-index: 2;
          background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0) 100%);
        }
        .spreadsheet-input,
        .spreadsheet-select {
          width: 100%;
          min-width: 0;
          padding: 0px 8px;
          border: 0;
          font-size: 14px;
          background: transparent;
          border-radius: 0;
        }
        .spreadsheet-input[type="date"] {
          min-width: 0;
          width: 100%;
          text-align: left;
        }
        .spreadsheet-input[type="date"]::-webkit-datetime-edit,
        .spreadsheet-input[type="date"]::-webkit-datetime-edit-fields-wrapper,
        .spreadsheet-input[type="date"]::-webkit-datetime-edit-text,
        .spreadsheet-input[type="date"]::-webkit-datetime-edit-month-field,
        .spreadsheet-input[type="date"]::-webkit-datetime-edit-day-field,
        .spreadsheet-input[type="date"]::-webkit-datetime-edit-year-field {
          text-align: left;
        }
        .spreadsheet-input[type="date"]::-webkit-datetime-edit-fields-wrapper {
          justify-content: flex-start;
        }
        .spreadsheet-input[type="date"]::-webkit-date-and-time-value {
          text-align: left;
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
          font-size: 15px;
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
          height: auto;
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
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }
        .import-team-logo {
          width: 48px;
          height: 48px;
          object-fit: contain;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: #fff;
        }
        .import-team-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .import-team-label {
          font-size: 18px;
          font-weight: 700;
          color: var(--ink);
          line-height: 1.2;
        }
        .import-team-dot {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid var(--line);
        }
        .import-modal-body {
          max-height: 60vh;
          overflow: auto;
        }
        .import-modal-footer {
          display: flex;
          justify-content: flex-end;
          margin-top: 14px;
          gap: 24px;
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

      <div className="grid">

        <section
          className="card roster-card"
          style={{ ["--roster-controls-height" as any]: `${rosterControlsHeight}px` }}
        >
          <div className="card-header" ref={rosterControlsRef}>
            <div className="header-left">
              <div className="header-main">
                <div className="header-title-group">
                  <div className="team-selector-wrapper">
                    <select
                      ref={teamPickerRef}
                      className="team-picker"
                      value={selectedTeamId}
                      onChange={(event) => selectTeam(event.target.value)}
                      disabled={teams.length === 0 || hasDirtyChanges}
                    >
                      <option value="" disabled>Select a team</option>
                      {/* Team selector options (ordered with preferred team first). */}
                      {orderedTeams.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.symbol ? `${t.symbol} - ${t.name}` : t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {currentTeam && (
                    <div className="team-current-meta">
                      {currentTeam.hasLogo ? (
                        <img
                          src={`/api/teams/${currentTeam.id}/logo/file`}
                          alt={`${currentTeam.name} logo`}
                          className="team-logo"
                        />
                      ) : (
                        <div className="color-dot" style={{ backgroundColor: currentTeam.color }} />
                      )}
                      <div className="team-current-text">
                        <div className="team-current-name">{currentTeam.name}</div>
                        <div className="team-current-coach">
                          Head coach: {currentTeam.headCoach?.username ?? "unassigned"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="header-left-controls" />
              </div>
            </div>
          </div>
          {selectedTeamId ? (
            <>
              <div className="roster-toolbar">
                {canEditRoster && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small header-import"
                    title="Upload a CSV or XLSX file to import or update the roster."
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                      setImportMsg("");
                      setImportError("");
                      setShowImportErrorModal(false);
                      setShowImportModal(true);
                    }}
                    disabled={hasDirtyChanges || !selectedTeamId}
                  >
                    Import or Update Roster
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-small header-download"
                  title="Download the current roster as CSV"
                  onClick={downloadRosterCsv}
                  disabled={!selectedTeamId || displayRoster.length === 0 || hasDirtyChanges}
                >
                  Download Roster
                </button>
              </div>
              {!canEditRoster && (
                <div className="error-msg-placeholder">
                  {hasFieldValidationErrors ? (
                    <div className="error-msg">Please fix highlighted fields.</div>
                  ) : rosterMsg ? (
                    <div className="error-msg">{rosterMsg}</div>
                  ) : (
                    <span aria-hidden="true">&nbsp;</span>
                  )}
                </div>
              )}
              <div className="roster-summary-bar">
                <div className="roster-summary">
                  {(() => {
                    const parts: string[] = [];
                    if (rosterTotals.girls > 0) parts.push(`girls: ${rosterTotals.girls}`);
                    if (rosterTotals.inactive > 0) parts.push(`inactive: ${rosterTotals.inactive}`);
                    return `Wrestlers: ${rosterTotals.total}${parts.length ? ` (${parts.join(", ")})` : ""}`;
                  })()}
                  {importSummary ? ` - ${importSummary}` : ""}
                </div>
                <div className={`roster-action-bar${canEditRoster && hasDirtyChanges ? " visible" : ""}`}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-large"
                    title="Discard all unsaved roster edits"
                    onClick={cancelChanges}
                    disabled={!canEditRoster || !hasDirtyChanges || savingAll}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-large"
                    title="Save all roster edits"
                    onClick={saveAllChanges}
                    disabled={!canEditRoster || !hasDirtyChanges || savingAll || hasFieldValidationErrors}
                  >
                    {savingAll ? "Saving..." : "Save Changes"}
                  </button>
                  <div className="error-msg-placeholder">
                    {hasFieldValidationErrors ? (
                      <div className="error-msg">Please fix highlighted fields.</div>
                    ) : rosterMsg ? (
                      <div className="error-msg">{rosterMsg}</div>
                    ) : (
                      <span aria-hidden="true">&nbsp;</span>
                    )}
                  </div>
                </div>
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
              </div>
              <div className="roster-wrapper">
                {canEditRoster ? (
                  <div className="roster-grid">
                    <div className="static-roster">
                      <table className="spreadsheet-table">
                        {renderColGroup()}
                        <thead>
                          <tr>
                            {/* Column headers with sorting + resize handles. */}
                            {rosterSheetColumns.map((col, idx) => (
                              <th key={col.key} className={col.key === "actions" ? "action-cell" : ""}>
                                {col.key === "actions" ? (
                                  <span className="actions-header">{col.label}</span>
                                ) : (
                                  <button
                                    type="button"
                                    className={`sortable-header${sortConfig.key === col.key ? " active" : ""}`}
                                    onClick={() => handleSortColumn(col.key)}
                                  >
                                    {col.label}
                                    {renderSortArrow(col.key)}
                                  </button>
                                )}
                                <span
                                  className="col-resizer"
                                  onMouseDown={e => handleColMouseDown(idx, e)}
                                  onTouchStart={e => handleColMouseDown(idx, e)}
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
                            // Render the "new row" entry at the top.
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
                            // Render sorted editable roster rows.
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
                        {/* Fixed column widths for read-only roster. */}
                        {spectatorColumns.map(col => (
                          <col key={col.key} style={{ width: spectatorColWidths[col.key] }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          {/* Column headers with sorting + resize handles. */}
                          {spectatorColumns.map(col => (
                            <th key={col.key} className="roster-th">
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
                                onMouseDown={e => handleSpectatorColMouseDown(col.key, e)}
                                onTouchStart={e => handleSpectatorColMouseDown(col.key, e)}
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Render read-only roster rows. */}
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
              <h3 id="import-title">Import or update roster from XLSX or CSV file:</h3>
              <div className="import-team-row">
                {currentTeam?.hasLogo ? (
                  <img
                    src={`/api/teams/${currentTeam.id}/logo/file`}
                    alt={`${currentTeam.name} logo`}
                    className="import-team-logo"
                  />
                ) : currentTeam ? (
                  <span
                    className="import-team-dot"
                    style={{ backgroundColor: currentTeam.color }}
                    aria-hidden="true"
                  />
                ) : null}
                <div className="import-team-label" style={{ color: currentTeam?.color ?? undefined }}>
                  {importTeamLabel}
                </div>
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 14 }}>
                Note: new wrestlers are added, existing wrestlers are updated when first and last names match, and no existing wrestlers are ever removed.
              </div>
            </div>
            <div className="import-modal-body">
              <label className="muted">XLSX or CSV file</label>
              <input
                className="input"
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => onChooseFile(e.target.files?.[0] ?? null)}
              />
              <div className="muted" style={{ marginTop: 6 }}>
                Required columns: <b>first,last,weight,birthdate (YYYY-MM-DD),experienceYears,skill</b>. Optional: <b>isGirl</b>.
              </div>
              {importMsg && (
                <div
                  className="muted"
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    border: "1px solid #dfe3e8",
                    borderRadius: 6,
                    background: "#f7f9fb",
                    position: "sticky",
                    bottom: 0,
                    zIndex: 1,
                  }}
                >
                  {importMsg}
                </div>
              )}
              {preview && (
                <div className="import-preview">
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Preview (first {preview.rows.length} rows). Headers: {preview.headers.join(", ")}
                  </div>
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {/* Preview headers (first 8 columns). */}
                        {preview.headers.slice(0, 8).map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Preview rows (first 8 columns). */}
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
                  <pre style={{ whiteSpace: "pre-wrap" }}>{`first,last,weight,birthdate,experienceYears,skill,isGirl
  Ben,Askren,52,2015-03-11,1,3,false
  John,Smith,55,2014-11-02,0,2,true
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
                Import / Update Roster
              </button>
            </div>
          </div>
        </div>
      )}
      {showImportErrorModal && importError && (
        <div
          className="import-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-error-title"
          onClick={() => setShowImportErrorModal(false)}
        >
          <div className="import-modal" onClick={event => event.stopPropagation()}>
            <div className="import-modal-header">
              <h3 id="import-error-title">
                Import error{importErrorFile ? `: ${importErrorFile}` : ""}
              </h3>
            </div>
            <div className="import-modal-body">
              <div className="error-msg" style={{ whiteSpace: "pre-line" }}>{importError}</div>
            </div>
            <div className="import-modal-footer">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setShowImportErrorModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteModal && deleteTarget && (
        <div className="import-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-wrestler-title" onClick={cancelDelete}>
          <div className="import-modal" onClick={event => event.stopPropagation()}>
            <div className="import-modal-header">
              <h3 id="delete-wrestler-title">Delete {deleteTarget.first} {deleteTarget.last}?</h3>
            </div>
            <div className="import-modal-body">
              <p>
                This will permanently remove this wrestler and delete every bout from all existing or previous meets that include them.
              </p>
              {deleteError && <div className="error-msg">{deleteError}</div>}
            </div>
            <div className="import-modal-footer">
              <button className="btn btn-ghost" type="button" onClick={cancelDelete} disabled={isDeletingWrestler}>
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                onClick={confirmDeleteWrestler}
                disabled={isDeletingWrestler}
              >
                {isDeletingWrestler ? "Deleting..." : `Delete ${deleteTarget.first} ${deleteTarget.last}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
