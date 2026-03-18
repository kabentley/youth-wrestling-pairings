"use client";

import { useEffect, useRef, useState } from "react";

import ColorPicker from "@/components/ColorPicker";
import { adjustTeamTextColor } from "@/lib/contrastText";
import { formatTeamName } from "@/lib/formatTeamName";

type TeamRow = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  address?: string | null;
  hasLogo?: boolean;
  wrestlerCount?: number;
  activeWrestlerCount?: number;
  inactiveWrestlerCount?: number;
  girlsCount?: number;
  headCoachId?: string | null;
  headCoach?: { id: string; username: string; name?: string | null } | null;
  coaches: { id: string; username: string }[];
};

function compareTeamRows(a: TeamRow, b: TeamRow) {
  const symbolCompare = a.symbol.localeCompare(b.symbol, undefined, { sensitivity: "base" });
  if (symbolCompare !== 0) return symbolCompare;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function formatHeadCoachLabel(team: TeamRow) {
  if (!team.headCoach) return "None";
  const fullName = team.headCoach.name?.trim();
  return fullName ? `${fullName} (@${team.headCoach.username})` : `@${team.headCoach.username}`;
}

export default function LeagueSection({ view = "league" }: { view?: "league" | "teams" | "pairings" }) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [newTeamColor, setNewTeamColor] = useState("#000000");
  const [newTeamLogoFile, setNewTeamLogoFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [leagueName, setLeagueName] = useState("");
  const [savedLeagueName, setSavedLeagueName] = useState("");
  const [leagueHasLogo, setLeagueHasLogo] = useState(false);
  const [leagueWebsite, setLeagueWebsite] = useState("");
  const [savedLeagueWebsite, setSavedLeagueWebsite] = useState("");
  const [welcomeEmailPreviewTeamId, setWelcomeEmailPreviewTeamId] = useState("");
  const [welcomeEmailPreviewOpen, setWelcomeEmailPreviewOpen] = useState(false);
  const [welcomeEmailPreviewLoading, setWelcomeEmailPreviewLoading] = useState(false);
  const [welcomeEmailPreviewError, setWelcomeEmailPreviewError] = useState("");
  const [welcomeEmailPreviewSubject, setWelcomeEmailPreviewSubject] = useState("");
  const [welcomeEmailPreviewText, setWelcomeEmailPreviewText] = useState("");
  const [welcomeEmailPreviewSample, setWelcomeEmailPreviewSample] = useState<{
    leagueName: string;
    fullName: string;
    email: string;
    username: string;
    temporaryPassword: string;
    signInUrl: string;
    myWrestlersUrl: string;
    coachName: string;
    coachEmail: string;
    teamLabel: string;
    linkedWrestlerNames: string[];
    passwordInstructions: string;
  } | null>(null);
  const [ageAllowancePctPerYear, setAgeAllowancePctPerYear] = useState(0.5);
  const [savedAgeAllowancePctPerYear, setSavedAgeAllowancePctPerYear] = useState(0.5);
  const [experienceAllowancePctPerYear, setExperienceAllowancePctPerYear] = useState(0.25);
  const [savedExperienceAllowancePctPerYear, setSavedExperienceAllowancePctPerYear] = useState(0.25);
  const [skillAllowancePctPerPoint, setSkillAllowancePctPerPoint] = useState(0.4);
  const [savedSkillAllowancePctPerPoint, setSavedSkillAllowancePctPerPoint] = useState(0.4);
  const [maxAgeGapYears, setMaxAgeGapYears] = useState(1);
  const [savedMaxAgeGapYears, setSavedMaxAgeGapYears] = useState(1);
  const [maxWeightDiffPct, setMaxWeightDiffPct] = useState(10);
  const [savedMaxWeightDiffPct, setSavedMaxWeightDiffPct] = useState(10);
  const [leagueStats, setLeagueStats] = useState<{
    teamCount: number;
    activeWrestlers: number;
    inactiveWrestlers: number;
    totalWrestlers: number;
    totalGirls: number;
  } | null>(null);
  const [colorEdits, setColorEdits] = useState<Record<string, string>>({});
  const [teamNameEdits, setTeamNameEdits] = useState<Record<string, string | undefined>>({});
  const [teamSymbolEdits, setTeamSymbolEdits] = useState<Record<string, string | undefined>>({});
  const [teamHeadCoachEdits, setTeamHeadCoachEdits] = useState<Record<string, string | undefined>>({});
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [leagueLogoVersion, setLeagueLogoVersion] = useState(0);
  const [teamLogoVersions, setTeamLogoVersions] = useState<Record<string, number>>({});
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [pendingDeleteTeam, setPendingDeleteTeam] = useState<TeamRow | null>(null);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importConfirm, setImportConfirm] = useState("");
  const [importError, setImportError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const leagueIdentitySaveInFlight = useRef(false);
  const pairingsSaveInFlight = useRef(false);
  const latestLeagueIdentityRef = useRef({
    dirty: false,
    name: "",
    website: "",
  });
  const latestPairingsRef = useRef({
    dirty: false,
    ageAllowancePctPerYear: 0.5,
    experienceAllowancePctPerYear: 0.25,
    skillAllowancePctPerPoint: 0.4,
    maxAgeGapYears: 1,
    maxWeightDiffPct: 10,
  });

  async function load() {
    setIsLoading(true);
    try {
      const [tRes, lRes, sRes] = await Promise.all([
        fetch("/api/teams"),
        fetch("/api/league"),
        fetch("/api/league/stats"),
      ]);
      if (tRes.ok) {
        const loadedTeams = await tRes.json();
        setTeams(Array.isArray(loadedTeams) ? [...loadedTeams].sort(compareTeamRows) : []);
      }
      if (lRes.ok) {
        const league = await lRes.json();
        const nextLeagueName = league.name ?? "";
        const nextLeagueWebsite = league.website ?? "";
        setLeagueName(nextLeagueName);
        setSavedLeagueName(nextLeagueName);
        setLeagueHasLogo(Boolean(league.hasLogo));
        setLeagueWebsite(nextLeagueWebsite);
        setSavedLeagueWebsite(nextLeagueWebsite);
        if (typeof league.ageAllowancePctPerYear === "number") {
          setAgeAllowancePctPerYear(league.ageAllowancePctPerYear);
          setSavedAgeAllowancePctPerYear(league.ageAllowancePctPerYear);
        }
        if (typeof league.experienceAllowancePctPerYear === "number") {
          setExperienceAllowancePctPerYear(league.experienceAllowancePctPerYear);
          setSavedExperienceAllowancePctPerYear(league.experienceAllowancePctPerYear);
        }
        if (typeof league.skillAllowancePctPerPoint === "number") {
          setSkillAllowancePctPerPoint(league.skillAllowancePctPerPoint);
          setSavedSkillAllowancePctPerPoint(league.skillAllowancePctPerPoint);
        }
        if (typeof league.maxAgeGapYears === "number") {
          setMaxAgeGapYears(league.maxAgeGapYears);
          setSavedMaxAgeGapYears(league.maxAgeGapYears);
        }
        if (typeof league.maxWeightDiffPct === "number") {
          setMaxWeightDiffPct(league.maxWeightDiffPct);
          setSavedMaxWeightDiffPct(league.maxWeightDiffPct);
        }
      }
      if (sRes.ok) {
        setLeagueStats(await sRes.json());
      }
    } finally {
      setIsLoading(false);
    }
  }

  function resetAddTeamForm() {
    setName("");
    setSymbol("");
    setNewTeamColor("#000000");
    setNewTeamLogoFile(null);
  }

  async function addTeam() {
    setMsg("");
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim();
    if (!cleanName || !cleanSymbol) return;
    setIsCreatingTeam(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, symbol: cleanSymbol, color: newTeamColor }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const error = payload?.error;
        setMsg(error ?? "Unable to add team. Check the name and symbol, then try again.");
        return;
      }

      const teamId = String(payload?.id ?? "");
      const warnings: string[] = [];

      if (teamId && newTeamLogoFile) {
        const logoError = await uploadLogo(teamId, newTeamLogoFile, false);
        if (logoError) {
          warnings.push(`Logo not uploaded: ${logoError}`);
        }
      }

      resetAddTeamForm();
      setShowAddTeamModal(false);
      await load();
      setMsg(warnings.length > 0 ? `Team created. ${warnings.join(" ")}` : "Team created.");
    } catch {
      setMsg("Unable to add team. Check the name and symbol, then try again.");
    } finally {
      setIsCreatingTeam(false);
    }
  }

  async function removeTeam(teamId: string) {
    setMsg("");
    setIsDeletingTeam(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (!res.ok) {
        setMsg("Unable to delete team.");
        return;
      }
      setPendingDeleteTeam(null);
      setMsg("Team removed.");
      await load();
    } finally {
      setIsDeletingTeam(false);
    }
  }

  async function uploadLogo(teamId: string, file: File | null, reload = true) {
    if (!file) return null;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/teams/${teamId}/logo`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = (json as { error?: string }).error;
      if (reload) {
        setMsg(error ?? "Logo upload failed.");
      }
      return error ?? "Logo upload failed.";
    }
    setTeamLogoVersions((prev) => ({ ...prev, [teamId]: Date.now() }));
    if (reload) {
      await load();
    }
    return null;
  }

  async function updateTeamDetails(teamId: string, name: string, symbol: string, color: string, headCoachId: string | null) {
    setSavingTeamId(teamId);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol, color, headCoachId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const error = (json as { error?: string }).error;
        setMsg(error ?? "Unable to update team.");
        return;
      }
      setTeamNameEdits((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
      setTeamSymbolEdits((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
      setTeamHeadCoachEdits((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
      setColorEdits((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
      setEditingTeamId(null);
      await load();
    } finally {
      setSavingTeamId(null);
    }
  }

  function getTeamName(team: TeamRow) {
    return teamNameEdits[team.id] ?? team.name;
  }

  function getTeamSymbol(team: TeamRow) {
    return teamSymbolEdits[team.id] ?? team.symbol;
  }

  function getTeamHeadCoachId(team: TeamRow) {
    return teamHeadCoachEdits[team.id] ?? team.headCoachId ?? "";
  }

  function normalizeHeadCoachId(value: string | null | undefined) {
    if (!value) return "";
    return value.trim();
  }

  function normalizeTeamSymbolInput(value: string) {
    return value.toUpperCase().slice(0, 4);
  }

  function startEditingTeam(team: TeamRow) {
    setMsg("");
    setEditingTeamId(team.id);
    setTeamNameEdits((prev) => ({ ...prev, [team.id]: team.name }));
    setTeamSymbolEdits((prev) => ({ ...prev, [team.id]: team.symbol }));
    setTeamHeadCoachEdits((prev) => ({ ...prev, [team.id]: team.headCoachId ?? "" }));
    setColorEdits((prev) => ({ ...prev, [team.id]: team.color }));
  }

  function stopEditingTeam(teamId: string) {
    setEditingTeamId((current) => (current === teamId ? null : current));
    setTeamNameEdits((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setTeamSymbolEdits((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setTeamHeadCoachEdits((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setColorEdits((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
  }

  function parseAllowance(value: string, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(2, Math.max(0, parsed));
  }

  function parseGap(value: string, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  async function saveLeagueIdentity(
    nextName = leagueName,
    nextWebsite = leagueWebsite,
  ) {
    const leagueRes = await fetch("/api/league", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        website: nextWebsite,
      }),
    });
    if (!leagueRes.ok) {
      setMsg("Unable to save league.");
      return;
    }
    setSavedLeagueName(nextName);
    setSavedLeagueWebsite(nextWebsite);
  }

  async function openWelcomeEmailPreview() {
    setWelcomeEmailPreviewLoading(true);
    setWelcomeEmailPreviewError("");
    try {
      const res = await fetch("/api/admin/welcome-email-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: welcomeEmailPreviewTeamId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setWelcomeEmailPreviewError(typeof data?.error === "string" ? data.error : "Unable to build welcome email preview.");
        return;
      }
      setWelcomeEmailPreviewSubject(typeof data?.subject === "string" ? data.subject : "");
      setWelcomeEmailPreviewText(typeof data?.text === "string" ? data.text : "");
      setWelcomeEmailPreviewSample(data?.sampleData ?? null);
      setWelcomeEmailPreviewOpen(true);
    } catch {
      setWelcomeEmailPreviewError("Unable to build welcome email preview.");
    } finally {
      setWelcomeEmailPreviewLoading(false);
    }
  }

  function closeWelcomeEmailPreview() {
    setWelcomeEmailPreviewOpen(false);
    setWelcomeEmailPreviewError("");
  }

  async function savePairingsSettings(
    nextAgeAllowance = ageAllowancePctPerYear,
    nextExperienceAllowance = experienceAllowancePctPerYear,
    nextSkillAllowance = skillAllowancePctPerPoint,
    nextMaxAgeGapYears = maxAgeGapYears,
    nextMaxWeightDiffPct = maxWeightDiffPct,
  ) {
    const leagueRes = await fetch("/api/league", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ageAllowancePctPerYear: nextAgeAllowance,
        experienceAllowancePctPerYear: nextExperienceAllowance,
        skillAllowancePctPerPoint: nextSkillAllowance,
        maxAgeGapYears: nextMaxAgeGapYears,
        maxWeightDiffPct: nextMaxWeightDiffPct,
      }),
    });
    if (!leagueRes.ok) {
      setMsg("Unable to save league.");
      return;
    }
    setSavedAgeAllowancePctPerYear(nextAgeAllowance);
    setSavedExperienceAllowancePctPerYear(nextExperienceAllowance);
    setSavedSkillAllowancePctPerPoint(nextSkillAllowance);
    setSavedMaxAgeGapYears(nextMaxAgeGapYears);
    setSavedMaxWeightDiffPct(nextMaxWeightDiffPct);
  }

  async function uploadLeagueLogo(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/league/logo", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = (json as { error?: string }).error;
      setMsg(error ?? "League logo upload failed.");
      return;
    }
    setLeagueLogoVersion(Date.now());
    await load();
  }

  function commitTeamDetails(teamId: string, name: string, symbol: string, color: string, headCoachId: string | null) {
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim();
    if (cleanName.length < 2 || cleanSymbol.length < 2 || cleanSymbol.length > 4 || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      setMsg("Team name must be at least 2 characters, symbol must be 2-4 characters, and color must be valid.");
      return;
    }
    void updateTeamDetails(teamId, cleanName, cleanSymbol, color, headCoachId);
  }

  function closeResetModal() {
    setShowResetModal(false);
    setResetConfirm("");
    setResetError("");
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportConfirm("");
    setImportError("");
    setImportFile(null);
  }

  function closeAddTeamModal() {
    if (isCreatingTeam) return;
    setShowAddTeamModal(false);
    resetAddTeamForm();
  }

  function closeDeleteTeamModal() {
    if (isDeletingTeam) return;
    setPendingDeleteTeam(null);
  }

  async function confirmYearlyReset() {
    if (resetConfirm.trim().toUpperCase() !== "RESET") {
      setResetError('Type "RESET" to confirm.');
      return;
    }
    setIsResetting(true);
    setResetError("");
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const error = (json as { error?: string }).error;
        throw new Error(error ?? "Unable to reset league data.");
      }
      await load();
      setMsg("League data cleared for the new year.");
      closeResetModal();
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Unable to reset league data.");
    } finally {
      setIsResetting(false);
    }
  }

  async function exportTeamsAndRosters() {
    setMsg("");
    setIsExporting(true);
    try {
      const res = await fetch("/api/admin/export/teams");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to export teams.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const safeLeague = (leagueName || "league").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 48);
      anchor.href = url;
      anchor.download = `${safeLeague}_${stamp}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to export teams.");
    } finally {
      setIsExporting(false);
    }
  }

  async function importTeamsAndRosters(file: File | null) {
    if (!file) {
      setImportError("Choose a zip file to import.");
      return;
    }
    setMsg("");
    setIsImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/import/teams", { method: "POST", body: form });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Unable to import teams.");
      }
      await load();
      setMsg("Import complete.");
      closeImportModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import teams.";
      setImportError(message);
      setMsg(message);
    } finally {
      setIsImporting(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!showResetModal) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isResetting) {
        closeResetModal();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [showResetModal, isResetting]);

  const editingTeam = editingTeamId ? teams.find((team) => team.id === editingTeamId) ?? null : null;
  const leagueIdentityDirty =
    leagueName !== savedLeagueName ||
    leagueWebsite !== savedLeagueWebsite;
  const pairingsSettingsDirty =
    ageAllowancePctPerYear !== savedAgeAllowancePctPerYear ||
    experienceAllowancePctPerYear !== savedExperienceAllowancePctPerYear ||
    skillAllowancePctPerPoint !== savedSkillAllowancePctPerPoint ||
    maxAgeGapYears !== savedMaxAgeGapYears ||
    maxWeightDiffPct !== savedMaxWeightDiffPct;
  const normalizedNewTeamSymbol = symbol.trim().toUpperCase();
  const isNewTeamSymbolLengthValid = normalizedNewTeamSymbol.length >= 2 && normalizedNewTeamSymbol.length <= 4;
  const isNewTeamSymbolTaken = normalizedNewTeamSymbol.length > 0 && teams.some((team) => team.symbol.trim().toUpperCase() === normalizedNewTeamSymbol);
  const normalizedEditingTeamSymbol = editingTeam ? getTeamSymbol(editingTeam).trim().toUpperCase() : "";
  const canSaveEditingTeam = Boolean(
    editingTeam &&
    getTeamName(editingTeam).trim().length >= 2 &&
    normalizedEditingTeamSymbol.length >= 2 &&
    normalizedEditingTeamSymbol.length <= 4 &&
    savingTeamId !== editingTeam.id
  );
  const adminOverlayStyle = { zIndex: 11000 } as const;
  const adminModalStyle = { position: "relative" as const, zIndex: 11001 };

  useEffect(() => {
    latestLeagueIdentityRef.current = {
      dirty: leagueIdentityDirty,
      name: leagueName,
      website: leagueWebsite,
    };
  }, [
    leagueIdentityDirty,
    leagueName,
    leagueWebsite,
  ]);

  useEffect(() => {
    latestPairingsRef.current = {
      dirty: pairingsSettingsDirty,
      ageAllowancePctPerYear,
      experienceAllowancePctPerYear,
      skillAllowancePctPerPoint,
      maxAgeGapYears,
      maxWeightDiffPct,
    };
  }, [
    pairingsSettingsDirty,
    ageAllowancePctPerYear,
    experienceAllowancePctPerYear,
    skillAllowancePctPerPoint,
    maxAgeGapYears,
    maxWeightDiffPct,
  ]);

  useEffect(() => {
    if (view !== "league") return;

    const flushLeagueIdentitySave = () => {
      if (!leagueIdentityDirty || leagueIdentitySaveInFlight.current) {
        return;
      }
      leagueIdentitySaveInFlight.current = true;
      void saveLeagueIdentity(
        leagueName,
        leagueWebsite,
      ).finally(() => {
        leagueIdentitySaveInFlight.current = false;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushLeagueIdentitySave();
      }
    };

    window.addEventListener("blur", flushLeagueIdentitySave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", flushLeagueIdentitySave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    view,
    leagueIdentityDirty,
    leagueName,
    leagueWebsite,
  ]);

  useEffect(() => {
    if (view !== "pairings") return;

    const flushPairingsSave = () => {
      if (!pairingsSettingsDirty || pairingsSaveInFlight.current) {
        return;
      }
      pairingsSaveInFlight.current = true;
      void savePairingsSettings(
        ageAllowancePctPerYear,
        experienceAllowancePctPerYear,
        skillAllowancePctPerPoint,
        maxAgeGapYears,
        maxWeightDiffPct,
      ).finally(() => {
        pairingsSaveInFlight.current = false;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPairingsSave();
      }
    };

    window.addEventListener("blur", flushPairingsSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", flushPairingsSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    view,
    pairingsSettingsDirty,
    ageAllowancePctPerYear,
    experienceAllowancePctPerYear,
    skillAllowancePctPerPoint,
    maxAgeGapYears,
    maxWeightDiffPct,
  ]);

  useEffect(() => {
    return () => {
      if (view === "league") {
        const latestLeagueIdentity = latestLeagueIdentityRef.current;
        if (latestLeagueIdentity.dirty && !leagueIdentitySaveInFlight.current) {
          leagueIdentitySaveInFlight.current = true;
          void saveLeagueIdentity(
            latestLeagueIdentity.name,
            latestLeagueIdentity.website,
          ).finally(() => {
            leagueIdentitySaveInFlight.current = false;
          });
        }
      }

      if (view === "pairings") {
        const latestPairings = latestPairingsRef.current;
        if (latestPairings.dirty && !pairingsSaveInFlight.current) {
          pairingsSaveInFlight.current = true;
          void savePairingsSettings(
            latestPairings.ageAllowancePctPerYear,
            latestPairings.experienceAllowancePctPerYear,
            latestPairings.skillAllowancePctPerPoint,
            latestPairings.maxAgeGapYears,
            latestPairings.maxWeightDiffPct,
          ).finally(() => {
            pairingsSaveInFlight.current = false;
          });
        }
      }
    };
  }, [view]);

  return (
    <>
      {view === "league" && (
      <div className="admin-card" style={{ width: "min(980px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>League</h3>
          <button
            type="button"
            className="admin-btn admin-btn-danger"
            onClick={() => {
              setShowResetModal(true);
              setResetConfirm("");
              setResetError("");
            }}
          >
            Reset For New Year
          </button>
        </div>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-name">
              League Name
            </label>
            <input
              id="league-name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              placeholder="League name"
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-website">
              League Website
            </label>
            <input
              id="league-website"
              value={leagueWebsite}
              onChange={(e) => setLeagueWebsite(e.target.value)}
              placeholder="https://league.example.com"
            />
          </div>
          <div className="admin-field" style={{ gridColumn: "1 / -1" }}>
            <div className="admin-label">Welcome Email</div>
            <div className="admin-muted" style={{ marginTop: 6 }}>
              Subject line: Welcome to the {leagueName || "league"} meet scheduling app for the selected team.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              <select
                value={welcomeEmailPreviewTeamId}
                onChange={(e) => setWelcomeEmailPreviewTeamId(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">Preview without team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {formatTeamName(team)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  void openWelcomeEmailPreview();
                }}
                disabled={welcomeEmailPreviewLoading}
              >
                {welcomeEmailPreviewLoading ? "Building Preview..." : "Preview Welcome Email"}
              </button>
            </div>
            {welcomeEmailPreviewError && (
              <div className="admin-muted" style={{ color: "#b00020", marginTop: 8 }}>
                {welcomeEmailPreviewError}
              </div>
            )}
          </div>
          <div className="admin-field admin-row-tight">
            <span className="admin-label">League Logo</span>
            <div className="logo-row" style={{ alignItems: "center", gap: 12 }}>
              <div className="logo-cell" style={{ marginRight: "auto" }}>
                <input
                  id="league-logo-file"
                  className="file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
                  onChange={(e) => {
                    void uploadLeagueLogo(e.target.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                />
                <label className="logo-button" htmlFor="league-logo-file">
                  {leagueHasLogo ? (
                    <img src={`/api/league/logo/file?v=${leagueLogoVersion}`} alt="League logo" className="admin-logo" />
                  ) : (
                    <span className="admin-muted">Set Logo</span>
                  )}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {view === "pairings" && (
      <div className="admin-card">
        <h3>Automatic pairings</h3>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-max-age-gap-years">
              Maximum difference between wrestler ages (years)
            </label>
            <input
              id="league-max-age-gap-years"
              type="number"
              min={0.5}
              max={2.5}
              step={0.1}
              value={maxAgeGapYears}
              style={{ width: 120 }}
              onChange={(e) => {
                const next = parseGap(e.target.value, maxAgeGapYears, 0.5, 2.5);
                setMaxAgeGapYears(next);
              }}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-max-weight-diff-pct">
              Maximum difference between wrestler weights (%)
            </label>
            <input
              id="league-max-weight-diff-pct"
              type="number"
              min={7.5}
              max={15}
              step={0.1}
              value={maxWeightDiffPct}
              style={{ width: 120 }}
              onChange={(e) => {
                const next = parseGap(e.target.value, maxWeightDiffPct, 7.5, 15);
                setMaxWeightDiffPct(next);
              }}
            />
          </div>
        </div>
      </div>
      )}

      {view === "pairings" && (
      <div className="admin-card">
        <h3>Pairings fairness</h3>
        <div className="admin-muted" style={{ marginTop: 4, fontSize: 15 }}>
          For potential pairings, fairness is measured by computing the weight difference % between the two wrestlers, and then biasing that value by:
        </div>
        <div className="admin-muted" style={{ fontSize: 16, marginLeft: 12, marginTop: 4, marginBottom: 8 }}>
          Δ = Weight difference % + (age difference × <strong>Age Bias</strong>) + (skill difference × <strong>Skill Bias</strong>) + (experience difference × <strong>Experience Bias</strong>)
        </div>
        <div className="admin-muted" style={{ fontSize: 15, marginBottom: 14 }}>
          If Δ is positive the first wrestler has the advantage; negative means the second wrestler has the advantage.
        </div>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-age-allowance">
              Age Bias (% per year)
            </label>
            <input
              id="league-age-allowance"
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={ageAllowancePctPerYear}
              style={{ width: 120 }}
              onChange={(e) => {
                const next = parseAllowance(e.target.value, ageAllowancePctPerYear);
                setAgeAllowancePctPerYear(next);
              }}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-skill-allowance">
              Skill Bias (% per point)
            </label>
            <input
              id="league-skill-allowance"
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={skillAllowancePctPerPoint}
              style={{ width: 120 }}
              onChange={(e) => {
                const next = parseAllowance(e.target.value, skillAllowancePctPerPoint);
                setSkillAllowancePctPerPoint(next);
              }}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="league-exp-allowance">
              Experience Bias (% per year)
            </label>
            <input
              id="league-exp-allowance"
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={experienceAllowancePctPerYear}
              style={{ width: 120 }}
              onChange={(e) => {
                const next = parseAllowance(e.target.value, experienceAllowancePctPerYear);
                setExperienceAllowancePctPerYear(next);
              }}
            />
          </div>
        </div>
      </div>
      )}
      {view === "teams" && (
      <div className="admin-card" style={{ width: "fit-content", maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Teams</h3>
          {isLoading && (
            <div className="admin-muted" style={{ fontSize: 16, fontWeight: 600 }}>
              Loading...
            </div>
          )}
          {leagueStats && (
            <div className="admin-muted" style={{ fontSize: 16, fontWeight: 600 }}>
              {leagueStats.teamCount} teams | {leagueStats.totalWrestlers} wrestlers ({leagueStats.inactiveWrestlers} inactive) | {leagueStats.totalGirls} girls
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginLeft: "auto", flexWrap: "wrap" }}>
            <button
              type="button"
              className="admin-btn"
              onClick={() => {
                setMsg("");
                resetAddTeamForm();
                setShowAddTeamModal(true);
              }}
            >
              Add New Team
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={exportTeamsAndRosters}
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Export Teams + Rosters"}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              onClick={() => {
                setShowImportModal(true);
                setImportConfirm("");
                setImportError("");
                setImportFile(null);
              }}
            >
              Import Teams + Rosters
            </button>
          </div>
        </div>
        {msg && <div className="admin-error">{msg}</div>}

        <div className="admin-table" style={{ width: "fit-content", maxWidth: "100%" }}>
          <table className="teams-table" cellPadding={0} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ width: 72 }}>Symbol</th>
                <th style={{ width: 72 }}>Logo</th>
                <th style={{ width: 72 }}>Color</th>
                <th>Team</th>
                <th>Head Coach</th>
                <th>Wrestlers</th>
                <th>Girls</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8}>Loading...</td>
                </tr>
              ) : (
                <>
                  {teams.map((t) => (
                    <tr key={t.id}>
                      <td
                        style={{
                          width: 72,
                          whiteSpace: "nowrap",
                          color: adjustTeamTextColor(t.color),
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                      >
                        {t.symbol}
                      </td>
                      <td style={{ width: 72 }}>
                        <div className="logo-cell">
                          {t.hasLogo ? (
                            <img
                              src={`/api/teams/${t.id}/logo/file?v=${teamLogoVersions[t.id] ?? 0}`}
                              alt={`${t.name} logo`}
                              className="admin-team-logo"
                              style={{ width: 32, height: 32 }}
                            />
                          ) : (
                            <span className="admin-muted">No logo</span>
                          )}
                        </div>
                      </td>
                      <td style={{ width: 72 }}>
                        <div className="color-cell">
                          <span
                            aria-label={`${t.name} color ${t.color}`}
                            style={{
                              display: "inline-block",
                              width: 38,
                              height: 24,
                              borderRadius: 4,
                              border: "1px solid var(--line)",
                              backgroundColor: t.color,
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ width: 320, minWidth: 320, maxWidth: 320 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: 1.2,
                            color: adjustTeamTextColor(t.color),
                            fontWeight: 700,
                          }}
                          title={t.name}
                        >
                          {t.name}
                        </div>
                      </td>
                      <td style={{ width: 280, minWidth: 280, maxWidth: 280 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: 1.2,
                          }}
                          title={formatHeadCoachLabel(t)}
                        >
                          {formatHeadCoachLabel(t)}
                        </div>
                      </td>
                      <td>
                        {(t.wrestlerCount ?? 0)}
                        {(t.inactiveWrestlerCount ?? 0) > 0 ? ` (inactive: ${t.inactiveWrestlerCount})` : ""}
                      </td>
                      <td>{t.girlsCount ?? 0}</td>
                      <td style={{ verticalAlign: "middle" }}>
                        <div
                          className="admin-actions"
                          style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                        >
                          <button
                            className="admin-btn admin-btn-ghost teams-action-btn"
                            type="button"
                            onClick={() => startEditingTeam(t)}
                          >
                            Edit
                          </button>
                          <button
                            className="admin-btn admin-btn-danger teams-action-btn"
                            type="button"
                            onClick={() => setPendingDeleteTeam(t)}
                          >
                            Delete Team
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {teams.length === 0 && (
                    <tr>
                      <td colSpan={8}>No teams yet.</td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {showAddTeamModal && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={() => closeAddTeamModal()}
          style={adminOverlayStyle}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-team-title"
            onClick={(event) => event.stopPropagation()}
            style={adminModalStyle}
          >
            <h4 id="add-team-title">Add New Team</h4>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Team name"
                autoFocus
                disabled={isCreatingTeam}
              />
              <input
                value={symbol}
                onChange={(e) => setSymbol(normalizeTeamSymbolInput(e.target.value))}
                placeholder="Symbol (2-4)"
                className="admin-input-sm"
                maxLength={4}
                disabled={isCreatingTeam}
              />
              {!isNewTeamSymbolTaken && normalizedNewTeamSymbol.length > 0 && !isNewTeamSymbolLengthValid && (
                <div className="admin-muted" style={{ color: "#b00020", marginTop: -4 }}>
                  Symbol must be 2-4 characters.
                </div>
              )}
              {isNewTeamSymbolTaken && (
                <div className="admin-muted" style={{ color: "#b00020", marginTop: -4 }}>
                  That symbol is already in use.
                </div>
              )}
              <div className="color-cell">
                <div className="admin-muted" style={{ marginBottom: 6 }}>Team Color</div>
                <ColorPicker
                  value={newTeamColor}
                  onChange={setNewTeamColor}
                  idPrefix="new-team-color"
                  buttonClassName="color-swatch"
                  buttonStyle={{ backgroundColor: newTeamColor }}
                  buttonAriaLabel="Choose color for new team"
                  showNativeColorInput
                />
              </div>
              <div>
                <div className="admin-muted" style={{ marginBottom: 6 }}>Logo</div>
                <input
                  className="reset-confirm-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
                  onChange={(e) => setNewTeamLogoFile(e.target.files?.[0] ?? null)}
                  disabled={isCreatingTeam}
                />
              </div>
            </div>
            <div className="reset-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={closeAddTeamModal}
                disabled={isCreatingTeam}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => void addTeam()}
                disabled={!name.trim() || !isNewTeamSymbolLengthValid || isNewTeamSymbolTaken || isCreatingTeam}
              >
                {isCreatingTeam ? "Creating..." : "Add Team"}
              </button>
            </div>
          </div>
        </div>
      )}
      {editingTeam && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={() => {
            if (savingTeamId === editingTeam.id) return;
            stopEditingTeam(editingTeam.id);
          }}
          style={adminOverlayStyle}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-team-title"
            onClick={(event) => event.stopPropagation()}
            style={adminModalStyle}
          >
            <h4 id="edit-team-title">Edit Team</h4>
            <div style={{ display: "grid", gap: 12 }}>
              <div className="logo-cell" style={{ justifyContent: "center" }}>
                <input
                  id={`team-logo-file-${editingTeam.id}`}
                  className="file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
                  onChange={(e) => {
                    void uploadLogo(editingTeam.id, e.target.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                  disabled={savingTeamId === editingTeam.id}
                />
                <label className="logo-button" htmlFor={`team-logo-file-${editingTeam.id}`}>
                  {editingTeam.hasLogo ? (
                    <img
                      src={`/api/teams/${editingTeam.id}/logo/file?v=${teamLogoVersions[editingTeam.id] ?? 0}`}
                      alt={`${editingTeam.name} logo`}
                      className="admin-team-logo"
                    />
                  ) : (
                    <span className="admin-muted">Set Logo</span>
                  )}
                </label>
              </div>
              <input
                value={getTeamName(editingTeam)}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setTeamNameEdits((prev) => ({ ...prev, [editingTeam.id]: nextName }));
                }}
                placeholder="Team name"
                disabled={savingTeamId === editingTeam.id}
              />
              <input
                value={getTeamSymbol(editingTeam)}
                onChange={(e) => {
                  const nextSymbol = normalizeTeamSymbolInput(e.target.value);
                  setTeamSymbolEdits((prev) => ({ ...prev, [editingTeam.id]: nextSymbol }));
                }}
                placeholder="Symbol (2-4)"
                className="admin-input-sm"
                maxLength={4}
                disabled={savingTeamId === editingTeam.id}
              />
              {normalizedEditingTeamSymbol.length > 0 && (normalizedEditingTeamSymbol.length < 2 || normalizedEditingTeamSymbol.length > 4) && (
                <div className="admin-muted" style={{ color: "#b00020", marginTop: -4 }}>
                  Symbol must be 2-4 characters.
                </div>
              )}
              <div className="color-cell">
                <div className="admin-muted" style={{ marginBottom: 6 }}>Team Color</div>
                <ColorPicker
                  value={colorEdits[editingTeam.id] ?? editingTeam.color}
                  onChange={(next) => setColorEdits((prev) => ({ ...prev, [editingTeam.id]: next }))}
                  idPrefix={`team-color-${editingTeam.id}`}
                  buttonClassName="color-swatch"
                  buttonStyle={{ backgroundColor: colorEdits[editingTeam.id] ?? editingTeam.color }}
                  buttonAriaLabel={`Choose color for ${editingTeam.name}`}
                  showNativeColorInput
                />
              </div>
              <div>
                <div className="admin-muted" style={{ marginBottom: 6 }}>Head Coach</div>
                <select
                  value={getTeamHeadCoachId(editingTeam)}
                  onChange={(e) => {
                    const nextHeadCoachId = e.target.value;
                    setTeamHeadCoachEdits((prev) => ({ ...prev, [editingTeam.id]: nextHeadCoachId }));
                  }}
                  disabled={savingTeamId === editingTeam.id}
                >
                  <option value="">Select head coach</option>
                  {editingTeam.coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.username}
                    </option>
                  ))}
                  {editingTeam.headCoach && !editingTeam.coaches.some((coach) => coach.id === editingTeam.headCoach?.id) && (
                    <option value={editingTeam.headCoach.id}>{editingTeam.headCoach.username}</option>
                  )}
                </select>
                {!editingTeam.coaches.length && (
                  <div className="admin-muted" style={{ marginTop: 4 }}>
                    No coaches assigned yet.
                  </div>
                )}
              </div>
            </div>
            <div className="reset-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={() => stopEditingTeam(editingTeam.id)}
                disabled={savingTeamId === editingTeam.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  commitTeamDetails(
                    editingTeam.id,
                    getTeamName(editingTeam),
                    getTeamSymbol(editingTeam),
                    colorEdits[editingTeam.id] ?? editingTeam.color,
                    normalizeHeadCoachId(getTeamHeadCoachId(editingTeam)),
                  );
                }}
                disabled={!canSaveEditingTeam}
              >
                {savingTeamId === editingTeam.id ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingDeleteTeam && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={closeDeleteTeamModal}
          style={adminOverlayStyle}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-team-title"
            onClick={(event) => event.stopPropagation()}
            style={{ ...adminModalStyle, maxWidth: 680, width: "100%" }}
          >
            <h4
              id="delete-team-title"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                margin: 0,
              }}
            >
              <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <span>Delete team:</span>
                <span
                  style={{
                    color: adjustTeamTextColor(pendingDeleteTeam.color),
                    fontWeight: 700,
                    lineHeight: 1.2,
                    overflowWrap: "anywhere",
                  }}
                >
                  {`${pendingDeleteTeam.name} - ${pendingDeleteTeam.symbol}`}
                </span>
              </span>
              {pendingDeleteTeam.hasLogo ? (
                <img
                  src={`/api/teams/${pendingDeleteTeam.id}/logo/file?v=${teamLogoVersions[pendingDeleteTeam.id] ?? 0}`}
                  alt={`${pendingDeleteTeam.name} logo`}
                  className="admin-team-logo"
                  style={{ width: 88, height: 88, flexShrink: 0 }}
                />
              ) : null}
            </h4>
            <div style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
              <p className="reset-message" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                This will permanently delete this team and all related data.
              </p>
            </div>
            <div className="reset-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={closeDeleteTeamModal}
                disabled={isDeletingTeam}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={() => void removeTeam(pendingDeleteTeam.id)}
                disabled={isDeletingTeam}
              >
                {isDeletingTeam ? "Deleting..." : "Delete Team"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showResetModal && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={() => {
            if (isResetting) return;
            closeResetModal();
          }}
          style={adminOverlayStyle}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onClick={(event) => event.stopPropagation()}
            style={adminModalStyle}
          >
            <h4 id="reset-title">Reset For New Year</h4>
            <p className="reset-message">
              This will permanently delete every meet, clear all team rosters, and delete every account except admins and coaches.
            </p>
            <p className="reset-message">
              Type{" "}
              <span className="reset-confirm-term">
                RESET
              </span>{" "}
              to confirm.
            </p>
            <input
              className="reset-confirm-input"
              placeholder="Type RESET to confirm"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              disabled={isResetting}
            />
            {resetError && <div className="reset-error">{resetError}</div>}
            <div className="reset-actions">
              <button type="button" className="admin-btn admin-btn-ghost" onClick={closeResetModal} disabled={isResetting}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={confirmYearlyReset}
                disabled={isResetting || resetConfirm.trim().toUpperCase() !== "RESET"}
              >
                {isResetting ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showImportModal && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={() => {
            if (isImporting) return;
            closeImportModal();
          }}
          style={adminOverlayStyle}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
            onClick={(event) => event.stopPropagation()}
            style={adminModalStyle}
          >
            <h4 id="import-title">Import Teams + Rosters</h4>
            <p className="reset-message">
              This will clear all existing rosters before importing the zip.
            </p>
            <p className="reset-message">
              Type{" "}
              <span className="reset-confirm-term">
                IMPORT
              </span>{" "}
              to confirm.
            </p>
            <input
              className="reset-confirm-input"
              placeholder="Type IMPORT to confirm"
              value={importConfirm}
              onChange={(e) => setImportConfirm(e.target.value)}
              disabled={isImporting}
            />
            <input
              className="reset-confirm-input"
              type="file"
              accept=".zip"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              disabled={isImporting}
            />
            {importError && <div className="reset-error">{importError}</div>}
            <div className="reset-actions">
              <button type="button" className="admin-btn admin-btn-ghost" onClick={closeImportModal} disabled={isImporting}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={() => void importTeamsAndRosters(importFile)}
                disabled={isImporting || importConfirm.trim().toUpperCase() !== "IMPORT"}
              >
                {isImporting ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          </div>
        </div>
      )}
      {welcomeEmailPreviewOpen && (
        <div
          className="reset-overlay"
          role="presentation"
          onClick={closeWelcomeEmailPreview}
          style={adminOverlayStyle}
        >
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-email-preview-title"
            onClick={(event) => event.stopPropagation()}
            style={{ ...adminModalStyle, maxWidth: 860, width: "100%" }}
          >
            <h4 id="welcome-email-preview-title">Welcome Email Preview</h4>
            {welcomeEmailPreviewSample && (
              <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
                <div className="admin-muted">Sample data used for this preview:</div>
                <div className="admin-muted">Full name: {welcomeEmailPreviewSample.fullName}</div>
                <div className="admin-muted">Username: {welcomeEmailPreviewSample.username}</div>
                <div className="admin-muted">Email: {welcomeEmailPreviewSample.email}</div>
                <div className="admin-muted">Temporary password: {welcomeEmailPreviewSample.temporaryPassword}</div>
                <div className="admin-muted">Team: {welcomeEmailPreviewSample.teamLabel || "None selected"}</div>
                <div className="admin-muted">Coach: {welcomeEmailPreviewSample.coachName || "Not assigned"}{welcomeEmailPreviewSample.coachEmail ? ` <${welcomeEmailPreviewSample.coachEmail}>` : ""}</div>
                <div className="admin-muted">
                  Linked wrestlers: {welcomeEmailPreviewSample.linkedWrestlerNames.length > 0 ? welcomeEmailPreviewSample.linkedWrestlerNames.join(", ") : "None"}
                </div>
                <div className="admin-muted">My Wrestlers: {welcomeEmailPreviewSample.myWrestlersUrl}</div>
              </div>
            )}
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div className="admin-label" style={{ marginBottom: 6 }}>Rendered Subject</div>
                <div className="admin-card" style={{ padding: 12, background: "#fff" }}>
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{welcomeEmailPreviewSubject}</div>
                </div>
              </div>
              <div>
                <div className="admin-label" style={{ marginBottom: 6 }}>Rendered Body</div>
                <div className="admin-card" style={{ padding: 12, background: "#fff" }}>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "Consolas, 'Courier New', monospace" }}>
                    {welcomeEmailPreviewText}
                  </pre>
                </div>
              </div>
            </div>
            <div className="reset-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={closeWelcomeEmailPreview}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .teams-table th,
        .teams-table td {
          padding: 4px 6px;
          vertical-align: middle;
          line-height: 1.15;
        }
        .teams-action-btn {
          padding: 5px 10px;
          font-size: 13px;
        }
      `}</style>
    </>
  );
}
