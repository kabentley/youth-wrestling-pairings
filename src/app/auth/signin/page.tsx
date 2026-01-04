"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SignInPage() {
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/teams";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
      totp,
      callbackUrl,
    });

    if (res?.error) {
      setErr("Sign-in failed. Check email/password, and if MFA is enabled, enter the 6-digit code.");
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h2>Sign in</h2>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="text"
          placeholder="MFA code (if enabled)"
          value={totp}
          onChange={(e) => setTotp(e.target.value)}
        />

        <button onClick={submit}>Sign in</button>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          If you need an account, ask your admin to create one (or use the seeded admin user).
        </div>
      </div>
    </main>
  );
}
