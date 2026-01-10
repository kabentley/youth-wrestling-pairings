"use client";

import { useEffect, useState } from "react";

import AppHeader from "@/components/AppHeader";

type TeamMember = {
  id: string;
  username: string;
  email: string;
  phone?: string | null;
  name?: string | null;
  role: "PARENT" | "COACH" | "TABLE_WORKER";
};

const headerLinks = [
  { href: "/", label: "Home" },
  { href: "/rosters", label: "Rosters" },
  { href: "/meets", label: "Meets", minRole: "COACH" as const },
  { href: "/parent", label: "My Wrestlers" },
];

export default function CoachParentsPage() {
  const [parents, setParents] = useState<TeamMember[]>([]);
  const [staff, setStaff] = useState<TeamMember[]>([]);
  const [headCoachId, setHeadCoachId] = useState<string | null>(null);
  const [teamLabel, setTeamLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const getRoleLabel = (member: TeamMember, headCoachId: string | null) => {
    if (member.role === "COACH") {
      return member.id === headCoachId ? "Head Coach" : "Assistant Coach";
    }
    return "Table Worker";
  };

  useEffect(() => {
    void loadMembers();
  }, []);

  const castMembers = (items: unknown): Array<Omit<TeamMember, "role">> | undefined =>
    Array.isArray(items) ? items : undefined;
  const mapStaff = (items: Array<Omit<TeamMember, "role">> | undefined, role: TeamMember["role"]) =>
    (items ?? []).map((item) => ({ ...item, role }));
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

  async function loadMembers() {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/coach/parents");
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setMessage(payload?.error ?? "Unable to load parents.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    const resolvedHead = data.team?.headCoachId ?? null;
    setParents(mapStaff(castMembers(data.parents), "PARENT"));
    setStaff(
      sortStaff(
        [
          ...mapStaff(castMembers(data.coaches), "COACH"),
          ...mapStaff(castMembers(data.tableWorkers), "TABLE_WORKER"),
        ],
        resolvedHead,
      ),
    );
    setHeadCoachId(resolvedHead);
    if (data.team) {
      const parts: string[] = [];
      if (data.team.name) parts.push(data.team.name);
      if (data.team.symbol) parts.push(`(${data.team.symbol})`);
      setTeamLabel(parts.join(" "));
    }
    setLoading(false);
  }

  async function updateRole(member: TeamMember, nextRole: TeamMember["role"]) {
    if (member.role === nextRole) return;
    setMessage(null);
    setSaving((prev) => ({ ...prev, [member.id]: true }));
    const res = await fetch(`/api/coach/parents/${member.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    setSaving((prev) => {
      const next = { ...prev };
      delete next[member.id];
      return next;
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setMessage(payload?.error ?? "Unable to update role.");
      return;
    }
    const payload = await res.json().catch(() => null);
    const updated = payload?.updated;
    if (!updated) {
      setMessage("Role update failed.");
      return;
    }
    const normalized: TeamMember = {
      id: updated.id,
      username: updated.username,
      email: updated.email ?? "",
      name: updated.name ?? "",
      phone: updated.phone ?? "",
      role: updated.role,
    };
    setParents((prev) => {
      const filtered = prev.filter((p) => p.id !== normalized.id);
      return normalized.role === "PARENT" ? [...filtered, normalized] : filtered;
    });
    setStaff((prev) => {
      const filtered = prev.filter((s) => s.id !== normalized.id);
      return sortStaff(
        normalized.role === "PARENT" ? filtered : [...filtered, normalized],
        headCoachId,
      );
    });
    if (nextRole === "PARENT") {
      setMessage("Demoted to parent.");
    } else if (nextRole === "COACH") {
      setMessage("Promoted to coach.");
    } else {
      setMessage("Assigned as table worker.");
    }
  }

  const renderStaffActions = (member: TeamMember) => {
    if (member.role === "COACH") {
      const isHeadCoach = headCoachId && member.id === headCoachId;
      if (isHeadCoach) {
        return null;
      }
      return (
        <div className="coach-staff-actions">
          <button
            type="button"
            className="coach-btn-secondary"
            disabled={Boolean(saving[member.id])}
            onClick={() => void updateRole(member, "TABLE_WORKER")}
          >
            Demote to Table Worker
          </button>
          <button
            type="button"
            className="coach-btn-secondary"
            disabled={Boolean(saving[member.id])}
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
              disabled={Boolean(saving[member.id])}
              onClick={() => void updateRole(member, "COACH")}
            >
              Promote to Assistant Coach
            </button>
          <button
            type="button"
            className="coach-btn-secondary"
            disabled={Boolean(saving[member.id])}
            onClick={() => void updateRole(member, "PARENT")}
          >
            Demote to Parent
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <main className="coach">
      <style>{coachStyles}</style>
      <div className="coach-shell">
        <AppHeader links={headerLinks} />
        <h1>Team Roles</h1>
        <p className="coach-intro">
          {teamLabel ? (
            <>
              <span>Parents assigned to {teamLabel}.</span>
              <br />
              <span>Promote a parent to a coach or table worker when you need help running practices or meets.</span>
            </>
          ) : (
            "Parents assigned to your team will appear below."
          )}
        </p>
        {staff.length > 0 && (
          <div className="coach-staff">
            <h3>Team staff</h3>
            <ul>
              {staff.map((member) => (
                <li key={member.id}>
                  <div className="coach-staff-headline">
                    <span className="coach-staff-username">{member.username}</span>
                    <span className="coach-staff-role">{getRoleLabel(member, headCoachId)}</span>
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
        {message && <div className="coach-message">{message}</div>}
        {loading ? (
          <div className="coach-empty">Loading parents...</div>
        ) : parents.length === 0 ? (
          <div className="coach-empty">No other parents were found for your team.</div>
        ) : (
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
                          disabled={Boolean(saving[parent.id])}
                          onClick={() => void updateRole(parent, "COACH")}
                        >
                          Promote to Assistant Coach
                        </button>
                        <button
                          disabled={Boolean(saving[parent.id])}
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
        )}
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
    --danger: #c62828;
  }
  .coach {
    min-height: 100vh;
    background: var(--bg);
    padding: 20px 16px 40px;
    color: var(--ink);
    font-family: "Source Sans 3", Arial, sans-serif;
  }
  .coach-shell {
    max-width: 1100px;
    margin: 0 auto;
  }
  .coach h1 {
    font-size: 28px;
    margin: 0;
    font-weight: 600;
  }
  .coach-intro {
    margin-top: 8px;
    color: var(--muted);
    max-width: 640px;
  }
  .coach-message {
    margin: 16px 0;
    padding: 10px 14px;
    border-radius: 6px;
    background: #e8f4ff;
    border: 1px solid #c5e0ff;
    color: var(--ink);
  }
  .coach-staff {
    margin-top: 16px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
  }
  .coach-staff h3 {
    margin: 0 0 10px;
    font-size: 16px;
    font-weight: 600;
  }
  .coach-staff ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .coach-staff li {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .coach-staff-headline {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }
  .coach-staff-role {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .coach-staff-contact {
    font-size: 13px;
    color: var(--muted);
  }
  .coach-staff-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .coach-table {
    margin-top: 24px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--card);
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
    text-align: left;
  }
  .coach-table th {
    background: #f7f9fb;
    font-weight: 600;
    font-size: 14px;
  }
  .coach-table tbody tr:last-child td {
    border-bottom: 0;
  }
  .coach-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .coach-actions button {
    border: 0;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    padding: 8px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .coach-actions button:disabled,
  .coach-staff-actions button:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .coach-btn-secondary {
    background: #f2f5f8;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .coach-empty {
    margin-top: 24px;
    padding: 20px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
  }
  @media (max-width: 768px) {
    .coach-table th,
    .coach-table td {
      padding: 10px;
    }
    .coach-actions,
    .coach-staff-actions {
      flex-direction: column;
    }
  }
`;
