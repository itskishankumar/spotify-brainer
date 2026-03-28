// Spotify Brainer — LLM Tool Definitions
// These tools let the LLM control Spotify playback, search, and manage the library.

export const SPOTIFY_TOOLS = [
  {
    name: 'play_track',
    description: 'Play a specific track, album, or playlist on Spotify. Can play by URI or search query. If the user asks to play something, search for it first if you don\'t have the URI.',
    input_schema: {
      type: 'object',
      properties: {
        uri: {
          type: 'string',
          description: 'Spotify URI (e.g. spotify:track:4iV5W9uYEdYUVa79Axb7Rh). If you don\'t have this, use the search tool first.',
        },
        context_uri: {
          type: 'string',
          description: 'Spotify context URI for playing within a playlist/album (e.g. spotify:playlist:37i9dQZF1DXcBWIGoYBM5M)',
        },
      },
    },
  },
  {
    name: 'pause',
    description: 'Pause the current playback.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'skip_next',
    description: 'Skip to the next track.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'skip_previous',
    description: 'Go back to the previous track.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'seek',
    description: 'Seek to a specific position in the current track.',
    input_schema: {
      type: 'object',
      properties: {
        position_ms: {
          type: 'integer',
          description: 'Position in milliseconds to seek to.',
        },
      },
      required: ['position_ms'],
    },
  },
  {
    name: 'set_volume',
    description: 'Set the playback volume.',
    input_schema: {
      type: 'object',
      properties: {
        percent: {
          type: 'integer',
          description: 'Volume level from 0 to 100.',
          minimum: 0,
          maximum: 100,
        },
      },
      required: ['percent'],
    },
  },
  {
    name: 'set_shuffle',
    description: 'Turn shuffle on or off.',
    input_schema: {
      type: 'object',
      properties: {
        state: {
          type: 'boolean',
          description: 'true to enable shuffle, false to disable.',
        },
      },
      required: ['state'],
    },
  },
  {
    name: 'set_repeat',
    description: 'Set the repeat mode.',
    input_schema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['off', 'context', 'track'],
          description: '"off" = no repeat, "context" = repeat playlist/album, "track" = repeat current track.',
        },
      },
      required: ['state'],
    },
  },
  {
    name: 'add_to_queue',
    description: 'Add a track to the playback queue. Search for the track first if you don\'t have the URI.',
    input_schema: {
      type: 'object',
      properties: {
        uri: {
          type: 'string',
          description: 'Spotify track URI (e.g. spotify:track:4iV5W9uYEdYUVa79Axb7Rh)',
        },
      },
      required: ['uri'],
    },
  },
  {
    name: 'search',
    description: 'Search Spotify for tracks, artists, albums, or playlists. Use this to find track URIs before playing or queueing.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g. "Bohemian Rhapsody Queen")',
        },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['track', 'artist', 'album', 'playlist'] },
          description: 'Types to search for. Defaults to ["track"].',
        },
        limit: {
          type: 'integer',
          description: 'Max results per type (1-50). Default 5.',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_devices',
    description: 'List all available Spotify devices (phones, speakers, web player, etc).',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'transfer_playback',
    description: 'Transfer playback to a different device.',
    input_schema: {
      type: 'object',
      properties: {
        device_id: {
          type: 'string',
          description: 'The device ID to transfer to.',
        },
        play: {
          type: 'boolean',
          description: 'Whether to start playing on the new device.',
        },
      },
      required: ['device_id'],
    },
  },
  {
    name: 'add_to_playlist',
    description: 'Add one or more tracks to a playlist.',
    input_schema: {
      type: 'object',
      properties: {
        playlist_id: {
          type: 'string',
          description: 'The Spotify playlist ID.',
        },
        uris: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of Spotify track URIs to add.',
        },
      },
      required: ['playlist_id', 'uris'],
    },
  },
  {
    name: 'create_playlist',
    description: 'Create a new playlist for the user.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new playlist.',
        },
        description: {
          type: 'string',
          description: 'Optional description.',
        },
        public: {
          type: 'boolean',
          description: 'Whether the playlist should be public. Default false.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'save_tracks',
    description: 'Save/like tracks to the user\'s library.',
    input_schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of Spotify track IDs to save.',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: 'remove_saved_tracks',
    description: 'Remove tracks from the user\'s saved/liked library.',
    input_schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of Spotify track IDs to remove.',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: 'get_track_credits',
    description: 'Get the full credits for any track — artists, writers, producers, performers, engineers, and record label. IMPORTANT: Do NOT play the track first. This tool handles everything — it navigates to the track page internally, opens Spotify\'s credits dialog, scrapes the data, and navigates back. Just pass the track_id directly. For the currently playing track, omit track_id. For other tracks, use the search tool first to get the track ID, then pass it here. Tell the user you\'re briefly navigating to the track page to fetch credits.',
    input_schema: {
      type: 'object',
      properties: {
        track_id: {
          type: 'string',
          description: 'Spotify track ID. If omitted, uses the currently playing track.',
        },
      },
    },
  },

  // --- Data-fetching tools (read from in-memory state, no API calls) ---
  {
    name: 'get_user_profile',
    description: 'Get the user\'s Spotify profile — display name, plan (free/premium), country, and follower count.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_top_artists',
    description: 'Get the user\'s top artists for a given time range.',
    input_schema: {
      type: 'object',
      properties: {
        time_range: {
          type: 'string',
          enum: ['short', 'medium', 'long'],
          description: 'short = last 4 weeks, medium = last 6 months, long = all time. Defaults to medium.',
        },
      },
    },
  },
  {
    name: 'get_top_tracks',
    description: 'Get the user\'s top tracks for a given time range.',
    input_schema: {
      type: 'object',
      properties: {
        time_range: {
          type: 'string',
          enum: ['short', 'medium', 'long'],
          description: 'short = last 4 weeks, medium = last 6 months, long = all time. Defaults to medium.',
        },
      },
    },
  },
  {
    name: 'get_recently_played',
    description: 'Get the last 50 tracks the user played with timestamps.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_playlists',
    description: 'Get all of the user\'s playlists with their full track listings.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_library_stats',
    description: 'Get counts of saved/liked tracks and saved albums in the user\'s library.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_taste_profile',
    description: 'Get the computed taste intelligence profile — decade distribution, discovery score, personality tags, tempo preference, and playlist profiles.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_history_stats',
    description: 'Get listening stats and engagement metrics from GDPR history. Optionally filter to a specific date range to see stats for a particular period (e.g. a specific month or year).',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (optional). If omitted, uses all-time data.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (optional). If omitted, uses all-time data.' },
      },
    },
  },
  {
    name: 'get_history_artists',
    description: 'Get top artists from GDPR listening history. Optionally filter to a date range to see who the user was most into during a specific period.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'get_history_temporal',
    description: 'Get temporal listening patterns from GDPR history (peak hour, night owl score, session stats). Optionally filter to a date range.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'get_history_replay',
    description: 'Get replay and obsession data from GDPR history (repeat ratio, binge episodes). Optionally filter to a date range.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'get_history_taste',
    description: 'Get taste profile from GDPR history — top artists, artist concentration, variety. Optionally filter to a date range to understand what the user was into at a specific point in time.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'get_queue',
    description: 'Get the current Spotify playback queue (upcoming tracks).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_current_view',
    description: 'Get what page or section the user is currently viewing in Spotify.',
    input_schema: { type: 'object', properties: {} },
  },
];

