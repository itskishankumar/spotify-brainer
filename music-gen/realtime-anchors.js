// Spotify Brainer — Realtime Anchor Computation + Interpolation
//
// Builds a genre spectrum across 11 slider positions (0, 10, 20, ..., 100):
//   0–40  = Anti-taste → approaching comfort zone (lowest-ranked → mid-ranked genres)
//   50    = Current taste peak (highest-ranked genres from your listening data)
//   60–100 = Current → Future (rising genres, adjacent undiscovered genres)
//
// Every genre in the GENRE_PARAMS table gets scored against the user's listening
// data (Last.fm tags per artist, weighted by rank and time range). The full ranked
// list is then mapped across the slider — no randomness.
//
// Each position has 5 genre sets with weights + precomputed config (BPM, density,
// brightness). At runtime the slider lerps between nearest positions — zero computation.

// ---------------------------------------------------------------------------
// Genre → typical BPM / density / brightness
// ---------------------------------------------------------------------------
const GENRE_PARAMS = {
  // Electronic
  'ambient': { bpm: 80, density: 0.15, brightness: 0.4 },
  'downtempo': { bpm: 90, density: 0.35, brightness: 0.45 },
  'trip hop': { bpm: 85, density: 0.4, brightness: 0.35 },
  'chillwave': { bpm: 95, density: 0.35, brightness: 0.55 },
  'lo-fi': { bpm: 80, density: 0.3, brightness: 0.4 },
  'house': { bpm: 124, density: 0.65, brightness: 0.6 },
  'deep house': { bpm: 122, density: 0.55, brightness: 0.5 },
  'tech house': { bpm: 126, density: 0.7, brightness: 0.5 },
  'progressive house': { bpm: 128, density: 0.6, brightness: 0.6 },
  'acid house': { bpm: 128, density: 0.7, brightness: 0.6 },
  'electro house': { bpm: 128, density: 0.75, brightness: 0.65 },
  'techno': { bpm: 130, density: 0.75, brightness: 0.4 },
  'minimal techno': { bpm: 128, density: 0.5, brightness: 0.35 },
  'detroit techno': { bpm: 130, density: 0.7, brightness: 0.45 },
  'trance': { bpm: 138, density: 0.7, brightness: 0.7 },
  'psytrance': { bpm: 145, density: 0.8, brightness: 0.6 },
  'drum and bass': { bpm: 174, density: 0.8, brightness: 0.5 },
  'jungle': { bpm: 165, density: 0.8, brightness: 0.5 },
  'dubstep': { bpm: 140, density: 0.8, brightness: 0.35 },
  'edm': { bpm: 128, density: 0.8, brightness: 0.7 },
  'idm': { bpm: 135, density: 0.7, brightness: 0.5 },
  'glitch': { bpm: 130, density: 0.8, brightness: 0.5 },
  'gabber': { bpm: 180, density: 0.9, brightness: 0.4 },
  'footwork': { bpm: 160, density: 0.8, brightness: 0.5 },
  'deconstructed club': { bpm: 140, density: 0.7, brightness: 0.4 },
  'electronica': { bpm: 120, density: 0.6, brightness: 0.55 },
  'synthwave': { bpm: 118, density: 0.6, brightness: 0.6 },
  'darkwave': { bpm: 120, density: 0.5, brightness: 0.3 },
  'coldwave': { bpm: 120, density: 0.4, brightness: 0.3 },
  'vaporwave': { bpm: 90, density: 0.35, brightness: 0.5 },
  'future bass': { bpm: 150, density: 0.7, brightness: 0.7 },
  'future garage': { bpm: 130, density: 0.5, brightness: 0.45 },
  'uk garage': { bpm: 130, density: 0.65, brightness: 0.6 },
  'breakbeat': { bpm: 135, density: 0.7, brightness: 0.55 },
  'industrial': { bpm: 125, density: 0.8, brightness: 0.25 },
  'ebm': { bpm: 120, density: 0.7, brightness: 0.3 },
  'witch house': { bpm: 110, density: 0.5, brightness: 0.2 },
  'electronic': { bpm: 125, density: 0.6, brightness: 0.55 },
  'dance': { bpm: 125, density: 0.7, brightness: 0.65 },

  // Rock & adjacent
  'rock': { bpm: 120, density: 0.65, brightness: 0.55 },
  'indie rock': { bpm: 120, density: 0.55, brightness: 0.55 },
  'indie': { bpm: 115, density: 0.5, brightness: 0.55 },
  'alternative rock': { bpm: 120, density: 0.6, brightness: 0.5 },
  'alternative': { bpm: 115, density: 0.55, brightness: 0.5 },
  'art rock': { bpm: 110, density: 0.55, brightness: 0.5 },
  'prog rock': { bpm: 110, density: 0.65, brightness: 0.55 },
  'progressive rock': { bpm: 110, density: 0.65, brightness: 0.55 },
  'psychedelic rock': { bpm: 115, density: 0.6, brightness: 0.6 },
  'garage rock': { bpm: 130, density: 0.7, brightness: 0.55 },
  'punk': { bpm: 160, density: 0.8, brightness: 0.5 },
  'punk rock': { bpm: 160, density: 0.8, brightness: 0.5 },
  'post-punk': { bpm: 130, density: 0.55, brightness: 0.35 },
  'new wave': { bpm: 125, density: 0.55, brightness: 0.6 },
  'shoegaze': { bpm: 100, density: 0.7, brightness: 0.45 },
  'dream pop': { bpm: 95, density: 0.5, brightness: 0.55 },
  'noise pop': { bpm: 115, density: 0.7, brightness: 0.45 },
  'noise rock': { bpm: 140, density: 0.8, brightness: 0.3 },
  'math rock': { bpm: 140, density: 0.7, brightness: 0.55 },
  'post-rock': { bpm: 100, density: 0.5, brightness: 0.45 },
  'emo': { bpm: 130, density: 0.65, brightness: 0.5 },
  'screamo': { bpm: 160, density: 0.85, brightness: 0.35 },
  'hardcore': { bpm: 160, density: 0.85, brightness: 0.35 },
  'grunge': { bpm: 115, density: 0.7, brightness: 0.35 },
  'stoner rock': { bpm: 100, density: 0.7, brightness: 0.4 },
  'surf rock': { bpm: 140, density: 0.55, brightness: 0.7 },
  'britpop': { bpm: 120, density: 0.6, brightness: 0.6 },
  'power pop': { bpm: 130, density: 0.6, brightness: 0.7 },
  'pop punk': { bpm: 155, density: 0.7, brightness: 0.65 },
  'ska': { bpm: 150, density: 0.65, brightness: 0.7 },
  'rockabilly': { bpm: 170, density: 0.6, brightness: 0.7 },

  // Metal
  'metal': { bpm: 140, density: 0.85, brightness: 0.3 },
  'heavy metal': { bpm: 135, density: 0.8, brightness: 0.35 },
  'thrash metal': { bpm: 170, density: 0.9, brightness: 0.3 },
  'death metal': { bpm: 170, density: 0.9, brightness: 0.2 },
  'black metal': { bpm: 170, density: 0.9, brightness: 0.2 },
  'doom metal': { bpm: 65, density: 0.6, brightness: 0.2 },
  'sludge metal': { bpm: 80, density: 0.75, brightness: 0.25 },
  'progressive metal': { bpm: 120, density: 0.8, brightness: 0.4 },
  'power metal': { bpm: 150, density: 0.8, brightness: 0.55 },
  'metalcore': { bpm: 140, density: 0.85, brightness: 0.35 },
  'nu metal': { bpm: 115, density: 0.8, brightness: 0.4 },

  // Hip Hop & R&B
  'hip hop': { bpm: 90, density: 0.65, brightness: 0.45 },
  'rap': { bpm: 95, density: 0.7, brightness: 0.45 },
  'trap': { bpm: 140, density: 0.7, brightness: 0.4 },
  'drill': { bpm: 140, density: 0.7, brightness: 0.35 },
  'boom bap': { bpm: 90, density: 0.6, brightness: 0.45 },
  'abstract hip-hop': { bpm: 85, density: 0.5, brightness: 0.4 },
  'phonk': { bpm: 130, density: 0.6, brightness: 0.3 },
  'cloud rap': { bpm: 70, density: 0.4, brightness: 0.45 },
  'r&b': { bpm: 85, density: 0.5, brightness: 0.55 },
  'neo soul': { bpm: 85, density: 0.45, brightness: 0.55 },
  'alternative r&b': { bpm: 90, density: 0.5, brightness: 0.5 },

  // Pop
  'pop': { bpm: 120, density: 0.6, brightness: 0.7 },
  'synth pop': { bpm: 120, density: 0.6, brightness: 0.65 },
  'electropop': { bpm: 125, density: 0.65, brightness: 0.7 },
  'art pop': { bpm: 110, density: 0.55, brightness: 0.6 },
  'chamber pop': { bpm: 100, density: 0.5, brightness: 0.6 },
  'indie pop': { bpm: 115, density: 0.5, brightness: 0.6 },
  'k-pop': { bpm: 125, density: 0.7, brightness: 0.75 },
  'j-pop': { bpm: 125, density: 0.65, brightness: 0.7 },

  // Jazz
  'jazz': { bpm: 120, density: 0.55, brightness: 0.55 },
  'bebop': { bpm: 160, density: 0.7, brightness: 0.6 },
  'free jazz': { bpm: 140, density: 0.8, brightness: 0.5 },
  'smooth jazz': { bpm: 95, density: 0.35, brightness: 0.6 },
  'acid jazz': { bpm: 110, density: 0.55, brightness: 0.55 },
  'nu jazz': { bpm: 110, density: 0.55, brightness: 0.55 },
  'fusion': { bpm: 120, density: 0.7, brightness: 0.55 },
  'gypsy jazz': { bpm: 140, density: 0.6, brightness: 0.7 },

  // Folk & Country
  'folk': { bpm: 100, density: 0.3, brightness: 0.5 },
  'indie folk': { bpm: 105, density: 0.35, brightness: 0.5 },
  'freak folk': { bpm: 90, density: 0.3, brightness: 0.5 },
  'country': { bpm: 110, density: 0.45, brightness: 0.6 },
  'americana': { bpm: 105, density: 0.4, brightness: 0.55 },
  'bluegrass': { bpm: 130, density: 0.5, brightness: 0.6 },

  // Classical & Orchestral
  'classical': { bpm: 90, density: 0.45, brightness: 0.55 },
  'contemporary classical': { bpm: 85, density: 0.4, brightness: 0.5 },
  'minimalism': { bpm: 80, density: 0.2, brightness: 0.5 },
  'neoclassical': { bpm: 85, density: 0.35, brightness: 0.5 },
  'baroque': { bpm: 100, density: 0.5, brightness: 0.6 },
  'orchestral': { bpm: 95, density: 0.55, brightness: 0.55 },

  // Soul & Funk
  'soul': { bpm: 100, density: 0.55, brightness: 0.6 },
  'funk': { bpm: 110, density: 0.7, brightness: 0.65 },
  'disco': { bpm: 120, density: 0.7, brightness: 0.75 },
  'motown': { bpm: 110, density: 0.6, brightness: 0.65 },

  // Blues
  'blues': { bpm: 90, density: 0.45, brightness: 0.45 },
  'delta blues': { bpm: 80, density: 0.3, brightness: 0.4 },
  'electric blues': { bpm: 100, density: 0.55, brightness: 0.5 },

  // World & Regional
  'afrobeats': { bpm: 108, density: 0.65, brightness: 0.7 },
  'afropop': { bpm: 110, density: 0.6, brightness: 0.7 },
  'reggae': { bpm: 80, density: 0.5, brightness: 0.55 },
  'dancehall': { bpm: 100, density: 0.65, brightness: 0.6 },
  'dub': { bpm: 75, density: 0.45, brightness: 0.4 },
  'latin': { bpm: 110, density: 0.6, brightness: 0.7 },
  'reggaeton': { bpm: 95, density: 0.7, brightness: 0.65 },
  'cumbia': { bpm: 95, density: 0.55, brightness: 0.65 },
  'bachata': { bpm: 130, density: 0.5, brightness: 0.6 },
  'salsa': { bpm: 180, density: 0.7, brightness: 0.75 },
  'bossa nova': { bpm: 80, density: 0.3, brightness: 0.6 },
  'samba': { bpm: 100, density: 0.65, brightness: 0.7 },
  'flamenco': { bpm: 120, density: 0.6, brightness: 0.55 },
  'fado': { bpm: 75, density: 0.25, brightness: 0.4 },
  'celtic': { bpm: 110, density: 0.45, brightness: 0.55 },

  // Experimental & Avant-garde
  'experimental': { bpm: 100, density: 0.5, brightness: 0.4 },
  'noise': { bpm: 120, density: 0.9, brightness: 0.3 },
  'harsh noise': { bpm: 120, density: 0.9, brightness: 0.3 },
  'drone': { bpm: 65, density: 0.1, brightness: 0.25 },
  'dark ambient': { bpm: 70, density: 0.1, brightness: 0.2 },
  'musique concrète': { bpm: 90, density: 0.5, brightness: 0.4 },
  'microtonal': { bpm: 100, density: 0.5, brightness: 0.5 },

  // Singer-songwriter & Acoustic
  'singer-songwriter': { bpm: 100, density: 0.3, brightness: 0.5 },
  'acoustic': { bpm: 100, density: 0.25, brightness: 0.5 },

  // Misc
  'new age': { bpm: 75, density: 0.15, brightness: 0.5 },
  'lo-fi beats': { bpm: 80, density: 0.3, brightness: 0.4 },
  'chiptune': { bpm: 140, density: 0.7, brightness: 0.65 },
  'soundtrack': { bpm: 90, density: 0.45, brightness: 0.5 },
  'gospel': { bpm: 100, density: 0.55, brightness: 0.65 },
  'grime': { bpm: 140, density: 0.7, brightness: 0.4 },
};

