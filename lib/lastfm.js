// Spotify Brainer — Last.fm Tag Integration
// Fetches crowd-sourced genre/mood/style tags from Last.fm to enrich music generation prompts.
// Two-tier cache: in-memory + chrome.storage.local (7-day TTL per artist).

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const CACHE_STORAGE_KEY = 'lastfmTagCache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FETCH_DELAY_MS = 200; // Stay under 5 req/s limit
const MIN_TAG_COUNT = 10; // Minimum tag weight to keep
const MAX_TAGS_PER_ARTIST = 10;

// Non-musical tags that pollute results
const TAG_BLOCKLIST = new Set([
  'seen live', 'favorites', 'favourite', 'my favorite', 'all', 'music',
  'good', 'love', 'awesome', 'favourite songs', 'favorite songs',
  'under 2000 listeners', 'check out', 'cool', 'spotify', 'amazing',
  'beautiful', 'best', 'epic', 'favorite artists', 'favourite artists',
  'guilty pleasure', 'i love', 'loved', 'makes me happy', 'nice',
  'sexy', 'want to see live', 'albums i own',
]);

let tagCache = {}; // artistName → { tags: [{name, count}], fetchedAt }
let trackTagCache = {}; // "artist\0track" → { tags: [{name, count}], fetchedAt }

// Circuit breaker: if the API fails for a non-transient reason (bad key, disabled, etc.),
// stop hammering it for the rest of the batch.
let circuitOpen = false;
let circuitResetTimer = null;

function tripCircuit() {
  circuitOpen = true;
  clearTimeout(circuitResetTimer);
  circuitResetTimer = setTimeout(() => { circuitOpen = false; }, 60000); // retry after 1 min
}

function isCircuitOpen() {
  return circuitOpen;
}

// ---------------------------------------------------------------------------
// Cache persistence
// ---------------------------------------------------------------------------

const TRACK_CACHE_STORAGE_KEY = 'lastfmTrackTagCache';

export async function initLastFmCache() {
  try {
    const result = await chrome.storage.local.get([CACHE_STORAGE_KEY, TRACK_CACHE_STORAGE_KEY]);
    const now = Date.now();
    const stored = result[CACHE_STORAGE_KEY];
    if (stored && typeof stored === 'object') {
      for (const [key, entry] of Object.entries(stored)) {
        if (entry.fetchedAt && (now - entry.fetchedAt) < CACHE_TTL_MS) {
          tagCache[key] = entry;
        }
      }
    }
    const storedTracks = result[TRACK_CACHE_STORAGE_KEY];
    if (storedTracks && typeof storedTracks === 'object') {
      for (const [key, entry] of Object.entries(storedTracks)) {
        if (entry.fetchedAt && (now - entry.fetchedAt) < CACHE_TTL_MS) {
          trackTagCache[key] = entry;
        }
      }
    }
    console.log(`[Spotify Brainer] Last.fm cache restored: ${Object.keys(tagCache).length} artists, ${Object.keys(trackTagCache).length} tracks`);
  } catch (e) {
    console.warn('[Spotify Brainer] Failed to restore Last.fm cache:', e.message);
  }
}

let persistTimer = null;

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: tagCache, [TRACK_CACHE_STORAGE_KEY]: trackTagCache });
    } catch (e) {
      console.warn('[Spotify Brainer] Failed to persist Last.fm cache:', e.message);
    }
  }, 2000); // Debounce 2s
}

// ---------------------------------------------------------------------------
// Tag normalization
// ---------------------------------------------------------------------------

function normalizeTag(tag) {
  let t = tag.toLowerCase().trim().replace(/\s+/g, ' ');
  // Collapse common variants
  t = t.replace(/hip hop/g, 'hip-hop')
    .replace(/hiphop/g, 'hip-hop')
    .replace(/post rock/g, 'post-rock')
    .replace(/post punk/g, 'post-punk')
    .replace(/trip hop/g, 'trip-hop')
    .replace(/synth pop/g, 'synth-pop')
    .replace(/synthpop/g, 'synth-pop')
    .replace(/new wave/g, 'new-wave')
    .replace(/dream pop/g, 'dream-pop')
    .replace(/shoegaze/g, 'shoegaze')
    .replace(/lo fi/g, 'lo-fi')
    .replace(/lofi/g, 'lo-fi')
    .replace(/nu metal/g, 'nu-metal')
    .replace(/death metal/g, 'death-metal')
    .replace(/black metal/g, 'black-metal')
    .replace(/art rock/g, 'art-rock')
    .replace(/art pop/g, 'art-pop')
    .replace(/indie rock/g, 'indie-rock')
    .replace(/indie pop/g, 'indie-pop')
    .replace(/alt country/g, 'alt-country');
  return t;
}

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

export async function getLastFmApiKey() {
  const result = await chrome.storage.local.get('sb_apiKey_lastfm');
  return result.sb_apiKey_lastfm || null;
}

// ---------------------------------------------------------------------------
// Fetch tags for a single artist
// ---------------------------------------------------------------------------

