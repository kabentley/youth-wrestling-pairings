"use client";
import { useSession } from "next-auth/react";
import { use, useEffect, useState, type FormEvent } from "react";

import AppHeader from "@/components/AppHeader";

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
type MatRule = {
  matIndex: number;
  color?: string;
  minExperience: number;
  maxExperience: number;
  minAge: number;
  maxAge: number;
};

const CONFIGURED_MATS = 5;
const MIN_MATS = 1;
const MAX_MATS = CONFIGURED_MATS;

export default function TeamDetail({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const sessionTeamId = (session?.user as any)?.teamId as string | undefined;
  const canEdit = role === "ADMIN" || (role === "COACH" && sessionTeamId === teamId);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [team, setTeam] = useState<{ name: string; symbol?: string; color?: string; hasLogo?: boolean; website?: string | null } | null>(null);
  const [teamColor, setTeamColor] = useState("");
  const [teamWebsite, setTeamWebsite] = useState("");
  const [teamLogoVersion, setTeamLogoVersion] = useState(0);
  const [showInactive, setShowInactive] = useState(true);
  const [matRules, setMatRules] = useState<MatRule[]>([]);
  const [homeTeamPreferSameMat, setHomeTeamPreferSameMat] = useState(false);
  const [numMats, setNumMats] = useState(MIN_MATS);
  const [ruleMsg, setRuleMsg] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    first: "",
    last: "",
    weight: 0,
    birthdate: "2015-01-01",
    experienceYears: 0,
    skill: 3,
  });
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

const DEFAULT_MAT_RULES: Omit<MatRule, "matIndex">[] = [
  { color: "lightgreen", minExperience: 0, maxExperience: 0, minAge: 0, maxAge: 8.5 },
  { color: "", minExperience: 0, maxExperience: 5, minAge: 0, maxAge: 20 },
  { color: "", minExperience: 0, maxExperience: 5, minAge: 0, maxAge: 20 },
  { color: "", minExperience: 0, maxExperience: 5, minAge: 0, maxAge: 20 },
  { color: "", minExperience: 0, maxExperience: 5, minAge: 0, maxAge: 20 },
];

function defaultMatRule(index: number): MatRule {
  const preset = DEFAULT_MAT_RULES[index] ?? DEFAULT_MAT_RULES[DEFAULT_MAT_RULES.length - 1];
  return {
    matIndex: index + 1,
    color: preset.color ?? "",
    minExperience: preset.minExperience ?? 0,
    maxExperience: preset.maxExperience ?? 5,
    minAge: preset.minAge ?? 0,
    maxAge: preset.maxAge ?? 20,
  };
}

const clampNumMats = (value: number) => Math.max(MIN_MATS, Math.min(MAX_MATS, value));

