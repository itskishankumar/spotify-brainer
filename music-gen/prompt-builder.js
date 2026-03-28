// Spotify Brainer — Lyria Prompt Builder
// Uses the configured LLM to translate the user's Spotify taste profile into a
// concrete Lyria music generation prompt. The LLM understands what artists sound
// like and can translate that into instrument/BPM/key/mood language without naming
// anyone — bypassing Lyria's copyright filter.

const SYSTEM_PROMPT = `You are a music prompt engineer for Google Lyria, an AI music generation model.

Given a user's Spotify listening profile, write a single prompt for Lyria that captures their musical taste as accurately and specifically as possible.

Lyria responds well to:
- Specific BPM values (e.g. "at 92 BPM")
- Key signatures (e.g. "in D minor", "in G major")
- Named instruments (e.g. "Fender Rhodes", "brushed snare", "lush synth pads", "finger-picked acoustic guitar", "warm electric bass")
- Mood and atmosphere adjectives (e.g. "introspective", "melancholic", "cinematic", "driving")
- Genre and era labels (e.g. "indie-alternative", "analog soul", "synth-pop")
- Production style (e.g. "lo-fi bedroom production", "polished studio sound", "raw and live")
- Intensity score 1–10
- Negative prompts at the end (e.g. "Avoid: no vocals, no abrupt transitions")

STRICT RULES:
1. NEVER include any artist names, band names, or track/album titles — Lyria's copyright filter will block the generation even if names appear in passing
2. Translate the artists' sonic characteristics into pure musical language: instruments, production texture, BPM, key, mood, dynamics
3. Output ONLY the prompt text — no explanation, no preamble, no markdown, no quotes
4. 3–5 sentences as a single flowing paragraph
5. Begin with "An original [genre] composition..."
6. Always produce an instrumental track — include "Avoid: no vocals" in the negative prompts`;

/**
 * Assemble the richest available taste data into a compact object for the LLM.
 * Artist names are included here — the LLM will translate them to sonic language.
 */
