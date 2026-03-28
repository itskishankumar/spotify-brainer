// Spotify Brainer — Base Music Generation Adapter
// Every provider adapter must extend this class.

export class MusicGenAdapter {
  /** @type {string} Provider key, e.g. "lyria" */
  name = '';

  /** @type {string} Display name, e.g. "Lyria (Google AI)" */
  displayName = '';

  /** @type {import('./types.js').MusicGenModelInfo[]} */
  models = [];

  /** @type {string} URL where the user can obtain an API key */
  apiKeyUrl = '';

  /**
   * Validate an API key (lightweight check — no generation).
   * @param {string} apiKey
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validate(apiKey) {
    throw new Error('validate() not implemented');
  }

  /**
   * Generate a music clip and return base64 audio.
   * @param {import('./types.js').MusicGenRequest} request
   * @param {string} apiKey
   * @returns {Promise<import('./types.js').MusicGenResponse>}
   */
  async generate(request, apiKey) {
    throw new Error('generate() not implemented');
  }
}