async function fetchArtistTags(artistName, apiKey) {
  if (isCircuitOpen()) throw new Error('Last.fm circuit breaker open');

  const url = `${LASTFM_BASE}?method=artist.getTopTags&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      tripCircuit();
      throw new Error(`Network error: ${e.message}`);
    }
    if (res.status === 429) {
      const wait = 2000 * Math.pow(2, attempt);
      console.warn(`[Spotify Brainer] Last.fm 429, waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      tripCircuit();
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    if (data.error) {
      // Error 10 = invalid API key, error 26 = suspended key — these won't fix themselves
      if (data.error === 10 || data.error === 26) tripCircuit();
      throw new Error(data.message || `Last.fm error ${data.error}`);
    }

    const rawTags = data.toptags?.tag || [];
    return rawTags
      .filter((t) => t.count >= MIN_TAG_COUNT)
      .map((t) => ({ name: normalizeTag(t.name), count: t.count }))
      .filter((t) => t.name.length > 1 && !TAG_BLOCKLIST.has(t.name))
      // Dedup after normalization
      .filter((t, i, arr) => arr.findIndex((x) => x.name === t.name) === i)
      .slice(0, MAX_TAGS_PER_ARTIST);
  }
  throw new Error('Last.fm rate limited after retries');
}

export async function getArtistTags(artistName, apiKey) {
  const cacheKey = artistName.toLowerCase();

  // Check in-memory cache
  const cached = tagCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.tags;
  }

  try {
    const tags = await fetchArtistTags(artistName, apiKey);
    tagCache[cacheKey] = { tags, fetchedAt: Date.now() };
    schedulePersist();
    return tags;
  } catch (e) {
    console.warn(`[Spotify Brainer] Last.fm tags failed for "${artistName}":`, e.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Batch enrichment
// ---------------------------------------------------------------------------

export async function enrichArtistsWithTags(artists, apiKey) {
  if (!apiKey || !artists?.length) return artists;

  let needsDelay = false;
  for (const artist of artists) {
    const cacheKey = artist.name?.toLowerCase();
    if (!cacheKey) continue;

    const cached = tagCache[cacheKey];
    const isCached = cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS;

    if (!isCached && needsDelay) {
      await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
    }

    artist.lastfmTags = await getArtistTags(artist.name, apiKey);
    needsDelay = !isCached; // Only delay after actual fetches
  }

  return artists;
}

// ---------------------------------------------------------------------------
// Fetch tags for a single track
// ---------------------------------------------------------------------------

async function fetchTrackTags(artistName, trackName, apiKey) {
  if (isCircuitOpen()) throw new Error('Last.fm circuit breaker open');

  const url = `${LASTFM_BASE}?method=track.getTopTags&artist=${encodeURIComponent(artistName)}&track=${encodeURIComponent(trackName)}&api_key=${apiKey}&format=json`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      tripCircuit();
      throw new Error(`Network error: ${e.message}`);
    }
    if (res.status === 429) {
      const wait = 2000 * Math.pow(2, attempt);
      console.warn(`[Spotify Brainer] Last.fm 429, waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      tripCircuit();
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    if (data.error) {
      if (data.error === 10 || data.error === 26) tripCircuit();
      throw new Error(data.message || `Last.fm error ${data.error}`);
    }

    const rawTags = data.toptags?.tag || [];
    return rawTags
      .filter((t) => t.count >= MIN_TAG_COUNT)
      .map((t) => ({ name: normalizeTag(t.name), count: t.count }))
      .filter((t) => t.name.length > 1 && !TAG_BLOCKLIST.has(t.name))
      .filter((t, i, arr) => arr.findIndex((x) => x.name === t.name) === i)
      .slice(0, MAX_TAGS_PER_ARTIST);
  }
  throw new Error('Last.fm rate limited after retries');
}

export async function getTrackTags(artistName, trackName, apiKey) {
  const cacheKey = `${artistName.toLowerCase()}\0${trackName.toLowerCase()}`;

  const cached = trackTagCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.tags;
  }

  try {
    const tags = await fetchTrackTags(artistName, trackName, apiKey);
    trackTagCache[cacheKey] = { tags, fetchedAt: Date.now() };
    schedulePersist();
    return tags;
  } catch (e) {
    console.warn(`[Spotify Brainer] Last.fm track tags failed for "${trackName}" by "${artistName}":`, e.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Batch track enrichment
// Tracks from computePeriodStats have format: { name: "Track — Artist", plays, uri }
// ---------------------------------------------------------------------------

export async function enrichTracksWithTags(tracks, apiKey) {
  if (!apiKey || !tracks?.length) return tracks;

  let needsDelay = false;
  for (const track of tracks) {
    // Parse "Track Name — Artist Name" format from computePeriodStats
    const parts = track.name?.split(' \u2014 ');
    if (!parts || parts.length < 2) continue;
    const [trackName, artistName] = parts;

    const cacheKey = `${artistName.toLowerCase()}\0${trackName.toLowerCase()}`;
    const cached = trackTagCache[cacheKey];
    const isCached = cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS;

    if (!isCached && needsDelay) {
      await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
    }

    track.lastfmTags = await getTrackTags(artistName, trackName, apiKey);
    needsDelay = !isCached;
  }

  return tracks;
}

// ---------------------------------------------------------------------------
// Aggregate tags across multiple artists and/or tracks
// ---------------------------------------------------------------------------

export function aggregateTopTags(enrichedItems, maxTags = 15) {
  const scores = {};

  for (const item of enrichedItems) {
    if (!item.lastfmTags?.length) continue;
    const weight = item.plays || 1;
    for (const tag of item.lastfmTags) {
      const key = tag.name;
      if (!scores[key]) scores[key] = 0;
      scores[key] += tag.count * weight;
    }
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([name, score]) => ({ name, score }));
}
