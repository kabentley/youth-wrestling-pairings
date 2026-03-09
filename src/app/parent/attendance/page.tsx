import ParentAttendancePanel from "@/components/parent/ParentAttendancePanel";

export default function ParentAttendancePage() {
  return (
    <main className="attendance-page">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        .attendance-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top right, rgba(30, 136, 229, 0.12), transparent 32%),
            linear-gradient(180deg, #eef3f7 0%, #f8fafc 100%);
          color: #1d232b;
          font-family: "Source Sans 3", Arial, sans-serif;
          padding: 22px 16px 40px;
        }
        @media (min-width: 640px) {
          .attendance-page {
            padding: 28px 22px 48px;
          }
        }
      `}</style>
      <ParentAttendancePanel />
    </main>
  );
}
