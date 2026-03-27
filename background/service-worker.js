// Spotify Brainer — Background Service Worker
// Routes LLM API calls through provider adapters, manages Spotify data pipeline.

import { getAdapter } from '../llm/registry.js';
import { SpotifyIntelligence } from '../lib/spotify-intelligence.js';
import { getAccessToken, isLoggedIn, startLogin, logout, getClientId, setClientId } from '../lib/spotify-auth.js';

// --- Spotify data state ---
let spotifyData = {
  nowPlaying: null,
  playlists: [],
  savedTracks: [],
  savedAlbums: [],
  topArtists: { short: [], medium: [], long: [] },
  topTracks: { short: [], medium: [], long: [] },
  recentlyPlayed: [],
  userProfile: null,
  audioFeatures: {},
  currentView: '',
  queue: [],
};

let intelligence = null; // Computed profile from spotify-intelligence
let historyMetrics = null; // Computed from historical data

// --- Cache persistence ---
const CACHE_KEY = 'spotifyBrainerCache';

async function saveToCache() {
  const cache = {
    spotifyData,
    intelligence,
    historyMetrics,
    cachedAt: Date.now(),
  };
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    console.log('[Spotify Brainer] Data cached to storage');
  } catch (e) {
    console.warn('[Spotify Brainer] Failed to cache data:', e.message);
  }
}

async function restoreFromCache() {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    const cache = result[CACHE_KEY];
    if (!cache) return false;

    spotifyData = { ...spotifyData, ...cache.spotifyData };
    intelligence = cache.intelligence || null;
    historyMetrics = cache.historyMetrics || null;

    const age = Date.now() - (cache.cachedAt || 0);
    const ageMin = Math.round(age / 60000);
    console.log(`[Spotify Brainer] Restored cached data (${ageMin}m old)`);
    return true;
  } catch (e) {
    console.warn('[Spotify Brainer] Failed to restore cache:', e.message);
    return false;
  }
}

// Restore cache on service worker startup
restoreFromCache();

