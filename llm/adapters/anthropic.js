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
    const body = {
      model: request.model,
      max_tokens: request.maxTokens || 4096,
      system: systemMsg || undefined,
      messages,
      temperature: request.temperature,
    };
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
      if (request.toolChoice === 'any') {
        body.tool_choice = { type: 'any' };
      }
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
    }

    const data = await res.json();
    const content = data.content ?? [];
    const textContent = content.find((b) => b.type === 'text')?.text || '';
    const toolCalls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }));
    return {
      content: textContent,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      model: data.model,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      finishReason: data.stop_reason === 'tool_use' ? 'tool_use' : data.stop_reason === 'end_turn' ? 'end' : 'end',
    };
  }

  streamMessage(request, apiKey, onChunk) {
    const controller = new AbortController();
    const { systemMsg, messages } = this._splitSystem(request.messages);

    (async () => {
      try {
        const body = {
          model: request.model,
          max_tokens: request.maxTokens || 4096,
          system: systemMsg || undefined,
          messages,
          temperature: request.temperature,
          stream: true,
        };

        // Add tools if provided
        if (request.tools && request.tools.length > 0) {
          body.tools = request.tools;
          if (request.toolChoice === 'any') {
            body.tool_choice = { type: 'any' };
          }
        }

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
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
        let currentToolUse = null; // Track in-progress tool_use blocks
        let stopReason = null;

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

              if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'tool_use') {
                  currentToolUse = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    inputJson: '',
                  };
                  onChunk({ type: 'tool_use_start', toolName: event.content_block.name, toolId: event.content_block.id });
                }
              } else if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta' && event.delta?.text) {
                  onChunk({ type: 'text', content: event.delta.text });
                } else if (event.delta?.type === 'input_json_delta' && currentToolUse) {
                  currentToolUse.inputJson += event.delta.partial_json || '';
                }
              } else if (event.type === 'content_block_stop') {
                if (currentToolUse) {
                  let input = {};
                  try { input = JSON.parse(currentToolUse.inputJson); } catch {}
                  onChunk({
                    type: 'tool_use',
                    toolId: currentToolUse.id,
                    toolName: currentToolUse.name,
                    input,
                  });
                  currentToolUse = null;
                }
              } else if (event.type === 'message_delta') {
                if (event.usage) {
                  usage.outputTokens = event.usage.output_tokens || 0;
                }
                if (event.delta?.stop_reason) {
                  stopReason = event.delta.stop_reason;
                }
              } else if (event.type === 'message_start' && event.message?.usage) {
                usage.inputTokens = event.message.usage.input_tokens || 0;
              }
            } catch {}
          }
        }

        onChunk({ type: 'done', content: '', usage, stopReason });
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
        // Content can be a string or an array (for tool_use/tool_result messages)
        filtered.push({ role: msg.role, content: msg.content });
      }
    }
    return { systemMsg, messages: filtered };
  }
}
