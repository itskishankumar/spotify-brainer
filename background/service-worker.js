// Spotify Brainer — Background Service Worker
// Routes LLM API calls through provider adapters, manages Spotify data pipeline.

import { getAdapter } from '../llm/registry.js';
import { LyriaAdapter } from '../music-gen/adapters/lyria.js';
import { buildMusicAgentSystemPrompt, assembleLyriaPrompt, buildFallbackLyriaPrompt } from '../music-gen/prompt-builder.js';
import { SpotifyIntelligence } from '../lib/spotify-intelligence.js';
import { CONTROLS } from '../lib/spotify-controls.js';
import { SPOTIFY_TOOLS, TOOL_TO_ACTION } from '../llm/tools.js';
import { getAccessToken, isLoggedIn, startLogin, logout, getClientId, setClientId } from '../lib/spotify-auth.js';
import { initLastFmCache, enrichArtistsWithTags, enrichTracksWithTags, aggregateTopTags, getLastFmApiKey } from '../lib/lastfm.js';

const MUSIC_GEN_ADAPTERS = { lyria: new LyriaAdapter() };
function getMusicGenAdapter(name) {
  const adapter = MUSIC_GEN_ADAPTERS[name];
  if (!adapter) throw new Error(`Unknown music gen provider: ${name}`);
  return adapter;
}

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
    lastLoadedAt,
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
    lastLoadedAt = cache.lastLoadedAt || cache.cachedAt || null;

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
initLastFmCache();

// --- System prompt builder ---
function buildSystemPrompt() {
  const parts = [
    `You are Spotify Brainer, an AI assistant with deep knowledge of this user's music identity and full control over their Spotify.`,
    `You can control playback, search, queue songs, create playlists, save tracks, and more using tools.`,
    `You also have data-fetching tools to look up the user's profile, top artists/tracks, listening history, playlists, and taste profile — fetch what you need when it's relevant.`,
    `When the user asks to play something, search for it first to get the URI, then play it. Don't ask for confirmation — just do it.`,
    ``,
    `IMPORTANT: When mentioning or suggesting songs, ALWAYS format them as Spotify links using this exact format:`,
    `[Song Name](spotify:track:TRACK_ID) by Artist Name`,
    `If you don't have the track ID, use [Song Name](spotify:search:ENCODED_QUERY) where ENCODED_QUERY is the URL-encoded search query.`,
    `This allows the user to click the song name to play it directly.`,
  ];

  // Current playback — always injected so the LLM knows what's on without a tool call
  if (spotifyData.nowPlaying) {
    const np = spotifyData.nowPlaying;
    parts.push(`\n## Now Playing`);
    parts.push(`"${np.trackName}" by ${np.artist} from "${np.album}" | ${np.isPlaying ? 'Playing' : 'Paused'}`);
    if (np.progress && np.duration) {
      parts.push(`${formatMs(np.progress)} / ${formatMs(np.duration)}`);
    }
    if (np.trackId) parts.push(`Track ID: ${np.trackId}`);
    if (np.shuffle !== undefined) parts.push(`Shuffle: ${np.shuffle ? 'On' : 'Off'} | Repeat: ${np.repeat || 'Off'}`);
  } else {
    parts.push(`\n## Now Playing\nNothing playing.`);
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

  // --- Spotify Controls ---
  if (msg.type === 'spotify-control') {
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          sendResponse({ success: false, error: 'Not logged in' });
          return;
        }
        const fn = CONTROLS[msg.action];
        if (!fn) {
          sendResponse({ success: false, error: `Unknown action: ${msg.action}` });
          return;
        }
        const data = await fn(token, msg.params || {});
        sendResponse({ success: true, data });
      } catch (e) {
        console.error(`[Spotify Brainer] Control ${msg.action} failed:`, e.message);
        sendResponse({ success: false, error: e.message });
      }
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
    handleGDPRImport(msg.data, msg.filename).then((imported) => {
      // Update the history progress step on all Spotify tabs
      if (historyMetrics?.lifetimeStats?.totalPlays) {
        chrome.tabs.query({ url: 'https://open.spotify.com/*' }, (tabs) => {
          for (const tab of tabs) {
            sendProgress(tab.id, 8, DATA_LOAD_STEPS[8].label, 'done',
              `${historyMetrics.lifetimeStats.totalPlays.toLocaleString()} plays over ${historyMetrics.lifetimeStats.totalYears} years`);
          }
        });
      }
      sendResponse({ imported });
    });
    return true; // async
  }

  if (msg.type === 'clear-history') {
    (async () => {
      const db = await openHistoryDB();
      const tx = db.transaction('listeningEvents', 'readwrite');
      tx.objectStore('listeningEvents').clear();
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      historyMetrics = null;
      await saveToCache();
      sendResponse({ ok: true });
    })();
    return true; // async
  }

  if (msg.type === 'music-generate') {
    (async () => {
      try {
        const { provider, model, apiKey, userIntent } = msg;
        if (!apiKey) { sendResponse({ error: 'No API key provided.' }); return; }

        // 1. Load LLM credentials
        const llmSettings = await chrome.storage.local.get(['sb_provider']);
        const llmProvider = llmSettings.sb_provider;
        let llmAdapter = null, llmModel = null, llmApiKey = null;
        if (llmProvider) {
          const llmData = await chrome.storage.local.get([`sb_apiKey_${llmProvider}`, `sb_model_${llmProvider}`]);
          llmApiKey = llmData[`sb_apiKey_${llmProvider}`];
          llmModel  = llmData[`sb_model_${llmProvider}`];
          if (llmApiKey && llmModel) llmAdapter = getAdapter(llmProvider);
        }

        // 2. Agentic loop — the LLM parses the user's intent, calls get_history_taste
        //    with date params if a time period is mentioned, then uses its music knowledge
        //    of the returned artists/tracks to output a Lyria JSON prompt.
        //    Last.fm tags are fetched lazily inside tool calls (get_history_taste, get_top_artists),
        //    not pre-fetched here, to avoid delaying the LLM start.
        let lyriaPrompt = null;
        if (llmAdapter) {
          try {
            // Exclude playback control tools — music gen only needs data-fetching + Last.fm tags
            const PLAYBACK_TOOLS = new Set([
              'play_track', 'pause', 'skip_next', 'skip_previous', 'seek',
              'set_volume', 'set_shuffle', 'set_repeat', 'add_to_queue',
              'get_devices', 'transfer_playback',
              'add_to_playlist', 'create_playlist', 'save_tracks', 'remove_saved_tracks',
              'get_track_credits',
            ]);
            const MUSIC_TOOLS = SPOTIFY_TOOLS.filter((t) => !PLAYBACK_TOOLS.has(t.name));
            const messages = [
              { role: 'system', content: buildMusicAgentSystemPrompt(historyMetrics, spotifyData, intelligence) },
              { role: 'user', content: userIntent?.trim() || 'Generate a track that reflects my overall taste.' },
            ];

            const MAX_ROUNDS = 5;
            for (let round = 0; round < MAX_ROUNDS; round++) {
              const response = await llmAdapter.sendMessage({
                model: llmModel,
                maxTokens: 600,
                temperature: 0.3,
                messages,
                tools: MUSIC_TOOLS,
              }, llmApiKey);

              if (response.finishReason === 'tool_use' && response.toolCalls?.length) {
                // Build assistant turn
                const assistantContent = [];
                if (response.content) assistantContent.push({ type: 'text', text: response.content });
                for (const tc of response.toolCalls) {
                  assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
                }
                messages.push({ role: 'assistant', content: assistantContent });

                // Execute tools and return results
                const toolResults = [];
                for (const tc of response.toolCalls) {
                  const result = await executeTool(tc.name, tc.input);
                  console.log(`[Spotify Brainer] Tool ${tc.name}(${JSON.stringify(tc.input)}) →`, result);
                  toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(result) });
                }
                messages.push({ role: 'user', content: toolResults });
              } else {
                // LLM finished — parse JSON output as Lyria prompt
                const jsonMatch = response.content?.trim().match(/\{[\s\S]*\}/);
                if (jsonMatch) lyriaPrompt = assembleLyriaPrompt(JSON.parse(jsonMatch[0]));
                break;
              }
            }
          } catch (e) {
            console.warn('[Spotify Brainer] Music agent failed, using fallback:', e.message);
          }
        }

        if (!lyriaPrompt) {
          // Fallback: no LLM or LLM failed — fetch Last.fm tags here for the fallback builder
          let fallbackLastfmTags = [];
          const lastfmKey = await getLastFmApiKey();
          if (lastfmKey) {
            try {
              const baselineArtists = (intelligence?.topArtistsAllTime?.slice(0, 10) || []).map((a) => ({ name: a.name, plays: a.plays || 1 }));
              if (baselineArtists.length) {
                await enrichArtistsWithTags(baselineArtists, lastfmKey);
                fallbackLastfmTags = aggregateTopTags(baselineArtists);
              }
            } catch (e) {
              console.warn('[Spotify Brainer] Last.fm fallback enrichment failed:', e.message);
            }
          }
          lyriaPrompt = buildFallbackLyriaPrompt({ historyMetrics, spotifyData, intelligence, lastfmTags: fallbackLastfmTags });
        }

        const musicAdapter = getMusicGenAdapter(provider);
        const result = await musicAdapter.generate({ prompt: lyriaPrompt, model }, apiKey);
        sendResponse({ ...result, prompt: lyriaPrompt });
      } catch (e) {
        console.error('[Spotify Brainer] Music generation failed:', e.message);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'music-test') {
    (async () => {
      try {
        const adapter = getMusicGenAdapter(msg.provider);
        const result = await adapter.validate(msg.apiKey);
        sendResponse(result);
      } catch (e) {
        sendResponse({ valid: false, error: e.message });
      }
    })();
    return true;
  }

  // intelligence and historyMetrics are computed directly in this worker
});

