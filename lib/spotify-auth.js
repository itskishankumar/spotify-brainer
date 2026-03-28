// Spotify Brainer — OAuth PKCE Authentication
// Uses Spotify's Authorization Code with PKCE flow for proper API access.
// Tokens are stored in chrome.storage.local and auto-refreshed.

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
// chrome.identity.getRedirectURL() returns https://<extension-id>.chromiumapp.org/
// This is HTTPS so Spotify accepts it. Must be registered in Spotify Dashboard.
let REDIRECT_URI = null;

function getRedirectUri() {
  if (!REDIRECT_URI) {
    REDIRECT_URI = chrome.identity.getRedirectURL();
  }
  return REDIRECT_URI;
}

// All scopes we need for full data access + playback control
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-follow-read',
].join(' ');

const STORAGE_KEY = 'spotifyBrainerAuth';

// --- PKCE Helpers ---

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const hash = await sha256(verifier);
  return base64urlEncode(hash);
}

// --- Auth State ---

let cachedTokens = null;

async function getStoredTokens() {
  if (cachedTokens) return cachedTokens;
  const result = await chrome.storage.local.get(STORAGE_KEY);
  cachedTokens = result[STORAGE_KEY] || null;
  return cachedTokens;
}

async function storeTokens(tokens) {
  cachedTokens = tokens;
  await chrome.storage.local.set({ [STORAGE_KEY]: tokens });
}

async function clearTokens() {
  cachedTokens = null;
  await chrome.storage.local.remove(STORAGE_KEY);
}

// --- Public API ---

/**
 * Get the client ID from storage.
 */
async function getClientId() {
  const result = await chrome.storage.local.get('spotifyClientId');
  return result.spotifyClientId || null;
}

/**
 * Save the client ID.
 */
async function setClientId(clientId) {
  await chrome.storage.local.set({ spotifyClientId: clientId });
}

/**
 * Start the OAuth PKCE login flow.
 * Opens Spotify's auth page in a new tab. The redirect comes back to the extension.
 */
async function startLogin() {
  const clientId = await getClientId();
  if (!clientId) {
    throw new Error('No Spotify Client ID configured. Set it in Settings first.');
  }

  const redirectUri = getRedirectUri();
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier for the callback
  await chrome.storage.local.set({ spotifyCodeVerifier: codeVerifier });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: SCOPES,
  });

  const authUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;

  // Use chrome.identity.launchWebAuthFlow for clean OAuth
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!redirectUrl) {
          reject(new Error('No redirect URL received'));
          return;
        }

        try {
          const url = new URL(redirectUrl);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            reject(new Error(`Spotify auth error: ${error}`));
            return;
          }
          if (!code) {
            reject(new Error('No authorization code received'));
            return;
          }

          // Exchange code for tokens
          const tokens = await exchangeCode(code, codeVerifier);
          resolve(tokens);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
async function exchangeCode(code, codeVerifier) {
  const clientId = await getClientId();
  const redirectUri = getRedirectUri();

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error_description || res.status}`);
  }

  const data = await res.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };

  await storeTokens(tokens);
  return tokens;
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken() {
  const tokens = await getStoredTokens();
  if (!tokens?.refreshToken) {
    throw new Error('No refresh token — please log in again');
  }

  const clientId = await getClientId();
  if (!clientId) {
    throw new Error('No Client ID configured');
  }

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // If refresh token is revoked, clear everything
    if (res.status === 400 || res.status === 401) {
      await clearTokens();
      throw new Error('Session expired — please log in again');
    }
    throw new Error(`Token refresh failed: ${err.error_description || res.status}`);
  }

  const data = await res.json();
  const newTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken, // Spotify may or may not rotate
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope || tokens.scope,
  };

  await storeTokens(newTokens);
  return newTokens;
}

/**
 * Check if the stored token has all required scopes.
 * Returns true if scopes are missing (re-auth needed).
 */
function hasMissingScopes(tokens) {
  if (!tokens?.scope) return true; // no scope recorded — assume stale
  const granted = new Set(tokens.scope.split(' '));
  const required = SCOPES.split(' ');
  return required.some((s) => !granted.has(s));
}

/**
 * Get a valid access token, refreshing if needed.
 * Returns null if not logged in.
 * Forces re-auth if the stored token is missing required scopes.
 */
async function getAccessToken() {
  let tokens = await getStoredTokens();
  if (!tokens) return null;

  // If scopes have expanded since the user last authorized, force re-auth
  if (hasMissingScopes(tokens)) {
    console.warn('[Spotify Brainer] Stored token is missing required scopes — clearing session. User must re-authorize.');
    await clearTokens();
    return null;
  }

  // Refresh if within 5 minutes of expiry
  if (tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      tokens = await refreshAccessToken();
    } catch (e) {
      console.error('[Spotify Brainer] Token refresh failed:', e.message);
      return null;
    }
  }

  return tokens.accessToken;
}

/**
 * Check if user is logged in.
 */
async function isLoggedIn() {
  const tokens = await getStoredTokens();
  return !!tokens?.accessToken;
}

/**
 * Log out — clear all tokens.
 */
async function logout() {
  await clearTokens();
}

export {
  getClientId,
  setClientId,
  startLogin,
  getAccessToken,
  isLoggedIn,
  logout,
  refreshAccessToken,
};
