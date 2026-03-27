// Spotify Brainer — Google Gemini adapter

import { LLMAdapter } from '../adapter.js';

export class GeminiAdapter extends LLMAdapter {
  name = 'gemini';
  displayName = 'Google Gemini';
  apiKeyUrl = 'https://aistudio.google.com/apikey';
  models = [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576 },
    { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', contextWindow: 1048576 },
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          contents,
          generationConfig: {
            maxOutputTokens: request.maxTokens || 4096,
            temperature: request.temperature,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      content: text,
      model: request.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      },
      finishReason: data.candidates?.[0]?.finishReason === 'STOP' ? 'end' : 'max_tokens',
    };
  }

  streamMessage(request, apiKey, onChunk) {
    const controller = new AbortController();
    const { systemInstruction, contents } = this._convertMessages(request.messages);

    (async () => {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:streamGenerateContent?alt=sse&key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
              contents,
              generationConfig: {
                maxOutputTokens: request.maxTokens || 4096,
                temperature: request.temperature,
              },
            }),
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
              const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                onChunk({ type: 'text', content: text });
              }
              if (event.usageMetadata) {
                usage.inputTokens = event.usageMetadata.promptTokenCount || 0;
                usage.outputTokens = event.usageMetadata.candidatesTokenCount || 0;
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

  _convertMessages(messages) {
    let systemInstruction = '';
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { systemInstruction, contents };
  }
}
