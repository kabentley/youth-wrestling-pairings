"use client";

export default function PrintButton() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <button type="button" onClick={handlePrint}>
      Print
    </button>
  );
}
