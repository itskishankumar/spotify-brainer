// Spotify Brainer — Offscreen Document for Lyria RealTime
// Manages WebSocket connection to Lyria RealTime API and PCM audio playback via Web Audio API.

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic';
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM

let ws = null;
let audioCtx = null;
let nextStartTime = 0;
let isPlaying = false;
let isPaused = false;
let bufferedChunks = [];
let drainScheduled = false;
let chunksReceived = 0;

// --- Recording state (PCM capture → MP3 via lamejs) ---
let isRecording = false;
let isRecPaused = false;
let recordedPcmChunks = [];

// --- Audio playback ---

async function ensureAudioContext() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    console.log('[Lyria RT] AudioContext created, state:', audioCtx.state);
  }
  // Offscreen documents may start suspended — force resume
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
    console.log('[Lyria RT] AudioContext resumed, state:', audioCtx.state);
  }
  return audioCtx;
}

function pcmToAudioBuffer(pcmBytes) {
  if (!audioCtx) return null;
  const sampleCount = Math.floor(pcmBytes.length / (CHANNELS * BYTES_PER_SAMPLE));
  if (sampleCount <= 0) return null;

  const buffer = audioCtx.createBuffer(CHANNELS, sampleCount, SAMPLE_RATE);
  const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);

  for (let ch = 0; ch < CHANNELS; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < sampleCount; i++) {
      // Interleaved 16-bit little-endian PCM: [L, R, L, R, ...]
      const byteOffset = (i * CHANNELS + ch) * BYTES_PER_SAMPLE;
      if (byteOffset + 1 < pcmBytes.byteLength) {
        const sample = view.getInt16(byteOffset, true);
        channelData[i] = sample / 32768;
      }
    }
  }
  return buffer;
}

function scheduleBuffer(audioBuffer) {
  if (!audioCtx || !audioBuffer) return;
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  if (nextStartTime < now) nextStartTime = now + 0.05;
  source.start(nextStartTime);
  nextStartTime += audioBuffer.duration;
}

async function drainBufferedChunks() {
  if (drainScheduled) return;
  drainScheduled = true;
  // Buffer a few chunks before starting to smooth jitter
  const delay = chunksReceived <= 3 ? 200 : 30;
  setTimeout(async () => {
    drainScheduled = false;
    await ensureAudioContext();
    while (bufferedChunks.length > 0) {
      const chunk = bufferedChunks.shift();
      const audioBuffer = pcmToAudioBuffer(chunk);
      if (audioBuffer) scheduleBuffer(audioBuffer);
    }
  }, delay);
}

// --- WebSocket lifecycle ---