function buildTasteContext(intelligence, historyMetrics, spotifyData) {
  const ctx = {};

  // Top artists (weighted across time ranges) — the LLM's main signal
  if (intelligence?.topArtistsAllTime?.length) {
    ctx.topArtists = intelligence.topArtistsAllTime.slice(0, 15).map((a) => a.name);
  }

  // Genre tags from Spotify (often empty, but include when available)
  const genres = new Set();
  for (const range of ['long', 'medium', 'short']) {
    for (const artist of spotifyData?.topArtists?.[range] || []) {
      for (const g of artist.genres || []) genres.add(g);
    }
  }
  if (genres.size) ctx.spotifyGenres = [...genres].slice(0, 20);

  // Decade distribution — tells the LLM what eras they gravitate toward
  if (intelligence?.decadeDistribution && Object.keys(intelligence.decadeDistribution).length) {
    ctx.decadeDistribution = Object.entries(intelligence.decadeDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .reduce((acc, [d, v]) => { acc[d] = Math.round(v * 100) + '%'; return acc; }, {});
  }

  // Behavioral signals
  if (intelligence?.discoveryScore !== undefined) ctx.discoveryScore = intelligence.discoveryScore.toFixed(2) + ' (0=loyalist, 1=explorer)';
  if (intelligence?.mainstreamIndex !== undefined) ctx.mainstreamIndex = intelligence.mainstreamIndex + '/100';
  if (intelligence?.tempoPreference) ctx.tempoPreference = intelligence.tempoPreference;
  if (intelligence?.explicitRatio !== undefined) ctx.explicitRatio = Math.round(intelligence.explicitRatio * 100) + '%';
  if (intelligence?.personalityTags?.length) ctx.personalityTags = intelligence.personalityTags;

  // Temporal listening behavior
  const tb = historyMetrics?.temporalBehavior;
  if (tb) {
    ctx.peakListeningHour = tb.peakHour !== undefined ? `${tb.peakHour}:00` : undefined;
    ctx.nightOwlPct = tb.nightOwlPct !== undefined ? tb.nightOwlPct + '% of plays between midnight and 5am' : undefined;
    ctx.avgSessionLength = tb.sessions?.avgDurationMin !== undefined ? tb.sessions.avgDurationMin + ' minutes' : undefined;
    ctx.sessionsPerWeek = tb.sessions?.sessionsPerWeek;
    // Remove undefineds
    Object.keys(ctx).forEach((k) => ctx[k] === undefined && delete ctx[k]);
  }

  // Engagement
  const eng = historyMetrics?.listeningEngagement;
  if (eng) {
    if (eng.completionRate !== undefined) ctx.songCompletionRate = eng.completionRate + '% (how much of each song they listen to)';
    if (eng.deepListensPct !== undefined) ctx.deepListensPct = eng.deepListensPct + '% of plays are 5+ minutes long';
    if (eng.microPlaysPct !== undefined) ctx.skipRate = eng.microPlaysPct + '% of tracks skipped within 10 seconds';
  }

  // Replay behavior
  const ro = historyMetrics?.replayObsession;
  if (ro) {
    if (ro.repeatRatio !== undefined) ctx.repeatRatio = ro.repeatRatio + '% of tracks replayed within 24 hours';
    if (ro.repeatFavoritesPct !== undefined) ctx.repeatFavoritesPct = ro.repeatFavoritesPct + '% of tracks become all-time favorites (5+ plays)';
  }

  // Artist loyalty
  const ar = historyMetrics?.artistRelationships;
  if (ar) {
    if (ar.loyaltyScore !== undefined) ctx.top10ArtistsShare = ar.loyaltyScore + '% of all listening time';
    if (ar.giniCoefficient !== undefined) ctx.tasteConcentration = ar.giniCoefficient + ' (0=diverse, 1=concentrated on few artists)';
  }

  // Taste evolution — what the user was into year by year
  const te = historyMetrics?.tasteEvolution;
  if (te?.length) {
    ctx.tasteByYear = te.slice(-4).map((y) => ({
      year: y.period,
      topArtists: y.topArtists?.slice(0, 4).map((a) => a.name) || [],
    }));
  }

  // Playlist names — explicit self-labeling of taste
  const playlists = spotifyData?.playlists;
  if (playlists?.length) {
    ctx.playlistNames = playlists
      .filter((p) => p.tracks?.total > 5)
      .sort((a, b) => (b.tracks?.total || 0) - (a.tracks?.total || 0))
      .slice(0, 15)
      .map((p) => p.name);
  }

  return ctx;
}

/**
 * Generate a Lyria prompt via the user's configured LLM.
 *
 * @param {string|null}  userText    - Optional free-text from the user
 * @param {Object|null}  intelligence
 * @param {Object|null}  historyMetrics
 * @param {Object|null}  spotifyData
 * @param {string}       lyriaModel  - Lyria model ID (for structure tag decisions)
 * @param {Object}       llmAdapter  - LLM adapter instance (from llm/registry.js)
 * @param {string}       llmModel    - LLM model ID
 * @param {string}       llmApiKey   - LLM API key
 * @returns {Promise<string>}        - Lyria prompt string
 */
export async function buildMusicPrompt(userText, intelligence, historyMetrics, spotifyData, lyriaModel, llmAdapter, llmModel, llmApiKey) {
  const ctx = buildTasteContext(intelligence, historyMetrics, spotifyData);
  const hasData = Object.keys(ctx).length > 0;

  let userMessage = '';
  if (hasData) {
    userMessage += `Here is this user's Spotify listening profile:\n\n${JSON.stringify(ctx, null, 2)}\n\n`;
  }
  if (userText?.trim()) {
    userMessage += `The user has also provided this description of what they want: "${userText.trim()}"\n\n`;
    userMessage += 'Incorporate their description, but still ground the prompt in their taste profile above. Do not name any artists.';
  } else {
    userMessage += 'Generate a Lyria prompt that reflects this person\'s taste as specifically as possible.';
  }

  if (!hasData && !userText?.trim()) {
    return 'An original atmospheric indie composition at 95 BPM in A minor featuring reverb-drenched electric guitar, lush synth pads, indie drum machine, warm bass. Introspective and emotionally open mood. Steady dynamic build. Clean indie production. Intensity: 5/10. Avoid: no vocals.';
  }

  try {
    const response = await llmAdapter.sendMessage({
      model: llmModel,
      maxTokens: 300,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }, llmApiKey);

    const prompt = response.content?.trim();
    if (!prompt) throw new Error('Empty response from LLM');
    return prompt;
  } catch (e) {
    console.warn('[Spotify Brainer] LLM prompt generation failed, using fallback:', e.message);
    // Minimal fallback — at least use what we know about the user
    const topArtists = ctx.topArtists?.slice(0, 3).join(', ');
    const era = ctx.decadeDistribution ? Object.keys(ctx.decadeDistribution)[0] : null;
    const eraNote = era ? ` with ${era} influences` : '';
    const base = userText?.trim() ? `${userText.trim()} —` : 'An original atmospheric indie composition';
    return `${base}${eraNote} at 95 BPM in A minor featuring reverb-drenched electric guitar, lush synth pads, indie drum machine. Introspective and emotionally resonant mood. Clean indie production. Intensity: 5/10. Avoid: no vocals.`;
  }
}