// --- System prompt builder ---
function buildSystemPrompt() {
  const parts = [
    `You are Spotify Brainer, an AI powered brain for Spotify with deep knowledge of this user's music identity.`,
    `You have access to their full Spotify data including playlists, listening history, taste profile, and current playback.`,
    `Use the data below to give specific, data-backed answers. Be conversational and music-savvy.`,
  ];

  // Current playback
  if (spotifyData.nowPlaying) {
    const np = spotifyData.nowPlaying;
    parts.push(`\n## Current Playback`);
    parts.push(`Now playing: "${np.trackName}" by ${np.artist} from "${np.album}"`);
    if (np.progress && np.duration) {
      parts.push(`Progress: ${formatMs(np.progress)} / ${formatMs(np.duration)} | Status: ${np.isPlaying ? 'Playing' : 'Paused'}`);
    }
    if (np.shuffle !== undefined) {
      parts.push(`Shuffle: ${np.shuffle ? 'On' : 'Off'} | Repeat: ${np.repeat || 'Off'}`);
    }
  }

  // User profile
  if (spotifyData.userProfile) {
    const u = spotifyData.userProfile;
    parts.push(`\n## User Profile`);
    parts.push(`Name: ${u.display_name || 'Unknown'} | Plan: ${u.product || 'free'} | Country: ${u.country || 'Unknown'}`);
  }

  // Intelligence layer (computed taste profile)
  if (intelligence) {
    parts.push(`\n## Taste DNA (Computed)`);
    if (intelligence.genreDistribution) {
      const genres = Object.entries(intelligence.genreDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([g, pct]) => `${g} (${Math.round(pct * 100)}%)`)
        .join(', ');
      parts.push(`Top genres: ${genres}`);
    }
    if (intelligence.moodProfile) {
      parts.push(`Mood: ${intelligence.moodProfile.label} (avg valence: ${intelligence.moodProfile.valence?.toFixed(2)}, avg energy: ${intelligence.moodProfile.energy?.toFixed(2)})`);
    }
    if (intelligence.decadeDistribution) {
      const decades = Object.entries(intelligence.decadeDistribution)
        .sort((a, b) => b[1] - a[1])
        .map(([d, pct]) => `${d} (${Math.round(pct * 100)}%)`)
        .join(', ');
      parts.push(`Decade split: ${decades}`);
    }
    if (intelligence.discoveryScore !== undefined) {
      parts.push(`Discovery score: ${intelligence.discoveryScore.toFixed(2)} | Mainstream index: ${intelligence.mainstreamIndex || 'N/A'}`);
    }
    if (intelligence.personalityTags?.length) {
      parts.push(`Personality: ${intelligence.personalityTags.join(', ')}`);
    }
    if (intelligence.tempoPreference) {
      parts.push(`Tempo preference: ${intelligence.tempoPreference}`);
    }
  }

  // Historical metrics
  if (historyMetrics) {
    parts.push(`\n## Listening History & Trends`);
    if (historyMetrics.lifetimeStats) {
      const ls = historyMetrics.lifetimeStats;
      parts.push(`Based on ${ls.totalYears || '?'} years of data (${ls.totalPlays || '?'} total plays):`);
      parts.push(`Total listening: ${formatHours(ls.totalMs)} | Unique tracks: ${ls.uniqueTracks} | Unique artists: ${ls.uniqueArtists}`);
      if (ls.topArtistAllTime) parts.push(`Most played artist all-time: ${ls.topArtistAllTime.name} (${ls.topArtistAllTime.plays} plays)`);
      if (ls.topTrackAllTime) parts.push(`Most played track all-time: ${ls.topTrackAllTime.name} (${ls.topTrackAllTime.plays} plays)`);
    }
    if (historyMetrics.tasteEvolution?.length) {
      parts.push(`\n### Taste Evolution`);
      for (const era of historyMetrics.tasteEvolution) {
        parts.push(`- ${era.period}: ${era.description}`);
      }
    }
    if (historyMetrics.recentTrends) {
      parts.push(`\n### Recent Trends (last 30 days)`);
      for (const trend of historyMetrics.recentTrends) {
        parts.push(`- ${trend}`);
      }
    }
    if (historyMetrics.behavioralPatterns?.length) {
      parts.push(`\n### Behavioral Patterns`);
      for (const pattern of historyMetrics.behavioralPatterns) {
        parts.push(`- ${pattern}`);
      }
    }
  }

  // Top artists (from API)
  if (spotifyData.topArtists.medium?.length) {
    parts.push(`\n## Top Artists (6 months)`);
    parts.push(spotifyData.topArtists.medium.slice(0, 20).map((a, i) => `${i + 1}. ${a.name} (genres: ${a.genres?.slice(0, 3).join(', ') || 'unknown'})`).join('\n'));
  }
  if (spotifyData.topArtists.short?.length) {
    parts.push(`\n## Top Artists (4 weeks)`);
    parts.push(spotifyData.topArtists.short.slice(0, 20).map((a, i) => `${i + 1}. ${a.name}`).join('\n'));
  }

  // Top tracks
  if (spotifyData.topTracks.medium?.length) {
    parts.push(`\n## Top Tracks (6 months)`);
    parts.push(spotifyData.topTracks.medium.slice(0, 20).map((t, i) => `${i + 1}. "${t.name}" by ${t.artists?.map(a => a.name).join(', ')}`).join('\n'));
  }

  // Recently played
  if (spotifyData.recentlyPlayed?.length) {
    parts.push(`\n## Recently Played`);
    parts.push(spotifyData.recentlyPlayed.slice(0, 30).map((t) =>
      `- "${t.track?.name}" by ${t.track?.artists?.map(a => a.name).join(', ')} (${new Date(t.played_at).toLocaleString()})`
    ).join('\n'));
  }

  // Playlists with intelligence
  if (spotifyData.playlists?.length) {
    parts.push(`\n## Playlists (${spotifyData.playlists.length} total)`);
    for (const pl of spotifyData.playlists.slice(0, 50)) {
      let line = `- "${pl.name}" (${pl.tracks?.total || 0} tracks)`;
      if (intelligence?.playlistProfiles?.[pl.id]) {
        const pp = intelligence.playlistProfiles[pl.id];
        line += ` — genres: ${pp.topGenres?.join(', ') || '?'}, mood: ${pp.mood || '?'}, cohesion: ${pp.cohesion?.toFixed(2) || '?'}`;
      }
      parts.push(line);
    }
  }

  // Library stats
  if (spotifyData.savedTracks?.length || spotifyData.savedAlbums?.length) {
    parts.push(`\n## Library`);
    parts.push(`Saved tracks: ${spotifyData.savedTracks?.length || 0} | Saved albums: ${spotifyData.savedAlbums?.length || 0}`);
  }

  // Queue
  if (spotifyData.queue?.length) {
    parts.push(`\n## Queue (next ${Math.min(spotifyData.queue.length, 20)} tracks)`);
    parts.push(spotifyData.queue.slice(0, 20).map((t) =>
      `- "${t.name}" by ${t.artists?.map(a => a.name).join(', ')}`
    ).join('\n'));
  }

  // Current view
  if (spotifyData.currentView) {
    parts.push(`\n## Current View`);
    parts.push(`User is viewing: ${spotifyData.currentView}`);
  }

  return parts.join('\n');
}

