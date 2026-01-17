import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MEET_LOCK_TTL_MS } from "@/lib/meetLock";

export type LockState = {
  status: "loading" | "acquired" | "locked";
  lockedByUsername?: string | null;
  lockExpiresAt?: string | null;
};

interface UseMeetLockOptions {
  meetId: string;
  meetStatus: "DRAFT" | "PUBLISHED";
  meetLoaded: boolean;
}

export function useMeetLock({ meetId, meetStatus, meetLoaded }: UseMeetLockOptions) {
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });
  const [lockMessage, setLockMessage] = useState("");
  const lockStatusRef = useRef<LockState["status"]>("loading");

  const acquireLock = useCallback(async () => {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      lockStatusRef.current = "acquired";
      setLockState({ status: "acquired", lockExpiresAt: data.lockExpiresAt });
      return;
    }
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      lockStatusRef.current = "locked";
      setLockState({ status: "locked", lockedByUsername: data.lockedByUsername ?? null, lockExpiresAt: data.lockExpiresAt ?? null });
      return;
    }
    if (res.status === 401 || res.status === 403) {
      const json = await res.json().catch(() => ({}));
      setLockMessage(json?.error ?? "You are not authorized to edit meets.");
    }
  }, [meetId]);

  const releaseLock = useCallback(() => {
    fetch(`/api/meets/${meetId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
  }, [meetId]);

  useEffect(() => {
    if (!meetLoaded) {
      return;
    }
    if (meetStatus !== "DRAFT") {
      if (lockStatusRef.current === "acquired") {
        releaseLock();
      }
      lockStatusRef.current = "locked";
      setLockState({ status: "locked", lockedByUsername: null });
      return;
    }
    void acquireLock();
    const interval = setInterval(() => {
      if (lockStatusRef.current === "acquired") {
        void acquireLock();
      }
    }, 60_000);
    const onBeforeUnload = () => releaseLock();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseLock();
    };
  }, [acquireLock, meetId, meetLoaded, meetStatus, releaseLock]);

  const lockIndicatorText = useMemo(() => {
    if (lockState.status === "acquired") {
      if (lockState.lockExpiresAt) {
        const expires = new Date(lockState.lockExpiresAt);
        if (!Number.isNaN(expires.getTime())) {
          return `Lock held until ${expires.toLocaleTimeString()}`;
        }
      }
      return "Lock held";
    }
    if (lockState.status === "locked") {
      return `Locked by ${lockState.lockedByUsername ?? "another user"}`;
    }
    return "Checking lock";
  }, [lockState]);

  const releaseLockNow = useCallback(() => {
    releaseLock();
    lockStatusRef.current = "locked";
    setLockState({ status: "locked", lockedByUsername: null });
    setLockMessage("Lock released; another editor can now take over.");
  }, [releaseLock]);

  return {
    lockState,
    lockMessage,
    lockIndicatorText,
    releaseLockNow,
  };
}
