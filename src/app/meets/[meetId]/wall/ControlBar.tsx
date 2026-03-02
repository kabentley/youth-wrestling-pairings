"use client";

import { useEffect, useState, type RefObject } from "react";

import PrintButton from "./PrintButton";

type ControlBarProps = {
  meetId?: string;
  printTargetRef?: RefObject<HTMLElement>;
  printStyles?: string;
};

export default function ControlBar({ meetId, printTargetRef, printStyles }: ControlBarProps) {
  const [scheme, setScheme] = useState<"color" | "black-and-white">("color");

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
      <span
        style={{
          fontSize: 16,
          color: "#444",
          whiteSpace: "nowrap",
          fontWeight: 700,
          lineHeight: 1.2,
          fontFamily: "\"Segoe UI\", Arial, sans-serif",
        }}
      >
        Tip: turn off "Headers and footers" in the print settings.
      </span>
      <label htmlFor="color-scheme" className="select-label">
        <span className="sr-only">Color mode</span>
        <select
          id="color-scheme"
          value={scheme}
          onChange={event => setScheme(event.target.value as "color" | "black-and-white")}
        >
          <option value="color">Color</option>
          <option value="black-and-white">Black and white</option>
        </select>
      </label>
      <PrintButton meetId={meetId} targetRef={printTargetRef} styles={printStyles} />
    </div>
  );
}
