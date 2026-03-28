const nodemailer = require("nodemailer");
require("dotenv").config();

const smtpHost = process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io";
const smtpUser = process.env.MAILTRAP_SMTP_USER || "";
const smtpPass = process.env.MAILTRAP_SMTP_PASS || "";

function createTransporter(port, secure) {
  return nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

async function sendWithFallback(mailOptions) {
  const primaryPort = Number(process.env.MAILTRAP_PORT || 2525);
  const candidates = [
    { port: primaryPort, secure: primaryPort === 465 },
    { port: 2525, secure: false },
    { port: 587, secure: false },
    { port: 465, secure: true },
  ];

  const deduped = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = `${item.port}-${item.secure}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  const errors = [];
  for (const candidate of deduped) {
    try {
      const transporter = createTransporter(candidate.port, candidate.secure);
      return await transporter.sendMail(mailOptions);
    } catch (error) {
      errors.push(`port ${candidate.port}: ${error.message}`);
    }
  }

  throw new Error(
    `khong the ket noi Mailtrap SMTP. Chi tiet: ${errors.join(" | ")}`,
  );
}

module.exports = {
  sendMail: async (to, url) => {
    const info = await sendWithFallback({
      from: process.env.MAIL_FROM || "admin@haha.com",
      to: to,
      subject: "RESET PASSWORD REQUEST",
      text: "lick vo day de doi pass", // Plain-text version of the message
      html: "lick vo <a href=" + url + ">day</a> de doi pass", // HTML version of the message
    });

    console.log("Message sent:", info.messageId);
  },
  sendAccountCredentialsMail: async (to, username, password) => {
    const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thong Tin Tai Khoan</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e,#0ea5e9);padding:28px 28px 24px;">
              <p style="margin:0;color:#d1fae5;letter-spacing:.08em;font-size:12px;font-weight:700;">WELCOME</p>
              <h1 style="margin:10px 0 0;color:#ffffff;font-size:24px;line-height:1.3;">Tai khoan cua ban da duoc tao</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">He thong da tao tai khoan moi cho ban. Vui long dang nhap bang thong tin ben duoi:</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#f9fafb;">
                <tr>
                  <td style="padding:14px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Username</td>
                  <td style="padding:14px 16px;font-size:14px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb;">${username}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;font-size:14px;color:#6b7280;">Mat khau tam</td>
                  <td style="padding:14px 16px;font-size:14px;color:#111827;font-weight:700;letter-spacing:.04em;">${password}</td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#374151;">Khuyen nghi: Doi mat khau ngay sau lan dang nhap dau tien de bao mat tai khoan.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 26px;background:#f8fafc;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Email tu dong tu he thong. Vui long khong tra loi email nay.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const info = await sendWithFallback({
      from: process.env.MAIL_FROM || "admin@haha.com",
      to: to,
      subject: "THONG TIN TAI KHOAN",
      text: `Tai khoan cua ban da duoc tao. Username: ${username}. Mat khau tam: ${password}. Vui long doi mat khau sau lan dang nhap dau tien.`,
      html: html,
    });

    console.log("Message sent:", info.messageId);
  },
};
