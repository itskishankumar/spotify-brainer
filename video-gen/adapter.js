// Spotify Brainer — Base Video Generation Adapter
// Every video generation provider adapter must extend this class.

export class VideoGenAdapter {
  /** @type {string} Provider key, e.g. "veo" */
  name = '';

  /** @type {string} Display name, e.g. "Veo (Google AI)" */
  displayName = '';

  /** @type {{id: string, name: string}[]} */
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
   * Generate a video. Returns base64 video data or a download URL.
   * Video generation is async — this method handles polling internally.
   * @param {{prompt: string, model: string, durationSeconds?: number, aspectRatio?: string, image?: {data: string, mimeType: string}}} request
   * @param {string} apiKey
   * @returns {Promise<{video: string, mimeType: string, model: string}>}
   */
  async generate(request, apiKey) {
    throw new Error('generate() not implemented');
  }
}
