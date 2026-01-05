"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignInPage() {
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") ?? "/teams";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    const res = await signIn("credentials", {
      redirect: false,
      username,
      password,
      callbackUrl,
    });

    if (res?.error) {
      setErr("Sign-in failed. Check username/password.");
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h2>Sign in</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: "grid", gap: 10 }}
      >
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />{" "}
          Show password
        </label>
        <button onClick={submit}>Sign in</button>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          <div><Link href="/auth/forgot-password">Forgot password?</Link></div>
          Need an account? <Link href="/auth/signup">Create one</Link> (parent role).
        </div>
      </form>
    </main>
  );
}