async function connect(apiKey, model, initialPrompts, initialConfig) {
  if (ws) {
    ws.close();
    ws = null;
  }

  resetPlayback();
  await ensureAudioContext();
  chunksReceived = 0;
  sendStatus('connecting');

  const url = `${WS_URL}?key=${apiKey}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[Lyria RT] WebSocket connected, sending setup');
    ws.send(JSON.stringify({
      setup: { model: model || 'models/lyria-realtime-exp' },
    }));
  };

  ws.onmessage = async (event) => {
    try {
      let text;
      if (event.data instanceof Blob) {
        text = await event.data.text();
      } else if (typeof event.data === 'string') {
        text = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(event.data);
      } else {
        console.warn('[Lyria RT] Unknown message type:', typeof event.data);
        return;
      }

      const msg = JSON.parse(text);

      // Log first few messages fully for debugging
      if (chunksReceived < 3) {
        console.log('[Lyria RT] Message keys:', Object.keys(msg), 'size:', text.length);
      }

      // Handle setup complete
      if (msg.setupComplete || msg.setup_complete) {
        console.log('[Lyria RT] Setup complete');
        sendStatus('ready');
        if (initialPrompts?.length) sendPrompts(initialPrompts);
        if (initialConfig) sendConfig(initialConfig);
        sendPlayback('PLAY');
        isPlaying = true;
        sendStatus('streaming');
        return;
      }

      // Handle audio chunks — extract base64 PCM from JSON
      const serverContent = msg.serverContent || msg.server_content;
      if (serverContent) {
        const audioChunks = serverContent.audioChunks || serverContent.audio_chunks;
        if (audioChunks) {
          const chunks = Array.isArray(audioChunks) ? audioChunks : [audioChunks];
          for (const chunk of chunks) {
            const data = chunk.data;
            if (data) {
              chunksReceived++;
              if (chunksReceived <= 5) {
                console.log(`[Lyria RT] Audio chunk #${chunksReceived}, base64 length: ${data.length}, ~${Math.round(data.length * 0.75)} PCM bytes`);
              }
              const pcmBytes = base64ToBytes(data);
              // Capture raw PCM for MP3 encoding when recording
              if (isRecording && !isRecPaused) {
                recordedPcmChunks.push(new Uint8Array(pcmBytes));
              }
              bufferedChunks.push(pcmBytes);
              drainBufferedChunks();
            }
          }
          return;
        }
      }

      // Handle filtered prompt
      if (msg.filteredPrompt || msg.filtered_prompt) {
        console.warn('[Lyria RT] Prompt filtered');
        sendStatus('prompt_filtered', 'Prompt was safety-filtered');
      }

      if (msg.warning) {
        console.warn('[Lyria RT] Warning:', msg.warning);
      }
    } catch (e) {
      console.error('[Lyria RT] Parse error:', e, 'data type:', typeof event.data, event.data instanceof Blob ? 'Blob' : '');
    }
  };

  ws.onerror = (err) => {
    console.error('[Lyria RT] WebSocket error:', err);
    sendStatus('error', 'Connection error');
  };

  ws.onclose = (event) => {
    console.log('[Lyria RT] WebSocket closed:', event.code, event.reason);
    if (isPlaying) {
      sendStatus('disconnected', event.reason || `Connection closed (code ${event.code})`);
    }
    isPlaying = false;
    ws = null;
  };
}

function sendPrompts(prompts) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const msg = {
    client_content: {
      weighted_prompts: prompts.map((p) => ({
        text: p.text,
        weight: p.weight,
      })),
    },
  };
  console.log('[Lyria RT] Sending prompts:', JSON.stringify(msg));
  ws.send(JSON.stringify(msg));
}

function sendConfig(config) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const genConfig = {};
  if (config.bpm != null) genConfig.bpm = config.bpm;
  if (config.density != null) genConfig.density = config.density;
  if (config.brightness != null) genConfig.brightness = config.brightness;
  if (config.guidance != null) genConfig.guidance = config.guidance;
  if (config.temperature != null) genConfig.temperature = config.temperature;
  if (config.top_k != null) genConfig.top_k = config.top_k;
  if (config.mute_bass != null) genConfig.mute_bass = config.mute_bass;
  if (config.mute_drums != null) genConfig.mute_drums = config.mute_drums;
  if (config.only_bass_and_drums != null) genConfig.only_bass_and_drums = config.only_bass_and_drums;
  if (config.music_generation_mode) genConfig.music_generation_mode = config.music_generation_mode;
  if (config.scale) genConfig.scale = config.scale;
  const msg = { music_generation_config: genConfig };
  console.log('[Lyria RT] Sending config:', JSON.stringify(msg));
  ws.send(JSON.stringify(msg));
}

function sendPlayback(action) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  console.log('[Lyria RT] Sending playback:', action);
  ws.send(JSON.stringify({ playback_control: action }));
}

function resetPlayback() {
  bufferedChunks = [];
  nextStartTime = 0;
  isPlaying = false;
  isPaused = false;
  chunksReceived = 0;
  isRecording = false;
  isRecPaused = false;
  recordedPcmChunks = [];
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  resetPlayback();
  sendStatus('stopped');
}

