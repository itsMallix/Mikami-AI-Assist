import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/env.js';

const TOKEN_PATH = path.resolve('./sessions/google-token.json');

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

/**
 * Generate the Google OAuth2 authorization URL
 */
export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
}

/**
 * Exchange authorization code for tokens and save to disk
 */
export async function exchangeCodeForToken(code: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const sessionsDir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('✅ Google Calendar token saved to', TOKEN_PATH);
}

/**
 * Load saved token and return authenticated OAuth2 client.
 * Returns null if token has not been saved yet.
 */
export function getAuthenticatedClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }

  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Auto-refresh token on expiry
    oauth2Client.on('tokens', (newTokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      const merged = { ...existing, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return oauth2Client;
  } catch {
    return null;
  }
}

/**
 * Check if the user has already authenticated with Google
 */
export function isAuthenticated(): boolean {
  return fs.existsSync(TOKEN_PATH);
}