// Keyword fallback for genres not in the exact table
const KEYWORD_PARAMS = [
  { kw: 'metal', params: { bpm: 140, density: 0.85, brightness: 0.3 } },
  { kw: 'punk', params: { bpm: 155, density: 0.8, brightness: 0.45 } },
  { kw: 'house', params: { bpm: 125, density: 0.65, brightness: 0.6 } },
  { kw: 'techno', params: { bpm: 130, density: 0.7, brightness: 0.4 } },
  { kw: 'jazz', params: { bpm: 120, density: 0.55, brightness: 0.55 } },
  { kw: 'folk', params: { bpm: 100, density: 0.3, brightness: 0.5 } },
  { kw: 'pop', params: { bpm: 120, density: 0.6, brightness: 0.7 } },
  { kw: 'rap', params: { bpm: 95, density: 0.65, brightness: 0.45 } },
  { kw: 'hip hop', params: { bpm: 90, density: 0.65, brightness: 0.45 } },
  { kw: 'rock', params: { bpm: 120, density: 0.65, brightness: 0.55 } },
  { kw: 'blues', params: { bpm: 90, density: 0.45, brightness: 0.45 } },
  { kw: 'soul', params: { bpm: 100, density: 0.55, brightness: 0.6 } },
  { kw: 'ambient', params: { bpm: 75, density: 0.15, brightness: 0.4 } },
  { kw: 'classical', params: { bpm: 90, density: 0.45, brightness: 0.55 } },
  { kw: 'electronic', params: { bpm: 125, density: 0.6, brightness: 0.55 } },
  { kw: 'dance', params: { bpm: 125, density: 0.7, brightness: 0.65 } },
  { kw: 'reggae', params: { bpm: 80, density: 0.5, brightness: 0.55 } },
  { kw: 'country', params: { bpm: 110, density: 0.45, brightness: 0.6 } },
  { kw: 'latin', params: { bpm: 110, density: 0.6, brightness: 0.7 } },
  { kw: 'funk', params: { bpm: 110, density: 0.7, brightness: 0.65 } },
  { kw: 'disco', params: { bpm: 120, density: 0.7, brightness: 0.75 } },
  { kw: 'indie', params: { bpm: 115, density: 0.5, brightness: 0.55 } },
];

