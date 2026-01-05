"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      Print
    </button>
  );
}
