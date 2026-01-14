export const adminStyles = `
  :root {
    --bg: #eef1f4;
    --card: #ffffff;
    --ink: #1d232b;
    --muted: #5a6673;
    --accent: #1e88e5;
    --line: #d5dbe2;
    --danger: #c62828;
  }
  .admin {
    min-height: 100vh;
    background: var(--bg);
    color: var(--ink);
    font-family: "Source Sans 3", Arial, sans-serif;
    padding: 28px 18px 40px;
  }
  .admin-shell {
    width: 100%;
  }
  .admin-title {
    font-family: "Oswald", Arial, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin: 0;
  }
  .admin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .admin-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .admin-tab-bar {
    display: flex;
    gap: 4px;
    justify-content: flex-start;
    padding: 0 8px;
    background: #f1f3f7;
    border: 1px solid #d0d5df;
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    box-shadow: inset 0 -1px 0 rgba(13, 23, 66, 0.08);
  }
  .admin-tab-button {
    flex: none;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 600;
    color: #5f6772;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: 1px solid transparent;
    border-radius: 12px 12px 0 0;
    cursor: pointer;
    text-decoration: none;
  }
  .admin-tab-button:hover:not(.active) {
    background: #e5e9f0;
    color: #1e3a82;
  }
  .admin-tab-button.active {
    background: #fff;
    color: #1d232b;
    border-color: #d0d5df;
    border-bottom-color: #fff;
    box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.08);
  }
  .admin-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 18px;
  }
  .admin-card h3 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 20px;
  }
  .admin-form-grid {
    display: grid;
    gap: 16px;
  }
  .admin-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .admin-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .admin input,
  .admin select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 14px;
  }
  .admin-label {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted);
  }
  .admin-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .admin-row-tight {
    margin-top: 10px;
  }
  .admin-btn {
    border: 0;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
  }
  .admin-btn-ghost {
    background: #f2f5f8;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .admin-btn-danger {
    background: var(--danger);
  }
  .admin-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .admin-link-active {
    color: var(--ink);
    background: #f2f5f8;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 10px;
  }
  .admin-info {
    margin-top: 8px;
    color: var(--muted);
  }
  .admin-table {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: visible;
    background: #fff;
    margin-top: 12px;
  }
  .admin table {
    width: 100%;
    border-collapse: collapse;
  }
  .admin thead {
    background: #f7f9fb;
    text-align: left;
  }
  .admin th,
  .admin td {
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }
  .admin tbody tr:last-child td {
    border-bottom: 0;
  }
  .admin-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .admin-search {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(220px, 1fr) auto auto 1fr;
    align-items: center;
  }
  .admin-pager {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }
  .color-cell {
    position: relative;
    overflow: visible;
    z-index: 9999;
  }
  .logo-cell {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .logo-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .logo-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--line);
    border-radius: 6px;
    padding: 6px;
    background: #f7f9fb;
    cursor: pointer;
  }
  .file-input {
    display: none;
  }
  .logo-popover {
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
  .reset-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    z-index: 60;
  }
  .reset-modal {
    background: #ffffff;
    border-radius: 14px;
    padding: 24px;
    width: min(440px, 100%);
    box-shadow: 0 20px 40px rgba(13, 23, 66, 0.25);
  }
  .reset-modal h4 {
    margin: 0 0 8px;
    font-size: 20px;
  }
  .reset-message {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 13px;
  }
  .reset-confirm-term {
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .reset-confirm-input {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    margin-top: 6px;
    margin-bottom: 8px;
    font-size: 14px;
  }
  .reset-error {
    color: #b00020;
    font-size: 13px;
    margin-bottom: 8px;
  }
  .reset-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .color-actions {
    display: flex;
    gap: 8px;
  }
  .color-input {
    width: 44px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: transparent;
  }
  .admin-input-sm {
    width: 120px;
  }
  .admin-error {
    color: #b00020;
    margin: 10px 0;
  }
  .admin-logo {
    width: 64px;
    height: 64px;
    object-fit: contain;
  }
  .admin-team-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
  .admin-muted {
    font-size: 12px;
    color: var(--muted);
  }
  .admin-footer {
    margin-top: 12px;
  }
  @media (max-width: 900px) {
    .admin-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .admin-search {
      grid-template-columns: 1fr;
    }
  }
`;