const DEFAULT_PARAMS = { bpm: 110, density: 0.5, brightness: 0.5 };

function lookupGenreParams(genre) {
  const lower = genre.toLowerCase();
  const exact = GENRE_PARAMS[lower];
  if (exact) return exact;
  for (const { kw, params } of KEYWORD_PARAMS) {
    if (lower.includes(kw)) return params;
  }
  return DEFAULT_PARAMS;
}

// ---------------------------------------------------------------------------
// Genre adjacency — used to find "phantom" genres for future-me positions
// ---------------------------------------------------------------------------
const GENRE_ADJACENCY = {
  'shoegaze': ['noise pop', 'dream pop', 'post-rock'],
  'dream pop': ['shoegaze', 'chillwave', 'art pop'],
  'indie rock': ['noise pop', 'math rock', 'garage rock', 'art rock'],
  'post-punk': ['darkwave', 'coldwave', 'noise rock'],
  'hip hop': ['abstract hip-hop', 'trip hop', 'boom bap'],
  'trap': ['drill', 'phonk', 'cloud rap'],
  'electronic': ['idm', 'ambient', 'electronica', 'glitch', 'experimental'],
  'house': ['deep house', 'tech house', 'acid house', 'uk garage'],
  'dance': ['edm', 'electro house', 'future bass', 'breakbeat', 'uk garage'],
  'techno': ['minimal techno', 'detroit techno', 'industrial'],
  'pop': ['art pop', 'electropop', 'synth pop', 'chamber pop'],
  'r&b': ['neo soul', 'alternative r&b'],
  'jazz': ['nu jazz', 'acid jazz', 'fusion', 'free jazz'],
  'folk': ['indie folk', 'freak folk', 'americana'],
  'metal': ['progressive metal', 'sludge metal', 'doom metal'],
  'punk': ['post-punk', 'hardcore', 'pop punk'],
  'ambient': ['dark ambient', 'drone', 'new age'],
  'classical': ['contemporary classical', 'minimalism', 'neoclassical'],
  'country': ['americana', 'bluegrass'],
  'blues': ['electric blues', 'delta blues'],
  'reggae': ['dub', 'dancehall'],
  'afrobeats': ['afropop', 'dancehall', 'amapiano'],
  'soul': ['neo soul', 'motown', 'funk'],
  'funk': ['disco', 'soul', 'afrobeats'],
  'disco': ['nu disco', 'funk', 'house'],
};

