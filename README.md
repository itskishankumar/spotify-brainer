# Spotify Brainer

AI powered brain for Spotify.

A Chrome extension that adds an intelligent AI sidebar to Spotify's web player. It connects to your Spotify account via OAuth, extracts your full listening data (including every track in every playlist), computes a taste profile, and makes it all available to an LLM via on-demand tool calls — so it genuinely understands your music identity and can control your playback. It can also generate original music clips, album art, and music videos tailored to your taste.

## Features

- **Collapsible AI chat panel** on the right side of Spotify's web player
- **Multi-provider LLM support** — Claude, OpenAI, Gemini (adapter-based, easy to extend)
- **Full Spotify data extraction** — playlists with full track listings, saved library, top tracks/artists, recently played
- **Playback control via LLM** — the AI can play/pause, skip, search, queue songs, create playlists, save tracks, and more using tool use
- **Track credits lookup** — scrapes Spotify's credits dialog for any track (writers, producers, performers, engineers, label) via SPA navigation — no API needed
- **Clickable song links** — every song the LLM mentions is a playable link
- **Last.fm tag enrichment** — fetches crowd-sourced genre/mood/style tags (e.g. "shoegaze", "dream-pop", "lo-fi", "melancholic") from Last.fm for artists and tracks, dramatically improving music generation prompts; two-tier cache (in-memory + persistent) with 7-day TTL; circuit breaker stops hammering the API after non-transient failures (bad key, network error) and auto-resets after 60 seconds
- **Taste intelligence layer** — decade split, discovery score, personality tags, playlist profiles
- **Streaming history import** — import your Spotify listening history (both basic Account Data and Extended GDPR formats) with clear/re-import support
- **Rich history metrics** — lifetime stats, listening engagement, artist relationships, temporal heatmap, replay obsession, taste evolution, and more computed from your GDPR export
- **God Mode tab** — raw data viewer showing every data source in the app with source badges (API / computed)
- **Dynamic LLM data fetching** — the AI fetches your data on demand via tools rather than loading everything into context upfront; only the currently playing track is always available
- **AI music generation** — generates original 30-second clips tailored to your taste using Lyria (Google AI); describe a vibe, reference a time period ("something like I listened to in summer 2023"), or reference a playlist ("generate something like my G playlist") and the LLM gathers your data, fetches Last.fm tags for the relevant tracks, and produces a detailed Lyria prompt; save and replay clips with a built-in audio player
- **Realtime mode** — continuous AI music generation using Lyria RealTime API via WebSocket; a familiarity slider (0–100) lets you steer the output in real time: 0 = Anti-Taste (blind-spot genres), 50 = Your Current Taste, 100 = Future Me; all parameters (prompts, BPM, density, brightness) interpolate smoothly across the spectrum; runs in a Chrome offscreen document for Web Audio API access; genre-appropriate parameters per anchor point derived from a ~40-genre lookup table; record/pause/stop with MP3 export via lamejs encoding
- **Anti-Taste mode** — generates music from your blind spots; the system deterministically picks one random genre from a pool of ~200 subgenres across 9 categories (global, electronic, heavy, experimental, jazz, classical, retro, urban, folk), filtered against the user's listening history, so the LLM has no say in genre selection — ensuring true variety across runs; all necessary taste data (profile, top artists, Last.fm tags) is pre-fetched deterministically rather than relying on the LLM to pick tools; adds one familiar anchor element to keep the dare palatable
- **Future Me mode** — predicts where your taste is heading in 3-6 months and generates a track from that predicted future; uses the unified taste drift vector (Spotify API drift + GDPR historical drift merged into top-level emerging/fading) to extrapolate rising genres, emerging artists, and shifting preferences forward; a code-side randomizer picks a different extrapolation angle each run (rising genre focus, decade revival, production evolution, mood trajectory, etc.) to prevent repetitive outputs; velocity-aware boldness (high velocity = bold extrapolation, low = conservative); all taste data pre-fetched deterministically
- **Taste drift analysis** — computes a unified taste drift vector from two data sources merged into top-level emerging/fading lists: (1) Spotify API drift comparing long-term vs short-term top artists/tracks for genre shifts, decade shifts, popularity drift, and velocity; (2) GDPR historical drift comparing actual play counts across 12-month, 3-month, and 1-month windows for rising/fading artists with momentum indicators, new discoveries, artist concentration changes, and monthly volume trends; source-tagged (`api`/`history`) so the LLM knows provenance
- **Generation insights** — Anti-Taste and Future Me modes display the LLM's reasoning explaining what metrics drove the generation
- **Album art generation** — automatically generates album cover art for each music clip using Nano Banana (Google Imagen); art generates asynchronously (non-blocking) and arrives after audio with a diffusion-style blur-to-sharp reveal animation; displays in the player and as thumbnails in the saved tracks library
- **Video generation** — on-demand music video generation using Veo (Google AI); generates abstract cinematic visuals from the Lyria prompt; async generation with polling (handles multi-minute Veo processing); inline video player with native controls
- **MP3 export** — export any generated clip as an MP3 file with embedded ID3v2 tags (title, artist, cover art); playable in any music player with metadata intact
- **Song management** — rename saved songs inline (click the pencil icon); click anywhere on a library item to load it; unlimited saved songs with scrollable library
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

