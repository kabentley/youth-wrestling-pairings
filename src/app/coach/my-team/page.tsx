"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import * as XLSX from "xlsx";

import AppHeader from "@/components/AppHeader";
import ColorPicker from "@/components/ColorPicker";
import NumberInput from "@/components/NumberInput";
import { adjustTeamTextColor } from "@/lib/contrastText";
import { formatTeamName } from "@/lib/formatTeamName";
import { DEFAULT_MAT_RULES, type MatRule } from "@/lib/matRules";

const CONFIGURED_MATS = 8;
const MIN_MATS = 1;
const DEFAULT_NUM_MATS = 3;
const MAX_MATS = CONFIGURED_MATS;
const roundToTenth = (value: number) => Math.round(value * 10) / 10;

const createMatRule = (matIndex: number): MatRule => {
  const fallback: MatRule = {
    matIndex,
    color: null,
    minExperience: 0,
    maxExperience: 5,
    minAge: 0,
    maxAge: 20,
  };
  const safeIndex =
    DEFAULT_MAT_RULES.length === 0
      ? 0
      : Math.min(DEFAULT_MAT_RULES.length - 1, Math.max(0, matIndex - 1));
  const preset = DEFAULT_MAT_RULES[safeIndex] ?? fallback;
  return {
    matIndex,
    color: preset.color ?? fallback.color,
    minExperience: preset.minExperience,
    maxExperience: preset.maxExperience,
    minAge: preset.minAge,
    maxAge: preset.maxAge,
  };
};

const clampNumMats = (value: number) => Math.max(MIN_MATS, Math.min(MAX_MATS, value));

const padRulesToCount = (rules: MatRule[], count: number) => {
  const normalized = rules.slice(0, count).map((rule, idx) => ({
    ...rule,
    matIndex: idx + 1,
  }));
  if (normalized.length < count) {
    const additions = Array.from({ length: count - normalized.length }, (_, idx) =>
      createMatRule(normalized.length + idx + 1),
    );
    normalized.push(...additions);
  }
  return normalized;
};

type TeamMember = {
  id: string;
  username: string;
  email: string;
  phone?: string | null;
  name?: string | null;
  role: "PARENT" | "COACH" | "TABLE_WORKER";
  matNumber: number | null;
  wrestlerIds: string[];
};

type UserRole = "PARENT" | "COACH" | "TABLE_WORKER" | "ADMIN";
type TeamWrestler = { id: string; first: string; last: string };
type ParentImportRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  kids: string[];
};

type ParentImportCreatedRow = {
  rowNumber?: number;
  username?: string;
  name?: string | null;
  email?: string | null;
  temporaryPassword?: string | null;
};

type ParentImportSkippedRow = ParentImportCreatedRow & {
  phone?: string | null;
};

type ParentImportResult = {
  status: string;
  username?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  temporaryPassword?: string | null;
};

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const LAST_NAME_MATCH_THRESHOLD = 0.82;
const MIN_USERNAME_LEN = 6;
const MAX_USERNAME_LEN = 32;

const normalizeNameToken = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
const normalizeUsernameToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeImportKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeImportCellValue = (value: unknown) => (value == null ? "" : String(value).trim());
const splitImportKids = (value: string) =>
  value
    .split(/[;|\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
const csvEscape = (value: string) => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
};
const formatLastFirstName = (first?: string | null, last?: string | null) => {
  const firstName = (first ?? "").trim();
  const lastName = (last ?? "").trim();
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  return lastName || firstName;
};

const splitFullName = (fullName: string) => {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return {
      firstName: tokens[0] ?? "",
      lastName: "",
    };
  }
  return {
    firstName: tokens.slice(0, -1).join(" "),
    lastName: tokens[tokens.length - 1] ?? "",
  };
};

const downloadParentImportResults = (
  teamName: string,
  rows: ParentImportRow[],
  resultsByRow: Map<number, ParentImportResult>,
) => {
  const rawTeamSlug = teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const resolvedTeamSlug = rawTeamSlug.length > 0 ? rawTeamSlug : "team";
  const stamp = new Date().toISOString().slice(0, 10);
  const csvRows = [
    ["Parent Name", "Username", "Password", "Kids", "Note"],
    ...rows.map((row) => {
      const result = resultsByRow.get(row.rowNumber) ?? { status: "Created" };
      const isExisting = result.status === "Existing account";
      return [
        result.name?.trim() ?? `${row.firstName} ${row.lastName}`.trim(),
        result.username?.trim() ?? "",
        isExisting ? "" : result.temporaryPassword?.trim() ?? "",
        row.kids.join("; "),
        isExisting ? "Existing account" : "",
      ];
    }),
  ];
  const csvContent = csvRows
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resolvedTeamSlug}_parent_credentials_${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const buildGeneratedUsernameBase = (firstName: string, lastName: string) => {
  const first = normalizeUsernameToken(firstName);
  const last = normalizeUsernameToken(lastName);
  const initial = first.slice(0, 1);
  let base = `${initial}${last}`;
  if (!base) return "";
  if (base.length < MIN_USERNAME_LEN) {
    base = `${base}${"1".repeat(MIN_USERNAME_LEN - base.length)}`;
  }
  if (base.length > MAX_USERNAME_LEN) {
    base = base.slice(0, MAX_USERNAME_LEN);
  }
  return base;
};

const withUsernameSuffix = (base: string, suffix: number) => {
  if (suffix <= 0) return base;
  const suffixText = String(suffix);
  const maxBaseLen = Math.max(1, MAX_USERNAME_LEN - suffixText.length);
  return `${base.slice(0, maxBaseLen)}${suffixText}`;
};

const extractLastNameCandidates = (fullName?: string | null) => {
  if (!fullName) return [] as string[];
  const rawTokens = fullName
    .trim()
    .split(/\s+/)
    .map(normalizeNameToken)
    .filter(Boolean);
  if (rawTokens.length === 0) return [] as string[];
  const tokens = [...rawTokens];
  if (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  if (tokens.length === 0) return [] as string[];

  const last = tokens[tokens.length - 1];
  const candidates = [last];
  if (tokens.length >= 2) {
    candidates.push(`${tokens[tokens.length - 2]}${last}`);
  }
  return Array.from(new Set(candidates));
};

const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
};

const lastNameSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return 0.92;
  }
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const ratio = 1 - dist / maxLen;
  if (dist <= 1 && maxLen >= 5) return Math.max(ratio, 0.88);
  if (dist === 2 && maxLen >= 7) return Math.max(ratio, 0.8);
  return ratio;
};
const fuzzyTokenMatch = (queryToken: string, candidateToken: string) => {
  if (!queryToken || !candidateToken) return false;
  if (candidateToken.includes(queryToken)) return true;
  if (queryToken.length >= 4 && queryToken.includes(candidateToken)) return true;
  const similarity = lastNameSimilarity(queryToken, candidateToken);
  const threshold = queryToken.length <= 4 ? 0.74 : queryToken.length <= 7 ? 0.8 : 0.84;
  return similarity >= threshold;
};
const memberMatchesFuzzyQuery = (member: TeamMember, rawQuery: string) => {
  const query = normalizeUsernameToken(rawQuery);
  if (!query) return true;
  const queryTokens = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .map(normalizeUsernameToken)
    .filter(Boolean);
  const collapsed = normalizeUsernameToken(`${member.name ?? ""} ${member.username}`);
  if (collapsed.includes(query)) return true;

  const candidateTokens = new Set<string>();
  const usernameFull = normalizeUsernameToken(member.username);
  if (usernameFull) candidateTokens.add(usernameFull);
  for (const token of member.username.toLowerCase().split(/[^a-z0-9]+/)) {
    const normalized = normalizeUsernameToken(token);
    if (normalized) candidateTokens.add(normalized);
  }
  for (const token of (member.name ?? "").toLowerCase().split(/\s+/)) {
    const normalized = normalizeUsernameToken(token);
    if (normalized) candidateTokens.add(normalized);
  }

  const activeQueryTokens = queryTokens.length > 0 ? queryTokens : [query];
  return activeQueryTokens.every((queryToken) => {
    for (const candidate of candidateTokens) {
      if (fuzzyTokenMatch(queryToken, candidate)) return true;
    }
    return false;
  });
};

