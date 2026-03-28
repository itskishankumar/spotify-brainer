// Spotify Brainer — Lyria Prompt Builder
//
// Single agentic LLM call that:
//   1. Parses the user's intent (understands date references, mood)
//   2. Calls get_history_taste with date params if a period is mentioned
//   3. Uses its music knowledge of the specific artists/tracks to output a Lyria JSON prompt
//
// buildFallbackLyriaPrompt() is used when no LLM is configured.

// ---------------------------------------------------------------------------
// buildMusicAgentSystemPrompt — combined system prompt for the single agentic call.
// Today's date is injected so the LLM can resolve relative references.
// ---------------------------------------------------------------------------
export function buildMusicAgentSystemPrompt(historyMetrics, spotifyData, intelligence, lastfmTags = []) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push(`Today is ${today}. You are a music prompt engineer for Google Lyria.`);
  lines.push('');
  lines.push('Your job:');
  lines.push('1. Understand the user\'s intent — a time period, a playlist, a mood, a specific artist/track vibe, or a general taste query');
  lines.push('2. Gather the musical data you need using tools:');
  lines.push('   - Time period → call get_history_taste with from/to dates');
  lines.push('   - Playlist reference → call get_playlists to find it and its tracks, then call get_lastfm_tags with those tracks to get sonic metadata');
  lines.push('   - General taste → call get_top_artists or get_top_tracks, then get_lastfm_tags for the results');
  lines.push('   - No specific reference → use the baseline profile context below');
  lines.push('3. Use the lastfmTags (per-artist, per-track, and aggregated) plus your music knowledge to translate the sound into a Lyria prompt');
  lines.push('4. Output the final Lyria prompt as a JSON object — nothing else');
  lines.push('');
  lines.push('## Tool rules');
  lines.push('- You have access to all Spotify data tools: playlists, top artists/tracks, history, taste profile, search, and more');
  lines.push('- Use get_lastfm_tags to fetch detailed genre/mood/style tags for specific artists or tracks — pass artists and/or tracks in a single call');
  lines.push('- get_history_taste auto-enriches results with Last.fm tags; for playlists or search results, call get_lastfm_tags explicitly');
  lines.push('- Keep tool calls efficient — fetch what you need, then produce the prompt');
  lines.push('');
  lines.push('## Lyria output rules');
  lines.push('- NEVER include artist names, band names, song titles, or album names — copyright filter will block generation');
  lines.push('- Use your knowledge of those specific tracks/artists to infer accurate BPM, key, instruments, and production style');
  lines.push('- Use generic instrument descriptions (e.g. "synth arpeggios", "fingerpicked acoustic guitar", "808 sub bass")');
  lines.push('- If lastfmTags are present (in the profile below or in tool responses), use them as your PRIMARY source of sonic/style info — they describe subgenres, moods, and production styles more precisely than generic genre labels (e.g. "shoegaze", "dream-pop", "lo-fi", "atmospheric", "melancholic")');
  lines.push('- Per-artist lastfmTags tell you each artist\'s specific sound; the aggregated lastfmTags show the overall vibe — use both to pick instruments, production style, and mood');
  lines.push('');
  lines.push('## Output format');
  lines.push('Output a single JSON object — no explanation, no markdown, nothing outside the JSON:');
  lines.push('{"bpm":<int>,"key":"e.g. A minor","genre":"1-3 words","instruments":["..."],"production":"...","mood":"3-5 adjectives","intensity":<1-10>}');
  lines.push('');

  // Inject overall taste profile as baseline context
  const ctx = buildBaselineContext(intelligence, historyMetrics, spotifyData, lastfmTags);
  if (Object.keys(ctx).length) {
    lines.push('## Overall taste profile (baseline — use when no period is specified)');
    lines.push(JSON.stringify(ctx, null, 2));
  }

  return lines.join('\n');
}

