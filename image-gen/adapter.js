// Spotify Brainer — Base Image Generation Adapter
// Every image generation provider adapter must extend this class.

export class ImageGenAdapter {
  /** @type {string} Provider key, e.g. "imagen" */
  name = '';

  /** @type {string} Display name, e.g. "Imagen (Google AI)" */
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
   * Generate an image and return base64 data.
   * @param {{prompt: string, model: string}} request
   * @param {string} apiKey
   * @returns {Promise<{image: string, mimeType: string, model: string}>}
   */
  async generate(request, apiKey) {
    throw new Error('generate() not implemented');
  }
}
