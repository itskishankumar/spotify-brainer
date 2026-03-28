// Spotify Brainer — Google Imagen (Nano Banana) image generation adapter

import { ImageGenAdapter } from '../adapter.js';

export class ImagenAdapter extends ImageGenAdapter {
  name = 'imagen';
  displayName = 'Nano Banana (Google AI)';
  apiKeyUrl = 'https://aistudio.google.com/apikey';
  models = [
    { id: 'imagen-4.0-generate-001', name: 'Nano Banana 4' },
    { id: 'imagen-4.0-fast-generate-001', name: 'Nano Banana 4 Fast' },
    { id: 'imagen-4.0-ultra-generate-001', name: 'Nano Banana 4 Ultra' },
  ];

  _endpoint(model, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
  }

  async validate(apiKey) {
    if (!apiKey?.trim()) return { valid: false, error: 'No API key provided.' };
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.models[0].id}?key=${apiKey}`
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
        instances: [{ prompt: request.prompt }],
        parameters: { sampleCount: 1 },
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const predictions = data.predictions || [];

    if (!predictions.length || !predictions[0].bytesBase64Encoded) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) throw new Error(`Prompt blocked (${blockReason}).`);
      throw new Error('No image returned.');
    }

    return {
      image: predictions[0].bytesBase64Encoded,
      mimeType: predictions[0].mimeType || 'image/png',
      model: request.model,
    };
  }
}
