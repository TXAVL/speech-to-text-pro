/**
 * Pure JavaScript CapCut Text-to-Speech (TTS) Engine
 * 100% JavaScript - Không cần Python, chạy mượt trên cả Node.js và Cloudflare Workers!
 */

const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://editor-api-sg.capcutapi.com';
const TTS_SIGN_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmTd34Lw4b7IuldSXh/zY
CMla+ITdGG5TeWz6ad+OySd4r+IrY45AoqrYUxhQ2dl+7z+i7r/5vEa8rr39BYfB
8AGMQLmZA8HmgpWBsqrn/V6daUALkKnkLb70Fn32CJigIuGXAYqxUdGuI340aC+0
v5Es3puJsHyzf01/AelE4Cdc6bZhQrASJLBh8R3BQToYClmDVSDUQk28o8sl/guA
Z4n303Vj+6Siv1HayPCdV6kpVVnMBAG4+umUbwGmn132N3fgpzLarFF3XyWmS1zh
D/J07iM/rP8GDO9IskHNHd2phrO0G6KzrcFAnTBHjVv+hCBEfzN/no3FNA9AuC36
mwIDAQAB
-----END PUBLIC KEY-----`;

const DEFAULT_DEVICE = {
  aid: '359289',
  app_name: 'CapCut',
  appvr: '8.7.0',
  version_name: '8.7.0',
  version_code: '8.7.0',
  channel: 'capcutpc_google',
  device_platform: 'mac',
  device_type: 'MacBookPro17,4',
  device_brand: 'MacBookPro17,4',
  os_version: '15.7.4',
  device_id: '76471456455646328721',
  iid: '76471456455646328721',
  region: 'VN',
  loc: 'VN',
  lan: 'vi-VN',
  pf: '3',
  tdid: '76471456455646328721'
};

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function rsaEncrypt(message) {
  return crypto.publicEncrypt(
    { key: TTS_SIGN_PUBLIC_KEY_PEM, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(message)
  ).toString('base64');
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Load Voice Catalog
let cachedVoices = null;
function getVoiceCatalog() {
  if (cachedVoices) return cachedVoices;
  const voicePath = path.join(__dirname, 'Voice.json');
  if (fs.existsSync(voicePath)) {
    try {
      cachedVoices = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
      return cachedVoices;
    } catch (e) {}
  }
  return [];
}

function resolveVoice(voiceInput) {
  const defaultVoice = 'BV421_vivn_streaming';
  const defaultRes = '7252594014782755330';
  if (!voiceInput) return { voiceType: defaultVoice, resourceId: defaultRes };

  const catalog = getVoiceCatalog();
  const target = voiceInput.toLowerCase().trim();

  // 1. By voice_type
  for (const v of catalog) {
    if (v.voice_type && v.voice_type.toLowerCase() === target) {
      return { voiceType: v.voice_type, resourceId: v.resource_id };
    }
  }
  // 2. By display_name
  for (const v of catalog) {
    if (v.display_name && v.display_name.toLowerCase() === target) {
      return { voiceType: v.voice_type, resourceId: v.resource_id };
    }
  }

  return { voiceType: voiceInput, resourceId: defaultRes };
}

/**
 * Generate CapCut Speech (Text-to-Speech)
 * @param {string} text - The text to read
 * @param {string} voice - Voice type or display name
 * @param {string|number} rate - Speed rate (e.g. 1.0)
 * @returns {Promise<{success: boolean, audioUrl: string, durationMs: number, voiceType: string}>}
 */
async function generateCapCutSpeech(text, voice = 'BV421_vivn_streaming', rate = '1.0') {
  if (!text || !text.trim()) {
    throw new Error('Văn bản không được để trống');
  }

  const { voiceType, resourceId } = resolveVoice(voice);
  const device = DEFAULT_DEVICE;

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
    <voice name="${voiceType}" mock_tone_info="" platform="sami" resource_id="${resourceId}" emotion="" emotion_scale="0" style="" role="" moyin_emotion="" is_clone_tone="false" need_subtitle_timestamp="false">
        <prosody rate="${rate}">${escapeXml(text.trim())}</prosody>
    </voice>
</speak>`;

  const extraInfo = JSON.stringify({ benefit_info: {} });
  const ssmlMd5 = md5(ssml);
  const signInput = `appid:${device.aid}&did:${device.device_id}&creditDisable:false&ssml:${ssmlMd5}&extraInfo:${extraInfo}`;
  const payloadSign = rsaEncrypt(signInput);

  const payload = {
    audio_format: 'mp3',
    babi_param: JSON.stringify({
      feature_entrance: 'editor',
      feature_entrance_detail: 'editor-feature-text_to_speech',
      feature_key: 'text_to_speech',
      scenario: 'video_editor'
    }),
    credit_disable: false,
    extra_info: extraInfo,
    need_merge_voice: false,
    need_subtitle_timestamp: false,
    scene: 'text_to_speech',
    ssml: ssml,
    sign: payloadSign
  };

  const body = {
    bind_id: crypto.randomUUID(),
    can_queue: true,
    enter_from: 'text_to_speech',
    tasks: [
      {
        context: crypto.randomUUID(),
        payload: JSON.stringify(payload),
        req_key: 'sami_text_to_speech',
        task_version: 'v3'
      }
    ]
  };

  const bodyText = JSON.stringify(body);
  const now = String(Math.floor(Date.now() / 1000));
  const query = new URLSearchParams({
    app_name: device.app_name,
    device_type: device.device_type,
    os_version: device.os_version,
    channel: device.channel,
    version_name: '8.7.0',
    device_brand: device.device_brand,
    device_id: device.device_id,
    iid: device.iid,
    version_code: '8.7.0',
    device_platform: device.device_platform,
    aid: device.aid,
    region: device.region,
    babi_param: JSON.stringify({
      feature_entrance: 'editor',
      feature_entrance_detail: 'editor-feature-text_to_speech',
      feature_key: 'text_to_speech',
      scenario: 'video_editor'
    })
  });

  const url = `${BASE_URL}/lv/v1/common_task/new?${query.toString()}`;
  const signStr = `9e2c|${'/lv/v1/common_task/new'.slice(-7)}|3|8.7.0|${now}|${device.tdid}|11ac`;
  const signHeader = md5(signStr);

  const headers = {
    'content-type': 'application/json',
    'appvr': '8.7.0',
    'ch': device.channel,
    'device-time': now,
    'lan': device.lan,
    'loc': device.loc,
    'pf': device.pf,
    'sign-ver': '1',
    'tdid': device.tdid,
    'x-ss-stub': md5(bodyText),
    'x-ss-dp': device.aid,
    'x-khronos': now,
    'x-tt-trace-id': `00-${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-01`,
    'user-agent': 'Cronet/TTNetVersion:1d7cc3b1 2025-07-16 QuicVersion:52c2b40d 2025-04-03',
    'app-sdk-version': '8.7.0',
    'appid': device.aid,
    'sign': signHeader
  };

  // 1. Submit TTS Task
  const createRes = await axios.post(url, bodyText, { headers, timeout: 30000 });
  const tasks = createRes.data?.data?.tasks || [];
  if (!tasks || tasks.length === 0) {
    throw new Error('CapCut không tạo được tác vụ đọc: ' + JSON.stringify(createRes.data));
  }

  const taskId = tasks[0].id;
  const token = tasks[0].token;

  // 2. Poll for TTS completion (up to 30s)
  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    await new Promise((r) => setTimeout(r, 1000));

    const qBody = JSON.stringify({
      tasks: [{ bind_id: '', id: taskId, req_key: 'sami_text_to_speech', task_version: 'v3', token: token }]
    });
    const qNow = String(Math.floor(Date.now() / 1000));
    const qUrl = `${BASE_URL}/lv/v1/common_task/query?` + new URLSearchParams({
      app_name: device.app_name,
      device_type: device.device_type,
      os_version: device.os_version,
      channel: device.channel,
      version_name: '8.7.0',
      device_brand: device.device_brand,
      device_id: device.device_id,
      iid: device.iid,
      version_code: '8.7.0',
      device_platform: device.device_platform,
      aid: device.aid
    }).toString();

    const qSignStr = `9e2c|${'/lv/v1/common_task/query'.slice(-7)}|3|8.7.0|${qNow}|${device.tdid}|11ac`;
    const qHeaders = {
      'content-type': 'application/json',
      'appvr': '8.7.0',
      'device-time': qNow,
      'lan': device.lan,
      'loc': device.loc,
      'pf': device.pf,
      'sign-ver': '1',
      'tdid': device.tdid,
      'x-ss-stub': md5(qBody),
      'x-ss-dp': device.aid,
      'x-khronos': qNow,
      'app-sdk-version': '8.7.0',
      'appid': device.aid,
      'sign': md5(qSignStr)
    };

    const qRes = await axios.post(qUrl, qBody, { headers: qHeaders, timeout: 30000 });
    const qTasks = qRes.data?.data?.tasks || [];
    if (qTasks.length > 0) {
      const t = qTasks[0];
      if (t.status === 'succeed' || t.status === 'success') {
        const payloadObj = typeof t.payload === 'string' ? JSON.parse(t.payload) : t.payload;
        const sub = (payloadObj.audio_subtitles || [])[0];
        if (!sub) throw new Error('Không nhận được audio_subtitles từ CapCut');

        return {
          success: true,
          audioUrl: sub.speech_url,
          durationMs: sub.duration || 0,
          voiceType: voiceType,
          resourceId: resourceId
        };
      } else if (t.status === 'failed') {
        throw new Error('Tác vụ CapCut TTS thất bại');
      }
    }
  }

  throw new Error('Quá thời gian chờ phản hồi từ CapCut (Timeout)');
}

module.exports = {
  generateCapCutSpeech,
  resolveVoice,
  getVoiceCatalog
};
