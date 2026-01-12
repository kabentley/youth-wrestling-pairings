"use client";

import { useEffect, useState, type RefObject } from "react";

import PrintButton from "./PrintButton";

type ControlBarProps = {
  printTargetRef?: RefObject<HTMLElement>;
  printStyles?: string;
};

export default function ControlBar({ printTargetRef, printStyles }: ControlBarProps) {
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
      <PrintButton targetRef={printTargetRef} styles={printStyles} />
    </div>
  );
}
