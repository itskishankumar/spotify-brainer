# Spotify Brainer

AI powered brain for Spotify.

A Chrome extension that adds an intelligent AI sidebar to Spotify's web player. It connects to your Spotify account via OAuth, extracts your full listening data (including every track in every playlist), computes a taste profile, and makes it all available to an LLM via on-demand tool calls — so it genuinely understands your music identity and can control your playback. It can also generate original music clips tailored to your taste.

## Features

- **Collapsible AI chat panel** on the right side of Spotify's web player
- **Multi-provider LLM support** — Claude, OpenAI, Gemini (adapter-based, easy to extend)
- **Full Spotify data extraction** — playlists with full track listings, saved library, top tracks/artists, recently played
- **Playback control via LLM** — the AI can play/pause, skip, search, queue songs, create playlists, save tracks, and more using tool use
- **Track credits lookup** — scrapes Spotify's credits dialog for any track (writers, producers, performers, engineers, label) via SPA navigation — no API needed
- **Clickable song links** — every song the LLM mentions is a playable link
- **Taste intelligence layer** — decade split, discovery score, personality tags, playlist profiles
- **Streaming history import** — import your Spotify listening history (both basic Account Data and Extended GDPR formats) with clear/re-import support
- **Rich history metrics** — lifetime stats, listening engagement, artist relationships, temporal heatmap, replay obsession, taste evolution, and more computed from your GDPR export
- **God Mode tab** — raw data viewer showing every data source in the app with source badges (API / computed)
- **Dynamic LLM data fetching** — the AI fetches your data on demand via tools rather than loading everything into context upfront; only the currently playing track is always available
- **AI music generation** — generates original 30-second clips tailored to your taste profile using Lyria (Google AI); save and replay clips with a built-in audio player
- **Streaming responses** with markdown rendering
- **Conversation history** — multiple chats, persistent across sessions, exportable as markdown
- **Data caching** — persists across browser restarts via chrome.storage.local
- **Real-time now playing** — DOM scraper polls the player bar continuously
- **Dark theme** matching Spotify's design language

## Setup

### 1. Install the extension

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select this directory

### 2. Connect Spotify

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app — select "Web API"
3. In the app settings, add the redirect URI shown in the extension's Settings panel
4. Copy the **Client ID**
5. Open Spotify Web Player, click the brain icon, go to Settings
6. Paste your Client ID and click **Connect Spotify**
7. Authorize in the popup

### 3. Configure LLM

1. In Settings, select your LLM provider (Claude, OpenAI, or Gemini)
2. Enter your API key
3. Click **Test Connection** to verify

### 4. Load your data

Click the **Refresh** button to fetch your Spotify data. The progress indicator shows each step:
- User profile
- Playlists & all their tracks
- Recently played
- Top artists (3 time ranges)
- Top tracks (3 time ranges)
- Saved tracks (full library)
- Saved albums
- Taste profile computation
- Historical metrics (if GDPR data imported)

For history analysis, import your streaming history JSON files from your Spotify GDPR data export (Account > Privacy > Download your data). Two formats are supported:
- **Standard streaming history** — `StreamingHistory_music_*.json` files with `endTime`, `trackName`, `artistName`, `msPlayed`
- **Extended streaming history** — files with full metadata including track URIs, skip/shuffle data, platform info (must be specifically requested, takes ~30 days)

Re-importing clears previous history. Use the **Clear History** button to wipe data manually.

### 5. Generate music (optional)

1. In Settings → Music Generation, select a provider and model
2. Enter your API key (for Lyria, get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
3. Click the sparkle icon (✦) in the header to open the Generate tab
4. Optionally describe what you want, then click **Generate**
5. Save clips you like — they're stored locally and accessible from the library

## Architecture

```
spotify-brainer/
├── manifest.json              # Chrome Extension manifest v3
├── content/
│   ├── inject.js              # Injects sidebar into Spotify DOM
│   ├── inject.css             # Sidebar + layout styles
│   └── spotify-scraper.js     # DOM scraping (now playing, current view, track credits)
├── background/
│   └── service-worker.js      # API proxy, data pipeline, prompt builder, music gen
├── llm/
│   ├── types.js               # Unified LLMRequest/LLMResponse/LLMChunk
│   ├── adapter.js             # Base adapter interface
│   ├── tools.js               # Tool definitions: Spotify control + data-fetching
│   ├── adapters/
│   │   ├── anthropic.js       # Claude adapter (with tool use)
│   │   ├── openai.js          # OpenAI adapter
│   │   └── gemini.js          # Gemini adapter
│   └── registry.js            # Provider registry
├── music-gen/
│   ├── types.js               # Unified MusicGenRequest/MusicGenResponse
│   ├── adapter.js             # Base adapter interface
│   └── adapters/
│       └── lyria.js           # Lyria (Google AI) adapter
├── lib/
│   ├── spotify-auth.js        # OAuth PKCE authentication
│   ├── spotify-controls.js    # Playback, search, playlist, library controls
│   ├── spotify-intelligence.js # ETL: raw data → taste profile + metrics
│   ├── spotify-history.js     # Historical data + trend computation
│   └── marked.min.js          # Markdown rendering (vendored)
├── popup/                     # Extension popup
└── icons/                     # Extension icons
```

## Data Pipeline

```
Spotify OAuth API  ──→  Raw Data (in-memory + chrome.storage.local cache)
                              │
DOM Scraper  ──────→──────────┤
                              │
GDPR Import  ──→  IndexedDB ──┤
                              ▼
                    SpotifyIntelligence (ETL)
                              │
                    computeHistoryMetrics
                              │
                              ▼
                    buildSystemPrompt()        ←── now playing only
                              │
                              ▼
                         LLM Adapter  ←────────────────────────────┐
                   Claude / OpenAI / Gemini                         │
                              │                                     │
                        tool_use loop                               │
                         ┌────┴────┐                                │
                         ▼         ▼                                │
              spotify-controls  data-fetch tools ──→ in-memory data─┘
           (play, search, etc.)  (profile, history,
                                  top tracks, etc.)

buildMusicPrompt() ──→  MusicGenAdapter  ──→  Generated audio (base64)
  (taste signals)      Lyria / ...            stored in chrome.storage.local
```

## Adding a Music Generation Provider

1. Create `music-gen/adapters/yourprovider.js` extending `MusicGenAdapter`
2. Implement `validate(apiKey)` and `generate(request, apiKey)`
3. Add it to `MUSIC_GEN_ADAPTERS` in `background/service-worker.js`
4. Add an `<option>` and config entry to the Music Generation settings in `content/inject.js`

## Spotify API Notes

Apps created after November 2024 have restricted API access:
- `/audio-features` — deprecated, returns 403
- `/artists?ids=` (batch) — restricted, returns 403
- `/playlists/{id}/tracks` — deprecated, use `/playlists/{id}/items`
- Artist `genres` field — returns empty arrays
- Search `limit` max reduced from 50 to 10

The extension works around these by skipping unavailable endpoints and using the newer API variants.

## License

MIT
