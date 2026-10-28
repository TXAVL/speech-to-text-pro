// Cấu hình chạy thật = mặc định trong plans.js + phần admin đã chỉnh (bảng settings, key 'config').
import { PLANS, PREMIUM_PACKAGES, GLOBAL_DAILY_TTS, CREDITS, WATERMARK } from './plans.js';

let cache = null;
const fmt = (n) => Number(n).toLocaleString('vi-VN');

function build(saved) {
  const plans = JSON.parse(JSON.stringify(PLANS));
  for (const id of Object.keys(plans)) {
    const o = saved.limits?.[id];
    if (o && Number(o.ttsCalls) >= 0) plans[id].ttsCalls = Math.floor(Number(o.ttsCalls));
    if (o && Number(o.maxChars) > 0) plans[id].maxChars = Math.floor(Number(o.maxChars));
  }
  const allPackages = (Array.isArray(saved.packages) && saved.packages.length ? saved.packages : PREMIUM_PACKAGES)
    .map(p => ({ id: String(p.id), name: String(p.name), days: Math.max(1, Math.floor(Number(p.days))), price: Math.max(0, Math.floor(Number(p.price))), active: p.active !== false }));
  const packages = allPackages.filter(p => p.active && p.price > 0).map(p => ({ ...p }));

  // Giá "từ ...đ/tháng" theo gói rẻ nhất tính theo tháng
  const perMonth = packages.map(p => p.price / (p.days / 30));
  plans.premium.price = perMonth.length ? `${fmt(Math.round(Math.min(...perMonth) / 1000) * 1000)}đ/tháng` : 'Tạm ngừng bán';
  // Tiết kiệm so với gói tháng
  const base = packages.find(p => p.days <= 31);
  for (const p of packages) {
    if (base && p !== base) {
      const full = base.price * (p.days / base.days);
      const save = Math.round((1 - p.price / full) * 100);
      if (save > 0) p.save = save;
    }
  }
  for (const plan of Object.values(plans)) {
    plan.perks = plan.perks.map(t => t.replace('{calls}', fmt(plan.ttsCalls)).replace('{chars}', fmt(plan.maxChars)).replace('{srt}', fmt(plan.srtCues || 0)));
  }
  const sc = saved.credits || {};
  const credits = {
    enabled: sc.enabled !== undefined ? !!sc.enabled : CREDITS.enabled,
    price: Number(sc.price) > 0 ? Math.floor(Number(sc.price)) : CREDITS.price,
    min: Number(sc.min) > 0 ? Math.floor(Number(sc.min)) : CREDITS.min,
    max: Number(sc.max) > 0 ? Math.floor(Number(sc.max)) : CREDITS.max,
    presets: Array.isArray(sc.presets) && sc.presets.length ? sc.presets.map(n => Math.floor(Number(n))).filter(n => n > 0).slice(0, 6) : CREDITS.presets
  };
  const sw = saved.watermark || {};
  const watermark = {
    enabled: sw.enabled !== undefined ? !!sw.enabled : WATERMARK.enabled,
    vi: typeof sw.vi === 'string' && sw.vi.trim() ? sw.vi.trim() : WATERMARK.vi,
    en: typeof sw.en === 'string' && sw.en.trim() ? sw.en.trim() : WATERMARK.en,
    exemptPremium: sw.exemptPremium !== undefined ? !!sw.exemptPremium : WATERMARK.exemptPremium
  };
  const defaultSeller = {
    name: 'TĂNG XUÂN ANH',
    tax_code: '',
    address: 'Xã Hà Nam, thành phố Hải Phòng, Việt Nam',
    email: 'txasoftdev@gmail.com',
    phone: '0389 077 187',
    bank: 'VQRQAMXZO2074 (TANG XUAN ANH) tại Ngân hàng TMCP Quân Đội (MB Bank)'
  };
  const savedWithSeller = { ...saved, seller: { ...defaultSeller, ...(saved.seller || {}) } };
  return { plans, packages, allPackages, credits, watermark, globalDaily: Number(saved.globalDaily) > 0 ? Math.floor(Number(saved.globalDaily)) : GLOBAL_DAILY_TTS, saved: savedWithSeller };
}

export async function getConfig(db) {
  if (cache && Date.now() - cache.t < 15000) return cache.v;
  let saved = {};
  if (db) {
    try {
      const row = await db.prepare("SELECT value FROM settings WHERE key = 'config'").first();
      if (row) saved = JSON.parse(row.value);
    } catch { /* bảng chưa có -> dùng mặc định */ }
  }
  const v = build(saved);
  cache = { t: Date.now(), v };
  return v;
}

export async function saveConfig(db, patch) {
  const cur = (await getConfig(db)).saved;
  const next = { ...cur, ...patch };
  await db.prepare("INSERT INTO settings (key, value) VALUES ('config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify(next)).run();
  cache = null;
  return getConfig(db);
}

export function publicPlans(cfg) {
  return Object.values(cfg.plans).map(({ id, name, price, ttsCalls, maxChars, srtCues, perks }) => ({ id, name, price, ttsCalls, maxChars, srtCues, perks }));
}
