// Spotify Brainer — DOM Scraper (MAIN world)
// Runs in page context to scrape now-playing and current view from the DOM.
// Communicates with the content script (ISOLATED world) via window.postMessage.
// NOTE: Token interception removed — we now use proper OAuth via chrome.identity.

(function () {
  const MSG_PREFIX = 'spotify-brainer:';

  // --- DOM Scraping (runs every 3s, posts to content script) ---
  function scrapeAndPost() {
    const nowPlaying = scrapeNowPlaying();
    const currentView = scrapeCurrentView();

    window.postMessage({
      type: `${MSG_PREFIX}dom-data`,
      data: {
        nowPlaying: nowPlaying.trackName ? nowPlaying : null,
        currentView,
      },
    }, '*');
  }

  function scrapeNowPlaying() {
    const data = {};

    const trackEl = document.querySelector('[data-testid="now-playing-widget"] a[data-testid="context-item-link"]') ||
      document.querySelector('[data-testid="context-item-info-title"]') ||
      document.querySelector('.now-playing-bar .track-info__name a');
    if (trackEl) data.trackName = trackEl.textContent?.trim();

    const artistEl = document.querySelector('[data-testid="now-playing-widget"] a[data-testid="context-item-info-artist"]') ||
      document.querySelector('[data-testid="context-item-info-artist"]') ||
      document.querySelector('.now-playing-bar .track-info__artists a');
    if (artistEl) data.artist = artistEl.textContent?.trim();

    const artEl = document.querySelector('[data-testid="now-playing-widget"] img') ||
      document.querySelector('.now-playing-bar .cover-art img');
    if (artEl) data.artwork = artEl.src;

    const elapsed = document.querySelector('[data-testid="playback-position"]');
    const total = document.querySelector('[data-testid="playback-duration"]');
    if (elapsed) data.progressText = elapsed.textContent?.trim();
    if (total) data.durationText = total.textContent?.trim();

    const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
    if (playBtn) {
      data.isPlaying = playBtn.getAttribute('aria-label')?.toLowerCase().includes('pause');
    }

    const shuffleBtn = document.querySelector('[data-testid="control-button-shuffle"]');
    if (shuffleBtn) {
      data.shuffle = shuffleBtn.getAttribute('aria-checked') === 'true';
    }

    const repeatBtn = document.querySelector('[data-testid="control-button-repeat"]');
    if (repeatBtn) {
      const label = repeatBtn.getAttribute('aria-label')?.toLowerCase() || '';
      if (label.includes('repeat one')) data.repeat = 'track';
      else if (label.includes('disable repeat')) data.repeat = 'context';
      else data.repeat = 'off';
    }

    return data;
  }

  function scrapeCurrentView() {
    const path = window.location.pathname;
    if (path.startsWith('/playlist/')) return `Playlist: ${document.title}`;
    if (path.startsWith('/album/')) return `Album: ${document.title}`;
    if (path.startsWith('/artist/')) return `Artist: ${document.title}`;
    if (path.startsWith('/search')) return `Search: ${document.title}`;
    if (path === '/' || path === '/home') return 'Home';
    if (path.startsWith('/collection/tracks')) return 'Liked Songs';
    if (path.startsWith('/collection/albums')) return 'Saved Albums';
    if (path.startsWith('/collection/artists')) return 'Followed Artists';
    if (path.startsWith('/collection/playlists')) return 'Your Playlists';
    if (path.startsWith('/queue')) return 'Queue';
    return `Page: ${path}`;
  }

  // --- Init ---
  function init() {
    setInterval(scrapeAndPost, 3000);
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
