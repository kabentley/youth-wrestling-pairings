"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

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

  const loadMatRules = async (id: string) => {
    const res = await fetch(`/api/teams/${id}/mat-rules`);
    if (!res.ok) return;
    const payload = await res.json().catch(() => null);
    setRules((payload?.rules ?? []).map((rule: MatRule) => ({ ...rule, color: rule.color ?? null })));
    setHomeTeamPreferSameMat(Boolean(payload?.homeTeamPreferSameMat));
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
    const payload = {
      homeTeamPreferSameMat,
      rules: rules.map(rule => ({
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

  const addRule = () => {
    if (rules.length >= 10) return;
    const nextIndex = rules.length > 0 ? Math.max(...rules.map(r => r.matIndex)) + 1 : 1;
    setRules(prev => [
      ...prev,
      {
        matIndex: nextIndex,
        minExperience: 0,
        maxExperience: 5,
        minAge: 0,
        maxAge: 20,
        color: null,
      },
    ]);
  };

  const removeRule = (idx: number) => {
    setRules(prev => prev.filter((_, index) => index !== idx));
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
            <label className="website-field">
              Website
              <input
                type="url"
                placeholder="https://yourteam.example.com"
                value={teamWebsite}
                onChange={e => handleTeamWebsiteChange(e.target.value)}
                onKeyDown={handleFieldKeyDown}
              />
            </label>
            <label className="location-field">
              Home Meet Location
              <input
                type="text"
                placeholder="Schoolname, address"
                value={teamLocation}
                onChange={e => handleTeamLocationChange(e.target.value)}
                onKeyDown={handleFieldKeyDown}
              />
            </label>
            <div className="info-actions">
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
              {message && (
                <p className={`info-message ${messageIsError ? "error" : "success"}`} role="status">
                  {message}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="coach-card">
          <div className="coach-card-header">
            <h3>Mat Setup</h3>
            <button type="button" className="coach-btn coach-btn-ghost" onClick={addRule} disabled={rules.length >= 10}>
              Add Mat
            </button>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={homeTeamPreferSameMat}
              onChange={(e) => setHomeTeamPreferSameMat(e.target.checked)}
            />
            Assign home team wrestlers to the same mat
          </label>
          <div className="coach-mat-grid">
            {rules.map((rule, idx) => (
              <div key={rule.matIndex} className="coach-mat-rule">
                <div className="rule-row">
                  <label>
                    Mat Number
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={rule.matIndex}
                      onChange={(e) => updateRule(idx, "matIndex", Number(e.target.value) || 1)}
                    />
                  </label>
                  <label className="color-field">
                    Color
                    <div className="color-actions">
                      <ColorPicker
                        value={rule.color ?? ""}
                        onChange={(next) => updateRule(idx, "color", next)}
                        idPrefix={`mat-color-${rule.matIndex}-${idx}`}
                        buttonClassName="color-swatch"
                        buttonStyle={{ backgroundColor: rule.color || "#ffffff" }}
                      />
                    </div>
                  </label>
                </div>
                <div className="rule-row">
                  <label>
                    Min Experience
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={rule.minExperience}
                      onChange={(e) => updateRule(idx, "minExperience", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Max Experience
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={rule.maxExperience}
                      onChange={(e) => updateRule(idx, "maxExperience", Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="rule-row">
                  <label>
                    Min Age
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rule.minAge}
                      onChange={(e) => updateRule(idx, "minAge", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Max Age
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rule.maxAge}
                      onChange={(e) => updateRule(idx, "maxAge", Number(e.target.value))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="coach-btn coach-btn-ghost coach-btn-sm"
                  onClick={() => removeRule(idx)}
                >
                  Remove Mat
                </button>
              </div>
            ))}
            {rules.length === 0 && (
              <div className="coach-empty coach-empty-sm">Add a mat to begin defining ranges.</div>
            )}
          </div>
          <button
            type="button"
            className="coach-btn coach-btn-primary"
            onClick={handleMatSave}
            disabled={savingMat || rules.length === 0}
          >
            {savingMat ? "Saving…" : "Save Mat Setup"}
          </button>
        </section>

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
  .info-message {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .info-message.success {
    color: var(--accent);
  }
  .info-message.error {
    color: #d32f2f;
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
  .website-field {
    grid-column: 2;
  }
  .location-field {
    grid-column: 3;
  }
  .field-label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
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
  .coach-mat-grid {
    margin-top: 16px;
    display: grid;
    gap: 12px;
  }
  .coach-mat-rule {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    display: grid;
    gap: 10px;
  }
  .rule-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }
  .color-field {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .color-field-label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
  }
  .color-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  label {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 600;
  }
  input {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 14px;
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
    .coach-mat-grid,
    .setup-grid {
      grid-template-columns: 1fr;
    }
    .coach-toolbar {
      flex-direction: column;
    }
  }
`;
