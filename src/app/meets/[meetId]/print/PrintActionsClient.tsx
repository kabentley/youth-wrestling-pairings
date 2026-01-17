"use client";

export default function PrintActionsClient({ meetId }: { meetId: string }) {
  return (
    <div className="noprint" style={{ marginBottom: 12 }}>
      <a href={`/meets/${meetId}`}>&larr; Back</a> &nbsp;|&nbsp;
      <button type="button" onClick={() => window.print()}>Print</button>
    </div>
  );
}
