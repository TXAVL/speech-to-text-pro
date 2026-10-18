// CapCut / TikTok TTS cho Cloudflare Worker (Web API thuần: fetch + WebCrypto + BigInt).
// Cùng giao thức với capcut_tts.js (bản Node), nhưng RSA PKCS#1 v1.5 tự cài bằng BigInt vì WebCrypto không hỗ trợ.
import catalog from './Voice.json';

const BASE_URL = 'https://editor-api-sg.capcutapi.com';
const PUBLIC_KEY_B64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmTd34Lw4b7IuldSXh/zYCMla+ITdGG5TeWz6ad+OySd4r+IrY45AoqrYUxhQ2dl+7z+i7r/5vEa8rr39BYfB8AGMQLmZA8HmgpWBsqrn/V6daUALkKnkLb70Fn32CJigIuGXAYqxUdGuI340aC+0v5Es3puJsHyzf01/AelE4Cdc6bZhQrASJLBh8R3BQToYClmDVSDUQk28o8sl/guAZ4n303Vj+6Siv1HayPCdV6kpVVnMBAG4+umUbwGmn132N3fgpzLarFF3XyWmS1zhD/J07iM/rP8GDO9IskHNHd2phrO0G6KzrcFAnTBHjVv+hCBEfzN/no3FNA9AuC36mwIDAQAB';
const DEVICE = {
  aid: '359289', app_name: 'CapCut', channel: 'capcutpc_google', device_platform: 'mac', device_type: 'MacBookPro17,4',
  device_brand: 'MacBookPro17,4', os_version: '15.7.4', device_id: '76471456455646328721', iid: '76471456455646328721',
  region: 'VN', loc: 'VN', lan: 'vi-VN', pf: '3', tdid: '76471456455646328721'
};
const DEFAULT_RES = '7252594014782755330';

const hexOf = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const md5 = async (s) => hexOf(await crypto.subtle.digest('MD5', new TextEncoder().encode(s))); // MD5 là phần mở rộng của Workers
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const bytesToBig = (b) => BigInt('0x' + hexOf(b));

function modPow(base, exp, mod) {
  let r = 1n; base %= mod;
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; exp >>= 1n; base = (base * base) % mod; }
  return r;
}

let rsaKey = null;
function loadKey() {
  if (rsaKey) return rsaKey;
  const der = Uint8Array.from(atob(PUBLIC_KEY_B64), c => c.charCodeAt(0));
  // SPKI: ... 02 82 01 01 00 <256 byte modulus> 02 03 01 00 01
  let i = 0;
  while (!(der[i] === 0x02 && der[i + 1] === 0x82 && der[i + 2] === 0x01 && der[i + 3] === 0x01 && der[i + 4] === 0x00)) i++;
  const modulus = der.subarray(i + 5, i + 5 + 256);
  rsaKey = { n: bytesToBig(modulus), e: 65537n, k: 256 };
  return rsaKey;
}