// --- Execute a tool call against Spotify ---
async function executeTool(toolName, input) {
  // Special tool: get_track_credits — scrapes Spotify's credits dialog from the DOM
  if (toolName === 'get_track_credits') {
    const trackId = input.track_id || spotifyData.nowPlaying?.trackId;
    const credits = await fetchTrackCredits(trackId);
    if (credits) return { success: true, data: credits };
    return { error: 'Could not scrape credits. Make sure a track is playing in Spotify.' };
  }

  // Data-fetching tools — return in-memory state, no API calls needed
  const DATA_TOOLS = {
    get_user_profile: () => {
      if (!spotifyData.userProfile) return { error: 'No profile data loaded. Ask the user to refresh their data.' };
      const u = spotifyData.userProfile;
      return { success: true, data: { name: u.display_name, plan: u.product, country: u.country, followers: u.followers?.total } };
    },
    get_top_artists: async () => {
      const range = input.time_range || 'medium';
      const artists = spotifyData.topArtists[range];
      if (!artists?.length) return { error: `No top artists data for range "${range}". Ask the user to refresh.` };
      const mapped = artists.map((a, i) => ({ rank: i + 1, name: a.name, id: a.id, genres: a.genres }));
      const lastfmKey = await getLastFmApiKey();
      if (lastfmKey) await enrichArtistsWithTags(mapped.slice(0, 10), lastfmKey);
      return { success: true, data: mapped };
    },
    get_top_tracks: () => {
      const range = input.time_range || 'medium';
      const tracks = spotifyData.topTracks[range];
      if (!tracks?.length) return { error: `No top tracks data for range "${range}". Ask the user to refresh.` };
      return { success: true, data: tracks.map((t, i) => ({ rank: i + 1, name: t.name, id: t.id, artists: t.artists?.map(a => a.name), album: t.album?.name })) };
    },
    get_recently_played: () => {
      if (!spotifyData.recentlyPlayed?.length) return { error: 'No recently played data. Ask the user to refresh.' };
      return { success: true, data: spotifyData.recentlyPlayed.map(r => ({ name: r.track?.name, id: r.track?.id, artists: r.track?.artists?.map(a => a.name), played_at: r.played_at })) };
    },
    get_playlists: () => {
      if (!spotifyData.playlists?.length) return { error: 'No playlists loaded. Ask the user to refresh.' };
      return {
        success: true,
        data: spotifyData.playlists.map(pl => ({
          name: pl.name, id: pl.id, total: pl.tracks?.total || 0,
          tracks: pl.trackItems?.map(t => ({ name: t.name, id: t.id, artists: t.artists?.map(a => a.name) })) || [],
        })),
      };
    },
    get_library_stats: () => ({
      success: true,
      data: { saved_tracks: spotifyData.savedTracks?.length || 0, saved_albums: spotifyData.savedAlbums?.length || 0 },
    }),
    get_taste_profile: () => {
      if (!intelligence) return { error: 'No taste profile computed. Ask the user to refresh their data.' };
      return { success: true, data: intelligence };
    },
    get_history_stats: async () => {
      if (!historyMetrics && !input.from && !input.to) return { error: 'No listening history imported. Ask the user to import their Spotify GDPR data export.' };
      if (input.from || input.to) {
        const events = await getEventsInRange(input.from, input.to);
        const stats = computePeriodStats(events);
        return stats.error ? { error: stats.error } : { success: true, data: stats };
      }
      return { success: true, data: { lifetimeStats: historyMetrics.lifetimeStats, listeningEngagement: historyMetrics.listeningEngagement, streaksRecords: historyMetrics.streaksRecords } };
    },
    get_history_artists: async () => {
      if (!historyMetrics && !input.from && !input.to) return { error: 'No listening history imported.' };
      if (input.from || input.to) {
        const events = await getEventsInRange(input.from, input.to);
        const stats = computePeriodStats(events);
        // Returns extended top-20 artist list with no track/temporal data — use when you need more artists than get_history_taste provides
        return stats.error ? { error: stats.error } : { success: true, data: { period: stats.period, topArtists: stats.topArtists, uniqueArtists: stats.uniqueArtists, totalPlays: stats.totalPlays, totalHours: stats.totalHours } };
      }
      return { success: true, data: { artistRelationships: historyMetrics.artistRelationships } };
    },
    get_history_temporal: async () => {
      if (!historyMetrics && !input.from && !input.to) return { error: 'No listening history imported.' };
      if (input.from || input.to) {
        const events = await getEventsInRange(input.from, input.to);
        const stats = computePeriodStats(events);
        return stats.error ? { error: stats.error } : { success: true, data: { period: stats.period, peakHour: stats.peakHour, nightOwlPct: stats.nightOwlPct, totalPlays: stats.totalPlays, totalHours: stats.totalHours } };
      }
      return { success: true, data: { temporalBehavior: historyMetrics.temporalBehavior } };
    },
    get_history_replay: async () => {
      if (!historyMetrics && !input.from && !input.to) return { error: 'No listening history imported.' };
      if (input.from || input.to) {
        const events = await getEventsInRange(input.from, input.to);
        const stats = computePeriodStats(events);
        return stats.error ? { error: stats.error } : { success: true, data: { period: stats.period, repeatRatio: stats.repeatRatio, topTracks: stats.topTracks } };
      }
      return { success: true, data: { replayObsession: historyMetrics.replayObsession } };
    },
    get_history_taste: async () => {
      if (!historyMetrics && !input.from && !input.to) return { error: 'No listening history imported.' };
      if (input.from || input.to) {
        const events = await getEventsInRange(input.from, input.to);
        const stats = computePeriodStats(events);
        if (stats.error) return { error: stats.error };
        const topArtistSlice = stats.topArtists.slice(0, 10);
        const topTrackSlice = stats.topTracks;
        const lastfmKey = await getLastFmApiKey();
        if (lastfmKey) {
          await enrichArtistsWithTags(topArtistSlice, lastfmKey);
          await enrichTracksWithTags(topTrackSlice, lastfmKey);
          console.log('[Spotify Brainer] Last.fm tags enriched for period artists + tracks');
        }
        const lastfmTags = lastfmKey ? aggregateTopTags([...topArtistSlice, ...topTrackSlice]) : [];
        return { success: true, data: { period: stats.period, topArtists: topArtistSlice, topTracks: topTrackSlice, peakHour: stats.peakHour, nightOwlPct: stats.nightOwlPct, repeatRatio: stats.repeatRatio, totalPlays: stats.totalPlays, totalHours: stats.totalHours, ...(lastfmTags.length ? { lastfmTags: lastfmTags.map(t => t.name) } : {}) } };
      }
      return { success: true, data: { tasteProfile: historyMetrics.tasteProfile, tasteEvolution: historyMetrics.tasteEvolution } };
    },
    get_lastfm_tags: async () => {
      const lastfmKey = await getLastFmApiKey();
      if (!lastfmKey) return { error: 'No Last.fm API key configured. Ask the user to add one in Settings.' };
      const result = { artistTags: {}, trackTags: {} };
      // Fetch artist tags
      if (input.artists?.length) {
        const artistObjs = input.artists.map((name) => ({ name }));
        await enrichArtistsWithTags(artistObjs, lastfmKey);
        for (const a of artistObjs) {
          if (a.lastfmTags?.length) result.artistTags[a.name] = a.lastfmTags.map((t) => t.name);
        }
      }
      // Fetch track tags
      if (input.tracks?.length) {
        const trackObjs = input.tracks.map((t) => ({ name: `${t.track} \u2014 ${t.artist}` }));
        await enrichTracksWithTags(trackObjs, lastfmKey);
        for (let i = 0; i < input.tracks.length; i++) {
          const tags = trackObjs[i].lastfmTags;
          if (tags?.length) result.trackTags[`${input.tracks[i].track} — ${input.tracks[i].artist}`] = tags.map((t) => t.name);
        }
      }
      // Aggregate across everything
      const allItems = [
        ...(input.artists || []).map((name) => ({ lastfmTags: (result.artistTags[name] || []).map((n) => ({ name: n, count: 50 })), plays: 1 })),
        ...Object.values(result.trackTags).map((tags) => ({ lastfmTags: tags.map((n) => ({ name: n, count: 50 })), plays: 1 })),
      ];
      result.aggregatedTags = aggregateTopTags(allItems).map((t) => t.name);
      return { success: true, data: result };
    },
    get_queue: () => {
      if (!spotifyData.queue?.length) return { success: true, data: [] };
      return { success: true, data: spotifyData.queue.map(t => ({ name: t.name, id: t.id, artists: t.artists?.map(a => a.name) })) };
    },
    get_current_view: () => ({ success: true, data: { view: spotifyData.currentView || 'Unknown' } }),
  };

  if (DATA_TOOLS[toolName]) {
    return await DATA_TOOLS[toolName]();
  }

  const mapping = TOOL_TO_ACTION[toolName];
  if (!mapping) {
    return { error: `Unknown tool: ${toolName}` };
  }

  const token = await getAccessToken();
  if (!token) {
    return { error: 'Not connected to Spotify. Please connect in Settings.' };
  }

  const params = mapping.transform(input);
  const fn = CONTROLS[mapping.action];
  if (!fn) {
    return { error: `Control action not found: ${mapping.action}` };
  }

  try {
    // Special case: createPlaylist needs userId
    if (mapping.action === 'createPlaylist' && !params.userId && spotifyData.userProfile?.id) {
      params.userId = spotifyData.userProfile.id;
    }
    const result = await fn(token, params);
    return { success: true, data: result };
  } catch (e) {
    return { error: e.message };
  }
}

