"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { formatTeamName } from "@/lib/formatTeamName";

type UserRow = {
  id: string;
  username: string;
  email: string;
  phone?: string | null;
  name: string | null;
  role: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
  teamId: string | null;
  lastLoginAt?: string | null;
};
type TeamRow = { id: string; name: string; symbol: string };
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
const MIN_USERNAME_LEN = 6;
const MAX_USERNAME_LEN = 32;
const normalizeUsernameToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const buildGeneratedUsernameBase = (firstName: string, lastName: string) => {
  const first = normalizeUsernameToken(firstName);
  const last = normalizeUsernameToken(lastName);
  const initial = first.slice(0, 1);
  let base = `${initial}${last}`;
  if (!base) return "";
  if (base.startsWith("oauth")) {
    base = `u${base}`;
  }
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

export default function UsersSection() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRow["role"]>("COACH");
  const [teamId, setTeamId] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const usernameSuggestReqRef = useRef(0);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRow["role"]>("COACH");
  const [editTeamId, setEditTeamId] = useState("");
  const [savingEditUser, setSavingEditUser] = useState(false);

  async function load(overrides?: {
    page?: number;
    query?: string;
    pageSize?: number;
    teamFilter?: string;
    roleFilter?: string;
  }) {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: (overrides?.query ?? query).trim(),
        teamId: (overrides?.teamFilter ?? teamFilter).trim(),
        role: (overrides?.roleFilter ?? roleFilter).trim(),
        page: String(overrides?.page ?? page),
        pageSize: String(overrides?.pageSize ?? pageSize),
      });
      const [uRes, tRes] = await Promise.all([
        fetch(`/api/admin/users?${params}`),
        fetch("/api/teams"),
      ]);
      if (!uRes.ok) {
        const data = await uRes.json().catch(() => null);
        setMsg(formatError(data?.error) ?? (uRes.status === 401 || uRes.status === 403 ? "Not authorized." : "Unable to load users."));
        return;
      }
      const data = await uRes.json();
      setUsers(data.items ?? []);
      setTotal(Number(data.total ?? 0));
      setAdminCount(Number(data.adminCount ?? 0));
      if (tRes.ok) setTeams(await tRes.json());
    } catch {
      setMsg("Unable to load users.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load({ query: debouncedQuery });
  }, [page, pageSize, teamFilter, roleFilter, debouncedQuery]);

  useEffect(() => {
    if (!createUserModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creatingUser) {
        usernameSuggestReqRef.current += 1;
        setCreateUserModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createUserModalOpen, creatingUser]);

  useEffect(() => {
    if (!createUserModalOpen) return;
    if (usernameEdited) return;
    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();
    if (!nextFirstName || !nextLastName) {
      setUsername("");
      return;
    }
    const timer = setTimeout(() => {
      void suggestUsernameForName(nextFirstName, nextLastName);
    }, 160);
    return () => clearTimeout(timer);
  }, [createUserModalOpen, firstName, lastName, usernameEdited]);

  useEffect(() => {
    if (!editingUser) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingEditUser) {
        setEditingUser(null);
        setEditUsername("");
        setEditEmail("");
        setEditPhone("");
        setEditName("");
        setEditRole("COACH");
        setEditTeamId("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingUser, savingEditUser]);

  function generatePassword() {
    const digits = "0123456789";
    let out = "";
    for (let i = 0; i < 6; i += 1) {
      out += digits[Math.floor(Math.random() * digits.length)];
    }
    setPassword(out);
  }

  async function isUsernameAvailable(candidate: string) {
    const res = await fetch(`/api/auth/signup?username=${encodeURIComponent(candidate)}`, {
      method: "GET",
    });
    if (!res.ok) return false;
    const payload = await res.json().catch(() => null);
    return payload?.available === true;
  }

  async function suggestUsernameForName(nextFirstName: string, nextLastName: string) {
    const base = buildGeneratedUsernameBase(nextFirstName, nextLastName);
    if (!base) {
      setUsername("");
      return;
    }
    const reqId = ++usernameSuggestReqRef.current;
    for (let suffix = 0; suffix <= 200; suffix += 1) {
      const candidate = withUsernameSuffix(base, suffix);
      const available = await isUsernameAvailable(candidate);
      if (reqId !== usernameSuggestReqRef.current) return;
      if (available) {
        setUsername(candidate);
        return;
      }
    }
    setUsername(withUsernameSuffix(base, Date.now() % 1000));
  }

  function handleFirstNameChange(event: ChangeEvent<HTMLInputElement>) {
    setFirstName(event.target.value);
  }

  function handleLastNameChange(event: ChangeEvent<HTMLInputElement>) {
    setLastName(event.target.value);
  }

  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>) {
    usernameSuggestReqRef.current += 1;
    setUsername(event.target.value);
    setUsernameEdited(true);
  }

  function resetCreateUserForm(defaultTeamId = "") {
    usernameSuggestReqRef.current += 1;
    setUsername("");
    setUsernameEdited(false);
    setEmail("");
    setPhone("");
    setFirstName("");
    setLastName("");
    setPassword("");
    setRole("COACH");
    setTeamId(defaultTeamId);
  }

  function clearCreateUserFieldsAfterCreate() {
    usernameSuggestReqRef.current += 1;
    setUsername("");
    setUsernameEdited(false);
    setEmail("");
    setPhone("");
    setFirstName("");
    setLastName("");
  }

  function openCreateUserModal() {
    setMsg("");
    resetCreateUserForm(teamFilter.trim());
    setCreateUserModalOpen(true);
  }

  function closeCreateUserModal() {
    if (creatingUser) return;
    usernameSuggestReqRef.current += 1;
    setCreateUserModalOpen(false);
  }

  function openEditUserModal(user: UserRow) {
    setMsg("");
    setEditingUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email);
    setEditPhone(user.phone ?? "");
    setEditName(user.name ?? "");
    setEditRole(user.role);
    setEditTeamId(user.teamId ?? "");
  }

  function clearEditUserForm() {
    setEditingUser(null);
    setEditUsername("");
    setEditEmail("");
    setEditPhone("");
    setEditName("");
    setEditRole("COACH");
    setEditTeamId("");
  }

  function closeEditUserModal() {
    if (savingEditUser) return;
    clearEditUserForm();
  }

  async function createUser() {
    setMsg("");
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedPassword = password.trim();
    const normalizedName = `${trimmedFirstName} ${trimmedLastName}`.trim();
    const requiresTeam = role === "COACH" || role === "PARENT" || role === "TABLE_WORKER";
    const hasValidEmail = normalizedEmail === "" || EMAIL_REGEX.test(normalizedEmail);
    const hasValidPhone = normalizedPhone === "" || PHONE_REGEX.test(normalizedPhone);
    const hasValidTeam = !requiresTeam || teamId.trim().length > 0;
    const isValid =
      normalizedUsername.length >= MIN_USERNAME_LEN &&
      normalizedUsername.length <= MAX_USERNAME_LEN &&
      trimmedFirstName.length > 0 &&
      trimmedLastName.length > 0 &&
      normalizedName.length <= 120 &&
      normalizedPassword.length > 0 &&
      hasValidEmail &&
      hasValidPhone &&
      hasValidTeam;
    if (!isValid) {
      setMsg("Fill all required fields with valid values.");
      return;
    }
    setCreatingUser(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail,
          phone: normalizedPhone,
          name: normalizedName,
          role,
          teamId: teamId || null,
          password: normalizedPassword || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(formatError(data?.error) ?? "Unable to create user.");
        return;
      }
      clearCreateUserFieldsAfterCreate();
      setMsg("");
      await load();
    } catch {
      setMsg("Unable to create user.");
    } finally {
      setCreatingUser(false);
    }
  }

  async function saveEditedUser() {
    if (!editingUser) return;
    setMsg("");
    const normalizedUsername = editUsername.trim().toLowerCase();
    const normalizedEmail = editEmail.trim().toLowerCase();
    const normalizedPhone = editPhone.trim();
    const normalizedName = editName.trim();
    const hasValidEmail = normalizedEmail === "" || EMAIL_REGEX.test(normalizedEmail);
    const hasValidPhone = normalizedPhone === "" || PHONE_REGEX.test(normalizedPhone);
    const requiresTeam = editRole === "COACH" || editRole === "PARENT" || editRole === "TABLE_WORKER";
    const hasValidTeam = !requiresTeam || editTeamId.trim().length > 0;
    const hasValidName = normalizedName.length <= 120;
    const hasValidUsername =
      normalizedUsername.length >= MIN_USERNAME_LEN &&
      normalizedUsername.length <= MAX_USERNAME_LEN &&
      !normalizedUsername.includes("@");
    const canSave =
      hasValidUsername &&
      hasValidEmail &&
      hasValidPhone &&
      hasValidTeam &&
      hasValidName;
    if (!canSave) {
      setMsg("Fill all required fields with valid values.");
      return;
    }
    setSavingEditUser(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail,
          phone: normalizedPhone,
          name: normalizedName.length > 0 ? normalizedName : null,
          role: editRole,
          teamId: editTeamId || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(formatError(data?.error) ?? "Unable to update user.");
        return;
      }
      setMsg("User updated.");
      clearEditUserForm();
      await load();
    } catch {
      setMsg("Unable to update user.");
    } finally {
      setSavingEditUser(false);
    }
  }

  async function resetPassword(id: string) {
    setMsg("");
    const newPass = prompt("Enter new password:");
    if (!newPass) return;
    const res = await fetch(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPass }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errorMsg = formatError(data?.error) ?? "Unable to reset password.";
      alert(`Password not reset. ${errorMsg}`);
      setMsg(errorMsg);
      return;
    }
    setMsg("Password reset.");
  }

  async function deleteUser(id: string, label: string) {
    setMsg("");
    const ok = confirm(`Remove ${label}? This deletes the account and active sessions.`);
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMsg(formatError(data?.error) ?? "Unable to delete user.");
      return;
    }
    setMsg("User removed.");
    await load();
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (page !== 1) {
      setPage(1);
    }
    void load({ page: 1, query, teamFilter, roleFilter });
  }

  function onEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSaveEditedUser || savingEditUser) return;
    void saveEditedUser();
  }

  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();
  const normalizedPassword = password.trim();
  const normalizedName = `${trimmedFirstName} ${trimmedLastName}`.trim();
  const requiresTeam = role === "COACH" || role === "PARENT" || role === "TABLE_WORKER";
  const hasValidEmail = normalizedEmail === "" || EMAIL_REGEX.test(normalizedEmail);
  const hasValidPhone = normalizedPhone === "" || PHONE_REGEX.test(normalizedPhone);
  const hasValidTeam = !requiresTeam || teamId.trim().length > 0;
  const hasValidName = normalizedName.length > 0 && normalizedName.length <= 120;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canCreateUser = Boolean(
    normalizedUsername.length >= MIN_USERNAME_LEN &&
    normalizedUsername.length <= MAX_USERNAME_LEN &&
    trimmedFirstName.length > 0 &&
    trimmedLastName.length > 0 &&
    normalizedPassword.length > 0 &&
    hasValidName &&
    hasValidEmail &&
    hasValidPhone &&
    hasValidTeam
  );
  const normalizedEditUsername = editUsername.trim().toLowerCase();
  const normalizedEditEmail = editEmail.trim().toLowerCase();
  const normalizedEditPhone = editPhone.trim();
  const normalizedEditName = editName.trim();
  const requiresEditTeam = editRole === "COACH" || editRole === "PARENT" || editRole === "TABLE_WORKER";
  const hasValidEditTeam = !requiresEditTeam || editTeamId.trim().length > 0;
  const hasValidEditEmail = normalizedEditEmail === "" || EMAIL_REGEX.test(normalizedEditEmail);
  const hasValidEditPhone = normalizedEditPhone === "" || PHONE_REGEX.test(normalizedEditPhone);
  const hasValidEditName = normalizedEditName.length <= 120;
  const hasValidEditUsername =
    normalizedEditUsername.length >= MIN_USERNAME_LEN &&
    normalizedEditUsername.length <= MAX_USERNAME_LEN &&
    !normalizedEditUsername.includes("@");
  const canSaveEditedUser =
    hasValidEditUsername &&
    hasValidEditEmail &&
    hasValidEditPhone &&
    hasValidEditTeam &&
    hasValidEditName;

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(total, page * pageSize);
  const getTeamLabel = (currentTeamId: string | null) => {
    if (!currentTeamId) return "None";
    const team = teams.find((item) => item.id === currentTeamId);
    return team ? team.symbol : "Unknown";
  };

  return (
    <>
      <div className="admin-header admin-users-header">
        <h1 className="admin-title">User Management</h1>
        <button className="admin-btn admin-create-user-trigger" type="button" onClick={openCreateUserModal}>
          Create New User
        </button>
      </div>
      <div className="admin-card admin-users-controls">
        <form className="admin-search" onSubmit={onSearchSubmit}>
          <div className="admin-search-filters">
            <input
              placeholder="Search username, email, or name"
              value={query}
              onChange={(e) => {
                const next = e.target.value;
                setQuery(next);
                if (page !== 1) setPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                if (query.length === 0) return;
                e.preventDefault();
                setQuery("");
                if (page !== 1) setPage(1);
              }}
            />
            <select
              value={teamFilter}
              onChange={(e) => {
                setPage(1);
                setTeamFilter(e.target.value);
              }}
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatTeamName(t)}
                </option>
              ))}
            </select>
            <select
              value={roleFilter}
              onChange={(e) => {
                setPage(1);
                setRoleFilter(e.target.value);
              }}
            >
              <option value="">All roles</option>
              <option value="ADMIN">ADMIN</option>
              <option value="COACH">COACH</option>
              <option value="PARENT">PARENT</option>
              <option value="TABLE_WORKER">TABLE_WORKER</option>
            </select>
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <button className="admin-btn admin-search-submit" type="submit">Search</button>
          </div>
        </form>
        <div className="admin-pager">
          <button
            className="admin-btn admin-btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="admin-muted">Page {page} of {totalPages}</span>
          <button
            className="admin-btn admin-btn-ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
          <span className="admin-muted">
            {isLoading ? "Loading..." : (total === 0 ? "No users" : `Showing ${showingFrom}-${showingTo} of ${total}`)}
          </span>
          {msg && <span className="admin-pager-status">{msg}</span>}
        </div>
      </div>

      {createUserModalOpen && (
        <div className="admin-modal-backdrop" onClick={closeCreateUserModal}>
          <div
            className="admin-modal admin-create-user-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Create New User"
          >
            <h4>Create New User</h4>
            <div className="admin-create-user-modal-grid">
              <input
                placeholder="First Name"
                value={firstName}
                onChange={handleFirstNameChange}
              />
              <input
                placeholder="Last Name"
                value={lastName}
                onChange={handleLastNameChange}
              />
              <input placeholder="Username" value={username} onChange={handleUsernameChange} />
              <input
                placeholder="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
              />
              <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <div className="admin-create-user-password">
                <input
                  placeholder="Temporary Password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <button
                  className="admin-btn admin-btn-ghost"
                  type="button"
                  onClick={generatePassword}
                  disabled={creatingUser}
                >
                  Generate
                </button>
              </div>
              <div className="admin-create-user-role-team">
                <select value={role} onChange={(e) => setRole(e.target.value as UserRow["role"])}>
                  <option value="ADMIN">Admin</option>
                  <option value="COACH">Coach</option>
                  <option value="PARENT">Parent</option>
                  <option value="TABLE_WORKER">Table Worker</option>
                </select>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">Select team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatTeamName(t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-modal-actions">
              <button
                className="admin-btn admin-btn-ghost"
                type="button"
                onClick={closeCreateUserModal}
                disabled={creatingUser}
              >
                Cancel
              </button>
              <button
                className="admin-btn"
                type="button"
                onClick={() => void createUser()}
                disabled={!canCreateUser || creatingUser}
              >
                {creatingUser ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="admin-modal-backdrop" onClick={closeEditUserModal}>
          <form
            className="admin-modal admin-create-user-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={onEditSubmit}
            role="dialog"
            aria-modal="true"
            aria-label="Edit User"
          >
            <h4>Edit User</h4>
            <div className="admin-edit-user-modal-grid">
              <input
                placeholder="Username"
                value={editUsername}
                onChange={(event) => setEditUsername(event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
              />
              <input
                placeholder="Email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
              />
              <input
                placeholder="Phone"
                value={editPhone}
                onChange={(event) => setEditPhone(event.target.value)}
              />
              <input
                placeholder="Name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
              <div className="admin-create-user-role-team">
                <select
                  value={editRole}
                  onChange={(event) => setEditRole(event.target.value as UserRow["role"])}
                  disabled={editingUser.role === "ADMIN" && adminCount <= 1}
                  title={editingUser.role === "ADMIN" && adminCount <= 1 ? "Cannot remove the last admin" : undefined}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="COACH">Coach</option>
                  <option value="PARENT">Parent</option>
                  <option value="TABLE_WORKER">Table Worker</option>
                </select>
                <select value={editTeamId} onChange={(event) => setEditTeamId(event.target.value)}>
                  <option value="">None</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatTeamName(t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-modal-actions">
              <button
                className="admin-btn admin-btn-ghost"
                type="button"
                onClick={closeEditUserModal}
                disabled={savingEditUser}
              >
                Cancel
              </button>
              <button
                className="admin-btn"
                type="submit"
                disabled={!canSaveEditedUser || savingEditUser}
              >
                {savingEditUser ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-table admin-users-table">
        <table cellPadding={8}>
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Team</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr className="admin-users-table-status-row">
                <td colSpan={8} className="admin-users-table-message">Loading...</td>
              </tr>
            ) : (
              <>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Username">{u.username}</td>
                    <td data-label="Name">{u.name ?? ""}</td>
                    <td data-label="Email">{u.email || ""}</td>
                    <td data-label="Phone">{u.phone ?? ""}</td>
                    <td data-label="Role">{formatRole(u.role)}</td>
                    <td data-label="Team">{getTeamLabel(u.teamId)}</td>
                    <td data-label="Last Login">{formatLastLogin(u.lastLoginAt)}</td>
                    <td data-label="Actions" className="admin-actions">
                      <button className="admin-btn admin-btn-ghost admin-btn-compact" type="button" onClick={() => openEditUserModal(u)}>Edit</button>
                      <button className="admin-btn admin-btn-ghost admin-btn-compact" type="button" onClick={() => resetPassword(u.id)}>Reset Password</button>
                      <button
                        className="admin-btn admin-btn-danger admin-btn-compact"
                        type="button"
                        onClick={() => deleteUser(u.id, u.username)}
                        disabled={u.role === "ADMIN" && adminCount <= 1}
                        title={u.role === "ADMIN" && adminCount <= 1 ? "Cannot delete the last admin" : undefined}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr className="admin-users-table-status-row">
                    <td colSpan={8} className="admin-users-table-message">No users found.</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatLastLogin(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatRole(role: UserRow["role"]) {
  if (role === "TABLE_WORKER") return "Table Worker";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function formatError(error: unknown) {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);

  const parts: string[] = [];
  for (const [key, value] of Object.entries(error)) {
    if (Array.isArray(value)) {
      parts.push(`${key}: ${value.join(", ")}`);
    } else if (value) {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.length ? parts.join(" | ") : "Invalid input.";
}
