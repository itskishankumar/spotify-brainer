// Spotify Brainer — Realtime Anchor Computation + Interpolation
//
// Computes three prompt anchors from the user's taste data:
//   0   = Anti-Taste (blind spots)
//   50  = Current Taste (comfort zone)
//   100 = Future Me (where taste is heading)
//
// The slider interpolates smoothly between anchors — every position
// from 0–100 produces a unique blend of prompts and generation parameters.

// Anti-taste genre pool (subset for realtime — full pool lives in prompt-builder.js)
const RT_ANTI_POOL = [
  'Gnawa', 'qawwali', 'gamelan-influenced', 'Tuvan throat singing', 'ethio-jazz',
  'acid house', 'jungle', 'IDM', 'glitch', 'gabber', 'footwork', 'deconstructed club',
  'stoner doom', 'black metal', 'grindcore', 'noise rock', 'funeral doom',
  'musique concrète', 'harsh noise', 'drone', 'dark ambient', 'microtonal', 'zeuhl',
  'bebop', 'free jazz', 'Afro-Cuban jazz', 'gypsy jazz',
  'Gregorian chant', 'Baroque', 'Impressionist', 'choral polyphony',
  'rockabilly', '1960s psychedelia', 'exotica', 'space age pop', 'coldwave',
  'phonk', 'grime', 'chopped & screwed', 'abstract hip-hop',
  'delta blues', 'freak folk', 'rebetiko', 'Hindustani classical',
];

/**
 * Build the three anchor points from the user's taste data.
 * Each anchor has: { prompt (string), params (object) }
 */
export function computeAnchors(intelligence, historyMetrics, spotifyData) {
  const currentPrompt = buildCurrentPrompt(intelligence, spotifyData, historyMetrics);
  const anti = buildAntiPrompt(intelligence, spotifyData);
  const futurePrompt = buildFuturePrompt(intelligence, historyMetrics);

  // Derive density/brightness/bpm baselines from current taste
  const profile = inferProfileParams(intelligence, spotifyData);

  // Each anchor gets genre-appropriate params — quality stays high across the board,
  // but BPM, density, and brightness match the genre character.
  return {
    anti: {
      prompt: anti.prompt,
      params: {
        guidance: 4.0,
        temperature: 1.1,
        top_k: 40,
        bpm: anti.bpm,
        density: anti.density,
        brightness: anti.brightness,
        music_generation_mode: 'QUALITY',
      },
    },
    current: {
      prompt: currentPrompt,
      params: {
        guidance: 4.0,
        temperature: 1.1,
        top_k: 40,
        bpm: profile.bpm,
        density: profile.density,
        brightness: profile.brightness,
        music_generation_mode: 'QUALITY',
      },
    },
    future: {
      prompt: futurePrompt,
      params: {
        guidance: 4.0,
        temperature: 1.1,
        top_k: 40,
        bpm: clamp(profile.bpm + profile.bpmDrift, 60, 200),
        density: clamp(profile.density + profile.densityDrift, 0, 1),
        brightness: clamp(profile.brightness + profile.brightnessDrift, 0, 1),
        music_generation_mode: 'QUALITY',
      },
    },
  };
}

/**
 * Interpolate between anchors at a given slider position (0–100).
 * Returns { prompts: [{text, weight}], config: {...} }
 */