const headerLinks = [
  { href: "/", label: "Home" },
  { href: "/rosters", label: "Rosters" },
  { href: "/meets", label: "Meets", minRole: "COACH" as const },
  { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  { href: "/parent", label: "My Wrestlers" },
];

export default function CoachMyTeamPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("Team");
  const [teamSymbol, setTeamSymbol] = useState<string | null>(null);
  const [teamWebsite, setTeamWebsite] = useState("");
  const [teamLocation, setTeamLocation] = useState("");
  const [teamColor, setTeamColor] = useState("#000000");
  const [teamHasLogo, setTeamHasLogo] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [rules, setRules] = useState<MatRule[]>(() => padRulesToCount([], CONFIGURED_MATS));
  const [numMats, setNumMats] = useState(DEFAULT_NUM_MATS);
  const [homeTeamPreferSameMat, setHomeTeamPreferSameMat] = useState(true);
  const [defaultMaxMatchesPerWrestler, setDefaultMaxMatchesPerWrestler] = useState(5);
  const [defaultRestGap, setDefaultRestGap] = useState(4);
  const [printBoutSheetsInColor, setPrintBoutSheetsInColor] = useState(false);
  const [maxMatchesInput, setMaxMatchesInput] = useState("5");
  const [restGapInput, setRestGapInput] = useState("4");
  const [parents, setParents] = useState<TeamMember[]>([]);
  const [staff, setStaff] = useState<TeamMember[]>([]);
  const [teamWrestlers, setTeamWrestlers] = useState<TeamWrestler[]>([]);
  const [headCoachId, setHeadCoachId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);
  const [savingMat, setSavingMat] = useState(false);
  const [savingParent, setSavingParent] = useState<Record<string, boolean>>({});
  const [savingAssignments, setSavingAssignments] = useState<Record<string, boolean>>({});
  const [deletingMember, setDeletingMember] = useState<Record<string, boolean>>({});
  const [logoLoading, setLogoLoading] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string; symbol?: string | null }[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [initialInfo, setInitialInfo] = useState({ website: "", location: "" });
  const [infoDirty, setInfoDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageStatus, setMessageStatus] = useState<"success" | "error" | null>(null);
  const [meetDefaultsMessage, setMeetDefaultsMessage] = useState<string | null>(null);
  const [meetDefaultsStatus, setMeetDefaultsStatus] = useState<"success" | "error" | null>(null);
  const [rolesMessage, setRolesMessage] = useState<string | null>(null);
  const [rolesMessageStatus, setRolesMessageStatus] = useState<"success" | "error" | null>(null);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [rolesFilter, setRolesFilter] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"COACH" | "TABLE_WORKER" | "PARENT">("PARENT");
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [importUsersModalOpen, setImportUsersModalOpen] = useState(false);
  const [missingParentsModalOpen, setMissingParentsModalOpen] = useState(false);
  const [editUserModalMember, setEditUserModalMember] = useState<TeamMember | null>(null);
  const [deleteUserModalMember, setDeleteUserModalMember] = useState<TeamMember | null>(null);
  const [newUserUsernameEdited, setNewUserUsernameEdited] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [importingUsers, setImportingUsers] = useState(false);
  const [importUsersFile, setImportUsersFile] = useState<File | null>(null);
  const [importUsersRows, setImportUsersRows] = useState<ParentImportRow[]>([]);
  const [importUsersPreviewRows, setImportUsersPreviewRows] = useState<ParentImportRow[]>([]);
  const [importUsersPassword, setImportUsersPassword] = useState("");
  const [importUsersMessage, setImportUsersMessage] = useState<string | null>(null);
  const [importUsersMessageStatus, setImportUsersMessageStatus] = useState<"success" | "error" | null>(null);
  const [importUsersRowErrors, setImportUsersRowErrors] = useState<string[]>([]);
  const [savingMeetDefaults, setSavingMeetDefaults] = useState(false);
  const [savingEditedUser, setSavingEditedUser] = useState(false);
  const [resettingEditedUserPassword, setResettingEditedUserPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "mat" | "meet" | "parents">("parents");
  const [wrestlerPickerMemberId, setWrestlerPickerMemberId] = useState<string | null>(null);
  const [wrestlerPickerSelection, setWrestlerPickerSelection] = useState<string[]>([]);
  const [matListboxMemberId, setMatListboxMemberId] = useState<string | null>(null);
  const [matListboxDirection, setMatListboxDirection] = useState<"down" | "up">("down");
  const [matListboxPosition, setMatListboxPosition] = useState({ top: 0, left: 0, width: 112 });
  const [editUserFirstName, setEditUserFirstName] = useState("");
  const [editUserLastName, setEditUserLastName] = useState("");
  const [editUserUsername, setEditUserUsername] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserPhone, setEditUserPhone] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const tabs = [
    { key: "parents", label: "Parents" },
    { key: "mat", label: "Mat Setup" },
    { key: "meet", label: "Meet Setup" },
    { key: "info", label: "Team Info" },
  ] as const;

  const sortStaff = (members: TeamMember[], headId: string | null) =>
    [...members].sort((a, b) => {
      const rank = (member: TeamMember) => {
        if (member.role === "COACH") {
          return member.id === headId ? 0 : 1;
        }
        return 2;
      };
      const orderA = rank(a);
      const orderB = rank(b);
      if (orderA !== orderB) return orderA - orderB;
      return a.username.localeCompare(b.username);
    });

  useEffect(() => {
    void load();
  }, []);


  const load = async () => {
    try {
      const meRes = await fetch("/api/me");
      if (!meRes.ok) {
        console.warn("Sign in required.");
        return;
      }
      const profile = await meRes.json();
      setCurrentUserId(typeof profile.id === "string" ? profile.id : null);
      setRole(profile.role ?? null);
      setTeamSymbol(profile.team?.symbol ?? null);
      setMyTeamId(profile.teamId ?? null);
      if (!profile.teamId && profile.role !== "ADMIN") {
        console.warn("You must be assigned to a team to use this page.");
        return;
      }
      if (profile.teamId) {
        setTeamId(profile.teamId);
        setTeamName(profile.team?.name ?? "Team");
      }

      const teamsRes = await fetch("/api/teams");
      if (teamsRes.ok) {
        const teamsList = await teamsRes.json();
        setTeams(teamsList);
        if (!profile.teamId && teamsList.length > 0) {
          setTeamId(teamsList[0].id);
        }
      }
    } catch {
      console.error("Unable to load team settings.");
    }
  };

  const orderedTeams = (() => {
    if (!myTeamId) return teams;
    const mine = teams.find(t => t.id === myTeamId);
    if (!mine) return teams;
    return [mine, ...teams.filter(t => t.id !== myTeamId)];
  })();

  const snapshotRef = useRef("");
  const meetDefaultsSnapshotRef = useRef("");
  const usernameSuggestReqRef = useRef(0);
  const [matDirty, setMatDirty] = useState(false);

  const buildMeetDefaultsSnapshot = (
    maxMatches: number,
    restGap: number,
    preferSameMat: boolean,
    printInColor: boolean,
  ) => JSON.stringify({
    defaultMaxMatchesPerWrestler: maxMatches,
    defaultRestGap: restGap,
    homeTeamPreferSameMat: preferSameMat,
    printBoutSheetsInColor: printInColor,
  });

  const buildSnapshot = (incomingRules: MatRule[], mats: number) => {
    const normalized = padRulesToCount(incomingRules, CONFIGURED_MATS);
    return JSON.stringify({
      numMats: mats,
      rules: normalized.map(rule => ({
        color: rule.color,
        minExperience: rule.minExperience,
        maxExperience: rule.maxExperience,
        minAge: rule.minAge,
        maxAge: rule.maxAge,
      })),
    });
  };

  const updateSnapshot = (incomingRules: MatRule[], mats: number) => {
    snapshotRef.current = buildSnapshot(incomingRules, mats);
    setMatDirty(false);
  };

  useEffect(() => {
    const normalized = padRulesToCount(rules, CONFIGURED_MATS);
    const nextSnapshot = buildSnapshot(normalized, numMats);
    setMatDirty(nextSnapshot !== snapshotRef.current);
  }, [rules, numMats]);

  useEffect(() => {
    setMaxMatchesInput(String(defaultMaxMatchesPerWrestler));
  }, [defaultMaxMatchesPerWrestler]);
  useEffect(() => {
    setRestGapInput(String(defaultRestGap));
  }, [defaultRestGap]);

  useEffect(() => {
    if (!wrestlerPickerMemberId && !matListboxMemberId && !createUserModalOpen && !importUsersModalOpen && !missingParentsModalOpen && !editUserModalMember && !deleteUserModalMember) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeWrestlerPicker();
        setMatListboxMemberId(null);
        setCreateUserModalOpen(false);
        closeImportUsersModal(true);
        setMissingParentsModalOpen(false);
        setEditUserModalMember(null);
        setDeleteUserModalMember(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wrestlerPickerMemberId, matListboxMemberId, createUserModalOpen, importUsersModalOpen, missingParentsModalOpen, editUserModalMember, deleteUserModalMember]);

  useEffect(() => {
    if (!matListboxMemberId) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".coach-mat-picker-cell")) return;
      setMatListboxMemberId(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [matListboxMemberId]);

  useEffect(() => {
    if (!matListboxMemberId) return;
    const close = () => setMatListboxMemberId(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [matListboxMemberId]);


  const loadMatRules = async (id: string) => {
    const res = await fetch(`/api/teams/${id}/mat-rules`);
    if (!res.ok) return;
    const payload = await res.json().catch(() => null);
    const source = (payload?.rules ?? []) as MatRule[];
    const parsedRules: MatRule[] = source.map((rule, index) => ({
      matIndex: index + 1,
      color: rule.color ?? null,
      minExperience: Number(rule.minExperience),
      maxExperience: Number(rule.maxExperience),
      minAge: Number(rule.minAge),
      maxAge: Number(rule.maxAge),
    }));
    const rawNum = payload?.numMats;
    const candidateCount =
      typeof rawNum === "number" && Number.isFinite(rawNum) ? rawNum : parsedRules.length;
    const desiredNumMats = clampNumMats(Math.max(candidateCount, parsedRules.length, DEFAULT_NUM_MATS));
    const normalized = padRulesToCount(parsedRules, CONFIGURED_MATS);
    setNumMats(desiredNumMats);
    setRules(normalized);
    setHomeTeamPreferSameMat(Boolean(payload?.homeTeamPreferSameMat));
    updateSnapshot(normalized, desiredNumMats);
  };

  const loadTeamRoles = async (id: string) => {
    setRolesLoading(true);
    setRolesLoaded(false);
    try {
      const query = role === "ADMIN" ? `?teamId=${encodeURIComponent(id)}` : "";
      const res = await fetch(`/api/coach/parents${query}`);
      if (!res.ok) {
        setParents([]);
        setStaff([]);
        setTeamWrestlers([]);
        setHeadCoachId(null);
        return;
      }
      const payload = await res.json().catch(() => null);
      const resolvedHead = payload?.team?.headCoachId ?? null;
      setSavingAssignments({});
      const normalizeMember = (
        item: Partial<TeamMember> & {
          id: string;
          username: string;
        },
        nextRole: TeamMember["role"],
      ): TeamMember => ({
        id: item.id,
        username: item.username,
        email: item.email ?? "",
        name: item.name ?? null,
        phone: item.phone ?? null,
        role: nextRole,
        matNumber: typeof item.matNumber === "number" ? item.matNumber : null,
        wrestlerIds: Array.isArray(item.wrestlerIds)
          ? item.wrestlerIds.filter((value): value is string => typeof value === "string")
          : [],
      });
      setHeadCoachId(resolvedHead);
      setParents((payload?.parents ?? []).map((item: { id: string; username: string }) => normalizeMember(item, "PARENT")));
      setStaff(sortStaff(
        [
          ...(payload?.coaches ?? []).map((item: { id: string; username: string }) => normalizeMember(item, "COACH")),
          ...(payload?.tableWorkers ?? []).map((item: { id: string; username: string }) => normalizeMember(item, "TABLE_WORKER")),
        ],
        resolvedHead,
      ));
      setTeamWrestlers(
        Array.isArray(payload?.teamWrestlers)
          ? payload.teamWrestlers
            .filter((item: Partial<TeamWrestler>) => Boolean(item.id && item.first && item.last))
            .map((item: TeamWrestler) => ({ id: item.id, first: item.first, last: item.last }))
          : [],
      );
      setRolesMessage(null);
      setRolesMessageStatus(null);
    } finally {
      setRolesLoading(false);
      setRolesLoaded(true);
    }
  };

  const loadTeamDetails = async (id: string) => {
    const res = await fetch(`/api/teams/${id}`);
    if (!res.ok) return;
    const team = await res.json().catch(() => null);
    if (!team) return;
    setTeamName(team.name ?? "Team");
    setTeamSymbol(team.symbol ?? null);
    setTeamColor(team.color ?? "#000000");
    const websiteVal = team.website ?? "";
    const locationVal = team.address ?? "";
    setTeamWebsite(websiteVal);
    setTeamLocation(locationVal);
    const preferSameMat = Boolean(team.homeTeamPreferSameMat);
    setHomeTeamPreferSameMat(preferSameMat);
    const maxMatches = typeof team.defaultMaxMatchesPerWrestler === "number" ? team.defaultMaxMatchesPerWrestler : 5;
    const restGap = typeof team.defaultRestGap === "number" ? team.defaultRestGap : 4;
    const printInColor = typeof team.printBoutSheetsInColor === "boolean" ? team.printBoutSheetsInColor : false;
    setDefaultMaxMatchesPerWrestler(maxMatches);
    setDefaultRestGap(restGap);
    setPrintBoutSheetsInColor(printInColor);
    setTeamHasLogo(Boolean(team.hasLogo));
    setInitialInfo({ website: websiteVal, location: locationVal });
    setInfoDirty(false);
    meetDefaultsSnapshotRef.current = buildMeetDefaultsSnapshot(
      maxMatches,
      restGap,
      preferSameMat,
      printInColor,
    );
  };

  const teamSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateTeamRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const scheduleTeamSave = () => {
    if (teamSaveTimer.current) {
      clearTimeout(teamSaveTimer.current);
    }
    teamSaveTimer.current = setTimeout(() => {
      void updateTeamRef.current();
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (teamSaveTimer.current) {
        clearTimeout(teamSaveTimer.current);
      }
    };
  }, []);

  const handleTeamWebsiteChange = (value: string) => {
    if (!canEditTeamSettings) return;
    setTeamWebsite(value);
    setInfoDirty(true);
    setMessage(null);
    setMessageStatus(null);
  };

  const handleTeamLocationChange = (value: string) => {
    if (!canEditTeamSettings) return;
    setTeamLocation(value);
    setInfoDirty(true);
    setMessage(null);
    setMessageStatus(null);
  };

  const handleTeamColorChange = (value: string) => {
    if (!canEditTeamSettings) return;
    setTeamColor(value);
    scheduleTeamSave();
    setMessage(null);
    setMessageStatus(null);
  };

  useEffect(() => {
    if (!teamId) return;
    void loadTeamDetails(teamId);
    void loadMatRules(teamId);
    if (role === "COACH" || role === "ADMIN") {
      void loadTeamRoles(teamId);
      return;
    }
    setRolesLoaded(true);
  }, [teamId, role]);

  const updateTeam = async () => {
    if (!teamId || !canEditTeamSettings) return;
    setSavingTeam(true);
    setInfoDirty(false);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          color: teamColor,
          website: teamWebsite,
          address: teamLocation,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = err?.error ?? err?.message ?? "Unable to save team settings.";
        console.error(detail);
        setMessage(detail);
        setMessageStatus("error");
      } else {
        setInitialInfo({ website: teamWebsite, location: teamLocation });
        setInfoDirty(false);
        setMessage("Team info saved.");
        setMessageStatus("success");
      }
    } catch (error) {
        console.error("Team settings save failed", error);
        setMessage("Unable to save team settings.");
        setMessageStatus("error");
    } finally {
      setSavingTeam(false);
    }
  };

  useEffect(() => {
    updateTeamRef.current = updateTeam;
  }, [updateTeam]);

  const handleFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void updateTeam();
      event.currentTarget.blur();
    }
  };

  const cancelTeamInfoEdits = () => {
    setTeamWebsite(initialInfo.website);
    setTeamLocation(initialInfo.location);
    setInfoDirty(false);
    setMessage(null);
    setMessageStatus(null);
  };

  const meetDefaultsSnapshot = meetDefaultsSnapshotRef.current;
  const currentMeetDefaultsSnapshot = buildMeetDefaultsSnapshot(
    defaultMaxMatchesPerWrestler,
    defaultRestGap,
    homeTeamPreferSameMat,
    printBoutSheetsInColor,
  );
  const meetDefaultsDirty = Boolean(meetDefaultsSnapshot) && meetDefaultsSnapshot !== currentMeetDefaultsSnapshot;
  const messageIsError = messageStatus === "error";
  const meetDefaultsIsError = meetDefaultsStatus === "error";
  const canSaveTeamInfo = infoDirty && !savingTeam;
  const canSaveMeetDefaults = meetDefaultsDirty && !savingMeetDefaults;
  const sanitizedTeamColor = teamColor.trim();

  const uploadLogo = async (file: File | null) => {
    if (!file || !teamId || !canEditTeamSettings) return;
    setLogoLoading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/teams/${teamId}/logo`, { method: "POST", body: form });
    if (res.ok) {
      setLogoVersion((v) => v + 1);
      setTeamHasLogo(true);
      console.info("Logo uploaded.");
    } else {
      console.error("Unable to upload logo.");
    }
    setLogoLoading(false);
  };

  const handleMatSave = async () => {
    if (!teamId || !canEditTeamSettings) return;
    setSavingMat(true);
    const normalizedRules = padRulesToCount(rules, CONFIGURED_MATS);
    setRules(normalizedRules);
    const payload = {
      homeTeamPreferSameMat,
      numMats,
      rules: normalizedRules.map(rule => {
        const trimmedColor = rule.color?.trim();
        return {
          matIndex: rule.matIndex,
          color: trimmedColor && trimmedColor.length > 0 ? trimmedColor : null,
          minExperience: rule.minExperience,
          maxExperience: rule.maxExperience,
          minAge: rule.minAge,
          maxAge: rule.maxAge,
        };
      }),
    };
    const res = await fetch(`/api/teams/${teamId}/mat-rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      console.error(err?.error ?? "Unable to save mat rules.");
    } else {
      console.info("Mat setup saved.");
      updateSnapshot(normalizedRules, numMats);
    }
    setSavingMat(false);
  };

  const saveMeetDefaults = async () => {
    if (!teamId || !canEditTeamSettings) return;
    setSavingMeetDefaults(true);
    setMeetDefaultsMessage(null);
    setMeetDefaultsStatus(null);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeamPreferSameMat,
          defaultMaxMatchesPerWrestler,
          defaultRestGap,
          printBoutSheetsInColor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setMeetDefaultsMessage(err?.error ?? "Unable to save meet setup.");
        setMeetDefaultsStatus("error");
        return;
      }
      const team = await res.json().catch(() => null);
      const maxMatches = typeof team?.defaultMaxMatchesPerWrestler === "number" ? team.defaultMaxMatchesPerWrestler : defaultMaxMatchesPerWrestler;
      const restGap = typeof team?.defaultRestGap === "number" ? team.defaultRestGap : defaultRestGap;
      const preferSameMat = typeof team?.homeTeamPreferSameMat === "boolean" ? team.homeTeamPreferSameMat : homeTeamPreferSameMat;
      const printInColor = typeof team?.printBoutSheetsInColor === "boolean" ? team.printBoutSheetsInColor : printBoutSheetsInColor;
      setDefaultMaxMatchesPerWrestler(maxMatches);
      setDefaultRestGap(restGap);
      setHomeTeamPreferSameMat(preferSameMat);
      setPrintBoutSheetsInColor(printInColor);
      meetDefaultsSnapshotRef.current = buildMeetDefaultsSnapshot(
        maxMatches,
        restGap,
        preferSameMat,
        printInColor,
      );
      setMeetDefaultsMessage("Meet setup saved.");
      setMeetDefaultsStatus("success");
    } catch (error) {
      console.error("Meet setup save failed", error);
      setMeetDefaultsMessage("Unable to save meet setup.");
      setMeetDefaultsStatus("error");
    } finally {
      setSavingMeetDefaults(false);
    }
  };

  const updateRule = (idx: number, field: keyof MatRule, value: number | string | null) => {
    if (!canEditTeamSettings) return;
    setRules(prev =>
      prev.map((rule, index) =>
        index !== idx
          ? rule
      : {
          ...rule,
          [field]: typeof value === "number" ? value : value ?? null,
        },
      ),
    );
  };

  const adjustMatCount = (value: number) => {
    if (!canEditTeamSettings) return;
    const desired = clampNumMats(Math.round(value));
    setNumMats(desired);
    setRules(prev => padRulesToCount(prev, CONFIGURED_MATS));
  };

  const getLikelyWrestlerIds = (member: TeamMember) => {
    const candidates = extractLastNameCandidates(member.name);
    if (candidates.length === 0) return [] as string[];
    return teamWrestlers
      .filter((wrestler) => {
        const wrestlerLast = normalizeNameToken(wrestler.last);
        if (!wrestlerLast) return false;
        const score = candidates.reduce((best, candidate) => {
          const next = lastNameSimilarity(candidate, wrestlerLast);
          return next > best ? next : best;
        }, 0);
        return score >= LAST_NAME_MATCH_THRESHOLD;
      })
      .map((wrestler) => wrestler.id);
  };

  const updateStaffMember = (memberId: string, updater: (member: TeamMember) => TeamMember) => {
    setStaff((prev) =>
      sortStaff(
        prev.map((member) => (member.id === memberId ? updater(member) : member)),
        headCoachId,
      ),
    );
  };

  const openMatPicker = (member: TeamMember, anchor?: HTMLElement) => {
    setMatListboxMemberId((current) => {
      const nextId = current === member.id ? null : member.id;
      if (!nextId) return null;
      if (anchor) {
        const viewportPadding = 8;
        const popupHeight = 240;
        const rect = anchor.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
        const spaceAbove = rect.top;
        const nextDirection = spaceBelow < popupHeight && spaceAbove > spaceBelow ? "up" : "down";
        setMatListboxDirection(nextDirection);
        let left = rect.left;
        const width = Math.max(102, Math.ceil(rect.width));
        if (left + width > window.innerWidth - viewportPadding) {
          left = Math.max(viewportPadding, window.innerWidth - viewportPadding - width);
        }
        const anchorTop = nextDirection === "up" ? rect.top - 4 : rect.bottom + 4;
        setMatListboxPosition({
          top: Math.max(viewportPadding, Math.round(anchorTop)),
          left: Math.max(viewportPadding, Math.round(left)),
          width,
        });
      } else {
        setMatListboxDirection("down");
        setMatListboxPosition({ top: 0, left: 0, width: 112 });
      }
      return nextId;
    });
  };

  const closeMatPicker = () => {
    setMatListboxMemberId(null);
  };

  const assignMatToMember = (memberId: string, matNumber: number | null) => {
    const member = staff.find((item) => item.id === memberId);
    if (!member) {
      closeMatPicker();
      return;
    }
    void saveStaffAssignments(memberId, matNumber, member.wrestlerIds);
    closeMatPicker();
  };

  const getMatColor = (matNumber: number) => {
    const matchedRule = rules.find((rule) => rule.matIndex === matNumber) ?? rules[matNumber - 1];
    const trimmedColor = matchedRule.color?.trim();
    return trimmedColor && trimmedColor.length > 0 ? trimmedColor : "#ffffff";
  };

  const openWrestlerPicker = (member: TeamMember) => {
    setWrestlerPickerMemberId(member.id);
    const suggested = member.wrestlerIds.length > 0 ? member.wrestlerIds : getLikelyWrestlerIds(member);
    setWrestlerPickerSelection([...suggested]);
  };

  const closeWrestlerPicker = () => {
    setWrestlerPickerMemberId(null);
    setWrestlerPickerSelection([]);
  };

  const closeCreateUserModal = () => {
    if (creatingUser) return;
    usernameSuggestReqRef.current += 1;
    setNewUserRole("PARENT");
    setCreateUserModalOpen(false);
  };

  const closeImportUsersModal = (force = false) => {
    if (importingUsers && !force) return;
    setImportUsersModalOpen(false);
    setImportUsersFile(null);
    setImportUsersRows([]);
    setImportUsersPreviewRows([]);
    setImportUsersPassword("");
    setImportUsersMessage(null);
    setImportUsersMessageStatus(null);
    setImportUsersRowErrors([]);
  };

  const openEditUserModal = (member: TeamMember) => {
    const split = splitFullName(member.name ?? "");
    setEditUserFirstName(split.firstName);
    setEditUserLastName(split.lastName);
    setEditUserUsername(member.username);
    setEditUserEmail(member.email);
    setEditUserPhone(member.phone ?? "");
    setEditUserPassword("");
    setEditUserModalMember(member);
  };

  const closeEditUserModal = () => {
    if (savingEditedUser) return;
    setEditUserModalMember(null);
    setEditUserFirstName("");
    setEditUserLastName("");
    setEditUserUsername("");
    setEditUserEmail("");
    setEditUserPhone("");
    setEditUserPassword("");
  };

  const isUsernameAvailable = async (candidate: string) => {
    const res = await fetch(`/api/auth/signup?username=${encodeURIComponent(candidate)}`, {
      method: "GET",
    });
    if (!res.ok) return false;
    const payload = await res.json().catch(() => null);
    return payload?.available === true;
  };

  const suggestUsernameForName = async (firstName: string, lastName: string) => {
    const base = buildGeneratedUsernameBase(firstName, lastName);
    if (!base) {
      setNewUserUsername("");
      return;
    }
    const reqId = ++usernameSuggestReqRef.current;
    for (let suffix = 0; suffix <= 200; suffix += 1) {
      const candidate = withUsernameSuffix(base, suffix);
      const available = await isUsernameAvailable(candidate);
      if (reqId !== usernameSuggestReqRef.current) return;
      if (available) {
        setNewUserUsername(candidate);
        return;
      }
    }
    setNewUserUsername(withUsernameSuffix(base, Date.now() % 1000));
  };

  const handleNewUserFirstNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewUserFirstName(event.target.value);
  };

  const handleNewUserLastNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewUserLastName(event.target.value);
  };

  const handleNewUserUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    usernameSuggestReqRef.current += 1;
    setNewUserUsername(event.target.value);
    setNewUserUsernameEdited(true);
  };

  useEffect(() => {
    if (!createUserModalOpen) return;
    if (newUserUsernameEdited) return;
    const firstName = newUserFirstName.trim();
    const lastName = newUserLastName.trim();
    if (!firstName || !lastName) {
      setNewUserUsername("");
      return;
    }
    const timer = setTimeout(() => {
      void suggestUsernameForName(firstName, lastName);
    }, 160);
    return () => clearTimeout(timer);
  }, [createUserModalOpen, newUserFirstName, newUserLastName, newUserUsernameEdited]);

  const buildTempPassword = () => {
    const digits = "0123456789";
    let next = "";
    for (let i = 0; i < 6; i += 1) {
      next += digits[Math.floor(Math.random() * digits.length)];
    }
    return next;
  };

  const generateTempPassword = () => {
    setNewUserPassword(buildTempPassword());
  };

  const generateEditUserPassword = () => {
    setEditUserPassword(buildTempPassword());
  };

  const parseParentImportFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return rawRows
      .map((row, index) => {
        const normalizedMap = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
          acc[normalizeImportKey(key)] = normalizeImportCellValue(value);
          return acc;
        }, {});
        const get = (...keys: string[]) => {
          for (const key of keys) {
            const direct = normalizeImportCellValue(row[key]);
            if (direct) return direct;
            const normalized = normalizedMap[normalizeImportKey(key)];
            if (normalized) return normalized;
          }
          return "";
        };

        let firstName = get("first", "first name", "firstname", "parent first", "guardian first");
        let lastName = get("last", "last name", "lastname", "parent last", "guardian last");
        if (!firstName || !lastName) {
          const fullName = get("name", "full name", "parent name", "guardian name");
          if (fullName) {
            const split = splitFullName(fullName);
            firstName ||= split.firstName;
            lastName ||= split.lastName;
          }
        }
        const email = get("email", "e-mail", "mail");
        const phone = get("phone", "mobile", "cell", "cell phone", "cellphone");
        const kids = new Set<string>();
        const combinedKids = get("kids", "kid names", "kid name", "children", "child names", "wrestlers", "wrestler names");
        splitImportKids(combinedKids).forEach((kid) => kids.add(kid));
        for (const [rawKey, rawValue] of Object.entries(row)) {
          if (!rawValue) continue;
          const normalizedKey = normalizeImportKey(rawKey);
          if (/^(kid|child|wrestler)\d+$/.test(normalizedKey)) {
            const normalizedValue = normalizeImportCellValue(rawValue);
            if (normalizedValue) {
              kids.add(normalizedValue);
            }
          }
        }

        if (![firstName, lastName, email, phone, ...kids].some(Boolean)) {
          return null;
        }

        return {
          rowNumber: index + 2,
          firstName,
          lastName,
          email,
          phone,
          kids: [...kids],
        } satisfies ParentImportRow;
      })
      .filter((row): row is ParentImportRow => Boolean(row));
  };

  const chooseImportUsersFile = async (file: File | null) => {
    setImportUsersFile(file);
    setImportUsersRows([]);
    setImportUsersPreviewRows([]);
    setImportUsersMessage(null);
    setImportUsersMessageStatus(null);
    setImportUsersRowErrors([]);
    if (!file) {
      return;
    }
    try {
      const parsedRows = await parseParentImportFile(file);
      if (parsedRows.length === 0) {
        setImportUsersMessage("No parent rows were found in that file.");
        setImportUsersMessageStatus("error");
        return;
      }
      setImportUsersRows(parsedRows);
      setImportUsersPreviewRows(parsedRows.slice(0, 8));
      setImportUsersMessage(`Loaded ${parsedRows.length} row${parsedRows.length === 1 ? "" : "s"} from ${file.name}.`);
      setImportUsersMessageStatus("success");
    } catch (error) {
      console.error("Unable to parse parent import file", error);
      setImportUsersMessage("Unable to read that file. Use CSV, XLS, or XLSX.");
      setImportUsersMessageStatus("error");
    }
  };

  const toggleWrestlerInPicker = (wrestlerId: string) => {
    setWrestlerPickerSelection((prev) => {
      if (prev.includes(wrestlerId)) {
        return prev.filter((id) => id !== wrestlerId);
      }
      return [...prev, wrestlerId];
    });
  };

  const applyWrestlerPicker = () => {
    if (!wrestlerPickerMemberId) return;
    const uniqueIds = Array.from(new Set(wrestlerPickerSelection));
    const member =
      staff.find((item) => item.id === wrestlerPickerMemberId)
      ?? parents.find((item) => item.id === wrestlerPickerMemberId);
    if (!member) {
      closeWrestlerPicker();
      return;
    }
    void saveStaffAssignments(member.id, member.matNumber, uniqueIds);
    closeWrestlerPicker();
  };

  const saveStaffAssignments = async (
    memberId: string,
    matNumber: number | null,
    wrestlerIds: string[],
  ) => {
    if (!teamId) return false;
    setSavingAssignments((prev) => ({ ...prev, [memberId]: true }));
    setRolesMessage(null);
    setRolesMessageStatus(null);
    const query = role === "ADMIN" ? `?teamId=${encodeURIComponent(teamId)}` : "";
    try {
      const res = await fetch(`/api/coach/parents/${memberId}/assignments${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matNumber,
          wrestlerIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setRolesMessage(err?.error ?? "Unable to save staff assignments.");
        setRolesMessageStatus("error");
        return false;
      }
      const payload = await res.json().catch(() => null);
      const updated = payload?.updated;
      if (!updated) {
        setRolesMessage("Unable to save staff assignments.");
        setRolesMessageStatus("error");
        return false;
      }
      const nextMat = typeof updated.matNumber === "number" ? updated.matNumber : null;
      const nextIds = Array.isArray(updated.wrestlerIds)
        ? updated.wrestlerIds.filter((value: unknown): value is string => typeof value === "string")
        : [];
      if (staff.some((member) => member.id === memberId)) {
        updateStaffMember(memberId, (current) => ({
          ...current,
          matNumber: nextMat,
          wrestlerIds: nextIds,
        }));
      } else {
        setParents((prev) =>
          prev.map((member) => (
            member.id === memberId
              ? { ...member, matNumber: nextMat, wrestlerIds: nextIds }
              : member
          )),
        );
      }
      return true;
    } catch (error) {
      console.error("Staff assignment save failed", error);
      setRolesMessage("Unable to save staff assignments.");
      setRolesMessageStatus("error");
      return false;
    } finally {
      setSavingAssignments((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    }
  };

  const updateRole = async (member: TeamMember, nextRole: TeamMember["role"]) => {
    if (!canEditRoles) {
      setRolesMessage("Only the head coach or an admin can change team roles.");
      setRolesMessageStatus("error");
      return;
    }
    if (!teamId || member.role === nextRole) return;
    setSavingParent((prev) => ({ ...prev, [member.id]: true }));
    setRolesMessage(null);
    setRolesMessageStatus(null);
    const query = role === "ADMIN" ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(`/api/coach/parents/${member.id}/role${query}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    setSavingParent((prev) => {
      const next = { ...prev };
      delete next[member.id];
      return next;
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setRolesMessage(err?.error ?? "Unable to update role.");
      setRolesMessageStatus("error");
      console.error(err?.error ?? "Unable to update role.");
      return;
    }
    const payload = await res.json().catch(() => null);
    const updated = payload?.updated;
    if (!updated) return;
    const existing = [...parents, ...staff].find((item) => item.id === member.id);
    const normalized: TeamMember = {
      id: updated.id,
      username: updated.username,
      email: updated.email ?? "",
      name: updated.name ?? null,
      phone: updated.phone ?? null,
      role: updated.role,
      matNumber: existing?.matNumber ?? null,
      wrestlerIds: existing?.wrestlerIds ?? [],
    };
    setHeadCoachId((prev) => {
      if (normalized.role !== "COACH" || !normalized.id) return prev;
      return prev ?? normalized.id;
    });
    setParents((prev) => {
      const filtered = prev.filter(p => p.id !== normalized.id);
      return normalized.role === "PARENT" ? [...filtered, normalized] : filtered;
    });
    setStaff((prev) => {
      const filtered = prev.filter(s => s.id !== normalized.id);
      return sortStaff(normalized.role === "PARENT" ? filtered : [...filtered, normalized], headCoachId);
    });
    if (normalized.role === "PARENT") {
      setSavingAssignments((prev) => {
        const next = { ...prev };
        delete next[normalized.id];
        return next;
      });
    }
  };

  const createTeamUser = async () => {
    if (!canEditRoles) {
      setRolesMessage("Only the head coach or an admin can add team users.");
      setRolesMessageStatus("error");
      return;
    }
    if (!teamId) return;
    setCreatingUser(true);
    setRolesMessage(null);
    setRolesMessageStatus(null);
    const query = role === "ADMIN" ? `?teamId=${encodeURIComponent(teamId)}` : "";
    try {
      const res = await fetch(`/api/coach/parents${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: newUserFirstName,
          lastName: newUserLastName,
          username: newUserUsername,
          email: newUserEmail,
          phone: newUserPhone,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = typeof data?.error === "string"
          ? data.error
          : "Unable to create team user.";
        setRolesMessage(detail);
        setRolesMessageStatus("error");
        return;
      }
      setNewUserFirstName("");
      setNewUserLastName("");
      setNewUserUsername("");
      setNewUserUsernameEdited(false);
      setNewUserEmail("");
      setNewUserPhone("");
      setNewUserRole("PARENT");
      const created = data?.created;
      if (created && typeof created.id === "string") {
        const createdMember: TeamMember = {
          id: created.id,
          username: typeof created.username === "string" ? created.username : newUserUsername.trim().toLowerCase(),
          email: typeof created.email === "string" ? created.email : "",
          phone: typeof created.phone === "string" ? created.phone : null,
          name: typeof created.name === "string" ? created.name : `${newUserFirstName.trim()} ${newUserLastName.trim()}`,
          role: created.role === "COACH" || created.role === "TABLE_WORKER" || created.role === "PARENT"
            ? created.role
            : newUserRole,
          matNumber: typeof created.matNumber === "number" ? created.matNumber : null,
          wrestlerIds: [],
        };
        const likelyWrestlerIds = getLikelyWrestlerIds(createdMember);
        if (likelyWrestlerIds.length > 0) {
          await saveStaffAssignments(
            createdMember.id,
            createdMember.matNumber,
            likelyWrestlerIds,
          );
        }
      }
      await loadTeamRoles(teamId);
      setRolesMessage("Team user created. Password reset required at first sign-in.");
      setRolesMessageStatus("success");
    } catch (error) {
      console.error("Create team user failed", error);
      setRolesMessage("Unable to create team user.");
      setRolesMessageStatus("error");
    } finally {
      setCreatingUser(false);
    }
  };

  const importParentUsers = async () => {
    if (!canEditRoles) {
      setImportUsersMessage("Only the head coach or an admin can import parent accounts.");
      setImportUsersMessageStatus("error");
      return;
    }
    if (!teamId) return;
    if (importUsersRows.length === 0) {
      setImportUsersMessage("Choose a CSV, XLS, or XLSX file first.");
      setImportUsersMessageStatus("error");
      return;
    }
    setImportingUsers(true);
    setImportUsersMessage(null);
    setImportUsersMessageStatus(null);
    setImportUsersRowErrors([]);

    const query = role === "ADMIN" ? `?teamId=${encodeURIComponent(teamId)}` : "";
    try {
      const importedRows = [...importUsersRows];
      const sharedPassword = importUsersPassword.trim();
      const res = await fetch(`/api/coach/parents/import${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: sharedPassword,
          rows: importedRows,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const rowErrors = Array.isArray(data?.rowErrors)
          ? data.rowErrors.filter((value: unknown): value is string => typeof value === "string")
          : [];
        setImportUsersRowErrors(rowErrors);
        setImportUsersMessage(
          typeof data?.error === "string"
            ? data.error
            : "Unable to import parent accounts.",
        );
        setImportUsersMessageStatus("error");
        return;
      }

      await loadTeamRoles(teamId);
      const createdCount = typeof data?.createdCount === "number" ? data.createdCount : importUsersRows.length;
      const skippedCount = typeof data?.skippedCount === "number" ? data.skippedCount : 0;
      const adjustedUsernameCount = typeof data?.adjustedUsernameCount === "number" ? data.adjustedUsernameCount : 0;
      const createdRows: ParentImportCreatedRow[] = Array.isArray(data?.created)
        ? data.created.filter((value: unknown): value is ParentImportCreatedRow => typeof value === "object" && value !== null)
        : [];
      const skippedRows: ParentImportSkippedRow[] = Array.isArray(data?.skipped)
        ? data.skipped.filter((value: unknown): value is ParentImportSkippedRow => typeof value === "object" && value !== null)
        : [];
      const resultsByRow = new Map<number, ParentImportResult>();
      createdRows.forEach((row: ParentImportCreatedRow) => {
        if (typeof row.rowNumber !== "number") return;
        resultsByRow.set(row.rowNumber, {
          status: "Created",
          username: row.username,
          name: row.name,
          email: row.email,
          temporaryPassword: row.temporaryPassword,
        });
      });
      skippedRows.forEach((row: ParentImportSkippedRow) => {
        if (typeof row.rowNumber !== "number") return;
        resultsByRow.set(row.rowNumber, {
          status: "Existing account",
          username: row.username,
          name: row.name,
          email: row.email,
          phone: row.phone,
        });
      });
      downloadParentImportResults(teamName, importedRows, resultsByRow);
      closeImportUsersModal(true);
      const summaryParts = [
        `Imported ${createdCount} parent account${createdCount === 1 ? "" : "s"}`,
      ];
      if (skippedCount > 0) {
        summaryParts.push(`skipped ${skippedCount} existing account${skippedCount === 1 ? "" : "s"}`);
      }
      if (adjustedUsernameCount > 0) {
        summaryParts.push(`${adjustedUsernameCount} username${adjustedUsernameCount === 1 ? " was" : "s were"} adjusted to keep them unique`);
      }
      setRolesMessage(`${summaryParts.join(", ")}, and downloaded the credentials file.`);
      setRolesMessageStatus("success");
    } catch (error) {
      console.error("Import parent users failed", error);
      setImportUsersMessage("Unable to import parent accounts.");
      setImportUsersMessageStatus("error");
    } finally {
      setImportingUsers(false);
    }
  };

  const saveEditedUser = async () => {
    const member = editUserModalMember;
    if (!member || !teamId) return;
    const firstName = editUserFirstName.trim();
    const lastName = editUserLastName.trim();
    const username = editUserUsername.trim();
    if (!firstName || !lastName || !username) {
      setRolesMessage("First name, last name, and username are required.");
      setRolesMessageStatus("error");
      return;
    }

    setSavingEditedUser(true);
    setRolesMessage(null);
    setRolesMessageStatus(null);
    const query = role === "ADMIN" ? `?teamId=${encodeURIComponent(teamId)}` : "";
    try {
      const res = await fetch(`/api/coach/parents/${member.id}${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`,
          username,
          email: editUserEmail,
          phone: editUserPhone,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRolesMessage(typeof data?.error === "string" ? data.error : "Unable to update team user.");
        setRolesMessageStatus("error");
        return;
      }
      const updated = data?.updated;
      if (!updated || typeof updated.id !== "string") {
        setRolesMessage("Unable to update team user.");
        setRolesMessageStatus("error");
        return;
      }
      const nextMember: TeamMember = {
        id: updated.id,
        username: typeof updated.username === "string" ? updated.username : username.toLowerCase(),
        email: typeof updated.email === "string" ? updated.email : editUserEmail.trim().toLowerCase(),
        phone: typeof updated.phone === "string" ? updated.phone : editUserPhone.trim(),
        name: typeof updated.name === "string" ? updated.name : `${firstName} ${lastName}`,
        role: updated.role === "COACH" || updated.role === "TABLE_WORKER" || updated.role === "PARENT"
          ? updated.role
          : member.role,
        matNumber: typeof updated.matNumber === "number" ? updated.matNumber : member.matNumber,
        wrestlerIds: Array.isArray(updated.wrestlerIds)
          ? updated.wrestlerIds.filter((value: unknown): value is string => typeof value === "string")
          : member.wrestlerIds,
      };
      setParents((prev) => prev.map((entry) => (entry.id === nextMember.id ? nextMember : entry)));
      setStaff((prev) => sortStaff(prev.map((entry) => (entry.id === nextMember.id ? nextMember : entry)), headCoachId));
      closeEditUserModal();
      setRolesMessage("Team user updated.");
      setRolesMessageStatus("success");
    } catch (error) {
      console.error("Edit team user failed", error);
      setRolesMessage("Unable to update team user.");
      setRolesMessageStatus("error");
    } finally {
      setSavingEditedUser(false);
    }
  };

  const resetEditedUserPassword = async () => {
    const member = editUserModalMember;
    if (!member || !teamId) return;
    const nextPassword = editUserPassword.trim();
    if (!nextPassword) {
      setRolesMessage("Enter a temporary password first.");
      setRolesMessageStatus("error");
      return;
    }

    setResettingEditedUserPassword(true);
    setRolesMessage(null);
    setRolesMessageStatus(null);
    const query = role === "ADMIN" ? `?teamId=${encodeURIComponent(teamId)}` : "";
    try {
      const res = await fetch(`/api/coach/parents/${member.id}/password${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nextPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRolesMessage(typeof data?.error === "string" ? data.error : "Unable to reset password.");
        setRolesMessageStatus("error");
        return;
      }
      setRolesMessage("Temporary password set. The user will need to reset it at sign-in.");
      setRolesMessageStatus("success");
    } catch (error) {
      console.error("Reset password failed", error);
      setRolesMessage("Unable to reset password.");
      setRolesMessageStatus("error");
    } finally {
      setResettingEditedUserPassword(false);
    }
  };

  const deleteTeamUser = async (member: TeamMember) => {
    if (!teamId) return;
    if (member.id === currentUserId) {
      setRolesMessage("You cannot delete your own account.");
      setRolesMessageStatus("error");
      return;
    }
    setDeleteUserModalMember(member);
  };

  const confirmDeleteTeamUser = async () => {
    const member = deleteUserModalMember;
    if (!teamId || !member) return;
    setDeletingMember((prev) => ({ ...prev, [member.id]: true }));
    setRolesMessage(null);
    setRolesMessageStatus(null);
    try {
      const res = await fetch(`/api/admin/users/${member.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setRolesMessage(payload?.error ?? "Unable to delete team user.");
        setRolesMessageStatus("error");
        return;
      }
      if (member.id === headCoachId) {
        setHeadCoachId(null);
      }
      setParents((prev) => prev.filter((entry) => entry.id !== member.id));
      setStaff((prev) => prev.filter((entry) => entry.id !== member.id));
      setDeleteUserModalMember(null);
      setRolesMessage("Team user deleted.");
      setRolesMessageStatus("success");
    } catch (error) {
      console.error("Delete team user failed", error);
      setRolesMessage("Unable to delete team user.");
      setRolesMessageStatus("error");
    } finally {
      setDeletingMember((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    }
  };

  const isHeadCoach = (member: TeamMember) => member.role === "COACH" && member.id === headCoachId;
  const canEditRoles = role === "ADMIN" || (role === "COACH" && currentUserId !== null && currentUserId === headCoachId);
  const canEditTeamSettings = canEditRoles;
  const canDeleteTeamUsers = canEditRoles;
  const canCreateTeamUser = Boolean(
    canEditRoles
      && !creatingUser
      && newUserFirstName.trim()
      && newUserLastName.trim()
      && newUserUsername.trim()
      && newUserPassword.trim(),
  );
  const canImportParentUsers = Boolean(
    canEditRoles
      && !importingUsers
      && importUsersRows.length > 0
  );

  const wrestlerById = new Map(teamWrestlers.map((wrestler) => [wrestler.id, wrestler]));
  const attendanceResponderWrestlerIds = new Set(
    [...parents, ...staff].flatMap((member) => member.wrestlerIds),
  );
  const wrestlersWithoutParent = teamWrestlers.filter((wrestler) => !attendanceResponderWrestlerIds.has(wrestler.id));
  const showRolesLoading = !rolesLoaded || rolesLoading;
  const rolesFilterQuery = rolesFilter.trim();
  const sortedRolesMembers = sortStaff([...staff, ...parents], headCoachId);
  const filteredRolesMembers = rolesFilterQuery.length > 0
    ? sortedRolesMembers.filter((member) => memberMatchesFuzzyQuery(member, rolesFilterQuery))
    : sortedRolesMembers;
  const pickerMember = wrestlerPickerMemberId
    ? staff.find((member) => member.id === wrestlerPickerMemberId)
      ?? parents.find((member) => member.id === wrestlerPickerMemberId)
      ?? null
    : null;
  const pickerSuggestedWrestlerIds = pickerMember ? getLikelyWrestlerIds(pickerMember) : [];
  const rolesMessageIsError = rolesMessageStatus === "error";
  const importUsersMessageIsError = importUsersMessageStatus === "error";
  const formatAssignedWrestlers = (member: TeamMember, wrestlerIds: string[]) => {
    if (wrestlerIds.length === 0) return "None";
    const memberLastNameCandidates = extractLastNameCandidates(member.name);
    const names = wrestlerIds
      .map((id) => wrestlerById.get(id))
      .filter((wrestler): wrestler is TeamWrestler => Boolean(wrestler))
      .map((wrestler) => {
        if (memberLastNameCandidates.length === 0) return wrestler.first;
        const wrestlerLast = normalizeNameToken(wrestler.last);
        const score = memberLastNameCandidates.reduce((best, candidate) => {
          const next = lastNameSimilarity(candidate, wrestlerLast);
          return next > best ? next : best;
        }, 0);
        return score >= LAST_NAME_MATCH_THRESHOLD ? wrestler.first : `${wrestler.first} ${wrestler.last}`;
      });
    if (names.length === 0) return `${wrestlerIds.length} selected`;
    return names.join(", ");
  };
  const renderRolesTableRows = () => {
    if (showRolesLoading) {
      return (
        <tr>
          <td colSpan={5} className="coach-empty-cell">Loading</td>
        </tr>
      );
    }
    if (sortedRolesMembers.length === 0) {
      return (
        <tr>
          <td colSpan={5} className="coach-empty-cell">No parent or staff accounts found.</td>
        </tr>
      );
    }
    if (filteredRolesMembers.length === 0) {
      return (
        <tr>
          <td colSpan={5} className="coach-empty-cell">No matches found.</td>
        </tr>
      );
    }
    return filteredRolesMembers.map((member) => {
      const suggestedWrestlerIds = member.wrestlerIds.length === 0 ? getLikelyWrestlerIds(member) : [];
      return (
        <tr key={member.id}>
          <td>
            {member.name ? `${member.name} (@${member.username})` : `@${member.username}`}
          </td>
          <td>
            <select
              className="coach-role-select"
              value={member.role}
              disabled={isHeadCoach(member) || !canEditRoles || Boolean(savingParent[member.id])}
              onChange={(event) => void updateRole(member, event.currentTarget.value as TeamMember["role"])}
            >
              {isHeadCoach(member) ? (
                <option value="COACH">Head Coach</option>
              ) : (
                <>
                  <option value="PARENT">Parent</option>
                  <option value="COACH">Assistant Coach</option>
                  <option value="TABLE_WORKER">Table Worker</option>
                </>
              )}
            </select>
          </td>
          <td className="coach-hidden-mat-column">
            <div className="coach-mat-picker-cell">
              <button
                type="button"
                className="coach-btn-secondary coach-mat-picker-btn"
                onClick={(event) => openMatPicker(member, event.currentTarget)}
                disabled={Boolean(savingAssignments[member.id])}
              >
                {member.matNumber ? (
                  <>
                    <span
                      className="coach-mat-swatch"
                      style={{ backgroundColor: getMatColor(member.matNumber) }}
                      aria-hidden
                    />
                    <span>Mat {member.matNumber}</span>
                  </>
                ) : (
                  <span>No Mat</span>
                )}
                <span className="coach-mat-caret" aria-hidden>v</span>
              </button>
              {matListboxMemberId === member.id && !savingAssignments[member.id] && (
                <div
                  className={`coach-mat-listbox${matListboxDirection === "up" ? " open-up" : ""}`}
                  role="listbox"
                  aria-label={`Select mat for ${member.name ?? member.username}`}
                  style={{
                    top: matListboxPosition.top,
                    left: matListboxPosition.left,
                    minWidth: matListboxPosition.width,
                  }}
                >
                  <button
                    type="button"
                    className={`coach-mat-option${member.matNumber === null ? " selected" : ""}`}
                    onClick={() => assignMatToMember(member.id, null)}
                  >
                    <span>No Mat</span>
                  </button>
                  {Array.from({ length: numMats }, (_, idx) => idx + 1).map((matNumber) => (
                    <button
                      key={matNumber}
                      type="button"
                      className={`coach-mat-option${member.matNumber === matNumber ? " selected" : ""}`}
                      onClick={() => assignMatToMember(member.id, matNumber)}
                    >
                      <span className="coach-mat-swatch" style={{ backgroundColor: getMatColor(matNumber) }} aria-hidden />
                      <span>Mat {matNumber}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </td>
          <td>
            <div className="coach-staff-wrestlers-row">
              <div className="coach-staff-assigned">
                {member.wrestlerIds.length > 0
                  ? formatAssignedWrestlers(member, member.wrestlerIds)
                  : suggestedWrestlerIds.length > 0
                    ? `Suggested: ${formatAssignedWrestlers(member, suggestedWrestlerIds)}`
                    : <span className="coach-none-assigned">None</span>}
              </div>
              <div className="coach-staff-wrestler-actions">
                {member.wrestlerIds.length === 0 && suggestedWrestlerIds.length > 0 && (
                  <button
                    type="button"
                    className="coach-btn-secondary coach-picker-btn"
                    disabled={Boolean(savingAssignments[member.id])}
                    onClick={() => void saveStaffAssignments(member.id, member.matNumber, suggestedWrestlerIds)}
                  >
                    Use Last Name Match
                  </button>
                )}
                <button
                  type="button"
                  className="coach-btn-secondary coach-picker-btn"
                  disabled={Boolean(savingAssignments[member.id]) || teamWrestlers.length === 0}
                  onClick={() => openWrestlerPicker(member)}
                >
                  Select Wrestlers
                </button>
              </div>
            </div>
          </td>
          <td>
            <div className="coach-user-actions">
              {canEditRoles ? (
                <button
                  type="button"
                  className="coach-btn-secondary coach-picker-btn"
                  onClick={() => openEditUserModal(member)}
                >
                  Edit
                </button>
              ) : null}
              {canDeleteTeamUsers && member.id !== currentUserId ? (
                <button
                  type="button"
                  className="coach-btn-secondary coach-delete-user-btn"
                  disabled={Boolean(deletingMember[member.id])}
                  onClick={() => void deleteTeamUser(member)}
                >
                  {deletingMember[member.id] ? "Deleting..." : "Delete"}
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <main className="coach">
      <style>{coachStyles}</style>
      <div className="coach-shell">
        <AppHeader links={headerLinks} disableCoachShortcut />
        <div className="team-info">
          <div>
            <h1 className="team-title">
              Team Settings For: {teamName}
              {teamSymbol ? (
                <span style={{ color: adjustTeamTextColor(teamColor), marginLeft: 6 }}>
                  ({teamSymbol})
                </span>
              ) : null}
            </h1>
            <p className="coach-intro">
              Configure your team's public details, mat rules, and helper roles.
            </p>
          </div>
          {role === "ADMIN" && (
            <label className="team-picker">
              Team
              <select
                value={teamId ?? ""}
                onChange={e => {
                  if (!e.target.value) return;
                  setTeamId(e.target.value);
                }}
              >
                <option value="">Select a team</option>
                {orderedTeams.map(t => (
                  <option key={t.id} value={t.id}>
                    {formatTeamName(t)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="tab-bar">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`tab-button${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={`tab-body${activeTab === "parents" ? " tab-body-roles" : ""}`}>
          {activeTab === "info" && (
          <section className="coach-card">
          <div className="coach-card-header">
            <h3>Team Info</h3>
          </div>
          {!canEditTeamSettings && (
            <p className="coach-readonly-note">Only the head coach or an admin can edit team settings.</p>
          )}
          <div className="setup-grid">
            <div className="logo-color">
              <div className="logo-field">
                <span className="field-label">Logo</span>
                <div className="logo-row">
                  <input
                    id="team-logo-file"
                    type="file"
                    className="file-input"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
                    disabled={!canEditTeamSettings}
                    onChange={(e) => {
                      void uploadLogo(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                  />
                  <label
                    htmlFor="team-logo-file"
                    className={`logo-button${canEditTeamSettings ? "" : " disabled"}`}
                    aria-label="Upload team logo"
                  >
                    {teamHasLogo ? (
                      <img
                        src={`/api/teams/${teamId}/logo/file?v=${logoVersion}`}
                        alt="Team logo"
                      />
                    ) : (
                      <span className="logo-button-text">
                        {logoLoading ? "Uploading..." : "Set Logo"}
                      </span>
                    )}
                  </label>
                </div>
              </div>
              <div className="color-field color-inline">
                <span className="color-field-label">Color</span>
                <div className="color-actions">
                    {canEditTeamSettings ? (
                    <ColorPicker
                      value={teamColor}
                      onChange={handleTeamColorChange}
                      idPrefix="team-color"
                      buttonClassName="color-swatch"
                      buttonStyle={{
                        backgroundColor:
                          sanitizedTeamColor && sanitizedTeamColor.length > 0
                            ? sanitizedTeamColor
                            : "#ffffff",
                        width: 44,
                        height: 32,
                      }}
                      showNativeColorInput={true}
                    />
                    ) : (
                      <span
                        className="color-swatch disabled"
                        style={{
                          backgroundColor:
                            sanitizedTeamColor && sanitizedTeamColor.length > 0
                              ? sanitizedTeamColor
                              : "#ffffff",
                          width: 44,
                          height: 32,
                        }}
                        aria-hidden
                      />
                    )}
                </div>
              </div>
            </div>
            <div className="website-location-group stacked">
              <label className="website-field inline">
                <span className="field-label">Website</span>
                <input
                  type="url"
                  placeholder="https://yourteam.example.com"
                  value={teamWebsite}
                  disabled={!canEditTeamSettings}
                  onChange={e => handleTeamWebsiteChange(e.target.value)}
                  onKeyDown={handleFieldKeyDown}
                />
              </label>
              <label className="location-field inline">
                <span className="field-label">Home Meet Location</span>
                <input
                  type="text"
                  placeholder="Schoolname, address"
                  value={teamLocation}
                  disabled={!canEditTeamSettings}
                  onChange={e => handleTeamLocationChange(e.target.value)}
                  onKeyDown={handleFieldKeyDown}
                />
              </label>
            </div>
            <div className="info-actions">
              <div className="info-message-slot" aria-live="polite">
                <p
                  className={`info-message ${messageIsError ? "error" : "success"}${message ? "" : " empty"}`}
                  role={message ? "status" : undefined}
                >
                  {message ?? "\u00A0"}
                </p>
              </div>
              <div className="info-actions-row">
                <button
                  type="button"
                  className="coach-btn coach-btn-ghost"
                  onClick={() => void updateTeam()}
                  disabled={!canEditTeamSettings || !canSaveTeamInfo}
                >
                  Save Info
                </button>
                <button
                  type="button"
                  className="coach-btn coach-btn-secondary"
                  onClick={cancelTeamInfoEdits}
                  disabled={!canEditTeamSettings || !canSaveTeamInfo}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          </section>
          )}

          {activeTab === "mat" && (
          <section className="coach-card">
          <div className="coach-card-header">
            <h3>Mat Setup</h3>
          </div>
          {!canEditTeamSettings && (
            <p className="coach-readonly-note">Only the head coach or an admin can edit team settings.</p>
          )}
          <div className="mat-summary-box">
            <div>
              <div className="mat-summary-label">Max number of mats for home meets</div>
              <div className="mat-summary-row">
                <NumberInput
                  min={MIN_MATS}
                  max={MAX_MATS}
                  value={numMats}
                  disabled={!canEditTeamSettings}
                  onValueChange={(value) => adjustMatCount(value)}
                  normalize={(value) => Math.round(value)}
                />
                <div className="mat-summary-note">The table below always lists eight mats; use this input to indicate the number of mats you actually have.</div>
              </div>
            </div>
          </div>
          <div className="mat-setup-table">
            <table>
              <thead>
                <tr>
                  <th>Mat</th>
                  <th>Color</th>
                  <th>Min Experience</th>
                  <th>Max Experience</th>
                  <th>Min Age</th>
                  <th>Max Age</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, idx) => {
                  const trimmedRuleColor = rule.color?.trim();
                  const matSwatchColor =
                    trimmedRuleColor && trimmedRuleColor.length > 0 ? trimmedRuleColor : "#ffffff";
                  return (
                    <tr key={rule.matIndex}>
                      <td>
                        <span>{rule.matIndex}</span>
                      </td>
                      <td>
                        <div className="color-actions">
                          {canEditTeamSettings ? (
                          <ColorPicker
                            value={rule.color ?? ""}
                            onChange={(next) => updateRule(idx, "color", next)}
                            idPrefix={`mat-color-${rule.matIndex}-${idx}`}
                            buttonClassName="color-swatch"
                            buttonStyle={{ backgroundColor: matSwatchColor, width: 32, height: 32 }}
                          />
                          ) : (
                            <span
                              className="color-swatch disabled"
                              style={{ backgroundColor: matSwatchColor, width: 32, height: 32 }}
                              aria-hidden
                            />
                          )}
                        </div>
                      </td>
                    <td>
                      <NumberInput
                        min={0}
                        max={50}
                        value={rule.minExperience}
                        disabled={!canEditTeamSettings}
                        onValueChange={(value) => updateRule(idx, "minExperience", Math.round(value))}
                        normalize={(value) => Math.round(value)}
                      />
                    </td>
                    <td>
                      <NumberInput
                        min={0}
                        max={50}
                        value={rule.maxExperience}
                        disabled={!canEditTeamSettings}
                        onValueChange={(value) => updateRule(idx, "maxExperience", Math.round(value))}
                        normalize={(value) => Math.round(value)}
                      />
                    </td>
                    <td>
                      <NumberInput
                        min={0}
                        max={100}
                        step={0.1}
                        value={rule.minAge}
                        disabled={!canEditTeamSettings}
                        onValueChange={(value) => updateRule(idx, "minAge", roundToTenth(value))}
                        normalize={roundToTenth}
                      />
                    </td>
                    <td>
                      <NumberInput
                        min={0}
                        max={100}
                        step={0.1}
                        value={rule.maxAge}
                        disabled={!canEditTeamSettings}
                        onValueChange={(value) => updateRule(idx, "maxAge", roundToTenth(value))}
                        normalize={roundToTenth}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="coach-btn coach-btn-primary"
            onClick={handleMatSave}
            disabled={!canEditTeamSettings || savingMat || rules.length === 0 || !matDirty}
            style={{ marginTop: 12 }}
          >
            {savingMat ? "Saving..." : "Save Mat Setup"}
          </button>
          </section>
          )}

          {activeTab === "meet" && (
          <section className="coach-card">
          <div className="coach-card-header">
            <h3>Meet Setup</h3>
          </div>
          {!canEditTeamSettings && (
            <p className="coach-readonly-note">Only the head coach or an admin can edit team settings.</p>
          )}
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={homeTeamPreferSameMat}
              disabled={!canEditTeamSettings}
              onChange={(e) => setHomeTeamPreferSameMat(e.target.checked)}
            />
            Assign home team wrestlers' bouts so they are all on the same mat
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={printBoutSheetsInColor}
              disabled={!canEditTeamSettings}
              onChange={(e) => setPrintBoutSheetsInColor(e.target.checked)}
            />
            Print bout sheets in color
          </label>
          <div className="meet-setup-grid">
            <label className="meet-setup-row">
              <span className="meet-setup-label">Limit wrestlers to</span>
              <div className="meet-setup-line">
              <input
                type="number"
                min={1}
                max={5}
                value={maxMatchesInput}
                disabled={!canEditTeamSettings}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setMaxMatchesInput(nextValue);
                  const parsed = Number(nextValue);
                  if (Number.isNaN(parsed)) return;
                  setDefaultMaxMatchesPerWrestler(Math.max(1, Math.min(5, Math.round(parsed))));
                }}
                onBlur={() => {
                  const parsed = Number(maxMatchesInput);
                  if (Number.isNaN(parsed)) {
                    setMaxMatchesInput(String(defaultMaxMatchesPerWrestler));
                  }
                }}
                className="meet-setup-input"
              />
                <span>matches per meet</span>
              </div>
            </label>
            <label className="meet-setup-row">
              <span className="meet-setup-label">Flag as conflict if same wrestler has two matches within</span>
              <div className="meet-setup-line">
              <input
                type="number"
                min={0}
                max={20}
                value={restGapInput}
                disabled={!canEditTeamSettings}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setRestGapInput(nextValue);
                  const parsed = Number(nextValue);
                  if (Number.isNaN(parsed)) return;
                  setDefaultRestGap(Math.max(0, Math.min(20, Math.round(parsed))));
                }}
                onBlur={() => {
                  const parsed = Number(restGapInput);
                  if (Number.isNaN(parsed)) {
                    setRestGapInput(String(defaultRestGap));
                  }
                }}
                className="meet-setup-input"
              />
                <span>matches</span>
              </div>
            </label>
          </div>
          <div className="meet-setup-actions" style={{ justifyContent: "flex-start" }}>
            <p
              className={`info-message ${meetDefaultsIsError ? "error" : "success"}${meetDefaultsMessage ? "" : " empty"}`}
              role={meetDefaultsMessage ? "status" : undefined}
            >
              {meetDefaultsMessage ?? "\u00A0"}
            </p>
            <button
              type="button"
              className="coach-btn coach-btn-primary"
              onClick={saveMeetDefaults}
              disabled={!canEditTeamSettings || !canSaveMeetDefaults}
            >
              {savingMeetDefaults ? "Saving..." : "Save Meet Setup"}
            </button>
          </div>
          </section>
          )}

          {activeTab === "parents" && (
        <section className="coach-card coach-roles-card">
          <p
            className={`info-message ${rolesMessageIsError ? "error" : "success"}${rolesMessage ? "" : " empty"}`}
            role={rolesMessage ? "status" : undefined}
          >
            {rolesMessage ?? "\u00A0"}
          </p>
          <div className="coach-table coach-staff-table">
            <div className="coach-roles-table-toolbar">
              <div className="coach-roles-header-left">
                <h3>Parents</h3>
                <input
                  id="coach-roles-filter"
                  type="search"
                  className="coach-roles-filter-input"
                  value={rolesFilter}
                  onChange={(event) => setRolesFilter(event.currentTarget.value)}
                  placeholder="Search name or username"
                  autoComplete="off"
                />
              </div>
              {canEditRoles && (
                <div className="coach-roles-toolbar-actions">
                  <button
                    type="button"
                    className="coach-btn-secondary coach-create-user-open"
                    onClick={() => setMissingParentsModalOpen(true)}
                  >
                    Missing Parents ({wrestlersWithoutParent.length})
                  </button>
                  <button
                    type="button"
                    className="coach-btn-secondary coach-create-user-open"
                    onClick={() => {
                      closeImportUsersModal(true);
                      setImportUsersModalOpen(true);
                    }}
                  >
                    Import Parents
                  </button>
                  <button
                    type="button"
                    className="coach-btn coach-btn-primary coach-create-user-open"
                    onClick={() => {
                      setNewUserUsernameEdited(false);
                      setNewUserRole("PARENT");
                      setCreateUserModalOpen(true);
                    }}
                  >
                    Create New User
                  </button>
                </div>
              )}
            </div>
            <div className="coach-staff-header">
              <table>
                <colgroup>
                  <col style={{ width: 320 }} />
                  <col style={{ width: 140 }} />
                  <col className="coach-hidden-mat-column" style={{ width: 0 }} />
                  <col style={{ width: 320 }} />
                  <col style={{ width: 108 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th className="coach-hidden-mat-column">Mat #</th>
                    <th>Wrestlers</th>
                    <th>Action</th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className="coach-staff-scroll">
              <table>
                <colgroup>
                  <col style={{ width: 320 }} />
                  <col style={{ width: 140 }} />
                  <col className="coach-hidden-mat-column" style={{ width: 0 }} />
                  <col style={{ width: 320 }} />
                  <col style={{ width: 108 }} />
                </colgroup>
                <tbody>
                  {renderRolesTableRows()}
                </tbody>
              </table>
            </div>
          </div>
        </section>
          )}
        </div>
      </div>
      {wrestlerPickerMemberId && pickerMember && (
        <div className="coach-modal-backdrop" onClick={closeWrestlerPicker}>
          <div className="coach-modal" onClick={(event) => event.stopPropagation()}>
            <h4>Select Wrestlers for: {pickerMember.name ?? pickerMember.username}</h4>
            <div className="coach-modal-roster">
              {teamWrestlers.map((wrestler) => {
                const checked = wrestlerPickerSelection.includes(wrestler.id);
                return (
                  <label key={wrestler.id} className="coach-modal-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWrestlerInPicker(wrestler.id)}
                    />
                    <span>{formatLastFirstName(wrestler.first, wrestler.last)}</span>
                  </label>
                );
              })}
              {teamWrestlers.length === 0 && <div className="coach-empty-cell">No active wrestlers found.</div>}
            </div>
            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => setWrestlerPickerSelection([...pickerSuggestedWrestlerIds])}
                disabled={pickerSuggestedWrestlerIds.length === 0}
              >
                Match Last Name
              </button>
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => setWrestlerPickerSelection([])}
              >
                Clear
              </button>
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={closeWrestlerPicker}
              >
                Cancel
              </button>
              <button
                type="button"
                className="coach-btn"
                onClick={applyWrestlerPicker}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {createUserModalOpen && canEditRoles && (
        <div className="coach-modal-backdrop" onClick={closeCreateUserModal}>
          <div className="coach-modal coach-create-user-modal" onClick={(event) => event.stopPropagation()}>
            <h4 className="coach-create-user-modal-heading">
              <span>Create user for {teamName}{teamSymbol ? ` (${teamSymbol})` : ""}</span>
              {teamId && teamHasLogo ? (
                <img
                  className="coach-create-user-modal-logo"
                  src={`/api/teams/${teamId}/logo/file?v=${logoVersion}`}
                  alt={`${teamName} logo`}
                />
              ) : null}
            </h4>
            <div className="coach-create-user-modal-grid">
              <input
                placeholder="First Name"
                value={newUserFirstName}
                onChange={handleNewUserFirstNameChange}
              />
              <input
                placeholder="Last Name"
                value={newUserLastName}
                onChange={handleNewUserLastNameChange}
              />
              <input
                placeholder="Username"
                value={newUserUsername}
                onChange={handleNewUserUsernameChange}
                autoCapitalize="none"
                spellCheck={false}
              />
              <input
                placeholder="Email (optional)"
                value={newUserEmail}
                onChange={(event) => setNewUserEmail(event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
              />
              <input
                placeholder="Phone (optional)"
                value={newUserPhone}
                onChange={(event) => setNewUserPhone(event.target.value)}
              />
              <select
                value={newUserRole}
                onChange={(event) => setNewUserRole(event.target.value as "COACH" | "TABLE_WORKER" | "PARENT")}
              >
                <option value="TABLE_WORKER">Table Worker</option>
                <option value="COACH">Assistant Coach</option>
                <option value="PARENT">Parent</option>
              </select>
              <div className="coach-create-user-password">
                <input
                  placeholder="Temporary Password"
                  value={newUserPassword}
                  onChange={(event) => setNewUserPassword(event.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="coach-btn-secondary coach-picker-btn"
                  onClick={generateTempPassword}
                  disabled={creatingUser}
                >
                  Generate
                </button>
              </div>
            </div>
            <p
              className={`info-message ${rolesMessageIsError ? "error" : "success"}${rolesMessage ? "" : " empty"}`}
              role={rolesMessage ? "status" : undefined}
            >
              {rolesMessage ?? "\u00A0"}
            </p>
            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={closeCreateUserModal}
                disabled={creatingUser}
              >
                Cancel
              </button>
              <button
                type="button"
                className="coach-btn"
                disabled={!canCreateTeamUser}
                onClick={() => void createTeamUser()}
              >
                {creatingUser ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      {importUsersModalOpen && canEditRoles && (
        <div className="coach-modal-backdrop" onClick={() => closeImportUsersModal()}>
          <div className="coach-modal coach-import-users-modal" onClick={(event) => event.stopPropagation()}>
            <h4>Import parent accounts for {teamName}{teamSymbol ? ` (${teamSymbol})` : ""}</h4>
            <div className="coach-import-users-body">
              <p className="coach-import-users-note">
                Upload a CSV, XLS, or XLSX file with columns for first name, last name, email, phone, and optional kid names.
                Kid names can go in one `Kids` column separated by semicolons, or in columns like `Kid 1`, `Kid 2`.
                Email and phone are optional. Usernames are generated automatically.
                Enter a shared temporary password if you want everyone to use the same one. Leave it blank to generate a different temporary password for each parent.
                If you enter a shared temporary password, imported parents must reset it at first sign-in.
              </p>
              <details>
                <summary>Example CSV</summary>
                <p className="coach-import-users-note" style={{ marginTop: 8 }}>
                  Use either a single `Kids` column with semicolon-separated names, or separate columns such as `Kid 1`, `Kid 2`.
                </p>
                <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{`First Name,Last Name,Email,Phone,Kids,Kid 1,Kid 2
Sarah,Jones,sarah@example.com,555-111-2222,"Mason Jones;Ella Jones",,
Michael,Brown,,555-333-4444,,Noah Brown,Olivia Brown
Ashley,Smith,ashley@example.com,,Logan Smith,,
`}</pre>
              </details>
              <div className="coach-import-users-grid">
                <label className="coach-import-users-field">
                  <span>Parent file</span>
                  <input
                    type="file"
                    accept=".csv,text/csv,.xls,application/vnd.ms-excel,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      void chooseImportUsersFile(file);
                    }}
                  />
                </label>
                <label className="coach-import-users-field">
                  <span>Shared temporary password (optional)</span>
                  <input
                    placeholder="Leave blank to auto-generate per parent"
                    value={importUsersPassword}
                    onChange={(event) => setImportUsersPassword(event.target.value)}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
              </div>
              {importUsersFile ? (
                <div className="coach-import-users-file-name">
                  File: {importUsersFile.name}
                </div>
              ) : null}
              <p
                className={`info-message ${importUsersMessageIsError ? "error" : "success"}${importUsersMessage ? "" : " empty"}`}
                role={importUsersMessage ? "status" : undefined}
              >
                {importUsersMessage ?? "\u00A0"}
              </p>
              {importUsersPreviewRows.length > 0 && (
                <div className="coach-import-preview">
                  <div className="coach-import-preview-title">
                    Preview ({importUsersRows.length} row{importUsersRows.length === 1 ? "" : "s"})
                  </div>
                  <div className="coach-import-preview-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>First</th>
                          <th>Last</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Kids</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importUsersPreviewRows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>{row.firstName || <span className="coach-empty-cell">-</span>}</td>
                            <td>{row.lastName || <span className="coach-empty-cell">-</span>}</td>
                            <td>{row.email || <span className="coach-empty-cell">-</span>}</td>
                            <td>{row.phone || <span className="coach-empty-cell">-</span>}</td>
                            <td>{row.kids.length > 0 ? row.kids.join("; ") : <span className="coach-empty-cell">-</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {importUsersRowErrors.length > 0 && (
                <div className="coach-import-errors">
                  <div className="coach-import-preview-title">Fix these rows</div>
                  <ul>
                    {importUsersRowErrors.map((rowError) => (
                      <li key={rowError}>{rowError}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => closeImportUsersModal()}
                disabled={importingUsers}
              >
                Cancel
              </button>
              <button
                type="button"
                className="coach-btn"
                disabled={!canImportParentUsers}
                onClick={() => void importParentUsers()}
              >
                {importingUsers ? "Importing..." : "Import Parents"}
              </button>
            </div>
          </div>
        </div>
      )}
      {missingParentsModalOpen && canEditRoles && (
        <div className="coach-modal-backdrop" onClick={() => setMissingParentsModalOpen(false)}>
          <div className="coach-modal coach-missing-parents-modal" onClick={(event) => event.stopPropagation()}>
            <h4>Wrestlers without a parent account</h4>
            <div className="coach-import-users-body">
              <div className="coach-parent-gap-summary">
                {showRolesLoading
                  ? "Loading"
                  : `${wrestlersWithoutParent.length} active wrestler${wrestlersWithoutParent.length === 1 ? "" : "s"} without a linked parent account.`}
              </div>
              <div className="coach-missing-parents-table">
                <table>
                  <colgroup>
                    <col style={{ width: 160 }} />
                    <col style={{ width: 160 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Last</th>
                      <th>First</th>
                    </tr>
                  </thead>
                </table>
                <div className="coach-missing-parents-table-body">
                  <table>
                    <colgroup>
                      <col style={{ width: 160 }} />
                      <col style={{ width: 160 }} />
                    </colgroup>
                    <tbody>
                      {showRolesLoading ? (
                        <tr>
                          <td colSpan={2} className="coach-empty-cell">Loading</td>
                        </tr>
                      ) : wrestlersWithoutParent.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="coach-empty-cell">Every active wrestler has a parent account.</td>
                        </tr>
                      ) : (
                        wrestlersWithoutParent.map((wrestler) => (
                          <tr key={wrestler.id}>
                            <td>{wrestler.last}</td>
                            <td>{wrestler.first}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => setMissingParentsModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {editUserModalMember && canEditRoles && (
        <div className="coach-modal-backdrop" onClick={closeEditUserModal}>
          <div className="coach-modal coach-create-user-modal" onClick={(event) => event.stopPropagation()}>
            <h4 className="coach-create-user-modal-heading">
              <span>Edit user for {teamName}{teamSymbol ? ` (${teamSymbol})` : ""}</span>
              {teamId && teamHasLogo ? (
                <img
                  className="coach-create-user-modal-logo"
                  src={`/api/teams/${teamId}/logo/file?v=${logoVersion}`}
                  alt={`${teamName} logo`}
                />
              ) : null}
            </h4>
            <div className="coach-create-user-modal-grid">
              <input
                placeholder="First Name"
                value={editUserFirstName}
                onChange={(event) => setEditUserFirstName(event.target.value)}
              />
              <input
                placeholder="Last Name"
                value={editUserLastName}
                onChange={(event) => setEditUserLastName(event.target.value)}
              />
              <input
                placeholder="Username"
                value={editUserUsername}
                onChange={(event) => setEditUserUsername(event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
              />
              <input
                placeholder="Email (optional)"
                value={editUserEmail}
                onChange={(event) => setEditUserEmail(event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
              />
              <input
                placeholder="Phone (optional)"
                value={editUserPhone}
                onChange={(event) => setEditUserPhone(event.target.value)}
              />
              <div className="coach-create-user-password coach-edit-user-password">
                <input
                  placeholder="Temporary Password"
                  value={editUserPassword}
                  onChange={(event) => setEditUserPassword(event.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="coach-btn-secondary coach-picker-btn"
                  onClick={generateEditUserPassword}
                  disabled={savingEditedUser || resettingEditedUserPassword}
                >
                  Generate
                </button>
                <button
                  type="button"
                  className="coach-btn-secondary coach-picker-btn"
                  onClick={() => void resetEditedUserPassword()}
                  disabled={savingEditedUser || resettingEditedUserPassword}
                >
                  {resettingEditedUserPassword ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </div>
            <p
              className={`info-message ${rolesMessageIsError ? "error" : "success"}${rolesMessage ? "" : " empty"}`}
              role={rolesMessage ? "status" : undefined}
            >
              {rolesMessage ?? "\u00A0"}
            </p>
            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={closeEditUserModal}
                disabled={savingEditedUser || resettingEditedUserPassword}
              >
                Cancel
              </button>
              <button
                type="button"
                className="coach-btn"
                onClick={() => void saveEditedUser()}
                disabled={savingEditedUser || resettingEditedUserPassword}
              >
                {savingEditedUser ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteUserModalMember && (
        <div className="coach-modal-backdrop" onClick={() => setDeleteUserModalMember(null)}>
          <div className="coach-modal" onClick={(event) => event.stopPropagation()}>
            <h4>Delete team user</h4>
            <div style={{ padding: "14px 16px", display: "grid", gap: 8 }}>
              <div>
                Delete {deleteUserModalMember.name ? `${deleteUserModalMember.name} (@${deleteUserModalMember.username})` : `@${deleteUserModalMember.username}`}?
              </div>
              <div style={{ fontSize: 14, color: "#6b1f1f" }}>
                This cannot be undone.
              </div>
            </div>
            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-btn-secondary"
                onClick={() => setDeleteUserModalMember(null)}
                disabled={Boolean(deletingMember[deleteUserModalMember.id])}
              >
                Cancel
              </button>
              <button
                type="button"
                className="coach-btn-secondary coach-delete-user-btn"
                onClick={() => void confirmDeleteTeamUser()}
                disabled={Boolean(deletingMember[deleteUserModalMember.id])}
              >
                {deletingMember[deleteUserModalMember.id] ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const coachStyles = `
  :root {
    --bg: #eef1f4;
    --card: #fff;
    --ink: #1d232b;
    --muted: #5a6673;
    --line: #d5dbe2;
    --accent: #1e88e5;
  }
  .coach {
    min-height: 100vh;
    padding: 20px 16px 40px;
    background: var(--bg);
    color: var(--ink);
    font-family: "Source Sans 3", Arial, sans-serif;
  }
  .coach-shell {
    width: 100%;
    margin: 0;
  }
  .coach h1 {
    margin: 0;
    font-size: 32px;
    font-weight: 600;
  }
  .coach-intro {
    margin-top: 8px;
    color: var(--muted);
    max-width: 640px;
    line-height: 1.4;
  }
  .team-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 16px;
    padding-top: 16px;
    border-bottom: 1px solid var(--line);
  }
  .team-title {
    margin: 0;
    font-size: 32px;
    font-weight: 600;
  }
  .coach-card {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--card);
  }
  .coach-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .team-picker {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .team-picker select {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 14px;
    background: #fff;
  }
  .tab-bar {
    margin-top: 12px;
    display: flex;
    justify-content: flex-start;
    gap: 4px;
    padding: 0 8px;
    background: #f1f3f7;
    border: 1px solid #d0d5df;
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    box-shadow: inset 0 -1px 0 rgba(13, 23, 66, 0.08);
  }
  .tab-button {
    flex: none;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 600;
    color: #5f6772;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: 1px solid transparent;
    border-radius: 12px 12px 0 0;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
  }
  .tab-button + .tab-button {
    margin-left: 4px;
  }
  .tab-button:hover:not(.active) {
    background: #e5e9f0;
    color: #1e3a82;
  }
  .tab-button.active {
    background: #fff;
    color: #1e2a4b;
    border-color: #d0d5df;
    border-bottom-color: #fff;
    box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.08);
  }
  .tab-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .tab-body {
    margin-top: -1px;
    padding-top: 0;
    border: 1px solid #d0d5df;
    border-top: none;
    border-radius: 0 0 16px 16px;
    background: #fff;
  }
  .tab-body.tab-body-roles {
    min-height: calc(100dvh - 210px);
    display: flex;
    flex-direction: column;
  }
  .tab-body > *:first-child {
    margin-top: 0;
  }
  .coach-roles-card {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  .coach-roles-card .coach-staff-table {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 0;
    align-self: flex-start;
    width: fit-content;
    max-width: 100%;
  }
  .coach-roles-card .coach-staff-header {
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
  }
  .coach-roles-card .coach-staff-scroll {
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    max-height: calc(100dvh - 360px);
    width: fit-content;
    max-width: 100%;
  }
  .coach-roles-card .coach-staff-header table,
  .coach-roles-card .coach-staff-scroll table {
    width: max-content;
    table-layout: fixed;
  }
  .coach-roles-table-toolbar {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 8px 6px;
    border-bottom: 1px solid var(--line);
  }
  .coach-roles-card > .info-message {
    min-height: 16px;
    margin-bottom: 2px;
  }
  .coach-roles-card > .info-message.empty {
    display: none;
  }
  .coach-parent-gap-summary {
    font-size: 13px;
    color: var(--muted);
  }
  .coach-missing-parents-modal {
    width: min(520px, 100%);
  }
  .coach-missing-parents-table {
    width: fit-content;
    max-width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }
  .coach-missing-parents-table table {
    width: 320px;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .coach-missing-parents-table-body {
    max-height: 620px;
    overflow-y: auto;
    overflow-x: hidden;
    border-top: 1px solid var(--line);
  }
  .coach-missing-parents-table th,
  .coach-missing-parents-table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .coach-missing-parents-table th {
    background: #f7f9fb;
    font-weight: 600;
  }
  .coach-missing-parents-table thead th {
    border-bottom: none;
  }
  .coach-missing-parents-table tbody tr:last-child td {
    border-bottom: none;
  }
  .coach-roles-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: nowrap;
    min-width: 0;
    flex: 1 1 auto;
  }
  .coach-roles-header-left h3 {
    margin: 0;
    white-space: nowrap;
  }
  .coach-roles-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .coach-roles-filter-input {
    width: 280px;
    max-width: 100%;
    flex: 0 1 280px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 13px;
    background: #fff;
  }
  .coach-roles-filter-input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  @media (max-width: 900px) {
    .coach-roles-header-left {
      flex-wrap: wrap;
    }
    .coach-roles-filter-input {
      width: min(280px, 100%);
      flex: 1 1 240px;
    }
  }
  .setup-grid {
    display: grid;
    grid-template-columns: 140px repeat(2, minmax(180px, 1fr));
    column-gap: 16px;
    row-gap: 12px;
    margin-top: 16px;
  }
  .meet-setup-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 16px;
  }
  .meet-setup-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    max-width: 480px;
  }
  .meet-setup-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .meet-setup-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .meet-setup-row input,
  .meet-setup-input {
    width: 90px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 16px;
  }
  .meet-setup-actions {
    margin-top: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .info-actions {
    grid-column: 2 / span 2;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .info-actions-row {
    display: flex;
    gap: 8px;
    width: 100%;
    justify-content: flex-end;
  }
  .info-actions .coach-btn-ghost {
    padding: 8px 14px;
  }
  .info-actions .coach-btn-ghost:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .info-actions .coach-btn-secondary:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .info-message-slot {
    width: 100%;
    min-height: 20px;
    display: flex;
    justify-content: flex-end;
  }
  .info-message {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    min-height: 20px;
    display: inline-flex;
    align-items: center;
    gap: 0;
  }
  .info-message.success {
    color: var(--accent);
  }
  .info-message.error {
    color: #d32f2f;
  }
  .info-message.empty {
    visibility: hidden;
  }
  .logo-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .logo-color {
    grid-column: 1;
    display: grid;
    grid-template-columns: auto auto;
    gap: 16px;
    align-items: flex-start;
  }
  .website-location-group {
    grid-column: 2 / span 2;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .website-field,
  .location-field {
    margin: 0;
    display: grid;
    grid-template-columns: 140px 1fr;
    align-items: center;
    gap: 12px;
  }
  .website-field.inline,
  .location-field.inline {
    grid-template-columns: 140px 1fr;
  }
  .website-field input,
  .location-field input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 20px;
    min-width: 0;
    box-sizing: border-box;
  }
  .field-label {
    font-size: 16px;
    color: var(--muted);
    font-weight: 600;
    min-width: 0;
    text-align: right;
  }
  .logo-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-cell {
    position: relative;
  }
  .file-input {
    display: none;
  }
  .logo-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--line);
    border-radius: 6px;
    padding: 6px;
    background: #f7f9fb;
    cursor: pointer;
    width: 72px;
    height: 72px;
  }
  .logo-button.disabled {
    opacity: 0.55;
    cursor: not-allowed;
    pointer-events: none;
  }
  .logo-button img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .logo-button-text {
    font-size: 13px;
    color: var(--muted);
  }
  .mat-summary-box {
    margin-top: 16px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .mat-summary-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .mat-summary-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .mat-summary-box input {
    width: 72px;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 16px;
    font-weight: 700;
  }
  .mat-summary-note {
    font-size: 13px;
    color: var(--muted);
  }
  .mat-setup-table {
    margin-top: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: visible;
    background: #fff;
    padding: 0 8px 8px;
    width: fit-content;
  }
  .mat-setup-table table {
    width: min(760px, 100%);
    border-collapse: collapse;
    display: block;
  }
  .mat-setup-table th,
  .mat-setup-table td {
    padding: 10px;
    border-bottom: 1px solid var(--line);
    border-right: 1px solid var(--line);
    min-width: 0;
  }
  .mat-setup-table th:last-child,
  .mat-setup-table td:last-child {
    border-right: none;
  }
  .mat-setup-table th {
    background: #f7f9fb;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 12px;
  }
  .mat-setup-table tbody tr:last-child td {
    border-bottom: none;
  }
  .mat-setup-table input {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 14px;
  }
  .color-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .color-swatch.disabled {
    border: 1px solid var(--line);
    border-radius: 4px;
    display: inline-block;
  }
  .coach-readonly-note {
    margin: 6px 0 10px;
    color: #6b7280;
    font-size: 13px;
    font-weight: 600;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .coach-staff {
    margin-top: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    background: #fff;
  }
  .coach-staff ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .coach-staff li {
    border-bottom: 1px solid var(--line);
    padding-bottom: 8px;
  }
  .coach-staff-headline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }
  .coach-staff-contact {
    font-size: 13px;
    color: var(--muted);
  }
  .coach-staff-actions {
    margin-top: 8px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .coach-table {
    margin-top: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    overflow: visible;
  }
  .coach-roles-card .coach-table {
    margin-top: 6px;
  }
  .coach-table table {
    width: 100%;
    border-collapse: collapse;
  }
  .coach-table th,
  .coach-table td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
    text-align: left;
  }
  .coach-table th {
    background: #f7f9fb;
    font-weight: 600;
  }
  .coach-empty-cell {
    color: var(--muted);
    font-style: italic;
  }
  .coach-create-user-open {
    padding: 6px 10px;
    font-size: 12px;
  }
  .coach-create-user-modal {
    width: min(520px, 100%);
  }
  .coach-modal.coach-import-users-modal {
    width: min(980px, calc(100vw - 32px));
  }
  .coach-create-user-modal-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .coach-create-user-modal-logo {
    width: 28px;
    height: 28px;
    object-fit: contain;
    border-radius: 4px;
    border: 1px solid var(--line);
    background: #fff;
    flex: 0 0 auto;
  }
  .coach-create-user-modal-grid {
    padding: 10px 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(160px, 1fr));
    gap: 6px;
  }
  .coach-create-user-modal-grid input,
  .coach-create-user-modal-grid select {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 12px;
    background: #fff;
    min-width: 0;
  }
  .coach-create-user-modal .info-message {
    margin: 0 16px;
    min-height: 20px;
  }
  .coach-import-users-body {
    padding: 12px 16px;
    display: grid;
    gap: 10px;
  }
  .coach-import-users-note {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.35;
  }
  .coach-import-users-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(180px, 1fr));
    gap: 10px;
  }
  .coach-import-users-field {
    display: grid;
    gap: 5px;
    font-size: 12px;
    color: var(--muted);
  }
  .coach-import-users-field input[type="file"] {
    font-size: 12px;
  }
  .coach-import-users-field input[type="file"],
  .coach-import-users-field input[type="text"],
  .coach-import-users-field input[type="password"] {
    min-width: 0;
  }
  .coach-import-users-file-name {
    font-size: 12px;
    color: var(--muted);
  }
  .coach-import-preview {
    display: grid;
    gap: 6px;
  }
  .coach-import-preview-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }
  .coach-import-preview-scroll {
    max-height: 240px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .coach-import-preview table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .coach-import-preview th,
  .coach-import-preview td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }
  .coach-import-preview th {
    position: sticky;
    top: 0;
    background: #f7f9fb;
    z-index: 1;
  }
  .coach-import-preview tbody tr:last-child td {
    border-bottom: none;
  }
  .coach-import-errors {
    display: grid;
    gap: 6px;
    color: #8a1c1c;
  }
  .coach-import-errors ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 4px;
    font-size: 12px;
  }
  .coach-create-user-password {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
  .coach-create-user-password input {
    flex: 1 1 auto;
    min-width: 0;
  }
  .coach-edit-user-password {
    grid-column: 1 / -1;
  }
  .coach-staff-table {
    overflow: visible;
  }
  .coach-staff-header {
    overflow-x: auto;
    overflow-y: hidden;
  }
  .coach-staff-scroll {
    overflow-x: auto;
    overflow-y: auto;
  }
  .coach-staff-header table,
  .coach-staff-scroll table {
    min-width: 888px;
  }
  .coach-staff-table th,
  .coach-staff-table td {
    padding: 2px 4px;
    line-height: 1.1;
  }
  .coach-staff-table th:first-child,
  .coach-staff-table td:first-child {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .coach-hidden-mat-column {
    display: none;
  }
  .coach-role-select {
    min-width: 132px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 5px;
    font-size: 12px;
    background: #fff;
  }
  .coach-mat-picker-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 76px;
    padding: 3px 6px;
    justify-content: flex-start;
  }
  .coach-mat-picker-cell {
    position: relative;
    min-width: 92px;
  }
  .coach-mat-caret {
    margin-left: auto;
    font-size: 11px;
    color: #444;
  }
  .coach-mat-swatch {
    width: 16px;
    height: 16px;
    border: 1px solid #111;
    border-radius: 2px;
    flex: 0 0 16px;
  }
  .coach-mat-listbox {
    position: fixed;
    top: 0;
    left: 0;
    min-width: 102px;
    max-height: 240px;
    overflow: auto;
    display: grid;
    gap: 3px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    padding: 4px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
    z-index: 1200;
  }
  .coach-mat-listbox.open-up {
    transform: translateY(calc(-100% - 8px));
  }
  .coach-staff-wrestlers-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
  }
  .coach-staff-assigned {
    margin-top: 0;
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    line-height: 1.1;
    word-break: break-word;
    flex: 1 1 auto;
    min-width: 150px;
  }
  .coach-none-assigned {
    color: #c62828;
  }
  .coach-staff-wrestler-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    flex-wrap: nowrap;
    margin-left: auto;
  }
  .coach-user-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: nowrap;
    justify-content: flex-start;
    width: fit-content;
  }
  .coach-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1200;
  }
  .coach-modal {
    width: min(560px, 100%);
    max-height: calc(100vh - 32px);
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: #fff;
    display: flex;
    flex-direction: column;
  }
  .coach-modal h4 {
    margin: 0;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 18px;
  }
  .coach-modal-roster {
    padding: 10px 16px;
    overflow: auto;
    display: grid;
    gap: 4px;
    max-height: 50vh;
  }
  .coach-modal-option {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 14px;
    line-height: 1.15;
  }
  .coach-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding: 12px 16px;
  }
  .coach-mat-option {
    border: 1px solid var(--line);
    background: #fff;
    border-radius: 6px;
    padding: 4px 6px;
    display: flex;
    width: 100%;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1.1;
    text-align: left;
  }
  .coach-mat-listbox .coach-mat-swatch {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
  }
  .coach-mat-option.selected {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .coach-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .coach-actions button,
  .coach-btn,
  .coach-btn-secondary {
    border: 0;
    border-radius: 6px;
    font-weight: 600;
    padding: 10px 14px;
    cursor: pointer;
  }
  .coach-btn {
    background: var(--accent);
    color: #fff;
  }
  .coach-btn-ghost {
    background: #f2f5f8;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .coach-btn-secondary {
    background: #f2f5f8;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .coach-btn-secondary.coach-mat-picker-btn {
    gap: 5px;
    min-width: 76px;
    padding: 2px 6px;
    font-size: 12px;
    line-height: 1.1;
  }
  .coach-btn-secondary.coach-picker-btn {
    padding: 2px 6px;
    font-size: 11px;
    line-height: 1.1;
    white-space: nowrap;
  }
  .coach-btn-secondary.coach-delete-user-btn {
    padding: 2px 6px;
    font-size: 11px;
    line-height: 1.1;
    white-space: nowrap;
    background: #fff5f5;
    color: #8a1c1c;
    border-color: #dfc1c1;
  }
  .coach-btn-primary:disabled,
  .coach-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .coach-btn-sm {
    padding: 6px 10px;
    font-size: 12px;
  }
  .coach-empty {
    margin-top: 24px;
    padding: 20px;
    border: 1px dashed var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--muted);
  }
  .coach-intro,
  .coach-card-header h3 {
    font-weight: 600;
  }
  @media (max-width: 768px) {
    .setup-grid {
      grid-template-columns: 1fr;
    }
    .coach-create-user-modal-grid {
      grid-template-columns: 1fr;
    }
    .coach-import-users-grid {
      grid-template-columns: 1fr;
    }
    .coach-toolbar {
      flex-direction: column;
    }
    .coach-modal {
      width: 100%;
    }
    .coach-modal-roster {
      max-height: 44vh;
    }
    .tab-body.tab-body-roles {
      min-height: calc(100dvh - 170px);
    }
  }
`;






