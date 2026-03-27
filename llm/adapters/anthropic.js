// Spotify Brainer — Anthropic (Claude) adapter

import { LLMAdapter } from '../adapter.js';

export class AnthropicAdapter extends LLMAdapter {
  name = 'anthropic';
  displayName = 'Claude (Anthropic)';
  apiKeyUrl = 'https://console.anthropic.com/settings/keys';
  models = [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 1000000 },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 1000000 },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000 },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextWindow: 200000 },
  ];

  async validate(apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return { valid: false, error: 'Key should start with sk-ant-' };
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      if (res.ok) return { valid: true };
      const err = await res.json();
      return { valid: false, error: err.error?.message || `HTTP ${res.status}` };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  async sendMessage(request, apiKey) {
    const { systemMsg, messages } = this._splitSystem(request.messages);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens || 4096,
        system: systemMsg || undefined,
        messages,
        temperature: request.temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
    }

    const data = await res.json();
    return {
      content: data.content[0]?.text || '',
      model: data.model,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      finishReason: data.stop_reason === 'end_turn' ? 'end' : data.stop_reason === 'max_tokens' ? 'max_tokens' : 'end',
    };
  }

  streamMessage(request, apiKey, onChunk) {
    const controller = new AbortController();
    const { systemMsg, messages } = this._splitSystem(request.messages);

    (async () => {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: request.model,
            max_tokens: request.maxTokens || 4096,
            system: systemMsg || undefined,
            messages,
            temperature: request.temperature,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          onChunk({ type: 'error', content: err.error?.message || `HTTP ${res.status}` });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let usage = { inputTokens: 0, outputTokens: 0 };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              if (event.type === 'content_block_delta' && event.delta?.text) {
                onChunk({ type: 'text', content: event.delta.text });
              } else if (event.type === 'message_delta') {
                if (event.usage) {
                  usage.outputTokens = event.usage.output_tokens || 0;
                }
              } else if (event.type === 'message_start' && event.message?.usage) {
                usage.inputTokens = event.message.usage.input_tokens || 0;
              }
            } catch {}
          }
        }

        onChunk({ type: 'done', content: '', usage });
      } catch (e) {
        if (e.name !== 'AbortError') {
          onChunk({ type: 'error', content: e.message });
        }
      }
    })();

    return controller;
  }

  _splitSystem(messages) {
    let systemMsg = '';
    const filtered = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMsg += (systemMsg ? '\n\n' : '') + msg.content;
      } else {
        filtered.push({ role: msg.role, content: msg.content });
      }
    }
    return { systemMsg, messages: filtered };
  }
}
