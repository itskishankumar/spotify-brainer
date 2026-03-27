// Spotify Brainer — OpenAI (GPT) adapter

import { LLMAdapter } from '../adapter.js';

export class OpenAIAdapter extends LLMAdapter {
  name = 'openai';
  displayName = 'OpenAI (GPT)';
  apiKeyUrl = 'https://platform.openai.com/api-keys';
  models = [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
    { id: 'o1', name: 'o1', contextWindow: 200000 },
  ];

  async validate(apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return { valid: false, error: 'Key should start with sk-' };
    }
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { valid: true };
      const err = await res.json();
      return { valid: false, error: err.error?.message || `HTTP ${res.status}` };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  async sendMessage(request, apiKey) {
    const messages = request.messages.map((m) => ({
      role: m.role === 'system' ? 'system' : m.role,
      content: m.content,
    }));

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        max_completion_tokens: request.maxTokens || 4096,
        temperature: request.temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    return {
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      finishReason: data.choices[0]?.finish_reason === 'stop' ? 'end' : 'max_tokens',
    };
  }

  streamMessage(request, apiKey, onChunk) {
    const controller = new AbortController();
    const messages = request.messages.map((m) => ({
      role: m.role === 'system' ? 'system' : m.role,
      content: m.content,
    }));

    (async () => {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model,
            messages,
            max_completion_tokens: request.maxTokens || 4096,
            temperature: request.temperature,
            stream: true,
            stream_options: { include_usage: true },
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
              const delta = event.choices?.[0]?.delta;
              if (delta?.content) {
                onChunk({ type: 'text', content: delta.content });
              }
              if (event.usage) {
                usage.inputTokens = event.usage.prompt_tokens || 0;
                usage.outputTokens = event.usage.completion_tokens || 0;
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
}
