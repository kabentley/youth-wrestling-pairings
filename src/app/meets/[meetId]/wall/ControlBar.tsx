 "use client";

import { useEffect, useState } from "react";
import PrintButton from "./PrintButton";

type ControlBarProps = {
  label: string;
};

export default function ControlBar({ label }: ControlBarProps) {
  const [scheme, setScheme] = useState<"color" | "black-and-white">("color");

  useEffect(() => {
    const pending = sessionStorage.getItem("wallChartsPrint");
    if (pending) {
      sessionStorage.removeItem("wallChartsPrint");
      window.print();
    }
  }, []);

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

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="chart-controls">
      <div className="meet-heading">{label}</div>
      <button type="button" className="refresh-btn" onClick={handleRefresh}>
        Refresh
      </button>
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
      <PrintButton />
    </div>
  );
}