// Maps tool names to spotify-control action names and param transforms
export const TOOL_TO_ACTION = {
  play_track: { action: 'play', transform: (input) => ({ uri: input.uri, contextUri: input.context_uri }) },
  pause: { action: 'pause', transform: () => ({}) },
  skip_next: { action: 'next', transform: () => ({}) },
  skip_previous: { action: 'previous', transform: () => ({}) },
  seek: { action: 'seek', transform: (input) => ({ positionMs: input.position_ms }) },
  set_volume: { action: 'setVolume', transform: (input) => ({ percent: input.percent }) },
  set_shuffle: { action: 'setShuffle', transform: (input) => ({ state: input.state }) },
  set_repeat: { action: 'setRepeat', transform: (input) => ({ state: input.state }) },
  add_to_queue: { action: 'addToQueue', transform: (input) => ({ uri: input.uri }) },
  search: { action: 'search', transform: (input) => ({ query: input.query, types: input.types || ['track'], limit: input.limit || 5 }) },
  get_devices: { action: 'getDevices', transform: () => ({}) },
  transfer_playback: { action: 'transferPlayback', transform: (input) => ({ deviceId: input.device_id, play: input.play }) },
  add_to_playlist: { action: 'addToPlaylist', transform: (input) => ({ playlistId: input.playlist_id, uris: input.uris }) },
  create_playlist: { action: 'createPlaylist', transform: (input) => ({ name: input.name, description: input.description, isPublic: input.public }) },
  save_tracks: { action: 'saveTracks', transform: (input) => ({ ids: input.ids }) },
  remove_saved_tracks: { action: 'removeSavedTracks', transform: (input) => ({ ids: input.ids }) },
};
