// Spotify Brainer — Provider Registry
// Central map of provider names to adapter instances.

import { AnthropicAdapter } from './adapters/anthropic.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { GeminiAdapter } from './adapters/gemini.js';

const adapters = new Map();

// Register built-in adapters
const builtIn = [new AnthropicAdapter(), new OpenAIAdapter(), new GeminiAdapter()];
for (const adapter of builtIn) {
  adapters.set(adapter.name, adapter);
}

/**
 * Get an adapter by provider name.
 * @param {string} name - e.g. "anthropic", "openai", "gemini"
 * @returns {import('./adapter.js').LLMAdapter}
 */
export function getAdapter(name) {
  const adapter = adapters.get(name);
  if (!adapter) throw new Error(`Unknown LLM provider: ${name}`);
  return adapter;
}

/**
 * List all registered providers.
 * @returns {{name: string, displayName: string, models: import('./types.js').LLMModelInfo[], apiKeyUrl: string}[]}
 */
export function listProviders() {
  return Array.from(adapters.values()).map((a) => ({
    name: a.name,
    displayName: a.displayName,
    models: a.models,
    apiKeyUrl: a.apiKeyUrl,
  }));
}

/**
 * Register a custom adapter.
 * @param {import('./adapter.js').LLMAdapter} adapter
 */
export function registerAdapter(adapter) {
  adapters.set(adapter.name, adapter);
}