const padRulesToCount = (rules: MatRule[], count: number) => {
  const normalized = rules.slice(0, count).map((rule, idx) => ({
    ...rule,
    matIndex: idx + 1,
  }));
  if (normalized.length < count) {
    const additions = Array.from({ length: count - normalized.length }, (_, idx) =>
      defaultMatRule(normalized.length + idx),
    );
    normalized.push(...additions);
  }
  return normalized;
};

  async function load() {
    const [wRes, rRes, tRes] = await Promise.all([
      fetch(`/api/teams/${teamId}/wrestlers?includeInactive=${showInactive ? "1" : "0"}`),
      fetch(`/api/teams/${teamId}/mat-rules`),
      fetch(`/api/teams/${teamId}`),
    ]);
    setWrestlers(await wRes.json());
    if (rRes.ok) {
      const json = await rRes.json();
      const sourceRules = (json.rules ?? []) as MatRule[];
      const parsedRules: MatRule[] = sourceRules.map((rule, idx) => ({
        matIndex: idx + 1,
        color: rule.color ?? "",
        minExperience: Number(rule.minExperience),
        maxExperience: Number(rule.maxExperience),
        minAge: Number(rule.minAge),
        maxAge: Number(rule.maxAge),
      }));
      const rawNum = json.numMats;
      const candidateCount =
        typeof rawNum === "number" && Number.isFinite(rawNum) ? rawNum : parsedRules.length;
      const desiredCount = clampNumMats(Math.max(candidateCount, parsedRules.length, MIN_MATS));
      setNumMats(desiredCount);
      setMatRules(padRulesToCount(parsedRules, CONFIGURED_MATS));
      setHomeTeamPreferSameMat(Boolean(json.homeTeamPreferSameMat));
    } else if (matRules.length === 0) {
      setNumMats(MIN_MATS);
      setMatRules(Array.from({ length: CONFIGURED_MATS }, (_, idx) => defaultMatRule(idx)));
    }
    if (tRes.ok) {
      const tJson = await tRes.json();
      setTeam(tJson);
      setTeamColor(tJson.color ?? "");
      setTeamWebsite(tJson.website ?? "");
    }
  }

  const updateFormFields = (updates: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...updates }));
    setFormError(prev => (prev ? "" : prev));
  };

  const handleNewWrestlerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    await add();
  };

  const validateNewWrestler = () => {
    if (!form.first.trim()) return "First name is required.";
    if (!form.last.trim()) return "Last name is required.";
    const weight = Number(form.weight);
    if (!Number.isFinite(weight) || weight < 35 || weight > 300) {
      return "Weight must be between 35 and 300.";
    }
    if (!form.birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(form.birthdate)) {
      return "Birthdate must be a valid YYYY-MM-DD date.";
    }
    if (Number.isNaN(new Date(form.birthdate).getTime())) {
      return "Birthdate must be a real date.";
    }
    const exp = Number(form.experienceYears);
    if (!Number.isFinite(exp) || exp < 0) {
      return "Experience years must be zero or greater.";
    }
    const skill = Number(form.skill);
    if (!Number.isFinite(skill) || skill < 0 || skill > 5) {
      return "Skill must be between 0 and 5.";
    }
    return "";
  };

  async function add() {
    if (!canEdit) return;
    const validationMessage = validateNewWrestler();
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    const payload = {
      ...form,
      weight: Number(form.weight),
      experienceYears: Number(form.experienceYears),
      skill: Number(form.skill),
    };

    const res = await fetch(`/api/teams/${teamId}/wrestlers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({} as { error?: string }));
      setFormError(json?.error ?? "Unable to add wrestler.");
      return;
    }
    setForm(prev => ({ ...prev, first: "", last: "" }));
    setFormError("");
    await load();
  }

  async function saveMatRules() {
    if (!canEdit) return;
    setRuleMsg("");
    const normalizedRules = padRulesToCount(matRules, CONFIGURED_MATS);
    setMatRules(normalizedRules);
    const rules = normalizedRules.map((rule, idx) => ({
      ...rule,
      matIndex: idx + 1,
    }));
    const res = await fetch(`/api/teams/${teamId}/mat-rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeTeamPreferSameMat, numMats, rules }),
    });
    if (!res.ok) {
      setRuleMsg("Save failed.");
      return;
    }
    setRuleMsg("Saved.");
    setTimeout(() => setRuleMsg(""), 1500);
  }

  async function saveTeamColor() {
    if (!canEdit) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(teamColor)) {
      setRuleMsg("Team color must be a 6-digit hex value.");
      return;
    }
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: teamColor }),
    });
    if (!res.ok) {
      setRuleMsg("Unable to update team color.");
      return;
    }
    await load();
  }

  async function uploadTeamLogo(file: File | null) {
    if (!canEdit || !file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/teams/${teamId}/logo`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      setRuleMsg("Logo upload failed.");
      return;
    }
    setTeamLogoVersion(Date.now());
    await load();
  }

  async function clearTeamLogo() {
    if (!canEdit) return;
    const res = await fetch(`/api/teams/${teamId}/logo`, { method: "DELETE" });
    if (!res.ok) {
      setRuleMsg("Unable to clear logo.");
      return;
    }
    setTeamLogoVersion(Date.now());
    await load();
  }

  useEffect(() => { void load(); }, [teamId, showInactive]);

  async function setWrestlerActive(wrestlerId: string, active: boolean) {
    if (!canEdit) return;
    await fetch(`/api/teams/${teamId}/wrestlers/${wrestlerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await load();
  }

  async function saveTeamWebsite() {
    if (!canEdit) return;
    setRuleMsg("");
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website: teamWebsite }),
    });
    if (!res.ok) {
      setRuleMsg("Unable to update team website.");
      return;
    }
    await load();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <AppHeader links={headerLinks} />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {team?.hasLogo ? (
          <img src={`/api/teams/${teamId}/logo/file?v=${teamLogoVersion}`} alt={`${team.name} logo`} style={{ width: 56, height: 56, objectFit: "contain" }} />
        ) : null}
        <h2 style={{ margin: 0 }}>
          {team?.symbol ? `${team.symbol} ${team.name}` : (team?.name ?? "Team")}
        </h2>
        {team?.website && (
          <a href={`${team.website.replace(/\/$/, "")}/news`} target="_blank" rel="noreferrer">
            Team News
          </a>
        )}
      </div>

      {canEdit && (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Team Settings</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            {team?.hasLogo ? (
              <img src={`/api/teams/${teamId}/logo/file?v=${teamLogoVersion}`} alt={`${team.name} logo`} style={{ width: 56, height: 56, objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: 12, opacity: 0.7 }}>No logo</span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => uploadTeamLogo(e.target.files?.[0] ?? null)}
            />
            <button onClick={clearTeamLogo} disabled={!team?.hasLogo}>Clear Logo</button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Team color (hex)</label>
            <input
              value={teamColor}
              onChange={(e) => setTeamColor(e.target.value)}
              placeholder="#1e88e5"
              style={{ maxWidth: 180 }}
            />
            <label style={{ fontSize: 12, opacity: 0.7 }}>Named colors</label>
            <select value={teamColor} onChange={(e) => setTeamColor(e.target.value)} style={{ maxWidth: 240 }}>
              {NAMED_COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.name}</option>
              ))}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 22px)", gap: 6 }}>
              {NAMED_COLORS.map((c) => (
                <button
                  key={`${teamId}-${c.value}`}
                  onClick={() => setTeamColor(c.value)}
                  title={`${c.name} (${c.value})`}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    border: "1px solid rgba(0,0,0,0.2)",
                    backgroundColor: c.value,
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
            <button onClick={saveTeamColor} style={{ maxWidth: 160 }}>Save Team Color</button>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Team website (used for /news)</label>
            <input
              value={teamWebsite}
              onChange={(e) => setTeamWebsite(e.target.value)}
              placeholder="https://team.example.com"
              style={{ maxWidth: 320 }}
            />
            <button onClick={saveTeamWebsite} style={{ maxWidth: 200 }}>Save Team Website</button>
          </div>
        </div>
      )}

      {!canEdit && (
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          You can view this roster but cannot edit it.
        </div>
      )}

      <form
        onSubmit={handleNewWrestlerSubmit}
        style={{ display: "grid", gap: 8, marginBottom: 12 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
          <input placeholder="First" value={form.first} onChange={e => updateFormFields({ first: e.target.value })} disabled={!canEdit} />
          <input placeholder="Last" value={form.last} onChange={e => updateFormFields({ last: e.target.value })} disabled={!canEdit} />
          <input type="number" placeholder="Weight" value={form.weight} onChange={e => updateFormFields({ weight: Number(e.target.value) })} disabled={!canEdit} />
          <input type="date" value={form.birthdate} onChange={e => updateFormFields({ birthdate: e.target.value })} disabled={!canEdit} />
          <input type="number" placeholder="Exp" value={form.experienceYears} onChange={e => updateFormFields({ experienceYears: Number(e.target.value) })} disabled={!canEdit} />
          <input
            type="number"
            placeholder="Skill 0-5"
            value={form.skill}
            min={0}
            max={5}
            onChange={e => updateFormFields({ skill: Number(e.target.value) })}
            disabled={!canEdit}
          />
          <button
            type="submit"
            disabled={!canEdit}
            className="btn btn-small"
            style={{ alignSelf: "stretch" }}
          >
            Add
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span className="muted" style={{ fontSize: 12 }}>Press Enter or tap Add</span>
        </div>
      </form>
      {formError && (
        <div role="alert" style={{ color: "#b71c1c", marginTop: 6, fontSize: 13 }}>
          {formError}
        </div>
      )}

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Home Team Mat Rules</h3>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          Mat settings cover {CONFIGURED_MATS} mats; currently using {numMats}.
        </div>

        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Mat</th>
              <th>Color</th>
              <th>Min Exp</th>
              <th>Max Exp</th>
              <th>Min Age</th>
              <th>Max Age</th>
            </tr>
          </thead>
          <tbody>
            {matRules.map((rule, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid #eee" }}>
                <td>{idx + 1}</td>
                <td>
                  <input
                    value={rule.color}
                    onChange={(e) => {
                      const color = e.target.value;
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, color } : r)));
                    }}
                    disabled={!canEdit}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={rule.minExperience}
                    onChange={(e) => {
                      const minExperience = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, minExperience } : r)));
                    }}
                    style={{ width: 70 }}
                    disabled={!canEdit}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={rule.maxExperience}
                    onChange={(e) => {
                      const maxExperience = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, maxExperience } : r)));
                    }}
                    style={{ width: 70 }}
                    disabled={!canEdit}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={rule.minAge}
                    onChange={(e) => {
                      const minAge = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, minAge } : r)));
                    }}
                    style={{ width: 70 }}
                    disabled={!canEdit}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={rule.maxAge}
                    onChange={(e) => {
                      const maxAge = Number(e.target.value);
                      setMatRules(rules => rules.map((r, i) => (i === idx ? { ...r, maxAge } : r)));
                    }}
                    style={{ width: 70 }}
                    disabled={!canEdit}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <label>
            <input
              type="checkbox"
              checked={homeTeamPreferSameMat}
              onChange={(e) => setHomeTeamPreferSameMat(e.target.checked)}
              disabled={!canEdit}
            />{" "}
            Keep home team on the same mat
          </label>
          <button onClick={saveMatRules} disabled={!canEdit}>Save Rules</button>
          {ruleMsg && <span>{ruleMsg}</span>}
        </div>
      </div>

      <h3 style={{ marginTop: 20 }}>Active Roster</h3>
      <label style={{ display: "block", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />{" "}
        Show inactive wrestlers
      </label>
      <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Name</th><th align="left">Weight</th><th align="left">Birthdate</th><th align="left">Experience</th><th align="left">Skill</th><th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {wrestlers.filter(w => w.active).map(w => (
            <tr key={w.id} style={{ borderTop: "1px solid #ddd" }}>
              <td style={{ color: team?.color ?? "#000000" }}>{w.first} {w.last} ({team?.symbol ?? team?.name ?? ""})</td>
              <td>{w.weight}</td>
              <td>{new Date(w.birthdate).toISOString().slice(0,10)}</td>
              <td>{w.experienceYears}</td>
              <td>{w.skill}</td>
              <td>
                <button onClick={() => setWrestlerActive(w.id, false)} disabled={!canEdit}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showInactive && (
        <>
          <h3 style={{ marginTop: 20 }}>Inactive Wrestlers</h3>
          <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
            <tr>
              <th align="left">Name</th><th align="left">Weight</th><th align="left">Birthdate</th><th align="left">Experience</th><th align="left">Skill</th><th align="left">Actions</th>
            </tr>
            </thead>
            <tbody>
              {wrestlers.filter(w => !w.active).map(w => (
                <tr key={w.id} style={{ borderTop: "1px solid #ddd" }}>
              <td style={{ color: team?.color ?? "#000000" }}>{w.first} {w.last} ({team?.symbol ?? team?.name ?? ""})</td>
                  <td>{w.weight}</td>
                  <td>{new Date(w.birthdate).toISOString().slice(0,10)}</td>
                  <td>{w.experienceYears}</td>
              <td>{w.skill}</td>
              <td>
                <button onClick={() => setWrestlerActive(w.id, true)} disabled={!canEdit}>Reinstate</button>
              </td>
            </tr>
          ))}
              {wrestlers.filter(w => !w.active).length === 0 && (
                <tr><td colSpan={6}>None</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <p style={{ marginTop: 16 }}><a href="/rosters">Back to Rosters</a></p>
    </main>
  );
}

const NAMED_COLORS = [
  { name: "Navy", value: "#0d3b66" },
  { name: "Royal Blue", value: "#1e88e5" },
  { name: "Sky Blue", value: "#64b5f6" },
  { name: "Teal", value: "#00897b" },
  { name: "Green", value: "#2e7d32" },
  { name: "Lime", value: "#9ccc65" },
  { name: "Gold", value: "#f2b705" },
  { name: "Orange", value: "#f57c00" },
  { name: "Red", value: "#c62828" },
  { name: "Maroon", value: "#8e1037" },
  { name: "Purple", value: "#5e35b1" },
  { name: "Gray", value: "#546e7a" },
  { name: "Black", value: "#1d232b" },
];
