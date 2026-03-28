// Spotify Brainer — Google Veo video generation adapter

import { VideoGenAdapter } from '../adapter.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const POLL_INTERVAL = 5000; // 5s between polls
const MAX_POLL_TIME = 300000; // 5 min timeout

export class VeoAdapter extends VideoGenAdapter {
  name = 'veo';
  displayName = 'Veo (Google AI)';
  apiKeyUrl = 'https://aistudio.google.com/apikey';
  models = [
    { id: 'veo-3.1-generate-preview', name: 'Veo 3.1' },
    { id: 'veo-3.0-generate-preview', name: 'Veo 3' },
    { id: 'veo-2.0-generate-001', name: 'Veo 2' },
  ];

  async validate(apiKey) {
    if (!apiKey?.trim()) return { valid: false, error: 'No API key provided.' };
    try {
      const resp = await fetch(`${BASE}/models/${this.models[0].id}?key=${apiKey}`);
      if (resp.ok) return { valid: true };
      const err = await resp.json().catch(() => ({}));
      return { valid: false, error: err.error?.message || `HTTP ${resp.status}` };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  async generate(request, apiKey) {
    const model = request.model || this.models[0].id;
    const durationSeconds = request.durationSeconds || 8;

    // Build instances (text-only — image-to-video not supported by all Veo models)
    const instance = { prompt: request.prompt };

    const authHeaders = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };

    // Start long-running generation
    const startResp = await fetch(`${BASE}/models/${model}:predictLongRunning`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: request.aspectRatio || '16:9',
          durationSeconds: durationSeconds,
          personGeneration: 'allow_all',
        },
      }),
    });

    if (!startResp.ok) {
      const err = await startResp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${startResp.status}`);
    }

    const op = await startResp.json();
    const opName = op.name;
    if (!opName) throw new Error('No operation name returned');

    // Poll until done
    const deadline = Date.now() + MAX_POLL_TIME;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollResp = await fetch(`${BASE}/${opName}`, { headers: { 'x-goog-api-key': apiKey } });
      if (!pollResp.ok) {
        const err = await pollResp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Poll failed: HTTP ${pollResp.status}`);
      }

      const pollData = await pollResp.json();
      if (pollData.done) {
        if (pollData.error) {
          throw new Error(pollData.error.message || 'Video generation failed');
        }

        const samples = pollData.response?.generateVideoResponse?.generatedSamples;
        if (!samples?.length) throw new Error('No video returned');

        const videoUri = samples[0].video?.uri;
        if (!videoUri) throw new Error('No video URI in response');

        // Download the video and convert to base64
        const videoResp = await fetch(videoUri);
        if (!videoResp.ok) throw new Error(`Failed to download video: HTTP ${videoResp.status}`);

        const videoBlob = await videoResp.blob();
        const base64 = await this._blobToBase64(videoBlob);

        return {
          video: base64,
          mimeType: videoBlob.type || 'video/mp4',
          model,
        };
      }
    }

    throw new Error('Video generation timed out (5 min)');
  }

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        resolve(dataUrl.split(',')[1]); // strip data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
