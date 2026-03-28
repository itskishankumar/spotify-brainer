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
export function buildMusicAgentSystemPrompt(historyMetrics, spotifyData, intelligence) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push(`Today is ${today}. You are a music prompt engineer for Google Lyria.`);
  lines.push('');
  lines.push('Your job:');
  lines.push('1. Understand the user\'s intent — including any time period they reference ("Sept 2024", "last summer", "when I was at uni")');
  lines.push('2. If a time period is mentioned, call get_history_taste with the appropriate from/to dates to fetch what they were listening to then');
  lines.push('3. Use your knowledge of the specific artists and tracks returned to translate their sound into a Lyria prompt');
  lines.push('4. Output the final Lyria prompt as a JSON object — nothing else');
  lines.push('');
  lines.push('## Tool rules');
  lines.push('- Call get_history_taste ONCE with date params for period queries — it returns top artists, tracks, and behavioral signals for that period');
  lines.push('- Do not call multiple tools for the same date range');
  lines.push('- If no time period is mentioned, skip tool calls and use the profile context below');
  lines.push('');
  lines.push('## Lyria output rules');
  lines.push('- NEVER include artist names, band names, song titles, or album names — copyright filter will block generation');
  lines.push('- Use your knowledge of those specific tracks/artists to infer accurate BPM, key, instruments, and production style');
  lines.push('- Use generic instrument descriptions (e.g. "synth arpeggios", "fingerpicked acoustic guitar", "808 sub bass")');
  lines.push('');
  lines.push('## Output format');
  lines.push('Output a single JSON object — no explanation, no markdown, nothing outside the JSON:');
  lines.push('{"bpm":<int>,"key":"e.g. A minor","genre":"1-3 words","instruments":["..."],"production":"...","mood":"3-5 adjectives","intensity":<1-10>}');
  lines.push('');

  // Inject overall taste profile as baseline context
  const ctx = buildBaselineContext(intelligence, historyMetrics, spotifyData);
  if (Object.keys(ctx).length) {
    lines.push('## Overall taste profile (baseline — use when no period is specified)');
    lines.push(JSON.stringify(ctx, null, 2));
  }

  return lines.join('\n');
}

function buildBaselineContext(intelligence, historyMetrics, spotifyData) {
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
export function buildFallbackLyriaPrompt({ periodStats, historyMetrics, spotifyData, intelligence, moodHint }) {
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
    { keys: ['hip hop', 'rap', 'trap', 'drill'],       k: 'hip-hop'    },
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

  return assembleLyriaPrompt({ bpm, key, genre: p.genre, instruments: p.instruments, production: p.production, mood: 'emotive', intensity });
}