function buildBaselineContext(intelligence, historyMetrics, spotifyData, lastfmTags = []) {
  const ctx = {};

  if (intelligence?.topArtistsAllTime?.length) {
    ctx.topArtists = intelligence.topArtistsAllTime.slice(0, 15).map((a) => a.name);
  }

  const genres = new Set();
  for (const range of ['long', 'medium', 'short']) {
    for (const artist of spotifyData?.topArtists?.[range] || []) {
      for (const g of artist.genres || []) genres.add(g);
    }
  }
  if (genres.size) ctx.spotifyGenres = [...genres].slice(0, 20);

  if (lastfmTags?.length) {
    ctx.lastfmTags = lastfmTags.map((t) => t.name);
  }

  if (intelligence?.personalityTags?.length) ctx.personalityTags = intelligence.personalityTags;
  if (intelligence?.tempoPreference) ctx.tempoPreference = intelligence.tempoPreference;

  const tb = historyMetrics?.temporalBehavior;
  if (tb?.nightOwlPct !== undefined) ctx.nightOwlPct = tb.nightOwlPct + '%';
  if (tb?.peakHour !== undefined) ctx.peakListeningHour = tb.peakHour + ':00';

  const te = historyMetrics?.tasteEvolution;
  if (te?.length) {
    ctx.tasteByYear = te.slice(-3).map((y) => ({
      year: y.period,
      topArtists: y.topArtists?.slice(0, 4).map((a) => a.name) || [],
    }));
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// assembleLyriaPrompt — turns the LLM's JSON fields into a Lyria-ready string.
// ---------------------------------------------------------------------------
export function assembleLyriaPrompt(fields) {
  const { bpm, key, genre, instruments, production, mood, intensity } = fields;
  const instrStr = Array.isArray(instruments) ? instruments.join(', ') : instruments;
  return [
    `An original ${genre} composition at ${bpm} BPM in ${key} featuring ${instrStr}.`,
    `${production}.`,
    `Mood: ${mood}. Intensity: ${intensity}/10.`,
    `Avoid: no vocals, no spoken word.`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// buildFallbackLyriaPrompt — used when no LLM is configured.
// Derives a profile from Spotify genre tags and behavioral signals.
// ---------------------------------------------------------------------------
export function buildFallbackLyriaPrompt({ periodStats, historyMetrics, spotifyData, intelligence, moodHint, lastfmTags = [] }) {
  const PROFILES = {
    pop:        { bpm: 118, key: 'G major', genre: 'pop',        instruments: 'clean electric guitar, layered synth pads, crisp snare, punchy bass', production: 'modern pop production, wide stereo image' },
    'indie pop':{ bpm: 108, key: 'D minor', genre: 'indie',      instruments: 'jangly guitar, piano, brushed drums, warm bass',                       production: 'bedroom-pop texture, reverb-drenched guitar' },
    country:    { bpm: 100, key: 'G major', genre: 'country',    instruments: 'acoustic guitar, pedal steel, fiddle, acoustic kick drum, bass',        production: 'Nashville production, open room acoustics' },
    rb:         { bpm: 88,  key: 'F minor', genre: 'R&B',        instruments: 'electric piano, warm bass synth, soft hi-hats, lush string pads',      production: 'contemporary R&B, thick low end' },
    'hip-hop':  { bpm: 90,  key: 'D minor', genre: 'hip-hop',    instruments: 'deep kick, punchy snare, sampled string loop, sub bass, hi-hats',      production: 'trap production, heavy compression' },
    rock:       { bpm: 130, key: 'E minor', genre: 'rock',       instruments: 'distorted electric guitar, crashing cymbals, electric bass, pounding kick', production: 'live band sound, natural room reverb' },
    folk:       { bpm: 88,  key: 'C major', genre: 'folk',       instruments: 'fingerpicked acoustic guitar, light hand percussion, upright bass, piano', production: 'natural acoustic, warm mix' },
    electronic: { bpm: 128, key: 'A minor', genre: 'electronic', instruments: 'synth lead, arpeggio sequence, four-on-the-floor kick, deep sub bass', production: 'electronic production, sidechain compression' },
  };

  const RULES = [
    { keys: ['hip-hop', 'rap', 'trap', 'drill'],       k: 'hip-hop'    },
    { keys: ['r&b', 'soul', 'funk', 'neo soul'],       k: 'rb'         },
    { keys: ['country', 'bluegrass', 'americana'],     k: 'country'    },
    { keys: ['folk', 'singer-songwriter'],             k: 'folk'       },
    { keys: ['electronic', 'edm', 'house', 'techno'], k: 'electronic' },
    { keys: ['rock', 'metal', 'punk', 'grunge'],       k: 'rock'       },
    { keys: ['indie'],                                 k: 'indie pop'  },
  ];

  const weights = {};
  const agm = {};
  for (const range of ['long', 'medium', 'short']) {
    for (const a of spotifyData?.topArtists?.[range] || []) {
      if (a.name && !agm[a.name]) agm[a.name] = a.genres || [];
    }
  }
  const artists = periodStats?.topArtists || intelligence?.topArtistsAllTime?.slice(0, 12) || [];
  for (const a of artists) {
    for (const g of agm[a.name] || []) weights[g] = (weights[g] || 0) + (a.plays || 1);
  }

  // Boost scores with Last.fm tags — these are often more descriptive than Spotify genres
  const tagNames = lastfmTags.map((t) => typeof t === 'string' ? t : t.name);
  for (const tag of tagNames) {
    const tl = tag.toLowerCase();
    for (const rule of RULES) {
      if (rule.keys.some((k) => tl.includes(k))) { weights[tag] = (weights[tag] || 0) + 50; break; }
    }
  }

  const scores = {};
  for (const [g, w] of Object.entries(weights)) {
    const gl = g.toLowerCase();
    for (const rule of RULES) {
      if (rule.keys.some((k) => gl.includes(k))) { scores[rule.k] = (scores[rule.k] || 0) + w; break; }
    }
  }

  const profileKey = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pop';
  const p = PROFILES[profileKey] || PROFILES.pop;

  let { bpm, key } = p;
  let intensity = 5;

  const nightOwl    = periodStats?.nightOwlPct  ?? historyMetrics?.temporalBehavior?.nightOwlPct ?? 0;
  const repeatRatio = periodStats?.repeatRatio  ?? historyMetrics?.replayObsession?.repeatRatio ?? 0;
  if (nightOwl > 30)    { bpm = Math.round(bpm * 0.92); intensity--; }
  if (repeatRatio > 40) { intensity++; }

  const hint = (moodHint || '').toLowerCase();
  if (/upbeat|energetic/.test(hint))      { bpm = Math.round(bpm * 1.1); intensity += 2; }
  else if (/chill|calm|relax/.test(hint)) { bpm = Math.round(bpm * 0.9); intensity -= 2; }
  intensity = Math.max(1, Math.min(10, intensity));

  // Extract mood and production descriptors from Last.fm tags
  const MOOD_TAGS = ['melancholic', 'melancholy', 'sad', 'happy', 'euphoric', 'dark', 'dreamy',
    'ethereal', 'aggressive', 'angry', 'chill', 'uplifting', 'nostalgic', 'romantic',
    'energetic', 'mellow', 'haunting', 'upbeat', 'somber', 'intense', 'peaceful', 'bittersweet'];
  const PRODUCTION_TAGS = ['shoegaze', 'lo-fi', 'ambient', 'psychedelic', 'experimental',
    'minimalist', 'atmospheric', 'noise', 'glitch', 'chillwave', 'synthwave', 'vaporwave',
    'acoustic', 'orchestral', 'chamber', 'industrial', 'post-rock', 'post-punk', 'new-wave',
    'dream-pop', 'noise-pop', 'art-rock', 'art-pop', 'neo-psychedelia'];

  const moodFromTags = tagNames.filter((t) => MOOD_TAGS.includes(t.toLowerCase()));
  const productionFromTags = tagNames.filter((t) => PRODUCTION_TAGS.includes(t.toLowerCase()));

  const mood = moodFromTags.length >= 2 ? moodFromTags.slice(0, 4).join(', ') : 'emotive';
  let production = p.production;
  if (productionFromTags.length) {
    production += ', ' + productionFromTags.slice(0, 3).join(', ') + ' influences';
  }

  return assembleLyriaPrompt({ bpm, key, genre: p.genre, instruments: p.instruments, production, mood, intensity });
}
