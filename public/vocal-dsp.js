/* =====================================================================
 * XỬ LÝ TÍN HIỆU CHO TÁCH GIỌNG (MDX-Net)
 * Mô hình MDX-Net làm việc trên phổ tần số: cần STFT trước khi chạy và iSTFT sau khi chạy.
 * Cài đặt giống torch.stft / torch.istft của UVR: cửa sổ Hann tuần hoàn, center=True (đệm phản xạ),
 * không chuẩn hóa. Kích thước FFT (6144, 7680...) không phải lũy thừa của 2 nên dùng FFT cơ số hỗn hợp
 * N = m * 2^k, và gộp hai kênh trái/phải vào một lần FFT phức để nhanh gấp đôi.
 * ===================================================================== */
(function () {
  /** FFT phức kích thước N = m * 2^k (m lẻ nhỏ, vd 3 hoặc 15). Trả về hàm fft(re, im, outRe, outIm, inverse). */
  function makeFFT(N) {
    let P = 1, m = N;
    while (m % 2 === 0) { m /= 2; P *= 2; }
    const bits = Math.round(Math.log2(P));
    const rev = new Uint32Array(P);
    for (let i = 1; i < P; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) << (bits - 1));
    const cosP = new Float64Array(Math.max(1, P / 2)), sinP = new Float64Array(Math.max(1, P / 2));
    for (let k = 0; k < P / 2; k++) { cosP[k] = Math.cos(2 * Math.PI * k / P); sinP[k] = Math.sin(2 * Math.PI * k / P); }

    function base(re, im, inv) {
      for (let i = 0; i < P; i++) {
        const j = rev[i];
        if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      const sgn = inv ? 1 : -1;
      for (let size = 2; size <= P; size <<= 1) {
        const half = size >> 1, step = P / size;
        for (let start = 0; start < P; start += size) {
          for (let k = 0, w = 0; k < half; k++, w += step) {
            const wr = cosP[w], wi = sgn * sinP[w];
            const a = start + k, b = a + half;
            const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
            re[b] = re[a] - tr; im[b] = im[a] - ti;
            re[a] += tr; im[a] += ti;
          }
        }
      }
    }

    if (m === 1) {
      return (re, im, outRe, outIm, inv) => { outRe.set(re); outIm.set(im); base(outRe, outIm, inv); };
    }
    const twr = new Float64Array(N), twi = new Float64Array(N);
    for (let j = 0; j < N; j++) { twr[j] = Math.cos(2 * Math.PI * j / N); twi[j] = -Math.sin(2 * Math.PI * j / N); }
    const sr = Array.from({ length: m }, () => new Float64Array(P)), si = Array.from({ length: m }, () => new Float64Array(P));
    return (re, im, outRe, outIm, inv) => {
      for (let r = 0; r < m; r++) {
        const a = sr[r], b = si[r];
        for (let i = 0, j = r; i < P; i++, j += m) { a[i] = re[j]; b[i] = im[j]; }
        base(a, b, inv);
      }
      const sg = inv ? -1 : 1;
      for (let k = 0; k < N; k++) {
        const kk = k & (P - 1);
        let accR = 0, accI = 0;
        for (let r = 0; r < m; r++) {
          const idx = (r * k) % N, wr = twr[idx], wi = sg * twi[idx];
          const a = sr[r][kk], b = si[r][kk];
          accR += a * wr - b * wi; accI += a * wi + b * wr;
        }
        outRe[k] = accR; outIm[k] = accI;
      }
    };
  }

  /**
   * Bộ STFT / iSTFT cho một đoạn có độ dài chunk = hop * (dimT - 1) mẫu, 2 kênh.
   * Tensor phổ: [1, 4, dimF, dimT], thứ tự kênh [L_re, L_im, R_re, R_im],
   * chỉ số phẳng ((kênh * dimF) + bin) * dimT + khung.
   */
  function makeMdx({ nFft, hop = 1024, dimF, dimT = 256 }) {
    const N = nFft, half = N >> 1, nBins = half + 1, chunk = hop * (dimT - 1);
    const fft = makeFFT(N);
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); // Hann tuần hoàn
    // Đường bao cửa sổ bình phương (để chia khi ghép chồng), tính một lần vì mọi đoạn có cùng cấu trúc
    const total = hop * (dimT - 1) + N, env = new Float64Array(total);
    for (let f = 0; f < dimT; f++) for (let i = 0; i < N; i++) env[f * hop + i] += win[i] * win[i];

    const zr = new Float64Array(N), zi = new Float64Array(N), or = new Float64Array(N), oi = new Float64Array(N);

    /** left/right: toàn bộ tín hiệu; start: mẫu đầu của đoạn (có thể âm hoặc vượt cuối: phần ngoài coi là 0) */
    function stft(left, right, start) {
      const len = left.length;
      const at = (a, i) => { const j = start + i; return j >= 0 && j < len ? a[j] : 0; };
      const reflect = (j) => { let i = j - half; if (i < 0) i = -i; else if (i >= chunk) i = 2 * (chunk - 1) - i; return i; };
      const out = new Float32Array(4 * dimF * dimT);
      for (let f = 0; f < dimT; f++) {
        const base = f * hop;
        for (let n = 0; n < N; n++) {
          const idx = reflect(base + n), w = win[n];
          zr[n] = at(left, idx) * w; zi[n] = at(right, idx) * w;
        }
        fft(zr, zi, or, oi, false);
        for (let k = 0; k < dimF; k++) {
          const c = k === 0 ? 0 : N - k;
          const lr = (or[k] + or[c]) / 2, li = (oi[k] - oi[c]) / 2;
          const rr = (oi[k] + oi[c]) / 2, ri = -(or[k] - or[c]) / 2;
          out[(0 * dimF + k) * dimT + f] = lr; out[(1 * dimF + k) * dimT + f] = li;
          out[(2 * dimF + k) * dimT + f] = rr; out[(3 * dimF + k) * dimT + f] = ri;
        }
      }
      return out;
    }

    /** Phổ -> hai kênh (chunk mẫu mỗi kênh). Bin từ dimF trở lên coi là 0. */
    function istft(spec, outL, outR) {
      const accL = new Float64Array(total), accR = new Float64Array(total);
      for (let f = 0; f < dimT; f++) {
        for (let k = 0; k < nBins; k++) {
          let lr = 0, li = 0, rr = 0, ri = 0;
          if (k < dimF) {
            lr = spec[(0 * dimF + k) * dimT + f]; li = spec[(1 * dimF + k) * dimT + f];
            rr = spec[(2 * dimF + k) * dimT + f]; ri = spec[(3 * dimF + k) * dimT + f];
          }
          if (k === 0 || k === half) { li = 0; ri = 0; } // irfft bỏ phần ảo của DC và Nyquist
          zr[k] = lr - ri; zi[k] = li + rr;                      // Z = L + i*R
          if (k > 0 && k < half) { const j = N - k; zr[j] = lr + ri; zi[j] = rr - li; } // L,R đối xứng liên hợp
        }
        fft(zr, zi, or, oi, true);
        const base = f * hop;
        for (let n = 0; n < N; n++) {
          const w = win[n] / N;
          accL[base + n] += or[n] * w; accR[base + n] += oi[n] * w;
        }
      }
      for (let i = 0; i < chunk; i++) {
        const e = env[half + i] || 1;
        outL[i] = accL[half + i] / e; outR[i] = accR[half + i] / e;
      }
    }

    return { chunk, trim: half, gen: chunk - N, dimF, dimT, stft, istft };
  }

  const api = { makeFFT, makeMdx };
  if (typeof self !== 'undefined') self.vkDsp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