function formatMs(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatHours(ms) {
  const hrs = Math.round(ms / 3600000);
  return `${hrs.toLocaleString()} hours`;
}

// --- Message handling ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'llm-test') {
    handleTestConnection(msg).then(sendResponse);
    return true; // async response
  }

  if (msg.type === 'content-script-ready') {
    const tabId = sender.tab?.id;

    // Try to restore cache if we have nothing in memory (e.g. service worker restarted)
    (async () => {
      try {
        if (!spotifyData.userProfile) {
          await restoreFromCache();
        }

        const loggedIn = await isLoggedIn();

        if (spotifyData.userProfile) {
          // Have data (from memory or cache) — send summary immediately
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              type: 'spotify-load-complete',
              summary: buildContextSummary(),
            });
          }
        } else if (loggedIn) {
          // Logged in but no data — do a quick now-playing check
          fetchNowPlaying(tabId);
        } else {
          // Not logged in
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              type: 'spotify-load-complete',
              summary: 'Not connected — click Settings to log in with Spotify',
            });
          }
        }

        // Always send auth status to content script
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'spotify-auth-status',
            loggedIn,
          });
        }
      } catch (e) {
        console.error('[Spotify Brainer] content-script-ready handler error:', e);
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'spotify-load-complete',
            summary: 'Error loading — click Refresh to retry',
          });
        }
      }
    })();
    return;
  }

  if (msg.type === 'refresh-spotify-data') {
    // Full pipeline — only runs when user explicitly clicks Refresh
    fetchSpotifyData(sender.tab?.id);
    return;
  }

  if (msg.type === 'spotify-dom-data') {
    Object.assign(spotifyData, msg.data);
    return;
  }

  // --- OAuth auth messages ---
  if (msg.type === 'spotify-login') {
    (async () => {
      try {
        await startLogin();
        const tabId = sender.tab?.id;
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { type: 'spotify-auth-status', loggedIn: true });
          chrome.tabs.sendMessage(tabId, {
            type: 'spotify-load-complete',
            summary: 'Logged in — click Refresh to load your data',
          });
        }
        sendResponse({ success: true });
      } catch (e) {
        console.error('[Spotify Brainer] Login failed:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // async response
  }

  if (msg.type === 'spotify-logout') {
    (async () => {
      await logout();
      spotifyData = {
        nowPlaying: null, playlists: [], savedTracks: [], savedAlbums: [],
        topArtists: { short: [], medium: [], long: [] },
        topTracks: { short: [], medium: [], long: [] },
        recentlyPlayed: [], userProfile: null, audioFeatures: {},
        currentView: '', queue: [],
      };
      intelligence = null;
      historyMetrics = null;
      await chrome.storage.local.remove(CACHE_KEY);
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'spotify-auth-status', loggedIn: false });
        chrome.tabs.sendMessage(tabId, {
          type: 'spotify-load-complete',
          summary: 'Logged out — click Settings to log in again',
        });
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (msg.type === 'spotify-auth-status-check') {
    (async () => {
      const loggedIn = await isLoggedIn();
      const clientId = await getClientId();
      sendResponse({ loggedIn, hasClientId: !!clientId });
    })();
    return true;
  }

  if (msg.type === 'get-redirect-uri') {
    sendResponse(chrome.identity.getRedirectURL());
    return;
  }

  if (msg.type === 'spotify-set-client-id') {
    (async () => {
      await setClientId(msg.clientId);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (msg.type === 'get-spotify-data') {
    sendResponse({
      ...spotifyData,
      intelligence,
      historyMetrics,
    });
    return true; // async
  }

  if (msg.type === 'gdpr-import') {
    handleGDPRImport(msg.data, msg.filename);
    return;
  }

  // intelligence and historyMetrics are computed directly in this worker
});

// --- Streaming via port ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'llm-stream') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'llm-stream') return;

    try {
      const adapter = getAdapter(msg.provider);
      const systemPrompt = buildSystemPrompt();

      // Build messages array with system prompt
      const messages = [
        { role: 'system', content: systemPrompt },
        ...msg.messages.filter((m) => m.role !== 'system'),
      ];

      const request = {
        messages,
        model: msg.model,
        maxTokens: 4096,
        stream: true,
      };

      const controller = adapter.streamMessage(request, msg.apiKey, (chunk) => {
        try {
          port.postMessage(chunk);
        } catch {
          // Port disconnected
          controller.abort();
        }
      });

      port.onDisconnect.addListener(() => {
        controller.abort();
      });
    } catch (e) {
      console.error('[Spotify Brainer] LLM stream error:', e);
      port.postMessage({ type: 'error', content: e.message });
    }
  });
});

