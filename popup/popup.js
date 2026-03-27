// Spotify Brainer — Popup script

document.getElementById('open-spotify').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://open.spotify.com' });
  window.close();
});

document.getElementById('toggle-sidebar').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('open.spotify.com')) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle-sidebar' });
  } else {
    chrome.tabs.create({ url: 'https://open.spotify.com' });
  }
  window.close();
});

// Check if Spotify is open
chrome.tabs.query({ url: 'https://open.spotify.com/*' }, (tabs) => {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (tabs.length > 0) {
    dot.className = 'status-dot active';
    text.textContent = 'Connected to Spotify Web Player';
  }
});
