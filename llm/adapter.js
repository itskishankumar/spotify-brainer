// Spotify Brainer — Base LLM Adapter interface
// Every provider adapter must extend this class.

export class LLMAdapter {
  /** @type {string} Provider key, e.g. "anthropic" */
  name = '';

  /** @type {string} Display name, e.g. "Claude (Anthropic)" */
  displayName = '';

  /** @type {import('./types.js').LLMModelInfo[]} */
  models = [];

  /** @type {string} URL where user can obtain an API key */
  apiKeyUrl = '';

  /**
   * Validate an API key (quick check, e.g. format or lightweight API call).
   * @param {string} apiKey
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validate(apiKey) {
    throw new Error('validate() not implemented');
  }

  /**
   * Send a message and return the full response (non-streaming).
   * @param {import('./types.js').LLMRequest} request
   * @param {string} apiKey
   * @returns {Promise<import('./types.js').LLMResponse>}
   */
  async sendMessage(request, apiKey) {
    throw new Error('sendMessage() not implemented');
  }

  /**
   * Stream a message, calling onChunk for each token.
   * Returns an AbortController to cancel the stream.
   * @param {import('./types.js').LLMRequest} request
   * @param {string} apiKey
   * @param {(chunk: import('./types.js').LLMChunk) => void} onChunk
   * @returns {AbortController}
   */
  streamMessage(request, apiKey, onChunk) {
    throw new Error('streamMessage() not implemented');
  }

  /**
   * Get context window size for a specific model.
   * @param {string} modelId
   * @returns {number}
   */
  getContextWindow(modelId) {
    const model = this.models.find((m) => m.id === modelId);
    return model?.contextWindow || 128000;
  }
}