// --- Test connection ---
async function handleTestConnection(msg) {
  try {
    const adapter = getAdapter(msg.provider);
    const result = await adapter.validate(msg.apiKey);
    return { success: result.valid, error: result.error };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- Spotify data fetching (step-by-step with progress) ---

// All the data load steps, in order
const DATA_LOAD_STEPS = [
  { id: 'profile',       label: 'User profile' },
  { id: 'playback',      label: 'Current playback & queue' },
  { id: 'playlists',     label: 'Playlists' },
  { id: 'recent',        label: 'Recently played' },
  { id: 'topArtists',    label: 'Top artists (3 time ranges)' },
  { id: 'topTracks',     label: 'Top tracks (3 time ranges)' },
  { id: 'savedTracks',   label: 'Saved tracks (full library)' },
  { id: 'savedAlbums',   label: 'Saved albums' },
  { id: 'audioFeatures', label: 'Audio features (energy, mood, tempo)' },
  { id: 'intelligence',  label: 'Computing taste profile' },
  { id: 'history',       label: 'Loading historical metrics' },
];

function sendProgress(tabId, stepIndex, stepLabel, status, detail) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, {
    type: 'spotify-load-progress',
    step: stepIndex,
    totalSteps: DATA_LOAD_STEPS.length,
    stepLabel,
    status,   // 'loading' | 'done' | 'error' | 'skipped'
    detail,   // e.g. "142 playlists" or error message
    steps: DATA_LOAD_STEPS,
  });
}

// Lightweight: just grab current playback for the context bar
async function fetchNowPlaying(tabId) {
  const token = await getAccessToken();
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const pb = await fetchJson('https://api.spotify.com/v1/me/player', headers);
    if (pb) {
      spotifyData.nowPlaying = {
        trackName: pb.item?.name,
        artist: pb.item?.artists?.map((a) => a.name).join(', '),
        album: pb.item?.album?.name,
        isPlaying: pb.is_playing,
        progress: pb.progress_ms,
        duration: pb.item?.duration_ms,
        shuffle: pb.shuffle_state,
        repeat: pb.repeat_state,
        trackId: pb.item?.id,
      };
    }
    if (tabId) {
      const summary = spotifyData.nowPlaying?.trackName
        ? `Playing: "${spotifyData.nowPlaying.trackName}" — click Refresh to load full data`
        : 'Connected — click Refresh to load full data';
      chrome.tabs.sendMessage(tabId, { type: 'spotify-load-complete', summary });
    }
  } catch (e) {
    console.warn('[Spotify Brainer] Now playing check failed:', e.message);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'spotify-load-complete',
        summary: 'Connected — click Refresh to load full data',
      });
    }
  }
}