// ---------------------------------------------------------------------------
// Core: score genres, build ranked spectrum, precompute positions
// ---------------------------------------------------------------------------

/**
 * Score EVERY genre in GENRE_PARAMS against the user's listening data.
 * Returns a Map of genre → score, where score reflects how much
 * the user listens to that genre (0 = not at all).
 */
function scoreAllGenres(spotifyData, historyMetrics, intelligence, cachedArtistTags) {
  // Start with every genre at 0
  const scores = {};
  for (const genre of Object.keys(GENRE_PARAMS)) {
    scores[genre] = 0;
  }

  // Helper to add score — only for genres in our table
  const addScore = (tag, score) => {
    const key = tag.toLowerCase().trim();
    if (!key) return;
    // Exact match
    if (scores[key] !== undefined) {
      scores[key] += score;
      return;
    }
    // Keyword fallback — map to the best matching genre in our table
    for (const genre of Object.keys(GENRE_PARAMS)) {
      if (genre === key || key.includes(genre) || genre.includes(key)) {
        scores[genre] += score * 0.5; // partial match gets half weight
        return;
      }
    }
  };

  // Source 1 (PRIMARY): Last.fm cached tags per artist, weighted by rank and time range
  const rangeWeights = { short: 3, medium: 2, long: 1 };
  for (const [range, weight] of Object.entries(rangeWeights)) {
    const artists = spotifyData?.topArtists?.[range] || [];
    for (let i = 0; i < artists.length; i++) {
      const rankWeight = 1 / (1 + i * 0.1); // top artist = 1.0, 10th = 0.5, etc.
      const artistName = artists[i].name?.toLowerCase();

      // Last.fm tags — primary genre source (2x weight)
      if (artistName && cachedArtistTags[artistName]) {
        for (const tag of cachedArtistTags[artistName]) {
          addScore(tag, weight * rankWeight * 2);
        }
      }

      // Spotify artist genres — fallback, often empty
      for (const genre of artists[i].genres || []) {
        addScore(genre, weight * rankWeight);
      }
    }
  }

  // Source 2: GDPR history genres
  if (historyMetrics?.tasteProfile?.topGenres) {
    for (const entry of historyMetrics.tasteProfile.topGenres) {
      if (entry.genre) addScore(entry.genre, (entry.percentage || 0) * 0.5);
    }
  }

  // Source 3: Taste drift — rising genres get a boost
  if (intelligence?.tasteDrift?.genreDrift?.rising) {
    for (const g of intelligence.tasteDrift.genreDrift.rising) {
      if (g.genre) addScore(g.genre, 3 + Math.abs(g.delta || 0) * 0.1);
    }
  }
  if (intelligence?.tasteDrift?.genreDrift?.declining) {
    for (const g of intelligence.tasteDrift.genreDrift.declining) {
      if (g.genre) addScore(g.genre, 1); // still in taste, just fading
    }
  }

  return scores;
}

