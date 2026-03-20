function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type PasswordResetEmailContent = {
  subject: string;
  text: string;
  html: string;
};

export function buildPasswordResetEmailContent({
  code,
  expiresInMinutes = 15,
}: {
  code: string;
  expiresInMinutes?: number;
}): PasswordResetEmailContent {
  const normalizedCode = code.trim();
  const normalizedMinutes = Number.isFinite(expiresInMinutes) && expiresInMinutes > 0
    ? Math.round(expiresInMinutes)
    : 15;
  const subject = "Your password reset code";
  const text = `Your password reset code is ${normalizedCode}. It expires in ${normalizedMinutes} minutes.`;
  const html = `
    <div style="background:#f4f7fb;padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d9e1e8;border-radius:18px;overflow:hidden;">
        <div style="padding:24px 24px 18px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);border-bottom:1px solid #e7edf3;">
          <div style="font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#5a6673;">Password Reset</div>
          <h1 style="margin:8px 0 0;font-size:30px;line-height:1.1;color:#243041;">Your reset code</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0;font-size:16px;line-height:1.5;color:#243041;">
            Use the code below to reset your password. It expires in ${escapeHtml(String(normalizedMinutes))} minutes.
          </p>
          <div style="margin-top:20px;padding:18px 20px;border:1px solid #d9e1e8;border-radius:14px;background:#f7f9fc;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5a6673;">Reset Code</div>
            <div style="margin-top:8px;font-size:36px;line-height:1;font-weight:800;letter-spacing:0.18em;color:#243041;">${escapeHtml(normalizedCode)}</div>
          </div>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.5;color:#5a6673;">
            If you did not request a password reset, you can ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}
