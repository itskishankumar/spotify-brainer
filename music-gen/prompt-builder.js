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
  lines.push('   - Future/trend reference → call get_taste_drift to see what genres and artists are rising vs fading, then lean into the emerging direction');
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
  lines.push('{"bpm":<int>,"key":"e.g. A minor","genre":"1-3 words","tags":["tag1","tag2","tag3"],"instruments":["..."],"production":"...","mood":"3-5 adjectives","intensity":<1-10>}');
  lines.push('- tags: exactly 3 short genre/style/mood descriptors for this track (e.g. ["dreamy","shoegaze","lo-fi"] or ["trap","dark","heavy"]). These are displayed to the user as labels.');
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

  const drift = intelligence?.tasteDrift;
  if (drift) {
    ctx.tasteDrift = {
      velocity: drift.velocity + '%',
      emerging: drift.emerging?.slice(0, 5).map((a) => a.name),
      fading: drift.fading?.slice(0, 5).map((a) => a.name),
      risingGenres: drift.genreDrift?.rising?.slice(0, 3).map((g) => g.genre),
      decliningGenres: drift.genreDrift?.declining?.slice(0, 3).map((g) => g.genre),
      predictions: drift.predictions,
    };
    // Include historical drift from GDPR data
    if (drift.historical) {
      ctx.tasteDrift.historical = {
        risingArtists: drift.historical.risingArtists?.slice(0, 5).map((a) => `${a.name} (${a.share12m}%→${a.share3m}%${a.momentum > 0 ? ' accelerating' : a.momentum < -0.2 ? ' decelerating' : ''})`),
        fadingArtists: drift.historical.fadingArtists?.slice(0, 5).map((a) => `${a.name} (${a.share12m}%→${a.share3m}%)`),
        newDiscoveries: drift.historical.newDiscoveries?.slice(0, 5).map((a) => a.name),
        concentration: drift.historical.concentration,
      };
    }
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// buildFutureTasteSystemPrompt — instructs the LLM to extrapolate from the
// user's taste drift vector and generate a track they'll probably love in
// 3-6 months, based on where their taste is heading.
// ---------------------------------------------------------------------------
export function buildFutureTasteSystemPrompt(historyMetrics, spotifyData, intelligence, lastfmTags = []) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push(`Today is ${today}. You are a music prompt engineer for Google Lyria, running in FUTURE TASTE mode.`);
  lines.push('');
  lines.push('Your job: Generate a track that the user will love in 3-6 months — not what they listen to now, but where their taste is heading.');
  lines.push('');
  lines.push('## Step 1: Map the trajectory');
  lines.push('Use tools to understand both current taste AND the direction of change:');
  lines.push('- Call get_taste_drift — this is your PRIMARY data source. It shows:');
  lines.push('  - Spotify API drift: emerging/fading artists, rising/declining genres, popularity drift, velocity');
  lines.push('  - Historical drift (from GDPR data): actual play count trends over 12m→3m→1m windows, new discoveries, artist concentration shifts, monthly volume trends');
  lines.push('  - The historical section is MORE reliable than the API section because it uses real play counts, not Spotify\'s opaque ranking algorithm');
  lines.push('- Call get_top_artists for short AND long term — the delta between these IS the drift');
  lines.push('- Call get_lastfm_tags for the EMERGING artists (from taste drift) — their tags reveal the sonic territory the user is moving toward');
  lines.push('- If taste drift shows rising genres, fetch Last.fm tags for those genres\' emerging artists to understand the sound deeply');
  lines.push('- Pay special attention to artists with momentum arrows (↗ = accelerating, ↘ = decelerating) — accelerating artists are the strongest signal');
  lines.push('');
  lines.push('## Step 2: Extrapolate forward');
  lines.push('Based on the drift data, predict the next logical step:');
  lines.push('- If rising genres are "shoegaze, dream-pop" → extrapolate toward deeper shoegaze, or adjacent genres like noise-pop, ethereal wave');
  lines.push('- If emerging artists share a specific production style → lean further into that style');
  lines.push('- If popularity is drifting underground → go even more obscure');
  lines.push('- If decade drift shows interest in older music → go deeper into that era\'s authentic sound');
  lines.push('- Use the velocity score: high velocity (>50%) means the user is adventurous, so extrapolate boldly. Low velocity (<25%) means extrapolate conservatively — small steps forward');
  lines.push('');
  lines.push('## Step 3: Build the future taste prompt');
  lines.push('The track should feel like a natural next step — not a copy of current favorites, but clearly on the path:');
  lines.push('- Take the rising genres/styles and push them one step further');
  lines.push('- Blend emerging artist characteristics with adjacent sonic territory the user hasn\'t reached yet');
  lines.push('- Match the intensity/mood direction of the drift (if moving from aggressive to mellow, lean mellow)');
  lines.push('- The result should feel slightly unfamiliar but exciting — like discovering the perfect new band');
  lines.push('');
  lines.push('## Lyria output rules');
  lines.push('- NEVER include artist names, band names, song titles, or album names');
  lines.push('- Use generic instrument descriptions');
  lines.push('- Be specific about the predicted future sound\'s characteristics');
  lines.push('');
  lines.push('## Output format');
  lines.push('Output a single JSON object — no explanation, no markdown, nothing outside the JSON:');
  lines.push('{"bpm":<int>,"key":"e.g. A minor","genre":"1-3 words","tags":["tag1","tag2","tag3"],"instruments":["..."],"production":"...","mood":"3-5 adjectives","intensity":<1-10>,"futureTasteReason":"1 sentence explaining what trend this extrapolates and where you predict their taste is heading"}');
  lines.push('- tags: exactly 3 short genre/style/mood descriptors for this track (e.g. ["futuristic","ambient","ethereal"]). These are displayed to the user as labels.');
  lines.push('');

  const ctx = buildBaselineContext(intelligence, historyMetrics, spotifyData, lastfmTags);
  if (Object.keys(ctx).length) {
    lines.push('## Current taste profile + drift data (extrapolate FORWARD from this)');
    lines.push(JSON.stringify(ctx, null, 2));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Anti-taste genre pool — grouped by sonic distance category.
// Each run, the code randomly selects a category and a handful of candidates,
// so the LLM sees a different shortlist every time.
const ANTI_TASTE_POOL = {
  'Global & Regional': [
    'Afrobeats', 'amapiano', 'highlife', 'afro-jazz', 'ethio-jazz', 'desert blues',
    'gnawa', 'raï', 'cumbia', 'reggaeton', 'dembow', 'bossa nova', 'MPB', 'sertanejo',
    'tropicália', 'Bollywood filmi', 'qawwali', 'Carnatic fusion', 'city pop', 'enka',
    'Cantopop', 'gamelan-influenced', 'fado', 'flamenco nuevo', 'Celtic', 'Balkan brass',
    'turbo-folk', 'Nordic folk', 'Tuvan throat singing', 'zouk', 'kompa', 'soukous',
    'chicha', 'dangdut', 'taarab', 'mbalax', 'jùjú', 'fuji music', 'klezmer',
  ],
  'Electronic & Dance': [
    'deep house', 'tech house', 'acid house', 'UK garage', 'breakbeat', 'jungle',
    'liquid DnB', 'dubstep', 'riddim', 'future bass', 'hyperpop', 'PC music',
    'vaporwave', 'synthwave', 'dark synth', 'IDM', 'glitch', 'ambient techno',
    'minimal techno', 'hard techno', 'gabber', 'hardstyle', 'psytrance', 'Goa trance',
    'progressive trance', 'downtempo', 'trip-hop', 'chillwave', 'lo-fi house',
    'Italo disco', 'EBM', 'industrial dance', 'footwork', 'Jersey club',
    'Baltimore club', 'baile funk', 'electro swing', 'witch house', 'deconstructed club',
  ],
  'Heavy & Extreme': [
    'stoner doom', 'sludge metal', 'black metal', 'death metal', 'thrash metal',
    'grindcore', 'mathcore', 'post-metal', 'drone metal', 'noise rock',
    'power violence', 'crust punk', 'D-beat', 'blackgaze', 'funeral doom',
    'technical death metal', 'symphonic black metal', 'industrial metal',
  ],
  'Art & Experimental': [
    'free jazz', 'spiritual jazz', 'spectral music', 'musique concrète',
    'electroacoustic', 'harsh noise', 'drone', 'dark ambient', 'prepared piano',
    'microtonal', 'avant-garde', 'free improvisation', 'Krautrock', 'space rock',
    'Canterbury scene', 'zeuhl', 'art rock', 'progressive rock', 'math rock',
    'post-rock', 'chamber pop', 'modern classical minimalism', 'tape music',
    'sound collage', 'noise pop', 'no wave',
  ],
  'Jazz & Swing': [
    'bebop', 'hard bop', 'modal jazz', 'acid jazz', 'nu-jazz', 'jazz fusion',
    'big band swing', '1930s hot jazz', 'cool jazz', 'Latin jazz',
    'Afro-Cuban jazz', 'gypsy jazz',
  ],
  'Classical & Orchestral': [
    'Baroque', 'Romantic era orchestral', 'Impressionist', 'late Romantic',
    'chamber music', 'string quartet', 'solo piano Romantic', 'opera aria',
    'choral polyphony', 'Renaissance lute music', 'Gregorian chant',
  ],
  'Retro & Vintage': [
    '1950s doo-wop', 'rockabilly', '1960s psychedelia', 'Motown soul',
    '1970s disco', 'P-funk', 'go-go', 'boogie', 'new jack swing',
    'Italo disco', '1980s synth-pop', 'new wave', 'coldwave', 'darkwave',
    'gothic rock', 'post-punk', 'surf rock', 'exotica', 'space age pop',
    'easy listening', 'lounge', 'boogaloo', 'Northern soul',
  ],
  'Urban & Street': [
    'boom bap', 'chopped & screwed', 'phonk', 'Memphis rap', 'hyphy', 'crunk',
    'grime', 'UK drill', 'Chicago drill', 'cloud rap', 'abstract hip-hop',
    'jazz rap', 'neo-soul', 'quiet storm', 'dancehall', 'bashment', 'soca',
    'bounce', 'Miami bass', 'snap music', 'afroswing',
  ],
  'Folk & Acoustic': [
    'bluegrass', 'old-time Appalachian', 'delta blues', 'Piedmont blues',
    'fingerstyle acoustic', 'singer-songwriter folk', 'anti-folk', 'freak folk',
    'neofolk', 'medieval folk', 'chanson française', 'ranchera', 'corrido',
    'tango', 'rebetiko', 'Hindustani classical', 'West African griot',
  ],
};

function pickAntiTasteCandidates(userGenres) {
  const userSet = new Set((userGenres || []).map((g) => g.toLowerCase()));
  const categories = Object.keys(ANTI_TASTE_POOL);

  // Shuffle categories
  for (let i = categories.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [categories[i], categories[j]] = [categories[j], categories[i]];
  }

  // Pick 3 random categories, from each pick 3 random genres the user doesn't already listen to
  const picks = [];
  for (const cat of categories.slice(0, 3)) {
    const pool = ANTI_TASTE_POOL[cat].filter((g) => !userSet.has(g.toLowerCase()));
    // Shuffle pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    picks.push({ category: cat, candidates: pool.slice(0, 3) });
  }
  return picks;
}

// ---------------------------------------------------------------------------
// buildAntiTasteSystemPrompt — instructs the LLM to find the user's blind spots
// and generate something from genres/styles/decades they never listen to,
// while keeping just enough familiar elements to make it palatable.
// ---------------------------------------------------------------------------
export function buildAntiTasteSystemPrompt(historyMetrics, spotifyData, intelligence, lastfmTags = []) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];

  // Extract user's known genres for filtering
  const userGenres = [];
  for (const range of ['long', 'medium', 'short']) {
    for (const artist of spotifyData?.topArtists?.[range] || []) {
      for (const g of artist.genres || []) userGenres.push(g);
    }
  }

  // Code-side randomness: pick candidates BEFORE the LLM sees the prompt
  const candidates = pickAntiTasteCandidates(userGenres);

  lines.push(`Today is ${today}. You are a music prompt engineer for Google Lyria, running in ANTI-TASTE mode.`);
  lines.push('');
  lines.push('Your job: Generate a track from the user\'s BLIND SPOTS — genres, decades, tempos, and styles they almost never listen to. This is a musical dare — surprise them with something they\'d never pick themselves.');
  lines.push('');
  lines.push('## MANDATORY: Your genre assignment for this run');
  lines.push('The system has randomly selected the following candidate genres for you. You MUST pick from these candidates — do NOT substitute your own choice:');
  lines.push('');
  for (const pick of candidates) {
    lines.push(`**${pick.category}:** ${pick.candidates.join(', ')}`);
  }
  lines.push('');
  lines.push('Pick the ONE candidate from the list above that is most distant from the user\'s taste profile (after you gather their data in Step 1). If you determine that one of these candidates actually overlaps with the user\'s existing taste, skip it and pick another from the list.');
  lines.push('');
  lines.push('## Step 1: Map what the user DOES listen to');
  lines.push('Use tools to gather the user\'s full taste profile:');
  lines.push('- Call get_taste_profile for personality tags, decade distribution, tempo preference');
  lines.push('- Call get_top_artists (short + long term) to see their artist range');
  lines.push('- Call get_lastfm_tags for those artists to see exact genres/moods/styles');
  lines.push('- Call get_history_taste for overall listening patterns');
  lines.push('- Call get_taste_drift to see which genres are rising/fading — avoid generating from rising genres, those are comfort zone');
  lines.push('');
  lines.push('## Step 2: Pick from your assigned candidates');
  lines.push('From the candidates above, pick the one that is MOST absent from the user\'s data.');
  lines.push('Verify it\'s a genuine blind spot — not just underrepresented, but truly absent or near-zero.');
  lines.push('');
  lines.push('## Step 3: Build the anti-taste prompt');
  lines.push('- Base the track firmly in that genre with AUTHENTIC characteristics — instruments, rhythms, production, and structure native to that specific style');
  lines.push('- Research what makes that genre sound the way it does: specific scales, time signatures, typical tempos, characteristic instruments, production aesthetics');
  lines.push('- Add ONE familiar anchor — a single subtle element from the user\'s comfort zone (a mood, a tempo feel, a production texture) to make it approachable');
  lines.push('- The familiar anchor should be subtle, not dominant — this is a dare, not a compromise');
  lines.push('');
  lines.push('## Lyria output rules');
  lines.push('- NEVER include artist names, band names, song titles, or album names');
  lines.push('- Use generic but SPECIFIC instrument descriptions authentic to the chosen genre');
  lines.push('- Be detailed about the genre\'s authentic sonic characteristics — don\'t be generic');
  lines.push('');
  lines.push('## Output format');
  lines.push('Output a single JSON object — no explanation, no markdown, nothing outside the JSON:');
  lines.push('{"bpm":<int>,"key":"e.g. A minor","genre":"the specific genre you picked from the candidates","tags":["tag1","tag2","tag3"],"instruments":["..."],"production":"...","mood":"3-5 adjectives","intensity":<1-10>,"antiTasteReason":"1-2 sentences: what blind spot this targets, why it\'s distant from their taste, and what familiar anchor was kept"}');
  lines.push('- tags: exactly 3 short genre/style/mood descriptors for this track (e.g. ["afrobeats","groovy","percussive"]). These are displayed to the user as labels.');
  lines.push('');

  const ctx = buildBaselineContext(intelligence, historyMetrics, spotifyData, lastfmTags);
  if (Object.keys(ctx).length) {
    lines.push('## Current taste profile (this is what you\'re breaking away FROM)');
    lines.push(JSON.stringify(ctx, null, 2));
  }

  return lines.join('\n');
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
