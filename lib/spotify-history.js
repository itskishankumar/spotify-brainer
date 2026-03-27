// Spotify Brainer — Historical Data Layer
// Manages GDPR import, IndexedDB storage, and trend computation.
// Currently the core logic lives inline in the service worker.
// This module provides additional utilities for history management.

const DB_NAME = 'SpotifyBrainerHistory';
const DB_VERSION = 1;

/**
 * Open the history IndexedDB.
 */
export function openHistoryDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('listeningEvents')) {
        const store = db.createObjectStore('listeningEvents', { keyPath: 'timestamp' });
        store.createIndex('trackUri', 'trackUri', { unique: false });
        store.createIndex('artistName', 'artistName', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('aggregates')) {
        db.createObjectStore('aggregates', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('playlistSnapshots')) {
        const snapshotStore = db.createObjectStore('playlistSnapshots', { keyPath: ['playlistId', 'timestamp'] });
        snapshotStore.createIndex('playlistId', 'playlistId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Parse GDPR Extended Streaming History JSON entries into our format.
 */
export function parseGDPREntries(rawEntries) {
  return rawEntries
    .filter((e) => e.ts && e.master_metadata_track_name)
    .map((entry) => ({
      timestamp: new Date(entry.ts).getTime(),
      date: entry.ts.slice(0, 10), // YYYY-MM-DD for indexing
      trackUri: entry.spotify_track_uri || '',
      trackName: entry.master_metadata_track_name || '',
      artistName: entry.master_metadata_album_artist_name || '',
      albumName: entry.master_metadata_album_album_name || '',
      msPlayed: entry.ms_played || 0,
      skipped: entry.skipped || false,
      reasonStart: entry.reason_start || '',
      reasonEnd: entry.reason_end || '',
      shuffle: entry.shuffle || false,
      platform: entry.platform || '',
      offline: entry.offline || false,
      incognitoMode: entry.incognito_mode || false,
    }));
}

/**
 * Import parsed events into IndexedDB.
 */
export async function importEvents(events) {
  const db = await openHistoryDB();
  const tx = db.transaction('listeningEvents', 'readwrite');
  const store = tx.objectStore('listeningEvents');

  let imported = 0;
  for (const event of events) {
    try {
      await new Promise((resolve, reject) => {
        const req = store.put(event);
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      });
      imported++;
    } catch {}
  }

  return imported;
}

/**
 * Get total event count.
 */
export async function getEventCount() {
  const db = await openHistoryDB();
  return new Promise((resolve) => {
    const tx = db.transaction('listeningEvents', 'readonly');
    const req = tx.objectStore('listeningEvents').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}

/**
 * Get all events (for full recomputation).
 */
export async function getAllEvents() {
  const db = await openHistoryDB();
  return new Promise((resolve) => {
    const tx = db.transaction('listeningEvents', 'readonly');
    const req = tx.objectStore('listeningEvents').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });
}

/**
 * Get events within a date range.
 */
export async function getEventsInRange(startDate, endDate) {
  const db = await openHistoryDB();
  const tx = db.transaction('listeningEvents', 'readonly');
  const store = tx.objectStore('listeningEvents');
  const index = store.index('date');
  const range = IDBKeyRange.bound(startDate, endDate);

  return new Promise((resolve) => {
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });
}

/**
 * Export all history as JSON (for user backup).
 */
export async function exportHistory() {
  const events = await getAllEvents();
  return JSON.stringify(events, null, 2);
}

/**
 * Clear all history data.
 */
export async function clearHistory() {
  const db = await openHistoryDB();
  const tx = db.transaction(['listeningEvents', 'aggregates'], 'readwrite');
  tx.objectStore('listeningEvents').clear();
  tx.objectStore('aggregates').clear();
}
