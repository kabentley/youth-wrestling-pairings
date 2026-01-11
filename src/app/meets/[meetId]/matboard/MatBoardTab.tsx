"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Team = { id: string; name: string; symbol?: string; color?: string };
type Wrestler = { id: string; first: string; last: string; weight: number; teamId: string; status?: "LATE" | "EARLY" | "NOT_COMING" | "ABSENT" | null };
type Bout = {
  id: string;
  redId: string;
  greenId: string;
  type: string;
  score: number;
  task?: string;
  mat?: number | null;
  order?: number | null;
};
type LockState = {
  status: "loading" | "acquired" | "locked";
  lockedByUsername?: string | null;
  lockExpiresAt?: string | null;
};

const heading = "Mat Board";

export default function MatBoardTab({ meetId }: { meetId: string }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [wMap, setWMap] = useState<Record<string, Wrestler | undefined>>({});
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [numMats, setNumMats] = useState(4);
  const [conflictGap, setConflictGap] = useState(3);
  const [lockState, setLockState] = useState<LockState>({ status: "loading" });

  useEffect(() => {
    void load();
    void acquireLock();
    const interval = setInterval(() => {
      if (lockState.status === "acquired") {
        void acquireLock();
      }
    }, 60000);
    const onUnload = () => releaseLock();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      releaseLock();
    };
  }, [meetId]);

  async function load() {
    const [bRes, wRes] = await Promise.all([
      fetch(`/api/meets/${meetId}/pairings`),
      fetch(`/api/meets/${meetId}/wrestlers`),
    ]);
    if (!bRes.ok || !wRes.ok) return;
    const bJson = await bRes.json();
    setBouts(bJson);
    const wJson = await wRes.json();
    setTeams(wJson.teams);
    const map: Record<string, Wrestler> = {};
    for (const w of wJson.wrestlers as Wrestler[]) map[w.id] = w;
    setWMap(map);
    const maxMat = Math.max(0, ...bJson.map((b: Bout) => b.mat ?? 0));
    setNumMats(maxMat > 0 ? maxMat : 4);
  }

  async function acquireLock() {
    const res = await fetch(`/api/meets/${meetId}/lock`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setLockState({ status: "acquired", lockExpiresAt: data.lockExpiresAt });
    } else if (res.status === 409) {
      const data = await res.json();
      setLockState({ status: "locked", lockedByUsername: data.lockedByUsername });
    }
  }

  function releaseLock() {
    fetch(`/api/meets/${meetId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
  }

  const mats = useMemo(() => {
    const result: Record<string, Bout[]> = {};
    for (let m = 1; m <= numMats; m++) result[String(m)] = [];
    for (const b of bouts) {
      const mat = Math.min(Math.max(b.mat ?? 1, 1), numMats);
      result[String(mat)]?.push(b);
    }
    for (const list of Object.values(result)) list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    return result;
  }, [bouts, numMats]);

  return (
    <section className="matboard-tab">
      <h3>{heading}</h3>
      <div>
        {Object.entries(mats).map(([mat, list]) => (
          <div key={mat}>
            <h4>Mat {mat}</h4>
            <ul>
              {list.map(b => (
                <li key={b.id}>{b.redId} vs {b.greenId}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