// --- Helpers ---

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodePcmToMp3(pcmChunks) {
  // Concatenate all PCM chunks
  let totalLength = 0;
  for (const chunk of pcmChunks) totalLength += chunk.length;
  const allPcm = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of pcmChunks) {
    allPcm.set(chunk, offset);
    offset += chunk.length;
  }

  const sampleCount = Math.floor(allPcm.length / (CHANNELS * BYTES_PER_SAMPLE));
  console.log(`[Lyria RT] Encoding MP3: ${sampleCount} samples, ${allPcm.length} PCM bytes, ~${Math.round(sampleCount / SAMPLE_RATE)}s`);

  if (sampleCount === 0) return null;

  // Deinterleave stereo 16-bit PCM into separate L/R Int16Arrays
  const left = new Int16Array(sampleCount);
  const right = new Int16Array(sampleCount);
  const view = new DataView(allPcm.buffer, allPcm.byteOffset, allPcm.byteLength);
  for (let i = 0; i < sampleCount; i++) {
    const byteOff = i * CHANNELS * BYTES_PER_SAMPLE;
    left[i] = view.getInt16(byteOff, true);
    right[i] = view.getInt16(byteOff + BYTES_PER_SAMPLE, true);
  }

  // Encode with lamejs
  const mp3enc = new lamejs.Mp3Encoder(CHANNELS, SAMPLE_RATE, 128);
  const mp3Buffers = [];
  const blockSize = 1152;
  for (let i = 0; i < sampleCount; i += blockSize) {
    const end = Math.min(i + blockSize, sampleCount);
    const lBlock = left.subarray(i, end);
    const rBlock = right.subarray(i, end);
    const mp3buf = mp3enc.encodeBuffer(lBlock, rBlock);
    if (mp3buf.length > 0) mp3Buffers.push(mp3buf);
  }
  const flush = mp3enc.flush();
  if (flush.length > 0) mp3Buffers.push(flush);

  // Concatenate MP3 buffers
  let mp3Length = 0;
  for (const buf of mp3Buffers) mp3Length += buf.length;
  const mp3Data = new Uint8Array(mp3Length);
  let pos = 0;
  for (const buf of mp3Buffers) {
    mp3Data.set(buf, pos);
    pos += buf.length;
  }

  console.log(`[Lyria RT] MP3 encoded: ${mp3Data.length} bytes (~${Math.round(mp3Data.length / 1024)} KB)`);
  return mp3Data;
}

function bytesToBase64(bytes) {
  let binary = '';
  const batchSize = 32768;
  for (let i = 0; i < bytes.length; i += batchSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + batchSize, bytes.length)));
  }
  return btoa(binary);
}

function sendStatus(state, detail) {
  chrome.runtime.sendMessage({
    type: 'realtime-status',
    state,
    detail: detail || '',
  }).catch(() => {});
}

// --- Message listener ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'realtime-connect') {
    connect(msg.apiKey, msg.model, msg.prompts, msg.config);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'realtime-update-params') {
    if (msg.prompts) sendPrompts(msg.prompts);
    if (msg.config) sendConfig(msg.config);
    sendResponse({ ok: true });
    return false;
  }


  if (msg.type === 'realtime-play') {
    if (isPaused && audioCtx) {
      audioCtx.resume();
      isPaused = false;
    }
    sendPlayback('PLAY');
    isPlaying = true;
    sendStatus('streaming');
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'realtime-pause') {
    if (audioCtx) {
      audioCtx.suspend();
      isPaused = true;
    }
    sendPlayback('PAUSE');
    sendStatus('paused');
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'realtime-stop') {
    disconnect();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'offscreen-realtime-rec-start') {
    isRecording = true;
    isRecPaused = false;
    recordedPcmChunks = [];
    console.log('[Lyria RT] PCM recording started');
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'offscreen-realtime-rec-pause') {
    isRecPaused = true;
    console.log('[Lyria RT] Recording paused');
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'offscreen-realtime-rec-resume') {
    isRecPaused = false;
    console.log('[Lyria RT] Recording resumed');
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'offscreen-realtime-rec-stop') {
    console.log('[Lyria RT] Recording stop, chunks:', recordedPcmChunks.length);
    isRecording = false;
    isRecPaused = false;
    const chunks = recordedPcmChunks;
    recordedPcmChunks = [];
    if (chunks.length === 0) {
      sendResponse({ audioBase64: null });
      return false;
    }
    const mp3Data = encodePcmToMp3(chunks);
    if (!mp3Data) {
      sendResponse({ audioBase64: null });
      return false;
    }
    const audioBase64 = bytesToBase64(mp3Data);
    sendResponse({ audioBase64, mimeType: 'audio/mpeg' });
    return false;
  }

});
