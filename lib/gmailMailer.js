/**
 * gmailMailer.js — Transactional email via Gmail API (OAuth2)
 * SERVER-SIDE ONLY. Import only in pages/api/ routes.
 *
 * Why Gmail API instead of SMTP:
 *   - No password / app password required (OAuth2 tokens only)
 *   - Not blocked by ISPs or cloud providers (port 587/465 often blocked)
 *   - Higher deliverability from an authenticated Google account
 *   - Suitable for low-to-medium volume transactional email
 *
 * Prerequisites:
 *   1. Google Cloud Console → Enable Gmail API
 *   2. OAuth2 credentials (Web client) → get client_id + client_secret
 *   3. Use OAuth Playground (https://developers.google.com/oauthplayground)
 *      to get refresh_token with scope: https://mail.google.com/
 *   4. Set all 4 env vars in .env.local (see .env.example)
 *
 * The refresh_token is long-lived. The access_token is auto-refreshed
 * by googleapis on every call — no manual token rotation needed.
 */
import { google } from 'googleapis';

// Build the OAuth2 client once (module-level singleton)
function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return oauth2Client;
}

/**
 * Encode email in RFC 2822 format and base64url it for the Gmail API.
 */
function buildRawEmail({ to, subject, htmlBody, textBody }) {
  const from    = process.env.GMAIL_SENDER_ADDRESS;
  const boundary = `----=_Part_${Date.now()}`;

  const emailLines = [
    `From: CafeQR <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    textBody || subject,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];

  const raw = emailLines.join('\r\n');
  // Base64url encode (URL-safe, no padding =)
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send a transactional email via Gmail API.
 *
 * @param {{ to: string, subject: string, htmlBody: string, textBody?: string }} options
 * @returns {Promise<{ messageId: string }>}
 *
 * @example
 * await sendEmail({
 *   to: 'customer@example.com',
 *   subject: 'Your CafeQR order is confirmed!',
 *   htmlBody: '<h1>Order Confirmed</h1><p>Your order #1234 is being prepared.</p>',
 * });
 */
export async function sendEmail({ to, subject, htmlBody, textBody }) {
  try {
    const auth  = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = buildRawEmail({ to, subject, htmlBody, textBody });

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return { messageId: response.data.id };
  } catch (err) {
    console.error('[Gmail] Failed to send email to', to, ':', err.message);
    throw err;
  }
}

// ── Pre-built email templates ────────────────────────────────────────────────

/**
 * Send order confirmation email to customer.
 */
export async function sendOrderConfirmationEmail({ to, customerName, orderNo, items, grandTotal, estimatedTime }) {
  const itemsHtml = items
    .map((i) => `<tr><td>${i.product_name}</td><td>x${i.quantity}</td><td>₹${i.line_total}</td></tr>`)
    .join('');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #F97316; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0;">Order Confirmed! ✅</h1>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px;">
        <p>Hi ${customerName},</p>
        <p>Your order <strong>#${orderNo}</strong> has been confirmed and is being prepared.</p>
        <p><strong>Estimated delivery time:</strong> ${estimatedTime || '30–45'} minutes</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="text-align:left; padding: 8px;">Item</th>
              <th style="padding: 8px;">Qty</th>
              <th style="padding: 8px;">Price</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr style="font-weight: bold; border-top: 2px solid #eee;">
              <td colspan="2" style="padding: 8px;">Grand Total</td>
              <td style="padding: 8px;">₹${grandTotal}</td>
            </tr>
          </tfoot>
        </table>
        <p style="color: #888; font-size: 12px;">Track your order live in the app.</p>
        <p style="color: #888; font-size: 12px;">Questions? Call us at ${process.env.NEXT_PUBLIC_SUPPORT_PHONE || 'our support line'}.</p>
      </div>
    </div>`;

  return sendEmail({
    to,
    subject: `✅ Order #${orderNo} Confirmed — CafeQR`,
    htmlBody,
    textBody: `Hi ${customerName}, your order #${orderNo} is confirmed. Grand total: ₹${grandTotal}. Estimated time: ${estimatedTime || '30-45'} mins.`,
  });
}

/**
 * Send order delivered email with review prompt.
 */
export async function sendOrderDeliveredEmail({ to, customerName, orderNo, grandTotal }) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; text-align: center;">
      <div style="background: #22c55e; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0;">Order Delivered! 🎉</h1>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px;">
        <p>Hi ${customerName}, your order <strong>#${orderNo}</strong> has been delivered.</p>
        <p>Total paid: <strong>₹${grandTotal}</strong></p>
        <p>Enjoy your meal! Please take a moment to rate your experience.</p>
      </div>
    </div>`;

  return sendEmail({
    to,
    subject: `🎉 Order #${orderNo} Delivered — CafeQR`,
    htmlBody,
    textBody: `Hi ${customerName}, your order #${orderNo} has been delivered. Total: ₹${grandTotal}. Enjoy your meal!`,
  });
}

/**
 * Send cancellation email.
 */
export async function sendOrderCancelledEmail({ to, customerName, orderNo, reason }) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #ef4444; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">Order Cancelled ❌</h1>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px;">
        <p>Hi ${customerName},</p>
        <p>We're sorry — your order <strong>#${orderNo}</strong> has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>If you paid online, a refund will be processed within 5–7 business days.</p>
        <p style="color: #888; font-size: 12px;">Questions? Contact us at ${process.env.NEXT_PUBLIC_SUPPORT_PHONE || 'our support line'}.</p>
      </div>
    </div>`;

  return sendEmail({
    to,
    subject: `❌ Order #${orderNo} Cancelled — CafeQR`,
    htmlBody,
    textBody: `Hi ${customerName}, your order #${orderNo} has been cancelled. ${reason || ''}`,
  });
}
