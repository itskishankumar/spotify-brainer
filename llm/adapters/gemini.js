// Spotify Brainer — Google Gemini adapter

import { LLMAdapter } from '../adapter.js';

export class GeminiAdapter extends LLMAdapter {
  name = 'gemini';
  displayName = 'Google Gemini';
  apiKeyUrl = 'https://aistudio.google.com/apikey';
  models = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576 },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576 },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576 },
  ];

  async validate(apiKey) {
    if (!apiKey) return { valid: false, error: 'API key required' };
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (res.ok) return { valid: true };
      const err = await res.json();
      return { valid: false, error: err.error?.message || `HTTP ${res.status}` };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  async sendMessage(request, apiKey) {
    const { systemInstruction, contents } = this._convertMessages(request.messages);
    const body = {
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents,
      generationConfig: { maxOutputTokens: request.maxTokens || 4096, temperature: request.temperature },
    };
    if (request.tools?.length) {
      body.tools = [{ functionDeclarations: request.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
      if (request.toolChoice === 'any') {
        body.tool_config = { function_calling_config: { mode: 'ANY' } };
      }
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.find((p) => p.text)?.text || '';
    const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({
      id: `gemini-fc-${i}`,
      name: p.functionCall.name,
      input: p.functionCall.args || {},
    }));
    return {
      content: text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      model: request.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      },
      finishReason: toolCalls.length ? 'tool_use' : 'end',
    };
  }

  streamMessage(request, apiKey, onChunk) {
    const controller = new AbortController();
    const { systemInstruction, contents } = this._convertMessages(request.messages);

    (async () => {
      try {
        const body = {
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          contents,
          generationConfig: {
            maxOutputTokens: request.maxTokens || 4096,
            temperature: request.temperature,
          },
        };
        if (request.tools?.length) {
          body.tools = [{ functionDeclarations: request.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
          if (request.toolChoice === 'any') {
            body.tool_config = { function_calling_config: { mode: 'ANY' } };
          }
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:streamGenerateContent?alt=sse&key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          const err = await res.json();
          onChunk({ type: 'error', content: err.error?.message || `HTTP ${res.status}` });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let usage = { inputTokens: 0, outputTokens: 0 };
        const collectedToolCalls = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();

            try {
              const event = JSON.parse(data);
              const parts = event.candidates?.[0]?.content?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  onChunk({ type: 'text', content: part.text });
                }
                if (part.functionCall) {
                  const toolId = `gemini-fc-${collectedToolCalls.length}`;
                  onChunk({ type: 'tool_use_start', toolName: part.functionCall.name, toolId });
                  onChunk({ type: 'tool_use', toolId, toolName: part.functionCall.name, input: part.functionCall.args || {} });
                  collectedToolCalls.push({ id: toolId, name: part.functionCall.name });
                }
              }
              if (event.usageMetadata) {
                usage.inputTokens = event.usageMetadata.promptTokenCount || 0;
                usage.outputTokens = event.usageMetadata.candidatesTokenCount || 0;
              }
            } catch (parseErr) {
              console.warn('[Gemini stream] Parse error:', parseErr.message, 'data:', data?.slice(0, 200));
            }
          }
        }

        const stopReason = collectedToolCalls.length > 0 ? 'tool_use' : null;
        onChunk({ type: 'done', content: '', usage, stopReason });
      } catch (e) {
        if (e.name !== 'AbortError') {
          onChunk({ type: 'error', content: e.message });
        }
      }
    })();

    return controller;
  }

  _convertMessages(messages) {
    let systemInstruction = '';
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
        continue;
      }

      // Assistant message with tool_use blocks → Gemini functionCall parts
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const parts = [];
        for (const b of msg.content) {
          if (b.type === 'text') parts.push({ text: b.text });
          else if (b.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input } });
        }
        contents.push({ role: 'model', parts });
        continue;
      }

      // User message with tool_result blocks → Gemini functionResponse parts
      if (msg.role === 'user' && Array.isArray(msg.content) && msg.content[0]?.type === 'tool_result') {
        const parts = msg.content.map((b) => ({
          functionResponse: { name: b.tool_name || b.tool_use_id, response: { content: b.content } },
        }));
        contents.push({ role: 'user', parts });
        continue;
      }

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
      });
    }

    return { systemInstruction, contents };
  }
}
