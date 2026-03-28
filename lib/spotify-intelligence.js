// Spotify Brainer — Data Intelligence Layer
// Transforms raw Spotify data into computed insights and metrics.

export class SpotifyIntelligence {
  constructor() {
    this.profile = null;
  }

  /**
   * Compute full intelligence profile from raw Spotify data.
   * @param {Object} data - Raw Spotify data (playlists, top items, saved, audio features, etc.)
   * @returns {Object} Computed profile
   */
  compute(data, historyEvents) {
    this.profile = {
      decadeDistribution: this.computeDecadeDistribution(data),
      discoveryScore: this.computeDiscoveryScore(data),
      mainstreamIndex: this.computeMainstreamIndex(data),
      personalityTags: this.computePersonalityTags(data),
      tempoPreference: this.computeTempoPreference(data),
      explicitRatio: this.computeExplicitRatio(data),
      topArtistsAllTime: this.computeTopArtists(data),
      topTracksAllTime: this.computeTopTracks(data),
      playlistProfiles: this.computePlaylistProfiles(data),
      artistNetwork: this.computeArtistNetwork(data),
      listeningPatterns: this.computeListeningPatterns(data),
      tasteDrift: this.computeTasteDrift(data, historyEvents),
    };
    return this.profile;
  }

  computeDecadeDistribution(data) {
    const decades = {};
    let total = 0;

    const allTracks = [
      ...(data.topTracks?.long || []),
      ...(data.topTracks?.medium || []),
      ...(data.savedTracks || []).map((t) => t.track).filter(Boolean),
    ];

    for (const track of allTracks) {
      const releaseDate = track.album?.release_date || track.release_date;
      if (!releaseDate) continue;
      const year = parseInt(releaseDate.slice(0, 4));
      if (isNaN(year)) continue;
      const decade = `${Math.floor(year / 10) * 10}s`;
      decades[decade] = (decades[decade] || 0) + 1;
      total++;
    }

    if (total === 0) return {};
    for (const d of Object.keys(decades)) decades[d] /= total;
    return decades;
  }

  computeDiscoveryScore(data) {
    const allArtists = new Set();
    const allTracks = [
      ...(data.topTracks?.medium || []),
      ...(data.savedTracks || []).map((t) => t.track).filter(Boolean),
      ...(data.recentlyPlayed || []).map((t) => t.track).filter(Boolean),
    ];

    for (const track of allTracks) {
      for (const artist of (track.artists || [])) {
        allArtists.add(artist.id || artist.name);
      }
    }

    if (allTracks.length === 0) return 0;
    return Math.min(allArtists.size / allTracks.length, 1);
  }

  computeMainstreamIndex(data) {
    const allArtists = [
      ...(data.topArtists?.medium || []),
      ...(data.topArtists?.short || []),
    ];

    if (!allArtists.length) return null;
    const avgPop = allArtists.reduce((s, a) => s + (a.popularity || 0), 0) / allArtists.length;
    return Math.round(avgPop);
  }

  computePersonalityTags(data) {
    const tags = [];

    // Music explorer vs loyalist
    const discoveryScore = this.computeDiscoveryScore(data);
    if (discoveryScore > 0.6) tags.push('music explorer');
    else if (discoveryScore < 0.3) tags.push('artist loyalist');

    // Playlist curator
    if ((data.playlists?.length || 0) > 20) tags.push('playlist curator');

    // Library size
    if ((data.savedTracks?.length || 0) > 500) tags.push('library builder');

    // Listening patterns
    const recentlyPlayed = data.recentlyPlayed || [];
    if (recentlyPlayed.length > 0) {
      const hours = recentlyPlayed.map((t) => new Date(t.played_at).getHours());
      const nightCount = hours.filter((h) => h >= 22 || h < 5).length;
      if (nightCount / hours.length > 0.3) tags.push('night owl listener');
      const morningCount = hours.filter((h) => h >= 5 && h < 10).length;
      if (morningCount / hours.length > 0.3) tags.push('morning listener');
    }

    return tags;
  }