// --- Streaming via port (with tool use loop) ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'llm-stream') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'llm-stream') return;

    let disconnected = false;
    port.onDisconnect.addListener(() => { disconnected = true; });

    function safeSend(chunk) {
      if (disconnected) return false;
      try { port.postMessage(chunk); return true; } catch { disconnected = true; return false; }
    }

    try {
      const adapter = getAdapter(msg.provider);
      const systemPrompt = buildSystemPrompt();

      // Build messages array with system prompt
      const messages = [
        { role: 'system', content: systemPrompt },
        ...msg.messages.filter((m) => m.role !== 'system'),
      ];

      const MAX_TOOL_ROUNDS = 10; // Safety limit
      let round = 0;

      while (round < MAX_TOOL_ROUNDS) {
        round++;
        const pendingToolCalls = [];
        let textContent = '';
        let stopReason = null;

        const request = {
          messages,
          model: msg.model,
          maxTokens: 4096,
          stream: true,
          tools: SPOTIFY_TOOLS,
        };

        // Stream one round
        await new Promise((resolve) => {
          const controller = adapter.streamMessage(request, msg.apiKey, (chunk) => {
            if (disconnected) { controller.abort(); resolve(); return; }

            if (chunk.type === 'text') {
              textContent += chunk.content;
              safeSend(chunk);
            } else if (chunk.type === 'tool_use_start') {
              safeSend({ type: 'tool_use_start', toolName: chunk.toolName });
            } else if (chunk.type === 'tool_use') {
              pendingToolCalls.push({ id: chunk.toolId, name: chunk.toolName, input: chunk.input });
            } else if (chunk.type === 'done') {
              stopReason = chunk.stopReason;
              resolve();
            } else if (chunk.type === 'error') {
              safeSend(chunk);
              resolve();
            }
          });

          // Abort if port disconnects mid-stream
          const checkDisconnect = () => { if (disconnected) { controller.abort(); resolve(); } };
          port.onDisconnect.addListener(checkDisconnect);
        });

        if (disconnected) return;

        // If no tool calls, we're done
        if (stopReason !== 'tool_use' || pendingToolCalls.length === 0) {
          safeSend({ type: 'done', content: '' });
          return;
        }

        // Build assistant message with text + tool_use blocks
        const assistantContent = [];
        if (textContent) {
          assistantContent.push({ type: 'text', text: textContent });
        }
        for (const tc of pendingToolCalls) {
          assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        messages.push({ role: 'assistant', content: assistantContent });

        // Execute all tool calls and collect results
        const toolResults = [];
        for (const tc of pendingToolCalls) {
          console.log(`[Spotify Brainer] Executing tool: ${tc.name}`);
          safeSend({ type: 'tool_status', toolName: tc.name, status: 'executing' });

          const result = await executeTool(tc.name, tc.input);

          // Compact search results to save tokens
          let resultContent = result;
          if (tc.name === 'search' && result.data) {
            resultContent = compactSearchResult(result.data);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify(resultContent),
          });

          safeSend({ type: 'tool_status', toolName: tc.name, status: result.error ? 'error' : 'done', result: result.error || 'OK' });
        }

        // Add tool results to messages for next round
        messages.push({ role: 'user', content: toolResults });

        // Reset text for next round
        textContent = '';
      }

      // If we hit the safety limit
      safeSend({ type: 'text', content: '\n\n*(Reached maximum tool call rounds)*' });
      safeSend({ type: 'done', content: '' });
    } catch (e) {
      console.error('[Spotify Brainer] LLM stream error:', e);
      safeSend({ type: 'error', content: e.message });
    }
  });
});

