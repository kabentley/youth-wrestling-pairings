"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import AppHeader from "@/components/AppHeader";
import ColorPicker from "@/components/ColorPicker";

type MatRule = {
  matIndex: number;
  color?: string | null;
  minExperience: number;
  maxExperience: number;
  minAge: number;
  maxAge: number;
};

const CONFIGURED_MATS = 5;
const MIN_MATS = 1;
const MAX_MATS = CONFIGURED_MATS;

const DEFAULT_MAT_RULES: Omit<MatRule, "matIndex">[] = [
  { color: "lightgreen", minExperience: 0, maxExperience: 0, minAge: 0, maxAge: 8.5 },
  { color: "red", minExperience: 1, maxExperience: 2, minAge: 8.5, maxAge: 10.5 },
  { color: "lightblue", minExperience: 2, maxExperience: 4, minAge: 10.50, maxAge: 12.5 },
  { color: "brown", minExperience: 4, maxExperience: 10, minAge: 12.5, maxAge: 20 },
  { color: "orange", minExperience: 0, maxExperience: 10, minAge: 0, maxAge: 20 },
];

const createMatRule = (matIndex: number): MatRule => {
  const preset = DEFAULT_MAT_RULES[matIndex - 1];
  return {
    matIndex,
    color: preset?.color ?? null,
    minExperience: preset?.minExperience ?? 0,
    maxExperience: preset?.maxExperience ?? 5,
    minAge: preset?.minAge ?? 0,
    maxAge: preset?.maxAge ?? 20,
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
};

type UserRole = "PARENT" | "COACH" | "TABLE_WORKER" | "ADMIN";

const headerLinks = [
  { href: "/", label: "Home" },
  { href: "/rosters", label: "Rosters" },
  { href: "/meets", label: "Meets", minRole: "COACH" as const },
  { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
  { href: "/parent", label: "My Wrestlers" },
];

export default function CoachMyTeamPage() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("Team");
  const [teamSymbol, setTeamSymbol] = useState<string | null>(null);
  const [teamWebsite, setTeamWebsite] = useState("");
  const [teamLocation, setTeamLocation] = useState("");
  const [teamColor, setTeamColor] = useState("#000000");
  const [teamHasLogo, setTeamHasLogo] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [rules, setRules] = useState<MatRule[]>([]);
  const [numMats, setNumMats] = useState(MIN_MATS);
  const [homeTeamPreferSameMat, setHomeTeamPreferSameMat] = useState(false);
  const [parents, setParents] = useState<TeamMember[]>([]);
  const [staff, setStaff] = useState<TeamMember[]>([]);
  const [headCoachId, setHeadCoachId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTeam, setSavingTeam] = useState(false);
  const [savingMat, setSavingMat] = useState(false);
  const [savingParent, setSavingParent] = useState<Record<string, boolean>>({});
  const [logoLoading, setLogoLoading] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [initialInfo, setInitialInfo] = useState({ website: "", location: "" });
  const [infoLoaded, setInfoLoaded] = useState(false);
  const [infoDirty, setInfoDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageStatus, setMessageStatus] = useState<"success" | "error" | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "mat" | "roles">("info");
  const tabs = [
    { key: "info", label: "Team Info" },
    { key: "mat", label: "Mat Setup" },
    { key: "roles", label: "Team Roles" },
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
    setLoading(true);
    try {
      const meRes = await fetch("/api/me");
      if (!meRes.ok) {
        console.warn("Sign in required.");
        setLoading(false);
        return;
      }
      const profile = await meRes.json();
      setRole(profile.role ?? null);
      setTeamSymbol(profile.team?.symbol ?? null);
      if (!profile.teamId && profile.role !== "ADMIN") {
        console.warn("You must be assigned to a team to use this page.");
        setLoading(false);
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
    } finally {
      setLoading(false);
    }
  };

  const snapshotRef = useRef("");
  const [matDirty, setMatDirty] = useState(false);

  const buildSnapshot = (incomingRules: MatRule[], mats: number, homeSame: boolean) => {
    const normalized = padRulesToCount(incomingRules, CONFIGURED_MATS);
    return JSON.stringify({
      numMats: mats,
      homeTeamPreferSameMat: homeSame,
      rules: normalized.map(rule => ({
        color: rule.color,
        minExperience: rule.minExperience,
        maxExperience: rule.maxExperience,
        minAge: rule.minAge,
        maxAge: rule.maxAge,
      })),
    });
  };

  const updateSnapshot = (incomingRules: MatRule[], mats: number, homeSame: boolean) => {
    snapshotRef.current = buildSnapshot(incomingRules, mats, homeSame);
    setMatDirty(false);
  };

  useEffect(() => {
    const normalized = padRulesToCount(rules, CONFIGURED_MATS);
    const nextSnapshot = buildSnapshot(normalized, numMats, homeTeamPreferSameMat);
    setMatDirty(nextSnapshot !== snapshotRef.current);
  }, [rules, numMats, homeTeamPreferSameMat]);

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
    const desiredNumMats = clampNumMats(Math.max(candidateCount, parsedRules.length, MIN_MATS));
    const normalized = padRulesToCount(parsedRules, CONFIGURED_MATS);
    setNumMats(desiredNumMats);
    setRules(normalized);
    setHomeTeamPreferSameMat(Boolean(payload?.homeTeamPreferSameMat));
    updateSnapshot(normalized, desiredNumMats, Boolean(payload?.homeTeamPreferSameMat));
  };

  const loadTeamRoles = async (id: string) => {
    const res = await fetch("/api/coach/parents");
    if (!res.ok) return;
    const payload = await res.json().catch(() => null);
    const resolvedHead = payload?.team?.headCoachId ?? null;
    setHeadCoachId(resolvedHead);
    setParents((payload?.parents ?? []).map((item: Omit<TeamMember, "role">) => ({ ...item, role: "PARENT" })));
    setStaff(sortStaff(
      [
        ...(payload?.coaches ?? []).map((item: Omit<TeamMember, "role">) => ({ ...item, role: "COACH" })),
        ...(payload?.tableWorkers ?? []).map((item: Omit<TeamMember, "role">) => ({ ...item, role: "TABLE_WORKER" })),
      ],
      resolvedHead,
    ));
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
    setHomeTeamPreferSameMat(Boolean(team.homeTeamPreferSameMat));
    setTeamHasLogo(Boolean(team.hasLogo));
    setInitialInfo({ website: websiteVal, location: locationVal });
    setInfoDirty(false);
    setInfoLoaded(true);
  };

  const teamSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleTeamSave = () => {
    if (teamSaveTimer.current) {
      clearTimeout(teamSaveTimer.current);
    }
    teamSaveTimer.current = setTimeout(() => {
      void updateTeam();
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
    setTeamWebsite(value);
    setInfoDirty(true);
    setMessage(null);
    setMessageStatus(null);
  };

  const handleTeamLocationChange = (value: string) => {
    setTeamLocation(value);
    setInfoDirty(true);
    setMessage(null);
    setMessageStatus(null);
  };

  const handleTeamColorChange = (value: string) => {
    setTeamColor(value);
    scheduleTeamSave();
    setMessage(null);
    setMessageStatus(null);
  };

  useEffect(() => {
    if (!teamId) return;
    setInfoLoaded(false);
    void loadTeamDetails(teamId);
    void loadMatRules(teamId);
    if (role === "COACH") {
      void loadTeamRoles(teamId);
    }
  }, [teamId, role]);

  const updateTeam = async () => {
    if (!teamId) return;
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

  const messageIsError = messageStatus === "error";
  const canSaveTeamInfo = infoDirty && !savingTeam;

  const uploadLogo = async (file: File | null) => {
    if (!file || !teamId) return;
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
    if (!teamId) return;
    setSavingMat(true);
    const normalizedRules = padRulesToCount(rules, CONFIGURED_MATS);
    setRules(normalizedRules);
    const payload = {
      homeTeamPreferSameMat,
      numMats,
      rules: normalizedRules.map(rule => ({
        matIndex: rule.matIndex,
        color: rule.color?.trim() || null,
        minExperience: rule.minExperience,
        maxExperience: rule.maxExperience,
        minAge: rule.minAge,
        maxAge: rule.maxAge,
      })),
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
      updateSnapshot(normalizedRules, numMats, homeTeamPreferSameMat);
    }
    setSavingMat(false);
  };

  const updateRule = (idx: number, field: keyof MatRule, value: number | string | null) => {
    setRules(prev =>
      prev.map((rule, index) =>
        index !== idx
          ? rule
          : {
              ...rule,
              [field]: typeof value === "number" ? value : value === null ? null : value,
            },
      ),
    );
  };

  const adjustMatCount = (value: number) => {
    const desired = clampNumMats(Math.round(value));
    setNumMats(desired);
    setRules(prev => padRulesToCount(prev, CONFIGURED_MATS));
  };

  const updateRole = async (member: TeamMember, nextRole: TeamMember["role"]) => {
    if (!teamId || member.role === nextRole) return;
    setSavingParent((prev) => ({ ...prev, [member.id]: true }));
    const res = await fetch(`/api/coach/parents/${member.id}/role`, {
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
      console.error(err?.error ?? "Unable to update role.");
      return;
    }
    const payload = await res.json().catch(() => null);
    const updated = payload?.updated;
    if (!updated) return;
    const normalized: TeamMember = {
      id: updated.id,
      username: updated.username,
      email: updated.email ?? "",
      name: updated.name ?? "",
      phone: updated.phone ?? "",
      role: updated.role,
    };
    setHeadCoachId((prev) => (normalized.role === "COACH" && normalized.id ? normalized.id : prev));
    setParents((prev) => {
      const filtered = prev.filter(p => p.id !== normalized.id);
      return normalized.role === "PARENT" ? [...filtered, normalized] : filtered;
    });
    setStaff((prev) => {
      const filtered = prev.filter(s => s.id !== normalized.id);
      return sortStaff(normalized.role === "PARENT" ? filtered : [...filtered, normalized], headCoachId);
    });
  };

  const renderStaffActions = (member: TeamMember) => {
    if (member.role === "COACH") {
      const isHead = headCoachId && member.id === headCoachId;
      if (isHead) return null;
      return (
        <div className="coach-staff-actions">
          <button
            type="button"
            className="coach-btn-secondary"
            disabled={Boolean(savingParent[member.id])}
            onClick={() => void updateRole(member, "TABLE_WORKER")}
          >
            Demote to Table Worker
          </button>
          <button
            type="button"
            className="coach-btn-secondary"
            disabled={Boolean(savingParent[member.id])}
            onClick={() => void updateRole(member, "PARENT")}
          >
            Demote to Parent
          </button>
        </div>
      );
    }
    if (member.role === "TABLE_WORKER") {
      return (
        <div className="coach-staff-actions">
          <button
            type="button"
            disabled={Boolean(savingParent[member.id])}
            onClick={() => void updateRole(member, "COACH")}
          >
            Promote to Assistant Coach
          </button>
          <button
            type="button"
            className="coach-btn-secondary"
            disabled={Boolean(savingParent[member.id])}
            onClick={() => void updateRole(member, "PARENT")}
          >
            Demote to Parent
          </button>
        </div>
      );
    }
    return null;
  };

  const getRoleLabel = (member: TeamMember) => {
    if (member.role === "COACH") {
      return member.id === headCoachId ? "Head Coach" : "Assistant Coach";
    }
    return "Table Worker";
  };

  return (
    <main className="coach">
      <style>{coachStyles}</style>
      <div className="coach-shell">
        <AppHeader links={headerLinks} />
        <div className="team-header">
          <div className="team-header-main">
            <h1>
              Team Settings For: {teamName}
              {teamSymbol ? (
                <span style={{ color: teamColor, marginLeft: 6 }}>
                  ({teamSymbol})
                </span>
              ) : null}
            </h1>
            <p className="coach-intro">
              Configure your team’s public details, mat rules, and helper roles from one place.
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
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
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
        <div className="tab-body">
          {activeTab === "info" && (
          <section className="coach-card">
          <div className="coach-card-header">
            <h3>Team Info</h3>
          </div>
          <div className="setup-grid">
            <div className="logo-color">
              <div className="logo-field">
                <span className="field-label">Logo</span>
                <div className="logo-row">
                  <input
                    id="team-logo-file"
                    type="file"
                    className="file-input"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => {
                      void uploadLogo(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                  />
                  <label
                    htmlFor="team-logo-file"
                    className="logo-button"
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
                  <ColorPicker
                    value={teamColor}
                    onChange={handleTeamColorChange}
                    idPrefix="team-color"
                    buttonClassName="color-swatch"
                    buttonStyle={{ backgroundColor: teamColor || "#ffffff", width: 44, height: 32 }}
                    showNativeColorInput={true}
                  />
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
                  disabled={!canSaveTeamInfo}
                >
                  Save Info
                </button>
                <button
                  type="button"
                  className="coach-btn coach-btn-secondary"
                  onClick={cancelTeamInfoEdits}
                  disabled={!canSaveTeamInfo}
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
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={homeTeamPreferSameMat}
              onChange={(e) => setHomeTeamPreferSameMat(e.target.checked)}
            />
            Always assign home team wrestlers to the same mat
          </label>
          <div className="mat-summary-box">
            <div>
              <div className="mat-summary-label">Max number of mats for home meets</div>
              <input
                type="number"
                min={MIN_MATS}
                max={MAX_MATS}
                value={numMats}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  adjustMatCount(Number.isFinite(parsed) ? parsed : MIN_MATS);
                }}
              />
            </div>
            <div className="mat-summary-note">This table always lists five mats; use this input to indicate the number of mats you actually have.</div>
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
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center" }}>
                      Add a mat to begin defining ranges.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule, idx) => (
                    <tr key={rule.matIndex}>
                      <td>
                      <span>{rule.matIndex}</span>
                      </td>
                      <td>
                        <div className="color-actions">
                          <ColorPicker
                            value={rule.color ?? ""}
                            onChange={(next) => updateRule(idx, "color", next)}
                            idPrefix={`mat-color-${rule.matIndex}-${idx}`}
                            buttonClassName="color-swatch"
                            buttonStyle={{ backgroundColor: rule.color || "#ffffff", width: 32, height: 32 }}
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={rule.minExperience}
                          onChange={(e) => updateRule(idx, "minExperience", Number(e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={rule.maxExperience}
                          onChange={(e) => updateRule(idx, "maxExperience", Number(e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={rule.minAge}
                          onChange={(e) => updateRule(idx, "minAge", Number(e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={rule.maxAge}
                          onChange={(e) => updateRule(idx, "maxAge", Number(e.target.value))}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="coach-btn coach-btn-primary"
            onClick={handleMatSave}
            disabled={savingMat || rules.length === 0 || !matDirty}
            style={{ marginTop: 12 }}
          >
            {savingMat ? "Saving…" : "Save Mat Setup"}
          </button>
          </section>
          )}

          {activeTab === "roles" && (
        <section className="coach-card">
          <div className="coach-card-header">
            <h3>Team Roles</h3>
          </div>
          {staff.length > 0 && (
            <div className="coach-staff">
              <ul>
                {staff.map((member) => (
                  <li key={member.id}>
                    <div className="coach-staff-headline">
                      <span className="coach-staff-username">{member.username}</span>
                      <span className="coach-staff-role">{getRoleLabel(member)}</span>
                    </div>
                    <div className="coach-staff-contact">
                      {member.name ?? member.email}
                      {member.phone ? ` · ${member.phone}` : ""}
                    </div>
                    {renderStaffActions(member)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="coach-table">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {parents.map((parent) => (
                  <tr key={parent.id}>
                    <td>{parent.username}</td>
                    <td>{parent.name ?? "—"}</td>
                    <td>{parent.email}</td>
                    <td>{parent.phone ?? "—"}</td>
                    <td>
                      <div className="coach-actions">
                        <button
                          disabled={Boolean(savingParent[parent.id])}
                          onClick={() => void updateRole(parent, "COACH")}
                        >
                          Promote to Assistant Coach
                        </button>
                        <button
                          disabled={Boolean(savingParent[parent.id])}
                          onClick={() => void updateRole(parent, "TABLE_WORKER")}
                          className="coach-btn-secondary"
                        >
                          Make Table Worker
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
          )}
        </div>
      </div>
    </main>
  );
}

const coachStyles = `
  :root {
    --bg: #f5f6f8;
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
    max-width: 1100px;
    margin: 0 auto;
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
  .team-header-main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 640px;
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
  .team-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 20px;
    margin-bottom: 8px;
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
  .tab-body > *:first-child {
    margin-top: 0;
  }
  .setup-grid {
    display: grid;
    grid-template-columns: 140px repeat(2, minmax(180px, 1fr));
    column-gap: 16px;
    row-gap: 12px;
    margin-top: 16px;
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
    margin-left: auto;
    font-size: 13px;
    color: var(--muted);
  }
  .mat-setup-table {
    margin-top: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  .mat-setup-table table {
    width: 100%;
    border-collapse: collapse;
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
    overflow: hidden;
  }
  .coach-table table {
    width: 100%;
    border-collapse: collapse;
  }
  .coach-table th,
  .coach-table td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .coach-table th {
    background: #f7f9fb;
    font-weight: 600;
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
    .coach-toolbar {
      flex-direction: column;
    }
  }
`;