  computeTempoPreference(data) {
    const features = Object.values(data.audioFeatures || {}).filter(Boolean);
    if (!features.length) return null;

    const tempos = features.map((f) => f.tempo).filter(Boolean).sort((a, b) => a - b);
    if (!tempos.length) return null;

    const q1 = tempos[Math.floor(tempos.length * 0.25)];
    const q3 = tempos[Math.floor(tempos.length * 0.75)];
    return `${Math.round(q1)}-${Math.round(q3)} BPM sweet spot`;
  }

  computeExplicitRatio(data) {
    const allTracks = [
      ...(data.topTracks?.medium || []),
      ...(data.savedTracks || []).map((t) => t.track).filter(Boolean),
    ];

    if (!allTracks.length) return 0;
    const explicit = allTracks.filter((t) => t.explicit).length;
    return explicit / allTracks.length;
  }

  computeTopArtists(data) {
    const artistScores = {};

    // Weight: long-term highest, then medium, then short
    const addArtists = (artists, weight) => {
      artists.forEach((a, i) => {
        const score = (artistScores[a.name] || 0) + weight * (artists.length - i);
        artistScores[a.name] = score;
      });
    };

    addArtists(data.topArtists?.long || [], 1);
    addArtists(data.topArtists?.medium || [], 1.5);
    addArtists(data.topArtists?.short || [], 2);

    return Object.entries(artistScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, score]) => ({ name, score: Math.round(score) }));
  }

  computeTopTracks(data) {
    const trackScores = {};

    const addTracks = (tracks, weight) => {
      tracks.forEach((t, i) => {
        const key = `${t.name} — ${t.artists?.map((a) => a.name).join(', ')}`;
        trackScores[key] = (trackScores[key] || 0) + weight * (tracks.length - i);
      });
    };

    addTracks(data.topTracks?.long || [], 1);
    addTracks(data.topTracks?.medium || [], 1.5);
    addTracks(data.topTracks?.short || [], 2);

    return Object.entries(trackScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, score]) => ({ name, score: Math.round(score) }));
  }

  computePlaylistProfiles(data) {
    const profiles = {};
    // For now, basic profiles from playlist metadata
    // Full profiles require fetching each playlist's tracks + their audio features
    for (const pl of (data.playlists || [])) {
      profiles[pl.id] = {
        name: pl.name,
        trackCount: pl.tracks?.total || 0,
        isPublic: pl.public,
        isCollaborative: pl.collaborative,
        cohesion: null,
      };
    }
    return profiles;
  }

  computeArtistNetwork(data) {
    // Artists that co-occur in playlists form connections
    // This is a placeholder — full implementation needs playlist track data
    const connections = [];
    return connections;
  }

  /**
   * Compute taste drift vector — compares long/medium/short term data to find
   * what direction the user's taste is moving and predict future trends.
   * @param {Object} data - Raw Spotify data
   * @param {Array} [historyEvents] - Optional GDPR listening history events for deeper analysis
   */
  computeTasteDrift(data, historyEvents) {
    const longArtists = data.topArtists?.long || [];
    const medArtists = data.topArtists?.medium || [];
    const shortArtists = data.topArtists?.short || [];

    if (!longArtists.length && !shortArtists.length) return null;

    const longNames = new Set(longArtists.map((a) => a.name));
    const medNames = new Set(medArtists.map((a) => a.name));
    const shortNames = new Set(shortArtists.map((a) => a.name));

    // Artists only in short term = recent discoveries (taste is moving toward these)
    const emerging = shortArtists.filter((a) => !longNames.has(a.name));
    // Artists only in long term = fading from rotation
    const fading = longArtists.filter((a) => !shortNames.has(a.name));
    // Artists in all three = stable core
    const stable = longArtists.filter((a) => shortNames.has(a.name) && medNames.has(a.name));

    // Genre drift — compare genre distributions across time ranges
    const genreCounts = (artists) => {
      const counts = {};
      for (const a of artists) {
        for (const g of a.genres || []) counts[g] = (counts[g] || 0) + 1;
      }
      return counts;
    };

    const longGenres = genreCounts(longArtists);
    const shortGenres = genreCounts(shortArtists);

    // Normalize to ratios
    const longTotal = Object.values(longGenres).reduce((s, v) => s + v, 0) || 1;
    const shortTotal = Object.values(shortGenres).reduce((s, v) => s + v, 0) || 1;

    const allGenres = new Set([...Object.keys(longGenres), ...Object.keys(shortGenres)]);
    const genreDrift = [];
    for (const g of allGenres) {
      const longRatio = (longGenres[g] || 0) / longTotal;
      const shortRatio = (shortGenres[g] || 0) / shortTotal;
      const delta = shortRatio - longRatio;
      if (Math.abs(delta) > 0.02) { // ignore noise below 2%
        genreDrift.push({ genre: g, longPct: Math.round(longRatio * 100), shortPct: Math.round(shortRatio * 100), delta: Math.round(delta * 100) });
      }
    }
    genreDrift.sort((a, b) => b.delta - a.delta);

    const rising = genreDrift.filter((g) => g.delta > 0);
    const declining = genreDrift.filter((g) => g.delta < 0);

    // Decade drift — are they shifting eras?
    const decadeCounts = (artists) => {
      // Use album release dates from top tracks as proxy
      const counts = {};
      return counts; // filled from tracks below
    };

    const longTracks = data.topTracks?.long || [];
    const shortTracks = data.topTracks?.short || [];

    const trackDecades = (tracks) => {
      const counts = {};
      for (const t of tracks) {
        const rd = t.album?.release_date;
        if (!rd) continue;
        const year = parseInt(rd.slice(0, 4));
        if (isNaN(year)) continue;
        const decade = `${Math.floor(year / 10) * 10}s`;
        counts[decade] = (counts[decade] || 0) + 1;
      }
      const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
      for (const d of Object.keys(counts)) counts[d] = counts[d] / total;
      return counts;
    };

    const longDecades = trackDecades(longTracks);
    const shortDecades = trackDecades(shortTracks);

    const allDecades = new Set([...Object.keys(longDecades), ...Object.keys(shortDecades)]);
    const decadeDrift = [];
    for (const d of allDecades) {
      const delta = (shortDecades[d] || 0) - (longDecades[d] || 0);
      if (Math.abs(delta) > 0.03) {
        decadeDrift.push({ decade: d, longPct: Math.round((longDecades[d] || 0) * 100), shortPct: Math.round((shortDecades[d] || 0) * 100), delta: Math.round(delta * 100) });
      }
    }
    decadeDrift.sort((a, b) => b.delta - a.delta);

    // Popularity drift — moving mainstream or underground?
    const avgPop = (artists) => {
      if (!artists.length) return null;
      return Math.round(artists.reduce((s, a) => s + (a.popularity || 0), 0) / artists.length);
    };

    const longPop = avgPop(longArtists);
    const shortPop = avgPop(shortArtists);
    const popDrift = longPop != null && shortPop != null ? shortPop - longPop : null;

    // Velocity — how fast is taste changing? (% of short-term artists not in long-term)
    const velocity = shortArtists.length ? Math.round((emerging.length / shortArtists.length) * 100) : 0;

    // Predictions — extrapolate from drift
    const predictions = [];
    if (rising.length) {
      predictions.push(`Leaning into ${rising.slice(0, 3).map((g) => g.genre).join(', ')} — these genres are growing in your rotation`);
    }
    if (declining.length) {
      predictions.push(`Moving away from ${declining.slice(0, 3).map((g) => g.genre).join(', ')} — these are fading`);
    }
    if (popDrift != null && Math.abs(popDrift) > 3) {
      predictions.push(popDrift > 0
        ? `Shifting toward more mainstream artists (+${popDrift} popularity points)`
        : `Going deeper underground (${popDrift} popularity points)`);
    }
    if (velocity > 60) {
      predictions.push('Taste is evolving rapidly — most of your current favorites are recent discoveries');
    } else if (velocity < 20) {
      predictions.push('Taste is very stable — you stick with what you know');
    }
    const risingDecade = decadeDrift.find((d) => d.delta > 0);
    const decliningDecade = decadeDrift.find((d) => d.delta < 0);
    if (risingDecade) {
      predictions.push(`Exploring more ${risingDecade.decade} music (+${risingDecade.delta}%)`);
    }
    if (decliningDecade) {
      predictions.push(`Less ${decliningDecade.decade} music in rotation (${decliningDecade.delta}%)`);
    }

    // --- Historical drift from GDPR data ---
    // Compares real listening periods for granular trend detection
    const historicalDrift = this.computeHistoricalDrift(historyEvents);
    if (historicalDrift) {
      // Merge historical predictions into the main predictions
      for (const p of historicalDrift.predictions || []) {
        if (!predictions.includes(p)) predictions.push(p);
      }
    }

    return {
      velocity,
      emerging: emerging.slice(0, 10).map((a) => ({ name: a.name, genres: a.genres || [] })),
      fading: fading.slice(0, 10).map((a) => ({ name: a.name, genres: a.genres || [] })),
      stable: stable.slice(0, 10).map((a) => ({ name: a.name })),
      genreDrift: { rising: rising.slice(0, 5), declining: declining.slice(0, 5) },
      decadeDrift,
      popularityDrift: popDrift != null ? { long: longPop, short: shortPop, delta: popDrift } : null,
      predictions,
      historical: historicalDrift,
    };
  }

  /**
   * Compute drift from GDPR listening history by comparing time windows.
   * Compares last 12 months vs last 3 months vs last 1 month.
   */
  computeHistoricalDrift(events) {
    if (!events?.length) return null;

    const STREAM_THRESHOLD_MS = 30000;
    const meaningful = events.filter((e) => (e.msPlayed || 0) >= STREAM_THRESHOLD_MS && e.artistName);
    if (meaningful.length < 100) return null; // not enough data

    const now = Date.now();
    const ONE_MONTH = 30 * 24 * 3600000;

    const last12m = meaningful.filter((e) => e.timestamp > now - 12 * ONE_MONTH);
    const last3m = meaningful.filter((e) => e.timestamp > now - 3 * ONE_MONTH);
    const last1m = meaningful.filter((e) => e.timestamp > now - 1 * ONE_MONTH);

    if (last12m.length < 50 || last3m.length < 20) return null;

    // Compute artist play counts per period
    const artistCounts = (plays) => {
      const counts = {};
      for (const e of plays) counts[e.artistName] = (counts[e.artistName] || 0) + 1;
      return counts;
    };

    const counts12m = artistCounts(last12m);
    const counts3m = artistCounts(last3m);
    const counts1m = artistCounts(last1m);

    // Normalize to ratios
    const toRatios = (counts) => {
      const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
      const ratios = {};
      for (const [k, v] of Object.entries(counts)) ratios[k] = v / total;
      return ratios;
    };

    const ratios12m = toRatios(counts12m);
    const ratios3m = toRatios(counts3m);
    const ratios1m = toRatios(counts1m);

    // Rising artists: significantly higher share in recent vs baseline
    const allArtists = new Set([...Object.keys(counts12m), ...Object.keys(counts3m), ...Object.keys(counts1m)]);
    const artistTrends = [];
    for (const artist of allArtists) {
      const r12 = ratios12m[artist] || 0;
      const r3 = ratios3m[artist] || 0;
      const r1 = ratios1m[artist] || 0;
      const delta = r3 - r12;
      const recentDelta = r1 - r3;
      // Must have meaningful presence in at least one period
      if (Math.max(r12, r3, r1) < 0.005) continue;
      artistTrends.push({
        name: artist,
        share12m: Math.round(r12 * 1000) / 10,
        share3m: Math.round(r3 * 1000) / 10,
        share1m: Math.round(r1 * 1000) / 10,
        delta: Math.round(delta * 1000) / 10,
        momentum: Math.round(recentDelta * 1000) / 10, // accelerating or decelerating
      });
    }

    // Sort by absolute delta to find biggest movers
    artistTrends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const risingArtists = artistTrends.filter((a) => a.delta > 0.3).slice(0, 8);
    const fadingArtists = artistTrends.filter((a) => a.delta < -0.3).slice(0, 8);

    // New discoveries: in last 3 months but absent from first 9 months
    const first9m = meaningful.filter((e) => e.timestamp <= now - 3 * ONE_MONTH);
    const first9mArtists = new Set(first9m.map((e) => e.artistName));
    const newDiscoveries = Object.entries(counts3m)
      .filter(([name]) => !first9mArtists.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, plays]) => ({ name, plays }));

    // Monthly listening volume trend — is the user listening more or less?
    const monthBuckets = {};
    for (const e of meaningful) {
      const month = new Date(e.timestamp).toISOString().slice(0, 7);
      monthBuckets[month] = (monthBuckets[month] || 0) + 1;
    }
    const months = Object.keys(monthBuckets).sort();
    const recentMonths = months.slice(-6);
    const volumeTrend = recentMonths.map((m) => ({ month: m, plays: monthBuckets[m] }));

    // Artist concentration drift — is the user diversifying or narrowing?
    const topNShare = (counts, n) => {
      const sorted = Object.values(counts).sort((a, b) => b - a);
      const total = sorted.reduce((s, v) => s + v, 0) || 1;
      return Math.round(sorted.slice(0, n).reduce((s, v) => s + v, 0) / total * 100);
    };
    const concentration12m = topNShare(counts12m, 10);
    const concentration3m = topNShare(counts3m, 10);
    const concentrationDrift = concentration3m - concentration12m;

    // Predictions from historical data
    const predictions = [];
    if (newDiscoveries.length >= 5) {
      predictions.push(`Actively discovering new artists — ${newDiscoveries.length} new artists appeared in the last 3 months`);
    }
    if (concentrationDrift > 5) {
      predictions.push(`Listening is narrowing — top 10 artists now account for ${concentration3m}% of plays (up from ${concentration12m}%)`);
    } else if (concentrationDrift < -5) {
      predictions.push(`Listening is diversifying — top 10 artists now account for ${concentration3m}% of plays (down from ${concentration12m}%)`);
    }
    const accelerating = risingArtists.filter((a) => a.momentum > 0.2);
    if (accelerating.length) {
      predictions.push(`Accelerating obsession with ${accelerating.slice(0, 3).map((a) => a.name).join(', ')}`);
    }

    return {
      risingArtists,
      fadingArtists,
      newDiscoveries,
      volumeTrend,
      concentration: { baseline: concentration12m, recent: concentration3m, delta: concentrationDrift },
      predictions,
      periodCoverage: {
        total: meaningful.length,
        last12m: last12m.length,
        last3m: last3m.length,
        last1m: last1m.length,
      },
    };
  }

  computeListeningPatterns(data) {
    const patterns = {};
    const recentlyPlayed = data.recentlyPlayed || [];

    if (!recentlyPlayed.length) return patterns;

    // Hour distribution
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);

    for (const item of recentlyPlayed) {
      const d = new Date(item.played_at);
      hourCounts[d.getHours()]++;
      dayCounts[d.getDay()]++;
    }

    patterns.peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    patterns.peakDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      dayCounts.indexOf(Math.max(...dayCounts))
    ];
    patterns.hourDistribution = hourCounts;
    patterns.dayDistribution = dayCounts;

    return patterns;
  }
}