// RSAES-PKCS1-v1_5: 00 02 <PS: byte ngẫu nhiên khác 0> 00 <M>
function rsaEncrypt(message) {
  const { n, e, k } = loadKey();
  const m = new TextEncoder().encode(message);
  const ps = new Uint8Array(k - m.length - 3);
  for (let j = 0; j < ps.length; j++) { let b = 0; while (!b) b = rand(1)[0]; ps[j] = b; }
  const em = new Uint8Array(k);
  em[1] = 2; em.set(ps, 2); em[2 + ps.length] = 0; em.set(m, 3 + ps.length);
  const c = modPow(bytesToBig(em), e, n).toString(16).padStart(k * 2, '0');
  const out = new Uint8Array(k);
  for (let j = 0; j < k; j++) out[j] = parseInt(c.substr(j * 2, 2), 16);
  let bin = ''; out.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

export function capcutVoices() {
  return catalog
    .filter(v => (v.lan || '').toLowerCase() === 'vi' || (v.lang || '').toLowerCase().startsWith('vi'))
    .map(v => ({ name: v.voice_type, label: v.display_name }));
}

function resolveVoice(input) {
  const t = (input || '').toLowerCase().trim();
  const hit = catalog.find(v => (v.voice_type || '').toLowerCase() === t) || catalog.find(v => (v.display_name || '').toLowerCase() === t);
  return hit ? { voiceType: hit.voice_type, resourceId: hit.resource_id } : { voiceType: input || 'BV421_vivn_streaming', resourceId: DEFAULT_RES };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const traceId = () => `00-${hexOf(rand(16))}-${hexOf(rand(8))}-01`;

export async function capcutSynthesize({ text, voice = 'BV421_vivn_streaming', rate = 1 }) {
  const { voiceType, resourceId } = resolveVoice(voice);
  const d = DEVICE;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
    <voice name="${voiceType}" mock_tone_info="" platform="sami" resource_id="${resourceId}" emotion="" emotion_scale="0" style="" role="" moyin_emotion="" is_clone_tone="false" need_subtitle_timestamp="false">
        <prosody rate="${rate}">${escapeXml(text.trim())}</prosody>
    </voice>
</speak>`;
  const extraInfo = JSON.stringify({ benefit_info: {} });
  const sign = rsaEncrypt(`appid:${d.aid}&did:${d.device_id}&creditDisable:false&ssml:${await md5(ssml)}&extraInfo:${extraInfo}`);
  const babi = JSON.stringify({ feature_entrance: 'editor', feature_entrance_detail: 'editor-feature-text_to_speech', feature_key: 'text_to_speech', scenario: 'video_editor' });

  const payload = { audio_format: 'mp3', babi_param: babi, credit_disable: false, extra_info: extraInfo, need_merge_voice: false, need_subtitle_timestamp: false, scene: 'text_to_speech', ssml, sign };
  const bodyText = JSON.stringify({
    bind_id: crypto.randomUUID(), can_queue: true, enter_from: 'text_to_speech',
    tasks: [{ context: crypto.randomUUID(), payload: JSON.stringify(payload), req_key: 'sami_text_to_speech', task_version: 'v3' }]
  });

  const common = { app_name: d.app_name, device_type: d.device_type, os_version: d.os_version, channel: d.channel, version_name: '8.7.0', device_brand: d.device_brand, device_id: d.device_id, iid: d.iid, version_code: '8.7.0', device_platform: d.device_platform, aid: d.aid };
  const headersFor = async (path, body, now, extra = {}) => ({
    'content-type': 'application/json', appvr: '8.7.0', 'device-time': now, lan: d.lan, loc: d.loc, pf: d.pf, 'sign-ver': '1', tdid: d.tdid,
    'x-ss-stub': await md5(body), 'x-ss-dp': d.aid, 'x-khronos': now, 'app-sdk-version': '8.7.0', appid: d.aid,
    sign: await md5(`9e2c|${path.slice(-7)}|3|8.7.0|${now}|${d.tdid}|11ac`), ...extra
  });

  const now = String(Math.floor(Date.now() / 1000));
  const newPath = '/lv/v1/common_task/new';
  const createRes = await fetch(`${BASE_URL}${newPath}?${new URLSearchParams({ ...common, region: d.region, babi_param: babi })}`, {
    method: 'POST', body: bodyText,
    headers: await headersFor(newPath, bodyText, now, { ch: d.channel, 'x-tt-trace-id': traceId(), 'user-agent': 'Cronet/TTNetVersion:1d7cc3b1 2025-07-16 QuicVersion:52c2b40d 2025-04-03' })
  });
  const created = await createRes.json();
  const task = created?.data?.tasks?.[0];
  if (!task) throw new Error('CapCut không tạo được tác vụ: ' + JSON.stringify(created).slice(0, 200));

  const queryPath = '/lv/v1/common_task/query';
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await sleep(1000);
    const qBody = JSON.stringify({ tasks: [{ bind_id: '', id: task.id, req_key: 'sami_text_to_speech', task_version: 'v3', token: task.token }] });
    const qNow = String(Math.floor(Date.now() / 1000));
    const qRes = await fetch(`${BASE_URL}${queryPath}?${new URLSearchParams(common)}`, { method: 'POST', body: qBody, headers: await headersFor(queryPath, qBody, qNow) });
    const t = (await qRes.json())?.data?.tasks?.[0];
    if (!t) continue;
    if (t.status === 'succeed' || t.status === 'success') {
      const p = typeof t.payload === 'string' ? JSON.parse(t.payload) : t.payload;
      const url = p?.audio_subtitles?.[0]?.speech_url;
      if (!url) throw new Error('CapCut không trả về audio.');
      const audio = await fetch(url);
      if (!audio.ok) throw new Error('Không tải được audio CapCut (' + audio.status + ')');
      return new Uint8Array(await audio.arrayBuffer());
    }
    if (t.status === 'failed') throw new Error('Tác vụ CapCut TTS thất bại.');
  }
  throw new Error('Quá thời gian chờ CapCut.');
}