/**
 * Build the ranked spectrum: all genres sorted by score, then split into
 * anti (lowest), user (highest), and future (projected forward).
 */
function buildRankedSpectrum(scores, intelligence) {
  const ranked = Object.entries(scores)
    .map(([genre, score]) => ({ genre, score }))
    .sort((a, b) => a.score - b.score); // ascending: lowest first

  // Split into tiers based on score
  const maxScore = ranked[ranked.length - 1]?.score || 1;

  // Anti-taste: genres with score 0 or near 0 (bottom of rank)
  // User taste: genres with meaningful scores (top of rank)
  const antiGenres = []; // score == 0, genres user doesn't listen to at all
  const lowGenres = [];  // score > 0 but low, genres user barely touches
  const userGenres = []; // meaningful score, sorted ascending

  for (const entry of ranked) {
    if (entry.score === 0) {
      antiGenres.push(entry);
    } else if (entry.score < maxScore * 0.1) {
      lowGenres.push(entry);
    } else {
      userGenres.push(entry);
    }
  }

  // Reverse userGenres so highest score is first (for position 50)
  userGenres.reverse();

  // Build the full anti-taste list: pure anti first, then low-scored
  // This gives a smooth transition from "never listened" → "barely listened" → "top taste"
  const fullAntiList = [...antiGenres, ...lowGenres];

  // Build future genres from user's taste + drift projections
  const futureGenres = buildFutureGenres(userGenres, intelligence);

  return { antiGenres: fullAntiList, userGenres, futureGenres };
}

/**
 * Project genres forward for positions 60-100.
 * Prioritizes undiscovered adjacent genres over current top genres.
 */
function buildFutureGenres(userGenres, intelligence) {
  const drift = intelligence?.tasteDrift;
  const futureScores = {};
  const userGenreSet = new Set(userGenres.map((g) => g.genre));
  const topScore = userGenres[0]?.score || 10;

  // Current genres get diminishing scores — future should diverge
  for (const { genre, score } of userGenres) {
    futureScores[genre] = score * 0.3;
  }

  // Rising genres get a big boost — they represent where taste is heading
  if (drift?.genreDrift?.rising) {
    for (const g of drift.genreDrift.rising) {
      const key = g.genre?.toLowerCase();
      if (!key) continue;
      if (GENRE_PARAMS[key] !== undefined) {
        futureScores[key] = (futureScores[key] || 0) + topScore * 0.6 + Math.abs(g.delta || 0) * 3;
      }
    }
  }

  // Declining genres get penalized further
  if (drift?.genreDrift?.declining) {
    for (const g of drift.genreDrift.declining) {
      const key = g.genre?.toLowerCase();
      if (!key) continue;
      if (futureScores[key]) futureScores[key] *= 0.3;
    }
  }

  // Phantom genres: adjacent to top & rising genres, not in current library
  // These are the core of future positions — score them competitively
  const risingGenres = drift?.genreDrift?.rising?.map((g) => g.genre?.toLowerCase()).filter(Boolean) || [];
  const topRecent = userGenres.slice(0, 5).map((g) => g.genre);
  const seeds = [...new Set([...risingGenres, ...topRecent])];

  for (const seed of seeds) {
    const adjacent = GENRE_ADJACENCY[seed] || [];
    for (const adj of adjacent) {
      const key = adj.toLowerCase();
      if (GENRE_PARAMS[key] === undefined) continue;
      if (!userGenreSet.has(key)) {
        // Phantoms get competitive scores — they should surface at positions 80-100
        const seedScore = futureScores[seed] || topScore * 0.3;
        futureScores[key] = Math.max(futureScores[key] || 0, seedScore * 0.8);
      }
    }
    // Also check reverse adjacency
    for (const [key, neighbors] of Object.entries(GENRE_ADJACENCY)) {
      if (neighbors.some((n) => n.toLowerCase() === seed) && !userGenreSet.has(key)) {
        if (GENRE_PARAMS[key] !== undefined) {
          const seedScore = futureScores[seed] || topScore * 0.3;
          futureScores[key] = Math.max(futureScores[key] || 0, seedScore * 0.6);
        }
      }
    }
  }

  return Object.entries(futureScores)
    .filter(([genre]) => GENRE_PARAMS[genre] !== undefined)
    .map(([genre, score]) => ({ genre, score }))
    .sort((a, b) => b.score - a.score); // highest first
}