// Compact search results to only include essential info
function compactSearchResult(data) {
  const result = {};
  if (data.tracks?.items) {
    result.tracks = data.tracks.items.filter(Boolean).map(t => ({
      name: t.name,
      artist: t.artists?.map(a => a.name).join(', '),
      album: t.album?.name,
      uri: t.uri,
      id: t.id,
      duration_ms: t.duration_ms,
    }));
  }
  if (data.artists?.items) {
    result.artists = data.artists.items.filter(Boolean).map(a => ({
      name: a.name,
      uri: a.uri,
      id: a.id,
      followers: a.followers?.total,
    }));
  }
  if (data.albums?.items) {
    result.albums = data.albums.items.filter(Boolean).map(a => ({
      name: a.name,
      artist: a.artists?.map(ar => ar.name).join(', '),
      uri: a.uri,
      id: a.id,
      release_date: a.release_date,
    }));
  }
  if (data.playlists?.items) {
    result.playlists = data.playlists.items.filter(Boolean).map(p => ({
      name: p.name,
      uri: p.uri,
      id: p.id,
      tracks: p.tracks?.total,
    }));
  }
  return result;
}

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

// --- Track Credits (realtime, per song change) ---
let creditsCache = {}; // trackId → credits object

async function fetchTrackCredits(trackId, tabId) {
  if (trackId && creditsCache[trackId]) {
    return creditsCache[trackId];
  }

  // Ask the content script to scrape the credits dialog from the DOM
  if (!tabId) {
    // Try to find the Spotify tab
    const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' });
    if (tabs.length > 0) tabId = tabs[0].id;
  }

  if (!tabId) return null;

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'scrape-credits', trackId });
    const credits = response?.credits;
    if (credits && trackId) {
      creditsCache[trackId] = credits;
    }
    return credits;
  } catch (e) {
    console.warn('[Spotify Brainer] Credits scrape failed:', e.message);
    return null;
  }
}


// --- Spotify data fetching (step-by-step with progress) ---

// All the data load steps, in order
const DATA_LOAD_STEPS = [
  { id: 'profile',       label: 'User profile' },
  { id: 'playlists',     label: 'Playlists & tracks' },
  { id: 'recent',        label: 'Recently played' },
  { id: 'topArtists',    label: 'Top artists (3 time ranges)' },
  { id: 'topTracks',     label: 'Top tracks (3 time ranges)' },
  { id: 'savedTracks',   label: 'Saved tracks (full library)' },
  { id: 'savedAlbums',   label: 'Saved albums' },
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
  console.log('[Spotify Brainer] Starting full data pipeline');
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

    // Step 1: Playlists + their tracks (idx 1)
    stepIdx = 1;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      spotifyData.playlists = await fetchAllPages(`${base}/me/playlists?limit=50`, headers);
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading', `${spotifyData.playlists.length} playlists — fetching tracks...`);

      // Fetch tracks for each playlist (with rate limit awareness)
      let totalTracks = 0;
      for (let i = 0; i < spotifyData.playlists.length; i++) {
        const pl = spotifyData.playlists[i];
        try {
          const tracks = await fetchAllPages(`${base}/playlists/${pl.id}/items?limit=100`, headers, 20);
          pl.trackItems = tracks.map(t => t.track || t.item).filter(Boolean);
          totalTracks += pl.trackItems.length;
          sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading',
            `${i + 1}/${spotifyData.playlists.length} playlists (${totalTracks} tracks)`);
        } catch (plErr) {
          console.warn(`[Spotify Brainer] Failed to fetch tracks for "${pl.name}":`, plErr.message);
          pl.trackItems = []; // Skip on error, don't block the whole pipeline
        }
        if (i < spotifyData.playlists.length - 1) await sleep(200);
      }
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done',
        `${spotifyData.playlists.length} playlists, ${totalTracks} tracks`);
    } catch (e) {
      console.error('[Spotify Brainer] Playlists step failed:', e);
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 2: Recently played
    stepIdx = 2;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      const rp = await fetchJson(`${base}/me/player/recently-played?limit=50`, headers);
      spotifyData.recentlyPlayed = rp?.items || [];
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${spotifyData.recentlyPlayed.length} tracks`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 3: Top artists (sequential to avoid rate limits)
    stepIdx = 3;
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
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${total} artists across 3 ranges`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 4: Top tracks (sequential to avoid rate limits)
    stepIdx = 4;
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

    // Step 5: Saved tracks (paginated — can be large)
    stepIdx = 5;
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

    // Step 6: Saved albums
    stepIdx = 6;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    try {
      spotifyData.savedAlbums = await fetchAllPages(`${base}/me/albums?limit=50`, headers);
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', `${spotifyData.savedAlbums.length} saved albums`);
    } catch (e) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'error', e.message);
    }
    await sleep(500);

    // Step 7: Compute intelligence
    stepIdx = 7;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    const intel = new SpotifyIntelligence();
    intelligence = intel.compute(spotifyData);
    const tags = intelligence.personalityTags?.slice(0, 3).join(', ') || 'computed';
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', tags);

    // Step 8: Historical metrics
    stepIdx = 8;
    sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'loading');
    await computeHistoryMetrics();
    if (historyMetrics?.lifetimeStats?.totalPlays) {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done',
        `${historyMetrics.lifetimeStats.totalPlays.toLocaleString()} plays over ${historyMetrics.lifetimeStats.totalYears} years`);
    } else {
      sendProgress(tabId, stepIdx, DATA_LOAD_STEPS[stepIdx].label, 'done', 'No GDPR history imported yet');
    }

    // Record load time and persist to cache
    lastLoadedAt = Date.now();
    await saveToCache();

    // Final: all done
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'spotify-load-complete',
        summary: buildContextSummary(),
      });
    }
  } catch (e) {
    console.error('[Spotify Brainer] Failed to fetch Spotify data:', e);
    if (tabId) {
      sendProgress(tabId, stepIdx, 'Error', 'error', e.message);
    }
  }
}