export function interpolateAtPosition(anchors, position) {
  const pos = clamp(position, 0, 100);
  let anchorA, anchorB, t;

  if (pos <= 50) {
    // Anti-taste ↔ Current
    anchorA = anchors.anti;
    anchorB = anchors.current;
    t = pos / 50;
  } else {
    // Current ↔ Future
    anchorA = anchors.current;
    anchorB = anchors.future;
    t = (pos - 50) / 50;
  }

  // Blend prompts as weighted pair
  const weightA = 3.0 * (1 - t);
  const weightB = 3.0 * t;
  const prompts = [];
  if (weightA > 0.01) prompts.push({ text: anchorA.prompt, weight: round2(weightA) });
  if (weightB > 0.01) prompts.push({ text: anchorB.prompt, weight: round2(weightB) });

  // Lerp all numeric params — genre-appropriate values blend smoothly
  const config = {};
  config.bpm = Math.round(lerp(anchorA.params.bpm, anchorB.params.bpm, t));
  config.guidance = round2(lerp(anchorA.params.guidance, anchorB.params.guidance, t));
  config.temperature = round2(lerp(anchorA.params.temperature, anchorB.params.temperature, t));
  config.top_k = Math.round(lerp(anchorA.params.top_k, anchorB.params.top_k, t));
  config.density = round2(lerp(anchorA.params.density, anchorB.params.density, t));
  config.brightness = round2(lerp(anchorA.params.brightness, anchorB.params.brightness, t));
  config.music_generation_mode = 'QUALITY';

  return { prompts, config };
}

// --- Prompt builders (no LLM, fast, from cached data) ---

function buildCurrentPrompt(intelligence, spotifyData, historyMetrics) {
  // IMPORTANT: Lyria RealTime filters artist/band names — use only genre/mood/style descriptors
  const parts = [];

  // Top genres
  const genres = collectGenres(spotifyData);
  if (genres.length) parts.push(genres.slice(0, 10).join(', '));

  // Personality tags
  if (intelligence?.personalityTags?.length) {
    parts.push(intelligence.personalityTags.slice(0, 4).join(', '));
  }

  // Decade distribution
  if (intelligence?.decadeSplit) {
    const topDecades = Object.entries(intelligence.decadeSplit)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([decade]) => `${decade}s sound`);
    if (topDecades.length) parts.push(topDecades.join(', '));
  }

  // Tempo hint
  if (intelligence?.tempoPreference) {
    parts.push(`${intelligence.tempoPreference} tempo`);
  }

  return parts.join('. ') || 'contemporary popular music, melodic, polished production';
}

// Genre → typical BPM/density/brightness for anti-taste parameter inference
const GENRE_PARAMS = {
  // Slow + sparse
  'Gregorian chant': { bpm: 65, density: 0.15, brightness: 0.3 },
  'dark ambient': { bpm: 70, density: 0.1, brightness: 0.2 },
  'drone': { bpm: 65, density: 0.1, brightness: 0.25 },
  'funeral doom': { bpm: 60, density: 0.3, brightness: 0.2 },
  'stoner doom': { bpm: 70, density: 0.5, brightness: 0.3 },
  'Hindustani classical': { bpm: 75, density: 0.4, brightness: 0.5 },
  'delta blues': { bpm: 80, density: 0.3, brightness: 0.4 },
  'fado': { bpm: 75, density: 0.25, brightness: 0.4 },
  'rebetiko': { bpm: 85, density: 0.4, brightness: 0.5 },
  'freak folk': { bpm: 90, density: 0.3, brightness: 0.5 },
  // Mid tempo
  'bebop': { bpm: 160, density: 0.7, brightness: 0.6 },
  'free jazz': { bpm: 140, density: 0.8, brightness: 0.5 },
  'Afro-Cuban jazz': { bpm: 120, density: 0.7, brightness: 0.7 },
  'gypsy jazz': { bpm: 140, density: 0.6, brightness: 0.7 },
  'ethio-jazz': { bpm: 110, density: 0.5, brightness: 0.6 },
  'qawwali': { bpm: 100, density: 0.5, brightness: 0.5 },
  'Gnawa': { bpm: 95, density: 0.5, brightness: 0.4 },
  'gamelan-influenced': { bpm: 90, density: 0.6, brightness: 0.7 },
  'Tuvan throat singing': { bpm: 75, density: 0.3, brightness: 0.3 },
  'musique concrète': { bpm: 90, density: 0.5, brightness: 0.4 },
  'microtonal': { bpm: 100, density: 0.5, brightness: 0.5 },
  'zeuhl': { bpm: 120, density: 0.7, brightness: 0.4 },
  'coldwave': { bpm: 120, density: 0.4, brightness: 0.3 },
  'Baroque': { bpm: 100, density: 0.5, brightness: 0.6 },
  'Impressionist': { bpm: 80, density: 0.35, brightness: 0.6 },
  'choral polyphony': { bpm: 70, density: 0.4, brightness: 0.5 },
  '1960s psychedelia': { bpm: 115, density: 0.6, brightness: 0.6 },
  'exotica': { bpm: 105, density: 0.4, brightness: 0.7 },
  'space age pop': { bpm: 110, density: 0.4, brightness: 0.7 },
  'rockabilly': { bpm: 170, density: 0.6, brightness: 0.7 },
  'abstract hip-hop': { bpm: 85, density: 0.5, brightness: 0.4 },
  'phonk': { bpm: 130, density: 0.6, brightness: 0.3 },
  'chopped & screwed': { bpm: 65, density: 0.4, brightness: 0.3 },
  // Fast + dense
  'acid house': { bpm: 128, density: 0.7, brightness: 0.6 },
  'jungle': { bpm: 165, density: 0.8, brightness: 0.5 },
  'IDM': { bpm: 135, density: 0.7, brightness: 0.5 },
  'glitch': { bpm: 130, density: 0.8, brightness: 0.5 },
  'gabber': { bpm: 180, density: 0.9, brightness: 0.4 },
  'footwork': { bpm: 160, density: 0.8, brightness: 0.5 },
  'deconstructed club': { bpm: 140, density: 0.7, brightness: 0.4 },
  'grime': { bpm: 140, density: 0.7, brightness: 0.4 },
  'black metal': { bpm: 170, density: 0.9, brightness: 0.2 },
  'grindcore': { bpm: 190, density: 0.95, brightness: 0.3 },
  'noise rock': { bpm: 140, density: 0.8, brightness: 0.3 },
  'harsh noise': { bpm: 120, density: 0.9, brightness: 0.3 },
};

