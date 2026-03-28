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
    if (trackEl) {
      data.trackName = trackEl.textContent?.trim();
      // Extract track ID from the link href (e.g. /track/4iV5W9uYEdYUVa79Axb7Rh)
      const href = trackEl.getAttribute('href') || '';
      const trackIdMatch = href.match(/\/track\/([a-zA-Z0-9]+)/);
      if (trackIdMatch) data.trackId = trackIdMatch[1];
    }

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

  // --- Credits Dialog Scraper ---
  function scrapeCreditsDialog() {
    const dialog = document.querySelector('dialog[aria-label="Credits"][open]');
    if (!dialog) return null;

    const credits = { artists: [], writers: [], producers: [], performers: [], source: null, trackTitle: null };

    // Track title from the dialog header
    const titleEl = dialog.querySelector('h2');
    if (titleEl) credits.trackTitle = titleEl.textContent.trim();

    // Each section is a div.tOUI9tSZBpc9GE07
    const sections = dialog.querySelectorAll('.tOUI9tSZBpc9GE07');
    for (const section of sections) {
      const heading = section.querySelector('span.encore-text-title-extra-small');
      if (!heading) continue;
      const sectionName = heading.textContent.trim().toLowerCase();

      const rows = section.querySelectorAll('[data-encore-id="listRow"]');
      for (const row of rows) {
        const nameEl = row.querySelector('span.encore-text-body-medium');
        const rolesEl = row.querySelector('p[data-encore-id="listRowSubtitle"]');
        if (!nameEl) continue;

        const name = nameEl.textContent.trim();
        const roles = rolesEl
          ? [...rolesEl.querySelectorAll('span')].map(s => s.textContent.trim())
          : [];

        if (sectionName.includes('artist')) {
          credits.artists.push({ name, roles });
        } else if (sectionName.includes('composition') || sectionName.includes('lyric')) {
          credits.writers.push({ name, roles });
        } else if (sectionName.includes('production') || sectionName.includes('engineering')) {
          credits.producers.push({ name, roles });
        } else if (sectionName.includes('performer')) {
          credits.performers.push({ name, roles });
        }
      }
    }

    // Source (label)
    const sourceRow = dialog.querySelector('[aria-labelledby="listrow-title-sources"]');
    if (sourceRow) {
      const sourceEl = sourceRow.querySelector('span.encore-text-body-small');
      if (sourceEl) credits.source = sourceEl.textContent.trim();
    }

    return credits;
  }

  // Right-click a target element and click "View credits" in the context menu
  async function rightClickAndOpenCredits(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    targetEl.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.x + 10, clientY: rect.y + 10,
    }));

    await new Promise(r => setTimeout(r, 500));

    const menuItems = document.querySelectorAll('[role="menuitem"], [role="button"]');
    let viewCreditsBtn = null;
    for (const item of menuItems) {
      if (item.textContent.trim() === 'View credits') {
        viewCreditsBtn = item;
        break;
      }
    }

    if (!viewCreditsBtn) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return null;
    }

    viewCreditsBtn.click();

    // Wait for the credits dialog to appear
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const credits = scrapeCreditsDialog();
      if (credits) {
        const closeBtn = document.querySelector('dialog[aria-label="Credits"] button[aria-label="Close"]');
        if (closeBtn) closeBtn.click();
        return credits;
      }
    }

    return null;
  }

  // Scrape credits for the currently playing track (via now-playing bar)
  async function scrapeNowPlayingCredits() {
    let credits = scrapeCreditsDialog();
    if (credits) return credits;

    const nowPlayingWidget = document.querySelector('[data-testid="now-playing-widget"]');
    if (!nowPlayingWidget) return null;

    const trackLink = nowPlayingWidget.querySelector('a[data-testid="context-item-link"]');
    if (!trackLink) return null;

    return rightClickAndOpenCredits(trackLink);
  }

  // Scrape credits for any track by ID — uses Spotify's SPA navigation (no full reload)
  async function scrapeTrackCreditsById(trackId) {
    let credits = scrapeCreditsDialog();
    if (credits) return credits;

    // Use Spotify's SPA navigation by pushing state and triggering their router
    const targetPath = `/track/${trackId}`;

    // Spotify uses React Router which listens to popstate events
    history.pushState({}, '', targetPath);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

    // Wait for the track page to render
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 300));

      // Look for a right-clickable track element on the page
      const trackRow = document.querySelector(`a[href="/track/${trackId}"]`) ||
        document.querySelector('[data-testid="track-row"]') ||
        document.querySelector('[data-testid="tracklist-row"]');
      if (trackRow) {
        credits = await rightClickAndOpenCredits(trackRow);
        break;
      }
    }

    // Fallback: try the three-dot "more" button on the track page
    if (!credits) {
      const moreBtn = document.querySelector('[data-testid="more-button"]');
      if (moreBtn) {
        moreBtn.click();
        await new Promise(r => setTimeout(r, 500));

        const menuItems = document.querySelectorAll('[role="menuitem"], [role="button"]');
        for (const item of menuItems) {
          if (item.textContent.trim() === 'View credits') {
            item.click();
            for (let i = 0; i < 20; i++) {
              await new Promise(r => setTimeout(r, 200));
              credits = scrapeCreditsDialog();
              if (credits) {
                const closeBtn = document.querySelector('dialog[aria-label="Credits"] button[aria-label="Close"]');
                if (closeBtn) closeBtn.click();
                break;
              }
            }
            break;
          }
        }
      }
    }

    // Navigate back using SPA navigation (browser back)
    window.history.back();

    return credits;
  }

  // Listen for credits scrape requests from content script
  window.addEventListener('message', async (event) => {
    if (event.data?.type !== `${MSG_PREFIX}scrape-credits`) return;

    const trackId = event.data.trackId;
    let credits;

    if (trackId) {
      // Check if this track is currently playing — if so, use the faster now-playing approach
      const nowPlaying = scrapeNowPlaying();
      if (nowPlaying.trackId === trackId) {
        credits = await scrapeNowPlayingCredits();
      } else {
        credits = await scrapeTrackCreditsById(trackId);
      }
    } else {
      credits = await scrapeNowPlayingCredits();
    }

    window.postMessage({
      type: `${MSG_PREFIX}credits-result`,
      data: credits,
    }, '*');
  });

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
