// Spotify Brainer — Content script
// Injects the AI sidebar into Spotify's web player

(function () {
  if (document.getElementById('spotify-brainer-panel')) return;

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
          <label>Model</label>
          <select id="sb-model-select"></select>
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
  const modelSelect = document.getElementById('sb-model-select');
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
  let activePanel = 'chat'; // 'chat' | 'settings' | 'data'
  const dataViewerEl = document.getElementById('sb-data-viewer');
  const dataContentEl = document.getElementById('sb-data-content');

  function showPanel(name) {
    activePanel = name;
    messagesEl.style.display = name === 'chat' ? 'flex' : 'none';
    inputArea.style.display = name === 'chat' ? 'block' : 'none';
    tokenCounter.style.display = name === 'chat' ? 'block' : 'none';
    settingsEl.classList.toggle('open', name === 'settings');
    dataViewerEl.classList.toggle('open', name === 'data');
    // Close chats dropdown when switching panels
    showingConvList = false;
    convListEl.classList.remove('open');
    if (name === 'data') renderDataViewer('profile');

    // Update active tab highlight
    document.querySelectorAll('.sb-header-btn').forEach((btn) => btn.classList.remove('active'));
    const activeBtn = {
      settings: 'sb-btn-settings',
      data: 'sb-btn-data',
    }[name];
    if (activeBtn) document.getElementById(activeBtn)?.classList.add('active');
  }

  document.getElementById('sb-btn-settings').addEventListener('click', () => {
    showPanel(activePanel === 'settings' ? 'chat' : 'settings');
  });

  document.getElementById('sb-btn-data').addEventListener('click', () => {
    showPanel(activePanel === 'data' ? 'chat' : 'data');
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
    if (!hm?.lifetimeStats) return '<div class="sb-data-empty">No GDPR history imported yet.<br>Go to Settings to import your Extended Streaming History.</div>';
    let html = '';
    const ls = hm.lifetimeStats;

    html += '<div class="sb-data-section"><h3 class="sb-data-heading">Lifetime Stats</h3>';
    html += dataRow('Total plays', ls.totalPlays?.toLocaleString());
    html += dataRow('Unique tracks', ls.uniqueTracks?.toLocaleString());
    html += dataRow('Unique artists', ls.uniqueArtists?.toLocaleString());
    html += dataRow('Years of data', ls.totalYears);
    html += dataRow('Total listening', Math.round((ls.totalMs || 0) / 3600000).toLocaleString() + ' hours');
    if (ls.topArtistAllTime) html += dataRow('Top artist', ls.topArtistAllTime.name + ' (' + ls.topArtistAllTime.plays + ' plays)');
    if (ls.topTrackAllTime) html += dataRow('Top track', ls.topTrackAllTime.name + ' (' + ls.topTrackAllTime.plays + ' plays)');
    html += '</div>';

    if (hm.tasteEvolution?.length) {
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Taste Evolution</h3>';
      for (const era of hm.tasteEvolution) {
        html += '<div class="sb-data-list-item">';
        html += '<div class="sb-data-list-title">' + era.period + '</div>';
        html += '<div class="sb-data-list-meta">' + escapeHtml(era.description) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    if (hm.recentTrends?.length) {
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Recent Trends</h3>';
      for (const trend of hm.recentTrends) {
        html += '<div class="sb-data-list-item"><div class="sb-data-list-meta">' + escapeHtml(trend) + '</div></div>';
      }
      html += '</div>';
    }

    if (hm.behavioralPatterns?.length) {
      html += '<div class="sb-data-section"><h3 class="sb-data-heading">Behavioral Patterns</h3>';
      for (const p of hm.behavioralPatterns) {
        html += '<div class="sb-data-list-item"><div class="sb-data-list-meta">' + escapeHtml(p) + '</div></div>';
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
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: 1048576 },
        { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', context: 1048576 },
      ],
      keyUrl: 'https://aistudio.google.com/apikey',
    },
  };

  function updateModelSelect() {
    const provider = providerSelect.value;
    const models = PROVIDER_MODELS[provider]?.models || [];
    modelSelect.innerHTML = models
      .map((m) => `<option value="${m.id}">${m.name} (${Math.round(m.context / 1000)}K)</option>`)
      .join('');
    apiKeyLink.href = PROVIDER_MODELS[provider]?.keyUrl || '#';
    // Load saved key for this provider, and ensure a model is always persisted
    chrome.storage.local.get([`sb_apiKey_${provider}`, `sb_model_${provider}`], (data) => {
      if (data[`sb_apiKey_${provider}`]) apiKeyInput.value = data[`sb_apiKey_${provider}`];
      else apiKeyInput.value = '';
      if (data[`sb_model_${provider}`]) {
        modelSelect.value = data[`sb_model_${provider}`];
      } else {
        chrome.storage.local.set({ [`sb_model_${provider}`]: modelSelect.value });
      }
      if (typeof updateHintVisibility === 'function') updateHintVisibility();
    });
  }

  providerSelect.addEventListener('change', () => {
    updateModelSelect();
    chrome.storage.local.set({ sb_provider: providerSelect.value });
  });

  modelSelect.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_model_${providerSelect.value}`]: modelSelect.value });
  });

  apiKeyInput.addEventListener('change', () => {
    chrome.storage.local.set({ [`sb_apiKey_${providerSelect.value}`]: apiKeyInput.value });
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
        model: modelSelect.value,
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
    const assistantMsg = { role: 'assistant', content: '', timestamp: Date.now() };
    conv.messages.push(assistantMsg);

    try {
      // Get settings — use the provider value we know, fetch all possibly-relevant keys
      const provider = providerSelect.value || 'anthropic';
      const settings = await chrome.storage.local.get([
        'sb_provider', `sb_apiKey_${provider}`, `sb_model_${provider}`,
      ]);
      const apiKey = settings[`sb_apiKey_${provider}`];
      const model = settings[`sb_model_${provider}`] || PROVIDER_MODELS[provider]?.models[0]?.id;

      if (!apiKey) {
        throw new Error('No API key set. Open Settings to configure.');
      }
      if (!model) {
        throw new Error('No model selected. Open Settings to configure.');
      }
      // Open port for streaming
      const port = chrome.runtime.connect({ name: 'llm-stream' });
      abortController = { abort: () => port.disconnect() };

      let assistantEl = null;
      let contentEl = null;

      let toolStatusEl = null; // Container for tool execution status pills

      port.onMessage.addListener((chunk) => {
        if (chunk.type === 'text') {
          // Remove typing indicator on first token
          const typing = document.getElementById('sb-typing');
          if (typing) typing.remove();
          // Remove tool status on text (the LLM is now responding with results)
          if (toolStatusEl) { toolStatusEl.remove(); toolStatusEl = null; }

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
            toolStatusEl = document.createElement('div');
            toolStatusEl.className = 'sb-tool-status';
            messagesEl.appendChild(toolStatusEl);
          }
          const pill = document.createElement('div');
          pill.className = 'sb-tool-pill sb-tool-pending';
          pill.dataset.tool = chunk.toolName;
          pill.textContent = `⏳ ${formatToolName(chunk.toolName)}...`;
          toolStatusEl.appendChild(pill);
          scrollToBottom();
        } else if (chunk.type === 'tool_status') {
          // Update the pill for this tool
          if (toolStatusEl) {
            const pill = toolStatusEl.querySelector(`[data-tool="${chunk.toolName}"]`);
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
          }
          scrollToBottom();
        } else if (chunk.type === 'done') {
          if (toolStatusEl) { toolStatusEl.remove(); toolStatusEl = null; }
          finishGeneration();
          if (chunk.usage) {
            tokenCounter.textContent = `${chunk.usage.inputTokens} in / ${chunk.usage.outputTokens} out`;
          }
        } else if (chunk.type === 'error') {
          const typing = document.getElementById('sb-typing');
          if (typing) typing.remove();
          if (toolStatusEl) { toolStatusEl.remove(); toolStatusEl = null; }
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
        model,
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
    updateModelSelect();
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

  // Listen for credits requests from service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'scrape-credits') {
      requestCreditsScrape(msg.trackId).then(credits => sendResponse({ credits }));
      return true; // async response
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

      // Update the specific step
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

  // --- Init ---
  loadState();

  // Notify background that content script is ready
  chrome.runtime.sendMessage({ type: 'content-script-ready' });
})();