function buildAntiPrompt(intelligence, spotifyData) {
  const userGenres = new Set(collectGenres(spotifyData).map((g) => g.toLowerCase()));

  // Pick genres from pool that the user doesn't listen to
  const candidates = RT_ANTI_POOL.filter((g) => !userGenres.has(g.toLowerCase()));
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 5);

  // Infer BPM/density/brightness from the picked genres
  let bpm = 0, density = 0, brightness = 0, count = 0;
  for (const genre of picked) {
    const p = GENRE_PARAMS[genre];
    if (p) {
      bpm += p.bpm;
      density += p.density;
      brightness += p.brightness;
      count++;
    }
  }
  if (count > 0) {
    bpm = Math.round(bpm / count);
    density = round2(density / count);
    brightness = round2(brightness / count);
  } else {
    bpm = 110; density = 0.5; brightness = 0.5;
  }

  return {
    prompt: picked.join(', ') + '. Authentic instrumentation and production for these genres',
    bpm: clamp(bpm, 60, 200),
    density: clamp(density, 0, 1),
    brightness: clamp(brightness, 0, 1),
  };
}

function buildFuturePrompt(intelligence, historyMetrics) {
  // IMPORTANT: Lyria RealTime filters artist/band names — use only genre/mood/style descriptors
  const parts = [];
  const drift = intelligence?.tasteDrift;

  if (drift) {
    // Rising genres are the primary signal
    const risingGenres = drift.genreDrift?.rising?.slice(0, 5);
    if (risingGenres?.length) {
      parts.push(risingGenres.map((g) => g.genre).join(', '));
    }

    // Decade drift direction
    if (drift.decadeDrift) {
      const rising = Object.entries(drift.decadeDrift)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
      if (rising.length) {
        parts.push(`Exploring more ${rising.map(([d]) => `${d}s`).join(' and ')} music`);
      }
    }

    // Predictions from drift analysis (text descriptions, no names)
    if (drift.predictions?.length) {
      // Filter out any predictions that might contain artist names
      const safePredictions = drift.predictions.slice(0, 2).map((p) =>
        p.replace(/toward\s+[\w\s,']+(?:and|&)\s+[\w\s]+/gi, '')
      );
      parts.push(...safePredictions.filter((p) => p.trim()));
    }
  }

  // Historical genre evolution (not artist names)
  if (drift?.historical?.concentration) {
    const conc = drift.historical.concentration;
    if (conc.trend === 'diversifying') parts.push('diversifying taste, exploring wider');
    else if (conc.trend === 'concentrating') parts.push('deepening into focused genres');
  }

  if (!parts.length) {
    return 'exploratory, forward-looking, slightly experimental take on contemporary music';
  }

  return parts.join('. ') + '. Push these trends further, extrapolate the next step';
}

// --- Helpers ---

function collectGenres(spotifyData) {
  const genres = new Set();
  for (const range of ['short', 'medium', 'long']) {
    for (const artist of spotifyData?.topArtists?.[range] || []) {
      for (const g of artist.genres || []) genres.add(g);
    }
  }
  return [...genres];
}

function inferProfileParams(intelligence, spotifyData) {
  const genres = collectGenres(spotifyData).map((g) => g.toLowerCase());
  const drift = intelligence?.tasteDrift;

  // Density: electronic/hip-hop = high, acoustic/folk = low
  let density = 0.5;
  const highDensity = ['electronic', 'edm', 'house', 'techno', 'drum and bass', 'dubstep', 'metal', 'punk', 'hip hop', 'rap', 'trap'];
  const lowDensity = ['ambient', 'folk', 'acoustic', 'classical', 'jazz', 'singer-songwriter', 'chill', 'lo-fi'];
  let dHigh = 0, dLow = 0;
  for (const g of genres) {
    if (highDensity.some((h) => g.includes(h))) dHigh++;
    if (lowDensity.some((l) => g.includes(l))) dLow++;
  }
  if (dHigh + dLow > 0) density = clamp(0.5 + (dHigh - dLow) * 0.05, 0.15, 0.85);

  // Brightness: pop/dance = bright, dark/metal/ambient = dark
  let brightness = 0.5;
  const brightGenres = ['pop', 'dance', 'disco', 'funk', 'soul', 'reggae', 'latin', 'k-pop'];
  const darkGenres = ['metal', 'doom', 'dark', 'goth', 'ambient', 'drone', 'industrial', 'post-punk'];
  let bHigh = 0, bLow = 0;
  for (const g of genres) {
    if (brightGenres.some((b) => g.includes(b))) bHigh++;
    if (darkGenres.some((d) => g.includes(d))) bLow++;
  }
  if (bHigh + bLow > 0) brightness = clamp(0.5 + (bHigh - bLow) * 0.05, 0.15, 0.85);

  // BPM from tempo preference
  const tempoMap = { slow: 75, moderate: 105, fast: 135 };
  const bpm = tempoMap[intelligence?.tempoPreference] || 110;

  // Drift direction for future anchor
  let densityDrift = 0, brightnessDrift = 0, bpmDrift = 0;
  if (drift?.genreDrift?.rising) {
    for (const g of drift.genreDrift.rising) {
      const gl = g.genre?.toLowerCase() || '';
      if (highDensity.some((h) => gl.includes(h))) { densityDrift += 0.05; bpmDrift += 5; }
      if (lowDensity.some((l) => gl.includes(l))) { densityDrift -= 0.05; bpmDrift -= 5; }
      if (brightGenres.some((b) => gl.includes(b))) brightnessDrift += 0.05;
      if (darkGenres.some((d) => gl.includes(d))) brightnessDrift -= 0.05;
    }
  }
  densityDrift = clamp(densityDrift, -0.2, 0.2);
  brightnessDrift = clamp(brightnessDrift, -0.2, 0.2);
  bpmDrift = clamp(bpmDrift, -25, 25);

  return { density, brightness, bpm, densityDrift, brightnessDrift, bpmDrift };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round2(v) { return Math.round(v * 100) / 100; }