// Full pipeline — only runs when user explicitly clicks Refresh
async function fetchSpotifyData(tabId) {
  const token = await getAccessToken();
  if (!token) {
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'spotify-load-complete',
        summary: 'Not connected — click Settings to log in with Spotify',
      });
    }
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };
  const base = 'https://api.spotify.com/v1';
  let stepIdx = 0;

  try {
    // Step 0: Profile
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      spotifyData.userProfile = await fetchJson(`${base}/me`, headers);
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', spotifyData.userProfile?.display_name || 'Loaded');
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 1: Current playback & queue
    stepIdx = 1;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      const pb = await fetchJson(`${base}/me/player`, headers);
      if (pb) {
        spotifyData.nowPlaying = {
          trackName: pb.item?.name,
          artist: pb.item?.artists?.map((a) => a.name).join(', '),
          album: pb.item?.album?.name,
          isPlaying: pb.is_playing,
          progress: pb.progress_ms,
          duration: pb.item?.duration_ms,
          shuffle: pb.shuffle_state,
          repeat: pb.repeat_state,
          trackId: pb.item?.id,
        };
        spotifyData.queue = pb.queue || [];
        sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done',
          spotifyData.nowPlaying?.trackName ? `"${spotifyData.nowPlaying.trackName}" + ${spotifyData.queue.length} queued` : 'No active playback');
      } else {
        sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', 'No active playback');
      }
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }

    // Step 2: Playlists
    stepIdx = 2;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      spotifyData.playlists = await fetchAllPages(`${base}/me/playlists?limit=50`, headers);
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${spotifyData.playlists.length} playlists`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 3: Recently played
    stepIdx = 3;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      const rp = await fetchJson(`${base}/me/player/recently-played?limit=50`, headers);
      spotifyData.recentlyPlayed = rp?.items || [];
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${spotifyData.recentlyPlayed.length} tracks`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 4: Top artists (sequential to avoid rate limits)
    stepIdx = 4;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      const taShort = await fetchJson(`${base}/me/top/artists?time_range=short_term&limit=50`, headers);
      await sleep(300);
      const taMedium = await fetchJson(`${base}/me/top/artists?time_range=medium_term&limit=50`, headers);
      await sleep(300);
      const taLong = await fetchJson(`${base}/me/top/artists?time_range=long_term&limit=50`, headers);
      spotifyData.topArtists = {
        short: taShort?.items || [],
        medium: taMedium?.items || [],
        long: taLong?.items || [],
      };
      const total = spotifyData.topArtists.short.length + spotifyData.topArtists.medium.length + spotifyData.topArtists.long.length;
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading', `${total} artists — enriching with genres...`);

      // Enrich artists with full data (genres, popularity) from /v1/artists
      // The top artists endpoint returns deprecated empty genres — we need the full artist objects
      const allArtistIds = new Set();
      for (const a of [...spotifyData.topArtists.short, ...spotifyData.topArtists.medium, ...spotifyData.topArtists.long]) {
        if (a.id) allArtistIds.add(a.id);
      }
      const enrichedMap = {};
      const idBatches = [...allArtistIds];
      for (let i = 0; i < idBatches.length; i += 50) {
        const batch = idBatches.slice(i, i + 50);
        try {
          const artistData = await fetchJson(`${base}/artists?ids=${batch.join(',')}`, headers);
          for (const a of (artistData?.artists || [])) {
            if (a) enrichedMap[a.id] = a;
          }
        } catch {}
        if (i + 50 < idBatches.length) await sleep(300);
      }
      // Replace artists with enriched versions
      const enrich = (arr) => arr.map((a) => enrichedMap[a.id] || a);
      spotifyData.topArtists.short = enrich(spotifyData.topArtists.short);
      spotifyData.topArtists.medium = enrich(spotifyData.topArtists.medium);
      spotifyData.topArtists.long = enrich(spotifyData.topArtists.long);

      const genreCount = Object.values(enrichedMap).filter((a) => a.genres?.length > 0).length;
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${total} artists, ${genreCount} with genres`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 5: Top tracks (sequential to avoid rate limits)
    stepIdx = 5;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      const ttShort = await fetchJson(`${base}/me/top/tracks?time_range=short_term&limit=50`, headers);
      await sleep(300);
      const ttMedium = await fetchJson(`${base}/me/top/tracks?time_range=medium_term&limit=50`, headers);
      await sleep(300);
      const ttLong = await fetchJson(`${base}/me/top/tracks?time_range=long_term&limit=50`, headers);
      spotifyData.topTracks = {
        short: ttShort?.items || [],
        medium: ttMedium?.items || [],
        long: ttLong?.items || [],
      };
      const total = spotifyData.topTracks.short.length + spotifyData.topTracks.medium.length + spotifyData.topTracks.long.length;
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${total} tracks across 3 ranges`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 6: Saved tracks (paginated — can be large)
    stepIdx = 6;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading', 'This may take a moment for large libraries...');
    try {
      spotifyData.savedTracks = await fetchAllPagesWithProgress(
        `${base}/me/tracks?limit=50`, headers, 40,
        (loaded) => sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading', `${loaded} tracks so far...`)
      );
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${spotifyData.savedTracks.length} saved tracks`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 7: Saved albums
    stepIdx = 7;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      spotifyData.savedAlbums = await fetchAllPages(`${base}/me/albums?limit=50`, headers);
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${spotifyData.savedAlbums.length} saved albums`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 8: Audio features — pull from top tracks AND saved tracks
    stepIdx = 8;
    const allTrackIds = [
      ...spotifyData.topTracks.medium.map((t) => t.id),
      ...spotifyData.topTracks.short.map((t) => t.id),
      ...spotifyData.topTracks.long.map((t) => t.id),
      ...spotifyData.savedTracks.slice(0, 200).map((t) => t.track?.id),
      ...spotifyData.recentlyPlayed.map((t) => t.track?.id),
    ].filter(Boolean);
    // Deduplicate
    const uniqueTrackIds = [...new Set(allTrackIds)];

    if (uniqueTrackIds.length) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading', `${uniqueTrackIds.length} tracks to analyze`);
      const batchSize = 100;
      let fetched = 0;
      for (let i = 0; i < uniqueTrackIds.length; i += batchSize) {
        const batch = uniqueTrackIds.slice(i, i + batchSize);
        try {
          const features = await fetchJson(`${base}/audio-features?ids=${batch.join(',')}`, headers);
          if (features?.audio_features) {
            for (const f of features.audio_features) {
              if (f) spotifyData.audioFeatures[f.id] = f;
            }
            fetched += features.audio_features.filter(Boolean).length;
          }
        } catch {}
        if (i + batchSize < uniqueTrackIds.length) await sleep(400);
      }
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${fetched} tracks analyzed`);
    } else {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'skipped', 'No tracks to analyze');
    }

    // Step 9: Compute intelligence
    stepIdx = 9;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    const sampleEnriched = spotifyData.topArtists.medium[0];
    console.log('[Spotify Brainer] Enriched artist sample:', sampleEnriched?.name, 'genres:', sampleEnriched?.genres);
    console.log('[Spotify Brainer] Artists with genres:',
      spotifyData.topArtists.medium.filter(a => a.genres?.length > 0).length,
      '/', spotifyData.topArtists.medium.length);
    console.log('[Spotify Brainer] Audio features count:', Object.keys(spotifyData.audioFeatures).length);
    const intel = new SpotifyIntelligence();
    intelligence = intel.compute(spotifyData);
    console.log('[Spotify Brainer] Result — genres:', Object.keys(intelligence.genreDistribution || {}).length, 'mood:', intelligence.moodProfile?.label, 'source:', intelligence.moodProfile?.source);
    const tags = intelligence.personalityTags?.slice(0, 3).join(', ') || 'computed';
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', tags);

    // Step 10: Historical metrics
    stepIdx = 10;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    await computeHistoryMetrics();
    if (historyMetrics?.lifetimeStats?.totalPlays) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done',
        `${historyMetrics.lifetimeStats.totalPlays.toLocaleString()} plays over ${historyMetrics.lifetimeStats.totalYears} years`);
    } else {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', 'No GDPR history imported yet');
    }

    // Persist to cache
    await saveToCache();

    // Final: all done
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'spotify-load-complete',
        summary: buildContextSummary(),
      });
    }
  } catch (e) {
    console.error('Failed to fetch Spotify data:', e);
    if (tabId) {
      sendProgress(tabId, stepIdx, 'Error', 'error', e.message);
    }
  }
}

function buildContextSummary() {
  const parts = [];
  if (spotifyData.nowPlaying) {
    parts.push(`Playing: "${spotifyData.nowPlaying.trackName}"`);
  }
  parts.push(`${spotifyData.playlists.length} playlists`);
  parts.push(`${spotifyData.savedTracks.length} saved tracks`);
  if (Object.keys(spotifyData.audioFeatures).length) {
    parts.push(`${Object.keys(spotifyData.audioFeatures).length} audio profiles`);
  }
  if (intelligence?.personalityTags?.length) {
    parts.push(intelligence.personalityTags.slice(0, 2).join(', '));
  }
  if (historyMetrics?.lifetimeStats?.totalPlays) {
    parts.push(`${historyMetrics.lifetimeStats.totalPlays.toLocaleString()} historical plays`);
  }
  return parts.join(' | ') || 'Connected to Spotify';
}

async function fetchJson(url, headers, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 204) return null;
    if (res.status === 429) {
      // Rate limited — respect Retry-After header or exponential backoff
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (2000 * Math.pow(2, attempt));
      console.warn(`[Spotify Brainer] Rate limited (429), waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }
  throw new Error('HTTP 429 — rate limited after retries');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllPages(url, headers, maxPages = 20) {
  const items = [];
  let nextUrl = url;
  let page = 0;

  while (nextUrl && page < maxPages) {
    const data = await fetchJson(nextUrl, headers);
    if (!data) break;
    items.push(...(data.items || []));
    nextUrl = data.next;
    page++;
  }

  return items;
}