### 5. Configure Last.fm (optional, improves music generation)

1. Go to [last.fm/api/account/create](https://www.last.fm/api/account/create) and create a free API key (callback URL doesn't matter — use anything)
2. In Settings → Music Enrichment (Last.fm), paste your API key
3. Click **Test Connection** to verify

When configured, the music generation pipeline fetches crowd-sourced tags from Last.fm for artists and tracks, giving the LLM detailed sonic metadata (subgenres, moods, production styles) instead of relying solely on artist/track names.

### 6. Generate music (optional)

1. In Settings → Music Generation, select a provider and model
2. Enter your API key (for Lyria, get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
3. Click the sparkle icon in the header to open the Generate tab
4. Describe what you're in the mood for:
   - Vague mood: "something chill", "upbeat and energetic"
   - Time period: "a song I would've liked in Sept 2024"
   - Playlist-based: "generate something like my G playlist"
   - Or leave blank to use your overall taste profile
5. The LLM gathers the relevant data (playlists, history, top tracks), fetches Last.fm tags for sonic context, and produces a detailed Lyria prompt
6. Save tracks you like — they're stored locally and accessible from the library
7. Use **Anti-Taste** to generate from your blind spots — genres and styles you never listen to
8. Use **Future Me** to generate a track from your predicted future taste based on drift analysis
9. **Export** any clip as an MP3 with embedded cover art and title metadata
10. Switch to **Realtime** mode to stream continuous AI-generated music with a familiarity slider — drag left toward Anti-Taste, center for your current taste, or right toward Future Me

### 7. Album art generation (optional)

1. In Settings → Album Art Generation, select Nano Banana (Google AI) and a model
2. Enter your API key (same Google AI key works)
3. When configured, album art is **automatically generated** alongside every music clip
4. Art displays at the top of the player and as thumbnails in the saved tracks library

### 8. Video generation (optional)

1. In Settings → Video Generation, select Veo (Google AI) and a model (Veo 3.1, Veo 3, or Veo 2)
2. Enter your API key (same Google AI key works)
3. After generating a music clip, click **Generate Video** in the player
4. Video generation is async — it takes a few minutes (status shown in the UI)
5. The video appears inline in the player with native playback controls

## Architecture

```
spotify-brainer/
├── manifest.json              # Chrome Extension manifest v3
├── content/
│   ├── inject.js              # Injects sidebar into Spotify DOM
│   ├── inject.css             # Sidebar + layout styles
│   └── spotify-scraper.js     # DOM scraping (now playing, current view, track credits)
├── background/
│   └── service-worker.js      # API proxy, data pipeline, prompt builder, music/image/video gen
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
│   ├── prompt-builder.js      # Music agent system prompt (normal/anti-taste/future-taste), Lyria JSON assembly, genre fallback, anti-taste genre pool with code-side randomizer
│   ├── realtime-anchors.js    # Realtime mode: taste anchor computation (anti/current/future), parameter interpolation, genre-appropriate BPM/density/brightness lookup
│   ├── types.js               # Unified MusicGenRequest/MusicGenResponse
│   ├── adapter.js             # Base adapter interface
│   └── adapters/
│       └── lyria.js           # Lyria (Google AI) adapter
├── offscreen/
│   ├── offscreen.html         # Minimal shell for Chrome offscreen document
│   ├── offscreen.js           # Lyria RealTime WebSocket + Web Audio API PCM playback + recording
│   └── lame.min.js            # lamejs MP3 encoder (vendored) for realtime recording export
├── image-gen/
│   ├── adapter.js             # Base ImageGenAdapter interface
│   └── adapters/
│       └── imagen.js          # Nano Banana (Google Imagen) adapter
├── video-gen/
│   ├── adapter.js             # Base VideoGenAdapter interface
│   └── adapters/
│       └── veo.js             # Veo (Google AI) adapter — predictLongRunning with polling
├── lib/
│   ├── spotify-auth.js        # OAuth PKCE authentication
│   ├── spotify-controls.js    # Playback, search, playlist, library controls
│   ├── spotify-intelligence.js # ETL: raw data → taste profile + metrics + taste drift vector (API + GDPR historical)
│   ├── spotify-history.js     # Historical data + trend computation
│   ├── lastfm.js              # Last.fm API client — tag fetching, batch enrichment, two-tier cache, circuit breaker
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

Music Generation Pipeline:

Clip Mode (Normal):
  buildMusicAgentSystemPrompt()  ──→  Two-phase LLM agentic loop
                                        Phase 1: LLM selects tools
                                        Phase 2: Execute → compact → final Lyria prompt

Clip Mode (Anti-Taste / Future Me):
  Deterministic data fetch  ──→  Single LLM call
    get_taste_profile               (all data pre-loaded,
    get_top_artists (short+long)     no tool selection needed)
    get_lastfm_tags                       │
    + get_taste_drift (future only)       ▼
    + get_history_taste (future only)  assembleLyriaPrompt()
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                              MusicGenAdapter  ImageGenAdapter  VideoGenAdapter
                                Lyria           Nano Banana       Veo
                             (audio clip)     (album art, auto)  (video, on-demand)
                                    │
                                    ▼
                              Export MP3 (ID3v2 tags: title, artist, cover art)

Realtime Mode:
  computeAnchors()  ──→  3 taste anchors (anti / current / future)
        │                   with genre-appropriate BPM/density/brightness
        ▼
  interpolateAtPosition(slider 0–100)
        │
        ▼
  Offscreen Document  ──→  Lyria RealTime WebSocket (wss://)
        │                    weighted prompt blending
        ▼                    PCM audio via Web Audio API
  Service Worker relay  ←──→  Content Script UI (slider, transport, visualizer)
```

## Adding Providers

### Music Generation

1. Create `music-gen/adapters/yourprovider.js` extending `MusicGenAdapter`
2. Implement `validate(apiKey)` and `generate(request, apiKey)`
3. Add it to `MUSIC_GEN_ADAPTERS` in `background/service-worker.js`
4. Add an `<option>` and config entry to the Music Generation settings in `content/inject.js`

### Album Art Generation

1. Create `image-gen/adapters/yourprovider.js` extending `ImageGenAdapter`
2. Implement `validate(apiKey)` and `generate(request, apiKey)` — must return `{ image, mimeType, model }`
3. Add it to `IMAGE_GEN_ADAPTERS` in `background/service-worker.js`
4. Add an `<option>` and config entry to the Album Art Generation settings in `content/inject.js`

### Video Generation

1. Create `video-gen/adapters/yourprovider.js` extending `VideoGenAdapter`
2. Implement `validate(apiKey)` and `generate(request, apiKey)` — must return `{ video, mimeType, model }`
3. Add it to `VIDEO_GEN_ADAPTERS` in `background/service-worker.js`
4. Add an `<option>` and config entry to the Video Generation settings in `content/inject.js`

## Spotify API Notes

Apps created after November 2024 have restricted API access:
- `/audio-features` — deprecated, returns 403
- `/artists?ids=` (batch) — restricted, returns 403
- `/playlists/{id}/tracks` — deprecated, use `/playlists/{id}/items`
- Artist `genres` field — returns empty arrays
- Search `limit` max reduced from 50 to 10

The extension works around these by skipping unavailable endpoints, using the newer API variants, and supplementing missing genre/audio data with Last.fm crowd-sourced tags.

## License

MIT