// ---------------------------------------------------------------------------
// Precompute 11 positions from ranked spectrum
// ---------------------------------------------------------------------------

function precomputePositions(spectrum, tasteColor, drift) {
  const { antiGenres, userGenres, futureGenres } = spectrum;
  const positions = [];

  // Allocate center positions (3-7) proportionally to top user genres.
  // Each dominant genre gets its own block(s) based on listening share.
  const genreBlocks = allocateGenreBlocks(userGenres);

  for (let i = 0; i <= 10; i++) {
    const sets = pickSetsForPosition(i, antiGenres, userGenres, futureGenres, genreBlocks);
    const config = computeConfigFromSets(sets);
    const promptText = buildPositionPrompt(i, sets, tasteColor, drift);
    positions.push({ sets, config, promptText });
  }

  return positions;
}

/**
 * Allocate center positions (3-7) to top genres proportionally.
 * Returns a Map: positionIndex → [{ genre, score }]
 *
 * If electronic=50, rock=42, house=30 the 5 center slots might be:
 *   pos 3: house, pos 4: rock, pos 5: electronic, pos 6: electronic, pos 7: rock
 */
function allocateGenreBlocks(userGenres) {
  const CENTER_SLOTS = 5; // positions 3-7
  const CENTER_START = 3;
  const blocks = new Map();

  if (!userGenres.length) return blocks;

  // Take top genres until we have enough to fill center slots
  const topGenres = userGenres.slice(0, 10); // candidates
  const totalScore = topGenres.reduce((sum, g) => sum + g.score, 0);
  if (totalScore === 0) return blocks;

  // Calculate how many slots each genre deserves (min 1 if it qualifies)
  const allocation = [];
  let slotsLeft = CENTER_SLOTS;

  for (const g of topGenres) {
    if (slotsLeft <= 0) break;
    const proportion = g.score / totalScore;
    const rawSlots = proportion * CENTER_SLOTS;
    // Genre gets a block if it has ≥ 0.5 slots worth of share, or it's top 3
    const slots = Math.max(1, Math.round(rawSlots));
    const clamped = Math.min(slots, slotsLeft);
    allocation.push({ genre: g.genre, score: g.score, slots: clamped });
    slotsLeft -= clamped;
  }

  // Assign to positions: #1 genre gets center (pos 5), then expand outward
  // Fill order: 5, 4, 6, 3, 7 (center-out)
  const fillOrder = [5, 4, 6, 3, 7];
  let fillIdx = 0;

  // Build a set of all allocated primary genres so we can pick supporting ones
  const allocatedPrimaries = new Set(allocation.map((a) => a.genre));

  for (const entry of allocation) {
    for (let s = 0; s < entry.slots && fillIdx < fillOrder.length; s++) {
      const posIdx = fillOrder[fillIdx];

      // Primary genre owns the block at weight 1.0
      const block = [{ genre: entry.genre, score: entry.score }];

      // Fill with related sub-genres the user actually listens to (weight 0.3–0.6)
      // Source 1: adjacency map — sub-genres of the primary
      const adjacent = (GENRE_ADJACENCY[entry.genre] || []).map((g) => g.toLowerCase());
      // Source 2: user genres that contain the primary as a substring (e.g. "deep house" for "house")
      const subGenres = userGenres.filter((g) =>
        g.genre !== entry.genre &&
        !allocatedPrimaries.has(g.genre) &&
        !block.some((b) => b.genre === g.genre) &&
        (adjacent.includes(g.genre) || g.genre.includes(entry.genre) || entry.genre.includes(g.genre))
      );

      for (const sub of subGenres.slice(0, 4)) {
        block.push({ genre: sub.genre, score: sub.score });
      }

      // If still thin, pad with the user's next-highest genres not yet used
      if (block.length < 3) {
        const used = new Set(block.map((b) => b.genre));
        for (const g of userGenres) {
          if (block.length >= 4) break;
          if (!used.has(g.genre) && !allocatedPrimaries.has(g.genre)) {
            block.push({ genre: g.genre, score: g.score });
            used.add(g.genre);
          }
        }
      }

      blocks.set(posIdx, block);
      fillIdx++;
    }
  }

  return blocks;
}

