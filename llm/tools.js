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
