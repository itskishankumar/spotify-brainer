// Spotify Brainer — Playback & Library Controls
// All functions call Spotify Web API endpoints.
// Each takes a token and optional params, returns data or throws.

const BASE = 'https://api.spotify.com/v1';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function apiCall(method, url, token, body = null) {
  const opts = { method, headers: headers(token) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// --- Playback Controls ---

export async function play(token, params = {}) {
  let { uri, contextUri, deviceId, offsetPosition } = params;
  const body = {};
  if (contextUri) body.context_uri = contextUri;
  if (uri) body.uris = [uri];
  if (offsetPosition !== undefined) body.offset = { position: offsetPosition };

  // If no device specified, try playing — if it fails with "no active device", find one
  const qs = deviceId ? `?device_id=${deviceId}` : '';
  try {
    return await apiCall('PUT', `${BASE}/me/player/play${qs}`, token, Object.keys(body).length ? body : null);
  } catch (e) {
    if (!deviceId && e.message.includes('No active device')) {
      // Find an available device and retry
      const devices = await apiCall('GET', `${BASE}/me/player/devices`, token);
      const device = devices?.devices?.find(d => !d.is_restricted) || devices?.devices?.[0];
      if (!device) throw new Error('No Spotify devices available. Open Spotify on any device first.');
      // Transfer playback to the device first
      await apiCall('PUT', `${BASE}/me/player`, token, { device_ids: [device.id], play: false });
      // Small delay for transfer to take effect
      await new Promise(r => setTimeout(r, 500));
      return await apiCall('PUT', `${BASE}/me/player/play?device_id=${device.id}`, token, Object.keys(body).length ? body : null);
    }
    throw e;
  }
}

export async function pause(token) {
  return apiCall('PUT', `${BASE}/me/player/pause`, token);
}

export async function next(token) {
  return apiCall('POST', `${BASE}/me/player/next`, token);
}

export async function previous(token) {
  return apiCall('POST', `${BASE}/me/player/previous`, token);
}

export async function seek(token, params = {}) {
  const { positionMs } = params;
  return apiCall('PUT', `${BASE}/me/player/seek?position_ms=${positionMs}`, token);
}

export async function setVolume(token, params = {}) {
  const { percent } = params;
  return apiCall('PUT', `${BASE}/me/player/volume?volume_percent=${Math.round(percent)}`, token);
}

export async function setShuffle(token, params = {}) {
  const { state } = params;
  return apiCall('PUT', `${BASE}/me/player/shuffle?state=${!!state}`, token);
}

export async function setRepeat(token, params = {}) {
  const { state } = params; // 'off' | 'context' | 'track'
  return apiCall('PUT', `${BASE}/me/player/repeat?state=${state}`, token);
}

export async function addToQueue(token, params = {}) {
  const { uri } = params;
  return apiCall('POST', `${BASE}/me/player/queue?uri=${encodeURIComponent(uri)}`, token);
}

// --- Device Management ---

export async function getDevices(token) {
  return apiCall('GET', `${BASE}/me/player/devices`, token);
}

export async function transferPlayback(token, params = {}) {
  const { deviceId, play: shouldPlay } = params;
  return apiCall('PUT', `${BASE}/me/player`, token, {
    device_ids: [deviceId],
    play: shouldPlay ?? false,
  });
}

// --- Search ---

export async function search(token, params = {}) {
  const { query, types = ['track', 'artist', 'album'], limit = 10 } = params;
  const typeStr = types.join(',');
  return apiCall('GET', `${BASE}/search?q=${encodeURIComponent(query)}&type=${typeStr}&limit=${limit}`, token);
}

// --- Lookup ---

export async function getTrack(token, params = {}) {
  return apiCall('GET', `${BASE}/tracks/${params.id}`, token);
}

export async function getArtist(token, params = {}) {
  return apiCall('GET', `${BASE}/artists/${params.id}`, token);
}

export async function getAlbum(token, params = {}) {
  return apiCall('GET', `${BASE}/albums/${params.id}`, token);
}

// --- Playlist Management ---

export async function addToPlaylist(token, params = {}) {
  const { playlistId, uris } = params;
  return apiCall('POST', `${BASE}/playlists/${playlistId}/tracks`, token, {
    uris: Array.isArray(uris) ? uris : [uris],
  });
}

export async function removeFromPlaylist(token, params = {}) {
  const { playlistId, uris } = params;
  return apiCall('DELETE', `${BASE}/playlists/${playlistId}/tracks`, token, {
    tracks: (Array.isArray(uris) ? uris : [uris]).map((uri) => ({ uri })),
  });
}

export async function createPlaylist(token, params = {}) {
  const { userId, name, description = '', isPublic = false } = params;
  return apiCall('POST', `${BASE}/users/${userId}/playlists`, token, {
    name,
    description,
    public: isPublic,
  });
}

// --- Library ---

export async function saveTracks(token, params = {}) {
  const { ids } = params;
  return apiCall('PUT', `${BASE}/me/tracks?ids=${(Array.isArray(ids) ? ids : [ids]).join(',')}`, token);
}

export async function removeSavedTracks(token, params = {}) {
  const { ids } = params;
  return apiCall('DELETE', `${BASE}/me/tracks?ids=${(Array.isArray(ids) ? ids : [ids]).join(',')}`, token);
}

export async function saveAlbums(token, params = {}) {
  const { ids } = params;
  return apiCall('PUT', `${BASE}/me/albums?ids=${(Array.isArray(ids) ? ids : [ids]).join(',')}`, token);
}

export async function followArtists(token, params = {}) {
  const { ids } = params;
  return apiCall('PUT', `${BASE}/me/following?type=artist&ids=${(Array.isArray(ids) ? ids : [ids]).join(',')}`, token);
}

// --- Action Registry ---
// Maps action names to functions for the service worker router

export const CONTROLS = {
  play, pause, next, previous, seek,
  setVolume, setShuffle, setRepeat,
  addToQueue, getDevices, transferPlayback,
  search, getTrack, getArtist, getAlbum,
  addToPlaylist, removeFromPlaylist, createPlaylist,
  saveTracks, removeSavedTracks, saveAlbums, followArtists,
};