async function fetchAllPagesWithProgress(url, headers, maxPages = 20, onProgress) {
  const items = [];
  let nextUrl = url;
  let page = 0;

  while (nextUrl && page < maxPages) {
    const data = await fetchJson(nextUrl, headers);
    if (!data) break;
    items.push(...(data.items || []));
    nextUrl = data.next;
    page++;
    if (onProgress) onProgress(items.length);
  }

  return items;
}

// --- GDPR History Import ---
async function handleGDPRImport(data, filename) {
  // Store in IndexedDB
  const db = await openHistoryDB();
  const tx = db.transaction('listeningEvents', 'readwrite');
  const store = tx.objectStore('listeningEvents');

  let imported = 0;
  for (const entry of data) {
    if (!entry.ts || !entry.master_metadata_track_name) continue;

    const event = {
      timestamp: new Date(entry.ts).getTime(),
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
    };

    try {
      await store.put(event);
      imported++;
    } catch {}
  }

  await tx.done;
  console.log(`GDPR import: ${imported} events from ${filename}`);

  // Trigger metrics recomputation and cache
  await computeHistoryMetrics();
  await saveToCache();
}

// --- IndexedDB for history ---
function openHistoryDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('SpotifyBrainerHistory', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('listeningEvents')) {
        const store = db.createObjectStore('listeningEvents', { keyPath: 'timestamp' });
        store.createIndex('trackUri', 'trackUri', { unique: false });
        store.createIndex('artistName', 'artistName', { unique: false });
      }
      if (!db.objectStoreNames.contains('aggregates')) {
        db.createObjectStore('aggregates', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function computeHistoryMetrics() {
  try {
    const db = await openHistoryDB();
    const tx = db.transaction('listeningEvents', 'readonly');
    const store = tx.objectStore('listeningEvents');
    const allEvents = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (!allEvents.length) return;

    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);

    const metrics = {};

    // Lifetime stats
    const totalMs = allEvents.reduce((sum, e) => sum + (e.msPlayed || 0), 0);
    const uniqueTracks = new Set(allEvents.map((e) => e.trackUri).filter(Boolean));
    const uniqueArtists = new Set(allEvents.map((e) => e.artistName).filter(Boolean));
    const firstEvent = allEvents[0];
    const lastEvent = allEvents[allEvents.length - 1];
    const totalYears = ((lastEvent.timestamp - firstEvent.timestamp) / (365.25 * 24 * 3600000)).toFixed(1);

    // Most played artist
    const artistPlays = {};
    for (const e of allEvents) {
      if (e.artistName) artistPlays[e.artistName] = (artistPlays[e.artistName] || 0) + 1;
    }
    const topArtist = Object.entries(artistPlays).sort((a, b) => b[1] - a[1])[0];

    // Most played track
    const trackPlays = {};
    for (const e of allEvents) {
      const key = `${e.trackName} — ${e.artistName}`;
      if (e.trackName) trackPlays[key] = (trackPlays[key] || 0) + 1;
    }
    const topTrack = Object.entries(trackPlays).sort((a, b) => b[1] - a[1])[0];

    metrics.lifetimeStats = {
      totalMs,
      totalPlays: allEvents.length,
      uniqueTracks: uniqueTracks.size,
      uniqueArtists: uniqueArtists.size,
      totalYears,
      topArtistAllTime: topArtist ? { name: topArtist[0], plays: topArtist[1] } : null,
      topTrackAllTime: topTrack ? { name: topTrack[0], plays: topTrack[1] } : null,
    };

    // Taste evolution by year
    const byYear = {};
    for (const e of allEvents) {
      const year = new Date(e.timestamp).getFullYear();
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(e);
    }

    metrics.tasteEvolution = Object.entries(byYear)
      .sort((a, b) => a[0] - b[0])
      .map(([year, events]) => {
        const yearArtists = {};
        for (const e of events) {
          if (e.artistName) yearArtists[e.artistName] = (yearArtists[e.artistName] || 0) + 1;
        }
        const topYearArtists = Object.entries(yearArtists).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const skipRate = events.filter((e) => e.skipped).length / events.length;
        return {
          period: year,
          description: `Top artists: ${topYearArtists.map((a) => a[0]).join(', ')} | ${events.length} plays | ${Math.round(skipRate * 100)}% skip rate`,
        };
      });

    // Recent trends (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600000;
    const recentEvents = allEvents.filter((e) => e.timestamp > thirtyDaysAgo);
    const sixtyDaysAgo = Date.now() - 60 * 24 * 3600000;
    const prevMonthEvents = allEvents.filter((e) => e.timestamp > sixtyDaysAgo && e.timestamp <= thirtyDaysAgo);

    metrics.recentTrends = [];
    if (recentEvents.length) {
      const recentMs = recentEvents.reduce((s, e) => s + (e.msPlayed || 0), 0);
      const recentHrs = (recentMs / 3600000).toFixed(1);
      metrics.recentTrends.push(`Listening: ${recentHrs} hrs this month`);

      const recentUniqueArtists = new Set(recentEvents.map((e) => e.artistName).filter(Boolean));
      metrics.recentTrends.push(`Discovery: ${recentUniqueArtists.size} unique artists`);

      const recentSkipRate = recentEvents.filter((e) => e.skipped).length / recentEvents.length;
      metrics.recentTrends.push(`Skip rate: ${Math.round(recentSkipRate * 100)}%`);

      if (prevMonthEvents.length) {
        const prevMs = prevMonthEvents.reduce((s, e) => s + (e.msPlayed || 0), 0);
        const change = ((recentMs - prevMs) / prevMs * 100).toFixed(0);
        metrics.recentTrends.push(`Volume change: ${change > 0 ? '+' : ''}${change}% vs last month`);
      }
    }

    // Behavioral patterns
    metrics.behavioralPatterns = [];
    const platformCounts = {};
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);
    let shuffleCount = 0;

    for (const e of allEvents) {
      if (e.platform) platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
      const d = new Date(e.timestamp);
      hourCounts[d.getHours()]++;
      dayCounts[d.getDay()]++;
      if (e.shuffle) shuffleCount++;
    }

    // Platform breakdown
    const topPlatforms = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topPlatforms.length) {
      metrics.behavioralPatterns.push(
        `Platforms: ${topPlatforms.map(([p, c]) => `${p} (${Math.round(c / allEvents.length * 100)}%)`).join(', ')}`
      );
    }

    // Peak hours
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    metrics.behavioralPatterns.push(`Peak listening hour: ${peakHour}:00`);

    // Peak day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDay = dayCounts.indexOf(Math.max(...dayCounts));
    metrics.behavioralPatterns.push(`Most active day: ${dayNames[peakDay]}`);

    // Shuffle
    metrics.behavioralPatterns.push(`Shuffle: on ${Math.round(shuffleCount / allEvents.length * 100)}% of the time`);

    // Overall skip rate
    const overallSkipRate = allEvents.filter((e) => e.skipped).length / allEvents.length;
    metrics.behavioralPatterns.push(`Overall skip rate: ${Math.round(overallSkipRate * 100)}%`);

    historyMetrics = metrics;

    // Notify any connected tabs
    chrome.tabs.query({ url: 'https://open.spotify.com/*' }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'spotify-context-update',
          summary: `History loaded: ${allEvents.length.toLocaleString()} plays over ${totalYears} years`,
        });
      }
    });
  } catch (e) {
    console.error('Failed to compute history metrics:', e);
  }
}

// --- Keyboard shortcut ---
chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'toggle-sidebar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-sidebar' });
      }
    });
  }
});

// History metrics are computed on-demand when user clicks Refresh
// (or after GDPR import)
