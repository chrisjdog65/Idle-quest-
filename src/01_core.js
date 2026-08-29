/* =========================================================================
   IDLE QUEST — 01 CORE
   Math, deterministic RNG, noise fields, formatting helpers.
   ========================================================================= */

const PI = Math.PI, TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = sat((x - e0) / (e1 - e0 || 1e-9)); return t * t * (3 - 2 * t); };
const mixHue = (a, b, t) => a + (b - a) * t;
const sign = Math.sign, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor;
const sqrt = Math.sqrt, sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, hypot = Math.hypot;
const round = Math.round, pow = Math.pow, exp = Math.exp, log = Math.log;
/** shortest signed angle delta a->b */
function angDelta(a, b) { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; }
function angLerp(a, b, t) { return a + angDelta(a, b) * t; }
/** frame-rate independent exponential smoothing factor */
function damp(rate, dt) { return 1 - Math.exp(-rate * dt); }

/* ------------------------------ RNG ------------------------------ */
/** mulberry32 — small, fast, good enough distribution, fully deterministic. */
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class RNG {
  constructor(seed) { this.s = (seed | 0) || 1; this._f = mulberry(this.s); }
  f() { return this._f(); }
  i(n) { return (this._f() * n) | 0; }                       // 0..n-1
  r(a, b) { return a + this._f() * (b - a); }                // float in [a,b)
  ri(a, b) { return a + ((this._f() * (b - a + 1)) | 0); }   // int in [a,b]
  pick(arr) { return arr[(this._f() * arr.length) | 0]; }
  chance(p) { return this._f() < p; }
  /** Box-Muller-ish cheap gaussian, mean 0 sd 1 */
  g() { return (this._f() + this._f() + this._f() + this._f() + this._f() + this._f() - 3) * 1.4142; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = (this._f() * (i + 1)) | 0; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  /** weighted pick: weights array of numbers */
  wpick(items, weights) {
    let tot = 0; for (let i = 0; i < weights.length; i++) tot += weights[i];
    let r = this._f() * tot;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
}
/** stateless integer hash -> [0,1) */
function hash1(n) { n = (n << 13) ^ n; return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 2147483647; }
function hash2i(x, y) { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = (n ^ (n >>> 13)); n = Math.imul(n, 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function hash3i(x, y, z) { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647); n = (n ^ (n >>> 13)); n = Math.imul(n, 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

/* ------------------------------ NOISE ------------------------------ */
/** Perlin-style gradient noise on a permutation table (seeded once at boot). */
const PERM = new Uint8Array(512), GX = new Float32Array(256), GY = new Float32Array(256);
function seedNoise(seed) {
  const r = new RNG(seed);
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  r.shuffle(p);
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { const a = r.f() * TAU; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const X = xi & 255, Y = yi & 255;
  const a = PERM[X + PERM[Y]], b = PERM[X + 1 + PERM[Y]];
  const c = PERM[X + PERM[Y + 1]], d = PERM[X + 1 + PERM[Y + 1]];
  const n00 = GX[a] * xf + GY[a] * yf;
  const n10 = GX[b] * (xf - 1) + GY[b] * yf;
  const n01 = GX[c] * xf + GY[c] * (yf - 1);
  const n11 = GX[d] * (xf - 1) + GY[d] * (yf - 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}
function fbm(x, y, oct, lac, gain) {
  lac = lac || 2.0; gain = gain || 0.5;
  let f = 1, a = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; f *= lac; a *= gain; }
  return s / n;
}
function ridged(x, y, oct) {
  let f = 1, a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(noise2(x * f, y * f)); v *= v;
    s += a * v; n += a; f *= 2.03; a *= 0.5;
  }
  return s / n;
}

/* ------------------------------ VEC / MAT ------------------------------ */
const V = {
  len(x, y, z) { return Math.sqrt(x * x + y * y + z * z); },
  dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
  dist(ax, az, bx, bz) { return Math.sqrt(V.dist2(ax, az, bx, bz)); }
};
const M4 = {
  id(o) { o = o || new Float32Array(16); o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2); o.fill(0);
    o[0] = f / aspect; o[5] = f; o[11] = -1;
    o[10] = (far + near) / (near - far); o[14] = (2 * far * near) / (near - far);
    return o;
  },
  ortho(o, l, r, b, t, n, f) {
    o.fill(0);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[15] = 1;
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n);
    return o;
  },
  lookAt(o, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * ex + xy * ey + xz * ez);
    o[13] = -(yx * ex + yy * ey + yz * ez);
    o[14] = -(zx * ex + zy * ey + zz * ez);
    o[15] = 1; return o;
  },
  mul(o, a, b) { // o = a * b
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  },
  /** compose translation * rotY * rotX * rotZ * scale into o (column-major) */
  trs(o, px, py, pz, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), sxx = Math.sin(rx);
    const cy = Math.cos(ry), syy = Math.sin(ry);
    const cz = Math.cos(rz), szz = Math.sin(rz);
    // R = Ry * Rx * Rz
    const m00 = cy * cz + syy * sxx * szz, m01 = -cy * szz + syy * sxx * cz, m02 = syy * cx;
    const m10 = cx * szz, m11 = cx * cz, m12 = -sxx;
    const m20 = -syy * cz + cy * sxx * szz, m21 = syy * szz + cy * sxx * cz, m22 = cy * cx;
    o[0] = m00 * sx; o[1] = m10 * sx; o[2] = m20 * sx; o[3] = 0;
    o[4] = m01 * sy; o[5] = m11 * sy; o[6] = m21 * sy; o[7] = 0;
    o[8] = m02 * sz; o[9] = m12 * sz; o[10] = m22 * sz; o[11] = 0;
    o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
    return o;
  },
  invert(o, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M4.id(o); det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  /** project world point -> ndc; returns [x,y,w] */
  project(m, x, y, z, out) {
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    out[0] = cx; out[1] = cy; out[2] = cw; return out;
  }
};

/* ------------------------------ FORMATTING ------------------------------ */
const NUMSUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  n = Math.floor(n);
  if (!isFinite(n)) return '∞';
  if (n < 1000) return '' + n;
  let i = 0; let v = n;
  while (v >= 1000 && i < NUMSUF.length - 1) { v /= 1000; i++; }
  let t = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  // toFixed can round 999.5 up to "1000" without promoting the suffix -> "1000K"
  if (parseFloat(t) >= 1000 && i < NUMSUF.length - 1) { v /= 1000; i++; t = v.toFixed(2); }
  return t + NUMSUF[i];
}
function fmtGold(n) { return fmt(n) + 'g'; }
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function dur(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return d + 'd ' + (h % 24) + 'h';
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  if (m > 0) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}
function durShort(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return d + 'd' + (h % 24) + 'h';
  if (h > 0) return h + 'h' + pad2(m % 60) + 'm';
  return m + 'm' + pad2(s % 60) + 's';
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

/* Roman numerals for quest chains / tiers */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
function roman(n) { if (n < ROMAN.length) return ROMAN[n]; return '' + n; }
