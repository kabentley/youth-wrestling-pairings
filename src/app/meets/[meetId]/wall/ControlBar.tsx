"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import PrintButton from "./PrintButton";

type ControlBarProps = {
  meetId?: string;
  printTargetRef?: RefObject<HTMLElement>;
  printStyles?: string;
};

export default function ControlBar({ meetId, printTargetRef, printStyles }: ControlBarProps) {
  const [scheme, setScheme] = useState<"color" | "black-and-white">("color");
  const userSetSchemeRef = useRef(false);

  useEffect(() => {
    if (!meetId) return;
    let cancelled = false;
    const loadPrintDefault = async () => {
      const meetRes = await fetch(`/api/meets/${meetId}`, { cache: "no-store" });
      if (!meetRes.ok) return;
      const meet = await meetRes.json().catch(() => null);
      const homeTeamId = typeof meet?.homeTeamId === "string" ? meet.homeTeamId : null;
      if (!homeTeamId) return;
      const teamRes = await fetch(`/api/teams/${homeTeamId}`, { cache: "no-store" });
      if (!teamRes.ok) return;
      const team = await teamRes.json().catch(() => null);
      if (cancelled || userSetSchemeRef.current) return;
      const printInColor = typeof team?.printBoutSheetsInColor === "boolean" ? team.printBoutSheetsInColor : false;
      setScheme(printInColor ? "color" : "black-and-white");
    };
    void loadPrintDefault();
    return () => {
      cancelled = true;
    };
  }, [meetId]);

  useEffect(() => {
    const root = document.documentElement;
    if (scheme === "black-and-white") {
      root.classList.add("black-and-white");
    } else {
      root.classList.remove("black-and-white");
    }
    return () => {
      root.classList.remove("black-and-white");
    };
  }, [scheme]);

  return (
    <div className="chart-controls">
      <label htmlFor="color-scheme" className="select-label">
        <span className="sr-only">Color mode</span>
        <select
          id="color-scheme"
          value={scheme}
          onChange={event => {
            userSetSchemeRef.current = true;
            setScheme(event.target.value as "color" | "black-and-white");
          }}
        >
          <option value="color">Color</option>
          <option value="black-and-white">Black and white</option>
        </select>
      </label>
      <PrintButton
        meetId={meetId}
        targetRef={printTargetRef}
        styles={printStyles}
        title={'Tip: turn off "Headers and footers" in the print settings.'}
      />
    </div>
  );
}
