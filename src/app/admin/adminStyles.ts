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
  .admin-users-header {
    justify-content: flex-start;
  }
  .admin-create-user-trigger {
    margin-left: 8px;
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
  .admin-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
  .admin-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1200;
  }
  .admin-modal {
    width: min(560px, 100%);
    max-height: calc(100vh - 32px);
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: #fff;
    display: flex;
    flex-direction: column;
  }
  .admin-modal h4 {
    margin: 0;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 18px;
  }
  .admin-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding: 12px 16px;
  }
  .admin-create-user-modal {
    width: min(520px, 100%);
  }
  .admin-create-user-modal-grid {
    padding: 10px 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(160px, 1fr));
    gap: 8px;
    align-items: start;
  }
  .admin-edit-user-modal-grid {
    padding: 10px 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(160px, 1fr));
    gap: 8px;
    align-items: start;
  }
  .admin-create-user-modal-grid input,
  .admin-create-user-modal-grid select,
  .admin-edit-user-modal-grid input,
  .admin-edit-user-modal-grid select {
    border-radius: 6px;
    padding: 8px 10px;
    min-width: 0;
    height: 40px;
  }
  .admin-create-user-role-team {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-column: 1 / -1;
  }
  .admin-create-user-password {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .admin-create-user-password input {
    flex: 1 1 auto;
    min-width: 0;
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
  .admin-users-table th,
  .admin-users-table td {
    padding: 5px 8px;
    line-height: 1.05;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .admin-users-table {
    width: min(1500px, 100%);
    overflow-x: auto;
  }
  .admin-users-controls {
    width: min(1500px, 100%);
    margin-bottom: 0;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .admin-users-controls + .admin-users-table {
    margin-top: 0;
    border-top: 0;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
  .admin-users-controls + .admin-notifications-table {
    margin-top: 0;
    border-top: 0;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
  .admin-users-table table {
    table-layout: fixed;
    width: 100%;
    min-width: 1200px;
  }
  .admin-notifications-table {
    width: min(1700px, 100%);
    overflow-x: auto;
  }
  .admin-notifications-table table {
    table-layout: fixed;
    width: 100%;
    min-width: 1600px;
  }
  .admin-notifications-table th:nth-child(1),
  .admin-notifications-table td:nth-child(1) {
    width: 14%;
  }
  .admin-notifications-table th:nth-child(2),
  .admin-notifications-table td:nth-child(2) {
    width: 10%;
  }
  .admin-notifications-table th:nth-child(3),
  .admin-notifications-table td:nth-child(3) {
    width: 16%;
  }
  .admin-notifications-table th:nth-child(4),
  .admin-notifications-table td:nth-child(4) {
    width: 6%;
  }
  .admin-notifications-table th:nth-child(5),
  .admin-notifications-table td:nth-child(5) {
    width: 8%;
  }
  .admin-notifications-table th:nth-child(6),
  .admin-notifications-table td:nth-child(6) {
    width: 12%;
  }
  .admin-notifications-table th:nth-child(7),
  .admin-notifications-table td:nth-child(7) {
    width: 12%;
  }
  .admin-notifications-table th:nth-child(8),
  .admin-notifications-table td:nth-child(8) {
    width: 10%;
  }
  .admin-notifications-table th:nth-child(9),
  .admin-notifications-table td:nth-child(9) {
    width: 22%;
  }
  .admin-users-table th:nth-child(1),
  .admin-users-table td:nth-child(1) {
    width: 10%;
  }
  .admin-users-table th:nth-child(2),
  .admin-users-table td:nth-child(2) {
    width: 13%;
  }
  .admin-users-table th:nth-child(3),
  .admin-users-table td:nth-child(3) {
    width: 17%;
  }
  .admin-users-table th:nth-child(4),
  .admin-users-table td:nth-child(4) {
    width: 10%;
  }
  .admin-users-table th:nth-child(5),
  .admin-users-table td:nth-child(5) {
    width: 8%;
  }
  .admin-users-table th:nth-child(6),
  .admin-users-table td:nth-child(6) {
    width: 6%;
  }
  .admin-users-table th:nth-child(7),
  .admin-users-table td:nth-child(7) {
    width: 14%;
  }
  .admin-users-table th:nth-child(8),
  .admin-users-table td:nth-child(8) {
    width: 22%;
    overflow: visible;
    text-overflow: clip;
  }
  .admin-users-table .admin-actions {
    flex-wrap: nowrap;
    gap: 6px;
    min-width: max-content;
  }
  .admin-btn-compact {
    padding: 4px 8px;
    font-size: 12px;
    line-height: 1.1;
  }
  .admin-search {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .admin-search-filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: nowrap;
    overflow-x: auto;
    min-width: 0;
    flex: 1 1 auto;
  }
  .admin-search-filters > input {
    width: 320px;
    max-width: 100%;
    flex: 0 1 auto;
  }
  .admin-search-filters > select,
  .admin-search-filters > button {
    width: auto;
    flex: 0 0 auto;
  }
  .admin-search-submit {
    margin-left: 0;
    height: 40px;
    display: inline-flex;
    align-items: center;
    min-width: 96px;
    justify-content: center;
  }
  .admin-search-summary {
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .admin-pager {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }
  .admin-pager-status {
    margin-left: 6px;
    white-space: nowrap;
    color: var(--muted);
    font-size: inherit;
  }
  .admin-code {
    font-family: "Courier New", Courier, monospace;
    word-break: break-all;
  }
  .admin-status {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: #f7f9fb;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .admin-status-sent {
    background: #e8f5e9;
    border-color: #a5d6a7;
    color: #256029;
  }
  .admin-status-logged {
    background: #e3f2fd;
    border-color: #90caf9;
    color: #0d47a1;
  }
  .admin-status-failed {
    background: #ffebee;
    border-color: #ef9a9a;
    color: #b71c1c;
  }
  .admin-status-skipped {
    background: #f3f4f6;
    border-color: #d1d5db;
    color: #4b5563;
  }
  .admin-notification-message-cell {
    white-space: normal;
  }
  .admin-notification-message {
    white-space: pre-wrap;
    line-height: 1.25;
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
      flex-direction: column;
      align-items: stretch;
    }
    .admin-search-summary {
      white-space: normal;
    }
    .admin-create-user-modal-grid {
      grid-template-columns: 1fr;
    }
    .admin-edit-user-modal-grid {
      grid-template-columns: 1fr;
    }
    .admin-create-user-role-team {
      grid-column: auto;
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .admin {
      padding: 18px 10px 28px;
    }
    .admin-users-header {
      align-items: stretch;
    }
    .admin-create-user-trigger {
      margin-left: 0;
      width: 100%;
    }
    .admin-users-controls {
      width: 100%;
    }
    .admin-search-filters {
      flex-wrap: wrap;
      overflow: visible;
      gap: 8px;
    }
    .admin-search-filters > input,
    .admin-search-filters > select,
    .admin-search-filters > button {
      width: 100%;
      flex: 1 1 100%;
    }
    .admin-search-submit {
      width: 100%;
      min-width: 0;
      height: 40px;
    }
    .admin-pager {
      flex-wrap: wrap;
      gap: 8px;
    }
    .admin-pager-status {
      margin-left: 0;
      width: 100%;
    }
    .admin-users-table {
      width: 100%;
      overflow: visible;
    }
    .admin-notifications-table {
      width: 100%;
      overflow: visible;
    }
    .admin-users-table table {
      min-width: 0;
      table-layout: auto;
    }
    .admin-notifications-table table {
      min-width: 0;
      table-layout: auto;
    }
    .admin-users-table thead {
      display: none;
    }
    .admin-notifications-table thead {
      display: none;
    }
    .admin-users-table tbody {
      display: grid;
      gap: 10px;
      padding: 8px;
    }
    .admin-notifications-table tbody {
      display: grid;
      gap: 10px;
      padding: 8px;
    }
    .admin-users-table tbody tr {
      display: block;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: #fff;
    }
    .admin-notifications-table tbody tr {
      display: block;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: #fff;
    }
    .admin-users-table tbody tr td {
      width: 100% !important;
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 8px;
      padding: 6px 4px;
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      border-bottom: 1px dashed #e4e9f0;
      line-height: 1.25;
      word-break: normal;
      overflow-wrap: anywhere;
    }
    .admin-notifications-table tbody tr td {
      width: 100% !important;
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 8px;
      padding: 6px 4px;
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      border-bottom: 1px dashed #e4e9f0;
      line-height: 1.25;
      word-break: normal;
      overflow-wrap: anywhere;
    }
    .admin-users-table th:nth-child(1),
    .admin-users-table td:nth-child(1),
    .admin-users-table th:nth-child(2),
    .admin-users-table td:nth-child(2),
    .admin-users-table th:nth-child(3),
    .admin-users-table td:nth-child(3),
    .admin-users-table th:nth-child(4),
    .admin-users-table td:nth-child(4),
    .admin-users-table th:nth-child(5),
    .admin-users-table td:nth-child(5),
    .admin-users-table th:nth-child(6),
    .admin-users-table td:nth-child(6),
    .admin-users-table th:nth-child(7),
    .admin-users-table td:nth-child(7),
    .admin-users-table th:nth-child(8),
    .admin-users-table td:nth-child(8) {
      width: auto;
      max-width: none;
    }
    .admin-notifications-table th:nth-child(1),
    .admin-notifications-table td:nth-child(1),
    .admin-notifications-table th:nth-child(2),
    .admin-notifications-table td:nth-child(2),
    .admin-notifications-table th:nth-child(3),
    .admin-notifications-table td:nth-child(3),
    .admin-notifications-table th:nth-child(4),
    .admin-notifications-table td:nth-child(4),
    .admin-notifications-table th:nth-child(5),
    .admin-notifications-table td:nth-child(5),
    .admin-notifications-table th:nth-child(6),
    .admin-notifications-table td:nth-child(6),
    .admin-notifications-table th:nth-child(7),
    .admin-notifications-table td:nth-child(7),
    .admin-notifications-table th:nth-child(8),
    .admin-notifications-table td:nth-child(8),
    .admin-notifications-table th:nth-child(9),
    .admin-notifications-table td:nth-child(9) {
      width: auto;
      max-width: none;
    }
    .admin-users-table tbody tr td:last-child {
      border-bottom: 0;
    }
    .admin-notifications-table tbody tr td:last-child {
      border-bottom: 0;
    }
    .admin-users-table tbody tr td::before {
      content: attr(data-label);
      color: var(--muted);
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .admin-notifications-table tbody tr td::before {
      content: attr(data-label);
      color: var(--muted);
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .admin-users-table tbody tr td.admin-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 8px;
    }
    .admin-users-table tbody tr td.admin-actions::before {
      content: none;
    }
    .admin-users-table .admin-actions .admin-btn {
      flex: 1 1 calc(50% - 6px);
      min-width: 120px;
    }
    .admin-users-table .admin-actions .admin-btn-danger {
      flex-basis: 100%;
    }
    .admin-users-table .admin-users-table-status-row {
      border: 0;
      border-radius: 0;
      padding: 0;
      background: transparent;
    }
    .admin-users-table .admin-users-table-message {
      display: block;
      padding: 10px 4px;
      border-bottom: 0;
      color: var(--muted);
    }
    .admin-users-table .admin-users-table-message::before {
      content: none;
    }
  }
`;
