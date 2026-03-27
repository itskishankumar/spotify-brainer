// Spotify Brainer — Unified LLM types
// All providers convert to/from these internal formats.

/**
 * @typedef {Object} LLMMessage
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} LLMRequest
 * @property {LLMMessage[]} messages
 * @property {string} model - Provider-specific model ID
 * @property {number} maxTokens
 * @property {boolean} stream
 * @property {number} [temperature]
 */

/**
 * @typedef {Object} LLMResponse
 * @property {string} content
 * @property {string} model
 * @property {{inputTokens: number, outputTokens: number}} usage
 * @property {'end'|'max_tokens'|'error'} finishReason
 */

/**
 * @typedef {Object} LLMChunk
 * @property {'text'|'done'|'error'} type
 * @property {string} content - Partial text for 'text', error message for 'error'
 * @property {{inputTokens: number, outputTokens: number}} [usage] - Present on 'done'
 */

/**
 * @typedef {Object} LLMModelInfo
 * @property {string} id
 * @property {string} name
 * @property {number} contextWindow
 */

export const CHUNK_TYPES = {
  TEXT: 'text',
  DONE: 'done',
  ERROR: 'error',
};

export const FINISH_REASONS = {
  END: 'end',
  MAX_TOKENS: 'max_tokens',
  ERROR: 'error',
};
