"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";
import NumberInput from "@/components/NumberInput";

type Team = { id: string; name: string; symbol: string; color: string; address?: string | null; hasLogo?: boolean };
type RestartDefaults = {
  name?: string;
  date?: string;
  location?: string | null;
  homeTeamId?: string | null;
  teamIds?: string[];
  restGap?: number;
};
function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextSaturday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  let daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  if (daysUntilSaturday === 0) daysUntilSaturday = 7;
  const nextSaturday = new Date(today);
  nextSaturday.setDate(today.getDate() + daysUntilSaturday);
  return formatLocalDate(nextSaturday);
}

const DEFAULT_DATE = getNextSaturday();

const MIN_MATS = 1;
const MAX_MATS = 10;
const DEFAULT_NUM_MATS = 3;

type Meet = {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  meetTeams: { team: Team }[];
  homeTeamId?: string | null;
  numMats?: number;
  allowSameTeamMatches?: boolean;
  matchesPerWrestler?: number;
  maxMatchesPerWrestler?: number;
  restGap?: number;
  status?: "DRAFT" | "PUBLISHED";
  updatedAt?: string;
  updatedBy?: { username?: string | null } | null;
};

export default function MeetsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [meets, setMeets] = useState<Meet[]>([]);
  const [leagueName, setLeagueName] = useState("Wrestling Scheduler");
  const [leagueHasLogo, setLeagueHasLogo] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(DEFAULT_DATE);
  const [location, setLocation] = useState("");
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [numMats, setNumMats] = useState(DEFAULT_NUM_MATS);
  const [homeTeamMaxMats, setHomeTeamMaxMats] = useState(MAX_MATS);
  const [allowSameTeamMatches, setAllowSameTeamMatches] = useState(false);
  const [matchesPerWrestler, setMatchesPerWrestler] = useState(2);
  const [maxMatchesPerWrestler, setMaxMatchesPerWrestler] = useState(5);
  const [restGap, setRestGap] = useState(6);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingMeet, setEditingMeet] = useState<Meet | null>(null);
  const [deletingMeetId, setDeletingMeetId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    id: string;
    name: string;
    date: string;
  } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasCreateQuery = searchParams.get("create") === "1";
  const restartDefaultsParam = searchParams.get("defaults");
  const hasRestartDefaults = Boolean(restartDefaultsParam);
  const restartDefaults = useMemo<RestartDefaults | null>(() => {
    if (!restartDefaultsParam) return null;
    try {
      return JSON.parse(decodeURIComponent(restartDefaultsParam)) as RestartDefaults;
    } catch {
      return null;
    }
  }, [restartDefaultsParam]);
  const clampNumMatsValue = useCallback(
    (value: number) => Math.max(MIN_MATS, Math.min(homeTeamMaxMats, value)),
    [homeTeamMaxMats],
  );
  const handleNumMatsChange = useCallback(
    (value: number) => {
      const clamped = clampNumMatsValue(Math.round(value));
      setNumMats(clamped);
    },
    [clampNumMatsValue],
  );

  const resetFormFields = useCallback(() => {
    setName("");
    setDate(DEFAULT_DATE);
    setLocation("");
    setTeamIds([]);
    setHomeTeamId("");
    setNumMats(DEFAULT_NUM_MATS);
    setAllowSameTeamMatches(false);
    setMatchesPerWrestler(2);
    setMaxMatchesPerWrestler(5);
    setRestGap(6);
    setEditingMeet(null);
  }, []);

  const closeCreateModal = useCallback((options?: { skipCreateQueryCleanup?: boolean }) => {
    setIsCreateModalOpen(false);
    resetFormFields();
    if (hasCreateQuery && !options?.skipCreateQueryCleanup) {
      router.replace("/meets");
    }
  }, [hasCreateQuery, router, resetFormFields]);
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  async function load() {
    const [t, m, l, me] = await Promise.all([
      fetch("/api/teams"),
      fetch("/api/meets"),
      fetch("/api/league"),
      fetch("/api/me"),
    ]);
    if (t.ok) {
      const tJson = await t.json().catch(() => []);
      setTeams(Array.isArray(tJson) ? tJson : []);
    } else {
      setTeams([]);
    }
    if (m.ok) {
      const mJson = await m.json().catch(() => []);
      const list = Array.isArray(mJson) ? mJson : [];
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMeets(list);
    } else {
      setMeets([]);
    }
    if (l.ok) {
      const lJson = await l.json().catch(() => ({}));
      const name = String(lJson?.name ?? "").trim();
      setLeagueName(name || "Wrestling Scheduler");
      setLeagueHasLogo(Boolean(lJson?.hasLogo));
    }
    if (me.ok) {
      const meJson = await me.json().catch(() => ({}));
      setCurrentTeamId(meJson?.teamId ?? null);
      setRole(meJson?.role ?? null);
    }
  }

  function toggleTeam(id: string) {
    setTeamIds(prev => {
      if (currentTeamId && id === currentTeamId) return prev;
      const has = prev.includes(id);
      if (has) return prev.filter(x => x !== id);
      const otherCount = prev.filter(x => x !== currentTeamId).length;
      if (otherCount >= 3) return prev;
      return [...prev, id];
    });
  }

  const isEditing = Boolean(editingMeet);

  async function addMeet() {
    const res = await fetch("/api/meets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        date,
        location,
        teamIds,
        homeTeamId: homeTeamId || null,
        numMats,
        allowSameTeamMatches,
        matchesPerWrestler,
        maxMatchesPerWrestler,
        restGap,
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const err = payload?.error ?? "Unable to create meet.";
      throw new Error(err);
    }
    await load();
    return payload;
  }

  async function updateMeet(meetId: string) {
    const res = await fetch(`/api/meets/${meetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        date,
        location,
        homeTeamId: homeTeamId || null,
        numMats,
        allowSameTeamMatches,
        matchesPerWrestler,
        maxMatchesPerWrestler,
        restGap,
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const err = payload?.error ?? "Unable to update meet.";
      throw new Error(err);
    }
    await load();
    return payload;
  }

  const handleModalSubmit = async () => {
    try {
      if (editingMeet) {
        await updateMeet(editingMeet.id);
      } else {
        const created = await addMeet();
        if (created?.id) {
          router.push(`/meets/${created.id}`);
        }
      }
      closeCreateModal({ skipCreateQueryCleanup: true });
    } catch (error) {
      console.error(error);
    }
  };

  const deleteMeet = async (id: string) => {
    if (!canManageMeets) return;
    setDeletingMeetId(id);
    try {
      const res = await fetch(`/api/meets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to delete meet.");
      }
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingMeetId(null);
    }
  };

  const openDeleteDialog = (meet: Meet) => {
    setDeleteDialog({ id: meet.id, name: meet.name, date: meet.date });
  };

  const confirmDeleteMeet = async () => {
    if (!deleteDialog) return;
    await deleteMeet(deleteDialog.id);
    setDeleteDialog(null);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (hasCreateQuery) {
      setIsCreateModalOpen(true);
    }
  }, [hasCreateQuery]);

  useEffect(() => {
    if (!restartDefaults) return;
    if (typeof restartDefaults.name === "string") {
      setName(restartDefaults.name);
    }
    if (restartDefaults.date) {
      setDate(restartDefaults.date);
    }
    if (restartDefaults.location !== undefined) {
      setLocation(restartDefaults.location ?? "");
    }
    if (Array.isArray(restartDefaults.teamIds) && restartDefaults.teamIds.length > 0) {
      setTeamIds(restartDefaults.teamIds);
    }
    if (restartDefaults.homeTeamId) {
      setHomeTeamId(restartDefaults.homeTeamId);
    }
    if (typeof restartDefaults.restGap === "number") {
      setRestGap(Math.max(0, Math.round(restartDefaults.restGap)));
    }
  }, [restartDefaults]);
  useEffect(() => {
    setHomeTeamId((prev) => {
      if (currentTeamId) return currentTeamId;
      if (prev && teamIds.includes(prev)) return prev;
      return teamIds[0] ?? "";
    });
  }, [teamIds, currentTeamId]);
  useEffect(() => {
    if (!currentTeamId) return;
    setTeamIds(prev => (prev.includes(currentTeamId) ? prev : [currentTeamId, ...prev]));
    if (!hasRestartDefaults) {
      setHomeTeamId(currentTeamId);
    }
  }, [currentTeamId, hasRestartDefaults]);

  const otherTeams = currentTeamId
    ? teams.filter(t => t.id !== currentTeamId)
    : teams;
  const otherTeamIds = currentTeamId
    ? teamIds.filter(id => id !== currentTeamId)
    : teamIds;
  const canManageMeets = role === "COACH" || role === "ADMIN";
  const selectedTeam = teams.find(t => t.id === currentTeamId) ?? null;
  const headerTeamName = selectedTeam?.name ?? "Your Team";
  const modalTitle = isEditing ? `Edit Meet: ${editingMeet?.name ?? ""}` : `Create New Meet For ${headerTeamName}`;
  const submitLabel = isEditing ? "Save Changes" : "Create Meet";
  const visibleMeets = useMemo(() => {
    if (role !== "COACH") return meets;
    if (!currentTeamId) return meets;
    return meets.filter(m => m.meetTeams.some(mt => mt.team.id === currentTeamId));
  }, [meets, role, currentTeamId]);
  useEffect(() => {
    if (!homeTeamId || hasRestartDefaults) return;
    if (location.trim()) return;
    const home = teams.find(t => t.id === homeTeamId);
    if (home?.address) setLocation(home.address);
  }, [homeTeamId, teams, location, hasRestartDefaults]);

  useEffect(() => {
    if (!homeTeamId) {
      if (!hasRestartDefaults) {
        setLocation("");
      }
      setHomeTeamMaxMats(MAX_MATS);
      setNumMats(DEFAULT_NUM_MATS);
      return;
    }
    let didCancel = false;
    const fetchMatDefaults = async () => {
      try {
        const res = await fetch(`/api/teams/${homeTeamId}/mat-rules`);
        if (!res.ok) return;
          const payload = await res.json().catch(() => null);
          if (didCancel) return;
          const raw = payload && typeof payload.numMats === "number" ? payload.numMats : DEFAULT_NUM_MATS;
          const clamped = Math.max(MIN_MATS, Math.min(MAX_MATS, raw));
          setHomeTeamMaxMats(clamped);
          setNumMats(clamped);
          if (!hasRestartDefaults) {
            if (typeof payload?.defaultMaxMatchesPerWrestler === "number") {
              setMaxMatchesPerWrestler(Math.max(1, Math.min(5, Math.round(payload.defaultMaxMatchesPerWrestler))));
            }
            if (typeof payload?.defaultRestGap === "number") {
              setRestGap(Math.max(0, Math.min(20, Math.round(payload.defaultRestGap))));
            }
          }
        } catch {
          // ignore
        }
      };
    void fetchMatDefaults();
    return () => {
      didCancel = true;
    };
  }, [homeTeamId, hasRestartDefaults]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCreateModal();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isCreateModalOpen, closeCreateModal]);

  return (
    <main className="meets">
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
        .meets {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .mast {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 14px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }
        .mast-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
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
        .team-head {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .team-head.meets-team-head {
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 6px 10px;
          background: #fff;
          gap: 10px;
          width: 100%;
        }
        .team-logo {
          width: 40px;
          height: 40px;
          object-fit: contain;
          border-radius: 6px;
        }
        .color-dot {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: inline-block;
        }
        .team-meta {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }
        .team-symbol {
          font-weight: 700;
          font-size: 12px;
        }
        .team-name {
          font-weight: 600;
          font-size: 14px;
        }
        .team-name-muted {
          font-weight: 600;
          color: var(--muted);
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }
        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 18px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.08);
        }
        .card-title {
          font-family: "Oswald", Arial, sans-serif;
          margin: 0 0 10px;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .card-title-text {
          flex: 0 1 auto;
        }
        .team-label-slot {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
        }
        .modal-logo {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          object-fit: contain;
          margin-left: 10px;
          vertical-align: middle;
        }
        .modal-logo-dot {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: inline-block;
          margin-left: 10px;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
        }
        .row {
          display: flex;
          gap: 8px;
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
          width: 100%;
        }
        .input-sm {
          width: 80px;
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
        .btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: #f2f5f8;
          color: var(--ink);
          border: 1px solid var(--line);
          font-weight: 600;
        }
        .muted {
          color: var(--muted);
          font-size: 12px;
        }
        .team-box {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px;
          background: #fff;
          max-height: 340px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        @media (min-height: 940px) {
          .team-box {
            max-height: 420px;
          }
        }
        @media (max-height: 720px) {
          .team-box {
            max-height: 180px;
          }
        }
        .team-option {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 0;
          font-size: 13px;
        }
        .meet-list {
          display: grid;
          gap: 10px;
        }
        .meet-item {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 10px 12px;
          background: #fff;
        }
        .meet-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .meet-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .meet-status-inline {
          font-size: 13px;
          color: #5b6472;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .badge {
          font-size: 11px;
          border-radius: 999px;
          padding: 2px 8px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          border: 1px solid var(--line);
          background: #f7f9fb;
        }
        .badge.published {
          background: #e8f4ff;
          border-color: #b5d6f2;
          color: #0d3b66;
        }
        .badge.draft {
          background: #fff4dd;
          border-color: #f2d3a6;
          color: #845400;
        }
        .meet-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(13, 23, 66, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 100;
        }
        .modal {
          background: #fff;
          border-radius: 16px;
          width: min(720px, 100%);
          padding: 26px;
          box-shadow: 0 25px 70px rgba(12, 23, 64, 0.3);
          position: relative;
          max-height: min(98vh, 100vh - 16px);
          min-height: 70vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          flex-shrink: 0;
        }
        .modal-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          margin-top: 16px;
          flex-shrink: 0;
        }
        .delete-modal {
          width: min(520px, 100%);
          min-height: 0;
          padding: 22px;
        }
        .modal-home-team {
          flex: 1;
          min-width: 220px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .modal-action-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .delete-confirm {
          background: #d32f2f;
          border-color: #c62828;
          color: #fff;
        }
        .meet-item a {
          color: var(--accent);
          text-decoration: none;
          font-weight: 700;
        }
        .delete-btn {
          background: #d32f2f;
          border: 1px solid #c62828;
          color: #fff;
        }
        .meet-item-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .meet-item-actions .nav-btn {
          font-size: 12px;
          padding: 6px 12px;
          min-width: 90px;
          text-align: center;
        }
        .meet-item-actions .delete-btn {
          min-width: 100px;
        }
        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <AppHeader links={headerLinks} />
      <header className="mast">
        <div className="brand">
          {leagueHasLogo ? (
            <img className="logo" src="/api/league/logo/file" alt="League logo" />
          ) : null}
          <div>
            <h1 className="title">{leagueName}</h1>
            <div className="tagline">Meets</div>
          </div>
        </div>
        <div className="mast-actions">
          <button
            className="btn"
            type="button"
            onClick={() => {
              resetFormFields();
              if (currentTeamId) {
                setTeamIds([currentTeamId]);
                setHomeTeamId(currentTeamId);
              } else {
                setTeamIds([]);
                setHomeTeamId("");
              }
              setIsCreateModalOpen(true);
            }}
            disabled={!canManageMeets}
          >
            Create New Meet
          </button>
        </div>
      </header>

      <div className="grid">
        <section className="card">
          <h2 className="card-title">Existing Meets</h2>
          <div className="meet-list">
            {visibleMeets.map(m => (
              <div key={m.id} className="meet-item">
                <div className="meet-item-header">
                <div>
                  <div className="meet-title-row">
                    <a href={`/meets/${m.id}`}>{m.name}</a>
                    <span className={`badge ${m.status === "PUBLISHED" ? "published" : "draft"}`}>
                      {m.status === "PUBLISHED" ? "Published" : "Draft"}
                    </span>
                  </div>
                  <div className="muted">
                    - {new Date(m.date).toISOString().slice(0, 10)}
                    {m.location ? ` - ${m.location}` : ""} -{" "}
                    {m.meetTeams.map(mt => mt.team.symbol).join(", ")}
                  </div>
                </div>
                {canManageMeets && (
                  <div className="meet-item-actions">
                    <button
                      className="nav-btn"
                      onClick={() => router.push(`/meets/${m.id}?edit=1`)}
                    >
                      Edit
                    </button>
                    <button
                      className="nav-btn delete-btn"
                      onClick={() => openDeleteDialog(m)}
                      disabled={Boolean(deletingMeetId) && deletingMeetId !== m.id}
                    >
                      Delete
                    </button>
                  </div>
                )}
                </div>
                {m.updatedAt && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Last updated {new Date(m.updatedAt).toLocaleString()} by {m.updatedBy?.username ?? "unknown"}
                  </div>
                )}
              </div>
            ))}
            {meets.length === 0 && <div className="muted">No meets yet.</div>}
          </div>
        </section>
      </div>
      {isCreateModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => closeCreateModal()}>
          <div className="modal" role="document" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {modalTitle}
                {!isEditing && selectedTeam ? (
                  selectedTeam.hasLogo ? (
                    <img
                      src={`/api/teams/${selectedTeam.id}/logo/file`}
                      alt={`${headerTeamName} logo`}
                      className="modal-logo"
                    />
                  ) : (
                    <span className="modal-logo-dot" style={{ backgroundColor: selectedTeam.color ?? "#ddd" }} />
                  )
                ) : null}
              </h3>
            </div>
            <div className="modal-body">
              <div className="row" style={{ marginBottom: 6 }}>
                <input
                  className="input"
                  placeholder="Meet name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!canManageMeets}
                />
              </div>
              <div className="row">
                <label className="row" style={{ flex: "1 1 220px", margin: 0 }}>
                  <span className="muted">Date</span>
                  <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!canManageMeets} />
                </label>
                <label className="row" style={{ flex: "1 1 220px", margin: 0 }}>
                  <span className="muted">Meet Location (optional)</span>
                  <input className="input" placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} disabled={!canManageMeets} />
                </label>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <label className="row">
                  <span className="muted">Number of mats</span>
                  <NumberInput
                    className="input input-sm"
                    min={MIN_MATS}
                    max={homeTeamMaxMats}
                    value={numMats}
                    onValueChange={handleNumMatsChange}
                    normalize={(value) => Math.round(value)}
                    disabled={!canManageMeets}
                  />
                </label>
                  <label className="row">
                    <span className="muted">Target matches per wrestler</span>
                    <NumberInput
                      className="input input-sm"
                      min={1}
                      max={5}
                      value={matchesPerWrestler}
                      onValueChange={(value) => setMatchesPerWrestler(Math.round(value))}
                      normalize={(value) => Math.round(value)}
                      disabled={!canManageMeets}
                    />
                  </label>
                </div>
              <label className="row" style={{ marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={allowSameTeamMatches}
                  onChange={e => setAllowSameTeamMatches(e.target.checked)}
                  disabled={!canManageMeets}
                />
                <span className="muted">Attempt same-team matches</span>
              </label>

          <div style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 6 }}><b>Select other teams</b></div>
            <div className="team-box">
                {otherTeams.map(t => (
                  <label key={t.id} className="team-option">
                    <input
                      type="checkbox"
                      checked={teamIds.includes(t.id)}
                      onChange={() => toggleTeam(t.id)}
                      disabled={!canManageMeets || isEditing}
                    />
                    <span style={{ flex: 1 }}>
                      {t.name} {t.symbol ? `(${t.symbol})` : ""}
                    </span>
                  </label>
                ))}
              </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Selected other teams: {otherTeamIds.length} (max 3)
                </div>
              </div>

            </div>
            <div className="modal-actions">
              <label className="modal-home-team">
                <span className="muted">Home team</span>
                <select
                  className="select"
                  value={homeTeamId}
                  onChange={e => {
                    const next = e.target.value;
                    setHomeTeamId(next);
                    const t = teams.find(team => team.id === next);
                    if (t?.address) setLocation(t.address);
                  }}
                  disabled={!canManageMeets}
                >
                  {teamIds.length === 0 && <option value="">Select teams first</option>}
                  {teamIds.map(id => {
                    const t = teams.find(team => team.id === id);
                    return (
                      <option key={id} value={id}>{t?.symbol ?? id}</option>
                    );
                  })}
                </select>
              </label>
              <div className="modal-action-buttons">
                <button
                  className="btn"
                  type="button"
                  onClick={handleModalSubmit}
                  disabled={!canManageMeets || otherTeamIds.length < 1 || otherTeamIds.length > 3 || name.trim().length < 2}
                >
                  {submitLabel}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => closeCreateModal()}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteDialog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDeleteDialog(null)}>
          <div className="modal delete-modal" role="document" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                Delete meet: {deleteDialog.name} (
                {new Date(deleteDialog.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                )
              </h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this meet? This action is irreversible.</p>
            </div>
            <div className="modal-actions">
              <button className="nav-btn" onClick={() => setDeleteDialog(null)} disabled={Boolean(deletingMeetId)}>
                Cancel
              </button>
              <button className="nav-btn delete-confirm" onClick={confirmDeleteMeet} disabled={Boolean(deletingMeetId)}>
                Delete meet
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