/**
 * Pick genre sets for a position index (0-10).
 * 0-2:   Pure anti-taste (lowest-ranked genres)
 * 3-7:   User taste — each block owned by a genre proportionally
 * 8-10:  Future projections
 */
function pickSetsForPosition(posIdx, antiGenres, userGenres, futureGenres, genreBlocks) {
  // Center positions with allocated genre blocks — primary genre dominant, sub-genres as texture
  if (genreBlocks.has(posIdx)) {
    const block = genreBlocks.get(posIdx);
    const primaryScore = block[0].score || 1;
    return block.map((g, i) => ({
      genre: g.genre,
      // Primary gets 1.0, sub-genres scaled relative to primary (clamped 0.2–0.5)
      weight: i === 0 ? 1.0 : Math.round(Math.min(0.5, Math.max(0.2, (g.score / primaryScore) * 0.5)) * 100) / 100,
    }));
  }

  if (posIdx <= 2) {
    // Pure anti-taste: walk up the ranked list from the very bottom
    const antiLen = antiGenres.length;
    const sliceSize = Math.max(3, Math.ceil(antiLen / 3));
    const offset = posIdx * sliceSize;
    const picks = antiGenres.slice(offset, offset + 5);
    while (picks.length < 3 && antiGenres.length > 0) {
      picks.push(antiGenres[picks.length % antiGenres.length]);
    }
    return assignWeights(picks);

  } else if (posIdx <= 7) {
    // Unallocated center position — fallback to next user genres not already in blocks
    const allocated = new Set();
    for (const [, block] of genreBlocks) {
      for (const g of block) allocated.add(g.genre);
    }
    const remaining = userGenres.filter((g) => !allocated.has(g.genre));
    const picks = remaining.length ? remaining.slice(0, 3) : userGenres.slice(0, 3);
    return assignWeights(picks);

  } else {
    // Future (8-10): increasingly exploratory
    const t = (posIdx - 7) / 3; // 0.33 → 1.0
    const currentCount = Math.round(3 * (1 - t));
    const futureCount = 3 - currentCount;

    const currentPicks = userGenres.slice(0, currentCount);
    const currentSet = new Set(currentPicks.map((g) => g.genre));
    const userGenreSet = new Set(userGenres.map((g) => g.genre));

    const futureCandidates = futureGenres.filter((g) => !currentSet.has(g.genre));
    let futurePicks;
    if (posIdx === 10) {
      const phantoms = futureCandidates.filter((g) => !userGenreSet.has(g.genre));
      futurePicks = (phantoms.length >= futureCount ? phantoms : futureCandidates).slice(0, futureCount);
    } else {
      futurePicks = futureCandidates.slice(0, futureCount);
    }
    while (futurePicks.length < futureCount && futureGenres.length > 0) {
      futurePicks.push(futureGenres[futurePicks.length % futureGenres.length]);
    }

    return assignWeights([...currentPicks, ...futurePicks]);
  }
}

function assignWeights(picks) {
  if (!picks.length) return [{ genre: 'contemporary music', weight: 1.0 }];
  const top = picks.slice(0, 5);
  const maxScore = Math.max(...top.map((g) => g.score || 0), 1);
  return top.map((g) => ({
    genre: g.genre,
    weight: Math.round(Math.max((g.score || 0) / maxScore, 0.15) * 100) / 100,
  }));
}

function computeConfigFromSets(sets) {
  let bpm = 0, density = 0, brightness = 0, totalWeight = 0;
  for (const { genre, weight } of sets) {
    const params = lookupGenreParams(genre);
    bpm += params.bpm * weight;
    density += params.density * weight;
    brightness += params.brightness * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return { bpm: 110, density: 0.5, brightness: 0.5 };
  return {
    bpm: Math.round(bpm / totalWeight),
    density: round2(density / totalWeight),
    brightness: round2(brightness / totalWeight),
  };
}

// ---------------------------------------------------------------------------
// Taste color: personality/mood/decade descriptors
// ---------------------------------------------------------------------------

function buildTasteColor(intelligence, historyMetrics) {
  const color = { personality: [], decades: [], tempo: null };

  if (intelligence?.personalityTags?.length) {
    color.personality = intelligence.personalityTags.slice(0, 4);
  }

  if (intelligence?.decadeSplit) {
    color.decades = Object.entries(intelligence.decadeSplit)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([decade]) => `${decade}s`);
  }

  if (intelligence?.tempoPreference) {
    color.tempo = intelligence.tempoPreference;
  }

  return color;
}

