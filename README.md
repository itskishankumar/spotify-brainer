# Spotify Brainer

AI powered brain for Spotify.

A Chrome extension that adds an intelligent AI sidebar to Spotify's web player. It connects to your Spotify account via OAuth, extracts your full listening data, computes a rich taste profile, and feeds everything into an LLM so it genuinely understands your music identity.

## Features

- **Collapsible AI chat panel** on the right side of Spotify's web player
- **Multi-provider LLM support** — Claude, OpenAI, Gemini (adapter-based, easy to extend)
- **Full Spotify data extraction** — playlists, saved library, top tracks/artists, recently played, queue, playback state
- **Taste intelligence layer** — genre distribution, mood profile (from audio features or genre-derived), decade split, discovery score, personality tags
- **GDPR history import** — import your complete Spotify listening history for deep trend analysis
- **Smart context compaction** — tiered system that preserves the most relevant data as conversations grow
- **Streaming responses** with markdown rendering (marked.js)
- **Conversation history** — multiple chats, persistent across sessions
- **Dark theme** using Spotify's own font (SpotifyMixUI/Circular) and design language
- **Data caching** — persists across browser restarts, no re-fetch needed on page load

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

Click the **Refresh** button to fetch your Spotify data. The progress indicator shows each step.

For deeper history analysis, import your GDPR Extended Streaming History (request it from Spotify Account > Privacy > Download your data).

## Architecture

```
spotify-brainer/
├── manifest.json              # Chrome Extension manifest v3
├── content/
│   ├── inject.js              # Injects sidebar into Spotify DOM
│   ├── inject.css             # Sidebar + layout styles
│   └── spotify-scraper.js     # DOM scraping (now playing, current view)
├── background/
│   └── service-worker.js      # API proxy, data pipeline, context builder
├── llm/
│   ├── types.js               # Unified LLMRequest/LLMResponse/LLMChunk
│   ├── adapter.js             # Base adapter interface
│   ├── adapters/
│   │   ├── anthropic.js       # Claude adapter
│   │   ├── openai.js          # OpenAI adapter
│   │   └── gemini.js          # Gemini adapter
│   └── registry.js            # Provider registry
├── lib/
│   ├── spotify-auth.js        # OAuth PKCE authentication
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
                    Artist enrichment (/v1/artists) for genres
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
                    buildSystemPrompt()
                              │
                              ▼
                    LLM Adapter → Claude / OpenAI / Gemini
```

## License

MIT
