// Spotify Brainer — Unified Music Generation types

/**
 * @typedef {Object} MusicGenRequest
 * @property {string} prompt         - Text prompt describing the desired music
 * @property {string} model          - Provider-specific model ID
 */

/**
 * @typedef {Object} MusicGenResponse
 * @property {string} audio          - Base64-encoded audio data
 * @property {string} mimeType       - e.g. 'audio/mp3'
 * @property {string} model
 */

/**
 * @typedef {Object} MusicGenModelInfo
 * @property {string} id
 * @property {string} name
 * @property {number} durationSeconds - Expected output duration
 */
