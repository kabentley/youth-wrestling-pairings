"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

export const NAMED_COLORS = [
  { name: "Navy", value: "#0d3b66" },
  { name: "Royal Blue", value: "#1e88e5" },
  { name: "Sky Blue", value: "#64b5f6" },
  { name: "Teal", value: "#00897b" },
  { name: "Turquoise", value: "#00acc1" },
  { name: "Green", value: "#2e7d32" },
  { name: "Forest", value: "#1b5e20" },
  { name: "Lime", value: "#9ccc65" },
  { name: "Gold", value: "#f2b705" },
  { name: "Amber", value: "#ffb300" },
  { name: "Orange", value: "#f57c00" },
  { name: "Deep Orange", value: "#e64a19" },
  { name: "Red", value: "#c62828" },
  { name: "Crimson", value: "#d32f2f" },
  { name: "Maroon", value: "#8e1037" },
  { name: "Purple", value: "#5e35b1" },
  { name: "Indigo", value: "#3949ab" },
  { name: "Magenta", value: "#ad1457" },
  { name: "Gray", value: "#546e7a" },
  { name: "Slate", value: "#455a64" },
  { name: "Black", value: "#1d232b" },
];

export type ColorPickerProps = {
  value?: string | null;
  onChange: (color: string) => void;
  idPrefix: string;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  buttonAriaLabel?: string;
  showNativeColorInput?: boolean;
  showSwatches?: boolean;
};

export default function ColorPicker({
  value,
  onChange,
  idPrefix,
  buttonClassName,
  buttonStyle,
  buttonAriaLabel,
  showNativeColorInput = true,
  showSwatches = true,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const normalizedValue = (value ?? "").trim();
  const activeColor = normalizedValue || "";

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleChange = (next: string, close = false) => {
    onChange(next);
    if (close) setOpen(false);
  };

  const handleButtonClick = () => setOpen((prev) => !prev);

  return (
    <div className="color-picker">
      <button
        type="button"
        ref={triggerRef}
        className={buttonClassName}
        style={buttonStyle}
        aria-label={buttonAriaLabel ?? "Choose color"}
        onClick={handleButtonClick}
      >
        &nbsp;
      </button>
      {open && (
        <div className="color-popover" ref={popoverRef}>
          {showNativeColorInput && (
            <>
              <label className="picker-label" htmlFor={`${idPrefix}-custom`}>
                Custom color
              </label>
              <input
                id={`${idPrefix}-custom`}
                className="color-input"
                type="color"
                value={activeColor || "#000000"}
                onChange={(event) => handleChange(event.target.value)}
              />
            </>
          )}
          {showSwatches && (
            <div className="swatch-grid">
              {NAMED_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className="swatch"
                  style={{ backgroundColor: color.value }}
                  onClick={() => handleChange(color.value, true)}
                >
                  &nbsp;
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <style jsx>{`
        .color-picker {
          position: relative;
          display: inline-flex;
        }
        .color-picker button {
          border: 0;
          background: transparent;
          padding: 0;
        }
        .color-swatch {
          width: 38px;
          height: 24px;
          border-radius: 4px;
          border: 1px solid var(--line);
          cursor: pointer;
        }
        .color-popover {
          position: absolute;
          z-index: 20;
          top: 30px;
          left: 0;
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 10px;
          min-width: 200px;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
          display: grid;
          gap: 8px;
        }
        .picker-label {
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
        }
        .color-input {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 13px;
          background: #fff;
          width: 100%;
        }
        .color-input[type="color"] {
          padding: 0;
          height: 38px;
        }
        .color-popover select {
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 13px;
          background: #fff;
        }
        .swatch-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
        }
        .swatch {
          width: 22px;
          height: 22px;
          border-radius: 4px;
          border: 1px solid rgba(0, 0, 0, 0.18);
          cursor: pointer;
          padding: 0;
        }
      `}</style>
    </div>
  );
}
