/**
 * scripts/gmail-get-token.js
 * ONE-TIME script to generate a Gmail OAuth2 refresh token.
 * Run locally, paste the code from the browser, and copy the
 * refresh_token into your .env.local.
 *
 * Usage:
 *   1. Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in .env.local
 *   2. node scripts/gmail-get-token.js
 *   3. Open the printed URL in your browser
 *   4. Authorise the Gmail account you want to send from
 *   5. Paste the redirect code when prompted
 *   6. Copy the printed refresh_token to GMAIL_OAUTH_REFRESH_TOKEN in .env.local
 *
 * Required OAuth2 scope: https://mail.google.com/
 */
import 'dotenv/config';
import { google }   from 'googleapis';
import readline     from 'readline';

const { GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET } = process.env;

if (!GMAIL_OAUTH_CLIENT_ID || !GMAIL_OAUTH_CLIENT_SECRET) {
  console.error('Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in .env.local first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground',
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt:      'consent',
  scope:       ['https://mail.google.com/'],
});

console.log('\n→ Open this URL in your browser and authorise the Gmail account:\n');
console.log(authUrl);
console.log();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('→ Paste the code from the redirect URL here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n✓ Tokens received:');
    console.log(`  GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nAdd the refresh_token above to your .env.local');
  } catch (err) {
    console.error('Failed to exchange code:', err.message);
  }
});