function buildPositionPrompt(posIdx, sets, tasteColor, drift) {
  const genres = sets.map((s) => s.genre);

  if (posIdx <= 2) {
    return genres.join(', ') + '. Authentic instrumentation and production for these genres';
  }

  if (posIdx <= 4) {
    const hint = tasteColor.personality.length
      ? `. ${tasteColor.personality[0]} undertone`
      : '';
    return genres.join(', ') + hint;
  }

  if (posIdx === 5) {
    const parts = [genres.join(', ')];
    if (tasteColor.personality.length) {
      parts.push(tasteColor.personality.join(', '));
    }
    if (tasteColor.decades.length) {
      parts.push(tasteColor.decades.map((d) => `${d} sound`).join(', '));
    }
    if (tasteColor.tempo) {
      parts.push(`${tasteColor.tempo} tempo`);
    }
    return parts.join('. ');
  }

  if (posIdx <= 7) {
    const parts = [genres.join(', ')];
    if (tasteColor.personality.length) {
      parts.push(tasteColor.personality.slice(0, 2).join(', '));
    }
    const risingGenres = drift?.genreDrift?.rising?.slice(0, 2).map((g) => g.genre);
    if (risingGenres?.length) {
      parts.push(`leaning into ${risingGenres.join(' and ')}`);
    }
    return parts.join('. ');
  }

  // Deep future (8-10)
  const parts = [genres.join(', ')];
  parts.push('forward-looking, exploratory');
  if (drift?.predictions?.length) {
    const pred = drift.predictions[0].replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '').trim();
    if (pred.length > 5) parts.push(pred);
  }
  return parts.join('. ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the precomputed anchor positions from the user's taste data.
 * Returns { positions, anti, current, future } (positions = 11 entries for 0,10,...,100).
 * @param {object} intelligence
 * @param {object} historyMetrics
 * @param {object} spotifyData
 * @param {object} cachedArtistTags - { artistName: [tag1, tag2, ...] } from Last.fm cache
 */
export function computeAnchors(intelligence, historyMetrics, spotifyData, cachedArtistTags = {}) {
  // Step 1: Score every genre in the table against listening data
  const scores = scoreAllGenres(spotifyData, historyMetrics, intelligence, cachedArtistTags);

  // Step 2: Build ranked spectrum — sorted list split into anti/user/future
  const spectrum = buildRankedSpectrum(scores, intelligence);

  // Step 3: Build taste descriptors
  const tasteColor = buildTasteColor(intelligence, historyMetrics);
  const drift = intelligence?.tasteDrift;

  // Step 4: Precompute 11 positions
  const positions = precomputePositions(spectrum, tasteColor, drift);

  // Debug: log the spectrum
  console.log('[Spotify Brainer] Realtime spectrum:',
    'userGenres(top10):', spectrum.userGenres.slice(0, 10).map((g) => `${g.genre}(${round2(g.score)})`),
    'antiGenres(bottom5):', spectrum.antiGenres.slice(0, 5).map((g) => g.genre),
    'futureGenres(top5):', spectrum.futureGenres.slice(0, 5).map((g) => `${g.genre}(${round2(g.score)})`),
  );
  console.log('[Spotify Brainer] Position 5 (center):', positions[5].sets.map((s) => s.genre).join(', '));

  return {
    positions,
    // Legacy compat
    anti: {
      prompt: positions[0].promptText,
      params: { ...positions[0].config, guidance: 4.0, temperature: 1.1, top_k: 40, music_generation_mode: 'QUALITY' },
    },
    current: {
      prompt: positions[5].promptText,
      params: { ...positions[5].config, guidance: 4.0, temperature: 1.1, top_k: 40, music_generation_mode: 'QUALITY' },
    },
    future: {
      prompt: positions[10].promptText,
      params: { ...positions[10].config, guidance: 4.0, temperature: 1.1, top_k: 40, music_generation_mode: 'QUALITY' },
    },
  };
}

/**
 * Interpolate between precomputed positions at a given slider value (0-100).
 * Returns { prompts: [{text, weight}], config: {...} }
 */
export function interpolateAtPosition(anchors, position) {
  const pos = clamp(position, 0, 100);
  const positions = anchors.positions;

  const idx = pos / 10; // 0-10 continuous
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, 10);
  const t = idx - lo;

  const posA = positions[lo];
  const posB = positions[hi];

  // Blend prompts
  const prompts = blendPrompts(posA, posB, t);

  // Lerp config
  const config = {
    bpm: Math.round(lerp(posA.config.bpm, posB.config.bpm, t)),
    density: round2(lerp(posA.config.density, posB.config.density, t)),
    brightness: round2(lerp(posA.config.brightness, posB.config.brightness, t)),
    guidance: 4.0,
    temperature: 1.1,
    top_k: 40,
    music_generation_mode: 'QUALITY',
  };

  return { prompts, config };
}

function blendPrompts(posA, posB, t) {
  if (t < 0.01) return [{ text: posA.promptText, weight: 3.0 }];
  if (t > 0.99) return [{ text: posB.promptText, weight: 3.0 }];
  return [
    { text: posA.promptText, weight: round2(3.0 * (1 - t)) },
    { text: posB.promptText, weight: round2(3.0 * t) },
  ];
}

// --- Helpers ---
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round2(v) { return Math.round(v * 100) / 100; }
