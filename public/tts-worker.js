// Giọng Việt MMS-TTS (Meta) chạy hoàn toàn trong trình duyệt, đặt trong worker để không đứng UI.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm';

env.allowLocalModels = false;
let synth = null;

self.onmessage = async (e) => {
  const { id, texts } = e.data;
  try {
    if (!synth) {
      const files = {};
      synth = await pipeline('text-to-speech', 'Xenova/mms-tts-vie', {
        dtype: 'fp32',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            files[p.file] = { loaded: p.loaded, total: p.total };
            let l = 0, t = 0;
            for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
            self.postMessage({ id, type: 'load', ratio: l / t });
          }
        }
      });
    }
    const parts = [];
    for (let i = 0; i < texts.length; i++) {
      const out = await synth(texts[i]);
      parts.push(out.audio);
      self.postMessage({ id, type: 'progress', ratio: (i + 1) / texts.length });
    }
    self.postMessage({ id, type: 'done', parts, rate: 16000 });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) });
  }
};
