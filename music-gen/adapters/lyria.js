// Spotify Brainer — Lyria (Google AI) music generation adapter

import { MusicGenAdapter } from '../adapter.js';

export class LyriaAdapter extends MusicGenAdapter {
  name = 'lyria';
  displayName = 'Lyria (Google AI)';
  apiKeyUrl = 'https://aistudio.google.com/apikey';
  models = [
    { id: 'lyria-3-clip-preview', name: 'Lyria 3 Clip (30s)', durationSeconds: 30 },
    { id: 'lyria-3-pro-preview', name: 'Lyria 3 Pro (~2 min)', durationSeconds: 120 },
  ];

  _endpoint(model, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  }

  async validate(apiKey) {
    if (!apiKey?.trim()) return { valid: false, error: 'No API key provided.' };
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview?key=${apiKey}`
      );
      if (resp.ok) return { valid: true };
      const err = await resp.json().catch(() => ({}));
      return { valid: false, error: err.error?.message || `HTTP ${resp.status}` };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  async generate(request, apiKey) {
    const resp = await fetch(this._endpoint(request.model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.prompt }] }],
        generationConfig: { responseModalities: ['AUDIO'] },
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p) => p.inlineData?.mimeType?.includes('audio'));

    if (!audioPart) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) throw new Error(`Prompt blocked (${blockReason}).`);
      const finishReason = data.candidates?.[0]?.finishReason;
      throw new Error(`No audio returned${finishReason ? ` (finish reason: ${finishReason})` : ''}.`);
    }

    return {
      audio: audioPart.inlineData.data,
      mimeType: audioPart.inlineData.mimeType,
      model: request.model,
    };
  }
}
