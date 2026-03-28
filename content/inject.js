// Spotify Brainer — Content script
// Injects the AI sidebar into Spotify's web player

(function () {
  if (document.getElementById('spotify-brainer-panel')) return;

  // Module-level refs for music gen messages (assigned inside generate tab scope)
  let _genSetStatus = null;
  let _genOnAlbumArt = null;

  // --- SVG Icons ---
  const ICONS = {
    brain: '<svg viewBox="0 0 24 24"><path d="M12 2C8.5 2 5.5 4.5 5 7.5c-1 .5-2 1.5-2 3 0 1 .5 2 1.5 2.5-.5 1-.5 2 0 3 .5 1 1.5 1.5 2.5 2 0 2 1.5 4 4 4h2c2.5 0 4-2 4-4 1-.5 2-1 2.5-2 .5-1 .5-2 0-3 1-.5 1.5-1.5 1.5-2.5 0-1.5-1-2.5-2-3C18.5 4.5 15.5 2 12 2z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    newChat: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.69-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.25-1.13.56-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94 0 .31.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.69 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.25 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    data: '<svg viewBox="0 0 24 24"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    export: '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    generate: '<svg viewBox="0 0 24 24"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a1 1 0 00-1.41 0L1.29 18.96a1 1 0 000 1.41l2.34 2.34a1 1 0 001.41 0L16.71 11.04a1 1 0 000-1.41z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
  };

  // --- Create toggle button ---
  const toggle = document.createElement('button');
  toggle.id = 'spotify-brainer-toggle';
  toggle.title = 'Toggle Spotify Brainer (Cmd+Shift+B)';
  toggle.innerHTML = ICONS.brain;
  document.body.appendChild(toggle);

  // --- Create sidebar panel ---
  const panel = document.createElement('div');
  panel.id = 'spotify-brainer-panel';
  panel.innerHTML = `
    <div id="spotify-brainer-resize"></div>
    <div class="sb-header">
      <div class="sb-header-title">
        <span class="sb-logo">${ICONS.brain}</span>
        Spotify Brainer
      </div>
      <div class="sb-header-actions">
        <button class="sb-header-btn" id="sb-btn-new" title="New Chat">${ICONS.newChat}</button>
        <button class="sb-header-btn" id="sb-btn-history" title="Chats">${ICONS.chat}</button>
        <button class="sb-header-btn" id="sb-btn-data" title="Data Viewer">${ICONS.data}</button>
        <button class="sb-header-btn" id="sb-btn-generate" title="Generate Music">${ICONS.generate}</button>
        <button class="sb-header-btn" id="sb-btn-settings" title="Settings">${ICONS.settings}</button>
      </div>
    </div>

    <div class="sb-context-bar" id="sb-context-bar">
      <div class="sb-context-summary" id="sb-context-summary">
        <span class="sb-context-dot" id="sb-context-dot"></span>
        <span id="sb-context-text">Click Refresh to load Spotify data</span>
        <button class="sb-context-action-btn" id="sb-btn-refresh" title="Refresh Data">${ICONS.refresh}</button>
        <button class="sb-context-expand-btn" id="sb-context-expand" title="Show details">&#9660;</button>
      </div>
      <div class="sb-progress-bar-track" id="sb-progress-bar-track">
        <div class="sb-progress-bar-fill" id="sb-progress-bar-fill" style="width: 0%"></div>
      </div>
      <div class="sb-load-steps" id="sb-load-steps"></div>
    </div>

    <div class="sb-conv-list" id="sb-conv-list"></div>

    <!-- Chat view -->
    <div class="sb-messages" id="sb-messages">
      <div class="sb-welcome" id="sb-welcome">
        <h2>Spotify Brainer</h2>
        <p>AI powered brain for Spotify. Ask about your playlists, get recommendations, analyze your listening patterns.</p>
        <div class="sb-quick-actions" id="sb-quick-actions">
          <button class="sb-quick-btn" data-prompt="What am I listening to right now?">Now Playing</button>
          <button class="sb-quick-btn" data-prompt="Recommend songs similar to what I'm playing">Recommend Similar</button>
          <button class="sb-quick-btn" data-prompt="Analyze my music taste and listening patterns">Analyze My Taste</button>
          <button class="sb-quick-btn" data-prompt="What are my top artists?">My Top Artists</button>
        </div>
      </div>
    </div>

    <!-- Settings view -->
    <div class="sb-settings" id="sb-settings">
      <div class="sb-settings-section">
        <div class="sb-settings-section-title">Spotify Account</div>
        <div class="sb-settings-group">
          <label>Client ID</label>
          <input type="text" id="sb-spotify-client-id" placeholder="Your Spotify app Client ID" />
          <span class="sb-settings-hint" id="sb-spotify-hint">
            Create a free app at <a href="https://developer.spotify.com/dashboard" target="_blank" style="color:#1DB954">developer.spotify.com/dashboard</a>. Set the redirect URI to: <code id="sb-redirect-uri" style="color:#1DB954;cursor:pointer;font-size:11px" title="Click to copy"></code>
          </span>
        </div>
        <div class="sb-spotify-auth-actions">
          <button class="sb-spotify-login-btn" id="sb-spotify-login">Connect Spotify</button>
          <button class="sb-spotify-logout-btn" id="sb-spotify-logout" style="display:none">Disconnect</button>
          <span class="sb-spotify-auth-status" id="sb-spotify-auth-status"></span>
        </div>
      </div>

      <div class="sb-settings-section">
        <div class="sb-settings-section-title">LLM Provider</div>
        <div class="sb-settings-group">
          <label>Provider</label>
          <select id="sb-provider-select">
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div class="sb-settings-group">
          <label>API Key</label>
          <input type="password" id="sb-api-key" placeholder="Enter your API key" />
          <span class="sb-settings-hint" id="sb-api-key-hint">
            Get your key at <a href="#" id="sb-api-key-link" target="_blank">provider site</a>
          </span>
        </div>
        <div class="sb-test-row">
          <button class="sb-test-btn" id="sb-test-connection">Test Connection</button>
          <span class="sb-test-status" id="sb-test-status"></span>
        </div>
      </div>

      <div class="sb-settings-section">
        <div class="sb-settings-section-title">Music Generation</div>
        <div class="sb-settings-group">
          <label>Provider</label>
          <select id="sb-music-provider-select">
            <option value="lyria">Lyria (Google AI)</option>
          </select>
        </div>
        <div class="sb-settings-group">
          <label>Model</label>
          <select id="sb-music-model-select"></select>
        </div>
        <div class="sb-settings-group">
          <label>API Key</label>
          <input type="password" id="sb-music-api-key" placeholder="Enter your API key" />
          <span class="sb-settings-hint">
            Get your key at <a href="#" id="sb-music-key-link" target="_blank" style="color:#1DB954">provider site</a>
          </span>
        </div>
        <div class="sb-test-row">
          <button class="sb-test-btn" id="sb-test-music-gen">Test Connection</button>
          <span class="sb-test-status" id="sb-test-music-gen-status"></span>
        </div>
      </div>

      <div class="sb-settings-section">
        <div class="sb-settings-section-title">Music Enrichment (Last.fm)</div>
        <div class="sb-settings-group">
          <label>API Key</label>
          <input type="password" id="sb-lastfm-api-key" placeholder="Enter your Last.fm API key" />
          <span class="sb-settings-hint">
            Optional. Adds genre/mood/style tags to improve music generation.
            Get a free key at <a href="https://www.last.fm/api/account/create" target="_blank" style="color:#1DB954">last.fm/api</a>
          </span>
        </div>
        <div class="sb-test-row">
          <button class="sb-test-btn" id="sb-test-lastfm">Test Connection</button>
          <span class="sb-test-status" id="sb-test-lastfm-status"></span>
        </div>
      </div>

      <div class="sb-settings-section">
        <div class="sb-settings-section-title">Album Art Generation</div>
        <div class="sb-settings-group">
          <label>Provider</label>
          <select id="sb-image-provider-select">
            <option value="imagen">Nano Banana (Google AI)</option>
          </select>
        </div>
        <div class="sb-settings-group">
          <label>Model</label>
          <select id="sb-image-model-select"></select>
        </div>
        <div class="sb-settings-group">
          <label>API Key</label>
          <input type="password" id="sb-image-api-key" placeholder="Enter your API key" />
          <span class="sb-settings-hint">
            Get your key at <a href="#" id="sb-image-key-link" target="_blank" style="color:#1DB954">provider site</a>
          </span>
        </div>
        <div class="sb-test-row">
          <button class="sb-test-btn" id="sb-test-image-gen">Test Connection</button>
          <span class="sb-test-status" id="sb-test-image-gen-status"></span>
        </div>
      </div>

      <div class="sb-settings-section">
        <div class="sb-settings-section-title">Video Generation</div>
        <div class="sb-settings-group">
          <label>Provider</label>
          <select id="sb-video-provider-select">
            <option value="veo">Veo (Google AI)</option>
          </select>
        </div>
        <div class="sb-settings-group">
          <label>Model</label>
          <select id="sb-video-model-select"></select>
        </div>
        <div class="sb-settings-group">
          <label>API Key</label>
          <input type="password" id="sb-video-api-key" placeholder="Enter your API key" />
          <span class="sb-settings-hint">
            Get your key at <a href="#" id="sb-video-key-link" target="_blank" style="color:#1DB954">provider site</a>
          </span>
        </div>
        <div class="sb-test-row">
          <button class="sb-test-btn" id="sb-test-video-gen">Test Connection</button>
          <span class="sb-test-status" id="sb-test-video-gen-status"></span>
        </div>
      </div>

      <div class="sb-settings-section">
        <div class="sb-settings-section-title">Data Import</div>
        <div class="sb-settings-group">
          <label>Streaming History Import</label>
          <input type="file" id="sb-gdpr-import" accept=".zip,.json" multiple
            style="display: none;" />
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
            <button id="sb-gdpr-import-btn" style="background: #1db954; color: #000; border: none; border-radius: 20px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer;">Import Files</button>
            <button id="sb-gdpr-clear-btn" style="background: transparent; color: #b3b3b3; border: 1px solid #b3b3b3; border-radius: 20px; padding: 8px 16px; font-size: 13px; cursor: pointer; display: none;">Clear History</button>
          </div>
          <div id="sb-gdpr-import-status" style="color: #b3b3b3; font-size: 13px; margin-top: 6px;"></div>
          <span class="sb-settings-hint">
            Import your Streaming History JSON files from Spotify Account &rarr; Privacy &rarr; Download your data
          </span>
        </div>
      </div>
    </div>

    <!-- Data viewer -->
    <div class="sb-data-viewer" id="sb-data-viewer">
      <div class="sb-data-tabs">
        <button class="sb-data-tab active" data-tab="profile">Profile</button>
        <button class="sb-data-tab" data-tab="taste">Taste DNA</button>
        <button class="sb-data-tab" data-tab="top">Top Items</button>
        <button class="sb-data-tab" data-tab="recent">Recent</button>
        <button class="sb-data-tab" data-tab="history">History</button>
        <button class="sb-data-tab" data-tab="godmode">God Mode</button>
      </div>
      <div class="sb-data-content" id="sb-data-content">
        <div class="sb-data-empty">No data loaded yet. Click Refresh to load.</div>
      </div>
    </div>

    <!-- Generate panel -->
    <div class="sb-generate" id="sb-generate">
      <div class="sb-generate-inner">
        <div class="sb-generate-hero">
          <h2>Generate Music</h2>
          <p id="sb-gen-subtitle">AI-generated music tailored to your taste</p>
          <div class="sb-gen-mode-toggle">
            <button id="sb-gen-mode-clip" class="sb-gen-mode-btn active">One Shot</button>
            <button id="sb-gen-mode-realtime" class="sb-gen-mode-btn">Realtime</button>
          </div>
        </div>

        <!-- Clip mode (existing generate UI) -->
        <div id="sb-gen-clip-panel">
        <div class="sb-generate-prompt-wrap">
          <label class="sb-generate-label">What are you in the mood for? <span style="color:#535353">(optional)</span></label>
          <textarea id="sb-gen-prompt" class="sb-gen-textarea" placeholder="e.g. &quot;a song I would've liked in Sept 2024&quot;, &quot;something for a late night drive&quot;, &quot;upbeat like my summer playlists&quot;, or leave blank to let AI decide"></textarea>
        </div>

        <div class="sb-gen-btn-row">
          <button id="sb-gen-btn" class="sb-gen-btn">
            <span class="sb-gen-btn-icon">${ICONS.generate}</span>
            <span id="sb-gen-btn-label">Generate</span>
          </button>
          <button id="sb-gen-anti-btn" class="sb-gen-anti-btn" title="Generate something outside your comfort zone">
            <svg viewBox="0 0 5120 5120" width="16" height="16" fill="currentColor"><g transform="translate(0,5120) scale(1,-1)"><path d="M2078 4629c-20-11-28-39-63-207-36-178-43-171 198-218l138-27 24 23c53 49 21 101-72 120-32 6-62 13-68 14-5 2 13 15 42 29 144 73 355 110 519 89 73-9 93-8 111 3 30 20 38 51 19 80-22 34-50 39-221 40-180 0-271-17-430-80-60-24-111-42-113-40-2 2 1 27 7 55 15 71 14 87-9 110-22 22-55 25-82 9z"/><path d="M3185 4517c-55-26-108-74-129-116-20-39-29-87-106-541-39-228-73-427-76-441l-5-27-48 48c-103 103-261 105-365 6-18-17-38-40-44-51-10-19-11-19-49-1-21 10-70 21-108 24-87 5-157-21-210-79l-34-38-57 26c-47 21-66 25-118 21-95-8-155-49-198-133-25-48-34-175-44-640-7-336 2-500 36-643 26-107 57-168 130-247 84-94 120-198 120-351l0-74-88 0c-63 0-94-4-110-16l-22-15 0-435c0-421 1-435 20-454 20-20 33-20 829-20 804 0 853 2 873 33 4 7 8 204 8 438 0 509 10 470-123 477l-87 5 0 107 0 107 113 109c61 60 153 140 202 179 50 38 94 76 100 85 16 24 72 175 114 305 83 259 89 364 28 488-44 89-91 144-160 190-64 42-161 77-217 77-35 0-40 3-40 23 0 13 50 311 111 663 118 681 121 712 81 790-61 118-214 175-327 121zm173-124c13-8 33-35 44-60l20-46-116-676c-64-372-116-679-116-682 0-3-48-9-107-12-60-4-123-9-141-13-31-6-33-5-28 17 4 13 58 330 121 704 63 374 120 692 126 707 31 77 127 107 197 61zm-663-1013c73-35 75-43 75-339 0-277-4-305-49-345-13-12-41-21-74-24-46-4-57-1-84 22-55 47-63 90-63 361 0 235 1 243 23 276 23 35 78 69 111 69 11 0 38-9 61-20zm-387-100c67-30 72-52 72-299 0-115-4-221-10-236-5-14-22-37-36-50-23-21-37-25-91-25-71 0-105 16-129 61-20 40-20 444 0 494 29 69 111 93 194 55zm-382-77c50-32 56-67 52-306-3-191-6-227-21-255-37-68-134-79-188-21-45 48-51 101-41 320 12 236 18 254 102 283 21 7 71-4 96-21zm1536-436c120-59 206-194 194-307-7-70-61-261-118-412l-43-116-105-84c-135-109-263-230-301-284-28-42-29-45-29-173l0-131-524 0-524 0-7 98c-14 190-62 312-167 428-90 99-113 198-125 528l-6 188 33-17c49-25 127-30 193-11 45 13 64 26 100 67 44 51 45 51 70 34 14-9 57-21 96-26 86-12 137 0 202 46l47 33 22-23c29-30 73-51 130-60 35-6 52-16 79-47 48-56 79-68 202-78 60-5 113-11 118-14 5-3-16-30-45-59-58-58-66-85-34-117 33-33 64-25 130 34 33 30 81 63 108 75 94 42 97 44 100 82 2 21-3 40-10 47-32 26-262 71-366 72-46 0-112 21-112 36 0 2 16 19 36 36 36 32 66 82 78 130 5 23 13 28 52 34 108 16 207 22 334 20 125-1 139-4 192-29zm-192-1970l0-344-542-6c-298-4-633-7-745-7l-203 0 0 350 0 350 745 0 745 0 0-343z"/><path d="M1943 890c-41-25-53-48-53-104 0-84 87-137 164-101 82 39 90 158 14 205-42 25-84 25-125 0z"/><path d="M4059 4439c-19-19-21-28-14-96l7-76-64 35c-87 48-220 98-262 98-38 0-56-20-56-63 0-33 8-38 130-86 58-22 122-52 144-64l39-24-64-7c-93-11-119-28-119-78 0-19 8-33 26-45 25-16 35-16 178 1 83 10 159 22 168 27 37 20 39 42 17 201-16 124-24 157-41 175-27 29-62 29-89 2z"/></g></svg>
            Anti-Taste
          </button>
          <button id="sb-gen-future-btn" class="sb-gen-future-btn" title="Generate a track from your predicted future taste">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21,10.12H14.22L16.96,7.3C14.23,4.6 9.81,4.5 7.08,7.2C4.35,9.91 4.35,14.28 7.08,17C9.81,19.7 14.23,19.7 16.96,17C18.32,15.65 19,14.08 19,12.1H21C21,14.08 20.12,16.65 18.36,18.39C14.85,21.87 9.15,21.87 5.64,18.39C2.14,14.92 2.11,9.28 5.62,5.81C9.13,2.34 14.76,2.34 18.27,5.81L21,3V10.12M12.5,8V12.25L16,14.33L15.28,15.54L11,13V8H12.5Z"/></svg>
            Future Me
          </button>
        </div>

        <div id="sb-gen-status" class="sb-gen-status" style="display:none"></div>

        <!-- Audio player -->
        <div id="sb-gen-player" class="sb-gen-player" style="display:none">
          <div class="sb-gen-player-header">
            <div style="flex:1"></div>
            <button id="sb-gen-close-btn" class="sb-gen-close-btn" title="Close player">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
          <img id="sb-gen-album-art" class="sb-gen-album-art" style="display:none" />
          <div class="sb-gen-track-name-row">
            <div id="sb-gen-track-name" class="sb-gen-track-name"></div>
            <button id="sb-gen-rename-btn" class="sb-gen-rename-btn" title="Rename" style="display:none">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>
          <input id="sb-gen-rename-input" class="sb-gen-rename-input" type="text" maxlength="60" style="display:none" />
          <div id="sb-gen-tags" class="sb-gen-tags"></div>
          <div class="sb-gen-controls">
            <button id="sb-gen-play-btn" class="sb-gen-play-btn">${ICONS.play}</button>
            <div class="sb-gen-scrubber-wrap">
              <div class="sb-gen-scrubber" id="sb-gen-scrubber">
                <div class="sb-gen-scrubber-fill" id="sb-gen-scrubber-fill"></div>
                <div class="sb-gen-scrubber-thumb" id="sb-gen-scrubber-thumb"></div>
              </div>
              <div class="sb-gen-time-row">
                <span id="sb-gen-time-cur">0:00</span>
                <span id="sb-gen-time-total">0:30</span>
              </div>
            </div>
          </div>
          <div class="sb-gen-save-row" id="sb-gen-save-row" style="display:none">
            <input id="sb-gen-name-input" class="sb-gen-name-input" type="text" placeholder="Name this clip..." maxlength="60" />
            <div class="sb-gen-save-btns">
              <button id="sb-gen-save-btn" class="sb-gen-save-btn">Save</button>
              <button id="sb-gen-discard-btn" class="sb-gen-discard-btn">Discard</button>
            </div>
          </div>
          <div class="sb-gen-video-row" id="sb-gen-video-row" style="display:none">
            <button id="sb-gen-video-btn" class="sb-gen-video-btn">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
              <span id="sb-gen-video-btn-label">Generate Video</span>
            </button>
            <span class="sb-gen-video-status" id="sb-gen-video-status"></span>
          </div>
          <video id="sb-gen-video" class="sb-gen-video" style="display:none" controls loop></video>
          <div id="sb-gen-insights" class="sb-gen-insights" style="display:none"></div>
          <div id="sb-gen-user-prompt-wrap" class="sb-gen-prompt-preview" style="display:none">
            <details>
              <summary>Your prompt</summary>
              <p id="sb-gen-user-prompt"></p>
            </details>
          </div>
          <div class="sb-gen-prompt-preview">
            <details>
              <summary>System prompt</summary>
              <p id="sb-gen-prompt-used"></p>
            </details>
          </div>
        </div>

        <!-- Saved songs library -->
        <div class="sb-gen-library" id="sb-gen-library" style="display:none">
          <div class="sb-gen-library-header">Saved Tracks <span id="sb-gen-lib-count" class="sb-gen-lib-count"></span></div>
          <div id="sb-gen-library-list"></div>
        </div>
        </div><!-- end sb-gen-clip-panel -->

        <!-- Realtime mode panel -->
        <div id="sb-rt-panel" class="sb-rt-panel" style="display:none">
          <div class="sb-rt-visualizer" id="sb-rt-visualizer">
            <div class="sb-rt-viz-loader" id="sb-rt-viz-loader">Generating...</div>
            <div class="sb-rt-viz-bars" id="sb-rt-viz-bars">
              <div class="sb-rt-viz-bar"></div>
              <div class="sb-rt-viz-bar"></div>
              <div class="sb-rt-viz-bar"></div>
              <div class="sb-rt-viz-bar"></div>
              <div class="sb-rt-viz-bar"></div>
            </div>
          </div>
          <div class="sb-rt-spectrum-wrap">
            <div class="sb-rt-spectrum-labels">
              <span class="sb-rt-label-anti">Anti-Taste</span>
              <span class="sb-rt-label-current">Me RN</span>
              <span class="sb-rt-label-future">Future Me</span>
            </div>
            <div class="sb-rt-spectrum" id="sb-rt-spectrum"></div>
            <svg class="sb-rt-branches" id="sb-rt-branches" xmlns="http://www.w3.org/2000/svg"></svg>
            <div class="sb-rt-scrubber" id="sb-rt-scrubber">
              <div class="sb-rt-scrubber-track"><div class="sb-rt-scrubber-gradient"></div><div class="sb-rt-scrubber-fill" id="sb-rt-scrubber-fill"></div></div>
              <div class="sb-rt-scrubber-dot" id="sb-rt-scrubber-dot"></div>
            </div>
          </div>
          <div class="sb-rt-piano-wrap" id="sb-rt-keys">
            <div class="sb-rt-piano-label">Key</div>
            <div class="sb-rt-piano">
              <div class="sb-piano-key white" data-scale="C_MAJOR_A_MINOR"><span class="sb-piano-note">C</span><span class="sb-piano-minor">Am</span></div>
              <div class="sb-piano-key black" data-scale="D_FLAT_MAJOR_B_FLAT_MINOR"><span class="sb-piano-note">Db</span><span class="sb-piano-minor">Bbm</span></div>
              <div class="sb-piano-key white" data-scale="D_MAJOR_B_MINOR"><span class="sb-piano-note">D</span><span class="sb-piano-minor">Bm</span></div>
              <div class="sb-piano-key black" data-scale="E_FLAT_MAJOR_C_MINOR"><span class="sb-piano-note">Eb</span><span class="sb-piano-minor">Cm</span></div>
              <div class="sb-piano-key white" data-scale="E_MAJOR_D_FLAT_MINOR"><span class="sb-piano-note">E</span><span class="sb-piano-minor">Dbm</span></div>
              <div class="sb-piano-key white" data-scale="F_MAJOR_D_MINOR"><span class="sb-piano-note">F</span><span class="sb-piano-minor">Dm</span></div>
              <div class="sb-piano-key black" data-scale="G_FLAT_MAJOR_E_FLAT_MINOR"><span class="sb-piano-note">Gb</span><span class="sb-piano-minor">Ebm</span></div>
              <div class="sb-piano-key white" data-scale="G_MAJOR_E_MINOR"><span class="sb-piano-note">G</span><span class="sb-piano-minor">Em</span></div>
              <div class="sb-piano-key black" data-scale="A_FLAT_MAJOR_F_MINOR"><span class="sb-piano-note">Ab</span><span class="sb-piano-minor">Fm</span></div>
              <div class="sb-piano-key white" data-scale="A_MAJOR_G_FLAT_MINOR"><span class="sb-piano-note">A</span><span class="sb-piano-minor">Gbm</span></div>
              <div class="sb-piano-key black" data-scale="B_FLAT_MAJOR_G_MINOR"><span class="sb-piano-note">Bb</span><span class="sb-piano-minor">Gm</span></div>
              <div class="sb-piano-key white" data-scale="B_MAJOR_A_FLAT_MINOR"><span class="sb-piano-note">B</span><span class="sb-piano-minor">Abm</span></div>
            </div>
          </div>
          <div class="sb-rt-controls">
            <button id="sb-rt-play" class="sb-rt-ctrl-btn sb-rt-play-btn" title="Play / Pause">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button id="sb-rt-stop" class="sb-rt-ctrl-btn sb-rt-stop-btn" title="Stop" disabled>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
            </button>
          </div>
          <div class="sb-rt-status-row">
            <div id="sb-rt-status" class="sb-rt-status">Ready</div>
            <button id="sb-rt-rec" class="sb-rt-rec-pill" title="Record" disabled>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>
              <span class="sb-rt-rec-label">REC</span>
            </button>
          </div>
          <div class="sb-rt-params" id="sb-rt-params"></div>
        </div>
      </div>
    </div>

    <div class="sb-token-counter" id="sb-token-counter"></div>

    <div class="sb-input-area" id="sb-input-area">
      <div class="sb-input-row">
        <textarea class="sb-textarea" id="sb-input" placeholder="Ask about your music..." rows="1"></textarea>
        <button class="sb-send-btn" id="sb-send-btn" title="Send">${ICONS.send}</button>
        <button class="sb-stop-btn" id="sb-stop-btn" title="Stop generating">${ICONS.stop}</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // --- State ---
  let isOpen = false;
  let panelWidth = 380;
  let showingSettings = false;
  let isGenerating = false;
  let abortController = null;
  let conversations = []; // {id, title, messages: [{role, content, timestamp}], created}
  let currentConvId = null;
  let showingConvList = false;
  let userHasScrolled = false;

  // --- DOM refs ---
  const messagesEl = document.getElementById('sb-messages');
  const welcomeEl = document.getElementById('sb-welcome');
  const inputEl = document.getElementById('sb-input');
  const sendBtn = document.getElementById('sb-send-btn');
  const stopBtn = document.getElementById('sb-stop-btn');
  const settingsEl = document.getElementById('sb-settings');
  const inputArea = document.getElementById('sb-input-area');
  const tokenCounter = document.getElementById('sb-token-counter');
  const contextText = document.getElementById('sb-context-text');
  const contextDot = document.getElementById('sb-context-dot');
  const convListEl = document.getElementById('sb-conv-list');
  const providerSelect = document.getElementById('sb-provider-select');
  const apiKeyInput = document.getElementById('sb-api-key');
  const apiKeyLink = document.getElementById('sb-api-key-link');
  const resizeHandle = document.getElementById('spotify-brainer-resize');

  // --- Toggle panel ---
  function togglePanel() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    document.body.classList.toggle('spotify-brainer-open', isOpen);
    if (isOpen) {
      document.body.style.marginRight = panelWidth + 'px';
      inputEl.focus();
    } else {
      document.body.style.marginRight = '';
    }
    chrome.storage.local.set({ sb_isOpen: isOpen });
  }

  toggle.addEventListener('click', togglePanel);

  // --- Resize ---
  let isResizing = false;
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeHandle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 280 && newWidth <= 600) {
      panelWidth = newWidth;
      panel.style.width = newWidth + 'px';
      if (isOpen) {
        document.body.style.marginRight = newWidth + 'px';
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      chrome.storage.local.set({ sb_panelWidth: panelWidth });
    }
  });

  // --- Keyboard shortcut (also handled by manifest commands) ---
  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg.action === 'toggle-sidebar') togglePanel();
  });

  // --- Panel switching (chat / settings / data viewer) ---
  let activePanel = 'chat'; // 'chat' | 'settings' | 'data' | 'generate'
  const dataViewerEl = document.getElementById('sb-data-viewer');
  const generateEl = document.getElementById('sb-generate');
  const dataContentEl = document.getElementById('sb-data-content');

  // Heatmap tooltip (floating, follows cursor)
  const hmTooltip = document.createElement('div');
  hmTooltip.style.cssText = 'display:none;position:fixed;background:#282828;color:#fff;padding:5px 10px;border-radius:6px;font-size:11px;pointer-events:none;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,.6);white-space:nowrap;';
  document.body.appendChild(hmTooltip);

  // Heatmap hover via event delegation (survives re-renders)
  dataContentEl.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.sb-hm');
    if (!cell) return;
    cell.style.transform = 'scale(1.4)';
    cell.style.boxShadow = '0 0 6px rgba(29,185,84,.7)';
    cell.style.zIndex = '1';
    cell.style.position = 'relative';
    hmTooltip.textContent = cell.dataset.tip;
    hmTooltip.style.display = 'block';
  });
  dataContentEl.addEventListener('mousemove', (e) => {
    if (hmTooltip.style.display === 'block') {
      const tipWidth = hmTooltip.offsetWidth;
      const spaceRight = window.innerWidth - e.clientX;
      const left = spaceRight < tipWidth + 20 ? e.clientX - tipWidth - 12 : e.clientX + 12;
      hmTooltip.style.left = left + 'px';
      hmTooltip.style.top = (e.clientY - 32) + 'px';
    }
  });
  dataContentEl.addEventListener('mouseout', (e) => {
    const cell = e.target.closest('.sb-hm');
    if (!cell) return;
    cell.style.transform = '';
    cell.style.boxShadow = '';
    cell.style.zIndex = '';
    cell.style.position = '';
    hmTooltip.style.display = 'none';
  });

  function showPanel(name) {
    activePanel = name;
    messagesEl.style.display = name === 'chat' ? 'flex' : 'none';
    inputArea.style.display = name === 'chat' ? 'block' : 'none';
    tokenCounter.style.display = name === 'chat' ? 'block' : 'none';
    settingsEl.classList.toggle('open', name === 'settings');
    dataViewerEl.classList.toggle('open', name === 'data');
    generateEl.classList.toggle('open', name === 'generate');
    // Stop realtime playback when leaving the generate panel
    if (name !== 'generate') {
      chrome.runtime.sendMessage({ type: 'realtime-stop' }).catch(() => {});
    }
    // Close chats dropdown when switching panels
    showingConvList = false;
    convListEl.classList.remove('open');
    if (name === 'data') renderDataViewer('profile');

    // Update active tab highlight
    document.querySelectorAll('.sb-header-btn').forEach((btn) => btn.classList.remove('active'));
    const activeBtn = {
      settings: 'sb-btn-settings',
      data: 'sb-btn-data',
      generate: 'sb-btn-generate',
    }[name];
    if (activeBtn) document.getElementById(activeBtn)?.classList.add('active');
  }

  document.getElementById('sb-btn-settings').addEventListener('click', () => {
    showPanel(activePanel === 'settings' ? 'chat' : 'settings');
  });

  document.getElementById('sb-btn-data').addEventListener('click', () => {
    showPanel(activePanel === 'data' ? 'chat' : 'data');
  });

  document.getElementById('sb-btn-generate').addEventListener('click', () => {
    showPanel(activePanel === 'generate' ? 'chat' : 'generate');
  });

  // --- Data viewer tabs ---
  document.querySelector('.sb-data-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.sb-data-tab');
    if (!tab) return;
    document.querySelectorAll('.sb-data-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    renderDataViewer(tab.dataset.tab);
  });

  function renderDataViewer(tab) {
    // Ask background for the current data snapshot
    chrome.runtime.sendMessage({ type: 'get-spotify-data', tab }, (response) => {
      if (!response) {
        dataContentEl.innerHTML = '<div class="sb-data-empty">No data loaded yet. Click Refresh to load.</div>';
        return;
      }
      dataContentEl.innerHTML = renderDataTab(tab, response);
    });
  }

  function renderDataTab(tab, data) {
    switch (tab) {
      case 'profile': return renderProfileTab(data);
      case 'taste': return renderTasteTab(data);
      case 'playlists': return renderPlaylistsTab(data);
      case 'top': return renderTopTab(data);
      case 'recent': return renderRecentTab(data);
      case 'history': return renderHistoryTab(data);
      case 'godmode': return renderGodModeTab(data);
      default: return '<div class="sb-data-empty">Unknown tab</div>';
    }
  }

  function renderProfileTab(d) {
    const np = d.nowPlaying;
    const u = d.userProfile;
    let html = '<div class="sb-data-section">';
    if (u) {
      html += '<h3 class="sb-data-heading">User</h3>';
      html += dataRow('Name', u.display_name);
      html += dataRow('Plan', u.product);
      html += dataRow('Country', u.country);
      html += dataRow('Followers', u.followers?.total);
    } else {
      html += '<div class="sb-data-muted">No profile data</div>';
    }
    html += '</div>';
    html += '<div class="sb-data-section"><h3 class="sb-data-heading">Library</h3>';
    html += dataRow('Playlists', d.playlists?.length || 0);
    html += dataRow('Saved tracks', d.savedTracks?.length || 0);
    html += dataRow('Saved albums', d.savedAlbums?.length || 0);
    html += dataRow('Audio profiles', Object.keys(d.audioFeatures || {}).length);
    html += '</div>';
    return html;
  }

  function renderTasteTab(d) {
    const intel = d.intelligence;
    if (!intel) return '<div class="sb-data-empty">No taste data computed yet. Click Refresh to load.</div>';
    let html = '';

    if (intel.decadeDistribution) {
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Decade Distribution</h3>';
      const sorted = Object.entries(intel.decadeDistribution).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [decade, pct] of sorted) {
        html += dataBar(decade, pct);
      }
      html += '</div>';
    }

    html += '<div class="sb-data-section"><h3 class="sb-data-heading">Scores</h3>';
    html += dataRow('Discovery', intel.discoveryScore?.toFixed(2));
    html += dataRow('Mainstream index', intel.mainstreamIndex ?? 'N/A');
    html += dataRow('Explicit ratio', (intel.explicitRatio * 100)?.toFixed(1) + '%');
    html += dataRow('Tempo', intel.tempoPreference || 'N/A');
    html += '</div>';

    if (intel.personalityTags?.length) {
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Personality Tags</h3>';
      html += '<div class="sb-data-tags">' + intel.personalityTags.map((t) => '<span class="sb-data-tag">' + escapeHtml(t) + '</span>').join('') + '</div>';
      html += '</div>';
    }

    return html;
  }

  function renderPlaylistsTab(d) {
    const playlists = d.playlists || [];
    if (!playlists.length) return '<div class="sb-data-empty">No playlists loaded</div>';
    let html = '<div class="sb-data-section"><h3 class="sb-data-heading">' + playlists.length + ' Playlists</h3>';
    for (const pl of playlists) {
      const intel = d.intelligence?.playlistProfiles?.[pl.id];
      html += '<div class="sb-data-list-item">';
      html += '<div class="sb-data-list-title">' + escapeHtml(pl.name) + '</div>';
      html += '<div class="sb-data-list-meta">' + (pl.tracks?.total || 0) + ' tracks';
      if (pl.public === false) html += ' &middot; Private';
      if (pl.collaborative) html += ' &middot; Collaborative';
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function renderTopTab(d) {
    let html = '';
    const ranges = [
      { key: 'short', label: 'Last 4 Weeks' },
      { key: 'medium', label: 'Last 6 Months' },
      { key: 'long', label: 'Last Year' },
    ];

    html += '<div class="sb-data-section"><h3 class="sb-data-heading">Top Artists</h3>';
    for (const r of ranges) {
      const artists = d.topArtists?.[r.key] || [];
      if (!artists.length) continue;
      html += '<div class="sb-data-subheading">' + r.label + '</div>';
      for (let i = 0; i < Math.min(artists.length, 10); i++) {
        const a = artists[i];
        html += '<div class="sb-data-rank"><span class="sb-data-rank-num">' + (i + 1) + '</span> ' + escapeHtml(a.name);
        html += '</div>';
      }
    }
    html += '</div>';

    html += '<div class="sb-data-section"><h3 class="sb-data-heading">Top Tracks</h3>';
    for (const r of ranges) {
      const tracks = d.topTracks?.[r.key] || [];
      if (!tracks.length) continue;
      html += '<div class="sb-data-subheading">' + r.label + '</div>';
      for (let i = 0; i < Math.min(tracks.length, 10); i++) {
        const t = tracks[i];
        html += '<div class="sb-data-rank"><span class="sb-data-rank-num">' + (i + 1) + '</span> ' + escapeHtml(t.name) + ' <span class="sb-data-muted">' + escapeHtml(t.artists?.map(a => a.name).join(', ') || '') + '</span></div>';
      }
    }
    html += '</div>';
    return html;
  }

  function renderRecentTab(d) {
    const recent = d.recentlyPlayed || [];
    if (!recent.length) return '<div class="sb-data-empty">No recently played data</div>';
    let html = '<div class="sb-data-section"><h3 class="sb-data-heading">' + recent.length + ' Recently Played</h3>';
    for (const item of recent) {
      const t = item.track;
      if (!t) continue;
      const time = new Date(item.played_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      html += '<div class="sb-data-list-item">';
      html += '<div class="sb-data-list-title">' + escapeHtml(t.name) + '</div>';
      html += '<div class="sb-data-list-meta">' + escapeHtml(t.artists?.map(a => a.name).join(', ') || '') + ' &middot; ' + time + '</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderHistoryTab(d) {
    const hm = d.historyMetrics;
    if (!hm?.lifetimeStats) return '<div class="sb-data-empty">No GDPR history imported yet.<br>Go to Settings to import your Streaming History.</div>';
    let html = '';
    const ls = hm.lifetimeStats;

    // --- Lifetime Stats ---
    html += '<div class="sb-data-section"><h3 class="sb-data-heading">Lifetime Stats</h3>';
    html += dataRow('Total plays', ls.totalPlays?.toLocaleString() + (ls.totalEvents !== ls.totalPlays ? ` (of ${ls.totalEvents?.toLocaleString()} events)` : ''));
    html += dataRow('Unique tracks', ls.uniqueTracks?.toLocaleString());
    html += dataRow('Unique artists', ls.uniqueArtists?.toLocaleString());
    html += dataRow('Years of data', ls.totalYears);
    html += dataRow('Total listening', Math.round((ls.totalMs || 0) / 3600000).toLocaleString() + ' hours');
    if (ls.topArtistAllTime) html += dataRow('Top artist', ls.topArtistAllTime.name + ' (' + ls.topArtistAllTime.plays.toLocaleString() + ' plays)');
    if (ls.topTrackAllTime) html += dataRow('Top track', ls.topTrackAllTime.name + ' (' + ls.topTrackAllTime.plays.toLocaleString() + ' plays)');
    html += '</div>';

    // --- Listening Engagement ---
    if (hm.listeningEngagement) {
      const le = hm.listeningEngagement;
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Listening Engagement</h3>';
      html += dataRow('Avg listen duration', Math.round(le.avgMsPlayed / 1000) + 's');
      html += dataRow('Completion rate', le.completionRate + '%');
      html += dataRow('Micro-plays (<10s)', le.microPlays.toLocaleString() + ` (${le.microPlaysPct}%)`);
      html += dataRow('Deep listens (>5min)', le.deepListens.toLocaleString() + ` (${le.deepListensPct}%)`);
      html += '</div>';
    }

    // --- Artist Relationships ---
    if (hm.artistRelationships) {
      const ar = hm.artistRelationships;
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Artist Relationships</h3>';
      html += dataRow('Top 10 loyalty', ar.loyaltyScore + '% of listening time');
      html += dataRow('Concentration (Gini)', ar.giniCoefficient);
      html += dataRow('One-listen artists', ar.oneListenArtists.toLocaleString() + ` (${ar.oneListenArtistsPct}%)`);
      html += '</div>';

      if (ar.artistLifecycles?.length) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Top Artist Lifecycles</h3>';
        for (const a of ar.artistLifecycles.slice(0, 10)) {
          html += '<div class="sb-data-list-item">';
          html += `<div class="sb-data-list-title">${escapeHtml(a.name)} <span style="color:#888;font-weight:400;">(${a.totalPlays.toLocaleString()} plays)</span></div>`;
          html += `<div class="sb-data-list-meta">Discovered ${a.firstPlay} · Peak ${a.peakMonth} (${a.peakMonthPlays} plays) · Last ${a.lastPlay}</div>`;
          html += '</div>';
        }
        html += '</div>';
      }

      if (ar.monthlyNewArtists?.length) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Discovery Rate</h3>';
        html += '<div class="sb-data-list-meta" style="margin-bottom:6px;">New artists discovered per month</div>';
        for (const m of ar.monthlyNewArtists) {
          const barWidth = Math.min(100, Math.round(m.count / Math.max(...ar.monthlyNewArtists.map((x) => x.count)) * 100));
          html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;font-size:12px;">`;
          html += `<span style="color:#b3b3b3;width:60px;flex-shrink:0;">${m.month}</span>`;
          html += `<div style="flex:1;background:#282828;border-radius:3px;height:14px;"><div style="width:${barWidth}%;background:#1db954;height:100%;border-radius:3px;"></div></div>`;
          html += `<span style="color:#888;width:30px;text-align:right;">${m.count}</span>`;
          html += '</div>';
        }
        html += '</div>';
      }
    }

    // --- Temporal Behavior ---
    if (hm.temporalBehavior) {
      const tb = hm.temporalBehavior;
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Temporal Behavior</h3>';
      html += dataRow('Peak hour', tb.peakHour + ':00');
      html += dataRow('Peak day', tb.peakDay);
      html += dataRow('Night owl score', tb.nightOwlPct + '% (midnight–5am)');
      html += '</div>';

      if (tb.sessions) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Sessions</h3>';
        html += dataRow('Total sessions', tb.sessions.total.toLocaleString());
        html += dataRow('Avg session', tb.sessions.avgDurationMin + ' min · ' + tb.sessions.avgTracksPerSession + ' tracks');
        html += dataRow('Sessions per week', tb.sessions.sessionsPerWeek);
        if (tb.sessions.longestSession) {
          const ls2 = tb.sessions.longestSession;
          html += dataRow('Longest session', ls2.durationMin + ' min · ' + ls2.tracks + ' tracks · ' + ls2.date);
        }
        html += '</div>';
      }

      if (tb.weekdayVsWeekend) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Weekday vs Weekend</h3>';
        html += dataRow('Weekday avg', tb.weekdayVsWeekend.weekday.avgHoursPerDay + ' hrs/day · ' + tb.weekdayVsWeekend.weekday.uniqueArtists + ' artists');
        html += dataRow('Weekend avg', tb.weekdayVsWeekend.weekend.avgHoursPerDay + ' hrs/day · ' + tb.weekdayVsWeekend.weekend.uniqueArtists + ' artists');
        html += '</div>';
      }

      // Heatmap
      if (tb.heatmap) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Listening Heatmap</h3>';
        const maxVal = Math.max(...tb.heatmap.flat());
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        html += '<div style="display:grid;grid-template-columns:36px repeat(24, 1fr);gap:2px;max-width:100%;">';
        // Header row
        html += '<div></div>';
        for (let h = 0; h < 24; h++) {
          const ampm = h < 12 ? 'AM' : 'PM';
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          html += `<div style="color:#888;text-align:center;font-size:8px;line-height:14px;">${h % 3 === 0 ? h12 + ampm : ''}</div>`;
        }
        // Data rows
        for (let d = 0; d < 7; d++) {
          html += `<div style="color:#888;font-size:10px;line-height:14px;display:flex;align-items:center;">${dayLabels[d]}</div>`;
          for (let h = 0; h < 24; h++) {
            const val = tb.heatmap[d][h];
            const intensity = maxVal > 0 ? val / maxVal : 0;
            const bg = intensity === 0 ? '#1a1a1a' : `rgba(29, 185, 84, ${0.15 + intensity * 0.85})`;
            const tipH = h === 0 ? 12 : h > 12 ? h - 12 : h;
            const tipAP = h < 12 ? 'AM' : 'PM';
            html += `<div class="sb-hm" data-tip="${dayLabels[d]} ${tipH}:00 ${tipAP} — ${val} plays" style="background:${bg};height:14px;border-radius:2px;cursor:crosshair;"></div>`;
          }
        }
        html += '</div></div>';
      }

      // Monthly hours trend
      if (tb.monthlyHours?.length) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Monthly Listening</h3>';
        const maxHrs = Math.max(...tb.monthlyHours.map((m) => m.hours));
        for (const m of tb.monthlyHours) {
          const barWidth = Math.min(100, Math.round(m.hours / maxHrs * 100));
          html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;font-size:12px;">`;
          html += `<span style="color:#b3b3b3;width:60px;flex-shrink:0;">${m.month}</span>`;
          html += `<div style="flex:1;background:#282828;border-radius:3px;height:14px;"><div style="width:${barWidth}%;background:#1db954;height:100%;border-radius:3px;"></div></div>`;
          html += `<span style="color:#888;width:50px;text-align:right;">${m.hours}h</span>`;
          html += '</div>';
        }
        html += '</div>';
      }
    }

    // --- Replay & Obsession ---
    if (hm.replayObsession) {
      const ro = hm.replayObsession;
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Replay & Obsession</h3>';
      html += dataRow('24hr repeat ratio', ro.repeatRatio + '%');
      html += dataRow('One-and-done tracks', ro.oneAndDoneTracks.toLocaleString() + ` (${ro.oneAndDonePct}%)`);
      html += dataRow('Repeat favorites (5+)', ro.repeatFavorites.toLocaleString() + ` (${ro.repeatFavoritesPct}%)`);
      html += dataRow('Binge episodes (5+ in a row)', ro.totalBingeEpisodes.toLocaleString());
      html += '</div>';

      if (ro.bingeEpisodes?.length) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Top Binge Sessions</h3>';
        for (const b of ro.bingeEpisodes.slice(0, 10)) {
          html += '<div class="sb-data-list-item">';
          html += `<div class="sb-data-list-title">${escapeHtml(b.artist)}</div>`;
          html += `<div class="sb-data-list-meta">${b.tracks} tracks in a row · ${b.date}</div>`;
          html += '</div>';
        }
        html += '</div>';
      }
    }

    // --- Streaks & Records ---
    if (hm.streaksRecords) {
      const sr = hm.streaksRecords;
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Streaks & Records</h3>';
      html += dataRow('Longest daily streak', sr.longestDailyStreak.days + ' days (ending ' + sr.longestDailyStreak.endDate + ')');
      html += dataRow('Total active days', sr.totalActiveDays.toLocaleString());
      if (sr.mostPlaysInDay) html += dataRow('Most plays in a day', sr.mostPlaysInDay.plays + ' plays · ' + sr.mostPlaysInDay.hoursListened + 'h · ' + sr.mostPlaysInDay.date);
      if (sr.mostDiverseDay) html += dataRow('Most diverse day', sr.mostDiverseDay.uniqueArtists + ' artists · ' + sr.mostDiverseDay.date);
      if (sr.longestGap) html += dataRow('Longest gap', sr.longestGap.days + ' days (' + sr.longestGap.from + ' → ' + sr.longestGap.to + ')');
      html += '</div>';
    }

    // --- Taste Profile ---
    if (hm.tasteProfile) {
      const tp = hm.tasteProfile;

      if (tp.concentration) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Artist Concentration</h3>';
        html += dataRow('Top 1% of artists', `${tp.concentration.top1PctArtists} artists → ${tp.concentration.top1PctSharePct}% of plays`);
        html += dataRow('Top 10% of artists', `${tp.concentration.top10PctArtists} artists → ${tp.concentration.top10PctSharePct}% of plays`);
        html += '</div>';
      }

      if (tp.monthlyTopArtist?.length) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Monthly #1 Artist</h3>';
        for (const m of tp.monthlyTopArtist) {
          html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;">`;
          html += `<span style="color:#b3b3b3;">${m.month}</span>`;
          html += `<span style="color:#fff;">${escapeHtml(m.artist)} <span style="color:#888;">(${m.plays})</span></span>`;
          html += '</div>';
        }
        html += '</div>';
      }

      if (tp.monthlyVariety?.length) {
        html += '<div class="sb-data-section"><h3 class="sb-data-heading">Monthly Variety Score</h3>';
        html += '<div class="sb-data-list-meta" style="margin-bottom:6px;">Unique artists / total plays (higher = more variety)</div>';
        const maxVar = Math.max(...tp.monthlyVariety.map((m) => m.varietyScore));
        for (const m of tp.monthlyVariety) {
          const barWidth = maxVar > 0 ? Math.min(100, Math.round(m.varietyScore / maxVar * 100)) : 0;
          html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;font-size:12px;">`;
          html += `<span style="color:#b3b3b3;width:60px;flex-shrink:0;">${m.month}</span>`;
          html += `<div style="flex:1;background:#282828;border-radius:3px;height:14px;"><div style="width:${barWidth}%;background:#1db954;height:100%;border-radius:3px;"></div></div>`;
          html += `<span style="color:#888;width:36px;text-align:right;">${m.varietyScore}</span>`;
          html += '</div>';
        }
        html += '</div>';
      }
    }

    // --- Taste Evolution ---
    if (hm.tasteEvolution?.length) {
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Taste Evolution</h3>';
      for (const era of hm.tasteEvolution) {
        html += '<div class="sb-data-list-item">';
        html += `<div class="sb-data-list-title">${era.period} <span style="color:#888;font-weight:400;">${era.plays?.toLocaleString()} plays · ${era.hours}h</span></div>`;
        if (era.topArtists) {
          html += '<div class="sb-data-list-meta">' + era.topArtists.map((a) => `${escapeHtml(a.name)} (${a.plays})`).join(', ') + '</div>';
        } else {
          html += '<div class="sb-data-list-meta">' + escapeHtml(era.description) + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    // --- Recent Trends ---
    if (hm.recentTrends?.length) {
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Recent Trends</h3>';
      for (const trend of hm.recentTrends) {
        html += '<div class="sb-data-list-item"><div class="sb-data-list-meta">' + escapeHtml(trend) + '</div></div>';
      }
      html += '</div>';
    }

    return html;
  }

  function renderGodModeTab(d) {
    const sections = [
      { label: 'Now Playing', data: d.nowPlaying, source: 'api + dom' },
      { label: 'User Profile', data: d.userProfile, source: 'api' },
      { label: 'Top Artists (Short Term)', data: d.topArtists?.short, source: 'api' },
      { label: 'Top Artists (Medium Term)', data: d.topArtists?.medium, source: 'api' },
      { label: 'Top Artists (Long Term)', data: d.topArtists?.long, source: 'api' },
      { label: 'Top Tracks (Short Term)', data: d.topTracks?.short, source: 'api' },
      { label: 'Top Tracks (Medium Term)', data: d.topTracks?.medium, source: 'api' },
      { label: 'Top Tracks (Long Term)', data: d.topTracks?.long, source: 'api' },
      { label: 'Recently Played', data: d.recentlyPlayed, source: 'api' },
      { label: 'Playlists', data: d.playlists, source: 'api' },
      { label: 'Saved Tracks', data: d.savedTracks, source: 'api' },
      { label: 'Saved Albums', data: d.savedAlbums, source: 'api' },
      { label: 'Queue', data: d.queue, source: 'api' },
      { label: 'Audio Features', data: d.audioFeatures, source: 'api' },
      { label: 'Intelligence', data: d.intelligence, source: 'computed' },
      { label: 'History Metrics', data: d.historyMetrics, source: 'computed' },
    ];

    let html = '';
    for (const s of sections) {
      const count = Array.isArray(s.data) ? ` (${s.data.length})` : (s.data ? '' : ' — empty');
      const json = s.data ? escapeHtml(JSON.stringify(s.data, null, 2)) : '';
      html += '<div class="sb-data-section">';
      const badge = s.source === 'computed'
        ? ' <span style="font-size:10px;font-weight:400;padding:2px 6px;display:inline-block;border-radius:8px;background:#1db954;color:#000;vertical-align:middle;margin-left:6px;">computed</span>'
        : s.source === 'api + dom'
        ? ' <span style="font-size:10px;font-weight:400;padding:2px 6px;display:inline-block;border-radius:8px;background:#333;color:#b3b3b3;vertical-align:middle;margin-left:6px;">api + dom</span>'
        : ' <span style="font-size:10px;font-weight:400;padding:2px 6px;display:inline-block;border-radius:8px;background:#333;color:#b3b3b3;vertical-align:middle;margin-left:6px;">api</span>';
      html += `<h3 class="sb-data-heading sb-godmode-toggle" style="cursor:pointer;user-select:none;padding-bottom:8px;display:flex;align-items:center;">${escapeHtml(s.label)}${count}${badge} <span class="sb-godmode-arrow" style="margin-left:auto;font-size:11px;color:#888;">&#9660;</span></h3>`;
      html += `<pre class="sb-godmode-json" style="display:none;max-height:400px;overflow:auto;background:#181818;padding:10px;border-radius:6px;font-size:11px;color:#b3b3b3;white-space:pre-wrap;word-break:break-all;">${json || '<span style="color:#666;">No data</span>'}</pre>`;
      html += '</div>';
    }

    // Wire up toggles after render
    setTimeout(() => {
      document.querySelectorAll('.sb-godmode-toggle').forEach((el) => {
        el.addEventListener('click', () => {
          const pre = el.nextElementSibling;
          const arrow = el.querySelector('.sb-godmode-arrow');
          if (pre.style.display === 'none') {
            pre.style.display = 'block';
            arrow.innerHTML = '&#9650;';
          } else {
            pre.style.display = 'none';
            arrow.innerHTML = '&#9660;';
          }
        });
      });
    }, 0);

    return html;
  }

  // --- Data viewer helpers ---
  function dataRow(label, value) {
    return '<div class="sb-data-row"><span class="sb-data-label">' + escapeHtml(label) + '</span><span class="sb-data-value">' + escapeHtml(String(value ?? '—')) + '</span></div>';
  }

  function dataBar(label, pct) {
    const width = Math.max(2, Math.round(pct * 100));
    return '<div class="sb-data-bar-row"><span class="sb-data-bar-label">' + escapeHtml(label) + '</span><div class="sb-data-bar-track"><div class="sb-data-bar-fill" style="width:' + width + '%"></div></div><span class="sb-data-bar-pct">' + Math.round(pct * 100) + '%</span></div>';
  }

  // --- Provider/model selection ---
  const PROVIDER_MODELS = {
    anthropic: {
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context: 1000000 },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', context: 1000000 },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', context: 200000 },
        { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', context: 200000 },
      ],
      keyUrl: 'https://console.anthropic.com/settings/keys',
    },
    openai: {
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', context: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context: 128000 },
        { id: 'o1', name: 'o1', context: 200000 },
      ],
      keyUrl: 'https://platform.openai.com/api-keys',
    },
    gemini: {
      models: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: 1048576 },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: 1048576 },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: 1048576 },
      ],
      keyUrl: 'https://aistudio.google.com/apikey',
    },
  };

  function updateProviderSettings() {
    const provider = providerSelect.value;
    apiKeyLink.href = PROVIDER_MODELS[provider]?.keyUrl || '#';
    chrome.storage.local.get([`sb_apiKey_${provider}`], (data) => {
      apiKeyInput.value = data[`sb_apiKey_${provider}`] || '';
      if (typeof updateHintVisibility === 'function') updateHintVisibility();
    });
  }

  providerSelect.addEventListener('change', () => {
    updateProviderSettings();
    chrome.storage.local.set({ sb_provider: providerSelect.value });
  });

  apiKeyInput.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_apiKey_${providerSelect.value}`]: apiKeyInput.value });
  });

  // --- Music generation provider settings ---
  const MUSIC_GEN_PROVIDERS = {
    lyria: {
      displayName: 'Lyria (Google AI)',
      apiKeyUrl: 'https://aistudio.google.com/apikey',
      keyPlaceholder: 'AIza...',
      models: [
        { id: 'lyria-3-clip-preview', name: 'Lyria 3 Clip (30s)' },
        { id: 'lyria-3-pro-preview', name: 'Lyria 3 Pro (~2 min)' },
      ],
    },
  };

  const musicProviderSelect = document.getElementById('sb-music-provider-select');
  const musicModelSelect = document.getElementById('sb-music-model-select');
  const musicApiKeyInput = document.getElementById('sb-music-api-key');
  const musicKeyLink = document.getElementById('sb-music-key-link');

  function updateMusicModelSelect() {
    const provider = musicProviderSelect.value;
    const config = MUSIC_GEN_PROVIDERS[provider];
    if (!config) return;
    musicModelSelect.innerHTML = config.models
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
    musicApiKeyInput.placeholder = config.keyPlaceholder || 'Enter your API key';
    musicKeyLink.href = config.apiKeyUrl;
    chrome.storage.local.get(`sb_music_key_${provider}`, (data) => {
      musicApiKeyInput.value = data[`sb_music_key_${provider}`] || '';
    });
    chrome.storage.local.get(`sb_music_model_${provider}`, (data) => {
      if (data[`sb_music_model_${provider}`]) musicModelSelect.value = data[`sb_music_model_${provider}`];
    });
  }

  musicProviderSelect.addEventListener('change', () => {
    chrome.storage.local.set({ sb_music_provider: musicProviderSelect.value });
    updateMusicModelSelect();
  });

  musicModelSelect.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_music_model_${musicProviderSelect.value}`]: musicModelSelect.value });
  });

  musicApiKeyInput.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_music_key_${musicProviderSelect.value}`]: musicApiKeyInput.value });
  });

  // Load music gen provider on init
  chrome.storage.local.get('sb_music_provider', (data) => {
    if (data.sb_music_provider) musicProviderSelect.value = data.sb_music_provider;
    updateMusicModelSelect();
  });

  document.getElementById('sb-test-music-gen').addEventListener('click', async () => {
    const btn = document.getElementById('sb-test-music-gen');
    const status = document.getElementById('sb-test-music-gen-status');
    btn.textContent = 'Testing...';
    btn.disabled = true;
    status.textContent = '';
    status.className = 'sb-test-status';
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'music-test',
        provider: musicProviderSelect.value,
        apiKey: musicApiKeyInput.value,
      });
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      if (result.valid) {
        status.textContent = 'Connected';
        status.className = 'sb-test-status sb-test-success';
      } else {
        status.textContent = result.error || 'Failed';
        status.className = 'sb-test-status sb-test-error';
      }
    } catch (e) {
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      status.textContent = e.message;
      status.className = 'sb-test-status sb-test-error';
    }
    setTimeout(() => { status.textContent = ''; status.className = 'sb-test-status'; }, 10000);
  });

  // --- Last.fm API key ---
  const lastfmApiKeyInput = document.getElementById('sb-lastfm-api-key');
  chrome.storage.local.get('sb_apiKey_lastfm', (data) => {
    if (data.sb_apiKey_lastfm) lastfmApiKeyInput.value = data.sb_apiKey_lastfm;
  });
  lastfmApiKeyInput.addEventListener('change', () => {
    chrome.storage.local.set({ sb_apiKey_lastfm: lastfmApiKeyInput.value });
  });
  document.getElementById('sb-test-lastfm').addEventListener('click', async () => {
    const btn = document.getElementById('sb-test-lastfm');
    const status = document.getElementById('sb-test-lastfm-status');
    btn.textContent = 'Testing...';
    btn.disabled = true;
    status.textContent = '';
    status.className = 'sb-test-status';
    try {
      const key = lastfmApiKeyInput.value.trim();
      if (!key) throw new Error('No API key entered');
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getTopTags&artist=Radiohead&api_key=${key}&format=json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || 'Invalid API key');
      const tagCount = data.toptags?.tag?.length || 0;
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      status.textContent = `Connected (${tagCount} tags found)`;
      status.className = 'sb-test-status sb-test-success';
    } catch (e) {
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      status.textContent = e.message;
      status.className = 'sb-test-status sb-test-error';
    }
    setTimeout(() => { status.textContent = ''; status.className = 'sb-test-status'; }, 10000);
  });

  // --- Album art generation provider settings ---
  const IMAGE_GEN_PROVIDERS = {
    imagen: {
      displayName: 'Nano Banana (Google AI)',
      apiKeyUrl: 'https://aistudio.google.com/apikey',
      keyPlaceholder: 'AIza...',
      models: [
        { id: 'imagen-4.0-generate-001', name: 'Nano Banana 4' },
        { id: 'imagen-4.0-fast-generate-001', name: 'Nano Banana 4 Fast' },
        { id: 'imagen-4.0-ultra-generate-001', name: 'Nano Banana 4 Ultra' },
      ],
    },
  };

  const imageProviderSelect = document.getElementById('sb-image-provider-select');
  const imageModelSelect = document.getElementById('sb-image-model-select');
  const imageApiKeyInput = document.getElementById('sb-image-api-key');
  const imageKeyLink = document.getElementById('sb-image-key-link');

  function updateImageModelSelect() {
    const provider = imageProviderSelect.value;
    const config = IMAGE_GEN_PROVIDERS[provider];
    if (!config) return;
    imageModelSelect.innerHTML = config.models
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
    imageApiKeyInput.placeholder = config.keyPlaceholder || 'Enter your API key';
    imageKeyLink.href = config.apiKeyUrl;
    chrome.storage.local.get(`sb_image_key_${provider}`, (data) => {
      imageApiKeyInput.value = data[`sb_image_key_${provider}`] || '';
    });
    chrome.storage.local.get(`sb_image_model_${provider}`, (data) => {
      if (data[`sb_image_model_${provider}`]) {
        imageModelSelect.value = data[`sb_image_model_${provider}`];
      } else {
        chrome.storage.local.set({ [`sb_image_model_${provider}`]: imageModelSelect.value });
      }
    });
  }

  imageProviderSelect.addEventListener('change', () => {
    chrome.storage.local.set({ sb_image_provider: imageProviderSelect.value });
    updateImageModelSelect();
  });

  imageModelSelect.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_image_model_${imageProviderSelect.value}`]: imageModelSelect.value });
  });

  imageApiKeyInput.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_image_key_${imageProviderSelect.value}`]: imageApiKeyInput.value });
  });

  chrome.storage.local.get('sb_image_provider', (data) => {
    if (data.sb_image_provider) {
      imageProviderSelect.value = data.sb_image_provider;
    } else {
      chrome.storage.local.set({ sb_image_provider: imageProviderSelect.value });
    }
    updateImageModelSelect();
  });

  document.getElementById('sb-test-image-gen').addEventListener('click', async () => {
    const btn = document.getElementById('sb-test-image-gen');
    const status = document.getElementById('sb-test-image-gen-status');
    btn.textContent = 'Testing...';
    btn.disabled = true;
    status.textContent = '';
    status.className = 'sb-test-status';
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'image-test',
        provider: imageProviderSelect.value,
        apiKey: imageApiKeyInput.value,
      });
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      if (result.valid) {
        status.textContent = 'Connected';
        status.className = 'sb-test-status sb-test-success';
      } else {
        status.textContent = result.error || 'Failed';
        status.className = 'sb-test-status sb-test-error';
      }
    } catch (e) {
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      status.textContent = e.message;
      status.className = 'sb-test-status sb-test-error';
    }
    setTimeout(() => { status.textContent = ''; status.className = 'sb-test-status'; }, 10000);
  });

  // --- Video generation provider settings ---
  const VIDEO_GEN_PROVIDERS = {
    veo: {
      displayName: 'Veo (Google AI)',
      apiKeyUrl: 'https://aistudio.google.com/apikey',
      keyPlaceholder: 'AIza...',
      models: [
        { id: 'veo-3.1-generate-preview', name: 'Veo 3.1 (Preview)' },
        { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast (Preview)' },
        { id: 'veo-3.0-generate-001', name: 'Veo 3' },
        { id: 'veo-3.0-fast-generate-001', name: 'Veo 3 Fast' },
        { id: 'veo-2.0-generate-001', name: 'Veo 2' },
      ],
    },
  };

  const videoProviderSelect = document.getElementById('sb-video-provider-select');
  const videoModelSelect = document.getElementById('sb-video-model-select');
  const videoApiKeyInput = document.getElementById('sb-video-api-key');
  const videoKeyLink = document.getElementById('sb-video-key-link');

  function updateVideoModelSelect() {
    const provider = videoProviderSelect.value;
    const config = VIDEO_GEN_PROVIDERS[provider];
    if (!config) return;
    videoModelSelect.innerHTML = config.models
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
    videoApiKeyInput.placeholder = config.keyPlaceholder || 'Enter your API key';
    videoKeyLink.href = config.apiKeyUrl;
    chrome.storage.local.get(`sb_video_key_${provider}`, (data) => {
      videoApiKeyInput.value = data[`sb_video_key_${provider}`] || '';
    });
    chrome.storage.local.get(`sb_video_model_${provider}`, (data) => {
      if (data[`sb_video_model_${provider}`]) {
        videoModelSelect.value = data[`sb_video_model_${provider}`];
      } else {
        chrome.storage.local.set({ [`sb_video_model_${provider}`]: videoModelSelect.value });
      }
    });
  }

  videoProviderSelect.addEventListener('change', () => {
    chrome.storage.local.set({ sb_video_provider: videoProviderSelect.value });
    updateVideoModelSelect();
  });

  videoModelSelect.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_video_model_${videoProviderSelect.value}`]: videoModelSelect.value });
  });

  videoApiKeyInput.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_video_key_${videoProviderSelect.value}`]: videoApiKeyInput.value });
  });

  chrome.storage.local.get('sb_video_provider', (data) => {
    if (data.sb_video_provider) {
      videoProviderSelect.value = data.sb_video_provider;
    } else {
      chrome.storage.local.set({ sb_video_provider: videoProviderSelect.value });
    }
    updateVideoModelSelect();
  });

  document.getElementById('sb-test-video-gen').addEventListener('click', async () => {
    const btn = document.getElementById('sb-test-video-gen');
    const status = document.getElementById('sb-test-video-gen-status');
    btn.textContent = 'Testing...';
    btn.disabled = true;
    status.textContent = '';
    status.className = 'sb-test-status';
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'video-test',
        provider: videoProviderSelect.value,
        apiKey: videoApiKeyInput.value,
      });
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      if (result.valid) {
        status.textContent = 'Connected';
        status.className = 'sb-test-status sb-test-success';
      } else {
        status.textContent = result.error || 'Failed';
        status.className = 'sb-test-status sb-test-error';
      }
    } catch (e) {
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      status.textContent = e.message;
      status.className = 'sb-test-status sb-test-error';
    }
    setTimeout(() => { status.textContent = ''; status.className = 'sb-test-status'; }, 10000);
  });

  // --- Test connection ---
  document.getElementById('sb-test-connection').addEventListener('click', async () => {
    const btn = document.getElementById('sb-test-connection');
    const status = document.getElementById('sb-test-status');
    btn.textContent = 'Testing...';
    btn.disabled = true;
    status.textContent = '';
    status.className = 'sb-test-status';
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'llm-test',
        provider: providerSelect.value,
        apiKey: apiKeyInput.value,
      });
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      if (response.success) {
        status.textContent = 'Connected';
        status.className = 'sb-test-status sb-test-success';
      } else {
        status.textContent = response.error || 'Failed';
        status.className = 'sb-test-status sb-test-error';
      }
      setTimeout(() => { status.textContent = ''; status.className = 'sb-test-status'; }, 10000);
    } catch (e) {
      btn.textContent = 'Test Connection';
      btn.disabled = false;
      status.textContent = e.message;
      status.className = 'sb-test-status sb-test-error';
      setTimeout(() => { status.textContent = ''; status.className = 'sb-test-status'; }, 10000);
    }
  });

  // --- Spotify OAuth ---
  const spotifyClientIdInput = document.getElementById('sb-spotify-client-id');
  const spotifyLoginBtn = document.getElementById('sb-spotify-login');
  const spotifyLogoutBtn = document.getElementById('sb-spotify-logout');
  const spotifyAuthStatus = document.getElementById('sb-spotify-auth-status');
  const redirectUriEl = document.getElementById('sb-redirect-uri');

  // Fetch the redirect URI from the service worker (chrome.identity isn't available in content scripts)
  chrome.runtime.sendMessage({ type: 'get-redirect-uri' }, (uri) => {
    if (uri) {
      redirectUriEl.textContent = uri;
      redirectUriEl.addEventListener('click', () => {
        navigator.clipboard.writeText(uri);
        redirectUriEl.textContent = 'Copied!';
        setTimeout(() => { redirectUriEl.textContent = uri; }, 2000);
      });
    }
  });

  // Hide helper hints when values are already set
  function updateHintVisibility() {
    const spotifyHint = document.getElementById('sb-spotify-hint');
    const apiKeyHint = document.getElementById('sb-api-key-hint');
    if (spotifyHint) spotifyHint.style.display = spotifyClientIdInput.value.trim() ? 'none' : '';
    if (apiKeyHint) apiKeyHint.style.display = apiKeyInput.value.trim() ? 'none' : '';
  }

  spotifyClientIdInput.addEventListener('input', updateHintVisibility);
  apiKeyInput.addEventListener('input', updateHintVisibility);

  // Load saved client ID
  chrome.storage.local.get('spotifyClientId', (result) => {
    if (result.spotifyClientId) spotifyClientIdInput.value = result.spotifyClientId;
    updateHintVisibility();
  });

  spotifyClientIdInput.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'spotify-set-client-id', clientId: spotifyClientIdInput.value.trim() });
  });

  // Check auth status on load
  function updateSpotifyAuthUI(loggedIn) {
    if (loggedIn) {
      spotifyLoginBtn.style.display = 'none';
      spotifyLogoutBtn.style.display = 'inline-block';
      spotifyAuthStatus.textContent = 'Connected';
      spotifyAuthStatus.style.color = '#1DB954';
    } else {
      spotifyLoginBtn.style.display = 'inline-block';
      spotifyLogoutBtn.style.display = 'none';
      spotifyAuthStatus.textContent = 'Not connected';
      spotifyAuthStatus.style.color = '#b3b3b3';
    }
  }

  chrome.runtime.sendMessage({ type: 'spotify-auth-status-check' }, (response) => {
    if (response) updateSpotifyAuthUI(response.loggedIn);
  });

  spotifyLoginBtn.addEventListener('click', async () => {
    if (!spotifyClientIdInput.value.trim()) {
      spotifyAuthStatus.textContent = 'Enter Client ID first';
      spotifyAuthStatus.style.color = '#e74c3c';
      return;
    }
    // Save client ID first
    await chrome.runtime.sendMessage({ type: 'spotify-set-client-id', clientId: spotifyClientIdInput.value.trim() });

    spotifyLoginBtn.textContent = 'Connecting...';
    spotifyLoginBtn.disabled = true;
    const response = await chrome.runtime.sendMessage({ type: 'spotify-login' });
    spotifyLoginBtn.textContent = 'Connect Spotify';
    spotifyLoginBtn.disabled = false;

    if (response?.success) {
      updateSpotifyAuthUI(true);
    } else {
      spotifyAuthStatus.textContent = response?.error || 'Login failed';
      spotifyAuthStatus.style.color = '#e74c3c';
    }
  });

  spotifyLogoutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'spotify-logout' });
    updateSpotifyAuthUI(false);
  });

  // --- Conversation management ---
  function newConversation() {
    const conv = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: 'New Chat',
      messages: [],
      created: Date.now(),
    };
    conversations.unshift(conv);
    currentConvId = conv.id;
    renderMessages();
    saveConversations();
    return conv;
  }

  function getCurrentConv() {
    return conversations.find((c) => c.id === currentConvId);
  }

  function renderMessages() {
    const conv = getCurrentConv();
    if (!conv || conv.messages.length === 0) {
      welcomeEl.style.display = 'flex';
      // Clear any message elements except welcome
      Array.from(messagesEl.children).forEach((el) => {
        if (el !== welcomeEl) el.remove();
      });
      return;
    }
    welcomeEl.style.display = 'none';
    // Rebuild messages — clear everything except welcome, then re-add
    Array.from(messagesEl.children).forEach((el) => {
      if (el !== welcomeEl) el.remove();
    });
    const frag = document.createDocumentFragment();
    conv.messages.forEach((msg, i) => {
      frag.appendChild(createMessageEl(msg, i));
    });
    messagesEl.appendChild(frag);
    scrollToBottom();
  }

  function createMessageEl(msg, index) {
    const div = document.createElement('div');
    div.className = `sb-msg sb-msg-${msg.role}`;
    div.dataset.index = index;

    if (msg.role === 'user') {
      div.textContent = msg.content;
    } else {
      // Render persisted tool call pills above the message content
      if (msg.toolCalls?.length) {
        const toolDiv = document.createElement('div');
        toolDiv.className = 'sb-tool-status';
        for (const tc of msg.toolCalls) {
          const pill = document.createElement('div');
          if (tc.status === 'done') {
            pill.className = 'sb-tool-pill sb-tool-done';
            pill.textContent = `✓ ${formatToolName(tc.name)}`;
          } else if (tc.status === 'error') {
            pill.className = 'sb-tool-pill sb-tool-error';
            pill.textContent = `✗ ${formatToolName(tc.name)}${tc.error ? ': ' + tc.error : ''}`;
          } else if (tc.status === 'cancelled') {
            pill.className = 'sb-tool-pill sb-tool-error';
            pill.textContent = `⊘ ${formatToolName(tc.name)} (cancelled)`;
          } else {
            pill.className = 'sb-tool-pill sb-tool-done';
            pill.textContent = `✓ ${formatToolName(tc.name)}`;
          }
          toolDiv.appendChild(pill);
        }
        div.appendChild(toolDiv);
      }

      const contentDiv = document.createElement('div');
      contentDiv.className = 'sb-msg-content';
      contentDiv.innerHTML = renderMarkdown(msg.content);
      div.appendChild(contentDiv);
    }
    return div;
  }

  function scrollToBottom() {
    if (!userHasScrolled) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  messagesEl.addEventListener('scroll', () => {
    const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 50;
    userHasScrolled = !atBottom;
  });

  // --- Spotify link click-to-play ---
  messagesEl.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('spotify:')) return;
    e.preventDefault();
    e.stopPropagation();
    if (href.startsWith('spotify:track:')) {
      // Direct play by URI
      chrome.runtime.sendMessage({
        type: 'spotify-control',
        action: 'play',
        params: { uri: href },
      }, (r) => {
        if (!r?.success) console.warn('[Spotify Brainer] Play failed:', r?.error);
      });
    } else if (href.startsWith('spotify:search:')) {
      // Search then play first result
      const query = decodeURIComponent(href.replace('spotify:search:', ''));
      chrome.runtime.sendMessage({
        type: 'spotify-control',
        action: 'search',
        params: { query, types: ['track'], limit: 1 },
      }, (r) => {
        if (r?.success && r.data?.tracks?.items?.length) {
          const track = r.data.tracks.items[0];
          chrome.runtime.sendMessage({
            type: 'spotify-control',
            action: 'play',
            params: { uri: track.uri },
          });
        } else {
          console.warn('[Spotify Brainer] Search play failed:', r?.error || 'No results');
        }
      });
    } else if (href.startsWith('spotify:album:') || href.startsWith('spotify:playlist:') || href.startsWith('spotify:artist:')) {
      // Play context (album, playlist, artist)
      chrome.runtime.sendMessage({
        type: 'spotify-control',
        action: 'play',
        params: { contextUri: href },
      }, (r) => {
        if (!r?.success) console.warn('[Spotify Brainer] Play failed:', r?.error);
      });
    }
  });

  // --- Conversation list ---
  document.getElementById('sb-btn-history').addEventListener('click', () => {
    showingConvList = !showingConvList;
    convListEl.classList.toggle('open', showingConvList);
    // No highlight for conversations button
    if (showingConvList) renderConvList();
  });

  function exportConversation(conv) {
    const lines = [];
    lines.push(`# ${conv.title}`);
    lines.push(`Exported from Spotify Brainer on ${new Date().toLocaleDateString()}`);
    lines.push('');

    for (const msg of conv.messages) {
      if (msg.role === 'user') {
        lines.push(`## You`);
        lines.push(msg.content);
        lines.push('');
      } else if (msg.role === 'assistant') {
        lines.push(`## Spotify Brainer`);
        lines.push(msg.content);
        lines.push('');
      }
    }

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'chat'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderConvList() {
    // Filter out empty conversations
    const visible = conversations.filter((c) => c.messages.length > 0);
    if (visible.length === 0) {
      convListEl.innerHTML = '<div class="sb-conv-item" style="color:#535353;cursor:default;">No conversations yet</div>';
      return;
    }
    convListEl.innerHTML = visible
      .map((c) => {
        const msgCount = c.messages.filter((m) => m.role === 'user').length;
        const label = msgCount === 1 ? '1 message' : `${msgCount} messages`;
        return `
      <div class="sb-conv-item ${c.id === currentConvId ? 'active' : ''}" data-id="${c.id}">
        <div class="sb-conv-item-row">
          <div class="sb-conv-item-info">
            <div class="sb-conv-item-title">${escapeHtml(c.title)}</div>
            <div class="sb-conv-item-date">${label}</div>
          </div>
          <button class="sb-conv-export-btn" data-export-id="${c.id}" title="Export">${ICONS.export}</button>
          <button class="sb-conv-delete-btn" data-delete-id="${c.id}" title="Delete">${ICONS.trash}</button>
        </div>
      </div>`;
      })
      .join('');

    // Click to switch
    convListEl.querySelectorAll('.sb-conv-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Don't switch if clicking delete or export
        if (e.target.closest('.sb-conv-delete-btn') || e.target.closest('.sb-conv-export-btn')) return;
        currentConvId = el.dataset.id;
        renderMessages();
        showingConvList = false;
        convListEl.classList.remove('open');
        if (activePanel !== 'chat') showPanel('chat');
      });
    });

    // Click to export
    convListEl.querySelectorAll('.sb-conv-export-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const conv = conversations.find((c) => c.id === btn.dataset.exportId);
        if (conv) exportConversation(conv);
      });
    });

    // Click to delete
    convListEl.querySelectorAll('.sb-conv-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteId;
        conversations = conversations.filter((c) => c.id !== id);
        if (currentConvId === id) {
          if (conversations.length > 0) {
            currentConvId = conversations[0].id;
          } else {
            newConversation();
          }
          renderMessages();
        }
        saveConversations();
        renderConvList();
      });
    });
  }

  // --- New chat ---
  document.getElementById('sb-btn-new').addEventListener('click', () => {
    // Don't create a new chat if the current one is already empty
    const current = getCurrentConv();
    if (current && current.messages.length === 0) {
      showPanel('chat');
      return;
    }
    newConversation();
    showPanel('chat');
  });

  // --- Refresh context ---
  document.getElementById('sb-btn-refresh').addEventListener('click', () => {
    // Reset progress state
    loadStepsState = [];
    loadStepsEl.innerHTML = '';
    progressBarFill.style.width = '0%';
    progressBarTrack.style.display = 'block';
    contextDot.classList.add('loading');
    contextText.textContent = 'Refreshing all Spotify data...';
    loadStepsExpanded = true;
    loadStepsEl.classList.add('expanded');
    contextExpand.innerHTML = '&#9650;';
    chrome.runtime.sendMessage({ type: 'refresh-spotify-data' });
  });

  // --- Send message ---
  async function sendMessage(text) {
    if (!text.trim() || isGenerating) return;

    let conv = getCurrentConv();
    if (!conv) conv = newConversation();

    // Add user message
    conv.messages.push({ role: 'user', content: text.trim(), timestamp: Date.now() });
    if (conv.messages.length === 1) {
      conv.title = text.trim().slice(0, 50);
    }
    welcomeEl.style.display = 'none';
    messagesEl.appendChild(createMessageEl(conv.messages[conv.messages.length - 1], conv.messages.length - 1));
    scrollToBottom();
    inputEl.value = '';
    autoResizeInput();

    // Start generation
    isGenerating = true;
    sendBtn.style.display = 'none';
    stopBtn.classList.add('visible');
    userHasScrolled = false;

    // Add typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'sb-typing';
    typingEl.id = 'sb-typing';
    typingEl.innerHTML = '<div class="sb-typing-dot"></div><div class="sb-typing-dot"></div><div class="sb-typing-dot"></div>';
    messagesEl.appendChild(typingEl);
    scrollToBottom();

    // Prepare assistant message
    const assistantMsg = { role: 'assistant', content: '', timestamp: Date.now(), toolCalls: [] };
    conv.messages.push(assistantMsg);

    try {
      // Get settings — use the provider value we know, fetch all possibly-relevant keys
      const provider = providerSelect.value || 'anthropic';
      const settings = await chrome.storage.local.get([
        'sb_provider', `sb_apiKey_${provider}`,
      ]);
      const apiKey = settings[`sb_apiKey_${provider}`];

      if (!apiKey) {
        throw new Error('No API key set. Open Settings to configure.');
      }
      // Open port for streaming
      const port = chrome.runtime.connect({ name: 'llm-stream' });
      abortController = { abort: () => port.disconnect() };

      let assistantEl = null;
      let contentEl = null;

      let toolStatusEl = null; // Container for tool execution status pills
      let toolRoundId = 0; // Unique ID per tool round to scope pill queries

      port.onMessage.addListener((chunk) => {
        if (chunk.type === 'text') {
          // Remove typing indicator on first token
          const typing = document.getElementById('sb-typing');
          if (typing) typing.remove();
          // Detach tool status ref so new tool rounds get a fresh container,
          // but keep the element in the DOM so completed pills remain visible.
          toolStatusEl = null;

          assistantMsg.content += chunk.content;

          if (!assistantEl) {
            assistantEl = createMessageEl(assistantMsg, conv.messages.length - 1);
            messagesEl.appendChild(assistantEl);
            contentEl = assistantEl.querySelector('.sb-msg-content');
          } else {
            contentEl.innerHTML = renderMarkdown(assistantMsg.content);
          }
          scrollToBottom();
        } else if (chunk.type === 'tool_use_start') {
          // Show a status pill for the tool being called
          const typing = document.getElementById('sb-typing');
          if (typing) typing.remove();

          if (!toolStatusEl) {
            toolRoundId++;
            toolStatusEl = document.createElement('div');
            toolStatusEl.className = 'sb-tool-status';
            toolStatusEl.dataset.round = toolRoundId;
            messagesEl.appendChild(toolStatusEl);
          }
          const pill = document.createElement('div');
          pill.className = 'sb-tool-pill sb-tool-pending';
          pill.dataset.tool = chunk.toolName;
          pill.dataset.round = toolRoundId;
          pill.textContent = `⏳ ${formatToolName(chunk.toolName)}...`;
          toolStatusEl.appendChild(pill);

          // Persist to message data
          assistantMsg.toolCalls.push({ name: chunk.toolName, status: 'pending' });

          scrollToBottom();
        } else if (chunk.type === 'tool_status') {
          // Update the pill for this tool — scoped to the current round so we don't
          // accidentally update pills from previous messages with the same tool name.
          const pill = messagesEl.querySelector(`.sb-tool-pill[data-round="${toolRoundId}"][data-tool="${chunk.toolName}"]`);
          if (pill) {
            if (chunk.status === 'executing') {
              pill.textContent = `⚡ ${formatToolName(chunk.toolName)}...`;
              pill.className = 'sb-tool-pill sb-tool-executing';
            } else if (chunk.status === 'done') {
              pill.textContent = `✓ ${formatToolName(chunk.toolName)}`;
              pill.className = 'sb-tool-pill sb-tool-done';
            } else if (chunk.status === 'error') {
              pill.textContent = `✗ ${formatToolName(chunk.toolName)}: ${chunk.result}`;
              pill.className = 'sb-tool-pill sb-tool-error';
            }
          }

          // Persist status to message data
          const tc = [...assistantMsg.toolCalls].reverse().find(t => t.name === chunk.toolName && t.status !== 'done' && t.status !== 'error');
          if (tc) {
            tc.status = chunk.status === 'done' ? 'done' : chunk.status === 'error' ? 'error' : tc.status;
            if (chunk.status === 'error') tc.error = chunk.result;
          }
          scrollToBottom();
        } else if (chunk.type === 'done') {
          // Mark any leftover pending/executing pills as cancelled
          messagesEl.querySelectorAll('.sb-tool-pending, .sb-tool-executing').forEach((pill) => {
            pill.textContent = `⊘ ${formatToolName(pill.dataset.tool)} (cancelled)`;
            pill.className = 'sb-tool-pill sb-tool-error';
          });
          // Persist cancelled state
          for (const tc of assistantMsg.toolCalls) {
            if (tc.status === 'pending' || tc.status === 'executing') tc.status = 'cancelled';
          }
          toolStatusEl = null;
          finishGeneration();
          if (chunk.usage) {
            tokenCounter.textContent = `${chunk.usage.inputTokens} in / ${chunk.usage.outputTokens} out`;
          }
        } else if (chunk.type === 'error') {
          const typing = document.getElementById('sb-typing');
          if (typing) typing.remove();
          // Mark any leftover pending/executing pills as cancelled
          messagesEl.querySelectorAll('.sb-tool-pending, .sb-tool-executing').forEach((pill) => {
            pill.textContent = `⊘ ${formatToolName(pill.dataset.tool)} (cancelled)`;
            pill.className = 'sb-tool-pill sb-tool-error';
          });
          // Persist cancelled state
          for (const tc of assistantMsg.toolCalls) {
            if (tc.status === 'pending' || tc.status === 'executing') tc.status = 'cancelled';
          }
          toolStatusEl = null;
          showError(chunk.content, 'LLM Response');
          conv.messages.pop();
          finishGeneration();
        }
      });

      port.onDisconnect.addListener(() => {
        finishGeneration();
      });

      // Send the request
      port.postMessage({
        type: 'llm-stream',
        provider,
        apiKey,
        messages: conv.messages.slice(0, -1), // Don't include the empty assistant msg
      });
    } catch (e) {
      const typing = document.getElementById('sb-typing');
      if (typing) typing.remove();
      showError(e.message, 'Send Message');
      conv.messages.pop();
      finishGeneration();
    }

    saveConversations();
  }

  function formatToolName(name) {
    const map = {
      play_track: 'Playing',
      pause: 'Pausing',
      skip_next: 'Skipping',
      skip_previous: 'Going back',
      seek: 'Seeking',
      set_volume: 'Setting volume',
      set_shuffle: 'Toggling shuffle',
      set_repeat: 'Setting repeat',
      add_to_queue: 'Adding to queue',
      search: 'Searching',
      get_devices: 'Getting devices',
      transfer_playback: 'Transferring playback',
      add_to_playlist: 'Adding to playlist',
      create_playlist: 'Creating playlist',
      save_tracks: 'Saving tracks',
      remove_saved_tracks: 'Removing tracks',
      get_track_credits: 'Looking up credits',
    };
    return map[name] || name;
  }

  function finishGeneration() {
    isGenerating = false;
    sendBtn.style.display = 'flex';
    stopBtn.classList.remove('visible');
    abortController = null;
    const typing = document.getElementById('sb-typing');
    if (typing) typing.remove();
    saveConversations();
  }

  // --- Stop generation ---
  stopBtn.addEventListener('click', () => {
    if (abortController) abortController.abort();
    finishGeneration();
  });

  // --- Input handling ---
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

  function autoResizeInput() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  inputEl.addEventListener('input', autoResizeInput);

  // --- Quick actions ---
  document.getElementById('sb-quick-actions').addEventListener('click', (e) => {
    const btn = e.target.closest('.sb-quick-btn');
    if (btn) sendMessage(btn.dataset.prompt);
  });

  // --- Markdown rendering (lightweight) ---
  // Use marked.js for proper markdown rendering
  // Configure marked.js for markdown rendering with spotify: protocol support
  const markedInstance = typeof marked !== 'undefined' ? marked : null;
  if (markedInstance) {
    // Custom renderer to allow spotify: URIs in links
    const renderer = new markedInstance.Renderer();
    const originalLink = renderer.link;
    renderer.link = function ({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      // Allow spotify: protocol links
      if (href && href.startsWith('spotify:')) {
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}"${titleAttr}>${text}</a>`;
      }
      // Default behavior for other links
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener"${titleAttr}>${text}</a>`;
    };

    markedInstance.setOptions({
      breaks: true,
      gfm: true,
      renderer,
    });
  }

  function renderMarkdown(text) {
    if (!text) return '';
    if (markedInstance?.parse) {
      return markedInstance.parse(text);
    }
    // Fallback: plain text with line breaks
    return '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Error display (console + UI) ---
  function showError(message, context = '') {
    const fullMsg = context ? `[${context}] ${message}` : message;
    console.error(`[Spotify Brainer] ${fullMsg}`);

    const errorEl = document.createElement('div');
    errorEl.className = 'sb-error';
    errorEl.innerHTML = `
      <div class="sb-error-row">
        <span class="sb-error-text">${escapeHtml(message)}</span>
        <button class="sb-error-dismiss" title="Dismiss">&times;</button>
      </div>
      ${context ? `<div class="sb-error-context">${escapeHtml(context)}</div>` : ''}
    `;
    errorEl.querySelector('.sb-error-dismiss').addEventListener('click', () => {
      errorEl.style.opacity = '0';
      setTimeout(() => errorEl.remove(), 200);
    });
    messagesEl.appendChild(errorEl);
    scrollToBottom();

    // Auto-dismiss after 15s
    setTimeout(() => {
      if (errorEl.parentNode) {
        errorEl.style.opacity = '0';
        setTimeout(() => errorEl.remove(), 200);
      }
    }, 10000);

    return errorEl;
  }

  // --- Persistence ---
  function saveConversations() {
    chrome.storage.local.set({ sb_conversations: conversations, sb_currentConvId: currentConvId });
  }

  async function loadState() {
    const data = await chrome.storage.local.get([
      'sb_isOpen', 'sb_panelWidth', 'sb_conversations', 'sb_currentConvId', 'sb_provider',
    ]);
    if (data.sb_panelWidth) {
      panelWidth = data.sb_panelWidth;
      panel.style.width = panelWidth + 'px';
    }
    if (data.sb_provider) {
      providerSelect.value = data.sb_provider;
    }
    updateProviderSettings();
    if (data.sb_conversations) {
      conversations = data.sb_conversations;
    }
    if (data.sb_currentConvId) {
      currentConvId = data.sb_currentConvId;
    } else if (conversations.length === 0) {
      newConversation();
    } else {
      currentConvId = conversations[0].id;
    }
    renderMessages();
    if (data.sb_isOpen) {
      togglePanel();
    }
  }

  // --- Bridge: relay DOM scrape data from MAIN world scraper to chrome.runtime ---
  const MSG_PREFIX = 'spotify-brainer:';
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.type?.startsWith(MSG_PREFIX)) return;
    const innerType = e.data.type.replace(MSG_PREFIX, '');
    if (innerType === 'dom-data') {
      chrome.runtime.sendMessage({ type: 'spotify-dom-data', data: e.data.data });
    }
    if (innerType === 'credits-result') {
      // Resolve the pending credits promise
      if (pendingCreditsResolve) {
        pendingCreditsResolve(e.data.data);
        pendingCreditsResolve = null;
      }
    }
  });

  // Credits scraping bridge
  let pendingCreditsResolve = null;

  function requestCreditsScrape(trackId) {
    return new Promise((resolve) => {
      pendingCreditsResolve = resolve;
      window.postMessage({ type: `${MSG_PREFIX}scrape-credits`, trackId: trackId || null }, '*');
      // Timeout after 20s (navigation-based scraping can take longer)
      setTimeout(() => {
        if (pendingCreditsResolve) {
          pendingCreditsResolve(null);
          pendingCreditsResolve = null;
        }
      }, 20000);
    });
  }

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'scrape-credits') {
      requestCreditsScrape(msg.trackId).then(credits => sendResponse({ credits }));
      return true; // async response
    }
    if (msg.type === 'music-gen-progress' && _genSetStatus) {
      _genSetStatus(msg.step);
    }
    if (msg.type === 'music-gen-albumart' && _genOnAlbumArt) {
      _genOnAlbumArt(msg.albumArt);
    }
  });

  // --- Progress tracking state ---
  let loadStepsExpanded = false;
  let loadStepsState = []; // [{id, label, status, detail}]
  const progressBarFill = document.getElementById('sb-progress-bar-fill');
  const progressBarTrack = document.getElementById('sb-progress-bar-track');
  const loadStepsEl = document.getElementById('sb-load-steps');
  const contextExpand = document.getElementById('sb-context-expand');

  contextExpand.addEventListener('click', () => {
    loadStepsExpanded = !loadStepsExpanded;
    loadStepsEl.classList.toggle('expanded', loadStepsExpanded);
    contextExpand.innerHTML = loadStepsExpanded ? '&#9650;' : '&#9660;';
  });

  function saveProgressState(summary) {
    chrome.storage.local.set({
      sb_loadSteps: loadStepsState,
      sb_loadSummary: summary || contextText.textContent,
    });
  }

  // Restore progress state on load
  chrome.storage.local.get(['sb_loadSteps', 'sb_loadSummary'], (data) => {
    if (data.sb_loadSteps?.length) {
      loadStepsState = data.sb_loadSteps;
      renderLoadSteps();
    }
    if (data.sb_loadSummary) {
      contextText.textContent = data.sb_loadSummary;
    }
  });

  function renderLoadSteps() {
    loadStepsEl.innerHTML = loadStepsState.map((step) => {
      const icon = step.status === 'done' ? '&#10003;'
        : step.status === 'error' ? '&#10007;'
        : step.status === 'loading' ? '<span class="sb-step-spinner"></span>'
        : step.status === 'skipped' ? '&#8212;'
        : '&#9679;';
      const statusClass = `sb-step-${step.status}`;
      return `<div class="sb-load-step ${statusClass}">
        <span class="sb-step-icon">${icon}</span>
        <span class="sb-step-label">${step.label}</span>
        ${step.detail ? `<span class="sb-step-detail">${escapeHtml(step.detail)}</span>` : ''}
      </div>`;
    }).join('');
  }

  // --- Listen for spotify data updates from background ---
  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg.type === 'spotify-load-progress') {
      // Initialize steps array on first message
      if (msg.steps && loadStepsState.length === 0) {
        loadStepsState = msg.steps.map((s) => ({ ...s, status: 'pending', detail: '' }));
      }

      // Update the specific step (ignore if steps not initialized yet)
      if (loadStepsState.length === 0 && !msg.steps) return;
      if (loadStepsState[msg.step]) {
        loadStepsState[msg.step].status = msg.status;
        loadStepsState[msg.step].detail = msg.detail || '';
      }

      // Update progress bar
      const doneCount = loadStepsState.filter((s) => s.status === 'done' || s.status === 'skipped').length;
      const pct = Math.round((doneCount / msg.totalSteps) * 100);
      progressBarFill.style.width = pct + '%';
      progressBarTrack.style.display = 'block';

      // Only update context bar text/spinner during active loading
      if (msg.status === 'loading') {
        contextDot.classList.add('loading');
        contextText.textContent = msg.stepLabel + (msg.detail ? ` — ${msg.detail}` : '');
      }

      // Auto-expand on first load
      if (!loadStepsExpanded && msg.step === 0 && msg.status === 'loading') {
        loadStepsExpanded = true;
        loadStepsEl.classList.add('expanded');
        contextExpand.innerHTML = '&#9650;';
      }

      renderLoadSteps();
      saveProgressState();

      // If all steps are done (e.g. post-import update), clear loading state
      if (doneCount === msg.totalSteps) {
        contextDot.classList.remove('loading');
      }
    }

    if (msg.type === 'spotify-load-complete') {
      contextDot.classList.remove('loading');
      contextText.textContent = msg.summary || 'All data loaded';
      progressBarFill.style.width = '100%';
      saveProgressState(msg.summary);

      // Keep steps data so user can re-expand to review — just auto-collapse
      setTimeout(() => {
        loadStepsExpanded = false;
        loadStepsEl.classList.remove('expanded');
        contextExpand.innerHTML = '&#9660;';
        progressBarTrack.style.display = 'none';
      }, 3000);
    }

    if (msg.type === 'spotify-context-update') {
      contextDot.classList.remove('loading');
      contextText.textContent = msg.summary || 'Spotify data loaded';
    }

    if (msg.type === 'spotify-auth-status') {
      updateSpotifyAuthUI(msg.loggedIn);
    }

  });

  // --- GDPR import ---
  const gdprInput = document.getElementById('sb-gdpr-import');
  const gdprBtn = document.getElementById('sb-gdpr-import-btn');
  const gdprClearBtn = document.getElementById('sb-gdpr-clear-btn');
  const gdprStatus = document.getElementById('sb-gdpr-import-status');

  function updateGdprUI(files) {
    if (files?.length) {
      gdprStatus.textContent = files.join(', ');
      gdprClearBtn.style.display = '';
    } else {
      gdprStatus.textContent = '';
      gdprClearBtn.style.display = 'none';
    }
  }

  // Show existing import status on load
  chrome.runtime.sendMessage({ type: 'get-spotify-data' }, (resp) => {
    updateGdprUI(resp?.historyMetrics?.importedFiles);
  });

  gdprBtn.addEventListener('click', () => gdprInput.click());

  // Clear history button
  gdprClearBtn.addEventListener('click', async () => {
    gdprClearBtn.disabled = true;
    gdprStatus.textContent = 'Clearing...';
    await chrome.runtime.sendMessage({ type: 'clear-history' });
    updateGdprUI(null);
    gdprClearBtn.disabled = false;
    const activeTab = document.querySelector('.sb-data-tab.active');
    if (activeTab) renderDataViewer(activeTab.dataset.tab);
  });

  gdprInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    // Clear existing history before importing new files
    gdprStatus.textContent = 'Clearing previous history...';
    await chrome.runtime.sendMessage({ type: 'clear-history' });

    contextDot.classList.add('loading');
    gdprBtn.disabled = true;
    gdprStatus.textContent = 'Importing...';
    contextText.textContent = 'Importing streaming history...';

    let totalImported = 0;
    let totalFiles = 0;
    for (const file of files) {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) {
            console.warn(`[Spotify Brainer] Skipping ${file.name}: not an array of streaming events`);
            continue;
          }
          totalFiles++;
          contextText.textContent = `Importing ${file.name}...`;
          gdprStatus.textContent = `Importing ${file.name}...`;
          const resp = await chrome.runtime.sendMessage({ type: 'gdpr-import', data, filename: file.name });
          if (resp && resp.imported != null) totalImported += resp.imported;
        } catch (err) {
          console.error('[Spotify Brainer] Failed to parse GDPR JSON:', err);
        }
      } else if (file.name.endsWith('.zip')) {
        totalFiles++;
        const buffer = await file.arrayBuffer();
        chrome.runtime.sendMessage({ type: 'gdpr-import-zip', buffer: Array.from(new Uint8Array(buffer)) });
      }
    }

    contextDot.classList.remove('loading');
    gdprBtn.disabled = false;
    if (totalImported > 0) {
      contextText.textContent = `Imported ${totalImported.toLocaleString()} events from ${totalFiles} file${totalFiles > 1 ? 's' : ''}`;
      const fileNames = Array.from(files).filter(f => f.name.endsWith('.json')).map(f => f.name);
      updateGdprUI(fileNames);
      const activeTab = document.querySelector('.sb-data-tab.active');
      if (activeTab) renderDataViewer(activeTab.dataset.tab);
    } else if (totalFiles > 0) {
      contextText.textContent = 'No streaming events found — check file format';
      updateGdprUI(null);
    } else {
      contextText.textContent = 'No compatible files selected';
      updateGdprUI(null);
    }
    e.target.value = '';
  });

  // --- Generate panel ---
  (function initGeneratePanel() {
    const genPromptInput = document.getElementById('sb-gen-prompt');
    const genBtn = document.getElementById('sb-gen-btn');
    const genBtnLabel = document.getElementById('sb-gen-btn-label');
    const genStatus = document.getElementById('sb-gen-status');
    const genPlayer = document.getElementById('sb-gen-player');
    const genPlayBtn = document.getElementById('sb-gen-play-btn');
    const genScrubber = document.getElementById('sb-gen-scrubber');
    const genScrubberFill = document.getElementById('sb-gen-scrubber-fill');
    const genScrubberThumb = document.getElementById('sb-gen-scrubber-thumb');
    const genTimeCur = document.getElementById('sb-gen-time-cur');
    const genTimeTotal = document.getElementById('sb-gen-time-total');
    const genPromptUsed = document.getElementById('sb-gen-prompt-used');
    const genUserPrompt = document.getElementById('sb-gen-user-prompt');
    const genUserPromptWrap = document.getElementById('sb-gen-user-prompt-wrap');
    const genTrackName = document.getElementById('sb-gen-track-name');
    const genRenameBtn = document.getElementById('sb-gen-rename-btn');
    const genRenameInput = document.getElementById('sb-gen-rename-input');
    const genTags = document.getElementById('sb-gen-tags');
    const genSaveRow = document.getElementById('sb-gen-save-row');
    const genNameInput = document.getElementById('sb-gen-name-input');
    const genSaveBtn = document.getElementById('sb-gen-save-btn');
    const genDiscardBtn = document.getElementById('sb-gen-discard-btn');
    const genAlbumArt = document.getElementById('sb-gen-album-art');
    const genInsights = document.getElementById('sb-gen-insights');
    const genVideoRow = document.getElementById('sb-gen-video-row');
    const genVideoBtn = document.getElementById('sb-gen-video-btn');
    const genVideoBtnLabel = document.getElementById('sb-gen-video-btn-label');
    const genVideoStatus = document.getElementById('sb-gen-video-status');
    const genVideo = document.getElementById('sb-gen-video');
    const genLibrary = document.getElementById('sb-gen-library');
    const genLibraryList = document.getElementById('sb-gen-library-list');
    const genLibCount = document.getElementById('sb-gen-lib-count');
    const genCloseBtn = document.getElementById('sb-gen-close-btn');

    let audio = null;
    let isGeneratingVideo = false;
    let isGenerating = false;
    let currentSong = null;   // currently displayed song (for video gen)
    let pendingSong = null;   // generated but not yet saved
    let savedSongs = [];      // persisted songs: [{id, audio, mimeType, prompt, userIntent, generatedAt}]

    const SONGS_KEY = 'sb_gen_songs';
    const MAX_SONGS = Infinity;

    // Load saved songs from storage
    chrome.storage.local.get(SONGS_KEY, (data) => {
      savedSongs = data[SONGS_KEY] || [];
      renderLibrary();
    });

    function persistSongs() {
      chrome.storage.local.set({ [SONGS_KEY]: savedSongs });
    }

    function formatTime(s) {
      const m = Math.floor(s / 60);
      return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    }

    function formatDate(ts) {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    function setStatus(msg, isError = false) {
      genStatus.textContent = msg;
      genStatus.style.display = msg ? 'block' : 'none';
      genStatus.style.color = isError ? '#f15e6c' : '#b3b3b3';
    }
    _genSetStatus = setStatus; // expose to module-level message listener

    // Handle async album art arrival
    _genOnAlbumArt = function (albumArt) {
      if (!albumArt) return;
      // Update whichever song is currently active
      const song = pendingSong || currentSong;
      if (song) {
        song.albumArt = albumArt;
        // Update library if it's a saved song
        if (!pendingSong && currentSong) {
          persistSongs();
          renderLibrary();
        }
      }
      // Diffusion reveal — blur-to-sharp + fade-in
      genAlbumArt.classList.remove('sb-gen-diffuse');
      genAlbumArt.src = `data:${albumArt.mimeType};base64,${albumArt.image}`;
      genAlbumArt.style.display = 'block';
      // Force reflow so the animation restarts cleanly
      void genAlbumArt.offsetWidth;
      genAlbumArt.classList.add('sb-gen-diffuse');
    };

    function loadAudio(base64, mimeType) {
      if (audio) { audio.pause(); audio = null; }
      // Reset player UI to stopped state before creating new audio
      genPlayBtn.innerHTML = ICONS.play;
      genScrubberFill.style.width = '0%';
      genScrubberThumb.style.left = '0%';
      genTimeCur.textContent = '0:00';
      genTimeTotal.textContent = '0:00';
      audio = new Audio(`data:${mimeType || 'audio/mp3'};base64,${base64}`);

      audio.addEventListener('loadedmetadata', () => {
        genTimeTotal.textContent = formatTime(isFinite(audio.duration) ? audio.duration : 30);
      });
      audio.addEventListener('timeupdate', () => {
        const dur = audio.duration || 30;
        const pct = (audio.currentTime / dur) * 100;
        genScrubberFill.style.width = pct + '%';
        genScrubberThumb.style.left = pct + '%';
        genTimeCur.textContent = formatTime(audio.currentTime);
      });
      audio.addEventListener('ended', () => {
        genPlayBtn.innerHTML = ICONS.play;
        genScrubberFill.style.width = '0%';
        genScrubberThumb.style.left = '0%';
        genTimeCur.textContent = '0:00';
        audio.currentTime = 0;
      });
    }

    function showPlayer(song, showSaveActions) {
      currentSong = song;
      loadAudio(song.audio, song.mimeType);
      genPromptUsed.textContent = song.prompt || '';
      if (song.userIntent) {
        genUserPrompt.textContent = song.userIntent;
        genUserPromptWrap.style.display = 'block';
      } else {
        genUserPromptWrap.style.display = 'none';
      }
      // Hide track name row for unsaved songs, show for saved
      if (showSaveActions) {
        document.querySelector('.sb-gen-track-name-row').style.display = 'none';
      } else {
        document.querySelector('.sb-gen-track-name-row').style.display = 'flex';
        genTrackName.textContent = song.name || song.userIntent || 'Generated clip';
        genRenameBtn.style.display = 'inline-flex';

      }
      genRenameInput.style.display = 'none';
      // Render genre tags + mode badge
      const modeBadge = song.mode === 'anti-taste' ? '<span class="sb-gen-mode-badge sb-gen-mode-anti">Anti-Taste</span>'
        : song.mode === 'future-taste' ? '<span class="sb-gen-mode-badge sb-gen-mode-future">Future Me</span>' : '';
      const tagPills = (song.tags || []).map(t => `<span class="sb-gen-tag">${escapeHtml(t)}</span>`).join('');
      if (modeBadge || tagPills) {
        genTags.innerHTML = modeBadge + tagPills;
        genTags.style.display = 'flex';
      } else {
        genTags.style.display = 'none';
      }
      if (song.albumArt) {
        genAlbumArt.src = `data:${song.albumArt.mimeType};base64,${song.albumArt.image}`;
        genAlbumArt.style.display = 'block';
      } else {
        genAlbumArt.style.display = 'none';
      }
      // Show video if song has one, otherwise show generate button (only for saved songs)
      if (song.video) {
        genVideo.src = `data:${song.videoMimeType || 'video/mp4'};base64,${song.video}`;
        genVideo.style.display = 'block';
        genVideoRow.style.display = 'none';
      } else {
        genVideo.style.display = 'none';
        genVideoRow.style.display = (!showSaveActions && song.prompt) ? 'flex' : 'none';
        genVideoBtnLabel.textContent = 'Generate Video';
        genVideoBtn.disabled = false;
        genVideoStatus.textContent = '';
      }
      // Render mode insights (anti-taste / future-taste)
      if (song.modeReason) {
        genInsights.innerHTML = `<details><summary>Why this track?</summary><p>${escapeHtml(song.modeReason)}</p></details>`;
        genInsights.style.display = 'block';
      } else {
        genInsights.style.display = 'none';
      }

      genPlayer.style.display = 'flex';
      genSaveRow.style.display = showSaveActions ? 'block' : 'none';
      if (showSaveActions) {
        genNameInput.value = song.userIntent || '';
        setTimeout(() => genNameInput.focus(), 50);
      }
      setStatus('');
    }

    function renderLibrary() {
      if (!savedSongs.length) {
        genLibrary.style.display = 'none';
        genLibCount.textContent = '';
        return;
      }
      genLibrary.style.display = 'block';
      genLibCount.textContent = `(${savedSongs.length})`;
      genLibraryList.innerHTML = savedSongs.map((song, idx) => `
        <div class="sb-gen-lib-item" data-idx="${idx}">
          ${song.albumArt
            ? `<img class="sb-gen-lib-art" src="data:${song.albumArt.mimeType};base64,${song.albumArt.image}" />`
            : `<button class="sb-gen-lib-play" data-idx="${idx}" title="Play">${ICONS.play}</button>`
          }
          <div class="sb-gen-lib-info">
            <div class="sb-gen-lib-label">${escapeHtml(song.name || song.userIntent || 'Untitled')}${
              song.mode === 'anti-taste' ? ' <span class="sb-gen-mode-badge sb-gen-mode-anti sb-gen-mode-badge-sm">Anti-Taste</span>'
              : song.mode === 'future-taste' ? ' <span class="sb-gen-mode-badge sb-gen-mode-future sb-gen-mode-badge-sm">Future Me</span>' : ''
            }</div>
            ${song.tags?.length ? `<div class="sb-gen-lib-tags">${song.tags.map(t => `<span class="sb-gen-tag sb-gen-tag-sm">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            <div class="sb-gen-lib-date">${formatDate(song.generatedAt)}</div>
          </div>
          <button class="sb-gen-lib-export" data-idx="${idx}" title="Download MP3">${ICONS.export}</button>
          <button class="sb-gen-lib-delete" data-idx="${idx}" title="Delete">${ICONS.trash}</button>
        </div>
      `).join('');

      genLibraryList.querySelectorAll('.sb-gen-lib-item').forEach((el) => {
        el.addEventListener('click', (e) => {
          // Don't trigger on delete/export button clicks or during generation
          if (e.target.closest('.sb-gen-lib-delete') || e.target.closest('.sb-gen-lib-export')) return;
          if (isGenerating) return;
          const idx = parseInt(el.dataset.idx);
          const song = savedSongs[idx];
          if (!song) return;
          showPlayer(song, false);
          audio.play().then(() => {
            genPlayBtn.innerHTML = ICONS.pause;
          }).catch(() => {});
        });
      });

      genLibraryList.querySelectorAll('.sb-gen-lib-delete').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          savedSongs.splice(idx, 1);
          persistSongs();
          renderLibrary();
        });
      });

      genLibraryList.querySelectorAll('.sb-gen-lib-export').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const song = savedSongs[idx];
          if (song) exportSongAsMp3(song);
        });
      });
    }

    genSaveBtn.addEventListener('click', () => {
      if (!pendingSong) return;
      pendingSong.name = genNameInput.value.trim() || pendingSong.userIntent || 'Untitled';
      if (savedSongs.length >= MAX_SONGS) savedSongs.pop(); // drop oldest
      savedSongs.unshift(pendingSong);
      persistSongs();
      pendingSong = null;
      genSaveRow.style.display = 'none';
      renderLibrary();
    });

    genDiscardBtn.addEventListener('click', () => {
      pendingSong = null;
      genSaveRow.style.display = 'none';
      genPlayer.style.display = 'none';
      genVideo.style.display = 'none';
      genVideoRow.style.display = 'none';
      if (audio) { audio.pause(); audio = null; }
    });

    // Close player
    genCloseBtn.addEventListener('click', () => {
      if (audio) { audio.pause(); audio = null; }
      genPlayer.style.display = 'none';
      genVideo.style.display = 'none';
      genVideoRow.style.display = 'none';
      currentSong = null;
      pendingSong = null;
    });

    // Rename saved song
    genRenameBtn.addEventListener('click', () => {
      genRenameInput.value = genTrackName.textContent;
      genTrackName.style.display = 'none';
      genRenameBtn.style.display = 'none';

      genRenameInput.style.display = 'block';
      genRenameInput.focus();
      genRenameInput.select();
    });

    function commitRename() {
      const newName = genRenameInput.value.trim();
      if (newName && currentSong) {
        currentSong.name = newName;
        genTrackName.textContent = newName;
        // Persist if it's a saved song
        const idx = savedSongs.indexOf(currentSong);
        if (idx !== -1) { persistSongs(); renderLibrary(); }
      }
      genRenameInput.style.display = 'none';
      genTrackName.style.display = 'block';
      genRenameBtn.style.display = 'inline-flex';
      genExportBtn.style.display = 'inline-flex';
    }

    genRenameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitRename();
      if (e.key === 'Escape') {
        genRenameInput.style.display = 'none';
        genTrackName.style.display = 'block';
        genRenameBtn.style.display = 'inline-flex';

      }
    });
    genRenameInput.addEventListener('blur', commitRename);

    // Export MP3 with ID3v2 tags (title + cover art)
    function exportSongAsMp3(song) {
      if (!song) return;
      const title = song.name || song.userIntent || 'Spotify Brainer';
      const artist = 'Spotify Brainer';

      // Decode the base64 audio
      const audioBytes = Uint8Array.from(atob(song.audio), (c) => c.charCodeAt(0));

      // Build ID3v2.3 tag
      const frames = [];

      // Text frame helper (TIT2, TPE1, etc.)
      function textFrame(id, text) {
        const encoded = new TextEncoder().encode(text);
        // Frame: 4-byte ID + 4-byte size + 2-byte flags + 1-byte encoding (0=ISO) + text
        const size = 1 + encoded.length;
        const buf = new Uint8Array(10 + size);
        buf.set(new TextEncoder().encode(id), 0);
        buf[4] = (size >> 24) & 0xff; buf[5] = (size >> 16) & 0xff;
        buf[6] = (size >> 8) & 0xff; buf[7] = size & 0xff;
        // flags = 0, encoding = 0 (ISO-8859-1)
        buf.set(encoded, 11);
        return buf;
      }

      frames.push(textFrame('TIT2', title));
      frames.push(textFrame('TPE1', artist));

      // APIC frame (cover art) if available
      if (song.albumArt) {
        const imgBytes = Uint8Array.from(atob(song.albumArt.image), (c) => c.charCodeAt(0));
        const mimeStr = song.albumArt.mimeType || 'image/png';
        const mimeEncoded = new TextEncoder().encode(mimeStr);
        // APIC: encoding(1) + mime+null + picture_type(1) + description_null(1) + image_data
        const apicPayload = 1 + mimeEncoded.length + 1 + 1 + 1 + imgBytes.length;
        const apic = new Uint8Array(10 + apicPayload);
        apic.set(new TextEncoder().encode('APIC'), 0);
        apic[4] = (apicPayload >> 24) & 0xff; apic[5] = (apicPayload >> 16) & 0xff;
        apic[6] = (apicPayload >> 8) & 0xff; apic[7] = apicPayload & 0xff;
        let offset = 10;
        apic[offset++] = 0; // encoding = ISO-8859-1
        apic.set(mimeEncoded, offset); offset += mimeEncoded.length;
        apic[offset++] = 0; // null terminator for mime
        apic[offset++] = 3; // picture type: cover (front)
        apic[offset++] = 0; // null terminator for description
        apic.set(imgBytes, offset);
        frames.push(apic);
      }

      // Calculate total frames size
      const framesSize = frames.reduce((s, f) => s + f.length, 0);

      // ID3v2.3 header: "ID3" + version(2bytes) + flags(1) + size(4 syncsafe)
      const header = new Uint8Array(10);
      header.set(new TextEncoder().encode('ID3'), 0);
      header[3] = 3; header[4] = 0; // version 2.3.0
      header[5] = 0; // flags
      // Syncsafe integer for size
      header[6] = (framesSize >> 21) & 0x7f;
      header[7] = (framesSize >> 14) & 0x7f;
      header[8] = (framesSize >> 7) & 0x7f;
      header[9] = framesSize & 0x7f;

      // Combine: header + frames + original audio
      const result = new Uint8Array(header.length + framesSize + audioBytes.length);
      let pos = 0;
      result.set(header, pos); pos += header.length;
      for (const frame of frames) { result.set(frame, pos); pos += frame.length; }
      result.set(audioBytes, pos);

      // Download
      const blob = new Blob([result], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9 _-]/g, '')}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    }

    genVideoBtn.addEventListener('click', async () => {
      if (isGeneratingVideo || !currentSong?.prompt) return;

      const vidProviderData = await chrome.storage.local.get('sb_video_provider');
      const vidProvider = vidProviderData.sb_video_provider;
      if (!vidProvider) {
        genVideoStatus.textContent = 'Set up video gen in Settings';
        genVideoStatus.className = 'sb-gen-video-status sb-test-error';
        return;
      }
      const vidKeyData = await chrome.storage.local.get(`sb_video_key_${vidProvider}`);
      const vidKey = vidKeyData[`sb_video_key_${vidProvider}`];
      if (!vidKey) {
        genVideoStatus.textContent = 'Add your API key in Settings → Video Generation';
        genVideoStatus.className = 'sb-gen-video-status sb-test-error';
        return;
      }
      const vidModelData = await chrome.storage.local.get(`sb_video_model_${vidProvider}`);
      const vidModel = vidModelData[`sb_video_model_${vidProvider}`];

      isGeneratingVideo = true;
      genVideoBtn.disabled = true;
      genVideoBtnLabel.textContent = 'Generating...';
      genVideoStatus.textContent = 'This may take a few minutes';
      genVideoStatus.className = 'sb-gen-video-status';

      try {
        const videoPrompt = `Music video visualizer for: ${currentSong.prompt}. Abstract, cinematic, flowing visuals, no text, no people.`;
        const result = await chrome.runtime.sendMessage({
          type: 'video-generate',
          provider: vidProvider,
          model: vidModel,
          prompt: videoPrompt,
          durationSeconds: 8,
          apiKey: vidKey,
        });
        if (result.error) {
          genVideoStatus.textContent = result.error;
          genVideoStatus.className = 'sb-gen-video-status sb-test-error';
        } else {
          currentSong.video = result.video;
          currentSong.videoMimeType = result.mimeType;
          genVideo.src = `data:${result.mimeType};base64,${result.video}`;
          genVideo.style.display = 'block';
          genVideoRow.style.display = 'none';
        }
      } catch (e) {
        genVideoStatus.textContent = e.message || 'Video generation failed';
        genVideoStatus.className = 'sb-gen-video-status sb-test-error';
      } finally {
        isGeneratingVideo = false;
        genVideoBtn.disabled = false;
        genVideoBtnLabel.textContent = 'Generate Video';
      }
    });

    genPlayBtn.addEventListener('click', () => {
      if (!audio) return;
      if (audio.paused) {
        audio.play();
        genPlayBtn.innerHTML = ICONS.pause;
      } else {
        audio.pause();
        genPlayBtn.innerHTML = ICONS.play;
      }
    });

    let scrubbing = false;
    function scrubTo(e) {
      if (!audio) return;
      const rect = genScrubber.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * (audio.duration || 30);
    }
    genScrubber.addEventListener('mousedown', (e) => { scrubbing = true; scrubTo(e); });
    document.addEventListener('mousemove', (e) => { if (scrubbing) scrubTo(e); });
    document.addEventListener('mouseup', () => { scrubbing = false; });

    const genAntiBtn = document.getElementById('sb-gen-anti-btn');

    async function doGenerate(mode) {
      if (isGenerating) return;

      const provider = (await chrome.storage.local.get('sb_music_provider')).sb_music_provider || 'lyria';
      const apiKey = (await chrome.storage.local.get(`sb_music_key_${provider}`))[`sb_music_key_${provider}`];
      const model = (await chrome.storage.local.get(`sb_music_model_${provider}`))[`sb_music_model_${provider}`] || 'lyria-3-clip-preview';

      if (!apiKey) {
        setStatus('Add your API key in Settings → Music Generation', true);
        return;
      }

      const genFutureBtn = document.getElementById('sb-gen-future-btn');

      const activeBtn = mode === 'anti-taste' ? genAntiBtn : mode === 'future-taste' ? genFutureBtn : genBtn;
      isGenerating = true;
      genBtn.disabled = true;
      genAntiBtn.disabled = true;
      genFutureBtn.disabled = true;
      genPromptInput.disabled = true;
      genLibrary.classList.add('sb-gen-disabled');
      activeBtn.classList.add('sb-gen-active');
      if (!mode) genBtnLabel.textContent = 'Generating...';
      genPlayer.style.display = 'none';
      genSaveRow.style.display = 'none';
      setStatus('Starting…');

      try {
        const userIntent = genPromptInput.value.trim();
        const resp = await chrome.runtime.sendMessage({
          type: 'music-generate',
          provider,
          model,
          userIntent,
          apiKey,
          mode,
        });

        if (resp.error) {
          setStatus(resp.error, true);
        } else {
          pendingSong = {
            id: Date.now(),
            audio: resp.audio,
            mimeType: resp.mimeType,
            prompt: resp.prompt,
            tags: resp.tags || null,
            mode: mode || null,
            albumArt: null,
            modeReason: resp.modeReason || null,
            tasteDrift: resp.tasteDrift || null,
            userIntent: mode === 'anti-taste' ? (userIntent || 'Anti-Taste dare') : mode === 'future-taste' ? (userIntent || 'Future Me') : userIntent,
            generatedAt: Date.now(),
          };
          showPlayer(pendingSong, true);
        }
      } catch (e) {
        setStatus(e.message || 'Generation failed', true);
      } finally {
        isGenerating = false;
        genBtn.disabled = false;
        genAntiBtn.disabled = false;
        genFutureBtn.disabled = false;
        genPromptInput.disabled = false;
        genLibrary.classList.remove('sb-gen-disabled');
        genBtn.classList.remove('sb-gen-active');
        genAntiBtn.classList.remove('sb-gen-active');
        genFutureBtn.classList.remove('sb-gen-active');
        genBtnLabel.textContent = 'Generate';
      }
    }

    genBtn.addEventListener('click', () => doGenerate(null));
    genAntiBtn.addEventListener('click', () => doGenerate('anti-taste'));
    document.getElementById('sb-gen-future-btn').addEventListener('click', () => doGenerate('future-taste'));
    genPromptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doGenerate(null);
      }
    });

    // --- Realtime mode ---
    const clipPanel = document.getElementById('sb-gen-clip-panel');
    const rtPanel = document.getElementById('sb-rt-panel');
    const modeClipBtn = document.getElementById('sb-gen-mode-clip');
    const modeRtBtn = document.getElementById('sb-gen-mode-realtime');
    const rtPlayBtn = document.getElementById('sb-rt-play');
    const rtStopBtn = document.getElementById('sb-rt-stop');
    const rtRecBtn = document.getElementById('sb-rt-rec');
    const rtStatus = document.getElementById('sb-rt-status');
    const rtParams = document.getElementById('sb-rt-params');
    const rtVisualizer = document.getElementById('sb-rt-visualizer');
    const rtSpectrum = document.getElementById('sb-rt-spectrum');
    const rtScrubber = document.getElementById('sb-rt-scrubber');
    const rtScrubberDot = document.getElementById('sb-rt-scrubber-dot');
    const rtBranches = document.getElementById('sb-rt-branches');
    const rtScrubberFill = document.getElementById('sb-rt-scrubber-fill');

    let rtStreaming = false;
    let rtPaused = false;
    let rtPositions = null;
    let rtPosition = 50; // 0-100 continuous position
    let rtRecording = false;
    let rtRecPaused = false;
    let rtRecStartTime = 0;
    let rtRecPausedDuration = 0;
    let rtRecPauseStart = 0;
    let rtRecTimerInterval = null;

    function renderSpectrum(positions) {
      rtPositions = positions;
      rtSpectrum.innerHTML = '';

      positions.forEach((pos, i) => {
        const step = document.createElement('div');
        step.className = 'sb-rt-step';
        step.dataset.idx = i;

        // Color bar: red(0) → green(5) → blue(10)
        let color;
        if (i <= 5) {
          const t = i / 5;
          color = `rgb(${Math.round(220*(1-t)+29*t)},${Math.round(50*(1-t)+185*t)},${Math.round(50*(1-t)+84*t)})`;
        } else {
          const t = (i - 5) / 5;
          color = `rgb(${Math.round(29*(1-t)+60*t)},${Math.round(185*(1-t)+120*t)},${Math.round(84*(1-t)+216*t)})`;
        }

        const bar = document.createElement('div');
        bar.className = 'sb-rt-step-bar';
        bar.style.background = color;

        const genres = document.createElement('div');
        genres.className = 'sb-rt-step-genres';
        genres.title = pos.genres.join(', ') + ` | BPM:${pos.bpm} D:${pos.density} B:${pos.brightness}`;
        pos.genres.forEach((g, gi) => {
          const span = document.createElement('span');
          span.textContent = g;
          const w = pos.weights[gi] ?? 0.5;
          if (w < 0.85) span.style.opacity = (0.35 + w * 0.55).toFixed(2);
          genres.appendChild(span);
        });

        step.appendChild(bar);
        step.appendChild(genres);
        rtSpectrum.appendChild(step);
      });

      updateSpectrumHighlight();
    }

    // --- Spectrum as interactive control: click & drag ---
    let rtDragging = false;

    function scrubberPosFromEvent(e) {
      const rect = rtScrubber.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
      return Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)));
    }

    function setPosition(pos) {
      rtPosition = pos;
      updateSpectrumHighlight();
      if (!rtStreaming) return;
      clearTimeout(rtSliderDebounce);
      rtSliderDebounce = setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'realtime-slider', position: pos });
      }, 150);
    }

    // Click on a block to snap to its center
    rtSpectrum.addEventListener('click', (e) => {
      const step = e.target.closest('.sb-rt-step');
      if (step) setPosition(parseInt(step.dataset.idx) * 10);
    });

    // Drag on the scrubber track for precise control
    rtScrubber.addEventListener('mousedown', (e) => {
      rtDragging = true;
      setPosition(scrubberPosFromEvent(e));
    });
    document.addEventListener('mousemove', (e) => {
      if (!rtDragging) return;
      setPosition(scrubberPosFromEvent(e));
    });
    document.addEventListener('mouseup', () => { rtDragging = false; });
    rtScrubber.addEventListener('touchstart', (e) => {
      rtDragging = true;
      setPosition(scrubberPosFromEvent(e));
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!rtDragging) return;
      setPosition(scrubberPosFromEvent(e));
    }, { passive: true });
    document.addEventListener('touchend', () => { rtDragging = false; });

    function updateSpectrumHighlight() {
      if (!rtPositions) return;
      const idx = rtPosition / 10;
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, 10);
      const t = idx - lo;

      const steps = rtSpectrum.querySelectorAll('.sb-rt-step');

      steps.forEach((el, i) => {
        let weight = 0;
        if (i === lo && i === hi) { weight = 1; }
        else if (i === lo) { weight = 1 - t; }
        else if (i === hi) { weight = t; }

        el.style.opacity = weight > 0 ? String(0.8 + weight * 0.2) : '0.6';
        el.style.background = weight > 0
          ? `rgba(255,255,255,${(0.05 + weight * 0.15).toFixed(3)})`
          : 'transparent';
        el.style.boxShadow = weight > 0
          ? `inset 0 0 ${Math.round(8 + weight * 18)}px rgba(29,185,84,${(weight * 0.35).toFixed(2)})`
          : 'none';
        el.style.borderColor = weight > 0
          ? `rgba(29,185,84,${(0.2 + weight * 0.6).toFixed(2)})`
          : 'transparent';
      });

      // Position the scrubber dot and fill
      rtScrubberDot.style.left = `${rtPosition}%`;
      rtScrubberFill.style.width = `${rtPosition}%`;

      // Draw organic branch connections from scrubber dot to genre blocks
      drawBranches(lo, hi, t);
    }

    function drawBranches(lo, hi, t) {
      const svgRect = rtBranches.getBoundingClientRect();
      const svgW = svgRect.width;
      const svgH = svgRect.height;
      if (svgW < 1 || svgH < 1) return;
      rtBranches.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);

      const steps = rtSpectrum.querySelectorAll('.sb-rt-step');
      if (!steps.length) { rtBranches.innerHTML = ''; return; }

      // Scrubber dot X (bottom of SVG)
      const dotX = (rtPosition / 100) * svgW;
      const botY = svgH;

      // Anchor X = center of each step bar, relative to the SVG
      function barCenterX(i) {
        const step = steps[Math.min(i, steps.length - 1)];
        const bar = step.querySelector('.sb-rt-step-bar') || step;
        const r = bar.getBoundingClientRect();
        return r.left + r.width / 2 - svgRect.left;
      }

      const paths = [];
      const stroke = 2;
      const opaFull = 0.45;
      const opaEqual = 0.35;

      if (lo === hi || t < 0.01) {
        const tx = barCenterX(lo);
        paths.push({ d: curve(dotX, botY, tx, 0), w: stroke, o: opaFull });
      } else if (t > 0.99) {
        const tx = barCenterX(hi);
        paths.push({ d: curve(dotX, botY, tx, 0), w: stroke, o: opaFull });
      } else {
        // Two equal branches
        const loX = barCenterX(lo);
        const hiX = barCenterX(hi);
        paths.push({ d: curve(dotX, botY, loX, 0), w: stroke, o: opaEqual });
        paths.push({ d: curve(dotX, botY, hiX, 0), w: stroke, o: opaEqual });
      }

      while (rtBranches.firstChild) rtBranches.removeChild(rtBranches.firstChild);
      for (const p of paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', p.d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', `rgba(255,255,255,${p.o})`);
        path.setAttribute('stroke-width', p.w);
        path.setAttribute('stroke-linecap', 'round');
        rtBranches.appendChild(path);
      }
    }

    function curve(x1, y1, x2, y2) {
      const midY = y1 * 0.4;
      return `M${x1},${y1} C${x1},${midY} ${x2},${y1 - midY} ${x2},${y2}`;
    }
    let rtSliderDebounce = null;

    const PLAY_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

    // Mode toggle
    const genSubtitle = document.getElementById('sb-gen-subtitle');
    modeClipBtn.addEventListener('click', () => {
      if (rtStreaming) {
        chrome.runtime.sendMessage({ type: 'realtime-stop' }).catch(() => {});
        rtStreaming = false;
        rtPaused = false;
        rtPlayBtn.innerHTML = PLAY_ICON;
        rtStopBtn.disabled = true;
        rtRecBtn.disabled = true;
        rtVisualizer.classList.remove('loading', 'active');
        rtStatus.textContent = 'Ready';
      }
      modeClipBtn.classList.add('active');
      modeRtBtn.classList.remove('active');
      clipPanel.style.display = '';
      rtPanel.style.display = 'none';
      genSubtitle.textContent = 'AI-generated music tailored to your taste';
    });
    modeRtBtn.addEventListener('click', async () => {
      if (isGenerating) return; // can't switch while generating clip
      modeRtBtn.classList.add('active');
      modeClipBtn.classList.remove('active');
      clipPanel.style.display = 'none';
      rtPanel.style.display = '';
      genSubtitle.textContent = 'Steer AI-generated music in real time with the familiarity slider';

      // Fetch spectrum data immediately (doesn't start a session)
      if (!rtPositions) {
        const resp = await chrome.runtime.sendMessage({ type: 'realtime-spectrum' });
        if (resp?.positions) renderSpectrum(resp.positions);
      }
    });


    // --- Piano key selector (single select — Lyria accepts one scale enum at a time) ---
    const rtKeysContainer = document.getElementById('sb-rt-keys');
    const rtPianoKeys = rtKeysContainer.querySelectorAll('.sb-piano-key');
    let selectedScale = null; // null = SCALE_UNSPECIFIED (Lyria picks freely)

    rtPianoKeys.forEach((key) => {
      key.addEventListener('click', () => {
        const scale = key.dataset.scale;
        if (selectedScale === scale) {
          selectedScale = null;
          key.classList.remove('pressed');
        } else {
          rtPianoKeys.forEach((k) => k.classList.remove('pressed'));
          selectedScale = scale;
          key.classList.add('pressed');
        }
        chrome.runtime.sendMessage({ type: 'realtime-scale', scale: selectedScale });
      });
    });


    // Play/Pause
    rtPlayBtn.addEventListener('click', async () => {
      if (!rtStreaming) {
        // Start session
        const provider = (await chrome.storage.local.get('sb_music_provider')).sb_music_provider || 'lyria';
        const apiKey = (await chrome.storage.local.get(`sb_music_key_${provider}`))[`sb_music_key_${provider}`];
        if (!apiKey) {
          rtStatus.textContent = 'No API key — configure in Settings';
          return;
        }

        rtStatus.textContent = 'Connecting...';
        rtPlayBtn.innerHTML = PAUSE_ICON;
        rtStopBtn.disabled = false;
        rtRecBtn.disabled = false;
        rtVisualizer.classList.remove('active');
        rtVisualizer.classList.add('loading');

        const resp = await chrome.runtime.sendMessage({
          type: 'realtime-start',
          apiKey,
          sliderPosition: rtPosition,
        });

        if (resp?.error) {
          rtStatus.textContent = resp.error;
          rtPlayBtn.innerHTML = PLAY_ICON;
          rtStopBtn.disabled = true;
          rtRecBtn.disabled = true;
          rtVisualizer.classList.remove('loading', 'active');
          return;
        }

        // Render the spectrum view with genre sets at each position
        if (resp.positions) {
          renderSpectrum(resp.positions);
        }

        rtStreaming = true;
        rtPaused = false;
      } else if (rtPaused) {
        // Resume
        chrome.runtime.sendMessage({ type: 'realtime-play' });
        rtPlayBtn.innerHTML = PAUSE_ICON;
        rtVisualizer.classList.remove('loading');
        rtVisualizer.classList.add('active');
        rtPaused = false;
      } else {
        // Pause
        chrome.runtime.sendMessage({ type: 'realtime-pause' });
        rtPlayBtn.innerHTML = PLAY_ICON;
        rtVisualizer.classList.remove('active');
        rtPaused = true;
      }
    });

    // Stop
    rtStopBtn.addEventListener('click', async () => {
      // If recording, stop recording first (triggers download)
      if (rtRecording) await stopRecording();
      chrome.runtime.sendMessage({ type: 'realtime-stop' });
      rtStreaming = false;
      rtPaused = false;
      rtPlayBtn.innerHTML = PLAY_ICON;
      rtStopBtn.disabled = true;
      rtRecBtn.disabled = true;
      rtVisualizer.classList.remove('loading', 'active');
      rtStatus.textContent = 'Ready';
    });

    // --- Recording ---
    function formatRecTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    const REC_IDLE = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg><span class="sb-rt-rec-label">REC</span>';
    const REC_RECORDING = (t) => `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg><span class="sb-rt-rec-timer">${t}</span><span class="sb-rt-rec-pause" title="Pause"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg></span><span class="sb-rt-rec-stop" title="Stop & save"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="1"/></svg></span>`;
    const REC_PAUSED_TMPL = (t) => `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg><span class="sb-rt-rec-timer">${t}</span><span class="sb-rt-rec-resume" title="Resume"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span><span class="sb-rt-rec-stop" title="Stop & save"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="1"/></svg></span>`;

    function recUpdateInner(time) {
      rtRecBtn.innerHTML = rtRecPaused ? REC_PAUSED_TMPL(time) : REC_RECORDING(time);
    }

    function startRecTimer() {
      rtRecStartTime = Date.now();
      rtRecPausedDuration = 0;
      recUpdateInner('0:00');
      rtRecTimerInterval = setInterval(() => {
        const elapsed = Date.now() - rtRecStartTime - rtRecPausedDuration;
        const timerEl = rtRecBtn.querySelector('.sb-rt-rec-timer');
        if (timerEl) timerEl.textContent = formatRecTime(elapsed);
      }, 500);
    }

    function stopRecTimer() {
      if (rtRecTimerInterval) { clearInterval(rtRecTimerInterval); rtRecTimerInterval = null; }
    }

    function currentRecTime() {
      const elapsed = Date.now() - rtRecStartTime - rtRecPausedDuration;
      return formatRecTime(elapsed);
    }

    async function stopRecording() {
      rtRecording = false;
      rtRecPaused = false;
      stopRecTimer();
      rtRecBtn.classList.remove('recording', 'rec-paused');
      rtRecBtn.innerHTML = REC_IDLE;
      rtRecBtn.title = 'Record';
      // Service worker handles the download via chrome.downloads API
      await chrome.runtime.sendMessage({ type: 'realtime-rec-stop' });
    }

    function resumeRecording() {
      chrome.runtime.sendMessage({ type: 'realtime-rec-resume' });
      rtRecPaused = false;
      rtRecPausedDuration += Date.now() - rtRecPauseStart;
      rtRecBtn.classList.remove('rec-paused');
      rtRecBtn.classList.add('recording');
      rtRecBtn.title = 'Pause recording';
      rtRecTimerInterval = setInterval(() => {
        const elapsed = Date.now() - rtRecStartTime - rtRecPausedDuration;
        const timerEl = rtRecBtn.querySelector('.sb-rt-rec-timer');
        if (timerEl) timerEl.textContent = formatRecTime(elapsed);
      }, 500);
      recUpdateInner(currentRecTime());
    }

    function pauseRecording() {
      chrome.runtime.sendMessage({ type: 'realtime-rec-pause' });
      rtRecPaused = true;
      rtRecBtn.classList.remove('recording');
      rtRecBtn.classList.add('rec-paused');
      rtRecBtn.title = 'Paused';
      rtRecPauseStart = Date.now();
      if (rtRecTimerInterval) { clearInterval(rtRecTimerInterval); rtRecTimerInterval = null; }
      recUpdateInner(currentRecTime());
    }

    rtRecBtn.addEventListener('click', async (e) => {
      if (e.target.closest('.sb-rt-rec-stop')) {
        await stopRecording();
        return;
      }
      if (e.target.closest('.sb-rt-rec-resume')) {
        resumeRecording();
        return;
      }
      if (e.target.closest('.sb-rt-rec-pause')) {
        pauseRecording();
        return;
      }

      if (!rtRecording) {
        // Start
        chrome.runtime.sendMessage({ type: 'realtime-rec-start' });
        rtRecording = true;
        rtRecPaused = false;
        rtRecBtn.classList.add('recording');
        rtRecBtn.title = 'Recording';
        startRecTimer();
      }
    });

    // Listen for status updates from offscreen via service worker
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type !== 'realtime-status') return;
      switch (msg.state) {
        case 'connecting': rtStatus.textContent = 'Connecting...'; break;
        case 'ready': rtStatus.textContent = 'Connected — starting...'; break;
        case 'streaming':
          rtStatus.textContent = 'Streaming';
          rtVisualizer.classList.remove('loading');
          rtVisualizer.classList.add('active');
          break;
        case 'paused': rtStatus.textContent = 'Paused'; break;
        case 'stopped':
          rtStatus.textContent = 'Ready';
          rtStreaming = false;
          rtPaused = false;
          rtPlayBtn.innerHTML = PLAY_ICON;
          rtStopBtn.disabled = true;
          rtRecBtn.disabled = true;
          if (rtRecording) stopRecording();
          rtVisualizer.classList.remove('loading', 'active');
          break;
        case 'disconnected':
          rtStatus.textContent = msg.detail || 'Disconnected';
          rtStreaming = false;
          rtPaused = false;
          rtPlayBtn.innerHTML = PLAY_ICON;
          rtStopBtn.disabled = true;
          rtRecBtn.disabled = true;
          if (rtRecording) stopRecording();
          rtVisualizer.classList.remove('loading', 'active');
          break;
        case 'error':
          rtStatus.textContent = msg.detail || 'Error';
          break;
        case 'prompt_filtered':
          rtStatus.textContent = 'Prompt filtered — adjusting...';
          break;
        case 'resetting':
          rtStatus.textContent = 'Resetting context...';
          break;
      }
    });
  })();

  // --- Init ---
  loadState();

  // Notify background that content script is ready
  chrome.runtime.sendMessage({ type: 'content-script-ready' });
})();
