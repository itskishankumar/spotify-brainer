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
  compute(data) {
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
