/**
 * lib/gmailAuth.js
 * Gmail API transactional email using OAuth2.
 * Server-side only — import only in API routes.
 *
 * NO SMTP — uses Gmail REST API via googleapis package.
 *
 * Prerequisites:
 *   1. Enable Gmail API in Google Cloud Console
 *   2. Create OAuth2 credentials (Desktop or Web app)
 *   3. Authorise once using the consent flow to get a refresh token
 *   4. Set GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET,
 *      GMAIL_OAUTH_REFRESH_TOKEN in .env.local
 *
 * How to get a refresh token (one-time setup):
 *   → Run scripts/gmail-get-token.js locally (provided below)
 */
import { google } from 'googleapis';

const {
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_OAUTH_REFRESH_TOKEN,
  GMAIL_SENDER_ADDRESS,
} = process.env;

if (!GMAIL_OAUTH_CLIENT_ID || !GMAIL_OAUTH_CLIENT_SECRET || !GMAIL_OAUTH_REFRESH_TOKEN) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[gmail] Missing Gmail OAuth2 environment variables');
  }
}

/**
 * Returns an authenticated Gmail API client.
 * Access token is refreshed automatically from the stored refresh token.
 */
export function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    GMAIL_OAUTH_CLIENT_ID,
    GMAIL_OAUTH_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground', // redirect used during token generation
  );

  oauth2Client.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Encode an email in base64url format (required by Gmail API).
 */
function encodeEmail({ to, subject, html, text }) {
  const from = `CafeQR <${GMAIL_SENDER_ADDRESS}>`;
  const boundary = `cafeqr_${Date.now()}`;

  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    text || '',
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    html || '',
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(raw).toString('base64url');
}

/**
 * Send a transactional email via Gmail API.
 *
 * @param {object} opts
 * @param {string} opts.to       Recipient email address
 * @param {string} opts.subject  Email subject
 * @param {string} opts.html     HTML body
 * @param {string} [opts.text]   Plain-text fallback body
 */
export async function sendEmail({ to, subject, html, text }) {
  const gmail = getGmailClient();
  const raw   = encodeEmail({ to, subject, html, text });

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  console.log(`[gmail] Email sent to ${to} → messageId: ${response.data.id}`);
  return response.data;
}

// ----------------------------------------------------------------
// Pre-built email templates
// ----------------------------------------------------------------

/**
 * Send OTP email for phone/email verification.
 */
export async function sendOTPEmail({ to, otp, customerName = 'there' }) {
  return sendEmail({
    to,
    subject: `Your CafeQR OTP: ${otp}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#F97316">CafeQR</h2>
        <p>Hi ${customerName},</p>
        <p>Your one-time password is:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;padding:16px 0">${otp}</div>
        <p style="color:#666">This OTP expires in 5 minutes. Do not share it with anyone.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#999">CafeQR &mdash; Powered by CafeQR Technologies</p>
      </div>`,
    text: `Your CafeQR OTP is: ${otp}\nExpires in 5 minutes.`,
  });
}

/**
 * Send order confirmation email to the customer.
 */
export async function sendOrderConfirmationEmail({ to, order }) {
  const { order_no, customer_name, grand_total, estimated_time_minutes = 30 } = order;
  return sendEmail({
    to,
    subject: `Order #${order_no} Confirmed — CafeQR`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px">
        <h2 style="color:#F97316">Order Confirmed! 🎉</h2>
        <p>Hi ${customer_name},</p>
        <p>Your order <strong>#${order_no}</strong> has been confirmed.</p>
        <ul style="padding-left:20px;color:#333">
          <li>Total: <strong>₹${grand_total}</strong></li>
          <li>Estimated delivery: <strong>${estimated_time_minutes} mins</strong></li>
        </ul>
        <p>You can track your order in real time using the link sent to your phone.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#999">CafeQR &mdash; Delivering happiness</p>
      </div>`,
    text: `Order #${order_no} confirmed. Total: ₹${grand_total}. ETA: ${estimated_time_minutes} mins.`,
  });
}
