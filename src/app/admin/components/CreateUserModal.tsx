"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { formatTeamName } from "@/lib/formatTeamName";

type TeamRow = { id: string; name: string; symbol: string };
type UserRole = "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
type CreatedUser = {
  id: string;
  username?: string;
  name?: string | null;
  teamId?: string | null;
  role?: UserRole;
};

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

export default function CreateUserModal({
  isOpen,
  teams,
  defaultTeamId = "",
  defaultRole = "COACH",
  lockTeamSelection = false,
  lockRoleSelection = false,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  teams: TeamRow[];
  defaultTeamId?: string;
  defaultRole?: UserRole;
  lockTeamSelection?: boolean;
  lockRoleSelection?: boolean;
  onClose: () => void;
  onCreated?: (user: CreatedUser) => Promise<void> | void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [teamId, setTeamId] = useState<string>("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const usernameSuggestReqRef = useRef(0);

  function resetForm(nextDefaultTeamId = "") {
    usernameSuggestReqRef.current += 1;
    setUsername("");
    setUsernameEdited(false);
    setEmail("");
    setPhone("");
    setFirstName("");
    setLastName("");
    setPassword("");
    setRole(defaultRole);
    setTeamId(nextDefaultTeamId);
    setErrorMsg("");
  }

  useEffect(() => {
    if (!isOpen) return;
    resetForm(defaultTeamId);
  }, [isOpen, defaultRole, defaultTeamId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creatingUser) {
        usernameSuggestReqRef.current += 1;
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [creatingUser, isOpen, onClose]);

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

  useEffect(() => {
    if (!isOpen || usernameEdited) return;
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
  }, [firstName, isOpen, lastName, usernameEdited]);

  function generatePassword() {
    const digits = "0123456789";
    let out = "";
    for (let i = 0; i < 6; i += 1) {
      out += digits[Math.floor(Math.random() * digits.length)];
    }
    setPassword(out);
  }

  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>) {
    usernameSuggestReqRef.current += 1;
    setUsername(event.target.value);
    setUsernameEdited(true);
  }

  async function createUser() {
    setErrorMsg("");
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
      setErrorMsg("Fill all required fields with valid values.");
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
        setErrorMsg(formatError(data?.error) ?? "Unable to create user.");
        return;
      }
      await onCreated?.(data as CreatedUser);
      onClose();
    } catch {
      setErrorMsg("Unable to create user.");
    } finally {
      setCreatingUser(false);
    }
  }

  if (!isOpen) return null;

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

  return (
    <div className="admin-modal-backdrop" onClick={() => { if (!creatingUser) onClose(); }}>
      <div
        className="admin-modal admin-create-user-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create New User"
      >
        <h4>Create New User</h4>
        <div className="admin-create-user-modal-grid">
          <input placeholder="First Name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          <input placeholder="Last Name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
          <input placeholder="Username" value={username} onChange={handleUsernameChange} />
          <input
            placeholder="Email (optional)"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
          <input placeholder="Phone (optional)" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <div className="admin-create-user-password">
            <input
              placeholder="Temporary Password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
            <button className="admin-btn admin-btn-ghost" type="button" onClick={generatePassword} disabled={creatingUser}>
              Generate
            </button>
          </div>
          <div className="admin-create-user-role-team">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              disabled={lockRoleSelection || creatingUser}
            >
              <option value="ADMIN">Admin</option>
              <option value="COACH">Coach</option>
              <option value="PARENT">Parent</option>
              <option value="TABLE_WORKER">Table Worker</option>
            </select>
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              disabled={lockTeamSelection || creatingUser}
            >
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {formatTeamName(team)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {errorMsg && <div className="admin-error" style={{ margin: "0 16px 8px" }}>{errorMsg}</div>}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-ghost" type="button" onClick={onClose} disabled={creatingUser}>
            Cancel
          </button>
          <button className="admin-btn" type="button" onClick={() => void createUser()} disabled={!canCreateUser || creatingUser}>
            {creatingUser ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
