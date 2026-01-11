"use client";

export default function PrintButton() {
  const handlePrint = () => {
    sessionStorage.setItem("wallChartsPrint", "1");
    window.location.reload();
  };

  return (
    <button type="button" onClick={handlePrint}>
      Print
    </button>
  );
}