let lastLoadedAt = null;

function buildContextSummary() {
  if (!lastLoadedAt) return 'Not loaded yet — click Refresh';
  const time = new Date(lastLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `Loaded: ${time}`;
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

  // Detect format: extended GDPR (has `ts`) vs basic Account Data (has `endTime`)
  const events = [];
  for (const entry of data) {
    const isExtended = !!entry.ts;
    const isBasic = !!entry.endTime;
    if (!isExtended && !isBasic) continue;
    if (isExtended && !entry.master_metadata_track_name) continue;
    if (isBasic && !entry.trackName) continue;

    events.push(isExtended ? {
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
    } : {
      timestamp: new Date(entry.endTime).getTime(),
      trackUri: '',
      trackName: entry.trackName || '',
      artistName: entry.artistName || '',
      albumName: '',
      msPlayed: entry.msPlayed || 0,
      skipped: false,
      reasonStart: '',
      reasonEnd: '',
      shuffle: false,
      platform: '',
      offline: false,
      incognitoMode: false,
    });
  }

  // Write all events in a single transaction, waiting for it to complete
  const imported = await new Promise((resolve, reject) => {
    const tx = db.transaction('listeningEvents', 'readwrite');
    const store = tx.objectStore('listeningEvents');
    let count = 0;
    for (const event of events) {
      const req = store.put(event);
      req.onsuccess = () => count++;
    }
    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });

  console.log(`[Spotify Brainer] GDPR import complete: ${imported} events from ${filename}`);

  // Track imported filenames
  if (!historyMetrics) historyMetrics = {};
  if (!historyMetrics.importedFiles) historyMetrics.importedFiles = [];
  if (!historyMetrics.importedFiles.includes(filename)) {
    historyMetrics.importedFiles.push(filename);
  }

  // Trigger metrics recomputation and cache
  await computeHistoryMetrics();
  await saveToCache();
  return imported;
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

/**
 * Fetch raw listening events from IndexedDB filtered to an optional date range.
 * @param {string} [from] - ISO date string YYYY-MM-DD (start, inclusive)
 * @param {string} [to]   - ISO date string YYYY-MM-DD (end, inclusive)
 */
async function getEventsInRange(from, to) {
  const db = await openHistoryDB();
  const allEvents = await new Promise((resolve, reject) => {
    const tx = db.transaction('listeningEvents', 'readonly');
    const req = tx.objectStore('listeningEvents').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const fromMs = from ? new Date(from).getTime() : 0;
  const toMs = to ? new Date(to + 'T23:59:59.999').getTime() : Infinity;
  return allEvents.filter((e) => e.timestamp >= fromMs && e.timestamp <= toMs);
}

/**
 * Compute a lightweight taste snapshot for a filtered set of events.
 * Used when the LLM queries history tools with a date range.
 */
function computePeriodStats(events) {
  if (!events.length) return { error: 'No listening history found for this period.' };

  const STREAM_THRESHOLD_MS = 30000;
  const meaningful = events.filter((e) => (e.msPlayed || 0) >= STREAM_THRESHOLD_MS);
  if (!meaningful.length) return { error: 'No complete plays found for this period.' };

  events.sort((a, b) => a.timestamp - b.timestamp);

  // Top artists
  const artistPlays = {};
  const artistMs = {};
  for (const e of meaningful) {
    if (!e.artistName) continue;
    artistPlays[e.artistName] = (artistPlays[e.artistName] || 0) + 1;
    artistMs[e.artistName] = (artistMs[e.artistName] || 0) + (e.msPlayed || 0);
  }
  const topArtists = Object.entries(artistPlays)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, plays]) => ({ name, plays, hoursListened: Math.round((artistMs[name] || 0) / 3600000 * 10) / 10 }));

  // Top tracks — URI preserved for potential future use
  const trackData = {};
  for (const e of meaningful) {
    const key = e.trackName && e.artistName ? `${e.trackName} — ${e.artistName}` : null;
    if (!key) continue;
    if (!trackData[key]) trackData[key] = { plays: 0, uri: e.trackUri || null };
    trackData[key].plays++;
    if (!trackData[key].uri && e.trackUri) trackData[key].uri = e.trackUri;
  }
  const topTracks = Object.entries(trackData)
    .sort((a, b) => b[1].plays - a[1].plays)
    .slice(0, 10)
    .map(([name, d]) => ({ name, plays: d.plays, uri: d.uri }));

  // Temporal
  const hourCounts = new Array(24).fill(0);
  let nightOwlCount = 0;
  for (const e of meaningful) {
    const hour = new Date(e.timestamp).getHours();
    hourCounts[hour]++;
    if (hour >= 0 && hour < 5) nightOwlCount++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const nightOwlPct = Math.round(nightOwlCount / meaningful.length * 100);

  // Repeat ratio
  let repeatCount = 0;
  const lastSeen = {};
  for (const e of events) {
    const key = e.trackUri || (e.trackName && e.artistName ? `${e.trackName}|||${e.artistName}` : null);
    if (!key) continue;
    if (lastSeen[key] && (e.timestamp - lastSeen[key]) < 86400000) repeatCount++;
    lastSeen[key] = e.timestamp;
  }

  return {
    period: {
      from: new Date(events[0].timestamp).toISOString().slice(0, 10),
      to: new Date(events[events.length - 1].timestamp).toISOString().slice(0, 10),
    },
    totalPlays: meaningful.length,
    totalHours: Math.round(meaningful.reduce((s, e) => s + (e.msPlayed || 0), 0) / 3600000 * 10) / 10,
    uniqueArtists: Object.keys(artistPlays).length,
    uniqueTracks: Object.keys(trackData).length,
    topArtists,
    topTracks,
    peakHour,
    nightOwlPct,
    repeatRatio: Math.round(repeatCount / events.length * 100),
  };
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
    const STREAM_THRESHOLD_MS = 30000; // 30s = Spotify's official stream threshold
    const TYPICAL_SONG_MS = 210000; // 3.5 min average song length
    const SESSION_GAP_MS = 30 * 60000; // 30 min gap = new session

    // Helper: track key for deduplication
    const trackKey = (e) => e.trackUri || (e.trackName && e.artistName ? `${e.trackName}|||${e.artistName}` : '');

    // --- Pre-compute common aggregates ---
    const meaningfulPlays = allEvents.filter((e) => (e.msPlayed || 0) >= STREAM_THRESHOLD_MS);
    const totalMs = allEvents.reduce((sum, e) => sum + (e.msPlayed || 0), 0);
    const uniqueTracks = new Set(allEvents.map(trackKey).filter(Boolean));
    const uniqueArtists = new Set(allEvents.map((e) => e.artistName).filter(Boolean));
    const firstEvent = allEvents[0];
    const lastEvent = allEvents[allEvents.length - 1];
    const totalYears = ((lastEvent.timestamp - firstEvent.timestamp) / (365.25 * 24 * 3600000)).toFixed(1);

    // Artist play counts (meaningful plays only)
    const artistPlays = {};
    const artistMs = {};
    for (const e of meaningfulPlays) {
      if (e.artistName) {
        artistPlays[e.artistName] = (artistPlays[e.artistName] || 0) + 1;
        artistMs[e.artistName] = (artistMs[e.artistName] || 0) + (e.msPlayed || 0);
      }
    }
    const sortedArtists = Object.entries(artistPlays).sort((a, b) => b[1] - a[1]);
    const topArtist = sortedArtists[0];

    // Track play counts (meaningful plays only)
    const trackPlays = {};
    for (const e of meaningfulPlays) {
      const key = `${e.trackName} — ${e.artistName}`;
      if (e.trackName) trackPlays[key] = (trackPlays[key] || 0) + 1;
    }
    const topTrack = Object.entries(trackPlays).sort((a, b) => b[1] - a[1])[0];

    // By-date grouping
    const byDate = {};
    const byMonth = {};
    const byYear = {};
    for (const e of allEvents) {
      const d = new Date(e.timestamp);
      const dateStr = d.toISOString().slice(0, 10);
      const monthStr = d.toISOString().slice(0, 7);
      const year = d.getFullYear();
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push(e);
      if (!byMonth[monthStr]) byMonth[monthStr] = [];
      byMonth[monthStr].push(e);
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(e);
    }

    // Hour/day matrices
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);
    const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let nightOwlCount = 0;
    for (const e of allEvents) {
      if ((e.msPlayed || 0) < STREAM_THRESHOLD_MS) continue; // only count meaningful plays
      const d = new Date(e.timestamp);
      const hour = d.getHours();
      const day = d.getDay();
      hourCounts[hour]++;
      dayCounts[day]++;
      heatmap[day][hour]++;
      if (hour >= 0 && hour < 5) nightOwlCount++;
    }

    // ============================
    // 1. LIFETIME STATS
    // ============================
    metrics.lifetimeStats = {
      totalMs,
      totalEvents: allEvents.length,
      totalPlays: meaningfulPlays.length,
      uniqueTracks: uniqueTracks.size,
      uniqueArtists: uniqueArtists.size,
      totalYears,
      topArtistAllTime: topArtist ? { name: topArtist[0], plays: topArtist[1] } : null,
      topTrackAllTime: topTrack ? { name: topTrack[0], plays: topTrack[1] } : null,
    };

    // ============================
    // 2. LISTENING ENGAGEMENT
    // ============================
    const avgMsPlayed = totalMs / allEvents.length;
    const completionRate = Math.min(1, avgMsPlayed / TYPICAL_SONG_MS);
    const microPlays = allEvents.filter((e) => (e.msPlayed || 0) < 10000).length;
    const deepListens = allEvents.filter((e) => (e.msPlayed || 0) > 300000).length;

    metrics.listeningEngagement = {
      avgMsPlayed: Math.round(avgMsPlayed),
      completionRate: Math.round(completionRate * 100),
      microPlays,
      microPlaysPct: Math.round(microPlays / allEvents.length * 100),
      deepListens,
      deepListensPct: Math.round(deepListens / allEvents.length * 100),
    };

    // ============================
    // 3. ARTIST RELATIONSHIPS
    // ============================

    // Loyalty: % of listening time to top 10 artists
    const top10Ms = sortedArtists.slice(0, 10).reduce((sum, [name]) => sum + (artistMs[name] || 0), 0);
    const loyaltyScore = Math.round(top10Ms / totalMs * 100);

    // Gini coefficient of artist plays
    const artistPlayValues = Object.values(artistPlays).sort((a, b) => a - b);
    let giniNum = 0;
    const n = artistPlayValues.length;
    for (let i = 0; i < n; i++) {
      giniNum += (2 * (i + 1) - n - 1) * artistPlayValues[i];
    }
    const giniCoeff = n > 0 ? (giniNum / (n * artistPlayValues.reduce((s, v) => s + v, 0))).toFixed(3) : 0;

    // One-listen artists
    const oneListenArtists = sortedArtists.filter(([, c]) => c === 1).length;

    // Artist lifecycles (top 20 artists)
    const artistLifecycles = [];
    for (const [artist] of sortedArtists.slice(0, 20)) {
      const artistEvents = allEvents.filter((e) => e.artistName === artist);
      const monthlyPlays = {};
      for (const e of artistEvents) {
        const m = new Date(e.timestamp).toISOString().slice(0, 7);
        monthlyPlays[m] = (monthlyPlays[m] || 0) + 1;
      }
      const peakMonth = Object.entries(monthlyPlays).sort((a, b) => b[1] - a[1])[0];
      artistLifecycles.push({
        name: artist,
        totalPlays: artistPlays[artist],
        firstPlay: new Date(artistEvents[0].timestamp).toISOString().slice(0, 10),
        lastPlay: new Date(artistEvents[artistEvents.length - 1].timestamp).toISOString().slice(0, 10),
        peakMonth: peakMonth ? peakMonth[0] : null,
        peakMonthPlays: peakMonth ? peakMonth[1] : 0,
      });
    }

    // Monthly new artist discovery rate
    const seenArtists = new Set();
    const monthlyNewArtists = {};
    for (const e of allEvents) {
      if (!e.artistName) continue;
      const m = new Date(e.timestamp).toISOString().slice(0, 7);
      if (!seenArtists.has(e.artistName)) {
        seenArtists.add(e.artistName);
        monthlyNewArtists[m] = (monthlyNewArtists[m] || 0) + 1;
      }
    }

    metrics.artistRelationships = {
      loyaltyScore,
      giniCoefficient: parseFloat(giniCoeff),
      oneListenArtists,
      oneListenArtistsPct: Math.round(oneListenArtists / uniqueArtists.size * 100),
      artistLifecycles,
      monthlyNewArtists: Object.entries(monthlyNewArtists).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, count]) => ({ month, count })),
    };

    // ============================
    // 4. TEMPORAL BEHAVIOR
    // ============================

    // Sessions: gap > 30 min = new session
    const sessions = [];
    let sessionStart = allEvents[0].timestamp;
    let sessionMs = allEvents[0].msPlayed || 0;
    let sessionCount = 1;
    for (let i = 1; i < allEvents.length; i++) {
      const gap = allEvents[i].timestamp - allEvents[i - 1].timestamp;
      if (gap > SESSION_GAP_MS) {
        sessions.push({ start: sessionStart, durationMs: sessionMs, tracks: sessionCount });
        sessionStart = allEvents[i].timestamp;
        sessionMs = 0;
        sessionCount = 0;
      }
      sessionMs += allEvents[i].msPlayed || 0;
      sessionCount++;
    }
    sessions.push({ start: sessionStart, durationMs: sessionMs, tracks: sessionCount });

    const avgSessionMs = sessions.reduce((s, sess) => s + sess.durationMs, 0) / sessions.length;
    const longestSession = sessions.reduce((max, sess) => sess.durationMs > max.durationMs ? sess : max, sessions[0]);

    // Night owl score
    const nightOwlPct = Math.round(nightOwlCount / allEvents.length * 100);

    // Weekend vs weekday
    const weekdayEvents = allEvents.filter((e) => { const d = new Date(e.timestamp).getDay(); return d >= 1 && d <= 5; });
    const weekendEvents = allEvents.filter((e) => { const d = new Date(e.timestamp).getDay(); return d === 0 || d === 6; });
    const weekdayMs = weekdayEvents.reduce((s, e) => s + (e.msPlayed || 0), 0);
    const weekendMs = weekendEvents.reduce((s, e) => s + (e.msPlayed || 0), 0);
    const weekdayUniqueArtists = new Set(weekdayEvents.map((e) => e.artistName).filter(Boolean)).size;
    const weekendUniqueArtists = new Set(weekendEvents.map((e) => e.artistName).filter(Boolean)).size;

    // Monthly listening hours trend
    const monthlyHours = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, events]) => ({
        month,
        hours: Math.round(events.reduce((s, e) => s + (e.msPlayed || 0), 0) / 3600000 * 10) / 10,
        plays: events.filter((e) => (e.msPlayed || 0) >= STREAM_THRESHOLD_MS).length,
      }));

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDay = dayCounts.indexOf(Math.max(...dayCounts));

    metrics.temporalBehavior = {
      peakHour,
      peakDay: dayNames[peakDay],
      heatmap, // 7x24 matrix [day][hour]
      nightOwlPct,
      sessions: {
        total: sessions.length,
        avgDurationMin: Math.round(avgSessionMs / 60000),
        avgTracksPerSession: Math.round(allEvents.length / sessions.length),
        longestSession: {
          date: new Date(longestSession.start).toISOString().slice(0, 10),
          durationMin: Math.round(longestSession.durationMs / 60000),
          tracks: longestSession.tracks,
        },
        sessionsPerWeek: Math.round(sessions.length / (parseFloat(totalYears) * 52.18) * 10) / 10,
      },
      weekdayVsWeekend: {
        weekday: { avgHoursPerDay: Math.round(weekdayMs / 3600000 / Math.max(1, Object.keys(byDate).filter((d) => { const day = new Date(d).getDay(); return day >= 1 && day <= 5; }).length) * 10) / 10, uniqueArtists: weekdayUniqueArtists },
        weekend: { avgHoursPerDay: Math.round(weekendMs / 3600000 / Math.max(1, Object.keys(byDate).filter((d) => { const day = new Date(d).getDay(); return day === 0 || day === 6; }).length) * 10) / 10, uniqueArtists: weekendUniqueArtists },
      },
      monthlyHours,
    };

    // ============================
    // 5. REPLAY & OBSESSION
    // ============================

    // Repeat ratio: same track played again within 24hrs
    let repeatCount = 0;
    const recentTrackTimestamps = {};
    for (const e of allEvents) {
      const key = trackKey(e);
      if (!key) continue;
      if (recentTrackTimestamps[key] && (e.timestamp - recentTrackTimestamps[key]) < 24 * 3600000) {
        repeatCount++;
      }
      recentTrackTimestamps[key] = e.timestamp;
    }
    const repeatRatio = Math.round(repeatCount / allEvents.length * 100);

    // Binge episodes: 5+ consecutive plays of same artist
    const bingeEpisodes = [];
    let bingeArtist = null;
    let bingeStart = 0;
    let bingeCount = 0;
    for (let i = 0; i < allEvents.length; i++) {
      if (allEvents[i].artistName === bingeArtist) {
        bingeCount++;
      } else {
        if (bingeCount >= 5) {
          bingeEpisodes.push({
            artist: bingeArtist,
            tracks: bingeCount,
            date: new Date(allEvents[bingeStart].timestamp).toISOString().slice(0, 10),
          });
        }
        bingeArtist = allEvents[i].artistName;
        bingeStart = i;
        bingeCount = 1;
      }
    }
    if (bingeCount >= 5) {
      bingeEpisodes.push({ artist: bingeArtist, tracks: bingeCount, date: new Date(allEvents[bingeStart].timestamp).toISOString().slice(0, 10) });
    }

    // One-and-done tracks vs repeat favorites
    const trackPlayCounts = {};
    for (const e of meaningfulPlays) {
      const key = trackKey(e);
      if (key) trackPlayCounts[key] = (trackPlayCounts[key] || 0) + 1;
    }
    const oneAndDoneTracks = Object.values(trackPlayCounts).filter((c) => c === 1).length;
    const repeatFavorites = Object.values(trackPlayCounts).filter((c) => c >= 5).length;

    metrics.replayObsession = {
      repeatRatio,
      bingeEpisodes: bingeEpisodes.sort((a, b) => b.tracks - a.tracks).slice(0, 20),
      totalBingeEpisodes: bingeEpisodes.length,
      oneAndDoneTracks,
      oneAndDonePct: Math.round(oneAndDoneTracks / Math.max(1, Object.keys(trackPlayCounts).length) * 100),
      repeatFavorites,
      repeatFavoritesPct: Math.round(repeatFavorites / Math.max(1, Object.keys(trackPlayCounts).length) * 100),
    };

    // ============================
    // 6. STREAKS & RECORDS
    // ============================

    // Daily streak: consecutive days with at least 1 play
    const sortedDates = Object.keys(byDate).sort();
    let maxStreak = 1;
    let currentStreak = 1;
    let streakEndDate = sortedDates[0];
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = (curr - prev) / (24 * 3600000);
      if (diffDays === 1) {
        currentStreak++;
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          streakEndDate = sortedDates[i];
        }
      } else {
        currentStreak = 1;
      }
    }

    // Most plays in a single day
    const dayPlayCounts = Object.entries(byDate).map(([date, events]) => ({
      date,
      plays: events.filter((e) => (e.msPlayed || 0) >= STREAM_THRESHOLD_MS).length,
      totalEvents: events.length,
      hoursListened: Math.round(events.reduce((s, e) => s + (e.msPlayed || 0), 0) / 3600000 * 10) / 10,
    }));
    const mostPlaysDay = dayPlayCounts.sort((a, b) => b.plays - a.plays)[0];

    // Most diverse day (most unique artists)
    const dayDiversity = Object.entries(byDate).map(([date, events]) => ({
      date,
      uniqueArtists: new Set(events.map((e) => e.artistName).filter(Boolean)).size,
    }));
    const mostDiverseDay = dayDiversity.sort((a, b) => b.uniqueArtists - a.uniqueArtists)[0];

    // Longest gap between plays
    let maxGap = 0;
    let gapStart = 0;
    let gapEnd = 0;
    for (let i = 1; i < allEvents.length; i++) {
      const gap = allEvents[i].timestamp - allEvents[i - 1].timestamp;
      if (gap > maxGap) {
        maxGap = gap;
        gapStart = allEvents[i - 1].timestamp;
        gapEnd = allEvents[i].timestamp;
      }
    }

    metrics.streaksRecords = {
      longestDailyStreak: { days: maxStreak, endDate: streakEndDate },
      totalActiveDays: sortedDates.length,
      mostPlaysInDay: mostPlaysDay,
      mostDiverseDay,
      longestGap: {
        days: Math.round(maxGap / (24 * 3600000) * 10) / 10,
        from: new Date(gapStart).toISOString().slice(0, 10),
        to: new Date(gapEnd).toISOString().slice(0, 10),
      },
    };

    // ============================
    // 7. TASTE PROFILE
    // ============================

    // Monthly top artist timeline
    const monthlyTopArtist = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, events]) => {
        const ma = {};
        for (const e of events) {
          if (e.artistName && (e.msPlayed || 0) >= STREAM_THRESHOLD_MS) {
            ma[e.artistName] = (ma[e.artistName] || 0) + 1;
          }
        }
        const top = Object.entries(ma).sort((a, b) => b[1] - a[1])[0];
        return { month, artist: top ? top[0] : 'N/A', plays: top ? top[1] : 0 };
      });

    // Artist concentration curve
    const totalMeaningfulPlays = meaningfulPlays.length;
    const top1PctCount = Math.max(1, Math.ceil(sortedArtists.length * 0.01));
    const top10PctCount = Math.max(1, Math.ceil(sortedArtists.length * 0.10));
    const top1PctPlays = sortedArtists.slice(0, top1PctCount).reduce((s, [, c]) => s + c, 0);
    const top10PctPlays = sortedArtists.slice(0, top10PctCount).reduce((s, [, c]) => s + c, 0);

    // Variety score per month (unique artists / total plays)
    const monthlyVariety = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, events]) => {
        const plays = events.filter((e) => (e.msPlayed || 0) >= STREAM_THRESHOLD_MS).length;
        const artists = new Set(events.map((e) => e.artistName).filter(Boolean)).size;
        return { month, varietyScore: plays > 0 ? Math.round(artists / plays * 100) / 100 : 0, uniqueArtists: artists, plays };
      });

    // Taste evolution by year (updated to use meaningful plays)
    const tasteEvolution = Object.entries(byYear)
      .sort((a, b) => a[0] - b[0])
      .map(([year, events]) => {
        const yearArtists = {};
        for (const e of events) {
          if (e.artistName && (e.msPlayed || 0) >= STREAM_THRESHOLD_MS) {
            yearArtists[e.artistName] = (yearArtists[e.artistName] || 0) + 1;
          }
        }
        const topYearArtists = Object.entries(yearArtists).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const yearPlays = events.filter((e) => (e.msPlayed || 0) >= STREAM_THRESHOLD_MS).length;
        const yearHrs = Math.round(events.reduce((s, e) => s + (e.msPlayed || 0), 0) / 3600000);
        return {
          period: year,
          topArtists: topYearArtists.map(([name, plays]) => ({ name, plays })),
          plays: yearPlays,
          hours: yearHrs,
          description: `Top artists: ${topYearArtists.map((a) => a[0]).join(', ')} | ${yearPlays} plays | ${yearHrs} hrs`,
        };
      });

    metrics.tasteProfile = {
      monthlyTopArtist,
      concentration: {
        top1PctArtists: top1PctCount,
        top1PctSharePct: Math.round(top1PctPlays / totalMeaningfulPlays * 100),
        top10PctArtists: top10PctCount,
        top10PctSharePct: Math.round(top10PctPlays / totalMeaningfulPlays * 100),
      },
      monthlyVariety,
    };

    metrics.tasteEvolution = tasteEvolution;

    // ============================
    // LEGACY: Recent trends & behavioral patterns (kept for backward compat)
    // ============================
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
      if (prevMonthEvents.length) {
        const prevMs = prevMonthEvents.reduce((s, e) => s + (e.msPlayed || 0), 0);
        const change = ((recentMs - prevMs) / prevMs * 100).toFixed(0);
        metrics.recentTrends.push(`Volume change: ${change > 0 ? '+' : ''}${change}% vs last month`);
      }
    }

    metrics.behavioralPatterns = [];
    const platformCounts = {};
    let shuffleCount = 0;
    for (const e of allEvents) {
      if (e.platform) platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
      if (e.shuffle) shuffleCount++;
    }
    const topPlatforms = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topPlatforms.length) {
      metrics.behavioralPatterns.push(`Platforms: ${topPlatforms.map(([p, c]) => `${p} (${Math.round(c / allEvents.length * 100)}%)`).join(', ')}`);
    }
    metrics.behavioralPatterns.push(`Peak listening hour: ${peakHour}:00`);
    metrics.behavioralPatterns.push(`Most active day: ${dayNames[peakDay]}`);

    // Preserve importedFiles list across recomputation
    metrics.importedFiles = historyMetrics?.importedFiles || [];
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
    console.error('[Spotify Brainer] Failed to compute history metrics:', e);
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
