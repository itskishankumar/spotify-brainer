// Spotify Brainer — OpenAI (GPT) adapter

import { LLMAdapter } from '../adapter.js';

export class OpenAIAdapter extends LLMAdapter {
  name = 'openai';
  displayName = 'OpenAI (GPT)';
  apiKeyUrl = 'https://platform.openai.com/api-keys';
  models = [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, tier: 'standard' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, tier: 'fast' },
    { id: 'o1', name: 'o1', contextWindow: 200000, tier: 'standard' },
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
    // Convert from our normalized format to OpenAI format, handling tool messages
    const messages = request.messages.flatMap((m) => {
      // Assistant message with tool_use blocks → OpenAI tool_calls format
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        const text = m.content.find((b) => b.type === 'text')?.text || null;
        const toolCalls = m.content.filter((b) => b.type === 'tool_use').map((b) => ({
          id: b.id, type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
        return [{ role: 'assistant', content: text, tool_calls: toolCalls.length ? toolCalls : undefined }];
      }
      // User message with tool_result blocks → OpenAI tool messages
      if (m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result') {
        return m.content.map((b) => ({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content }));
      }
      return [{ role: m.role, content: m.content }];
    });

    const body = {
      model: request.model,
      messages,
      max_completion_tokens: request.maxTokens || 4096,
      temperature: request.temperature,
    };
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
      if (request.toolChoice === 'any') {
        body.tool_choice = 'required';
      }
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    const choice = data.choices[0];
    const rawToolCalls = choice?.message?.tool_calls;
    const toolCalls = rawToolCalls?.map((tc) => ({
      id: tc.id, name: tc.function.name,
      input: JSON.parse(tc.function.arguments || '{}'),
    }));
    return {
      content: choice?.message?.content || '',
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      model: data.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      finishReason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end',
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
